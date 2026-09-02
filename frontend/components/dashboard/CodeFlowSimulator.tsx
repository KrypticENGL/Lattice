"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import SimulatorEditor from "@/components/dashboard/simulator/SimulatorEditor";
import StepBar from "@/components/dashboard/simulator/StepBar";
import CallStackPanel from "@/components/dashboard/simulator/CallStackPanel";
import VariablesPanel from "@/components/dashboard/simulator/VariablesPanel";
import MemoryPanel from "@/components/dashboard/simulator/MemoryPanel";
import { AddressLabels } from "@/components/dashboard/simulator/AddressLabels";
import ConsolePanel from "@/components/dashboard/simulator/ConsolePanel";
import { runTrace } from "@/lib/trace-schema/execute";
import { diffLocals, type LocalsDiff } from "@/lib/simulator/values";
import { isTruncated, type Frame, type HeapObject, type StepEvent } from "@/lib/trace-schema/types";

/** Matches the Visualizer's TraceControls, so autoplay reads at the same
 * pace on both pages. */
const PLAY_INTERVAL_MS = 600;

type Status = "idle" | "running" | "done" | "error";

/** The "no trace yet" values, hoisted so they keep one identity.
 *
 * `currentStep?.frames ?? []` reads as a harmless default and is not one:
 * it mints a fresh array on every render of this component, which is
 * every keystroke in the editor and every pointer that crosses a pointer
 * pill. The panels below are memoised on exactly these props, and a new
 * empty array defeats all of it — so the one case where there is nothing
 * to show would be the case that re-renders the most. */
const NO_FRAMES: Frame[] = [];
const NO_HEAP: Record<string, HeapObject> = {};

/** What the last click on the call stack changed about the variables
 * panel: which of the locals now listed differ from the frame the reader
 * was just looking at.
 *
 * `token` exists only to restart the flash — the same two frames can be
 * compared twice in a row, and a CSS animation that is already on the
 * element doesn't play again by itself. `step` is what makes the answer
 * expire: a comparison is only true of the step it was made in, and one
 * step later it would be describing values that have moved on. */
type FrameSwitch = LocalsDiff & { token: number; step: number };

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
 * a frame changes whose locals are listed, and marks the ones that frame
 * holds differently) because the answers are about the same instant.
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
  /** The frame the cursor is over in the memory panel's stack view.
   *
   * It lives here rather than in either panel because it is the one piece
   * of state the two of them share in opposite directions: the memory
   * panel is where it is set, and the call stack is where it is answered.
   * `hoveredRef` above is the same arrangement for a heap address. */
  const [hoveredDepth, setHoveredDepth] = useState<number | null>(null);
  /** The difference the last frame click made, or `null` when the panel is
   * simply showing a frame rather than answering a switch. */
  const [frameSwitch, setFrameSwitch] = useState<FrameSwitch | null>(null);

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
      setFrameSwitch(null);
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
  //
  // `[role="combobox"]` is the memory panel's view switcher and anything
  // else built on components/dashboard/Dropdown.tsx. That control is a
  // `<button>` rather than a `<select>`, so it no longer matches on its
  // tag — but it still runs its list off the arrow keys, and a step that
  // scrubbed underneath an open dropdown would be answering the same
  // keypress twice.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, select, textarea, [role="combobox"], .monaco-editor')) return;
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
  const frames = currentStep?.frames ?? NO_FRAMES;
  const heap = currentStep?.heap ?? NO_HEAP;

  const topDepth = frames.length > 0 ? frames.length - 1 : null;
  const shownDepth = pinnedDepth !== null && pinnedDepth < frames.length ? pinnedDepth : topDepth;
  const shownFrame = shownDepth !== null ? frames[shownDepth] ?? null : null;

  /** The step's frames and the one on screen, as of the last render.
   *
   * `handleSelectDepth` needs all three to work out what a click actually
   * changed, and needs to stay referentially stable while it does — the
   * call stack is memoised on it, and taking them as dependencies would
   * hand it a new identity on every step and re-render the stack
   * mid-animation. A ref is how it reads live values without declaring
   * them. */
  const liveRef = useRef<{
    frames: Frame[];
    shown: Frame | null;
    top: number | null;
    step: number;
  }>({ frames: NO_FRAMES, shown: null, top: null, step: 0 });
  useEffect(() => {
    liveRef.current = { frames, shown: shownFrame, top: topDepth, step: stepIndex };
  });

  // Stable, for the same reason as the two constants above: an inline
  // arrow here is a new prop on every render and would re-render the call
  // stack — mid-animation — every time a character is typed.
  const handleSelectDepth = useCallback((depth: number) => {
    const { frames: live, shown, top, step } = liveRef.current;
    const next = live[depth] ?? null;

    // Landing on the frame already shown is not a switch — clicking the
    // top frame is how following is resumed, and that is a no-op as far
    // as the variables panel is concerned.
    setFrameSwitch(
      next && shown && next !== shown
        ? (previous) => ({
            ...diffLocals(shown.locals, next.locals),
            token: (previous?.token ?? 0) + 1,
            step,
          })
        : null,
    );
    setPinnedDepth(depth === top ? null : depth);
  }, []);

  // Expired rather than cleared, and read that way here. Stepping is what
  // ends a comparison, and there are four ways to step — the scrubber,
  // both arrow keys, and autoplay, which advances the index directly. An
  // effect watching the index would have to catch all four and would cost
  // a second render every time it did; comparing against the step the
  // answer was made at costs nothing and cannot miss one.
  const frameDiff = frameSwitch && frameSwitch.step === stepIndex ? frameSwitch : null;

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
  // Clearing a hovered rail is the other half of the deal, and is not
  // optional: the left gutter no longer clears one, so this page has to
  // get out from under it. Everything here is real layout — there is no
  // canvas that can afford to be covered — but the two columns don't pay
  // for that the same way. The code column slides across at its full
  // width (a transform, so Monaco is never re-measured); the machine
  // column gives up the 132px from its own left edge, so the call stack,
  // the variables and the memory diagram are the only things that shrink.
  // See `.simulator-code-column` in globals.css for the whole bargain.
  return (
    <div
      data-workspace-full-width
      className="simulator-shell flex h-full min-h-0 flex-col gap-3"
    >
      <div className="simulator-chrome flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
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
        <div className="simulator-code-column flex min-h-0 flex-col gap-3">
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

        {/* How wide an address is written is a fact about the whole step
          * — see `addressLabels` — so the two panels that print one read
          * the answer from here rather than each truncating on its own
          * and disagreeing about which pointer names which card. */}
        <AddressLabels frames={frames} heap={heap}>
          <div className="simulator-machine-column flex min-h-0 flex-col gap-3">
            <div className="grid min-h-[11rem] shrink-0 grid-cols-2 gap-3 lg:h-[38%] lg:min-h-0">
              <CallStackPanel
                frames={frames}
                event={currentStep?.event ?? null}
                selectedDepth={shownDepth}
                highlightedDepth={hoveredDepth}
                onSelect={handleSelectDepth}
              />
              <VariablesPanel
                frame={shownFrame}
                depth={shownDepth}
                switched={frameDiff}
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
              hoveredDepth={hoveredDepth}
              onHoverDepth={setHoveredDepth}
            />
          </div>
        </AddressLabels>
      </div>
    </div>
  );
}
