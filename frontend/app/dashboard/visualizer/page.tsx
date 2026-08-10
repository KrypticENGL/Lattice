"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import InfiniteCanvas, { type InfiniteCanvasHandle } from "@/components/dashboard/visualizer/InfiniteCanvas";
import FloatingEditor, { type Language } from "@/components/dashboard/visualizer/FloatingEditor";
import TraceControls, { type RunStatus } from "@/components/dashboard/visualizer/TraceControls";
import DiagramView from "@/components/dashboard/visualizer/DiagramView";
import { runTrace, ExecuteRequestError } from "@/lib/trace-schema/execute";
import { isTruncated, type StepEvent, type TraceEvent } from "@/lib/trace-schema/types";
import { buildDiagram } from "@/lib/shape-detection";

const HEADER_GAP = 16;

export default function VisualizerPage() {
  const canvasRef = useRef<InfiniteCanvasHandle>(null);
  const boundsRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [topInset, setTopInset] = useState(96);

  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [runError, setRunError] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceEvent[] | null>(null);
  const [stdout, setStdout] = useState<string | undefined>(undefined);
  const [truncated, setTruncated] = useState(false);
  const [compileCommand, setCompileCommand] = useState<string | undefined>(undefined);
  const [compilerOutput, setCompilerOutput] = useState<string | undefined>(undefined);
  const [stepIndex, setStepIndex] = useState(0);

  // Reset to step 0 whenever a new trace arrives — "adjust state during
  // render" pattern, not an effect. See https://react.dev/learn/you-might-not-need-an-effect
  const [prevTrace, setPrevTrace] = useState(trace);
  if (trace !== prevTrace) {
    setPrevTrace(trace);
    setStepIndex(0);
  }

  // The final "truncated" sentinel (if any) isn't a real step to view —
  // the `truncated` flag above already surfaces that in TraceControls.
  // Memoized on `trace` specifically: `.filter()` builds a new array
  // every call, and without this, TraceControls' autoplay effect (which
  // resets on a "new" `steps` reference) would see a fresh array on
  // every stepIndex-driven re-render and kill itself after one tick.
  const stepEvents = useMemo(
    () => trace?.filter((e): e is StepEvent => !isTruncated(e)) ?? null,
    [trace],
  );
  const stepCount = stepEvents?.length ?? 0;
  const currentStep = stepEvents && stepCount > 0 ? stepEvents[stepIndex] : null;
  const diagram = currentStep ? buildDiagram(currentStep) : null;

  const handleReset = useCallback(() => {
    canvasRef.current?.resetView();
  }, []);

  const handleRun = useCallback(async (language: Language, source: string) => {
    setRunStatus("running");
    setRunError(null);
    try {
      const result = await runTrace(language, source);
      setTrace(result.trace);
      setStdout(result.stdout);
      setTruncated(result.truncated);
      setCompileCommand(result.compile_command);
      setCompilerOutput(result.compiler_output);
      setRunStatus("done");
    } catch (err) {
      setTrace(null);
      setCompileCommand(undefined);
      setCompilerOutput(undefined);
      setRunError(err instanceof ExecuteRequestError ? err.message : "trace request failed");
      setRunStatus("error");
    }
  }, []);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setTopInset(el.getBoundingClientRect().height + HEADER_GAP);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={boundsRef} className="relative h-full w-full overflow-hidden">
      <InfiniteCanvas ref={canvasRef} onZoomChange={setZoom}>
        {diagram && <DiagramView diagram={diagram} zoom={zoom} />}
      </InfiniteCanvas>

      <div
        ref={headerRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-end justify-between gap-4 p-1"
      >
        <div className="shifts-with-sidebar pointer-events-none pl-8">
          <span aria-hidden="true" className="invisible block font-mono text-[13px] uppercase tracking-[0.2em]">
            Visualizer
          </span>
          <div className="mt-2 flex flex-wrap items-end gap-8">
            <span
              className="block font-serif text-4xl font-black tracking-tight text-[var(--text-primary)] sm:text-5xl"
              style={{ filter: "drop-shadow(0 2px 16px rgba(0,0,0,0.55))" }}
            >
              Visualizer
            </span>
            <div className="pointer-events-auto pb-1">
              <TraceControls
                status={runStatus}
                error={runError}
                stepIndex={stepIndex}
                steps={stepEvents ?? []}
                onStepChange={setStepIndex}
                stdout={stdout}
                truncated={truncated}
                compileCommand={compileCommand}
                compilerOutput={compilerOutput}
              />
            </div>
          </div>
        </div>

        <div className="pointer-events-auto mb-2 flex items-center gap-3">
          <span className="matte hidden rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)] lg:inline-block">
            Scroll to zoom · Drag to pan
          </span>
          <div className="matte flex items-center gap-3 rounded-full px-4 py-2.5">
            <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
              Zoom
            </span>
            <span className="w-10 shrink-0 font-mono text-[12px] font-medium text-[var(--text-primary)]">
              {Math.round(zoom * 100)}%
            </span>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="matte rounded-full px-5 py-2.5 font-mono text-[12px] font-medium uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)]"
          >
            Reset view
          </button>
        </div>
      </div>

      <FloatingEditor
        boundsRef={boundsRef}
        topInset={topInset}
        onRun={handleRun}
        running={runStatus === "running"}
      />
    </div>
  );
}
