"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import type { VimAdapterInstance } from "monaco-vim";
import { defineLatticeTheme, LATTICE_THEME } from "@/lib/monaco-theme";
import { registerLatticeCompletions } from "@/lib/monaco-completions";

// Same reason as FloatingEditor and CodePane: monaco-editor touches
// `window` at import time, so it can never be part of the server bundle.
const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <EditorLoading />,
});

function EditorLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--bg-surface)] font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
      Loading editor&hellip;
    </div>
  );
}

/** The buffer survives a reload the way the Visualizer's does. Its own key,
 * not shared with `lattice:visualizer:code:cpp` — two editors on two pages
 * that silently overwrote each other's work would be worse than neither
 * persisting at all. */
const STORAGE_KEY = "lattice:simulator:code:cpp";
const SAVE_DEBOUNCE_MS = 500;

/** An empty `main`, not a program. The Simulator traces whatever you write;
 * seeding it with an algorithm would just be something to delete first. */
const STARTER = `#include <cstdio>

int main() {
    
    return 0;
}
`;

const STATUS_COLOR: Record<string, string> = {
  idle: "var(--text-secondary)",
  running: "var(--accent-secondary)",
  done: "#34d399",
  error: "#f87171",
};

/**
 * The Simulator's left column: the same Monaco panel the Visualizer's
 * FloatingEditor is, minus the floating.
 *
 * Everything that makes that editor feel like this app is shared rather
 * than re-invented — `LATTICE_THEME` applied in `beforeMount` (never
 * `onMount`, which costs a painted frame of white), the `.glass` shell
 * with a `.glass-bar` toolbar, the `lattice-active-line` decoration set
 * through a decorations *collection* so the highlight tracks the text when
 * lines are inserted above it, and Vim mode on the same Ctrl/Cmd+Shift+V.
 *
 * It is docked instead of draggable because there is a second column here
 * that must not be covered: on the Visualizer the editor floats over an
 * infinite canvas that can simply be panned out from under it, and none
 * of that applies to a fixed two-column reading layout.
 */
