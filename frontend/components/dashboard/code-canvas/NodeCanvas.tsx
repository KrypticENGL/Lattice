"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  NODE_TYPES,
  NODE_HEADER_HEIGHT,
  findPort,
  nodeSize,
  portPosition,
  wireMidpoint,
  wirePath,
  type CanvasEdge,
  type CanvasGraph,
  type CanvasNode,
  type PortSpec,
} from "@/lib/code-canvas/graph";
import type { EdgeStyle } from "@/lib/edge-style";

/** Matches InfiniteCanvas so the two workspaces zoom with the same feel. */
const MIN_SCALE = 0.3;
const MAX_SCALE = 2.2;
const BASE_STEP = 28;
/** Right-hand space the code pane occupies, so "reset view" frames the
 * graph in the gap the user can actually see rather than under the panel. */
const DEFAULT_RIGHT_INSET = 560;
/** Left-hand space the block palette occupies (200px wide at left-2, plus
 * a little air). The palette only covers the lower part of that column, so
 * reserving the whole strip is deliberately conservative — a block half
 * behind the palette is as good as invisible, and losing a bit of usable
 * width costs nothing when the alternative is a node the user can't see. */
const DEFAULT_LEFT_INSET = 216;
/** How far below the header the canvas takes to come back to fully drawn.
 * The band itself is hidden outright — the pills sit at its bottom edge,
 * so anything still half-painted there is exactly what makes them hard to
 * read — and this is the run-off underneath, long enough that a block
 * sliding up into it dissolves rather than meeting a hard line. */
const HEADER_FADE_LENGTH = 72;
/** Breathing room between a spawned block and the edge of the visible
 * area, so "just inside the viewport" doesn't mean "flush against it". */
const SPAWN_MARGIN = 24;

export type Selection = { type: "node" | "edge"; id: string } | null;

