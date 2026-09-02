"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import type { Frame, HeapObject, TraceValue } from "@/lib/trace-schema/types";
import {
  isRef,
  isStruct,
  KIND_COLOR,
  scalarText,
  typeLabel,
  valueKind,
  type LocalsDiff,
} from "@/lib/simulator/values";
import Panel, { PanelEmpty } from "./Panel";
import { useAddressLabel } from "./AddressLabels";

/**
 * The locals of one frame, rendered by shape rather than stringified.
 *
 * A trace value is one of six things and each wants a different drawing: a
 * scalar is a coloured literal, an array is a strip of cells you can count,
 * a pointer is an address that leads somewhere — and the one that leads
 * nowhere has to look different from the ones that don't, which is why
 * `dangling` is checked against the live heap here rather than assumed.
 *
 * Switching frames is answered here as well as in the call stack, and it
 * has to be: the click happens in one panel and the whole of its effect
 * lands in this one, which is easy to miss when both frames belong to the
 * same recursive function and the list of names is identical either way.
 * So the card lights up to say the click landed, and the locals that are
 * actually different from the frame just left carry the difference — the
 * value they used to hold, on the row, for as long as the comparison
 * holds true. See `diffLocals`, and `switched` below for when it expires.
 *
 * Memoised: the page above re-renders on every keystroke in the editor and
 * on every pointer that crosses a pointer pill, and neither has anything
 * to say about a frame's locals. Re-rendering anyway is not merely wasted
 * work — every row here carries `layout`, so a render with nothing to
 * animate still costs framer-motion a measure of all of them.
 */