export default function SimulatorEditor({
  source,
  onSourceChange,
  activeLine,
  status,
  statusLabel,
  stale,
  error,
  truncated,
  onRun,
}: {
  source: string;
  onSourceChange: (source: string) => void;
  /** Line the current step just executed, or null for "nothing running". */
  activeLine: number | null;
  status: "idle" | "running" | "done" | "error";
  statusLabel: string;
  /** The buffer has been edited away from the source the trace was built
   * from, so the highlight would be pointing at the wrong statement. */
  stale: boolean;
  /** Why the last run failed — a compiler diagnostic, or a request error. */
  error: string | null;
  /** The run hit the backend's step cap and stops early. */
  truncated: boolean;
  onRun: () => void;
}) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const vimModeRef = useRef<VimAdapterInstance | null>(null);
  const statusBarRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [vimEnabled, setVimEnabled] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleToggleVim = useCallback(() => setVimEnabled((v) => !v), []);

  // Monaco keybindings are registered once on mount, so they must reach
  // their handlers through a ref — `onRun` gets a new identity on every
  // keystroke (it closes over the source), and a command bound to the
  // first one would run whatever was in the buffer at mount forever.
  const handlersRef = useRef({ run: onRun, toggleVim: handleToggleVim });
  useEffect(() => {
    handlersRef.current = { run: onRun, toggleVim: handleToggleVim };
  }, [onRun, handleToggleVim]);

  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    defineLatticeTheme(monaco);
    // Registered from here as well as FloatingEditor: the providers are
    // global to the monaco singleton, so leaving it to one pane would make
    // this one's suggestions depend on whether the user had visited the
    // Visualizer first in the same session.
    registerLatticeCompletions(monaco);
  }, []);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    decorationsRef.current = editor.createDecorationsCollection([]);

    // Hand the restored draft (or the starter) up immediately. The page
    // owns `source` but the editor is uncontrolled, so without this the
    // first Run before any keystroke would submit an empty buffer.
    onSourceChange(editor.getValue());

    // Registered on the editor, not on `window`: Monaco consumes keys
    // aimed at it, so the page-level handler never sees this one.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => handlersRef.current.run());
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyV,
      () => handlersRef.current.toggleVim(),
    );

    setEditorReady(true);
  }, [onSourceChange]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      const code = value ?? "";
      onSourceChange(code);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        try {
          window.localStorage.setItem(STORAGE_KEY, code);
        } catch {
          // localStorage unavailable (private mode, quota) — persistence
          // is a convenience, and the buffer on screen is unaffected.
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [onSourceChange],
  );

  // Flush the pending draft on the way out, so navigating away inside the
  // debounce window doesn't lose the last half-second of typing.
  useEffect(() => {
    const flush = () => {
      if (!saveTimerRef.current) return;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      try {
        const code = editorRef.current?.getValue();
        if (code !== undefined) window.localStorage.setItem(STORAGE_KEY, code);
      } catch {
        // Best-effort, same as above.
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  useEffect(() => {
    if (!editorReady || !editorRef.current || !vimEnabled) return;
    // monaco-vim touches `window` at module-evaluation time, same as
    // monaco-editor itself — importing it dynamically here (rather than
    // statically at the top of the file) keeps it out of the SSR bundle.
    //
    // No `defineEx` here on purpose: `:w` is registered on monaco-vim's
    // *shared global* Vim object, so binding it would clobber the
    // FloatingEditor's save for the rest of the session. Edits here are
    // already persisted on their own, so the default no-op is honest.
    let cancelled = false;
    import("monaco-vim").then(({ initVimMode }) => {
      if (cancelled || !editorRef.current) return;
      vimModeRef.current = initVimMode(editorRef.current, statusBarRef.current ?? undefined);
    });
    return () => {
      cancelled = true;
      vimModeRef.current?.dispose();
      vimModeRef.current = null;
    };
  }, [vimEnabled, editorReady]);

  // The execution marker. A decorations collection rather than the
  // deprecated `deltaDecorations`, so Monaco tracks the range through
  // edits instead of stranding the highlight on a fixed line number.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const collection = decorationsRef.current;
    if (!editorReady || !editor || !monaco || !collection) return;

    const lineCount = editor.getModel()?.getLineCount() ?? 0;
    if (stale || activeLine === null || activeLine < 1 || activeLine > lineCount) {
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
  }, [activeLine, editorReady, stale]);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(source)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => {
        // Clipboard blocked (insecure origin, denied permission) — the
        // code is right there to select by hand, so this isn't an alert.
      });
  }, [source]);

  return (
    <div className="glass flex min-h-[24rem] flex-1 flex-col overflow-hidden rounded-2xl lg:min-h-0">
      <div className="glass-bar flex shrink-0 items-center justify-between gap-2 border-b border-[var(--hairline)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${status === "running" ? "animate-pulse" : ""}`}
            style={{ background: STATUS_COLOR[status] }}
          />
          <span className="truncate font-serif text-[12px] font-semibold text-[var(--text-primary)]">
            main.cpp
          </span>
          <span className="hidden shrink-0 font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)] sm:inline">
            {statusLabel}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)]">
            C++
          </span>

          <button
            type="button"
            onClick={handleToggleVim}
            disabled={!editorReady}
            title="Toggle Vim mode (Ctrl/Cmd+Shift+V)"
            aria-pressed={vimEnabled}
            className="rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-colors disabled:opacity-40"
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
            title={copied ? "Copied" : "Copy code"}
            aria-label="Copy code"
            className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            {copied ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <rect x="8" y="8" width="12" height="12" rx="1.5" />
                <path d="M16 8V5.5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1V15a1 1 0 0 0 1 1H8" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={onRun}
            disabled={!editorReady || status === "running"}
            title="Run trace (Ctrl/Cmd+Enter)"
            aria-label="Run trace"
            className="flex h-6 w-6 items-center justify-center rounded-full transition-shadow hover:shadow-[0_0_16px_var(--accent-glow)] disabled:opacity-40"
            style={{ background: "var(--accent-primary)", color: "var(--bg-base)" }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2.5v11l9-5.5-9-5.5z" />
            </svg>
          </button>
        </div>
      </div>

      {/* The editor takes every pixel the card has left over — the toolbar
        * above and every band below it are `shrink-0`, so this is the one
        * flexible row. */}
      <div className="relative min-h-0 flex-1 bg-[var(--bg-surface)]">
        <Editor
          height="100%"
          language="cpp"
          theme={LATTICE_THEME}
          // Uncontrolled, and mounted only on the client (`ssr: false`), so
          // reading localStorage inline here can't cause a hydration
          // mismatch and can't be undone by a later state round-trip.
          defaultValue={
            (typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY)) || STARTER
          }
          onChange={handleChange}
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          options={{
            automaticLayout: true,
            fontSize: 12,
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontLigatures: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: "smooth",
            padding: { top: 12, bottom: 12 },
            overviewRulerBorder: false,
            lineNumbersMinChars: 3,
            // Matches FloatingEditor: room for the execution arrow between
            // the line numbers and the first character.
            lineDecorationsWidth: 18,
          }}
          loading={<EditorLoading />}
        />
      </div>

      {vimEnabled && (
        <div
          ref={statusBarRef}
          className="shrink-0 border-t border-[var(--hairline)] px-3 py-1 font-mono text-[10px] text-[var(--text-secondary)]"
        />
      )}

      {stale && (
        <div className="flex shrink-0 items-center gap-2 border-t border-[var(--hairline)] bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)] px-3 py-1.5">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--accent-secondary)]">
            Edited &mdash; run again to trace this buffer
          </span>
        </div>
      )}

      {truncated && (
        <div className="flex shrink-0 items-center gap-2 border-t border-[var(--hairline)] bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)] px-3 py-1.5">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--accent-secondary)]">
            Truncated &mdash; the run hit the step limit
          </span>
        </div>
      )}

      {status === "error" && error && (
        <div className="shrink-0 border-t border-[var(--hairline)] bg-[color-mix(in_srgb,#f87171_12%,transparent)] px-3 py-1.5">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[#f87171]">
            Failed
          </span>
          <pre className="scrollbar-thin mt-1 max-h-24 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-4 text-[var(--text-primary)]">
            {error}
          </pre>
        </div>
      )}
    </div>
  );
}
