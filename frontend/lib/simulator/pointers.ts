/**
 * Which pointers exist at one step of a trace, and where each one lives.
 *
 * Pulled out of the memory diagram because it is no longer only the
 * diagram's question. The panel draws these as wires on screen and
 * lib/simulator/panel-image.ts draws them again into a file, and the two
 * must not be able to disagree about what counts as a pointer or which
 * object it belongs to — a saved picture missing an arrow that is on
 * screen is a picture of a different program.
 *
 * Deliberately shallow: only a value that *is* a reference counts, not one
 * with a reference buried inside an array or an inline struct. That is the
 * rule the diagram draws by — a port sits on a field, and a field holding
 * `[ptr, ptr, ptr]` has no single place for a wire to leave from — so it
 * is the rule both drawings follow, so neither can show an arrow the
 * other does not.
 */

import type { Frame, HeapObject } from "@/lib/trace-schema/types";
import { isRef, refsIn } from "./values";

/** A pointer held by a local variable in some stack frame. */
export type StackPointer = {
  /** Stable identity, and the memory diagram's DOM anchor for the pill. */
  key: string;
  /** 0 is the outermost frame, matching `StepEvent.frames`. */
  depth: number;
  frame: string;
  name: string;
  address: string;
};

/** A pointer held by a field of a heap object. */
export type HeapPointer = {
  /** Stable identity, and the memory diagram's DOM anchor for the port. */
  key: string;
  /** The object holding the pointer. */
  address: string;
  field: string;
  /** The address it points at. Not necessarily still allocated — see the
   * `dangling` checks at the call sites, which need the live heap to
   * decide and so cannot be answered from here. */
  target: string;
  /** Where `address` falls in the heap's own key order, which is what
   * gives a card and its outgoing wires the same colour. */
  index: number;
};

export function stackPointers(frames: Frame[]): StackPointer[] {
  const found: StackPointer[] = [];
  frames.forEach((frame, depth) => {
    for (const name of Object.keys(frame.locals)) {
      const value = frame.locals[name];
      if (isRef(value)) {
        found.push({
          key: `stack:${depth}:${name}`,
          depth,
          frame: frame.function,
          name,
          address: value.ref,
        });
      }
    }
  });
  return found;
}

export function heapPointers(heap: Record<string, HeapObject>): HeapPointer[] {
  const found: HeapPointer[] = [];
  Object.keys(heap).forEach((address, index) => {
    const object = heap[address];
    for (const field of Object.keys(object.fields)) {
      const value = object.fields[field];
      if (isRef(value)) {
        found.push({
          key: `port:${address}:${field}`,
          address,
          field,
          target: value.ref,
          index,
        });
      }
    }
  });
  return found;
}

/**
 * Every address one step of a trace mentions, allocated or not.
 *
 * What `addressLabels` needs to pick labels from: the heap's own keys,
 * plus every address any value points at — including the ones that are
 * no longer allocated, since a dangling pointer still shows an address
 * and still has to be told apart from the live ones.
 *
 * Deeper than `stackPointers`/`heapPointers` on purpose. Those two answer
 * "where does a wire start", which is a question about the drawing; this
 * one answers "what addresses appear as text", and a `ref` buried in an
 * array is printed in the Variables panel even though nothing draws a
 * wire to it.
 */
export function mentionedAddresses(
  frames: Frame[],
  heap: Record<string, HeapObject>,
): string[] {
  const found: string[] = Object.keys(heap);
  for (const frame of frames) {
    for (const name of Object.keys(frame.locals)) refsIn(frame.locals[name], found);
  }
  for (const address of Object.keys(heap)) {
    const object = heap[address];
    for (const field of Object.keys(object.fields)) refsIn(object.fields[field], found);
  }
  return found;
}

/**
 * Every stack slot one step of a trace names — `&x` for each local that
 * has an address.
 *
 * Kept apart from `mentionedAddresses` rather than folded into it,
 * because the two sets are labelled independently and must stay that way.
 * A stack slot and a heap object are addresses in ranges that share no
 * digits at all, and pooling them would let a program that allocates
 * nothing still push every heap label longer — or worse, let a slot
 * happen to render like a card, when nothing on screen ever points at a
 * slot.
 */
export function slotAddresses(frames: Frame[]): string[] {
  const found: string[] = [];
  for (const frame of frames) {
    if (!frame.addrs) continue;
    for (const name of Object.keys(frame.addrs)) found.push(frame.addrs[name]);
  }
  return found;
}