const VariablesPanel = memo(function VariablesPanel({
  frame,
  depth,
  heap,
  switched,
  hoveredRef,
  onHoverRef,
}: {
  frame: Frame | null;
  depth: number | null;
  heap: Record<string, HeapObject>;
  /** How these locals differ from the frame the reader was looking at
   * before they clicked, or `null` when they arrived here by stepping.
   * Held only until the step changes — a step later it would be
   * describing values that have since moved on. */
  switched?: (LocalsDiff & { token: number }) | null;
  hoveredRef: string | null;
  onHoverRef: (address: string | null) => void;
}) {
  const labelOf = useAddressLabel();
  const names = frame ? Object.keys(frame.locals) : [];
  const changedCount = switched
    ? names.reduce((n, name) => n + (switched.changed.has(name) ? 1 : 0), 0)
    : 0;

  return (
    <Panel
      className="min-h-0"
      label="Variables"
      /* The card's own half of the answer: one pulse saying the click
       * landed here. It is what carries a switch between two frames that
       * hold the same values — nothing on any row would move — and the
       * only signal at all when the frame came from another function
       * entirely and there is nothing to compare against. */
      overlay={
        switched ? (
          <span key={switched.token} aria-hidden="true" className="panel-flash-layer panel-flash" />
        ) : null
      }
      hint={
        frame ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono text-[9px] text-[var(--accent-secondary)]">
              {frame.function}()
            </span>
            {depth !== null && (
              <span className="shrink-0 font-mono text-[9px] text-[var(--text-secondary)]">
                #{depth}
              </span>
            )}
            {/* What the highlight below means, in words. Without it a lit
              * row is just a lit row, and the reader has to infer that the
              * comparison is against the frame they came from rather than
              * against the previous step. */}
            {changedCount > 0 && (
              <span
                className="shrink-0 rounded-full px-1.5 py-px font-mono text-[8px] uppercase tracking-wider"
                style={{
                  background: "color-mix(in srgb, var(--accent-primary) 18%, transparent)",
                  color: "var(--accent-secondary)",
                }}
              >
                {changedCount} differ
              </span>
            )}
          </span>
        ) : undefined
      }
    >
      {!frame ? (
        <PanelEmpty>Pick a frame in the call stack to inspect its locals.</PanelEmpty>
      ) : names.length === 0 ? (
        <PanelEmpty>
          <span className="font-mono text-[11px]">{frame.function}()</span> has no locals in scope
          yet.
        </PanelEmpty>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--hairline)]">
          {names.map((name) => {
            // Three states, and they are not the same news. A local both
            // frames have and disagree about is the thing worth crossing
            // the panel for; one the other frame simply didn't have is a
            // difference in the list, not in a value; everything else is
            // the same either way and should stay quiet.
            const was = switched?.changed.get(name);
            const differs = switched?.changed.has(name) ?? false;
            const fresh = switched?.fresh.has(name) ?? false;

            return (
              <motion.li
                key={name}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.18 }}
                className="relative flex items-start gap-2 px-3 py-1.5"
                style={
                  differs
                    ? {
                        // What is left once the flash has burned off: enough
                        // to find the row again a few seconds later, little
                        // enough to read as a mark rather than a selection.
                        background: "color-mix(in srgb, var(--accent-primary) 7%, transparent)",
                        boxShadow: "inset 2px 0 0 var(--accent-primary)",
                      }
                    : undefined
                }
              >
                {(differs || fresh) && (
                  // Keyed on the switch, not on the name: two clicks that
                  // light the same row have to play the animation twice,
                  // and a CSS animation already on an element does not
                  // restart until the element is a new one.
                  <span
                    key={switched!.token}
                    aria-hidden="true"
                    className={`var-flash-layer ${differs ? "var-flash-changed" : "var-flash-fresh"}`}
                  />
                )}

                <span className="w-[4.5rem] shrink-0 truncate font-mono text-[11px] text-[var(--text-primary)]">
                  {name}
                </span>
                <span className="w-[2.6rem] shrink-0 truncate font-mono text-[8px] uppercase tracking-wider text-[var(--text-secondary)]">
                  {typeLabel(frame.locals[name])}
                </span>
                <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                  <span className="min-w-0">
                    <ValueView
                      value={frame.locals[name]}
                      heap={heap}
                      hoveredRef={hoveredRef}
                      onHoverRef={onHoverRef}
                    />
                  </span>
                  {was !== undefined && (
                    // The actual answer to "what changed", and the reason
                    // the diff keeps the old value rather than just the
                    // name: in a recursion every frame reads `n`, and only
                    // `4 was 5` says which frame you are standing in.
                    <span
                      className="shrink truncate font-mono text-[9px] text-[var(--text-secondary)]"
                      title={`the frame you came from held ${brief(was, labelOf)}`}
                    >
                      was <span className="opacity-80">{brief(was, labelOf)}</span>
                    </span>
                  )}
                </span>
              </motion.li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
});

export default VariablesPanel;

/** How wide a `was …` annotation is allowed to get before it stops being
 * an aside. The row it shares is already a name, a type and a value. */
const BRIEF_MAX = 16;

/**
 * A value in one short phrase, for the "was" note beside a changed local.
 *
 * Deliberately not `ValueView`: that draws a value at full size — cells
 * you can count, a pointer you can hover — and two of those on one row
 * would read as two live values rather than as one and its history. This
 * is the smallest thing that still says what the old value *was*.
 */
function brief(value: TraceValue, labelOf: (address: string) => string): string {
  if (isRef(value)) return labelOf(value.ref);
  if (isStruct(value)) return `${value.type} {…}`;
  if (Array.isArray(value)) {
    const items = value.map((item) => (isRef(item) ? "ptr" : scalarText(item))).join(", ");
    return items.length <= BRIEF_MAX ? `[${items}]` : `[${value.length} items]`;
  }
  const text = scalarText(value);
  return text.length <= BRIEF_MAX ? text : `${text.slice(0, BRIEF_MAX - 1)}…`;
}

/** Exported so the memory panel's stack view draws a value exactly the
 * way this panel does. Two renderings of the same local, side by side on
 * one screen, would be two chances to disagree about what it holds. */
export function ValueView({
  value,
  heap,
  hoveredRef,
  onHoverRef,
}: {
  value: TraceValue;
  heap: Record<string, HeapObject>;
  hoveredRef: string | null;
  onHoverRef: (address: string | null) => void;
}) {
  const labelOf = useAddressLabel();

  if (isRef(value)) {
    return (
      <PointerPill
        address={value.ref}
        dangling={!(value.ref in heap)}
        hovered={hoveredRef === value.ref}
        onHoverRef={onHoverRef}
      />
    );
  }

  if (Array.isArray(value)) {
    return (
      <span className="flex flex-wrap items-center gap-px">
        {value.map((item, i) => (
          <span
            key={i}
            className="border border-[var(--hairline)] px-1.5 py-px font-mono text-[10px] first:rounded-l-[4px] last:rounded-r-[4px]"
            style={{
              background: "var(--bg-elevated)",
              color: isRef(item) ? KIND_COLOR.ref : KIND_COLOR[valueKind(item)],
            }}
          >
            {isRef(item) ? labelOf(item.ref) : scalarText(item)}
          </span>
        ))}
      </span>
    );
  }

  if (isStruct(value)) {
    return (
      <span className="font-mono text-[10px] text-[var(--text-secondary)]">
        <span style={{ color: "var(--text-primary)" }}>{value.type}</span>
        {" { "}
        {Object.keys(value.fields)
          .map((k) => `${k}: ${isRef(value.fields[k]) ? "ptr" : scalarText(value.fields[k])}`)
          .join(", ")}
        {" }"}
      </span>
    );
  }

  return (
    <span className="font-mono text-[11px]" style={{ color: KIND_COLOR[valueKind(value)] }}>
      {scalarText(value)}
    </span>
  );
}

/** An address, drawn as something that points. Shared with the memory
 * panel's stack lane so the same pointer looks the same in both places. */
export function PointerPill({
  address,
  dangling,
  hovered,
  onHoverRef,
  label,
}: {
  address: string;
  dangling: boolean;
  hovered: boolean;
  onHoverRef: (address: string | null) => void;
  /** Prefix shown before the address — the variable's name, in the memory
   * panel's lane where the name isn't already in a column of its own. */
  label?: string;
}) {
  const color = dangling ? "#f87171" : "var(--accent-primary)";
  const labelOf = useAddressLabel();

  return (
    <span
      onMouseEnter={() => onHoverRef(address)}
      onMouseLeave={() => onHoverRef(null)}
      title={dangling ? `${address} — freed; this pointer dangles` : address}
      className="inline-flex max-w-full items-center gap-1 rounded-full border px-1.5 py-px font-mono text-[10px] transition-colors"
      style={{
        borderColor: hovered ? color : "var(--hairline)",
        borderStyle: dangling ? "dashed" : "solid",
        background: hovered
          ? "color-mix(in srgb, var(--accent-primary) 16%, transparent)"
          : "var(--bg-elevated)",
        color,
      }}
    >
      {label && <span className="text-[var(--text-primary)]">{label}</span>}
      <span className="truncate">{labelOf(address)}</span>
      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        {dangling ? <path d="M3 3l6 6M9 3l-6 6" /> : <path d="M2 6h7M6.5 3l3 3-3 3" />}
      </svg>
    </span>
  );
}
