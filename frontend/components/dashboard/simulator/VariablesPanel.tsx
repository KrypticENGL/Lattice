"use client";

import { motion } from "framer-motion";
import type { Frame, HeapObject, TraceValue } from "@/lib/trace-schema/types";
import {
  isRef,
  isStruct,
  KIND_COLOR,
  scalarText,
  shortAddress,
  typeLabel,
  valueKind,
} from "@/lib/simulator/values";
import Panel, { PanelEmpty } from "./Panel";

/**
 * The locals of one frame, rendered by shape rather than stringified.
 *
 * A trace value is one of six things and each wants a different drawing: a
 * scalar is a coloured literal, an array is a strip of cells you can count,
 * a pointer is an address that leads somewhere — and the one that leads
 * nowhere has to look different from the ones that don't, which is why
 * `dangling` is checked against the live heap here rather than assumed.
 */
export default function VariablesPanel({
  frame,
  depth,
  heap,
  hoveredRef,
  onHoverRef,
}: {
  frame: Frame | null;
  depth: number | null;
  heap: Record<string, HeapObject>;
  hoveredRef: string | null;
  onHoverRef: (address: string | null) => void;
}) {
  const names = frame ? Object.keys(frame.locals) : [];

  return (
    <Panel
      className="min-h-0"
      label="Variables"
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
          {names.map((name) => (
            <motion.li
              key={name}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18 }}
              className="flex items-start gap-2 px-3 py-1.5"
            >
              <span className="w-[4.5rem] shrink-0 truncate font-mono text-[11px] text-[var(--text-primary)]">
                {name}
              </span>
              <span className="w-[2.6rem] shrink-0 truncate font-mono text-[8px] uppercase tracking-wider text-[var(--text-secondary)]">
                {typeLabel(frame.locals[name])}
              </span>
              <span className="min-w-0 flex-1">
                <ValueView
                  value={frame.locals[name]}
                  heap={heap}
                  hoveredRef={hoveredRef}
                  onHoverRef={onHoverRef}
                />
              </span>
            </motion.li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ValueView({
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
            {isRef(item) ? shortAddress(item.ref) : scalarText(item)}
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
      <span className="truncate">{shortAddress(address)}</span>
      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        {dangling ? <path d="M3 3l6 6M9 3l-6 6" /> : <path d="M2 6h7M6.5 3l3 3-3 3" />}
      </svg>
    </span>
  );
}
