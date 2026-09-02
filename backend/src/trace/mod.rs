//! Canonical trace-event schema (BLUEPRINT.md §8) — the contract between a
//! language tracer running inside a sandbox container and everything else
//! (orchestrator, API, frontend, and the `trace_runs.trace_data` column
//! once §10 lands). Defined once here as the source of truth; TS types are
//! generated from this later (§8's "generate the matching TypeScript
//! types" step — not yet wired up).
//!
//! Deserializing a tracer's NDJSON output against these types is also a
//! real validation boundary: a tracer is untrusted-adjacent code running
//! against attacker-controlled source, so malformed/unexpected output
//! failing to parse here is a signal worth surfacing, not just quietly
//! passing through as opaque JSON.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// One line of a tracer's NDJSON stdout, parsed.
///
/// Untagged: a "normal" step event and the `{"step": -1, "event":
/// "truncated", "reason": "..."}` sentinel (§6.3) have different shapes,
/// so `Truncated` is tried first — it has a required `reason` field that a
/// normal `StepEvent` lacks, making the two unambiguous.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum TraceEvent {
    Truncated(TruncatedEvent),
    Step(StepEvent),
}

impl TraceEvent {
    pub fn stdout_delta(&self) -> &str {
        match self {
            TraceEvent::Step(s) => &s.stdout_delta,
            TraceEvent::Truncated(_) => "",
        }
    }

    pub fn is_truncated(&self) -> bool {
        matches!(self, TraceEvent::Truncated(_))
    }

