"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/**
 * The app's own dropdown, for the places that were reaching for a native
 * `<select>`.
 *
 * ## Why not the native one
 *
 * A `<select>` is two things, and only one of them is ours. The closed
 * control is an element in the document and can be styled into a pill
 * that matches the strip it sits in; the *open list* is drawn by the
 * platform, outside the document, and no CSS reaches it. `appearance:
 * none` doesn't help — it only stops the closed control painting a widget
 * — so a dark glass panel would drop a square, system-grey, system-fonted
 * menu over itself the moment you clicked it, with square corners in a
 * app that has none and 13px system text in a strip lettered at 9px mono.
 * `color-scheme: dark` is the one property that gets through, and all it
 * buys is a *dark* box that is still not this one.
 *
 * So the list is rendered here, as elements, and the whole control looks
 * like the rest of the app because it is made of the same things.
 *
 * ## What has to be rebuilt to do that
 *
 * Everything the native control was giving away for free, which is the
 * real cost of this component and the reason it is written once here
 * rather than at each call site:
 *
 * - the ARIA combobox/listbox pairing, so it is still announced as a
 *   choice between named options rather than as a button next to a list;
 * - keyboard operation — arrows, Home/End, Enter, Escape, and typing the
 *   first letters of an option to jump to it;
 * - focus that stays on the button, with `aria-activedescendant` naming
 *   the active option, so no focus ever lands somewhere that disappears
 *   when the list closes;
 * - closing on an outside press, on Escape, and on focus leaving.
 *
 * ## Where it opens
 *
 * Inline, absolutely positioned under the button — not a portal. Every
 * caller so far sits in the header strip of a `.glass` card that is many
 * times taller than the list, so there is nothing to escape, and a portal
 * would buy clipping-freedom at the price of having to track the button's
 * position through the panel's own scrolling and the sidebar's 300ms
 * width transition. If a caller ever needs to open one near the bottom
 * edge of a short container, that is the point to reach for a portal, not
 * before.
 */
export type DropdownOption<T extends string> = {
  value: T;
  label: string;
  /** Shown after the label in the open list, in the muted colour — a
   * status about the option itself, not a second name for it (`soon`,
   * `beta`). Not drawn on the closed button, which has room for one
   * thing and should say which option is chosen. */
  note?: string;
  disabled?: boolean;
};

