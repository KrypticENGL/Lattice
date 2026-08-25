/**
 * How a `TraceValue` is classified and coloured on the Simulator page.
 *
 * The colours are not a new palette — they are the Monaco token colours
 * from lib/monaco-theme.ts. A `15` in the editor and the same `15` sitting
 * in a variable row are the same amber on purpose: the panels are meant to
 * read as an X-ray of the code beside them, not as a separate chart.
 */

import type { TraceValue } from "@/lib/trace-schema/types";

export type ValueKind = "null" | "boolean" | "number" | "string" | "ref" | "struct" | "array";

export type RefValue = { ref: string };
export type StructValue = { type: string; fields: Record<string, TraceValue> };

export function isRef(value: TraceValue): value is RefValue {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "ref" in value;
}

export function isStruct(value: TraceValue): value is StructValue {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "type" in value;
}

export function valueKind(value: TraceValue): ValueKind {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (isRef(value)) return "ref";
  if (isStruct(value)) return "struct";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "string";
}

/** Monaco's own token colours (lib/monaco-theme.ts), so a literal keeps
 * its colour when it moves from the editor into a panel. */
export const KIND_COLOR: Record<ValueKind, string> = {
  number: "#fbbf24",
  string: "#00e5ff",
  boolean: "#b147eb",
  null: "var(--text-secondary)",
  ref: "var(--accent-primary)",
  struct: "var(--text-primary)",
  array: "var(--text-primary)",
};

/** Short type name for a value, shown next to variables. */
export function typeLabel(value: TraceValue): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.length}]`;
  if (isRef(value)) return "ptr";
  if (isStruct(value)) return value.type;
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "double";
  return "str";
}

/** One-line rendering of a scalar. Non-scalars get their own components. */
export function scalarText(value: TraceValue): string {
  if (value === null) return "nullptr";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}

/** Every address reachable from a value, in order. Pointer fields can be
 * nested inside arrays and inline structs, so this can't just check the
 * top level. */
export function refsIn(value: TraceValue, out: string[] = []): string[] {
  if (isRef(value)) out.push(value.ref);
  else if (Array.isArray(value)) for (const item of value) refsIn(item, out);
  else if (isStruct(value)) for (const key of Object.keys(value.fields)) refsIn(value.fields[key], out);
  return out;
}

/** The Visualizer's node palette (components/dashboard/visualizer/DiagramView.tsx),
 * repeated here so a heap object carries the same colour in the memory
 * panel that its node would carry on the Visualizer's canvas. Shades of
 * the accent only — a heap card is not a new kind of thing. */
export const HEAP_PALETTE = [
  "var(--accent-secondary)",
  "var(--accent-primary)",
  "#f7b267",
  "#c2703d",
  "#e8993d",
  "#a85c2e",
];

export function heapColor(index: number): string {
  return HEAP_PALETTE[index % HEAP_PALETTE.length];
}

/** Trims a full address to something that fits in a pill without losing
 * the part that distinguishes one allocation from another. */
export function shortAddress(address: string): string {
  return address.length > 8 ? `0x…${address.slice(-5)}` : address;
}
