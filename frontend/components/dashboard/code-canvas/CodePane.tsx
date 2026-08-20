"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { BeforeMount } from "@monaco-editor/react";
import { defineLatticeTheme, LATTICE_THEME } from "@/lib/monaco-theme";

// Same reason as FloatingEditor: monaco-editor touches `window` at import
// time, so it can never be part of the server bundle.
const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <PaneLoading />,
});

function PaneLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--bg-surface)] font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
      Loading editor…
    </div>
  );
}

const MIN_WIDTH = 360;
const MAX_WIDTH = 860;
const MARGIN = 16;

/**
 * The generated-code side of Code-Canvas. Read-only on purpose: the graph is
 * the source of truth, and letting someone edit here would immediately
 * desync the two. Editing happens in the Visualizer, which is exactly what
 * "Open in Visualizer" hands off to.
 */
export default function CodePane({
  code,
  notes,
  topInset,
  width,
  onWidthChange,
  minimized,
  onMinimizedChange,
  onOpenInVisualizer,
  handingOff,
  handoffError,
}: {
  code: string;
  notes: string[];
  topInset: number;
  width: number;
  onWidthChange: (width: number) => void;
  minimized: boolean;
  onMinimizedChange: (minimized: boolean) => void;
  onOpenInVisualizer: () => void;
  handingOff: boolean;
  handoffError: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // beforeMount, not onMount: Monaco builds its DOM with the default light
  // theme, so theming it after creation costs a painted frame of white.
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    defineLatticeTheme(monaco);
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => {
        // Clipboard blocked (insecure origin, denied permission) — the code
        // is right there to select by hand, so this isn't worth an alert.
      });
  }, [code]);

  const handleResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;
      const onMove = (ev: PointerEvent) => {
        const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth - (ev.clientX - startX)));
        if (panelRef.current) panelRef.current.style.width = `${next}px`;
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        onWidthChange(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth - (ev.clientX - startX))));
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [onWidthChange, width],
  );

  if (minimized) {
    return (
      <button
        type="button"
        data-tour="code-pane"
        onClick={() => onMinimizedChange(false)}
        style={{ top: topInset, right: MARGIN }}
        className="matte absolute z-20 flex items-center gap-2 rounded-full px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)]"
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent-secondary)" }} />
        Code
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 3L5 8l5 5" />
        </svg>
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      data-tour="code-pane"
      style={{ top: topInset, right: MARGIN, bottom: MARGIN, width }}
      className="matte absolute z-20 flex flex-col overflow-hidden rounded-2xl"
    >
      <div
        onPointerDown={handleResize}
        aria-hidden="true"
        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize transition-colors hover:bg-[var(--accent-primary)]/40"
      />

      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent-secondary)" }} />
          <span className="truncate font-serif text-[13px] font-semibold text-[var(--text-primary)]">
            Generated code
          </span>
          <span className="hidden shrink-0 rounded-full border border-[var(--hairline)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)] sm:inline">
            C++
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            title="Copy code"
            aria-label="Copy code"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--text-primary)]"
          >
            {copied ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12.5l5 5 11-11" />
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
            data-tour="handoff"
            onClick={onOpenInVisualizer}
            disabled={handingOff}
            title="Run this graph in the Visualizer"
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-shadow hover:shadow-[0_0_16px_var(--accent-glow)] disabled:opacity-50"
            style={{ background: "var(--accent-primary)", color: "var(--bg-base)" }}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2.5v11l9-5.5-9-5.5z" />
            </svg>
            {handingOff ? "Opening…" : "Visualize"}
          </button>

          <button
            type="button"
            onClick={() => onMinimizedChange(true)}
            title="Collapse the code pane"
            aria-label="Collapse the code pane"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--text-primary)]"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3l5 5-5 5" />
            </svg>
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-[var(--bg-surface)]">
        <Editor
          height="100%"
          language="cpp"
          theme={LATTICE_THEME}
          value={code}
          beforeMount={handleBeforeMount}
          options={{
            readOnly: true,
            domReadOnly: true,
            automaticLayout: true,
            fontSize: 12.5,
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontLigatures: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            padding: { top: 12, bottom: 12 },
            overviewRulerBorder: false,
            lineNumbersMinChars: 3,
            renderLineHighlight: "none",
            contextmenu: false,
          }}
          loading={<PaneLoading />}
        />
      </div>

      {handoffError && (
        <p className="shrink-0 border-t border-[var(--hairline)] px-4 py-2 font-mono text-[10px] text-[var(--accent-secondary)]">
          {handoffError}
        </p>
      )}

      {notes.length > 0 && (
        <div className="shrink-0 border-t border-[var(--hairline)]">
          <button
            type="button"
            onClick={() => setNotesOpen((open) => !open)}
            className="flex w-full items-center gap-2 px-4 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px]"
              style={{ background: "color-mix(in srgb, var(--accent-secondary) 25%, transparent)", color: "var(--accent-secondary)" }}
            >
              !
            </span>
            {notes.length} {notes.length === 1 ? "note" : "notes"}
            <svg
              width="10"
              height="10"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="ml-auto"
              style={{ transform: notesOpen ? "rotate(180deg)" : "none", transition: "transform 200ms ease-out" }}
            >
              <path d="M3 6l5 5 5-5" />
            </svg>
          </button>
          {notesOpen && (
            <ul className="scrollbar-thin max-h-28 space-y-1 overflow-y-auto px-4 pb-3 font-mono text-[10px] leading-relaxed text-[var(--text-secondary)]">
              {notes.map((note, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[var(--accent-secondary)]">·</span>
                  {note}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