export default function Dropdown<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled = false,
  align = "left",
  menuWidth,
}: {
  value: T;
  options: readonly DropdownOption<T>[];
  onChange: (value: T) => void;
  /** What the control is choosing, for screen readers — the label a
   * `<select>` would have carried. */
  label: string;
  disabled?: boolean;
  /** Which edge of the button the list lines up with. `right` for a
   * control near the right edge of its container, so the list opens
   * inward. */
  align?: "left" | "right";
  /** A floor for the list's width, in CSS units. By default the list is
   * as wide as its own longest option and at least as wide as the button,
   * which is right when the options are short names; pass this when the
   * button is much narrower than the list should look. */
  menuWidth?: string;
}) {
  const [open, setOpen] = useState(false);
  /** Which option the keyboard is on. Distinct from `value`: moving
   * through the list with the arrows does not choose anything until Enter
   * — the native control on every platform but macOS behaves this way,
   * and it is what makes Escape able to mean "never mind". */
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  const openList = useCallback(() => {
    // Opening lands on the current choice, wherever it is in the list —
    // the first arrow press should move away from where you are, not jump
    // to the top of a list you are already somewhere in.
    setActive(selectedIndex >= 0 ? selectedIndex : firstEnabled(options));
    setOpen(true);
  }, [options, selectedIndex]);

  const choose = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      if (option.value !== value) onChange(option.value);
      close(true);
    },
    [options, value, onChange, close],
  );

  /** Step to the next selectable option, wrapping. Disabled options are
   * skipped rather than landed on, so holding an arrow key can't stall on
   * one, and the loop is bounded by the list length so an all-disabled
   * list simply doesn't move. */
  const step = useCallback(
    (from: number, delta: number) => {
      let next = from;
      for (let i = 0; i < options.length; i++) {
        next = (next + delta + options.length) % options.length;
        if (!options[next].disabled) return next;
      }
      return from;
    },
    [options],
  );

  /** Jump to an option by its first letters, the way a native select
   * does. The buffer clears after a pause, so `st` finds "Stack" but a
   * later lone `s` starts again rather than extending a stale query. */
  const typed = useRef({ query: "", at: 0 });
  const typeahead = useCallback(
    (key: string) => {
      const now = Date.now();
      const state = typed.current;
      state.query = now - state.at > 600 ? key : state.query + key;
      state.at = now;

      const match = options.findIndex(
        (option) => !option.disabled && option.label.toLowerCase().startsWith(state.query),
      );
      if (match >= 0) setActive(match);
      return match >= 0;
    },
    [options],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openList();
      } else if (e.key.length === 1 && /\S/.test(e.key)) {
        // Typing at a closed control opens it on the match, which is what
        // the native one does and what makes the list reachable without
        // ever pointing at it.
        e.preventDefault();
        setOpen(true);
        typeahead(e.key.toLowerCase());
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => step(i, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => step(i, -1));
        break;
      case "Home":
        e.preventDefault();
        setActive(firstEnabled(options));
        break;
      case "End":
        e.preventDefault();
        setActive(step(0, -1));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        break;
      case "Escape":
        e.preventDefault();
        close(true);
        break;
      case "Tab":
        // Not prevented: Tab should still move on. The list just goes
        // with it rather than being left open over the next control.
        close(false);
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key) && typeahead(e.key.toLowerCase())) {
          e.preventDefault();
        }
    }
  };

  // An outside press closes, without stealing the press: `pointerdown` on
  // the document rather than a blur handler, because a blur fires before
  // the click that caused it lands and would close the list out from
  // under a click on one of its own options.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the active option in view for a list long enough to scroll. Run
  // before paint so a keyboard-driven move never shows the list at the
  // old offset first.
  useLayoutEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  return (
    <div ref={rootRef} className="relative flex shrink-0 items-center">
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={handleKeyDown}
        className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-[var(--bg-elevated)] py-[3px] pl-2 pr-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-secondary)] hover:text-[var(--text-primary)] focus-visible:border-[var(--accent-secondary)] focus-visible:text-[var(--text-primary)] focus-visible:outline-none disabled:cursor-default disabled:opacity-40 disabled:hover:border-[var(--hairline)] disabled:hover:text-[var(--text-secondary)]"
        style={
          open
            ? {
                borderColor: "var(--accent-secondary)",
                color: "var(--text-primary)",
              }
            : undefined
        }
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <Chevron open={open} />
      </button>

      {open && (
        // Two elements, not one, and the split is not cosmetic: `.glass`
        // sets `position: relative`, and it is defined after Tailwind's
        // utilities in globals.css — so `absolute` on the same element
        // loses the tie and the list lays out in flow *beside* the
        // button. The material goes on the inner element, the position on
        // the outer one, and neither can take the other's property away.
        <div
          className={`absolute top-full z-30 mt-1.5 min-w-full ${
            align === "right" ? "right-0" : "left-0"
          }`}
          style={{ width: menuWidth }}
        >
          <ul
            ref={listRef}
            id={`${id}-list`}
            role="listbox"
            aria-label={label}
            tabIndex={-1}
            className="glass scrollbar-thin max-h-56 overflow-auto rounded-xl p-1"
            style={{
              // A shadow of its own, on top of `.glass`'s: the material is
              // built to sit *in* the page, and a menu has to read as
              // floating over the panel it covers.
              boxShadow: "0 18px 40px -16px rgba(0, 0, 0, 0.8), 0 2px 8px -4px rgba(0, 0, 0, 0.6)",
            }}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === active;
              return (
                <li
                  key={option.value}
                  id={`${id}-option-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  // `mousemove`, not `mouseenter`: the pointer sitting
                  // still over the list while the arrows move the active
                  // option shouldn't drag it back under the cursor.
                  onMouseMove={() => !option.disabled && setActive(index)}
                  onClick={() => choose(index)}
                  className={`flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg px-2 py-1 font-mono text-[9px] uppercase tracking-wider transition-colors ${
                    option.disabled ? "cursor-default opacity-40" : ""
                  }`}
                  style={{
                    background: isActive && !option.disabled ? "var(--bg-elevated)" : "transparent",
                    color: isSelected
                      ? "var(--accent-primary)"
                      : isActive
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                  }}
                >
                  {/* Reserved on every row, so the labels line up whichever
                   * one is ticked and nothing shifts as the choice moves. */}
                  <span className="flex w-2.5 shrink-0 justify-center">
                    {isSelected && <Tick />}
                  </span>
                  <span className="flex-1">{option.label}</span>
                  {option.note && (
                    <span className="shrink-0 text-[var(--text-secondary)] opacity-70">
                      {option.note}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function firstEnabled<T extends string>(options: readonly DropdownOption<T>[]): number {
  const index = options.findIndex((option) => !option.disabled);
  return index >= 0 ? index : 0;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="8"
      height="8"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 transition-transform duration-150"
      style={{ transform: open ? "rotate(180deg)" : undefined }}
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function Tick() {
  return (
    <svg
      aria-hidden="true"
      width="8"
      height="8"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8.5l3.5 3.5L13 4.5" />
    </svg>
  );
}
