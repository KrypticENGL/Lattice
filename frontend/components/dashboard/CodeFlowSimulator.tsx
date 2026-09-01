"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import SimulatorEditor from "@/components/dashboard/simulator/SimulatorEditor";
import StepBar from "@/components/dashboard/simulator/StepBar";
import CallStackPanel from "@/components/dashboard/simulator/CallStackPanel";
import VariablesPanel from "@/components/dashboard/simulator/VariablesPanel";
import MemoryPanel from "@/components/dashboard/simulator/MemoryPanel";
import ConsolePanel from "@/components/dashboard/simulator/ConsolePanel";
import { runTrace } from "@/lib/trace-schema/execute";
import { isTruncated, type StepEvent } from "@/lib/trace-schema/types";

/** Matches the Visualizer's TraceControls, so autoplay reads at the same
 * pace on both pages. */
const PLAY_INTERVAL_MS = 600;

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
 * Whatever is in the editor is what runs. `POST /api/execute` compiles it
 * in the sandbox and gdb-traces it (backend/src/sandbox, tracers/cpp), and
 * every panel below renders the `StepEvent`s that come back — so the stack,
 * the locals and the heap are read off the real process, not narrated.
 */
export default function CodeFlowSimulator() {
  const { getToken } = useAuth();

  const [source, setSource] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  /** The exact buffer the current trace was produced from. Kept so the
   * line highlight can be withdrawn once the two diverge. */
  const [tracedSource, setTracedSource] = useState<string | null>(null);
  /** Which frame's locals the variables panel is showing. `null` follows
   * the innermost frame, which is what you want until you deliberately
   * click a caller — and clicking back onto the top frame resumes
   * following rather than pinning you to whatever depth that was. */
  const [pinnedDepth, setPinnedDepth] = useState<number | null>(null);
  const [hoveredRef, setHoveredRef] = useState<string | null>(null);

  /** True once the buffer no longer matches the source the trace was built
   * from. The trace is still perfectly good — it just describes different
   * text, so the line highlight would lie. */
  const stale = steps.length > 0 && tracedSource !== null && source !== tracedSource;

  // A run in flight guards the next one rather than the button alone: the
  // Ctrl/Cmd+Enter path doesn't go through the button's `disabled`.
  const runningRef = useRef(false);

  const handleRun = useCallback(async () => {
    if (runningRef.current) return;
    if (!source.trim()) {
      setStatus("error");
      setError("nothing to run — the editor is empty");
      return;
    }

    runningRef.current = true;
    const submitted = source;
    setStatus("running");
    setPlaying(false);
    setError(null);

    try {
      const token = await getToken();
      // `fullSteps`: without it the tracer emits only steps that change
      // the heap, and the call stack below would sit at depth 1 through
      // any recursion that doesn't allocate.
      const result = await runTrace("cpp", submitted, token, undefined, true);
      // The trailing "truncated" sentinel isn't a step anyone can look at;
      // `result.truncated` is what says the run was cut short.
      const events = result.trace.filter((e): e is StepEvent => !isTruncated(e));

      setSteps(events);
      setStepIndex(0);
      setPinnedDepth(null);
      setTruncated(result.truncated);
      setTracedSource(submitted);

      if (events.length === 0) {
        // Compiled and ran, but produced no steps. The compiler's own
        // words are far more useful here than anything we could invent.
        setError(result.compiler_output?.trim() || "the trace came back empty — nothing ran");
        setStatus("error");
      } else {
        setStatus("done");
      }
    } catch (err) {
      // A compile failure arrives this way too: the backend returns the
      // compiler's diagnostics as the error body.
      setSteps([]);
      setTruncated(false);
      setTracedSource(null);
      setError(err instanceof Error ? err.message : "trace request failed");
      setStatus("error");
    } finally {
      runningRef.current = false;
    }
  }, [getToken, source]);

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
  // those keys itself — Monaco, the scrubber. Ctrl/Cmd+Enter is *not*
  // handled here: Monaco swallows keys aimed at it, so the editor
  // registers that one itself and it works from either side.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, .monaco-editor")) return;
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
  }, [steps.length]);

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

  // `data-workspace-full-width` trades `main`'s document gutters for the
  // canvas workspaces' (see globals.css): no right inset at all, and a
  // left one that clears the rail collapsed rather than expanded. With
  // those gone and no `max-w-*` cap, the title and all four panels run
  // edge to edge. `mx-auto` went with the cap — there is no slack to
  // centre in any more, and leaving it would read as intent.
  //
  // `shifts-with-sidebar` is the other half of the deal, and is not
  // optional: the left gutter no longer clears a hovered rail, so this
  // column has to slide out from under one. It sits on the root rather
  // than on the header alone because everything here is real layout —
  // there is no canvas that can afford to be covered.
  return (
    <div
      data-workspace-full-width
      className="shifts-with-sidebar flex h-full min-h-0 flex-col gap-3"
    >
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
          onRun={handleRun}
          currentStep={currentStep}
        />
      </div>

      {/* Two columns, and both of them own their own height: `min-h-0` on
        * the grid is what lets the editor and the panels scroll internally
        * instead of growing the page. Below `lg` they stack and the page
        * scrolls, with a floor under each so neither collapses to nothing. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)]">
        {/* Output above, input below — two cards, not one. The editor is
          * everything you changed; the console is the one thing on the page
          * the program itself wrote, and it earns its own shell for that.
          *
          * stdout goes on top because that edge is where the run controls
          * are: the StepBar sits directly above this column, so pressing
          * play and reading what came out no longer means crossing the full
          * height of the code. It is also the only card here with a fixed
          * height — anchoring it to the top means the editor grows and
          * shrinks downward, and the transcript never moves. */}
        <div className="flex min-h-0 flex-col gap-3">
          <ConsolePanel console={consoleText} status={status} />
          <SimulatorEditor
            source={source}
            onSourceChange={setSource}
            activeLine={currentStep?.line ?? null}
            status={status}
            statusLabel={STATUS_LABEL[status]}
            stale={stale}
            error={error}
            truncated={truncated}
            onRun={handleRun}
          />
        </div>

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
