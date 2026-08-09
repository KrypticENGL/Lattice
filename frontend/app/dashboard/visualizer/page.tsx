"use client";

import { useCallback, useRef, useState } from "react";
import InfiniteCanvas, { type InfiniteCanvasHandle } from "@/components/dashboard/visualizer/InfiniteCanvas";
import FloatingEditor from "@/components/dashboard/visualizer/FloatingEditor";

export default function VisualizerPage() {
  const canvasRef = useRef<InfiniteCanvasHandle>(null);
  const boundsRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  const handleReset = useCallback(() => {
    canvasRef.current?.resetView();
  }, []);

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            Visualizer
          </span>
          <h1 className="text-balance mt-2 font-serif text-4xl font-black tracking-tight text-[var(--text-primary)] sm:text-5xl">
            Trace it on the canvas.
          </h1>
        </div>

        <div className="flex items-center gap-3">
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

      <div
        ref={boundsRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--hairline)]"
      >
        <InfiniteCanvas ref={canvasRef} onZoomChange={setZoom} />
        <FloatingEditor boundsRef={boundsRef} />

        <span className="matte pointer-events-none absolute bottom-4 left-4 z-10 rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
          Scroll to zoom · Drag to pan
        </span>
      </div>
    </div>
  );
}
