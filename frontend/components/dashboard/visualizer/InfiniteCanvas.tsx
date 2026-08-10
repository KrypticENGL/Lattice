"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type ReactNode,
} from "react";

export type InfiniteCanvasHandle = {
  resetView: () => void;
};

type View = { x: number; y: number; scale: number };

const MIN_SCALE = 0.2;
const MAX_SCALE = 2.5;
const BASE_STEP = 28;
// FloatingEditor's default width (560, see FloatingEditor.tsx) plus its
// right-edge margin — approximate, since the panel is user-resizable and
// this component has no direct reference to it, but good enough to bias
// the default/reset camera position toward the actual free space.
const EDITOR_RESERVE = 580;

export default forwardRef<
  InfiniteCanvasHandle,
  { onZoomChange?: (scale: number) => void; className?: string; children?: ReactNode }
>(function InfiniteCanvas({ onZoomChange, className, children }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ x: 0, y: 0, scale: 1 });
  const pointer = useRef({ panning: false, id: -1, lastX: 0, lastY: 0 });
  const rafRef = useRef<number | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = container.getBoundingClientRect();
    const pxWidth = Math.round(width * dpr);
    const pxHeight = Math.round(height * dpr);
    if (canvas.width !== pxWidth || canvas.height !== pxHeight) {
      canvas.width = pxWidth;
      canvas.height = pxHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, width, height);

    const { x: ox, y: oy, scale } = view.current;

    // World-space content (e.g. trace diagrams) lives in `layerRef`, a
    // zero-size div anchored at the container's top-left whose transform
    // is kept in lockstep with the background grid's own pan/zoom — same
    // `view.current` read on the same frame, so they can never drift.
    if (layerRef.current) {
      layerRef.current.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`;
    }

    let step = BASE_STEP;
    while (step * scale < 10) step *= 5;
    while (step * scale > 90) step /= 5;

    const startX = -ox / scale;
    const startY = -oy / scale;
    const endX = startX + width / scale;
    const endY = startY + height / scale;

    const firstCol = Math.floor(startX / step) - 1;
    const lastCol = Math.ceil(endX / step) + 1;
    const firstRow = Math.floor(startY / step) - 1;
    const lastRow = Math.ceil(endY / step) + 1;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    const dotR = 1.1;
    for (let col = firstCol; col <= lastCol; col++) {
      for (let row = firstRow; row <= lastRow; row++) {
        const isMajor = col % 5 === 0 && row % 5 === 0;
        ctx.beginPath();
        ctx.fillStyle = isMajor
          ? "rgba(0, 229, 255, 0.16)"
          : "rgba(230, 237, 243, 0.12)";
        ctx.arc(col * step, row * step, isMajor ? dotR * 1.7 : dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.beginPath();
    ctx.fillStyle = "rgba(177, 71, 235, 0.55)";
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }, []);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  const centerView = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const { width, height } = container.getBoundingClientRect();
    // Center on the free space to the left of FloatingEditor, not the
    // raw container width — the editor is right-aligned and eats a
    // real chunk of the right side (~560px default width + margin), so
    // centering on the full width visually skews everything rightward,
    // toward the editor rather than the middle of the sidebar↔editor gap.
    const x = Math.max(width / 2 - EDITOR_RESERVE / 2, width * 0.15);
    view.current = { x, y: height / 2, scale: 1 };
    onZoomChange?.(1);
    scheduleDraw();
  }, [onZoomChange, scheduleDraw]);

  useImperativeHandle(ref, () => ({ resetView: centerView }), [centerView]);

  useEffect(() => {
    centerView();

    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => scheduleDraw());
    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const { x: ox, y: oy, scale } = view.current;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));

      const worldX = (mouseX - ox) / scale;
      const worldY = (mouseY - oy) / scale;

      view.current = {
        x: mouseX - worldX * newScale,
        y: mouseY - worldY * newScale,
        scale: newScale,
      };
      onZoomChange?.(newScale);
      scheduleDraw();
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [onZoomChange, scheduleDraw]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    canvasRef.current?.setPointerCapture(e.pointerId);
    pointer.current = { panning: true, id: e.pointerId, lastX: e.clientX, lastY: e.clientY };
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointer.current.panning || pointer.current.id !== e.pointerId) return;
    const dx = e.clientX - pointer.current.lastX;
    const dy = e.clientY - pointer.current.lastY;
    pointer.current.lastX = e.clientX;
    pointer.current.lastY = e.clientY;
    view.current = { ...view.current, x: view.current.x + dx, y: view.current.y + dy };
    scheduleDraw();
  };

  const endPan = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointer.current.id !== e.pointerId) return;
    pointer.current.panning = false;
    if (canvasRef.current) {
      canvasRef.current.releasePointerCapture(e.pointerId);
      canvasRef.current.style.cursor = "grab";
    }
  };

  return (
    <div ref={containerRef} className={`absolute inset-0 overflow-hidden ${className ?? ""}`}>
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        style={{ cursor: "grab" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      />
      <div
        ref={layerRef}
        className="pointer-events-none absolute left-0 top-0"
        style={{ transformOrigin: "0 0", willChange: "transform" }}
      >
        {children}
      </div>
    </div>
  );
});
