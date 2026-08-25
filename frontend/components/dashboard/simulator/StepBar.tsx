"use client";

import type { StepEvent } from "@/lib/trace-schema/types";

/**
 * Run / scrub / play, in the page header beside the title.
 *
 * Deliberately the same vocabulary as the Visualizer's TraceControls —
 * `.rail-pill` height, mono uppercase micro-labels, an accent-filled
 * primary action — with one addition it can afford and TraceControls
 * can't: a scrubber. The Visualizer caps at 5000 steps where a slider is
 * useless, but these samples are tens of steps long, so dragging through
 * a run is the fastest way to find the moment something changed.
 */
export default function StepBar({
  status,
  steps,
  stepIndex,
  onStepChange,
  playing,
  onPlayToggle,
  onRun,
  currentStep,
}: {
  status: "idle" | "running" | "done" | "error";
  steps: StepEvent[];
  stepIndex: number;
  onStepChange: (index: number) => void;
  playing: boolean;
  onPlayToggle: () => void;
  onRun: () => void;
  currentStep: StepEvent | null;
}) {
  const count = steps.length;
  const hasTrace = count > 0;
  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5 xl:gap-2">
      {hasTrace && currentStep && (
        <span className="rail-pill glass-flat hidden gap-2 rounded-full px-3 2xl:flex">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)]">
            after line
          </span>
          <span className="font-mono text-[11px] font-medium text-[var(--text-primary)]">
            {currentStep.line}
          </span>
        </span>
      )}

      {hasTrace && (
        <>
          <div className="rail-pill glass-flat flex gap-2 rounded-full px-3">
            <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)]">
              step
            </span>
            <span className="font-mono text-[11px] font-medium tabular-nums text-[var(--text-primary)]">
              {pad(stepIndex + 1)}/{pad(count)}
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={count - 1}
            value={stepIndex}
            onChange={(e) => onStepChange(Number(e.target.value))}
            aria-label="Trace step"
            className="h-[30px] w-24 cursor-pointer bg-transparent xl:w-32"
            style={{ accentColor: "var(--accent-primary)" }}
          />

          <div className="rail-pill glass-flat flex items-center gap-0.5 rounded-full px-1">
            <StepButton
              label="Previous step"
              onClick={() => onStepChange(Math.max(0, stepIndex - 1))}
              disabled={stepIndex <= 0}
            >
              <path d="M10 3L5 8l5 5" />
            </StepButton>

            <button
              type="button"
              onClick={onPlayToggle}
              disabled={count <= 1}
              title={playing ? "Pause" : "Play"}
              aria-label={playing ? "Pause" : "Play"}
              className="flex h-6 w-6 items-center justify-center rounded-full transition-colors disabled:opacity-30"
              style={{
                background: playing ? "var(--accent-primary)" : "transparent",
                color: playing ? "var(--bg-base)" : "var(--text-primary)",
              }}
            >
              {playing ? (
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3.5" y="3" width="3" height="10" rx="1" />
                  <rect x="9.5" y="3" width="3" height="10" rx="1" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 2.5v11l9-5.5-9-5.5z" />
                </svg>
              )}
            </button>

            <StepButton
              label="Next step"
              onClick={() => onStepChange(Math.min(count - 1, stepIndex + 1))}
              disabled={stepIndex >= count - 1}
            >
              <path d="M6 3l5 5-5 5" />
            </StepButton>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onRun}
        disabled={status === "running"}
        title="Run trace (Ctrl/Cmd+Enter)"
        className="rail-pill inline-flex rounded-full px-3.5 font-mono text-[10px] font-medium uppercase tracking-wider transition-shadow hover:shadow-[0_0_20px_var(--accent-glow)] disabled:opacity-50"
        style={{ background: "var(--accent-primary)", color: "var(--bg-base)" }}
      >
        {status === "running" ? "Tracing…" : hasTrace ? "Run again" : "Run trace"}
      </button>
    </div>
  );
}

function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
    >
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}
