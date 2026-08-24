"use client";

import { useState } from "react";
import { NODE_TYPES, PALETTE_GROUPS, type NodeKind } from "@/lib/code-canvas/graph";

/** Miniature of the block itself rather than an abstract icon — the palette
 * row should look like the thing that lands on the canvas. */
function BlockChip({ kind }: { kind: NodeKind }) {
  const spec = NODE_TYPES[kind];
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
      style={{
        background: `color-mix(in srgb, ${spec.accent} 20%, transparent)`,
        border: `1px solid color-mix(in srgb, ${spec.accent} 45%, transparent)`,
      }}
    >
      <span className="h-1 w-1 rounded-full" style={{ background: spec.accent }} />
    </span>
  );
}

/**
 * The block library. Every entry is both draggable (drop it exactly where
 * you want it) and clickable (drops into the middle of the free space), so
 * the canvas never demands a precise drag from someone who just wants a
 * node.
 */
export default function NodePalette({
  onAdd,
  onDragStart,
}: {
  onAdd: (kind: NodeKind) => void;
  /** Begins a pointer-driven drag of `kind` out of the palette. Pointer
   * events rather than HTML5 drag-and-drop: they work identically for
   * mouse, pen and touch, and let the page draw a real preview of the
   * block instead of the browser's screenshot of a palette row. */
  onDragStart: (kind: NodeKind, event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      data-tour="palette"
      className="matte shifts-with-sidebar pointer-events-auto absolute bottom-16 left-2 z-20 flex max-h-[min(480px,calc(100%-11rem))] w-[200px] flex-col overflow-hidden rounded-xl"
      style={{ boxShadow: "0 24px 48px -24px rgba(0,0,0,0.8)" }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--hairline)] px-3 py-2">
        <span className="font-serif text-[12px] font-semibold text-[var(--text-primary)]">Blocks</span>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Show blocks" : "Hide blocks"}
          className="flex h-5 w-5 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--text-primary)]"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: "transform 200ms ease-out" }}
          >
            <path d="M3 10l5-5 5 5" />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {PALETTE_GROUPS.map((group) => (
            <div key={group.title} className="mb-2 last:mb-0">
              <p className="px-1 pb-1 font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                {group.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.kinds.map((kind) => {
                  const spec = NODE_TYPES[kind];
                  return (
                    <button
                      key={kind}
                      type="button"
                      title={spec.blurb}
                      onPointerDown={(e) => onDragStart(kind, e)}
                      onClick={() => onAdd(kind)}
                      className="flex w-full cursor-grab touch-none items-center gap-2 rounded-lg border border-transparent px-1.5 py-1 text-left transition-colors hover:border-[var(--hairline)] hover:bg-white/[0.04] active:cursor-grabbing"
                    >
                      <BlockChip kind={kind} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[10px] text-[var(--text-primary)]">
                          {spec.label}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="shrink-0 border-t border-[var(--hairline)] px-3 py-1.5 font-mono text-[8px] uppercase tracking-wider text-[var(--text-secondary)]">
        Drag one out, or click to drop
      </p>
    </div>
  );
}
