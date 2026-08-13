"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, animate as animateValue, type MotionValue } from "framer-motion";
import type { Diagram, DiagramNode } from "@/lib/shape-detection";

const NODE_RADIUS = 22;
const MAX_LABEL_LENGTH = 6;

// A new node's entrance is staged in three beats rather than fading in
// already at its final slot: spawn (appear somewhere on the lattice) →
// connect (the edge to it fades in) → place (it slides into its real
// layout position, dragging the now-attached edge along for free since
// edges are bound to the same MotionValues). Each beat gets its own
// duration so the sequence reads as three distinct steps instead of one
// blur.
const SPAWN_MS = 300;
const CONNECT_MS = 300;
const PLACE_MS = 300;

/** Where a freshly-arrived node starts before sliding into place. Not tied
 * to the node's eventual layout slot — that's the whole point, so the
 * placement beat has somewhere to visibly travel from. */
function randomSpawnPoint() {
  const angle = Math.random() * Math.PI * 2;
  const radius = 180 + Math.random() * 240;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

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
  animateEntrance,
}: {
  node: DiagramNode;
  color: string;
  zoom: number;
  onReady: (id: string, motion: Motion2D) => void;
  // False for every node in the first diagram a DiagramView mount ever
  // shows — including a canvas restored straight into the middle of a
  // saved trace, which is a "first diagram" exactly as much as a fresh
  // step 0 is. Those nodes are a snapshot, not an arrival: they render at
  // their real position immediately, no spawn/connect/place. Only nodes
  // that show up in a *later* diagram update, after something was already
  // on screen, get the three-beat entrance.
  animateEntrance: boolean;
}) {
  // Lazy initializer runs once, at this instance's construction — exactly
  // when we want the spawn point decided, since a new DiagramNodeView
  // instance only ever exists for a node id that's genuinely new (existing
  // ids re-render in place rather than remounting, per the `key={node.id}`
  // below). State rather than a ref: this project's lint forbids reading a
  // ref's `.current` during render.
  const [spawnPos] = useState(() => (animateEntrance ? randomSpawnPoint() : { x: node.x, y: node.y }));
  const cx = useMotionValue(spawnPos.x);
  const cy = useMotionValue(spawnPos.y);
  const pinnedRef = useRef(false);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  // spawn → connect → placed for an animated arrival; a snapshot node
  // (animateEntrance false) starts life already "placed" — it registers
  // immediately below instead of waiting out a spawn beat it doesn't play.
  const [phase, setPhase] = useState<"spawn" | "connect" | "placed">(animateEntrance ? "spawn" : "placed");

  useEffect(() => {
    if (!animateEntrance) {
      onReady(node.id, { cx, cy });
      return;
    }
    const timer = setTimeout(() => setPhase("connect"), SPAWN_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Registering with the parent is what makes this node's edges eligible
  // to render (DiagramView only draws an edge once both endpoints have a
  // motion), so deferring it to the "connect" phase is what makes the
  // connection appear *after* the spawn fade rather than alongside it.
  useEffect(() => {
    if (phase !== "connect") return;
    onReady(node.id, { cx, cy });
    const timer = setTimeout(() => setPhase("placed"), CONNECT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Animate toward the freshly computed layout position — on first
  // reaching "placed" this is the slide from the random spawn point into
  // the node's real slot; on every later change (new trace step, new run)
  // it's an ordinary relayout tween. Skipped once the user has dragged
  // this node (pinnedRef), so a manual placement sticks for the rest of
  // the run instead of snapping back on the next step.
  useEffect(() => {
    if (phase !== "placed" || pinnedRef.current) return;
    const cxControls = animateValue(cx, node.x, { duration: PLACE_MS / 1000 });
    const cyControls = animateValue(cy, node.y, { duration: PLACE_MS / 1000 });
    return () => {
      cxControls.stop();
      cyControls.stop();
    };
  }, [phase, node.x, node.y, cx, cy]);

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

  // Flips once, the first time a diagram with any nodes renders, and
  // stays flipped — read during render by every DiagramNodeView's
  // mount-time decision (see `animateEntrance` below). Set directly in the
  // render body rather than an effect: React's own sanctioned pattern for
  // deriving state from the latest render's input (it bails out and
  // re-renders immediately instead of committing a stale frame), which
  // avoids both an extra committed+painted frame an effect would cost and
  // the lint ban on touching a ref during render.
  const [hasShownDiagram, setHasShownDiagram] = useState(false);
  if (!hasShownDiagram && diagram.nodes.length > 0) {
    setHasShownDiagram(true);
  }

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
        <DiagramNodeView
          key={node.id}
          node={node}
          color={PALETTE[i % PALETTE.length]}
          zoom={zoom}
          onReady={handleReady}
          animateEntrance={hasShownDiagram}
        />
      ))}
    </svg>
  );
}