export type NodeCanvasHandle = {
  resetView: () => void;
  /** Frames every node currently on the canvas. */
  fitToGraph: () => void;
  /** Viewport coordinates → world coordinates, for dropping a block where
   * the pointer actually let go of it. */
  screenToWorld: (clientX: number, clientY: number) => { x: number; y: number };
  /** Where a palette click should drop a new node: the middle of the
   * visible (un-covered) area, in world space. */
  viewportCenter: (rightInset?: number) => { x: number; y: number };
  /** The visible, un-covered area in world space, inset by a margin — the
   * box a newly spawned block must land inside. Everything outside this is
   * either off-screen or underneath the palette or the code pane. */
  viewportBounds: (rightInset?: number) => {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
};

type View = { x: number; y: number; scale: number };

type Props = {
  graph: CanvasGraph;
  selection: Selection;
  rightInset?: number;
  topInset?: number;
  /** How wires are routed — see lib/edge-style.ts. */
  edgeStyle?: EdgeStyle;
  /** The node that was just added, so it can play its entrance. Only ever
   * one: an id that has already animated stays here harmlessly, since a
   * CSS animation runs on mount and a re-render doesn't restart it. */
  spawnedId?: string | null;
  onSelect: (selection: Selection) => void;
  onNodeMove: (id: string, x: number, y: number) => void;
  onFieldChange: (id: string, field: string, value: string) => void;
  onConnect: (from: string, fromPort: string, to: string, toPort: string) => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
  /** True while a block is being dragged out of the palette, so the canvas
   * can show it's a live drop target. */
  dropping?: boolean;
  onZoomChange?: (scale: number) => void;
  onRejectConnection?: (reason: string) => void;
};

export default forwardRef<NodeCanvasHandle, Props>(function NodeCanvas(
  {
    graph,
    selection,
    rightInset = DEFAULT_RIGHT_INSET,
    topInset = 0,
    edgeStyle = "curved",
    onSelect,
    onNodeMove,
    onFieldChange,
    onConnect,
    onDeleteNode,
    onDeleteEdge,
    dropping = false,
    spawnedId = null,
    onZoomChange,
    onRejectConnection,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ x: 240, y: 200, scale: 1 });
  const rafRef = useRef<number | null>(null);

  /** Live wire being dragged out of an output handle, in world space. */
  const [pending, setPending] = useState<
    { nodeId: string; portId: string; x: number; y: number; overNodeId: string | null } | null
  >(null);

  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  /* ---------------------------------------------------------------- */
  /* Grid + camera                                                     */
  /* ---------------------------------------------------------------- */

  const draw = useCallback(() => {
    const canvas = gridRef.current;
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
    if (worldRef.current) {
      worldRef.current.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`;
    }

    let step = BASE_STEP;
    while (step * scale < 10) step *= 5;
    while (step * scale > 90) step /= 5;

    const firstCol = Math.floor(-ox / scale / step) - 1;
    const lastCol = Math.ceil((-ox / scale + width / scale) / step) + 1;
    const firstRow = Math.floor(-oy / scale / step) - 1;
    const lastRow = Math.ceil((-oy / scale + height / scale) / step) + 1;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    const dotR = 1.1;
    for (let col = firstCol; col <= lastCol; col++) {
      for (let row = firstRow; row <= lastRow; row++) {
        const isMajor = col % 5 === 0 && row % 5 === 0;
        ctx.beginPath();
        ctx.fillStyle = isMajor ? "rgba(224, 130, 77, 0.18)" : "rgba(230, 237, 243, 0.11)";
        ctx.arc(col * step, row * step, isMajor ? dotR * 1.7 : dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }, []);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const { x, y, scale } = view.current;
    return {
      x: ((clientX - (rect?.left ?? 0)) - x) / scale,
      y: ((clientY - (rect?.top ?? 0)) - y) / scale,
    };
  }, []);

  const viewportCenter = useCallback(
    (inset = rightInset) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const width = rect?.width ?? window.innerWidth;
      const height = rect?.height ?? window.innerHeight;
      const usable = Math.max(240, width - inset);
      const { x, y, scale } = view.current;
      return { x: (usable / 2 - x) / scale, y: ((height + topInset) / 2 - y) / scale };
    },
    [rightInset, topInset],
  );

  const viewportBounds = useCallback(
    (inset = rightInset) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const width = rect?.width ?? window.innerWidth;
      const height = rect?.height ?? window.innerHeight;
      const { x, y, scale } = view.current;
      // Screen-space edges of the area the user can actually see into,
      // then the same inverse transform screenToWorld uses. The margin is
      // applied in screen pixels before the divide, so it stays a constant
      // visual gap rather than shrinking as you zoom in.
      const left = DEFAULT_LEFT_INSET + SPAWN_MARGIN;
      const right = Math.max(left + 240, width - inset - SPAWN_MARGIN);
      const top = topInset + SPAWN_MARGIN;
      const bottom = Math.max(top + 160, height - SPAWN_MARGIN);
      return {
        minX: (left - x) / scale,
        maxX: (right - x) / scale,
        minY: (top - y) / scale,
        maxY: (bottom - y) / scale,
      };
    },
    [rightInset, topInset],
  );

  const frame = useCallback(
    (bounds: { minX: number; minY: number; maxX: number; maxY: number } | null) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const width = rect?.width ?? window.innerWidth;
      const height = rect?.height ?? window.innerHeight;
      const usableWidth = Math.max(240, width - rightInset);
      const usableHeight = Math.max(240, height - topInset);

      if (!bounds) {
        view.current = { x: usableWidth / 2 - 120, y: usableHeight / 2 + topInset - 80, scale: 1 };
      } else {
        const graphWidth = Math.max(1, bounds.maxX - bounds.minX);
        const graphHeight = Math.max(1, bounds.maxY - bounds.minY);
        const scale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, Math.min((usableWidth - 120) / graphWidth, (usableHeight - 120) / graphHeight, 1)),
        );
        const cx = (bounds.minX + bounds.maxX) / 2;
        const cy = (bounds.minY + bounds.maxY) / 2;
        view.current = {
          x: usableWidth / 2 - cx * scale,
          y: topInset + usableHeight / 2 - cy * scale,
          scale,
        };
      }
      onZoomChange?.(view.current.scale);
      scheduleDraw();
    },
    [onZoomChange, rightInset, scheduleDraw, topInset],
  );

  const graphBounds = useCallback(() => {
    if (graph.nodes.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of graph.nodes) {
      const { width, height } = nodeSize(node.kind);
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + width);
      maxY = Math.max(maxY, node.y + height);
    }
    return { minX, minY, maxX, maxY };
  }, [graph.nodes]);

  useImperativeHandle(
    ref,
    () => ({
      resetView: () => frame(null),
      fitToGraph: () => frame(graphBounds()),
      screenToWorld,
      viewportCenter,
      viewportBounds,
    }),
    [frame, graphBounds, screenToWorld, viewportCenter, viewportBounds],
  );

  useEffect(() => {
    frame(null);
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => scheduleDraw());
    observer.observe(container);
    return () => observer.disconnect();
    // Runs once: later reframing is explicit (Reset view / Fit).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      // Ctrl/⌘+wheel (and a trackpad pinch, which arrives as the same
      // event) belongs to the browser's own zoom. The canvas has the
      // plain wheel to itself, so there's nothing to gain from taking
      // this one too — and taking it is what left the page impossible to
      // zoom out of once its chrome no longer fit.
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const { x, y, scale } = view.current;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * Math.exp(-e.deltaY * 0.0015)));
      view.current = {
        x: px - ((px - x) / scale) * next,
        y: py - ((py - y) / scale) * next,
        scale: next,
      };
      onZoomChange?.(next);
      scheduleDraw();
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [onZoomChange, scheduleDraw]);

  /* ---------------------------------------------------------------- */
  /* Panning                                                           */
  /* ---------------------------------------------------------------- */

  const handleBackgroundPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Middle-drag pans from anywhere; left-drag only from empty space, so
      // it stays available for node dragging and marquee-free selection.
      const onBackground = e.target === containerRef.current || e.target === gridRef.current;
      if (e.button === 1) e.preventDefault();
      else if (e.button !== 0 || !onBackground) return;

      if (onBackground && e.button === 0) onSelect(null);
      const startX = e.clientX;
      const startY = e.clientY;
      const origin = { ...view.current };
      const container = containerRef.current;
      if (container) container.style.cursor = "grabbing";

      const onMove = (ev: PointerEvent) => {
        view.current = {
          ...view.current,
          x: origin.x + (ev.clientX - startX),
          y: origin.y + (ev.clientY - startY),
        };
        scheduleDraw();
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (container) container.style.cursor = "";
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [onSelect, scheduleDraw],
  );

  /* ---------------------------------------------------------------- */
  /* Node dragging                                                     */
  /* ---------------------------------------------------------------- */

  const moveRafRef = useRef<number | null>(null);
  const handleNodePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, node: CanvasNode) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
      e.stopPropagation();
      onSelect({ type: "node", id: node.id });

      const startX = e.clientX;
      const startY = e.clientY;
      const origin = { x: node.x, y: node.y };
      let latest = origin;

      const onMove = (ev: PointerEvent) => {
        const scale = view.current.scale;
        latest = {
          x: origin.x + (ev.clientX - startX) / scale,
          y: origin.y + (ev.clientY - startY) / scale,
        };
        if (moveRafRef.current != null) return;
        moveRafRef.current = requestAnimationFrame(() => {
          moveRafRef.current = null;
          onNodeMove(node.id, Math.round(latest.x), Math.round(latest.y));
        });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (moveRafRef.current != null) {
          cancelAnimationFrame(moveRafRef.current);
          moveRafRef.current = null;
        }
        onNodeMove(node.id, Math.round(latest.x), Math.round(latest.y));
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [onNodeMove, onSelect],
  );

  /* ---------------------------------------------------------------- */
  /* Wiring                                                            */
  /* ---------------------------------------------------------------- */

  /** Which node (if any) sits under a world-space point. Hit-tested against
   * the model rather than the DOM so it still works while the pointer is
   * captured by the handle that started the drag. */
  const nodeAt = useCallback(
    (x: number, y: number) => {
      for (let i = graph.nodes.length - 1; i >= 0; i--) {
        const node = graph.nodes[i];
        const { width, height } = nodeSize(node.kind);
        if (x >= node.x && x <= node.x + width && y >= node.y && y <= node.y + height) return node;
      }
      return null;
    },
    [graph.nodes],
  );

  /** The input handle of `target` closest to where the wire was dropped —
   * so dropping anywhere on a tree node still lands on a sensible port. */
  const nearestInput = useCallback((target: CanvasNode, x: number, y: number) => {
    const inputs = NODE_TYPES[target.kind].inputs;
    if (inputs.length === 0) return null;
    let best = inputs[0];
    let bestDistance = Infinity;
    for (const port of inputs) {
      const at = portPosition(target, port);
      const distance = Math.hypot(at.x - x, at.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = port;
      }
    }
    return best;
  }, []);

  const wireRafRef = useRef<number | null>(null);
  const handlePortPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, node: CanvasNode, port: PortSpec) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const start = portPosition(node, port);
      setPending({ nodeId: node.id, portId: port.id, x: start.x, y: start.y, overNodeId: null });

      let cursor = start;
      const onMove = (ev: PointerEvent) => {
        cursor = screenToWorld(ev.clientX, ev.clientY);
        if (wireRafRef.current != null) return;
        wireRafRef.current = requestAnimationFrame(() => {
          wireRafRef.current = null;
          const over = nodeAt(cursor.x, cursor.y);
          setPending((prev) =>
            prev
              ? {
                  ...prev,
                  x: cursor.x,
                  y: cursor.y,
                  overNodeId: over && over.id !== prev.nodeId ? over.id : null,
                }
              : prev,
          );
        });
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (wireRafRef.current != null) {
          cancelAnimationFrame(wireRafRef.current);
          wireRafRef.current = null;
        }
        setPending(null);

        const drop = screenToWorld(ev.clientX, ev.clientY);
        const target = nodeAt(drop.x, drop.y);
        if (!target || target.id === node.id) return;
        const inPort = nearestInput(target, drop.x, drop.y);
        if (!inPort) {
          onRejectConnection?.(`A ${NODE_TYPES[target.kind].label.toLowerCase()} has no incoming handle.`);
          return;
        }
        onConnect(node.id, port.id, target.id, inPort.id);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [nearestInput, nodeAt, onConnect, onRejectConnection, screenToWorld],
  );

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  const wires = useMemo(() => {
    const drawn: {
      edge: CanvasEdge;
      d: string;
      mid: { x: number; y: number };
      color: string;
      label: string;
    }[] = [];
    for (const edge of graph.edges) {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      if (!from || !to) continue;
      const fromPort = findPort(from.kind, edge.fromPort);
      const toPort = findPort(to.kind, edge.toPort);
      if (!fromPort || !toPort) continue;
      const a = portPosition(from, fromPort);
      const b = portPosition(to, toPort);
      drawn.push({
        edge,
        d: wirePath(a, fromPort.side, b, toPort.side, edgeStyle),
        mid: wireMidpoint(a, fromPort.side, b, toPort.side, edgeStyle),
        color: NODE_TYPES[from.kind].accent,
        label: fromPort.label,
      });
    }
    return drawn;
  }, [graph.edges, nodeById, edgeStyle]);

  const pendingWire = useMemo(() => {
    if (!pending) return null;
    const node = nodeById.get(pending.nodeId);
    if (!node) return null;
    const port = findPort(node.kind, pending.portId);
    if (!port) return null;
    const a = portPosition(node, port);
    return {
      d: wirePath(a, port.side, { x: pending.x, y: pending.y }, "left", edgeStyle),
      color: NODE_TYPES[node.kind].accent,
    };
  }, [nodeById, pending, edgeStyle]);

  // The header floats over the canvas with nothing behind it, so a block
  // that drifts up underneath it competes with the title and the pills for
  // the same pixels. Rather than give the header a panel of its own — which
  // would cost the canvas that strip permanently — the canvas fades its own
  // contents out inside the band the header occupies. Blocks stay where they
  // are and stay draggable; they just stop being painted over the text.
  const headerFade = useMemo(() => {
    if (topInset <= 0) return undefined;
    const mid = Math.round(topInset + HEADER_FADE_LENGTH / 2);
    const end = topInset + HEADER_FADE_LENGTH;
    // The middle stop bends the ramp: a plain two-stop gradient reads as a
    // visible grey edge sweeping down the block, where this lets it come
    // back slowly and then commit.
    return (
      "linear-gradient(to bottom," +
      ` transparent 0px, transparent ${topInset}px,` +
      ` rgba(0,0,0,0.35) ${mid}px, #000 ${end}px)`
    );
  }, [topInset]);

  return (
    <div
      ref={containerRef}
      onPointerDown={handleBackgroundPointerDown}
      className="absolute inset-0 touch-none overflow-hidden"
      style={{ cursor: "grab" }}
      data-tour="canvas"
    >
      <canvas ref={gridRef} className="pointer-events-none absolute inset-0 h-full w-full" />

      {dropping && (
        <div className="pointer-events-none absolute inset-3 rounded-3xl border-2 border-dashed border-[var(--accent-primary)]/60" />
      )}

      {/* Un-transformed, so the fade stays pinned to the header rather than
        * panning and scaling with the graph underneath it. Transparent to
        * the pointer, since it covers the whole canvas and a press on empty
        * space has to reach the container to pan and to clear the selection;
        * the layer below turns hit-testing back on for the graph itself. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ maskImage: headerFade, WebkitMaskImage: headerFade }}
      >
        <div
          ref={worldRef}
          className="pointer-events-auto absolute left-0 top-0"
          style={{ transformOrigin: "0 0", willChange: "transform" }}
        >
          <svg
            width="1"
            height="1"
            className="absolute left-0 top-0"
            style={{ overflow: "visible", pointerEvents: "none" }}
          >
            <defs>
              <marker
                id="lattice-wire-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
              </marker>
            </defs>

            {wires.map(({ edge, d, mid, color, label }) => {
              const active = selection?.type === "edge" && selection.id === edge.id;
              return (
                <g key={edge.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={18}
                    style={{ pointerEvents: "stroke", cursor: "pointer" }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onSelect({ type: "edge", id: edge.id });
                    }}
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={active ? 2.6 : 1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    markerEnd="url(#lattice-wire-arrow)"
                    opacity={active ? 1 : 0.75}
                    style={{ transition: "stroke-width 120ms ease-out, opacity 120ms ease-out" }}
                  />
                  {/* The dash that travels the wire, showing which way the
                    * data actually flows rather than only which end the
                    * arrow is on. Same `d` as the line under it, so it can
                    * never drift off the wire it belongs to. */}
                  <path
                    className="wire-flow"
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={active ? 3.2 : 2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pointerEvents="none"
                  />
                  {active && (
                    <g
                      transform={`translate(${mid.x}, ${mid.y})`}
                      style={{ pointerEvents: "auto", cursor: "pointer" }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onDeleteEdge(edge.id);
                      }}
                    >
                      <text
                        y={-14}
                        textAnchor="middle"
                        fill="var(--text-secondary)"
                        style={{ font: "500 10px var(--font-geist-mono), monospace", letterSpacing: "0.08em" }}
                      >
                        {label.toUpperCase()}
                      </text>
                      <circle r={9} fill="var(--bg-elevated)" stroke={color} strokeWidth={1.2} />
                      <path
                        d="M -3 -3 L 3 3 M 3 -3 L -3 3"
                        stroke="var(--text-primary)"
                        strokeWidth={1.6}
                        strokeLinecap="round"
                      />
                    </g>
                  )}
                </g>
              );
            })}

            {pendingWire && (
              <path
                d={pendingWire.d}
                fill="none"
                stroke={pendingWire.color}
                strokeWidth={2}
                strokeDasharray="6 5"
                strokeLinecap="round"
              />
            )}
          </svg>

          {graph.nodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              selected={selection?.type === "node" && selection.id === node.id}
              spawned={node.id === spawnedId}
              wiring={!!pending}
              highlighted={pending?.overNodeId === node.id}
              onPointerDown={handleNodePointerDown}
              onPortPointerDown={handlePortPointerDown}
              onFieldChange={onFieldChange}
              onDelete={onDeleteNode}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* One block                                                           */
/* ------------------------------------------------------------------ */

const NodeCard = memo(function NodeCard({
  node,
  selected,
  spawned,
  wiring,
  highlighted,
  onPointerDown,
  onPortPointerDown,
  onFieldChange,
  onDelete,
}: {
  node: CanvasNode;
  selected: boolean;
  /** Just added from the palette — plays the arrival animation once. */
  spawned: boolean;
  wiring: boolean;
  highlighted: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>, node: CanvasNode) => void;
  onPortPointerDown: (e: React.PointerEvent<HTMLDivElement>, node: CanvasNode, port: PortSpec) => void;
  onFieldChange: (id: string, field: string, value: string) => void;
  onDelete: (id: string) => void;
}) {
  const spec = NODE_TYPES[node.kind];
  const { width, height } = nodeSize(node.kind);
  const canAccept = wiring && spec.inputs.length > 0;

  return (
    <div
      onPointerDown={(e) => onPointerDown(e, node)}
      className={`group glass-flat absolute select-none rounded-xl${spawned ? " node-spawn" : ""}`}
      style={{
        // Restated inline because `.glass-flat` carries `position: relative`
        // and is emitted after Tailwind's own utilities in the same layer,
        // so it beats `absolute` on source order (see the positioning
        // caveat in globals.css). Without this the node lays out in normal
        // flow and *then* shifts by left/top, drifting away from the
        // (node.x, node.y) the wire router draws to.
        position: "absolute",
        left: node.x,
        top: node.y,
        width,
        height,
        cursor: "grab",
        // `.glass-flat` owns the fill, the border width and the whole
        // shadow stack; only the two things that vary per node are set
        // here. `borderColor` rather than `border` on purpose — the
        // shorthand would reset the width and style the material set.
        borderColor: selected ? spec.accent : undefined,
        // Selection and wiring rings stack *in front of* the material
        // rather than replacing it, which is what keeps the specular rim
        // and the seat shadow on a node while it is selected.
        boxShadow: selected
          ? `0 0 0 1px ${spec.accent}, 0 18px 40px -20px rgba(0,0,0,0.9), var(--glass-flat-shadow)`
          : highlighted
            ? `0 0 0 2px ${spec.accent}, var(--glass-flat-shadow)`
            : undefined,
        opacity: wiring && !canAccept ? 0.55 : 1,
        transition: "box-shadow 140ms ease-out, opacity 140ms ease-out",
      }}
    >
      <div
        className="flex items-center gap-1.5 rounded-t-xl px-2.5"
        style={{
          height: NODE_HEADER_HEIGHT,
          background: `color-mix(in srgb, ${spec.accent} 16%, transparent)`,
          borderBottom: `1px solid ${spec.fields.length ? "var(--hairline)" : "transparent"}`,
        }}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: spec.accent }} />
        <span className="min-w-0 flex-1 truncate font-serif text-[11px] font-semibold text-[var(--text-primary)]">
          {spec.label}
        </span>
        <button
          type="button"
          data-no-drag
          aria-label={`Delete ${spec.label}`}
          onClick={() => onDelete(node.id)}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] opacity-0 transition-opacity hover:bg-white/10 hover:text-[var(--text-primary)] group-hover:opacity-100"
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M1 1l8 8M9 1l-8 8" />
          </svg>
        </button>
      </div>

      {spec.fields.length > 0 && (
        <div className="flex flex-col gap-1 px-2.5 py-1.5">
          {spec.fields.map((field) =>
            field.multiline ? (
              <textarea
                key={field.id}
                data-no-drag
                rows={2}
                value={node.fields[field.id] ?? ""}
                placeholder={field.placeholder}
                onChange={(e) => onFieldChange(node.id, field.id, e.target.value)}
                className="scrollbar-hide w-full resize-none rounded-md border border-[var(--hairline)] bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[10px] leading-tight text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/60 focus:border-[var(--accent-secondary)] focus:outline-none"
              />
            ) : (
              <label key={field.id} className="flex items-center gap-1.5">
                <span className="w-10 shrink-0 font-mono text-[8px] uppercase tracking-wider text-[var(--text-secondary)]">
                  {field.label}
                </span>
                <input
                  data-no-drag
                  value={node.fields[field.id] ?? ""}
                  placeholder={field.placeholder}
                  onChange={(e) => onFieldChange(node.id, field.id, e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-[var(--hairline)] bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[10px] leading-tight text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/60 focus:border-[var(--accent-secondary)] focus:outline-none"
                />
              </label>
            ),
          )}
        </div>
      )}

      {spec.inputs.map((port) => (
        <Handle key={`in-${port.id}`} port={port} accent={spec.accent} kind="in" active={canAccept} />
      ))}
      {spec.outputs.map((port) => (
        <Handle
          key={`out-${port.id}`}
          port={port}
          accent={spec.accent}
          kind="out"
          onPointerDown={(e) => onPortPointerDown(e, node, port)}
        />
      ))}
    </div>
  );
});

