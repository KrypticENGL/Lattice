"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

export default function StdoutModal({
  open,
  onClose,
  stdout,
  error,
  compileCommand,
  compilerOutput,
}: {
  open: boolean;
  onClose: () => void;
  stdout: string;
  /** Run failure (compile error, sandbox/network failure, ...) — shown
   * here instead of a separate error line elsewhere in the UI, so
   * there's exactly one place to look for "what did this run produce." */
  error?: string | null;
  /** The `g++ ...` invocation tracer.py ran, and any warnings it wrote to
   * stderr — present only on a successful compile, so the transcript below
   * can look like a real terminal (compile line, then the run) instead of
   * just the program's raw stdout. */
  compileCommand?: string;
  compilerOutput?: string;
}) {
  // Rendered via a portal straight into <body> — the visualizer header
  // this button lives in is `position: absolute; z-index: 10`, which
  // establishes its own stacking context. Any z-index inside it (even
  // z-50) is confined to that context, so the whole header — modal
  // included — would render behind FloatingEditor's z-20 panel
  // regardless of this component's own z-index. A portal escapes that
  // entirely instead of trying to out-number it.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // SSR has no `document` — render nothing there, portal client-side only.
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            className="glass flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
            style={{ maxHeight: "70vh" }}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Program stdout"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--hairline)] px-5 py-3">
              <span className="font-serif text-[14px] font-semibold text-[var(--text-primary)]">stdout</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--text-primary)]"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
              </button>
            </div>
            {error ? (
              <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-[12px] leading-6 text-[#f87171]">
                {error}
              </pre>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto p-5 font-mono text-[12px] leading-6">
                {compileCommand && (
                  <div className="whitespace-pre-wrap break-words text-[var(--text-secondary)]">
                    <span className="text-[var(--accent-secondary)]">$</span> {compileCommand}
                  </div>
                )}
                {compilerOutput && (
                  <pre className="whitespace-pre-wrap break-words text-[#fbbf24]">{compilerOutput}</pre>
                )}
                {compileCommand && (
                  <div className="mt-1 whitespace-pre-wrap break-words text-[var(--text-secondary)]">
                    <span className="text-[var(--accent-secondary)]">$</span> ./a.out
                  </div>
                )}
                <pre className="whitespace-pre-wrap break-words text-[var(--text-primary)]">
                  {stdout.trim() ? stdout : "(no output)"}
                </pre>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
