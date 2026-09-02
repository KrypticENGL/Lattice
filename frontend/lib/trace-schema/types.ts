/**
 * TypeScript mirror of BLUEPRINT.md §8's TraceEvent schema and backend
 * src/trace/mod.rs. Hand-written for now — §8 calls for generating these
 * from the Rust types (via ts-rs/specta) so the two can never drift
 * silently, but that pipeline isn't wired up yet (§5: `lib/trace-schema/`
 * is listed as "NOT YET BUILT"). Keep this in sync with the Rust side by
 * hand until then.
 */

export type EventKind = "call" | "line" | "return" | "exception";

export type TraceValue =
  | null
  | boolean
  | number
  | string
  | { ref: string }
  | { type: string; fields: Record<string, TraceValue> }
  | TraceValue[];

export type Frame = {
  function: string;
  locals: Record<string, TraceValue>;
  /** Where each of those locals lives — `&x`, as bare hex — so the stack
   * view can draw a frame as a piece of memory rather than as a table of
   * names.
   *
   * Optional, and allowed to be missing names `locals` has: a trace
   * recorded before the tracer emitted these (one stored on a canvas, or
   * replayed from a `.lattice` file) carries none at all, and a variable
   * the compiler kept in a register never has an address to report. Every
   * reader treats an absent entry as "this one has no slot to show"
   * rather than as a gap to fill in. */
  addrs?: Record<string, string>;
};

export type HeapObject = {
  type: string;
  fields: Record<string, TraceValue>;
};

export type ErrorInfo = {
  signal: string | null;
  description: string;
};

export type StepEvent = {
  step: number;
  line: number;
  event: EventKind;
  function: string | null;
  stdout_delta: string;
  frames: Frame[];
  heap: Record<string, HeapObject>;
  error?: ErrorInfo;
};

export type TruncatedEvent = {
  step: -1;
  event: "truncated";
  reason: string;
};

export type TraceEvent = StepEvent | TruncatedEvent;

export function isTruncated(event: TraceEvent): event is TruncatedEvent {
  return event.event === "truncated";
}

export type ExecuteResponse = {
  trace: TraceEvent[];
  stdout: string;
  truncated: boolean;
  compile_command: string;
  compiler_output: string;
};

export type ExecuteErrorResponse = {
  error: string;
};