/** A connection point. Outputs are grab targets (drag a wire out of them);
 * inputs are drop targets, so they're deliberately not interactive — a wire
 * lands anywhere on the card and snaps to the nearest one. */
function Handle({
  port,
  accent,
  kind,
  active,
  onPointerDown,
}: {
  port: PortSpec;
  accent: string;
  kind: "in" | "out";
  active?: boolean;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const position: React.CSSProperties = {};
  if (port.side === "left") {
    position.left = 0;
    position.top = `${port.offset * 100}%`;
  } else if (port.side === "right") {
    position.left = "100%";
    position.top = `${port.offset * 100}%`;
  } else if (port.side === "top") {
    position.left = `${port.offset * 100}%`;
    position.top = 0;
  } else {
    position.left = `${port.offset * 100}%`;
    position.top = "100%";
  }

  const labelSide =
    port.side === "right"
      ? { left: 16, top: -7 }
      : port.side === "left"
        ? { right: 16, top: -7 }
        : port.side === "bottom"
          ? { left: -12, top: 12 }
          : { left: -12, top: -20 };

  return (
    <div
      data-no-drag={kind === "out" ? true : undefined}
      onPointerDown={onPointerDown}
      className="absolute"
      style={{ ...position, transform: "translate(-50%, -50%)", pointerEvents: kind === "out" ? "auto" : "none" }}
    >
      <div
        className="group/handle relative rounded-full transition-transform hover:scale-125"
        style={{
          width: kind === "out" ? 12 : 10,
          height: kind === "out" ? 12 : 10,
          background: kind === "out" ? accent : "var(--bg-elevated)",
          border: `2px solid ${kind === "out" ? "var(--bg-base)" : active ? accent : "var(--hairline-strong)"}`,
          boxShadow: kind === "out" ? `0 0 0 1px ${accent}` : active ? `0 0 12px ${accent}` : "none",
          cursor: kind === "out" ? "crosshair" : "default",
        }}
      >
        <span
          className="pointer-events-none absolute whitespace-nowrap font-mono text-[8px] uppercase tracking-wider text-[var(--text-secondary)] opacity-0 transition-opacity duration-150 group-hover:opacity-70 group-hover/handle:opacity-100"
          style={labelSide}
        >
          {port.label}
        </span>
      </div>
    </div>
  );
}
