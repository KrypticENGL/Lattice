//! Persisted trace runs, stored in MongoDB (§ crate::mongo) — user content,
//! same as canvases and posts, so it lives here rather than in Postgres
//! (see mongo::mod's split).
//!
//! One document per completed trace (§ crate::api::execute): enough to
//! render Recent Traces and to bucket into the Activity heatmap's per-day
//! counts. The trace payload itself is deliberately not kept — same as a
//! canvas's last run, it's recomputed by re-executing, never stored.

use crate::mongo;
use crate::trace::TraceEvent;
use mongodb::bson::doc;
use mongodb::{Collection, Database};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub type Result<T> = mongodb::error::Result<T>;

fn trace_runs(db: &Database) -> Collection<TraceRun> {
    mongo::collection(db, mongo::TRACE_RUNS)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceRun {
    pub id: String,
    pub owner_id: String,
    pub language: String,
    /// A short, best-effort label for the primary data structure the trace
    /// touched — e.g. "Node", "TreeNode" — derived from the heap objects the
    /// run actually allocated (see `api::execute`'s call site). Never a
    /// guess dressed up as certainty: falls back to "Program" when the run
    /// allocated nothing recognizable.
    pub structure: String,
    /// The first meaningful line of the source that was run, for the
    /// Recent Traces list. Not a full snippet extraction — just enough to
    /// jog the user's memory about which run this was.
    pub snippet: String,
    pub steps: i64,
    pub ran_at: String,
}

/// Wire shape for `RecentTraces.tsx` — same field names `TraceRun` in
/// `frontend/lib/dashboard-data.ts` already used, minus the client-only
/// `accent` (an id-derived color, computed in the frontend, not data).
#[derive(Debug, Clone, Serialize)]
pub struct TraceRunView {
    pub id: String,
    pub structure: String,
    pub snippet: String,
    pub steps: i64,
    pub ran_at: String,
}

impl From<TraceRun> for TraceRunView {
    fn from(t: TraceRun) -> Self {
        Self { id: t.id, structure: t.structure, snippet: t.snippet, steps: t.steps, ran_at: t.ran_at }
    }
}

/// How many rows `recent` returns — the Recent Traces panel is a fixed-size
/// scrollable list, not a paginated one.
const RECENT_LIMIT: i64 = 20;

pub async fn record(
    db: &Database,
    owner_id: &str,
    language: &str,
    structure: &str,
    snippet: &str,
    steps: i64,
) -> Result<()> {
    let run = TraceRun {
        id: uuid::Uuid::new_v4().to_string(),
        owner_id: owner_id.to_string(),
        language: language.to_string(),
        structure: structure.to_string(),
        snippet: snippet.to_string(),
        steps,
        ran_at: mongo::now(),
    };
    trace_runs(db).insert_one(&run).await?;
    Ok(())
}

pub async fn recent(db: &Database, owner_id: &str) -> Result<Vec<TraceRunView>> {
    let cursor = trace_runs(db)
        .find(doc! { "owner_id": owner_id })
        .sort(doc! { "ran_at": -1 })
        .limit(RECENT_LIMIT)
        .await?;
    Ok(crate::canvases::collect(cursor).await?.into_iter().map(TraceRunView::from).collect())
}

pub async fn count(db: &Database, owner_id: &str) -> Result<u64> {
    trace_runs(db).count_documents(doc! { "owner_id": owner_id }).await
}

/// How many of `owner_id`'s runs landed at or after `since` (an RFC 3339
/// instant) — used both for the "+N this week" stat delta and, bucketed by
/// day in `api::traces`, for the Activity heatmap.
pub async fn count_since(db: &Database, owner_id: &str, since: &str) -> Result<u64> {
    trace_runs(db).count_documents(doc! { "owner_id": owner_id, "ran_at": { "$gte": since } }).await
}

#[derive(Deserialize)]
struct RanAtOnly {
    ran_at: String,
}

/// Every `ran_at` for `owner_id` from `since` onward, unsorted — the caller
/// buckets these into days. A projection rather than `recent`'s full rows:
/// the heatmap's window is wider than any reasonable "recent" list and has
/// no use for `structure`/`snippet`.
pub async fn ran_at_since(db: &Database, owner_id: &str, since: &str) -> Result<Vec<String>> {
    let cursor = mongo::collection::<RanAtOnly>(db, mongo::TRACE_RUNS)
        .find(doc! { "owner_id": owner_id, "ran_at": { "$gte": since } })
        .projection(doc! { "ran_at": 1 })
        .await?;
    Ok(crate::canvases::collect(cursor).await?.into_iter().map(|r| r.ran_at).collect())
}

/// A best-effort label for the run's primary data structure — the most
/// common heap object type it allocated, e.g. "Node", "TreeNode". Never
/// invented: a run that allocated nothing on the heap (a straight-line
/// program with no pointers) honestly gets "Program" rather than a guess.
pub fn infer_structure(events: &[TraceEvent]) -> String {
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for event in events {
        if let TraceEvent::Step(step) = event {
            for obj in step.heap.values() {
                *counts.entry(obj.type_name.as_str()).or_insert(0) += 1;
            }
        }
    }
    counts.into_iter().max_by_key(|(_, n)| *n).map(|(name, _)| name.to_string()).unwrap_or_else(|| "Program".to_string())
}

/// How long a `snippet` may run before it's truncated with an ellipsis —
/// long enough to be recognizable, short enough for the Recent Traces
/// list's one line.
const SNIPPET_MAX_CHARS: usize = 64;

/// The first line of `source` that looks like actual code, for the Recent
/// Traces list — not a full extraction, just enough to jog the user's
/// memory about which run this was.
pub fn derive_snippet(source: &str) -> String {
    let line = source
        .lines()
        .map(str::trim)
        .find(|line| {
            !line.is_empty()
                && !line.starts_with('#')
                && !line.starts_with("//")
                && !line.starts_with("/*")
                && !line.starts_with("using namespace")
                && *line != "{"
                && *line != "}"
        })
        .unwrap_or("");

    if line.chars().count() > SNIPPET_MAX_CHARS {
        format!("{}…", line.chars().take(SNIPPET_MAX_CHARS).collect::<String>())
    } else {
        line.to_string()
    }
}
