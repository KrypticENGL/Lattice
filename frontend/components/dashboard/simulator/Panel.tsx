import type { ReactNode } from "react";

/**
 * The shell every right-column panel sits in.
 *
 * Exists so the three of them can't drift: one border radius, one header
 * height, one label size, one scroll behaviour. The Visualizer's floating
 * editor and Code-Canvas's code pane already share `.glass` + `.glass-bar`
 * for exactly this reason, and these panels are the same material one
 * level smaller.
 */
export default function Panel({
  label,
  hint,
  accessory,
  overlay,
  children,
  className = "",
}: {
  label: string;
  /** Small right-aligned count or status, in the header strip. */
  hint?: ReactNode;
  /** Full-width row under the header — a scope switcher, a legend. */
  accessory?: ReactNode;
  /** A layer painted over the whole card, header included — for a panel
   * that needs to signal something about itself rather than about one row
   * in it. Rendered last and clipped by the card's own radius; give it
   * `pointer-events-none` unless it is meant to be clicked. Kept as a slot
   * here rather than left to callers because `.glass` already spends both
   * of its pseudo-elements (noise, sheen), so there is nowhere else to put
   * one without fighting the material. */
  overlay?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`glass flex flex-col overflow-hidden rounded-2xl ${className}`}>
      <div className="glass-bar flex shrink-0 items-center justify-between gap-2 border-b border-[var(--hairline)] px-3 py-2">
        <span className="truncate font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">
          {label}
        </span>
        {hint}
      </div>
      {accessory}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">{children}</div>
      {overlay}
    </div>
  );
}

/** The "nothing to show yet" line, identical in all three panels. */
export function PanelEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-4 py-6 text-center">
      <p className="max-w-[15rem] font-serif text-[12px] leading-5 text-[var(--text-secondary)]">
        {children}
      </p>
    </div>
  );
}
