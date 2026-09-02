"use client";

import { useMemo } from "react";
import { circleEdgePath } from "@/lib/edge-style";
import { NODE_RADIUS, previewFrame } from "@/lib/posts/preview-frame";
import { useEdgeStyle } from "@/lib/use-edge-style";
import type { Diagram } from "@/lib/shape-detection";

/**
 * A post's attached canvas, drawn small.
 *
 * This is the post's main image, and it is a real drawing rather than a
 * screenshot: the same `Diagram` the Visualizer renders, routed through
 * the same `circleEdgePath`, so a preview can never go stale against the
 * canvas it claims to show. It also means the reader's chosen line
 * routing applies here too — curved, straight or right-angle — because a
 * preference about how lines are drawn should not stop at the workspace
 * door.
 *
 * Nothing here is interactive. A thumbnail that can be dragged out of
 * shape is a thumbnail that stops matching the canvas behind it, and the
 * card already has a link for people who want the real thing.
 */

// The Visualizer's palette, unchanged — shades of orange from pale peach
// to deep rust. Adjacent nodes stay tellable apart without the preview
// introducing a hue the rest of the app never uses.
const PALETTE = [
  "var(--accent-secondary)",
  "var(--accent-primary)",
  "#f7b267",
  "#c2703d",
  "#e8993d",
  "#a85c2e",
];

/** What the entry point of each shape is called, so the marker says "head"
 * over a list and "root" over a tree instead of picking one word and being
 * wrong most of the time. Same table as DiagramView's. */
const ROOT_LABEL: Record<Diagram["kind"], string> = {
  "linked-list": "head",
  tree: "root",
  graph: "start",
};

const MAX_LABEL_LENGTH = 4;

function truncate(label: string) {
  return label.length > MAX_LABEL_LENGTH ? `${label.slice(0, MAX_LABEL_LENGTH - 1)}…` : label;
}

export default function CanvasPreview({
  diagram,
  className = "",
}: {
  diagram: Diagram;
  className?: string;
}) {
  const [edgeStyle] = useEdgeStyle();

  // Shared with the figure around this preview, which sizes its frame
  // from the same measurement — see `lib/posts/preview-frame.ts`. Solving
  // it in one place is what guarantees the box and the drawing inside it
  // agree; two copies would agree until the first time one changed.
  const { viewBox } = useMemo(() => previewFrame(diagram), [diagram]);

  const positions = useMemo(
    () => new Map(diagram.nodes.map((n) => [n.id, { x: n.x, y: n.y }])),
    [diagram],
  );

  const roots = useMemo(() => new Set(diagram.roots), [diagram]);

  return (
    <svg
      viewBox={viewBox}
      // The frame is now cut to this diagram's own aspect, so `meet`
      // usually has nothing left to do. It still matters at the extremes,
      // where the figure's height clamp stops a very flat or very tall
      // drawing from setting the card's whole shape.
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role="img"
      aria-label={`${diagram.kind.replace("-", " ")} with ${diagram.nodes.length} nodes`}
    >
      <defs>
        {/* One shared marker id across every preview on the page is
          * deliberate: `context-stroke` takes each arrowhead's colour from
          * the line it terminates, so a single definition serves all of
          * them and duplicating it per card would only cost DOM. */}
        <marker
          id="lattice-post-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
        </marker>
      </defs>

      {diagram.edges.map((edge, i) => {
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        // An edge naming a node that is not in the diagram is a data bug,
        // not a render one — skip it rather than drawing a wire to origin.
        if (!from || !to) return null;
        return (
          <path
            key={`${edge.from}-${edge.to}-${edge.field}-${i}`}
            d={circleEdgePath(from, to, edgeStyle, NODE_RADIUS)}
            fill="none"
            stroke="var(--text-secondary)"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.55}
            markerEnd="url(#lattice-post-arrow)"
          />
        );
      })}

      {diagram.nodes.map((node, i) => (
        <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
          {roots.has(node.id) && (
            <>
              <circle
                r={NODE_RADIUS + 5}
                fill="none"
                stroke="var(--accent-primary)"
                strokeWidth={1.2}
                opacity={0.8}
              />
              <text
                y={-(NODE_RADIUS + 12)}
                textAnchor="middle"
                fill="var(--accent-primary)"
                style={{
                  font: "500 10px var(--font-geist-mono), monospace",
                  letterSpacing: "0.08em",
                }}
              >
                {ROOT_LABEL[diagram.kind]}
              </text>
            </>
          )}

          <circle r={NODE_RADIUS} fill={PALETTE[i % PALETTE.length]} />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--bg-base)"
            style={{ font: "600 11px var(--font-geist-mono), monospace" }}
          >
            {truncate(node.label)}
          </text>
        </g>
      ))}
    </svg>
  );
}
