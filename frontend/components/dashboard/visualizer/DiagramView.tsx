"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, animate as animateValue, type MotionValue } from "framer-motion";
import type { Diagram, DiagramNode } from "@/lib/shape-detection";

const NODE_RADIUS = 22;
const MAX_LABEL_LENGTH = 6;

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
  onReady,
}: {
  node: DiagramNode;
  color: string;
  zoom: number;
  onReady: (id: string, motion: Motion2D) => void;
}) {
  const cx = useMotionValue(node.x);
  const cy = useMotionValue(node.y);
  const pinnedRef = useRef(false);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    onReady(node.id, { cx, cy });
    // Only re-register if this is genuinely a different node id (new key
    // → new component instance anyway) — cx/cy/onReady are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  // Animate toward the freshly computed layout position whenever it
  // changes (new trace step, new run) — skipped once the user has
  // dragged this node (pinnedRef), so a manual placement sticks for the
  // rest of the run instead of snapping back on the next step.
  useEffect(() => {
    if (pinnedRef.current) return;
    const cxControls = animateValue(cx, node.x, { duration: 0.3 });
    const cyControls = animateValue(cy, node.y, { duration: 0.3 });
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
    <g>
      <motion.circle
        cx={cx}
        cy={cy}
        initial={{ opacity: 0, r: 0 }}
        animate={{ opacity: 1, r: NODE_RADIUS }}
        transition={{ duration: 0.3 }}
        fill={color}
        className="cursor-grab active:cursor-grabbing"
        style={{ pointerEvents: "all", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <motion.text
        x={cx}
        y={cy}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-mono)"
        fontSize={11}
        fill="var(--bg-base)"
        pointerEvents="none"
      >
        {truncateLabel(node.label)}
      </motion.text>
    </g>
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
export default function DiagramView({ diagram, zoom = 1 }: { diagram: Diagram; zoom?: number }) {
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

  return (
    <svg width={1} height={1} className="overflow-visible" style={{ position: "absolute", left: 0, top: 0 }}>
      <defs>
        <marker id="diagram-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--text-secondary)" />
        </marker>
      </defs>

      {diagram.edges.map((e) => {
        const fromM = nodeMotions.get(e.from);
        const toM = nodeMotions.get(e.to);
        if (!fromM || !toM) return null;
        const selfLoop = e.from === e.to;

        if (selfLoop) {
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
          <motion.line
            key={`${e.from}-${e.field}-${e.to}`}
            x1={fromM.cx}
            y1={fromM.cy}
            x2={toM.cx}
            y2={toM.cy}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            stroke="var(--text-secondary)"
            strokeWidth={1.75}
            strokeLinecap="round"
            markerEnd="url(#diagram-arrow)"
          />
        );
      })}

      {diagram.nodes.map((node, i) => (
        <DiagramNodeView key={node.id} node={node} color={PALETTE[i % PALETTE.length]} zoom={zoom} onReady={handleReady} />
      ))}
    </svg>
  );
}
