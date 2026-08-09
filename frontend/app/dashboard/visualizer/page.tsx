"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import InfiniteCanvas, { type InfiniteCanvasHandle } from "@/components/dashboard/visualizer/InfiniteCanvas";
import FloatingEditor, { type Language } from "@/components/dashboard/visualizer/FloatingEditor";
import TraceViewer, { type RunStatus } from "@/components/dashboard/visualizer/TraceViewer";
import { runTrace, ExecuteRequestError } from "@/lib/trace-schema/execute";
import type { TraceEvent } from "@/lib/trace-schema/types";

const HEADER_GAP = 16;

export default function VisualizerPage() {
  const canvasRef = useRef<InfiniteCanvasHandle>(null);
  const boundsRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [zoom, setZoom] = useState(1);
  const [topInset, setTopInset] = useState(96);
  const [labelX, setLabelX] = useState<number | undefined>(undefined);

  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [runError, setRunError] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceEvent[] | null>(null);
  const [stdout, setStdout] = useState<string | undefined>(undefined);
  const [truncated, setTruncated] = useState(false);

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
      setRunStatus("done");
    } catch (err) {
      setTrace(null);
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

  // Measure the "Visualizer" label's left edge (relative to the bounds
  // container) once, so the editor's initial position lines up under it
  // when the page is first opened.
  useEffect(() => {
    const label = labelRef.current;
    const bounds = boundsRef.current;
    if (!label || !bounds) return;
    setLabelX(label.getBoundingClientRect().left - bounds.getBoundingClientRect().left);
  }, []);

  return (
    <div ref={boundsRef} className="relative h-full w-full overflow-hidden">
      <InfiniteCanvas ref={canvasRef} onZoomChange={setZoom} />

      <div
        ref={headerRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-4 p-1"
      >
        <div className="pointer-events-none pl-36">
          <span aria-hidden="true" className="invisible block font-mono text-[13px] uppercase tracking-[0.2em]">
            Visualizer
          </span>
          <span
            ref={labelRef}
            className="mt-2 block font-serif text-4xl font-black tracking-tight text-[var(--text-primary)] sm:text-5xl"
            style={{ filter: "drop-shadow(0 2px 16px rgba(0,0,0,0.55))" }}
          >
            Visualizer
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-3">
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
        initialX={labelX}
        onRun={handleRun}
        running={runStatus === "running"}
      />

      <TraceViewer status={runStatus} error={runError} trace={trace} stdout={stdout} truncated={truncated} />

      <span className="matte pointer-events-none absolute bottom-4 left-4 z-10 rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
        Scroll to zoom · Drag to pan
      </span>
    </div>
  );
}
