"use client";

import { useEffect, useRef } from "react";
import { animate, createTimeline, stagger, utils } from "animejs";

type NodeDef = { cx: number; cy: number; label: string; color: string };
type EdgeDef = { x1: number; y1: number; x2: number; y2: number };
type ShapeDef = { name: string; nodes: NodeDef[]; edges: EdgeDef[] };

const PURPLE = "var(--accent-primary)";
const CYAN = "var(--accent-secondary)";
const PINK = "#f472b6";
const BLUE = "#60a5fa";
const GREEN = "#34d399";
const AMBER = "#fbbf24";

const SHAPES: ShapeDef[] = [
  {
    name: "LinkedList<int>",
    nodes: [
      { cx: 55, cy: 150, label: "3", color: CYAN },
      { cx: 172, cy: 150, label: "7", color: BLUE },
      { cx: 289, cy: 150, label: "1", color: AMBER },
      { cx: 400, cy: 150, label: "9", color: PURPLE },
    ],
    edges: [
      { x1: 77, y1: 150, x2: 150, y2: 150 },
      { x1: 194, y1: 150, x2: 267, y2: 150 },
      { x1: 311, y1: 150, x2: 378, y2: 150 },
    ],
  },
  {
    name: "TreeNode",
    nodes: [
      { cx: 220, cy: 48, label: "8", color: AMBER },
      { cx: 128, cy: 128, label: "4", color: CYAN },
      { cx: 312, cy: 128, label: "12", color: BLUE },
      { cx: 260, cy: 218, label: "10", color: GREEN },
      { cx: 364, cy: 218, label: "15", color: PURPLE },
    ],
    edges: [
      { x1: 205, y1: 66, x2: 143, y2: 111 },
      { x1: 235, y1: 66, x2: 297, y2: 111 },
      { x1: 300, y1: 146, x2: 271, y2: 200 },
      { x1: 324, y1: 146, x2: 353, y2: 200 },
    ],
  },
  {
    name: "Graph",
    nodes: [
      { cx: 62, cy: 78, label: "a", color: CYAN },
      { cx: 196, cy: 46, label: "b", color: BLUE },
      { cx: 340, cy: 84, label: "c", color: AMBER },
      { cx: 396, cy: 190, label: "d", color: PURPLE },
      { cx: 250, cy: 232, label: "e", color: GREEN },
      { cx: 96, cy: 206, label: "f", color: PINK },
    ],
    edges: [
      { x1: 82, y1: 65, x2: 178, y2: 52 },
      { x1: 216, y1: 55, x2: 322, y2: 78 },
      { x1: 356, y1: 101, x2: 385, y2: 174 },
      { x1: 380, y1: 205, x2: 268, y2: 226 },
      { x1: 232, y1: 232, x2: 114, y2: 213 },
      { x1: 82, y1: 190, x2: 68, y2: 96 },
      { x1: 204, y1: 63, x2: 258, y2: 217 },
    ],
  },
];

export default function HeroVisual() {
  const svgRef = useRef<SVGSVGElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const stepRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    let cancelled = false;
    const groups = SHAPES.map(
      (_, i) => svg.querySelector<SVGGElement>(`#lattice-shape-${i}`)!,
    );

    groups.forEach((g) => utils.set(g, { opacity: 0 }));

    function playShape(index: number) {
      if (cancelled) return;
      const shape = SHAPES[index];
      const group = groups[index];
      const nodes = group.querySelectorAll<SVGCircleElement>(".lt-node");
      const glyphs = group.querySelectorAll<SVGTextElement>(".lt-glyph");
      const edges = group.querySelectorAll<SVGLineElement>(".lt-edge");
      const totalSteps = shape.nodes.length + shape.edges.length;

      utils.set(group, { opacity: 1 });
      utils.set(nodes, { opacity: 0, translateY: 10 });
      utils.set(glyphs, { opacity: 0, translateY: 10 });
      utils.set(edges, { strokeDashoffset: 1 });

      if (labelRef.current) labelRef.current.textContent = shape.name;

      const counter = { value: 0 };
      animate(counter, {
        value: totalSteps,
        duration: totalSteps * 260,
        modifier: Math.round,
        ease: "linear",
        onUpdate: () => {
          if (stepRef.current) {
            stepRef.current.textContent = `step ${String(counter.value).padStart(2, "0")}/${String(totalSteps).padStart(2, "0")}`;
          }
        },
      });

      const tl = createTimeline({
        defaults: { ease: "outQuad" },
        onComplete: () => {
          if (cancelled) return;
          setTimeout(() => {
            animate(group, {
              opacity: [1, 0],
              duration: 450,
              ease: "inQuad",
              onComplete: () => {
                if (cancelled) return;
                playShape((index + 1) % SHAPES.length);
              },
            });
          }, 1500);
        },
      });

      tl.add(nodes, {
        opacity: [0, 1],
        translateY: [10, 0],
        duration: 380,
        delay: stagger(150),
      })
        .add(
          glyphs,
          {
            opacity: [0, 1],
            translateY: [10, 0],
            duration: 300,
            delay: stagger(150, { start: 60 }),
          },
          "-=250",
        )
        .add(
          edges,
          {
            strokeDashoffset: [1, 0],
            duration: 340,
            delay: stagger(130),
          },
          "-=200",
        );
    }

    playShape(0);

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="glass w-full overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-[var(--hairline)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#f87171]/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]/70" />
          <span className="ml-3 font-mono text-[12px] text-[var(--text-secondary)]">
            trace.json — <span ref={labelRef}>LinkedList&lt;int&gt;</span>
          </span>
        </div>
        <span
          ref={stepRef}
          className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 font-mono text-[11px] text-[var(--text-secondary)]"
        >
          step 00/00
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox="0 0 440 300"
        className="h-auto w-full"
        role="img"
        aria-label="Animated visualization of a runtime trace building a data structure"
      >
        {SHAPES.map((shape, i) => (
          <g id={`lattice-shape-${i}`} key={shape.name}>
            {shape.edges.map((e, ei) => (
              <line
                key={ei}
                className="lt-edge"
                x1={e.x1}
                y1={e.y1}
                x2={e.x2}
                y2={e.y2}
                stroke="var(--text-secondary)"
                strokeWidth={1.75}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="1"
                strokeDashoffset={1}
              />
            ))}
            {shape.nodes.map((n, ni) => (
              <circle
                key={ni}
                className="lt-node"
                cx={n.cx}
                cy={n.cy}
                r={21}
                fill={n.color}
                opacity={0}
              />
            ))}
            {shape.nodes.map((n, ni) => (
              <text
                key={ni}
                className="lt-glyph"
                x={n.cx}
                y={n.cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily="var(--font-mono)"
                fontSize={13}
                fill="var(--bg-base)"
                opacity={0}
              >
                {n.label}
              </text>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
