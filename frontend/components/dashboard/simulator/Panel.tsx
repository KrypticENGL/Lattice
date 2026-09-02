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
  control,
  hint,
  action,
  accessory,
  overlay,
  children,
  className = "",
}: {
  label: string;
  /** A control belonging to the title, sitting immediately after it — a
   * switcher for what the panel is showing. Beside the label rather than
   * in a row of its own because it names the thing the label names: read
   * together they are one sentence about what you are looking at, and a
   * strip under the header would read as a second heading. */
  control?: ReactNode;
  /** Small right-aligned count or status, in the header strip. */
  hint?: ReactNode;
  /** A control pinned to the far right of the header, after the hint —
   * for something the panel can do to itself, as opposed to something it
   * is reporting. Only wrapped when it exists, because the header is a
   * `justify-between` pair and a third child would push the hint into
   * the middle of the strip. */
  action?: ReactNode;
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
    // `contain: paint` is free here — the card already clips to its own
    // radius — and it is what tells the browser that nothing inside can
    // dirty a pixel outside. Without it, a row sliding into place inside
    // one panel invalidates a region that the compositor then has to
    // reconcile against every `.glass` surface on the page, each of which
    // owes a fresh 26px backdrop blur for its share of it.
    <div className={`glass flex flex-col overflow-hidden rounded-2xl [contain:paint] ${className}`}>
      {/* `z-10` is load-bearing, not decoration. This strip and the scroll
        * box below it are both stacking contexts — `.glass-bar` opens one
        * with `isolation: isolate`, the body with `contain: paint` — and
        * two sibling contexts at `z-index: auto` are painted in DOM order,
        * so the body covered anything the header put over it. A dropdown
        * opened from `control` is the case that made it visible: the menu
        * rendered, laid out correctly, and was painted *behind* the panel
        * body, which then swallowed every click on it. Its own `z-30`
        * cannot help, because that only orders it within this strip.
        */}
      <div className="glass-bar relative z-10 flex shrink-0 items-center justify-between gap-2 border-b border-[var(--hairline)] px-3 py-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">
            {label}
          </span>
          {control}
        </span>
        {action ? (
          <span className="flex min-w-0 items-center gap-1.5">
            {hint}
            {action}
          </span>
        ) : (
          hint
        )}
      </div>
      {accessory}
      {/* Layout containment on top of that, because this is where the
        * moving parts live: the call stack's frames and the variables'
        * rows both animate with framer-motion's `layout`, and every
        * position they take is a layout the browser would otherwise have
        * to prove cannot reach the rest of the page. It already can't —
        * this is a scroll container with a height its parent fixed — so
        * the containment states what is already true and lets the work
        * stop at this box. */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto [contain:layout_paint]">
        {children}
      </div>
      {/* Lifted above the header's `z-10` for the same reason the header
        * needed one. These are whole-card flashes — `inset: 0`, their own
        * low z-index — and they are supposed to wash over the title strip
        * as well as the body, so they have to outrank it. `rounded-[inherit]`
        * because the layers inherit their radius from this wrapper now
        * rather than from the card. */}
      {overlay && (
        <div className="pointer-events-none absolute inset-0 z-20 rounded-[inherit]">{overlay}</div>
      )}
    </div>
  );
}

/** The header's own control: an icon button at the scale of the strip it
 * sits in. Deliberately not a `.rail-pill` — those are the page's top bar
 * and carry its hover lift; this is chrome inside a card, and belongs to
 * the same family as the editor toolbar's buttons. */
export function PanelAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="-my-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--text-primary)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** The download glyph both panels' save buttons use. */
export function SaveIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2v8M4.5 7L8 10.5 11.5 7M2.5 13h11" />
    </svg>
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
