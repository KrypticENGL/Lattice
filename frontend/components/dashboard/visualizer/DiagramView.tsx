"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  animate as animateValue,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "framer-motion";
import type { Diagram, DiagramNode } from "@/lib/shape-detection";
import { circleEdgePath, type EdgeStyle } from "@/lib/edge-style";

const NODE_RADIUS = 22;
const MAX_LABEL_LENGTH = 6;

/** How long a node takes to slide to a new layout slot when a trace step
 * moves it. */
const PLACE_MS = 300;

// Shades of orange only — from pale peach through mid amber to deep rust —
// kept distinguishable enough to tell adjacent nodes apart without
// reaching for an unrelated hue.
const PALETTE = [
  "var(--accent-secondary)",
  "var(--accent-primary)",
  "#f7b267",
  "#c2703d",
  "#e8993d",
  "#a85c2e",
];

/** What the entry point of each shape is actually called, so the marker on
 * it says "head" over a list and "root" over a tree rather than picking one
 * word and being wrong two thirds of the time. */
const ROOT_LABEL: Record<Diagram["kind"], string> = {
  "linked-list": "head",
  tree: "root",
  graph: "start",
};

function truncateLabel(label: string) {
  return label.length > MAX_LABEL_LENGTH ? `${label.slice(0, MAX_LABEL_LENGTH - 1)}…` : label;
}

type Motion2D = { cx: MotionValue<number>; cy: MotionValue<number> };

/** One node's circle + label + drag handling. Position lives in
 * `useMotionValue` — Framer's own hook, specifically designed to be read
 * during render and mutated outside it (`.set()` in a handler), which is
 * why this is a dedicated component per node rather than a hand-rolled
 * `useRef`/`useMemo` Map in the parent: this project's lint rules
 * (React-Compiler-safety) forbid reading or mutating a plain ref/memo
 * during render, and a Map keyed by dynamic node ids can't be expressed
 * as one `useMotionValue` call in the parent (hooks can't run in a
 * loop). Reports its motion values up to the parent on mount so edges
 * (owned by the parent, need *two* nodes' positions) can reference the
 * exact same values — never a second, separate position store to drift
 * out of sync with this one. */
