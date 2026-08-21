"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import dynamic from "next/dynamic";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import type { VimAdapterInstance } from "monaco-vim";
import type * as Monaco from "monaco-editor";
import { defineLatticeTheme, LATTICE_THEME } from "@/lib/monaco-theme";

// monaco-editor touches `window` while it's being imported, which crashes
// SSR ("ReferenceError: window is not defined") if it's pulled in
// statically — load it client-only. The `Editor` component's own
// `loading` prop (below) covers Monaco's internal script-load phase; this
// `loading` covers the brief moment before that, while the dynamic chunk
// itself is being fetched.
const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[var(--bg-surface)] font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
      Loading editor…
    </div>
  ),
});

export type Language = "cpp" | "javascript" | "typescript" | "python" | "rust";

// Only "cpp" actually runs (tracers/cpp/, wired to POST /api/execute) —
// the rest are placeholders until their tracers exist (BLUEPRINT.md §7).
const LANGUAGES: { id: Language; label: string; available: boolean }[] = [
  { id: "cpp", label: "C++", available: true },
  { id: "javascript", label: "JavaScript", available: false },
  { id: "typescript", label: "TypeScript", available: false },
  { id: "python", label: "Python", available: false },
  { id: "rust", label: "Rust", available: false },
];

const DEFAULT_SNIPPETS: Record<Language, string> = {
  cpp: `#include <cstdio>

struct Node {
    int val;
    Node* next;
    Node(int v) : val(v), next(nullptr) {}
};

int main() {
    Node* head = new Node(3);
    head->next = new Node(7);
    head->next->next = new Node(1);
    head->next->next->next = new Node(9);
    int sum = 0;
    for (Node* cur = head; cur != nullptr; cur = cur->next) {
        sum += cur->val;
    }
    printf("sum=%d\\n", sum);
    return 0;
}`,
  javascript: `function reverseList(head) {
  let prev = null;
  while (head) {
    const next = head.next;
    head.next = prev;
    prev = head;
    head = next;
  }
  return prev;
}`,
  typescript: `function reverseList(head: ListNode | null): ListNode | null {
  let prev: ListNode | null = null;
  while (head) {
    const next = head.next;
    head.next = prev;
    prev = head;
    head = next;
  }
  return prev;
}`,
  python: `def reverse_list(head):
    prev = None
    while head:
        nxt = head.next
        head.next = prev
        prev = head
        head = nxt
    return prev`,
  rust: `fn reverse_list(head: Option<Box<Node>>) -> Option<Box<Node>> {
    let mut prev = None;
    let mut curr = head;
    while let Some(mut node) = curr {
        curr = node.next.take();
        node.next = prev;
        prev = Some(node);
    }
    prev
}`,
};

function storageKey(language: Language) {
  return `lattice:visualizer:code:${language}`;
}

const MIN_WIDTH = 320;
const MIN_HEIGHT = 220;
const DEFAULT_WIDTH = 560;
const DEFAULT_HEIGHT = 400;
/** Share of the container the auto-laid-out panel is allowed to take.
 * The panel is right-docked over the canvas it's meant to accompany, so
 * a fixed 560px — fine on a 1600px screen — swallows almost the whole
 * workspace on a tablet, leaving the diagram nowhere to be drawn. */
const DEFAULT_WIDTH_RATIO = 0.46;
const DEFAULT_X = 64;
const DEFAULT_Y = 88;
// Gap kept between the panel and the container's right/bottom edges when
// it's auto-laid-out (right-aligned, full height) — matches the 16px
// (`-4` Tailwind spacing) used by the other floating chrome on this page.
const PANEL_MARGIN = 16;
// Approximate footprint of the minimized pill, used to keep it fully
// on-screen too (it's much smaller than the expanded panel).
const PILL_WIDTH = 140;
const PILL_HEIGHT = 44;
// Matches the sidebar's collapse/expand feel (components/dashboard/Sidebar.tsx:
// `transition-[width] duration-300 ease-out`) — every animated property below
// uses this same duration/easing so they move in lockstep.
const MINIMIZE_TRANSITION_MS = 300;
const MINIMIZE_EASING = "ease-out";

