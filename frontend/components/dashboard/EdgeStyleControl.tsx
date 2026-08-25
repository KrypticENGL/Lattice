"use client";

import { EDGE_STYLES, EDGE_STYLE_GLYPH, type EdgeStyle } from "@/lib/edge-style";

/**
 * The line-routing picker, shared by both canvas workspaces so the two
 * headers can't drift into offering the same setting in two different
 * shapes.
 *
 * Icon-only, and it has to be: spelled out, three labels plus a caption
 * ran the Visualizer's header wide enough to wrap onto a second row,
 * which pushes the header inset down and takes that height straight out
 * of the canvas. Each glyph draws the route it selects, and the full name
 * is one hover away.
 */
export default function EdgeStyleControl({
  value,
  onChange,
  className = "",
}: {
  value: EdgeStyle;
  onChange: (next: EdgeStyle) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Line style"
      className={`rail-pill glass-flat flex gap-0.5 rounded-full px-1 ${className}`}
    >
      {EDGE_STYLES.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            title={`${option.label} — ${option.hint}`}
            aria-label={`${option.label} lines`}
            aria-pressed={active}
            className="flex h-6 w-6 items-center justify-center rounded-full transition-colors"
            style={{
              background: active ? "var(--accent-primary)" : "transparent",
              color: active ? "var(--bg-base)" : "var(--text-secondary)",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={EDGE_STYLE_GLYPH[option.id]} />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