    pub fn is_exception(&self) -> bool {
        matches!(self, TraceEvent::Step(s) if s.event == EventKind::Exception)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EventKind {
    Call,
    Line,
    Return,
    Exception,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepEvent {
    pub step: i64,
    pub line: u32,
    pub event: EventKind,
    pub function: Option<String>,
    pub stdout_delta: String,
    pub frames: Vec<Frame>,
    pub heap: HashMap<String, HeapObject>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TruncatedEvent {
    pub step: i64,
    pub event: String,
    pub reason: String,
}

/// Call stack, innermost last (§8).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Frame {
    pub function: String,
    /// `IndexMap`, not `HashMap`: field/local order here is meaningful —
    /// it's what the frontend's tree layout (lib/shape-detection.ts) uses
    /// to decide which child renders on which side. `HashMap`'s iteration
    /// order is randomized per instance (a DoS-hardening default, seeded
    /// per map), which silently scrambled `left`/`right` field order on
    /// serialization — the exact cause of a real bug where a tree's
    /// children rendered on inconsistent sides across runs. The tracer
    /// itself always emits fields in true declaration order (Python dict
    /// preserves insertion order); `IndexMap` is what preserves that
    /// through deserialize → reserialize instead of discarding it.
    pub locals: IndexMap<String, TraceValue>,
    /// Where each of those locals lives — `&x`, as bare hex — for the
    /// frontend's stack view, which draws a frame as a piece of memory.
    ///
    /// Keyed by the same names as `locals` but deliberately allowed to be
    /// *smaller* than it: a variable the compiler kept in a register has
    /// no address, and the tracer says nothing about those rather than
    /// inventing a slot (see `slot_address` in tracers/cpp/gdb_hook.py).
    /// Defaulted and skipped when empty so a trace recorded before this
    /// field existed — one stored on a canvas, or replayed from a
    /// `.lattice` file — still deserializes, and so a program whose
    /// locals are all in registers doesn't pay for an empty map on every
    /// frame of every event.
    #[serde(default, skip_serializing_if = "IndexMap::is_empty")]
    pub addrs: IndexMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeapObject {
    #[serde(rename = "type")]
    pub type_name: String,
    /// See `Frame::locals` — same reasoning, same fix.
    pub fields: IndexMap<String, TraceValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorInfo {
    pub signal: Option<String>,
    pub description: String,
}

/// A local/field value: scalars are inline, containers are `{"ref": id}`
/// pointing into the enclosing event's `heap` (§8). Variant order matters
/// for this untagged enum — each variant's required shape is distinct
/// enough (unit/bool/number/string primitives, then the two object shapes,
/// then array) that deserialization is unambiguous.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum TraceValue {
    Null,
    Bool(bool),
    Number(serde_json::Number),
    Str(String),
    Ref {
        #[serde(rename = "ref")]
        obj_id: String,
    },
    Struct {
        #[serde(rename = "type")]
        type_name: String,
        fields: IndexMap<String, TraceValue>,
    },
    Array(Vec<TraceValue>),
}

/// `POST /api/execute` request body (§11).
#[derive(Debug, Clone, Deserialize)]
pub struct ExecuteRequest {
    pub language: String,
    pub source: String,
    /// When set, a canvas whose code is *generated* runs the source stored
    /// on it rather than whatever the client sent (see `api::execute`).
    /// `None` for an ad-hoc run not attached to a canvas. Nothing is
    /// written back either way — a run stores no results.
    #[serde(default)]
    pub canvas_id: Option<String>,
    /// Emit an event for *every* stepped source line, rather than only the
    /// ones that change the heap.
    ///
    /// The default filter exists for the Visualizer, whose diagram redraws
    /// only when the heap does — there, a step that just moves the program
    /// counter is a step that draws the same picture again. The Simulator
    /// asks for the unfiltered stream because it renders a call stack and
    /// a locals table too, and those change on exactly the steps the
    /// filter throws away: a recursion that never allocates collapses to
    /// nothing under it (verified — `main -> total -> total -> total`
    /// arrives as a single depth-1 event with the filter on).
    ///
    /// Costs output, not tracing: the tracer already walks frames and heap
    /// on every step to compute the signature it filters by, so this only
    /// changes how much of that work is kept. `step_cap` is unchanged and
    /// still counts executed lines, so the ceiling on work is the same.
    #[serde(default)]
    pub full_steps: bool,
}

/// `POST /api/execute` success response body (§11).
#[derive(Debug, Clone, Serialize)]
pub struct ExecuteResponse {
    pub trace: Vec<TraceEvent>,
    pub stdout: String,
    pub truncated: bool,
    /// The `g++ ...` invocation tracer.py ran, and any stderr it produced
    /// (empty string when there were no warnings) — lets the frontend show
    /// a real compile-then-run terminal transcript instead of just the
    /// program's own stdout.
    pub compile_command: String,
    pub compiler_output: String,
}

impl ExecuteResponse {
    pub fn from_events(events: Vec<TraceEvent>, compile_command: String, compiler_output: String) -> Self {
        let stdout = events.iter().map(TraceEvent::stdout_delta).collect();
        let truncated = events.iter().any(TraceEvent::is_truncated);
        Self {
            trace: events,
            stdout,
            truncated,
            compile_command,
            compiler_output,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_linked_list_step_event() {
        let line = r#"{"step": 8, "line": 14, "event": "return", "function": "main", "stdout_delta": "", "frames": [{"function": "main", "locals": {"head": {"ref": "obj_55555556b320"}, "sum": 32767}}], "heap": {"obj_55555556b320": {"type": "Node", "fields": {"val": 3, "next": {"ref": "obj_55555556b340"}}}, "obj_55555556b340": {"type": "Node", "fields": {"val": 7, "next": null}}}}"#;
        let event: TraceEvent = serde_json::from_str(line).unwrap();
        match event {
            TraceEvent::Step(s) => {
                assert_eq!(s.step, 8);
                assert_eq!(s.event, EventKind::Return);
                let head = &s.frames[0].locals["head"];
                assert!(matches!(head, TraceValue::Ref { .. }));
            }
            TraceEvent::Truncated(_) => panic!("expected Step variant"),
        }
    }

    #[test]
    fn parses_truncated_sentinel() {
        let line = r#"{"step": -1, "event": "truncated", "reason": "step_cap"}"#;
        let event: TraceEvent = serde_json::from_str(line).unwrap();
        assert!(event.is_truncated());
    }

    #[test]
    fn parses_exception_event() {
        let line = r#"{"step": 9, "line": 12, "event": "exception", "function": "main", "stdout_delta": "", "frames": [], "heap": {}, "error": {"signal": "SIGSEGV", "description": "Segmentation fault"}}"#;
        let event: TraceEvent = serde_json::from_str(line).unwrap();
        assert!(event.is_exception());
    }

    #[test]
    fn parses_compile_error_shape_separately() {
        // Compile errors are a distinct, single-object response (tracer.py's
        // contract), not a TraceEvent — exercised in the sandbox module, not
        // here. This test just documents that TraceEvent parsing correctly
        // rejects it rather than silently misclassifying it.
        let line = r#"{"error": "compile_error", "message": "boom"}"#;
        let result: Result<TraceEvent, _> = serde_json::from_str(line);
        assert!(result.is_err());
    }

    #[test]
    fn response_aggregates_stdout_and_truncated_flag() {
        let events = vec![
            TraceEvent::Step(StepEvent {
                step: 0,
                line: 1,
                event: EventKind::Call,
                function: Some("main".into()),
                stdout_delta: "hello\n".into(),
                frames: vec![],
                heap: HashMap::new(),
                error: None,
            }),
            TraceEvent::Truncated(TruncatedEvent {
                step: -1,
                event: "truncated".into(),
                reason: "timeout".into(),
            }),
        ];
        let resp = ExecuteResponse::from_events(events, "g++ -g -O0 -o a.out source.cpp".into(), "".into());
        assert_eq!(resp.stdout, "hello\n");
        assert!(resp.truncated);
    }
}
