"use client";

import { useEffect, useRef, useState } from "react";
import type { StepEvent } from "@/lib/trace-schema/types";
import StdoutModal from "./StdoutModal";

export type RunStatus = "idle" | "running" | "error" | "done";

const PLAY_INTERVAL_MS = 600;

/**
 * Inline status/step bar — sits next to the "Visualizer" title, not
 * floating over the canvas. The actual diagram lives on InfiniteCanvas
 * itself (pans/zooms with it); this bar is pure UI chrome.
 *
 * Just prev/next + a step counter — a per-step tick/number strip doesn't
 * scale to traces with hundreds or thousands of steps (§6.3's cap is
 * 5000), so it's deliberately not here.
 */
export default function TraceControls({
  status,
  error,
  stepIndex,
  steps,
  onStepChange,
  stdout,
  truncated,
  compileCommand,
  compilerOutput,
}: {
  status: RunStatus;
  error?: string | null;
  stepIndex: number;
  steps: StepEvent[];
  onStepChange: (index: number) => void;
  stdout?: string;
  truncated?: boolean;
  compileCommand?: string;
  compilerOutput?: string;
}) {
  const [stdoutOpen, setStdoutOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const stepCount = steps.length;

  // Stop playback whenever a new trace arrives — "adjust state during
  // render" (not an effect) per this project's react-hooks/set-state-in-effect
  // rule. See https://react.dev/learn/you-might-not-need-an-effect
  const [prevSteps, setPrevSteps] = useState(steps);
  if (steps !== prevSteps) {
    setPrevSteps(steps);
    if (isPlaying) setIsPlaying(false);
  }

  // Reads the *current* index/count each tick rather than closing over
  // stale values from whenever the interval was set up.
  const stepIndexRef = useRef(stepIndex);
  const stepCountRef = useRef(stepCount);
  useEffect(() => {
    stepIndexRef.current = stepIndex;
  }, [stepIndex]);
  useEffect(() => {
    stepCountRef.current = stepCount;
  }, [stepCount]);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      const next = stepIndexRef.current + 1;
      if (next >= stepCountRef.current) {
        setIsPlaying(false);
        return;
      }
      onStepChange(next);
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPlaying, onStepChange]);

  if (status === "idle" && stepCount === 0) return null;

  const currentStep = stepCount > 0 ? steps[stepIndex] : null;

  function handlePlayToggle() {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (stepIndex >= stepCount - 1) onStepChange(0);
    setIsPlaying(true);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="rail-pill matte flex shrink-0 gap-2 rounded-full px-3">
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
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
            Trace
          </span>

          {currentStep && (
            <>
              <span className="inline-block min-w-[9ch] shrink-0 rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-center font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                {currentStep.event}
              </span>

              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  onStepChange(Math.max(0, stepIndex - 1));
                }}
                disabled={stepIndex <= 0}
                aria-label="Previous step"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
              >
                ‹
              </button>

              <span className="inline-block min-w-[8ch] shrink-0 text-center font-mono text-[10px] text-[var(--text-secondary)]">
                {stepIndex + 1}/{stepCount}
              </span>

              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  onStepChange(Math.min(stepCount - 1, stepIndex + 1));
                }}
                disabled={stepIndex >= stepCount - 1}
                aria-label="Next step"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
              >
                ›
              </button>

              <button
                type="button"
                onClick={handlePlayToggle}
                disabled={stepCount <= 1}
                aria-label={isPlaying ? "Pause playback" : "Play through steps"}
                title={isPlaying ? "Pause" : "Play"}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
              >
                {isPlaying ? (
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="3" y="2.5" width="3.5" height="11" rx="0.75" />
                    <rect x="9.5" y="2.5" width="3.5" height="11" rx="0.75" />
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4 2.5v11l9-5.5-9-5.5z" />
                  </svg>
                )}
              </button>
            </>
          )}
        </div>

        {status === "running" && (
          <span className="shrink-0 font-mono text-[10px] text-[var(--text-secondary)]">Running in sandbox…</span>
        )}

        {(stdout !== undefined || status === "error") && (
          <button
            type="button"
            onClick={() => setStdoutOpen(true)}
            className="rail-pill matte flex gap-1.5 rounded-full px-2.5 font-mono text-[9px] uppercase tracking-wider transition-colors"
            style={{ color: status === "error" ? "#f87171" : "var(--text-secondary)" }}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3.5h12M2 8h8M2 12.5h10" />
            </svg>
            stdout
          </button>
        )}
      </div>

      {truncated && (
        <span className="pl-3 font-mono text-[10px] text-[#fbbf24]">output truncated — a resource cap was hit</span>
      )}

      <StdoutModal
        open={stdoutOpen}
        onClose={() => setStdoutOpen(false)}
        stdout={stdout ?? ""}
        error={error}
        compileCommand={compileCommand}
        compilerOutput={compilerOutput}
      />
    </div>
  );
}
