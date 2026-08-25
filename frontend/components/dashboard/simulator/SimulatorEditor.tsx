"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { defineLatticeTheme, LATTICE_THEME } from "@/lib/monaco-theme";
import { registerLatticeCompletions } from "@/lib/monaco-completions";
import { SIMULATOR_PROGRAMS } from "@/lib/simulator/programs";

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
 * with a `.glass-bar` toolbar, and the `lattice-active-line` decoration
 * set through a decorations *collection* so the highlight tracks the text
 * when lines are inserted above it.
 *
 * It is docked instead of draggable because there is a second column here
 * that must not be covered: on the Visualizer the editor floats over an
 * infinite canvas that can simply be panned out from under it, and none
 * of that applies to a fixed two-column reading layout.
 */
export default function SimulatorEditor({
  programId,
  source,
  onSourceChange,
  onProgramChange,
  activeLine,
  status,
  statusLabel,
  stale,
  onRun,
  onRestore,
  console: consoleText,
}: {
  programId: string;
  source: string;
  onSourceChange: (source: string) => void;
  onProgramChange: (id: string) => void;
  /** Line the current step just executed, or null for "nothing running". */
  activeLine: number | null;
  status: "idle" | "running" | "done" | "error";
  statusLabel: string;
  /** The buffer has been edited away from the sample the trace was built
   * from, so the highlight would be pointing at the wrong statement. */
  stale: boolean;
  onRun: () => void;
  onRestore: () => void;
  /** Everything the program has printed up to the current step. */
  console: string;
}) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [copied, setCopied] = useState(false);

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
    setEditorReady(true);
  }, []);

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

  const program = SIMULATOR_PROGRAMS.find((p) => p.id === programId) ?? SIMULATOR_PROGRAMS[0];

  return (
    <div className="glass flex min-h-[24rem] flex-col overflow-hidden rounded-2xl lg:min-h-0">
      <div className="glass-bar flex shrink-0 items-center justify-between gap-2 border-b border-[var(--hairline)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${status === "running" ? "animate-pulse" : ""}`}
            style={{ background: STATUS_COLOR[status] }}
          />
          <span className="truncate font-serif text-[12px] font-semibold text-[var(--text-primary)]">
            {program.file}
          </span>
          <span className="hidden shrink-0 font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)] sm:inline">
            {statusLabel}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <select
            value={programId}
            onChange={(e) => onProgramChange(e.target.value)}
            aria-label="Sample program"
            className="max-w-[10rem] rounded-full border border-[var(--hairline)] bg-[var(--bg-elevated)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--text-primary)] focus:border-[var(--accent-secondary)] focus:outline-none"
          >
            {SIMULATOR_PROGRAMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)]">
            C++
          </span>

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

      {/* The editor takes every pixel the column has left over — the
        * console below it is sized by its own content, and the toolbars
        * are `shrink-0`, so this is the one flexible band. */}
      <div className="relative min-h-0 flex-1 bg-[var(--bg-surface)]">
        <Editor
          key={programId}
          height="100%"
          language="cpp"
          theme={LATTICE_THEME}
          defaultValue={source}
          onChange={(value) => onSourceChange(value ?? "")}
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

      {stale && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--hairline)] bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)] px-3 py-1.5">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--accent-secondary)]">
            Edited &mdash; trace no longer matches this buffer
          </span>
          <button
            type="button"
            onClick={onRestore}
            className="shrink-0 rounded-full border border-[var(--hairline-strong)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)]"
          >
            Restore sample
          </button>
        </div>
      )}

      <div className="flex h-[4.5rem] shrink-0 flex-col border-t border-[var(--hairline)] bg-[var(--bg-base)]/40">
        <div className="flex shrink-0 items-center gap-2 px-3 pt-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">
            stdout
          </span>
          <span className="h-px flex-1 bg-[var(--hairline)]" />
        </div>
        <pre className="scrollbar-thin min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-3 py-1 font-mono text-[11px] leading-5 text-[var(--text-primary)]">
          {consoleText || (
            <span className="text-[var(--text-secondary)]">
              {status === "idle" ? "Run the trace to see output." : "—"}
            </span>
          )}
        </pre>
      </div>
    </div>
  );
}
