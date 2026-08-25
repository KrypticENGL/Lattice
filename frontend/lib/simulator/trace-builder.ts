/**
 * A tiny in-browser trace recorder.
 *
 * The Simulator is a *frontend* page: nothing here talks to the tracer
 * sandbox. Instead each sample program in `programs.ts` re-implements its
 * own algorithm in TypeScript and narrates itself into this recorder,
 * which emits exactly the `StepEvent[]` shape that `POST /api/execute`
 * returns (lib/trace-schema/types.ts).
 *
 * That shape is the whole point of doing it this way. Every panel on the
 * page renders a `StepEvent` and knows nothing about where it came from,
 * so swapping these canned traces for the real backend later is a change
 * to one function in `CodeFlowSimulator` — `buildTrace(program)` becomes
 * `runTrace(language, source, token)` — and not a change to any visual.
 *
 * Semantics worth stating once, because the panels depend on it: a
 * recorded step is the state *after* its line has run. A stepper that
 * highlights the line about to execute makes you press "next" to find out
 * what the highlighted line did, which is the wrong way round for a page
 * whose job is showing cause and effect.
 */

import type { EventKind, Frame, HeapObject, StepEvent, TraceValue } from "@/lib/trace-schema/types";

/**
 * Looks up 1-based line numbers by a distinctive substring of the line.
 *
 * Traces are authored against the source right next to them, and hard-coded
 * line numbers rot the moment anyone adds an `#include`. Markers survive
 * that; a marker that stops matching throws at build time (i.e. the first
 * time someone runs that sample in dev) rather than silently highlighting
 * the wrong statement.
 */
export function lineFinder(source: string) {
  const lines = source.split("\n");
  return function lineOf(marker: string, occurrence = 1): number {
    let seen = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(marker)) {
        seen += 1;
        if (seen === occurrence) return i + 1;
      }
    }
    throw new Error(
      `simulator: no line ${occurrence > 1 ? `#${occurrence} ` : ""}matching ${JSON.stringify(marker)}`,
    );
  };
}

function cloneValue(value: TraceValue): TraceValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneValue);
  if ("ref" in value) return { ref: value.ref };
  return { type: value.type, fields: cloneFields(value.fields) };
}

function cloneFields(fields: Record<string, TraceValue>): Record<string, TraceValue> {
  const out: Record<string, TraceValue> = {};
  for (const key of Object.keys(fields)) out[key] = cloneValue(fields[key]);
  return out;
}

function cloneHeap(heap: Record<string, HeapObject>): Record<string, HeapObject> {
  const out: Record<string, HeapObject> = {};
  // Object.keys, not a spread: this preserves allocation order, which the
  // memory panel uses to lay its cards out consistently step to step.
  for (const address of Object.keys(heap)) {
    out[address] = { type: heap[address].type, fields: cloneFields(heap[address].fields) };
  }
  return out;
}

/** Base address for the fake allocator below. Deliberately plausible
 * rather than round — `0x0`-flavoured addresses read as placeholders, and
 * half the point of the memory panel is that a pointer holds an address. */
const HEAP_BASE = 0x5f2a10;
const HEAP_STRIDE = 0x30;

export class TraceRecorder {
  private readonly events: StepEvent[] = [];
  private readonly stack: Frame[] = [];
  /** Insertion-ordered on purpose: hex-string keys are not array indices,
   * so JS preserves the order they were added in, and that order is
   * allocation order — which is what the memory panel lays cards out by. */
  private heap: Record<string, HeapObject> = {};
  private allocations = 0;

  /** Enters a function. Mirrors a `call` event from the real tracer. */
  call(name: string, locals: Record<string, TraceValue> = {}) {
    this.stack.push({ function: name, locals });
  }

  /** Leaves the innermost function. */
  ret() {
    this.stack.pop();
  }

  get depth() {
    return this.stack.length;
  }

  /** The innermost frame's locals, the thing nearly every step writes to. */
  get locals(): Record<string, TraceValue> {
    const frame = this.stack[this.stack.length - 1];
    if (!frame) throw new Error("simulator: no active frame");
    return frame.locals;
  }

  set(name: string, value: TraceValue) {
    this.locals[name] = value;
  }

  /** Drops a local out of scope — a block-scoped `t` inside a loop body,
   * a `for` init variable once the loop ends. */
  drop(name: string) {
    delete this.locals[name];
  }

  /** Allocates a heap object and hands back its address, the same way
   * `new` hands back a pointer. */
  alloc(type: string, fields: Record<string, TraceValue>): string {
    const address = `0x${(HEAP_BASE + this.allocations * HEAP_STRIDE).toString(16)}`;
    this.allocations += 1;
    this.heap[address] = { type, fields };
    return address;
  }

  /** `delete` / `delete[]`. Any pointer still holding this address is now
   * dangling, which the memory panel draws rather than hides. */
  free(address: string) {
    delete this.heap[address];
  }

  fields(address: string): Record<string, TraceValue> {
    const object = this.heap[address];
    if (!object) throw new Error(`simulator: no heap object at ${address}`);
    return object.fields;
  }

  /** Records the state as it stands, attributed to `line`. */
  step(line: number, options: { event?: EventKind; stdout?: string } = {}) {
    const frame = this.stack[this.stack.length - 1];
    this.events.push({
      step: this.events.length,
      line,
      event: options.event ?? "line",
      function: frame?.function ?? null,
      stdout_delta: options.stdout ?? "",
      frames: this.stack.map((f) => ({ function: f.function, locals: cloneFields(f.locals) })),
      heap: cloneHeap(this.heap),
    });
  }

  done(): StepEvent[] {
    return this.events;
  }
}
