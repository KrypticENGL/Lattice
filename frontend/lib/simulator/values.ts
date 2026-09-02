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

/* ------------------------------------------------------------------ */
/* Addresses                                                           */
/* ------------------------------------------------------------------ */

/**
 * Addresses arrive as the tracer's object ids — `obj_5610a2b3c2a0` for a
 * C++ allocation at that address. Only the hex is worth showing, and only
 * the tail of it: the leading digits are the mapping the loader happened
 * to pick that run and they are identical for every object on the heap.
 */
function hexTail(address: string): { digits: string; hex: boolean } {
  const bare = address.replace(/^obj_/, "").replace(/^0x/i, "");
  return /^[0-9a-f]+$/i.test(bare) && bare.length > 0
    ? { digits: bare, hex: true }
    : { digits: address, hex: false };
}

/** Never show fewer than this many digits: two objects can be told apart
 * by one, but a label like `0x…0` reads as a number rather than a place. */
const MIN_DIGITS = 3;

/** The floor for stack slots, which is higher than the heap's.
 *
 * Distinctness is a lower bar here than usefulness. One frame's locals sit
 * a handful of bytes apart, so two or three digits already tell them
 * apart — but the whole reason to print a slot is that the reader can see
 * `i` and `n` are *neighbours* and that the frame below starts somewhere
 * else entirely, and a three-digit tail is too short a window for either
 * fact to be visible. Four digits covers a 64KB span, which is more stack
 * than any frame these traces contain. */
const MIN_SLOT_DIGITS = 4;

function label(digits: string, hex: boolean, length: number): string {
  const kept = digits.length <= length ? digits : digits.slice(-length);
  const elided = kept.length < digits.length ? "…" : "";
  return hex ? `0x${elided}${kept}` : `${elided}${kept}`;
}

/**
 * A short label for every address in one step of a trace, chosen so that
 * no two of them read alike.
 *
 * A fixed truncation cannot promise that. Consecutive `new`s come back a
 * couple of dozen bytes apart, so a heap of five list nodes is five
 * addresses that agree on every digit but the last two — cut to a fixed
 * five and they render as `0x…3c2a0`, `0x…3c2c0`, `0x…3c2e0`, which is a
 * column of the same word four times as far as a reader skimming it is
 * concerned. The whole point of showing an address at all is that a
 * pointer's value can be matched to the card it names, and that fails
 * when every card is labelled the same.
 *
 * So the length is chosen from the set rather than fixed: the shortest
 * tail that is distinct for every address given. Shorter is better here —
 * the digits that differ are the low ones, and dropping the shared prefix
 * is what puts them where the eye lands first.
 *
 * Pass every address the step mentions, not just the allocated ones: a
 * dangling pointer's label has to be told apart from the live objects
 * too, and it is the one whose target is no longer in the heap.
 */
export function addressLabels(
  addresses: Iterable<string>,
  minDigits: number = MIN_DIGITS,
): Map<string, string> {
  const unique = [...new Set(addresses)];
  const parts = new Map(unique.map((address) => [address, hexTail(address)]));
  const longest = unique.reduce((max, a) => Math.max(max, parts.get(a)!.digits.length), 0);

  let length = minDigits;
  for (; length < longest; length++) {
    const seen = new Set<string>();
    let clash = false;
    for (const address of unique) {
      const { digits } = parts.get(address)!;
      const tail = digits.slice(-length);
      if (seen.has(tail)) {
        clash = true;
        break;
      }
      seen.add(tail);
    }
    if (!clash) break;
  }

  const labels = new Map<string, string>();
  for (const address of unique) {
    const { digits, hex } = parts.get(address)!;
    labels.set(address, label(digits, hex, length));
  }
  return labels;
}

/** One address on its own, with no set to be distinguished from — the
 * fallback for the few places that render a pointer outside a step's
 * context. Prefer `addressLabels` wherever the whole step is in hand. */
export function shortAddress(address: string): string {
  const { digits, hex } = hexTail(address);
  return label(digits, hex, 5);
}

/**
 * The same, for the stack slots a step's frames name — `&x` for each local
 * the tracer could take the address of.
 *
 * A second call rather than more addresses passed to the first, and the
 * two sets are never pooled: see `slotAddresses` in pointers.ts. The only
 * difference in the labelling itself is the floor — `MIN_SLOT_DIGITS`,
 * because a slot is read for its distance from its neighbours and not
 * merely to be told apart from them.
 */
export function slotLabels(addresses: Iterable<string>): Map<string, string> {
  return addressLabels(addresses, MIN_SLOT_DIGITS);
}

/* ------------------------------------------------------------------ */
/* Comparing two frames                                                */
/* ------------------------------------------------------------------ */

/**
 * Whether two trace values are the same value.
 *
 * Structural rather than `JSON.stringify`d: a pointer is equal to another
 * pointer by the address it holds, and a struct by its type and its
 * fields, neither of which survives being compared as text if the tracer
 * ever emits the same fields in a different order.
 */
export function sameValue(a: TraceValue, b: TraceValue): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => sameValue(item, b[i]));
  }
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (isRef(a) || isRef(b)) return isRef(a) && isRef(b) && a.ref === b.ref;
  if (isStruct(a) && isStruct(b)) {
    if (a.type !== b.type) return false;
    const keys = Object.keys(a.fields);
    return (
      keys.length === Object.keys(b.fields).length &&
      keys.every((key) => key in b.fields && sameValue(a.fields[key], b.fields[key]))
    );
  }
  return false;
}

export type LocalsDiff = {
  /** For every local the two frames both have and disagree about: the
   * value the frame being compared *from* held. Kept rather than a bare
   * name so the panel can say what the value used to be — in recursion
   * that is the whole point, since the names are identical at every depth
   * and only the values tell the frames apart. */
  changed: Map<string, TraceValue>;
  /** Locals the frame being compared from didn't have at all. Not the
   * same news as a changed value — nothing about them is a difference in
   * the reader's sense, they are simply someone else's variables — so
   * they are reported separately and drawn more quietly. */
  fresh: Set<string>;
};

/** What is different about `to`'s locals, coming from `from`'s. */
export function diffLocals(
  from: Record<string, TraceValue>,
  to: Record<string, TraceValue>,
): LocalsDiff {
  const changed = new Map<string, TraceValue>();
  const fresh = new Set<string>();

  for (const name of Object.keys(to)) {
    if (!(name in from)) fresh.add(name);
    else if (!sameValue(from[name], to[name])) changed.set(name, from[name]);
  }
  return { changed, fresh };
}