function DiagramNodeView({
  node,
  color,
  zoom,
  isRoot,
  rootLabel,
  onReady,
}: {
  node: DiagramNode;
  color: string;
  zoom: number;
  /** True for the structure's entry point — see `Diagram.roots`. */
  isRoot: boolean;
  rootLabel: string;
  onReady: (id: string, motion: Motion2D) => void;
}) {
  // A node starts life at the position the layout computed for it, and
  // that is the only position it is ever drawn at. It used to spawn at a
  // random point on the lattice and slide in, which was meant to make an
  // arrival legible but did the opposite: on a canvas restored into the
  // middle of a saved trace *every* node is new, so the whole structure
  // assembled itself out of scattered debris, and any node whose entrance
  // was interrupted simply stayed where it had been flung. A drawing
  // should read correctly in its first painted frame.
  const cx = useMotionValue(node.x);
  const cy = useMotionValue(node.y);
  const pinnedRef = useRef(false);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  // Registering with the parent is what makes this node's edges eligible
  // to render — DiagramView only draws an edge once both of its endpoints
  // have reported a position. Immediate, with no beat to wait out: the
  // node is already where it belongs, so its edges are correct too.
  useEffect(() => {
    onReady(node.id, { cx, cy });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animate toward a freshly computed layout position — an ordinary
  // relayout tween when a new trace step moves this node. Skipped once the
  // user has dragged it (pinnedRef), so a manual placement sticks for the
  // rest of the run instead of snapping back on the next step. On mount
  // this resolves to a tween from the node's position to itself, which
  // costs nothing and is what keeps the first frame correct.
  useEffect(() => {
    if (pinnedRef.current) return;
    const cxControls = animateValue(cx, node.x, { duration: PLACE_MS / 1000 });
    const cyControls = animateValue(cy, node.y, { duration: PLACE_MS / 1000 });
    return () => {
      cxControls.stop();
      cyControls.stop();
    };
  }, [node.x, node.y, cx, cy]);

  function handlePointerDown(e: React.PointerEvent<SVGCircleElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pinnedRef.current = true;
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: cx.get(), originY: cy.get() };
  }

  function handlePointerMove(e: React.PointerEvent<SVGCircleElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    cx.set(drag.originX + (e.clientX - drag.startX) / zoom);
    cy.set(drag.originY + (e.clientY - drag.startY) / zoom);
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  return (
    // One fade for the whole node, and static geometry underneath it. The
    // circle used to animate its own radius up from zero, which meant an
    // entrance that never finished — a tab backgrounded mid-tween throttles
    // rAF and freezes it — left a node stranded at whatever fraction of its
    // size it had reached. Anything that has to be interruptible should
    // resolve to the correct drawing with the animation removed, so only
    // opacity moves and the shape is right from the first frame.
    <motion.g
      style={{ x: cx, y: cy }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* The entry point, ringed and named. Drawn before the node itself
        * so the halo sits behind it, and non-interactive so it never
        * steals the drag from the circle it is marking. */}
      {isRoot && (
        <g pointerEvents="none">
          <circle r={NODE_RADIUS + 6} fill="none" stroke="var(--accent-primary)" strokeWidth={1.5} opacity={0.85} />
          <text
            y={-(NODE_RADIUS + 15)}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize={9}
            letterSpacing="0.18em"
            fill="var(--accent-primary)"
          >
            {rootLabel.toUpperCase()}
          </text>
        </g>
      )}

      <circle
        r={NODE_RADIUS}
        fill={color}
        className="cursor-grab active:cursor-grabbing"
        style={{ pointerEvents: "all", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-mono)"
        fontSize={11}
        fill="var(--bg-base)"
        pointerEvents="none"
      >
        {truncateLabel(node.label)}
      </text>
    </motion.g>
  );
}

/** Renders a `Diagram` (lib/shape-detection.ts) as an animated, draggable
 * SVG node-link drawing — the same shared component for all three shape
 * kinds, since they only differ in the (x, y) layout already baked into
 * `diagram.nodes`.
 *
 * Meant to be rendered as a child of InfiniteCanvas, inside its pan/zoom
 * layer — node coordinates are raw world-space units, not fitted to a
 * self-contained viewBox, so the canvas's own camera is what moves and
 * scales them, not this component. A 1×1 SVG with overflow visible is the
 * standard trick for drawing freely around a (0, 0) anchor without sizing
 * to content — width/height of exactly 0 would disable rendering
 * entirely per the SVG spec, so it has to be non-zero. */
export default function DiagramView({
  diagram,
  zoom = 1,
  edgeStyle = "curved",
}: {
  diagram: Diagram;
  zoom?: number;
  edgeStyle?: EdgeStyle;
}) {
  // Populated by each DiagramNodeView reporting its own motion values on
  // mount — real React state (not a mutated-in-place ref/memo) so edges
  // reading it below re-render correctly once a node registers.
  const [nodeMotions, setNodeMotions] = useState<Map<string, Motion2D>>(new Map());

  const handleReady = useCallback((id: string, motion: Motion2D) => {
    setNodeMotions((prev) => {
      if (prev.get(id) === motion) return prev;
      const next = new Map(prev);
      next.set(id, motion);
      return next;
    });
  }, []);

  const roots = new Set(diagram.roots);

  return (
    <svg width={1} height={1} className="overflow-visible" style={{ position: "absolute", left: 0, top: 0 }}>
      <defs>
        {/* `context-stroke` makes the head take the colour of whatever
          * path is using it, so the arrow always matches its own edge. */}
        <marker
          id="diagram-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
        </marker>
      </defs>

      {diagram.edges.map((e) => {
        const fromM = nodeMotions.get(e.from);
        const toM = nodeMotions.get(e.to);
        if (!fromM || !toM) return null;

        if (e.from === e.to) {
          // A tiny fixed loop glyph, positioned via the same motion
          // values as the node itself (motion.g maps x/y to a translate
          // transform) — no separate derived value needed, so it can
          // never desync from the node it's attached to.
          return (
            <motion.g key={`${e.from}-${e.field}-${e.to}`} style={{ x: fromM.cx, y: fromM.cy }}>
              <path
                d={`M -8,${-NODE_RADIUS - 4} a 8,8 0 1 1 16,0`}
                fill="none"
                stroke="var(--text-secondary)"
                strokeWidth={1.75}
                strokeLinecap="round"
                markerEnd="url(#diagram-arrow)"
              />
            </motion.g>
          );
        }

        return (
          <DiagramEdgeView
            key={`${e.from}-${e.field}-${e.to}`}
            from={fromM}
            to={toM}
            edgeStyle={edgeStyle}
          />
        );
      })}

      {diagram.nodes.map((node, i) => (
        <DiagramNodeView
          key={node.id}
          node={node}
          color={PALETTE[i % PALETTE.length]}
          zoom={zoom}
          isRoot={roots.has(node.id)}
          rootLabel={ROOT_LABEL[diagram.kind]}
          onReady={handleReady}
        />
      ))}
    </svg>
  );
}

/** One edge: the line itself, plus a dash travelling along it in the
 * direction it points. Both share a single derived `d`, so the flow can
 * never drift off the wire it belongs to — and because `d` is derived
 * from the endpoints' motion values, dragging a node re-routes the edge
 * and its animation together without a React re-render. */
function DiagramEdgeView({
  from,
  to,
  edgeStyle,
}: {
  from: Motion2D;
  to: Motion2D;
  edgeStyle: EdgeStyle;
}) {
  const d = useTransform([from.cx, from.cy, to.cx, to.cy], ([x1, y1, x2, y2]: number[]) =>
    circleEdgePath({ x: x1, y: y1 }, { x: x2, y: y2 }, edgeStyle, NODE_RADIUS),
  );

  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <motion.path
        d={d}
        fill="none"
        stroke="var(--text-secondary)"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd="url(#diagram-arrow)"
      />
      <motion.path
        className="wire-flow"
        d={d}
        fill="none"
        stroke="var(--accent-primary)"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />
    </motion.g>
  );
}
