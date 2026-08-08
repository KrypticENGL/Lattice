import type { Canvas } from "@/lib/dashboard-data";

const PREVIEW_NODES = [
  { x: 20, y: 40 },
  { x: 70, y: 18 },
  { x: 70, y: 62 },
  { x: 120, y: 40 },
];
const PREVIEW_EDGES = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 3],
];

export default function CanvasCard({ canvas }: { canvas: Canvas }) {
  return (
    <button
      type="button"
      className="matte group flex flex-col overflow-hidden rounded-2xl text-left transition-transform hover:-translate-y-0.5"
    >
      <div className="relative h-28 border-b border-[var(--hairline)] px-4">
        <svg viewBox="0 0 140 80" className="h-full w-full" aria-hidden="true">
          {PREVIEW_EDGES.map(([a, b], i) => (
            <line
              key={i}
              x1={PREVIEW_NODES[a].x}
              y1={PREVIEW_NODES[a].y}
              x2={PREVIEW_NODES[b].x}
              y2={PREVIEW_NODES[b].y}
              stroke="var(--text-secondary)"
              strokeWidth={1.4}
              strokeLinecap="round"
              opacity={0.5}
            />
          ))}
          {PREVIEW_NODES.map((n, i) => (
            <circle key={i} cx={n.x} cy={n.y} r={7} fill={canvas.accent} opacity={0.9} />
          ))}
        </svg>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-serif text-[16px] font-bold text-[var(--text-primary)]">
            {canvas.name}
          </h3>
          <span className="shrink-0 rounded-full border border-[var(--hairline-strong)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
            {canvas.language}
          </span>
        </div>
        <p className="font-mono text-[12px] text-[var(--text-secondary)]">
          {canvas.structure}
        </p>
        <div className="mt-auto flex items-center justify-between pt-2 font-mono text-[11px] text-[var(--text-secondary)]">
          <span>{canvas.nodes} nodes</span>
          <span>{canvas.editedAt}</span>
        </div>
      </div>
    </button>
  );
}
