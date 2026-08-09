"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { initVimMode, type VimAdapterInstance } from "monaco-vim";
import type * as Monaco from "monaco-editor";

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

const MIN_WIDTH = 380;
const MIN_HEIGHT = 260;
const DEFAULT_WIDTH = 560;
const DEFAULT_HEIGHT = 400;
const DEFAULT_X = 64;
const DEFAULT_Y = 88;
// Approximate footprint of the minimized pill, used to keep it fully
// on-screen too (it's much smaller than the expanded panel).
const PILL_WIDTH = 140;
const PILL_HEIGHT = 44;

type Status = "idle" | "running" | "saved";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export default function FloatingEditor({
  boundsRef,
  topInset = DEFAULT_Y,
  initialX,
  onRun,
  running = false,
}: {
  boundsRef: RefObject<HTMLDivElement | null>;
  /** Reserved space (px) at the top of `boundsRef` — e.g. the height of a
   * floating header bar — that the panel and pill must stay clear of. */
  topInset?: number;
  /** Left edge (px, relative to `boundsRef`) to align the panel's initial
   * position to — e.g. the "Visualizer" label — applied once on arrival,
   * not re-applied once the user has dragged the panel. */
  initialX?: number;
  /** Called with the current language + editor contents when the user hits
   * Run. The editor doesn't know how to execute anything itself — that's
   * the parent's job (POST /api/execute, §11). */
  onRun?: (language: Language, source: string) => void;
  /** Reflects the *real* run state (backend round-trip in flight), not a
   * locally-guessed timer — the actual request can take much longer than
   * the fixed flash used for the "saved" status. */
  running?: boolean;
}) {
  const [language, setLanguage] = useState<Language>("cpp");
  const [minimized, setMinimized] = useState(false);
  const [vimEnabled, setVimEnabled] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [editorReady, setEditorReady] = useState(false);
  const [position, setPosition] = useState({ x: DEFAULT_X, y: DEFAULT_Y });
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });

  const panelRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const vimModeRef = useRef<VimAdapterInstance | null>(null);
  const statusBarRef = useRef<HTMLDivElement>(null);
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const positionRef = useRef(position);
  const sizeRef = useRef(size);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  // Clamps so the panel's full footprint — not just a corner of it — stays
  // within `boundsRef`, per the "editor must never go out of the screen"
  // requirement. Uses the pill's smaller footprint while minimized.
  const clampPosition = useCallback(
    (x: number, y: number) => {
      const bounds = boundsRef.current?.getBoundingClientRect();
      const containerWidth = bounds?.width ?? window.innerWidth;
      const containerHeight = bounds?.height ?? window.innerHeight;
      const panelWidth = minimized ? PILL_WIDTH : sizeRef.current.width;
      const panelHeight = minimized ? PILL_HEIGHT : sizeRef.current.height;
      const maxX = Math.max(8, containerWidth - panelWidth);
      const maxY = Math.max(8, containerHeight - panelHeight);
      const minY = Math.max(8, topInset);
      return { x: clamp(x, 8, maxX), y: clamp(y, minY, Math.max(minY, maxY)) };
    },
    [boundsRef, topInset, minimized],
  );

  // Re-clamp whenever the reserved top space changes (e.g. the header bar
  // wraps to a second line on a narrower viewport) so the panel/pill never
  // end up stranded under it.
  useEffect(() => {
    const next = clampPosition(positionRef.current.x, positionRef.current.y);
    if (next.x === positionRef.current.x && next.y === positionRef.current.y) return;
    positionRef.current = next;
    setPosition(next);
    if (panelRef.current) {
      panelRef.current.style.left = `${next.x}px`;
      panelRef.current.style.top = `${next.y}px`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topInset]);

  // Align to `initialX` the first time it arrives (the parent measures it
  // post-mount, so it's undefined on the very first render). Only fires
  // once — later changes (e.g. a window resize reflowing the label) don't
  // yank the panel out from under the user once they've moved it.
  const alignedRef = useRef(false);
  useEffect(() => {
    if (alignedRef.current || initialX == null) return;
    alignedRef.current = true;
    const next = clampPosition(initialX, positionRef.current.y);
    positionRef.current = next;
    setPosition(next);
    if (panelRef.current) {
      panelRef.current.style.left = `${next.x}px`;
      panelRef.current.style.top = `${next.y}px`;
    }
  }, [initialX, clampPosition]);

  const flashStatus = useCallback((next: Status, ms = 1100) => {
    setStatus(next);
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    statusTimeoutRef.current = setTimeout(() => setStatus("idle"), ms);
  }, []);

  const handleRun = useCallback(() => {
    const code = editorRef.current?.getValue() ?? "";
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

  const handleToggleMinimize = useCallback(() => setMinimized((v) => !v), []);
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
  });
  useEffect(() => {
    handlersRef.current = {
      run: handleRun,
      save: handleSave,
      toggleMinimize: handleToggleMinimize,
      toggleVim: handleToggleVim,
    };
  });

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!editorReady || !editorRef.current) return;
    if (vimEnabled) {
      vimModeRef.current = initVimMode(editorRef.current, statusBarRef.current ?? undefined);
    }
    return () => {
      vimModeRef.current?.dispose();
      vimModeRef.current = null;
    };
  }, [vimEnabled, editorReady]);

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
        setPosition(positionRef.current);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [clampPosition],
  );

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
        setSize(sizeRef.current);
        editorRef.current?.layout();
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [boundsRef],
  );

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    monaco.editor.defineTheme("lattice-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "7d8590", fontStyle: "italic" },
        { token: "keyword", foreground: "b147eb" },
        { token: "string", foreground: "00e5ff" },
        { token: "number", foreground: "fbbf24" },
      ],
      colors: {
        "editor.background": "#161b22",
        "editor.foreground": "#e6edf3",
        "editorLineNumber.foreground": "#7d859080",
        "editorLineNumber.activeForeground": "#e6edf3",
        "editor.selectionBackground": "#b147eb40",
        "editor.inactiveSelectionBackground": "#b147eb1f",
        "editorCursor.foreground": "#00e5ff",
        "editor.lineHighlightBackground": "#21262d80",
        "editorIndentGuide.background": "#7d859026",
        "editorWidget.background": "#21262d",
        "editorWidget.border": "#7d859033",
        "editorSuggestWidget.background": "#21262d",
        "editorSuggestWidget.border": "#7d859033",
        "editorSuggestWidget.selectedBackground": "#b147eb26",
        "scrollbarSlider.background": "#7d859033",
        "scrollbarSlider.hoverBackground": "#7d859055",
      },
    });
    monaco.editor.setTheme("lattice-dark");

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
    effectiveStatus === "running" ? "var(--accent-primary)" : effectiveStatus === "saved" ? "var(--accent-secondary)" : "var(--hairline-strong)";
  const statusLabel = effectiveStatus === "running" ? "Tracing…" : effectiveStatus === "saved" ? "Saved" : "Idle";

  return (
    <>
      <button
        type="button"
        onClick={() => setMinimized(false)}
        aria-label="Expand editor"
        style={{
          position: "absolute",
          left: position.x,
          top: position.y,
          opacity: minimized ? 1 : 0,
          transform: minimized ? "scale(1)" : "scale(0.92)",
          transformOrigin: "top left",
          visibility: minimized ? "visible" : "hidden",
          transition: `opacity 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 200ms cubic-bezier(0.16, 1, 0.3, 1), visibility 0s linear ${minimized ? "0s" : "200ms"}`,
        }}
        className="glass z-20 flex items-center gap-2 rounded-full px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-[var(--text-primary)] transition-shadow hover:shadow-[0_0_20px_var(--accent-glow)]"
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
          transform: minimized ? "scale(0.92)" : "scale(1)",
          transformOrigin: "top left",
          visibility: minimized ? "hidden" : "visible",
          transition: `opacity 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 200ms cubic-bezier(0.16, 1, 0.3, 1), visibility 0s linear ${minimized ? "200ms" : "0s"}`,
        }}
        className="glass z-20 flex flex-col overflow-hidden rounded-2xl"
      >
        <div
          onPointerDown={handleHeaderPointerDown}
          className="flex shrink-0 cursor-grab items-center justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3 active:cursor-grabbing"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${effectiveStatus === "running" ? "animate-pulse" : ""}`}
              style={{ background: statusColor }}
            />
            <span className="truncate font-serif text-[13px] font-semibold text-[var(--text-primary)]">Editor</span>
            <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)] sm:inline">
              {statusLabel}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2" data-no-drag>
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value as Language)}
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
              onClick={handleSave}
              disabled={!editorReady}
              title="Save (Ctrl/Cmd+S)"
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

        <div className="relative min-h-0 flex-1">
          <Editor
            height="100%"
            language={language}
            defaultValue={
              (typeof window !== "undefined" && window.localStorage.getItem(storageKey(language))) ||
              DEFAULT_SNIPPETS[language]
            }
            onMount={handleEditorMount}
            options={{
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
