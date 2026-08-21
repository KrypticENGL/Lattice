"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type ReactNode,
} from "react";

/** World-space extent of whatever is being framed (node centres are enough —
 * padding would shift both edges equally and so never moves the midpoint). */
export type WorldBounds = { minX: number; minY: number; maxX: number; maxY: number };

/** Screen-space edges of `boundsRef` that are covered by floating chrome and
 * so must not be counted as usable space when centring — the editor panel on
 * the right, the header overlay on top. */
export type ViewportInsets = { left?: number; right?: number; top?: number; bottom?: number };

export type InfiniteCanvasHandle = {
  resetView: () => void;
  centerOn: (bounds: WorldBounds, insets?: ViewportInsets) => void;
};

type View = { x: number; y: number; scale: number };

// Matches DiagramView's own node/edge transitions, so a recentre and the
// layout shift that triggered it read as one motion instead of two.
const RECENTER_MS = 300;

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

  // A recentre is a tween rather than a jump, and any direct manipulation
  // (wheel, drag, Reset view) cancels it mid-flight — the user's own input
  // must always win over an animation they didn't ask for.
  const animRef = useRef<number | null>(null);
  const cancelViewAnimation = useCallback(() => {
    if (animRef.current != null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  }, []);

  const centerOn = useCallback(
    (bounds: WorldBounds, insets: ViewportInsets = {}) => {
      const container = containerRef.current;
      if (!container) return;
      const { width, height } = container.getBoundingClientRect();
      const { left = 0, right = 0, top = 0, bottom = 0 } = insets;

      // The free rectangle between the sidebar (already excluded by the
      // dashboard layout's own left padding) and the editor's left edge.
      // Clamped so a wide editor over a narrow window can't invert it.
      const usableWidth = Math.max(1, width - left - right);
      const usableHeight = Math.max(1, height - top - bottom);
      const targetX = left + usableWidth / 2;
      const targetY = top + usableHeight / 2;

      // Zoom is deliberately preserved: the user's chosen scale is theirs to
      // keep, so this only ever pans.
      const { scale } = view.current;
      const worldX = (bounds.minX + bounds.maxX) / 2;
      const worldY = (bounds.minY + bounds.maxY) / 2;
      const to = { x: targetX - worldX * scale, y: targetY - worldY * scale };

      cancelViewAnimation();
      const from = { x: view.current.x, y: view.current.y };
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        view.current = { ...view.current, ...to };
        scheduleDraw();
        return;
      }

      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / RECENTER_MS);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        view.current = { ...view.current, x: from.x + dx * eased, y: from.y + dy * eased };
        draw();
        animRef.current = t < 1 ? requestAnimationFrame(tick) : null;
      };
      animRef.current = requestAnimationFrame(tick);
    },
    [cancelViewAnimation, draw, scheduleDraw],
  );

  const centerView = useCallback(() => {
    cancelViewAnimation();
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
  }, [onZoomChange, scheduleDraw, cancelViewAnimation]);

  useImperativeHandle(ref, () => ({ resetView: centerView, centerOn }), [centerView, centerOn]);

  useEffect(() => {
    centerView();

    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => scheduleDraw());
    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => cancelViewAnimation, [cancelViewAnimation]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      // Ctrl/⌘+wheel (and a trackpad pinch, which arrives as the same
      // event) belongs to the browser's own zoom. The canvas has the
      // plain wheel to itself, so there's nothing to gain from taking
      // this one too — and taking it is what left the page impossible to
      // zoom out of once its chrome no longer fit.
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      cancelViewAnimation();
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
  }, [onZoomChange, scheduleDraw, cancelViewAnimation]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    cancelViewAnimation();
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