type Status = "idle" | "running" | "saved" | "copied";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export default function FloatingEditor({
  boundsRef,
  topInset = DEFAULT_Y,
  onRun,
  running = false,
  onGeometryChange,
  activeLine = null,
  initialSource,
  initialLanguage,
  onSourceChange,
  readOnly = false,
}: {
  boundsRef: RefObject<HTMLDivElement | null>;
  /** Reserved space (px) at the top of `boundsRef` — e.g. the height of a
   * floating header bar — that the panel and pill must stay clear of. */
  topInset?: number;
  /** Called with the current language + editor contents when the user hits
   * Run. The editor doesn't know how to execute anything itself — that's
   * the parent's job (POST /api/execute, §11). */
  onRun?: (language: Language, source: string) => void;
  /** Reflects the *real* run state (backend round-trip in flight), not a
   * locally-guessed timer — the actual request can take much longer than
   * the fixed flash used for the "saved" status. */
  running?: boolean;
  /** Reports the panel's left edge (in `boundsRef` coordinates) whenever it
   * settles, so the canvas can treat the space to its left as the usable
   * area. `minimized` is passed through rather than folded into a single
   * number because a collapsed pill occupies a small top-right corner and
   * shouldn't reserve a whole column of the canvas. */
  onGeometryChange?: (geometry: { left: number; minimized: boolean }) => void;
  /** 1-based source line the trace is currently stopped on, highlighted in
   * the gutter and scrolled into view. Null clears the highlight. It is
   * suppressed automatically once the buffer no longer matches what was
   * actually executed — see `staleRef` below. */
  activeLine?: number | null;
  /** A saved canvas's code, used as Monaco's `defaultValue` in place of the
   * per-language `localStorage` cache/starter snippet. Falsy (including
   * `""`, a brand-new canvas's empty `source_code`) falls through to the
   * existing fallback chain rather than showing a blank editor. Only read
   * at mount — callers switching canvases should remount via `key`. */
  initialSource?: string;
  /** A saved canvas's language, used as the initial `language` state in
   * place of the default `"cpp"`. Only read at mount, same as `initialSource`. */
  initialLanguage?: Language;
  /** Fired from the existing 500ms-debounced content-change listener (the
   * one that already writes to `localStorage` on every edit) — one more
   * subscriber on the same cadence, for canvas autosave. */
  onSourceChange?: (source: string) => void;
  /** The canvas's code is generated from a Code-Canvas graph, so it isn't
   * the user's to edit here (the server answers 409 to a `source_code`
   * PATCH on such a canvas). Puts Monaco in read-only mode, drops the save
   * paths — both the canvas PATCH and the per-language `localStorage`
   * cache, which would otherwise poison the starter snippet for hand-written
   * canvases — and labels the panel. Running still works: it's the whole
   * point of sending a graph here. */
  readOnly?: boolean;
}) {
  const [language, setLanguage] = useState<Language>(initialLanguage ?? "cpp");
  const [minimized, setMinimized] = useState(false);
  const [vimEnabled, setVimEnabled] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [editorReady, setEditorReady] = useState(false);
  // Set on the first edit after a run: the trace's line numbers describe the
  // source that was *executed*, so once the buffer diverges from it the
  // highlight would point at the wrong line. Cleared on the next run.
  const [sourceStale, setSourceStale] = useState(false);
  const [position, setPosition] = useState({ x: DEFAULT_X, y: DEFAULT_Y });
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });

  const panelRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const lineDecorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const vimModeRef = useRef<VimAdapterInstance | null>(null);
  const statusBarRef = useRef<HTMLDivElement>(null);
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const positionRef = useRef(position);
  const sizeRef = useRef(size);
  // handleEditorMount registers its content-change listener once (empty
  // dep array) — this keeps it reading the *current* language instead of
  // whatever language was selected at mount time.
  const languageRef = useRef(language);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  // Drags/resizes write straight to the DOM and only commit to state on
  // pointerup, so this fires when the panel settles rather than on every
  // pointer move — which is what a listener repositioning other content
  // wants anyway.
  useEffect(() => {
    onGeometryChange?.({ left: position.x, minimized });
  }, [position.x, minimized, onGeometryChange]);

  // Clamps so a box of the given footprint stays fully within `boundsRef`,
  // per the "editor must never go out of the screen" requirement.
  const clampFor = useCallback(
    (x: number, y: number, width: number, height: number) => {
      const bounds = boundsRef.current?.getBoundingClientRect();
      const containerWidth = bounds?.width ?? window.innerWidth;
      const containerHeight = bounds?.height ?? window.innerHeight;
      const maxX = Math.max(8, containerWidth - width);
      const maxY = Math.max(8, containerHeight - height);
      const minY = Math.max(8, topInset);
      return { x: clamp(x, 8, maxX), y: clamp(y, minY, Math.max(minY, maxY)) };
    },
    [boundsRef, topInset],
  );

  // Same, but picks the pill's or the full panel's footprint based on
  // the *current* minimized state — what drag handlers want, since
  // they're always moving whichever one is presently visible.
  const clampPosition = useCallback(
    (x: number, y: number) => {
      const width = minimized ? PILL_WIDTH : sizeRef.current.width;
      const height = minimized ? PILL_HEIGHT : sizeRef.current.height;
      return clampFor(x, y, width, height);
    },
    [clampFor, minimized],
  );

  // Default layout: right-aligned, full height from the header down to the
  // bottom margin. Recomputed whenever the container or reserved header
  // space changes (mount, header wrapping to a second line, window
  // resize) — but only until the user drags or resizes the panel
  // themselves, at which point `userAdjustedRef` flips and their layout
  // sticks.
  const userAdjustedRef = useRef(false);
  const applyDefaultLayout = useCallback(() => {
    const bounds = boundsRef.current?.getBoundingClientRect();
    if (!bounds) return;

    // A panel the user has sized themselves keeps that size — but "their
    // layout sticks" can't mean "their layout is allowed to hang off the
    // screen". Shrinking the window, or zooming in, takes away room they
    // had when they chose it, so re-fit the box they asked for into the
    // room that's actually left and leave it alone otherwise.
    if (userAdjustedRef.current) {
      const maxWidth = Math.max(MIN_WIDTH, bounds.width - PANEL_MARGIN * 2);
      const maxHeight = Math.max(MIN_HEIGHT, bounds.height - topInset - PANEL_MARGIN);
      const width = Math.min(sizeRef.current.width, maxWidth);
      const height = Math.min(sizeRef.current.height, maxHeight);
      const { x, y } = clampFor(positionRef.current.x, positionRef.current.y, width, height);
      if (
        width === sizeRef.current.width &&
        height === sizeRef.current.height &&
        x === positionRef.current.x &&
        y === positionRef.current.y
      ) {
        return;
      }
      sizeRef.current = { width, height };
      setSize({ width, height });
      positionRef.current = { x, y };
      setPosition({ x, y });
      const adjusted = panelRef.current;
      if (adjusted) {
        adjusted.style.left = `${x}px`;
        adjusted.style.top = `${y}px`;
        adjusted.style.width = `${width}px`;
        adjusted.style.height = `${height}px`;
      }
      return;
    }

    const height = clamp(bounds.height - topInset - PANEL_MARGIN, MIN_HEIGHT, bounds.height);
    // Never wider than its share of the container, and never wider than
    // the container itself — the two clamps matter at different sizes,
    // and without the second one a narrow workspace gets a panel hanging
    // off both edges at once.
    const widthCeiling = Math.max(MIN_WIDTH, bounds.width - PANEL_MARGIN * 2);
    const width = clamp(
      Math.round(bounds.width * DEFAULT_WIDTH_RATIO),
      MIN_WIDTH,
      Math.min(DEFAULT_WIDTH, widthCeiling),
    );
    const nextSize = { width, height };
    sizeRef.current = nextSize;
    setSize(nextSize);

    const x = Math.max(PANEL_MARGIN, bounds.width - nextSize.width - PANEL_MARGIN);
    const next = { x, y: topInset };
    positionRef.current = next;
    setPosition(next);

    const panel = panelRef.current;
    if (panel) {
      panel.style.left = `${next.x}px`;
      panel.style.top = `${next.y}px`;
      panel.style.width = `${nextSize.width}px`;
      panel.style.height = `${nextSize.height}px`;
    }
  }, [boundsRef, topInset, clampFor]);

  useLayoutEffect(() => {
    applyDefaultLayout();
  }, [applyDefaultLayout]);

  useEffect(() => {
    const el = boundsRef.current;
    if (!el) return;
    const observer = new ResizeObserver(applyDefaultLayout);
    observer.observe(el);
    return () => observer.disconnect();
  }, [boundsRef, applyDefaultLayout]);

  const flashStatus = useCallback((next: Status, ms = 1100) => {
    setStatus(next);
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    statusTimeoutRef.current = setTimeout(() => setStatus("idle"), ms);
  }, []);

  const handleRun = useCallback(() => {
    const code = editorRef.current?.getValue() ?? "";
    setSourceStale(false);
    onRun?.(language, code);
  }, [onRun, language]);

  const handleSave = useCallback(() => {
    const code = editorRef.current?.getValue() ?? "";
    try {
      window.localStorage.setItem(storageKey(language), code);
    } catch {
      // localStorage unavailable (private mode, etc.) — save is best-effort
    }
    flashStatus("saved", 1200);
  }, [flashStatus, language]);

  const handleCopy = useCallback(() => {
    const code = editorRef.current?.getValue() ?? "";
    navigator.clipboard.writeText(code).then(() => flashStatus("copied", 1200));
  }, [flashStatus]);

  // Minimizing/maximizing keeps the *right* edge fixed (the panel is
  // right-docked, per applyDefaultLayout above), so it visually collapses
  // into and expands back out of its own top-right corner instead of
  // drifting toward the top-left as the box shrinks. flipRef captures the
  // on-screen box before *and* the target box after this toggle, so the
  // layout effect below can play a FLIP (First-Last-Invert-Play) once
  // React commits the new position/size — computed purely from these
  // numbers, no DOM measurement needed.
  const flipRef = useRef<{
    from: { x: number; y: number; w: number; h: number };
    to: { x: number; y: number; w: number; h: number };
  } | null>(null);

  const handleToggleMinimize = useCallback(() => {
    const current = positionRef.current;
    const wasMinimized = minimized;
    const willMinimize = !minimized;
    const rightEdge = current.x + (minimized ? PILL_WIDTH : sizeRef.current.width);
    const nextWidth = willMinimize ? PILL_WIDTH : sizeRef.current.width;
    const nextHeight = willMinimize ? PILL_HEIGHT : sizeRef.current.height;
    const next = clampFor(rightEdge - nextWidth, current.y, nextWidth, nextHeight);

    flipRef.current = {
      from: {
        x: current.x,
        y: current.y,
        w: wasMinimized ? PILL_WIDTH : sizeRef.current.width,
        h: wasMinimized ? PILL_HEIGHT : sizeRef.current.height,
      },
      to: { x: next.x, y: next.y, w: nextWidth, h: nextHeight },
    };

    positionRef.current = next;
    setPosition(next);
    setMinimized(willMinimize);
  }, [minimized, clampFor]);

  // Plays the FLIP captured above, once React has committed the new
  // position/size. Runs after every position/size/minimized change but is
  // a no-op unless handleToggleMinimize just set flipRef — drags and
  // resizes leave it null.
  //
  // Only the *panel* ever gets a shape-changing (scale) transform — it's
  // the only element that visibly resizes; the pill, when it's the one
  // fading out, only gets a plain translate (no scale) back to where it
  // actually was, and needs nothing at all when it's fading in (its
  // resting spot already matches `position`). Two reasons the panel is
  // the one doing the visible work, not the pill: the pill's rounded-full
  // shape has corner arcs spanning its *entire* height, so scaling it
  // through the same ~4x/~17x ratio the panel↔pill size difference
  // requires warps those into a huge, heavily distorted ellipse every
  // frame — expensive to rasterize and the actual source of the
  // direction-specific jitter (pill arrives via FLIP on minimize, panel
  // arrives via FLIP on maximize) — where the panel's much smaller
  // rounded-2xl corners don't have that problem at the same scale.
  useLayoutEffect(() => {
    const flip = flipRef.current;
    flipRef.current = null;
    if (!flip) return;
    const { from, to } = flip;

    const panel = panelRef.current;
    const pill = pillRef.current;
    const cleanups: Array<() => void> = [];

    if (panel) {
      const base = { x: position.x, y: position.y, w: size.width, h: size.height };
      const scaleX0 = from.w / base.w;
      const scaleY0 = from.h / base.h;
      const translateX0 = from.x - base.x;
      const translateY0 = from.y - base.y;
      const scaleX1 = to.w / base.w;
      const scaleY1 = to.h / base.h;
      const translateX1 = to.x - base.x;
      const translateY1 = to.y - base.y;

      // will-change + the 3d transform functions promote this to its own
      // GPU compositing layer up front — without it the browser only
      // decides to promote a layer once the transform starts changing,
      // which costs a dropped frame or two right as the animation begins
      // and reads as jitter. Matters a lot here since the panel contains
      // a live Monaco editor — expensive to repaint every frame if it's
      // rasterizing on the main thread instead of compositing a
      // pre-rasterized layer.
      panel.style.willChange = "transform";
      panel.style.transformOrigin = "top left";
      panel.style.transform = `translate3d(${translateX0}px, ${translateY0}px, 0) scale3d(${scaleX0}, ${scaleY0}, 1)`;
      // Force a style flush so the "from" pose above actually paints
      // before `transform` joins the transition list below — otherwise
      // both writes are batched into the same frame and the shrink/grow
      // never renders. Deliberately NOT disabling transitions first
      // (no `transitionProperty = "none"` step): panel's transition-
      // property doesn't include `transform` yet at this point (only the
      // opacity/visibility React's declarative style already put there),
      // so this write is already un-animated on its own — and briefly
      // setting `transitionProperty` to "none" here, as an earlier
      // version of this code did, flushed opacity/visibility's own
      // already-in-flight fade instantly instead of letting it run its
      // course, which is what made the fade disappear entirely.
      void panel.offsetHeight;
      // Longhand properties (not the `transition` shorthand string) from
      // here on, on purpose — building a shorthand string by hand is
      // error-prone (the browser re-serializes it, and a dropped/
      // misplaced token can silently turn a delay into a duration or
      // vice versa), and that exact bug is what caused the flush above
      // this comment used to guard against in the first place.
      panel.style.transitionProperty = "transform, opacity, visibility";
      panel.style.transitionDuration = `${MINIMIZE_TRANSITION_MS}ms, ${MINIMIZE_TRANSITION_MS}ms, 0s`;
      panel.style.transitionTimingFunction = `${MINIMIZE_EASING}, ${MINIMIZE_EASING}, linear`;
      panel.style.transitionDelay = `0s, 0s, ${minimized ? `${MINIMIZE_TRANSITION_MS}ms` : "0s"}`;
      panel.style.transform = `translate3d(${translateX1}px, ${translateY1}px, 0) scale3d(${scaleX1}, ${scaleY1}, 1)`;

      const timeoutId = setTimeout(() => {
        panel.style.transitionProperty = "";
        panel.style.transitionDuration = "";
        panel.style.transitionTimingFunction = "";
        panel.style.transitionDelay = "";
        panel.style.transform = "";
        panel.style.transformOrigin = "";
        panel.style.willChange = "";
      }, MINIMIZE_TRANSITION_MS);
      cleanups.push(() => clearTimeout(timeoutId));
    }

    if (pill) {
      if (minimized) {
        // Arriving (or already showing): `position` already equals the
        // pill's own correct resting spot — clear any leftover transform
        // from a previous toggle and leave it alone.
        pill.style.transform = "";
      } else {
        // Departing: pill's left/top share `position` state with the
        // panel's new resting spot, so without this it would silently
        // teleport there for the duration of its fade. A static
        // (untransitioned — transform isn't part of its own declarative
        // transition list) translate keeps it exactly where it was; no
        // scale needed since the pill's own size never changes.
        const translateX = from.x - position.x;
        const translateY = from.y - position.y;
        pill.style.transform = `translate3d(${translateX}px, ${translateY}px, 0)`;
        const timeoutId = setTimeout(() => {
          pill.style.transform = "";
        }, MINIMIZE_TRANSITION_MS);
        cleanups.push(() => clearTimeout(timeoutId));
      }
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [minimized, position, size]);
  const handleToggleVim = useCallback(() => setVimEnabled((v) => !v), []);

  const handleLanguageChange = useCallback(
    (next: Language) => {
      const editor = editorRef.current;
      if (editor) {
        try {
          window.localStorage.setItem(storageKey(language), editor.getValue());
        } catch {
          // localStorage unavailable — outgoing snapshot is best-effort
        }
        let restored: string | null = null;
        try {
          restored = window.localStorage.getItem(storageKey(next));
        } catch {
          // localStorage unavailable — fall through to the starter snippet
        }
        editor.setValue(restored ?? DEFAULT_SNIPPETS[next]);
      }
      setLanguage(next);
    },
    [language],
  );

  const handlersRef = useRef({
    run: handleRun,
    save: handleSave,
    toggleMinimize: handleToggleMinimize,
    toggleVim: handleToggleVim,
    sourceChange: onSourceChange,
    // Not a handler, but it rides along for the same reason they do: the
    // content listener is registered once at mount and has to see the
    // *current* value, and `readOnly` can flip after mount (it depends on
    // the canvas, which loads asynchronously).
    readOnly,
  });
  useEffect(() => {
    handlersRef.current = {
      run: handleRun,
      save: handleSave,
      toggleMinimize: handleToggleMinimize,
      toggleVim: handleToggleVim,
      sourceChange: onSourceChange,
      readOnly,
    };
  });

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    };
  }, []);

  // Safety net for the autosave debounce window: a reload/close within
  // 500ms of the last keystroke would otherwise miss that final edit.
  useEffect(() => {
    const flush = () => {
      if (!editorRef.current) return;
      try {
        window.localStorage.setItem(storageKey(languageRef.current), editorRef.current.getValue());
      } catch {
        // localStorage unavailable — best-effort
      }
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  useEffect(() => {
    if (!editorReady || !editorRef.current || !vimEnabled) return;
    // monaco-vim touches `window` at module-evaluation time, same as
    // monaco-editor itself — importing it dynamically here (rather than
    // statically at the top of the file) keeps it out of the SSR bundle.
    let cancelled = false;
    import("monaco-vim").then(({ initVimMode, VimMode }) => {
      if (cancelled || !editorRef.current) return;
      // `:w`/`:write` normally no-op — there's no real file underneath
      // this editor. Point it at the same save path as the Save button
      // and Ctrl/Cmd+S. `defineEx` is registered on monaco-vim's shared
      // global Vim object, not per-instance, so re-registering here on
      // every mount just overwrites the same handler — harmless.
      // `VimMode.Vim` exists at runtime (monaco-vim's CMAdapter.Vim =
      // Vim()) but isn't in the package's shipped .d.mts — cast around
      // the incomplete types rather than the missing API.
      (VimMode as unknown as { Vim: { defineEx: (name: string, prefix: string, fn: () => void) => void } }).Vim.defineEx(
        "write",
        "w",
        () => handlersRef.current.save(),
      );
      vimModeRef.current = initVimMode(editorRef.current, statusBarRef.current ?? undefined);
    });
    return () => {
      cancelled = true;
      vimModeRef.current?.dispose();
      vimModeRef.current = null;
    };
  }, [vimEnabled, editorReady]);

  // Paints the line the trace is stopped on and keeps it in view. Uses a
  // decorations *collection* (Monaco's own handle-tracking) rather than the
  // deprecated deltaDecorations, so edits above the line move the highlight
  // with the text instead of stranding it on a fixed line number.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editorReady || !editor || !monaco) return;

    const collection =
      lineDecorationsRef.current ?? (lineDecorationsRef.current = editor.createDecorationsCollection());

    const model = editor.getModel();
    const lineCount = model?.getLineCount() ?? 0;
    // Guard the line number: a stale trace, or one from a `#include` the
    // user can't see, can name a line past the end of this buffer, and
    // Monaco throws rather than clamping.
    if (sourceStale || activeLine === null || activeLine < 1 || activeLine > lineCount) {
      collection.clear();
      return;
    }

    collection.set([
      {
        range: new monaco.Range(activeLine, 1, activeLine, 1),
        options: {
          isWholeLine: true,
          className: "lattice-active-line",
          linesDecorationsClassName: "lattice-active-line-gutter",
        },
      },
    ]);
    editor.revealLineInCenterIfOutsideViewport(activeLine, monaco.editor.ScrollType.Smooth);
  }, [activeLine, editorReady, sourceStale]);

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const origin = positionRef.current;
      const panel = panelRef.current;

      function onMove(ev: PointerEvent) {
        const next = clampPosition(origin.x + (ev.clientX - startX), origin.y + (ev.clientY - startY));
        positionRef.current = next;
        if (panel) {
          panel.style.left = `${next.x}px`;
          panel.style.top = `${next.y}px`;
        }
      }
      function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        userAdjustedRef.current = true;
        setPosition(positionRef.current);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [clampPosition],
  );

  // The minimized pill drags the same way the full panel's header does,
  // but it's also a click target (expand) — a plain onClick would fire
  // even after a drag, so track whether the pointer actually moved past a
  // small threshold and suppress the expand in that case.
  const pillDraggedRef = useRef(false);
  const handlePillPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const origin = positionRef.current;
      const pill = pillRef.current;
      pillDraggedRef.current = false;

      function onMove(ev: PointerEvent) {
        if (!pillDraggedRef.current) {
          if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return;
          pillDraggedRef.current = true;
          userAdjustedRef.current = true;
        }
        const next = clampPosition(origin.x + (ev.clientX - startX), origin.y + (ev.clientY - startY));
        positionRef.current = next;
        if (pill) {
          pill.style.left = `${next.x}px`;
          pill.style.top = `${next.y}px`;
        }
      }
      function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (pillDraggedRef.current) {
          setPosition(positionRef.current);
        }
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [clampPosition],
  );

  const handlePillClick = useCallback(() => {
    if (pillDraggedRef.current) return;
    handleToggleMinimize();
  }, [handleToggleMinimize]);

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const origin = sizeRef.current;
      const panel = panelRef.current;
      const bounds = boundsRef.current?.getBoundingClientRect();
      const maxWidth = (bounds?.width ?? window.innerWidth) - positionRef.current.x - 8;
      const maxHeight = (bounds?.height ?? window.innerHeight) - positionRef.current.y - 8;

      function onMove(ev: PointerEvent) {
        const next = {
          width: clamp(origin.width + (ev.clientX - startX), MIN_WIDTH, Math.max(MIN_WIDTH, maxWidth)),
          height: clamp(origin.height + (ev.clientY - startY), MIN_HEIGHT, Math.max(MIN_HEIGHT, maxHeight)),
        };
        sizeRef.current = next;
        if (panel) {
          panel.style.width = `${next.width}px`;
          panel.style.height = `${next.height}px`;
        }
      }
      function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        userAdjustedRef.current = true;
        setSize(sizeRef.current);
        editorRef.current?.layout();
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [boundsRef],
  );

  // Runs before the editor instance exists. Monaco would otherwise build
  // its DOM under the default light theme and paint one white frame before
  // onMount could switch it — very visible against this palette when the
  // panel appears on a route change.
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    defineLatticeTheme(monaco);
  }, []);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Autosave: persists on every edit (debounced), independent of the
    // explicit Save action — so a reload never loses work just because
    // the user never hit Ctrl+S. Silent (no "Saved" status flash); that
    // flash is reserved for the explicit save actions below.
    editor.onDidChangeModelContent(() => {
      // A read-only editor still fires this for programmatic edits (a
      // canvas being loaded, a re-generated source arriving). Nothing about
      // that is the user's work to save.
      if (handlersRef.current.readOnly) return;
      // Idempotent: React bails out when the value is unchanged, so this
      // doesn't re-render on every keystroke, only on the first edit.
      setSourceStale(true);
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = setTimeout(() => {
        const code = editor.getValue();
        try {
          window.localStorage.setItem(storageKey(languageRef.current), code);
        } catch {
          // localStorage unavailable (private mode, etc.) — best-effort
        }
        handlersRef.current.sourceChange?.(code);
      }, 500);
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => handlersRef.current.run());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => handlersRef.current.save());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyM, () => handlersRef.current.toggleMinimize());
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyV,
      () => handlersRef.current.toggleVim(),
    );

    setEditorReady(true);
  }, []);

  const effectiveStatus: Status = running ? "running" : status;
  const statusColor =
    effectiveStatus === "running"
      ? "var(--accent-primary)"
      : effectiveStatus === "saved" || effectiveStatus === "copied"
        ? "var(--accent-secondary)"
        : "var(--hairline-strong)";
  const statusLabel =
    effectiveStatus === "running"
      ? "Tracing…"
      : effectiveStatus === "saved"
        ? "Saved"
        : effectiveStatus === "copied"
          ? "Copied"
          : "Idle";

  return (
    <>
      <button
        ref={pillRef}
        type="button"
        onPointerDown={handlePillPointerDown}
        onClick={handlePillClick}
        aria-label="Expand editor"
        style={{
          position: "absolute",
          left: position.x,
          top: position.y,
          touchAction: "none",
          opacity: minimized ? 1 : 0,
          visibility: minimized ? "visible" : "hidden",
          // left/top/transform are intentionally NOT set declaratively
          // here — left/top go straight to their final (already right-
          // edge-anchored, see handleToggleMinimize) value instantly, and
          // transform is owned by the FLIP effect above for the duration
          // of a toggle (cleared back to nothing once it finishes). Only
          // opacity/visibility animate declaratively.
          transition: `opacity ${MINIMIZE_TRANSITION_MS}ms ${MINIMIZE_EASING}, visibility 0s linear ${minimized ? "0s" : `${MINIMIZE_TRANSITION_MS}ms`}`,
        }}
        className="glass z-20 flex cursor-grab items-center gap-2 rounded-full px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-[var(--text-primary)] transition-shadow active:cursor-grabbing hover:shadow-[0_0_20px_var(--accent-glow)]"
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent-secondary)" }} />
        Editor
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6l5 5 5-5" />
        </svg>
      </button>

      <div
        ref={panelRef}
        style={{
          position: "absolute",
          left: position.x,
          top: position.y,
          width: size.width,
          height: size.height,
          opacity: minimized ? 0 : 1,
          visibility: minimized ? "hidden" : "visible",
          // See the pill's style above — left/top/transform deliberately
          // excluded from this declarative transition.
          transition: `opacity ${MINIMIZE_TRANSITION_MS}ms ${MINIMIZE_EASING}, visibility 0s linear ${minimized ? `${MINIMIZE_TRANSITION_MS}ms` : "0s"}`,
        }}
        className="glass z-20 flex flex-col overflow-hidden rounded-2xl"
      >
        <div
          onPointerDown={handleHeaderPointerDown}
          className="glass-bar flex shrink-0 cursor-grab items-center justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3 active:cursor-grabbing"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${effectiveStatus === "running" ? "animate-pulse" : ""}`}
              style={{ background: statusColor }}
            />
            <span className="truncate font-serif text-[13px] font-semibold text-[var(--text-primary)]">
              {readOnly ? "Generated code" : "Editor"}
            </span>
            <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)] sm:inline">
              {statusLabel}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2" data-no-drag>
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value as Language)}
              disabled={readOnly}
              aria-label="Language"
              className="rounded-full border border-[var(--hairline)] bg-[var(--bg-elevated)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--text-primary)] focus:border-[var(--accent-secondary)] focus:outline-none"
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id} disabled={!l.available}>
                  {l.label}
                  {l.available ? "" : " (soon)"}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleToggleVim}
              disabled={!editorReady}
              title="Toggle Vim mode (Ctrl/Cmd+Shift+V)"
              className="rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors disabled:opacity-40"
              style={{
                background: vimEnabled ? "var(--accent-primary)" : "var(--bg-elevated)",
                color: vimEnabled ? "var(--bg-base)" : "var(--text-secondary)",
              }}
            >
              Vim
            </button>

            <button
              type="button"
              onClick={handleCopy}
              disabled={!editorReady}
              title="Copy code"
              aria-label="Copy code"
              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--text-primary)] disabled:opacity-40"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <rect x="8" y="8" width="12" height="12" rx="1.5" />
                <path d="M16 8V5.5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1V15a1 1 0 0 0 1 1H8" />
              </svg>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={!editorReady || readOnly}
              title={readOnly ? "Generated from a Code-Canvas graph — not editable here" : "Save (Ctrl/Cmd+S)"}
              aria-label="Save"
              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--text-primary)] disabled:opacity-40"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 3.5h11l3.5 3.5V20a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" />
                <path d="M8 3.5V9h7V3.5M8 20v-6.5h8V20" />
              </svg>
            </button>

            <button
              type="button"
              onClick={handleRun}
              disabled={!editorReady || running}
              title="Run trace (Ctrl/Cmd+Enter)"
              aria-label="Run trace"
              className="flex h-7 w-7 items-center justify-center rounded-full transition-shadow hover:shadow-[0_0_16px_var(--accent-glow)] disabled:opacity-40"
              style={{ background: "var(--accent-primary)", color: "var(--bg-base)" }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 2.5v11l9-5.5-9-5.5z" />
              </svg>
            </button>

            <button
              type="button"
              onClick={handleToggleMinimize}
              title="Minimize (Ctrl/Cmd+M)"
              aria-label="Minimize editor"
              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--text-primary)]"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3 8h10" />
              </svg>
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 bg-[var(--bg-surface)]">
          <Editor
            height="100%"
            language={language}
            theme={LATTICE_THEME}
            defaultValue={
              initialSource ||
              (typeof window !== "undefined" && window.localStorage.getItem(storageKey(language))) ||
              DEFAULT_SNIPPETS[language]
            }
            beforeMount={handleBeforeMount}
            onMount={handleEditorMount}
            options={{
              readOnly,
              domReadOnly: readOnly,
              automaticLayout: true,
              fontSize: 13,
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              fontLigatures: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              cursorBlinking: "smooth",
              padding: { top: 12, bottom: 12 },
              overviewRulerBorder: false,
              lineNumbersMinChars: 3,
              // Widened from Monaco's 10px default so the execution arrow
              // (.lattice-active-line-gutter) has room to sit between the
              // line numbers and the first character without crowding either.
              lineDecorationsWidth: 18,
            }}
            loading={
              <div className="flex h-full w-full items-center justify-center bg-[var(--bg-surface)] font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                Loading editor…
              </div>
            }
          />
        </div>

        {vimEnabled && (
          <div
            ref={statusBarRef}
            className="shrink-0 border-t border-[var(--hairline)] px-3 py-1 font-mono text-[11px] text-[var(--text-secondary)]"
          />
        )}

        <div
          onPointerDown={handleResizePointerDown}
          data-no-drag
          aria-hidden="true"
          className="absolute bottom-1 right-1 flex h-4 w-4 cursor-nwse-resize items-center justify-center text-[var(--text-secondary)]"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <circle cx="8" cy="8" r="1" />
            <circle cx="8" cy="4.5" r="1" />
            <circle cx="4.5" cy="8" r="1" />
          </svg>
        </div>
      </div>
    </>
  );
}
