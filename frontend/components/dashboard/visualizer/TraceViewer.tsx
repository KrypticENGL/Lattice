"use client";

import { useState } from "react";
import type { TraceEvent } from "@/lib/trace-schema/types";
import { isTruncated } from "@/lib/trace-schema/types";

export type RunStatus = "idle" | "running" | "error" | "done";

/**
 * Phase 1 exit criteria (BLUEPRINT.md §12): "a plain step viewer that just
 * pretty-prints the JSON for the current step (no diagrams yet) — prove
 * the trace pipeline works end-to-end first." Real node/pointer diagrams
 * are §9/Phase 2, built on shape-detection that doesn't exist yet.
 */
export default function TraceViewer({
  status,
  error,
  trace,
  stdout,
  truncated,
}: {
  status: RunStatus;
  error?: string | null;
  trace: TraceEvent[] | null;
  stdout?: string;
  truncated?: boolean;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  // Reset to step 0 whenever a new trace arrives — the React-recommended
  // "adjust state during render" pattern (not an effect) so this doesn't
  // cause an extra render pass. See https://react.dev/learn/you-might-not-need-an-effect
  const [prevTrace, setPrevTrace] = useState(trace);
  if (trace !== prevTrace) {
    setPrevTrace(trace);
    setStepIndex(0);
  }

  const stepCount = trace?.length ?? 0;
  const current = trace && stepCount > 0 ? trace[stepIndex] : null;

  return (
    <div
      className="glass pointer-events-auto absolute bottom-4 right-4 z-20 flex flex-col overflow-hidden rounded-2xl"
      style={{ width: 420, height: 360 }}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${status === "running" ? "animate-pulse" : ""}`}
            style={{
              background:
                status === "running"
                  ? "var(--accent-primary)"
                  : status === "error"
                    ? "#f87171"
                    : status === "done"
                      ? "var(--accent-secondary)"
                      : "var(--hairline-strong)",
            }}
          />
          <span className="truncate font-serif text-[13px] font-semibold text-[var(--text-primary)]">Trace</span>
        </div>

        {stepCount > 0 && (
          <div className="flex shrink-0 items-center gap-2" data-no-drag>
            <button
              type="button"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={stepIndex <= 0}
              aria-label="Previous step"
              className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              ‹
            </button>
            <span className="font-mono text-[11px] text-[var(--text-secondary)]">
              {stepIndex + 1}/{stepCount}
            </span>
            <button
              type="button"
              onClick={() => setStepIndex((i) => Math.min(stepCount - 1, i + 1))}
              disabled={stepIndex >= stepCount - 1}
              aria-label="Next step"
              className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              ›
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {status === "idle" && !trace && (
          <p className="p-4 font-serif text-[13px] leading-6 text-[var(--text-secondary)]">
            Hit &ldquo;Run trace&rdquo; in the editor to execute your code in a sandboxed
            container and see the step-by-step trace here.
          </p>
        )}

        {status === "running" && (
          <p className="p-4 font-mono text-[12px] text-[var(--text-secondary)]">
            Running in sandbox…
          </p>
        )}

        {status === "error" && (
          <p className="p-4 font-mono text-[12px] leading-5 text-[#f87171]">{error}</p>
        )}

        {current && (
          <pre className="whitespace-pre-wrap break-words p-4 font-mono text-[11px] leading-5 text-[var(--text-primary)]">
            {isTruncated(current)
              ? `execution truncated: ${current.reason}`
              : JSON.stringify(current, null, 2)}
          </pre>
        )}
      </div>

      {(stdout || truncated) && (
        <div className="shrink-0 border-t border-[var(--hairline)] px-4 py-2">
          {stdout && (
            <p className="truncate font-mono text-[11px] text-[var(--text-secondary)]" title={stdout}>
              stdout: {stdout.trim() || "(empty)"}
            </p>
          )}
          {truncated && (
            <p className="font-mono text-[11px] text-[#fbbf24]">
              output truncated — a resource cap was hit
            </p>
          )}
        </div>
      )}
    </div>
  );
}
