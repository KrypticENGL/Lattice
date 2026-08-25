"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SimulatorEditor from "@/components/dashboard/simulator/SimulatorEditor";
import StepBar from "@/components/dashboard/simulator/StepBar";
import CallStackPanel from "@/components/dashboard/simulator/CallStackPanel";
import VariablesPanel from "@/components/dashboard/simulator/VariablesPanel";
import MemoryPanel from "@/components/dashboard/simulator/MemoryPanel";
import { DEFAULT_PROGRAM_ID, programById } from "@/lib/simulator/programs";
import type { StepEvent } from "@/lib/trace-schema/types";

/** Matches the Visualizer's TraceControls, so autoplay reads at the same
 * pace on both pages. */
const PLAY_INTERVAL_MS = 600;
/** A beat of "Tracing…" before the trace appears. The work is synchronous
 * and instant, and a state that flips faster than it can be read is worse
 * than no state at all — this is the same beat the real run will take. */
const RUN_DELAY_MS = 320;

type Status = "idle" | "running" | "done" | "error";

const STATUS_LABEL: Record<Status, string> = {
  idle: "ready",
  running: "tracing",
  done: "traced",
  error: "failed",
};

/**
 * The Code-Flow Simulator: code on the left, the machine on the right.
 *
 * The right column is one machine shown three ways — the call stack says
 * *where* execution is, the variables say what that frame can see, and the
 * memory diagram says what the pointers among them actually reach. They
 * are separate panels rather than one because they answer separate
 * questions, and linked (hovering a pointer lights its heap card; picking
 * a frame changes whose locals are listed) because the answers are about
 * the same instant.
 *
 * Traces are built in the browser from `lib/simulator/programs.ts` — the
 * backend is out of scope for this page — but in the schema `POST
 * /api/execute` returns, so every panel below is already rendering the
 * real thing. Wiring the sandbox up later replaces `runLocalTrace` and
 * touches nothing else.
 */
export default function CodeFlowSimulator() {
  const [programId, setProgramId] = useState(DEFAULT_PROGRAM_ID);
  const program = programById(programId);

  const [source, setSource] = useState(program.source);
  const [status, setStatus] = useState<Status>("idle");
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** Which frame's locals the variables panel is showing. `null` follows
   * the innermost frame, which is what you want until you deliberately
   * click a caller — and clicking back onto the top frame resumes
   * following rather than pinning you to whatever depth that was. */
  const [pinnedDepth, setPinnedDepth] = useState<number | null>(null);
  const [hoveredRef, setHoveredRef] = useState<string | null>(null);

  const runTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (runTimerRef.current) clearTimeout(runTimerRef.current);
  }, []);

  /** True once the buffer no longer matches the sample the trace was built
   * from. The trace is still perfectly good — it just describes different
   * text, so the line highlight would lie. */
  const stale = steps.length > 0 && source !== program.source;

  const runLocalTrace = useCallback(() => {
    setStatus("running");
    setPlaying(false);
    if (runTimerRef.current) clearTimeout(runTimerRef.current);
    runTimerRef.current = setTimeout(() => {
      try {
        setSteps(program.build());
        setStepIndex(0);
        setPinnedDepth(null);
        setStatus("done");
      } catch {
        setSteps([]);
        setStatus("error");
      }
    }, RUN_DELAY_MS);
  }, [program]);

  const handleProgramChange = useCallback((id: string) => {
    const next = programById(id);
    setProgramId(id);
    setSource(next.source);
    setSteps([]);
    setStepIndex(0);
    setPinnedDepth(null);
    setPlaying(false);
    setStatus("idle");
  }, []);

  const handleRestore = useCallback(() => setSource(program.source), [program]);

  const handleStepChange = useCallback((index: number) => {
    setStepIndex(index);
    setPinnedDepth(null);
  }, []);

  // Autoplay. Stops itself at the end rather than looping — a trace that
  // restarts on its own makes it impossible to look at the last step.
  useEffect(() => {
    if (!playing || steps.length === 0) return;
    const id = setInterval(() => {
      setStepIndex((current) => {
        if (current >= steps.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [playing, steps.length]);

  // Keyboard scrubbing. Skipped whenever the focus is somewhere that wants
  // those keys itself — Monaco, the scrubber, the program picker.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, .monaco-editor")) return;

      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        runLocalTrace();
        return;
      }
      if (steps.length === 0) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setStepIndex((i) => Math.min(steps.length - 1, i + 1));
        setPinnedDepth(null);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setStepIndex((i) => Math.max(0, i - 1));
        setPinnedDepth(null);
      } else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runLocalTrace, steps.length]);

  const currentStep = steps.length > 0 ? steps[Math.min(stepIndex, steps.length - 1)] : null;
  const frames = currentStep?.frames ?? [];
  const heap = currentStep?.heap ?? {};

  const topDepth = frames.length > 0 ? frames.length - 1 : null;
  const shownDepth = pinnedDepth !== null && pinnedDepth < frames.length ? pinnedDepth : topDepth;
  const shownFrame = shownDepth !== null ? frames[shownDepth] ?? null : null;

  // Everything printed up to and including the current step. Recomputed
  // from the deltas rather than stored, so scrubbing backwards shortens
  // the console the way stepping backwards should.
  const consoleText = useMemo(
    () =>
      steps
        .slice(0, stepIndex + 1)
        .map((s) => s.stdout_delta)
        .join(""),
    [steps, stepIndex],
  );

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-7xl flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            Simulator
          </span>
          <h1 className="text-balance mt-1 font-serif text-xl font-black tracking-tight text-[var(--text-primary)] xl:text-2xl">
            Code-flow simulator.
          </h1>
        </div>

        <StepBar
          status={status}
          steps={steps}
          stepIndex={stepIndex}
          onStepChange={handleStepChange}
          playing={playing}
          onPlayToggle={() => setPlaying((p) => !p)}
          onRun={runLocalTrace}
          currentStep={currentStep}
        />
      </div>

      {/* Two columns, and both of them own their own height: `min-h-0` on
        * the grid is what lets the editor and the panels scroll internally
        * instead of growing the page. Below `lg` they stack and the page
        * scrolls, with a floor under each so neither collapses to nothing. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)]">
        <SimulatorEditor
          programId={programId}
          source={source}
          onSourceChange={setSource}
          onProgramChange={handleProgramChange}
          activeLine={currentStep?.line ?? null}
          status={status}
          statusLabel={STATUS_LABEL[status]}
          stale={stale}
          onRun={runLocalTrace}
          onRestore={handleRestore}
          console={consoleText}
        />

        <div className="flex min-h-0 flex-col gap-3">
          <div className="grid min-h-[11rem] shrink-0 grid-cols-2 gap-3 lg:h-[38%] lg:min-h-0">
            <CallStackPanel
              frames={frames}
              event={currentStep?.event ?? null}
              selectedDepth={shownDepth}
              onSelect={(depth) => setPinnedDepth(depth === topDepth ? null : depth)}
            />
            <VariablesPanel
              frame={shownFrame}
              depth={shownDepth}
              heap={heap}
              hoveredRef={hoveredRef}
              onHoverRef={setHoveredRef}
            />
          </div>

          <MemoryPanel
            frames={frames}
            heap={heap}
            hoveredRef={hoveredRef}
            onHoverRef={setHoveredRef}
          />
        </div>
      </div>
    </div>
  );
}
