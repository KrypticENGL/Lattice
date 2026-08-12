//! Persistent Visualizer workspaces (BLUEPRINT.md §10, scoped down for the
//! Visualizer's current needs — see the plan this shipped under: one canvas
//! is one current snapshot (code + latest trace + resume step), not a
//! history of many runs, and `owner_id` is the Clerk `sub` claim directly
//! rather than a FK into a webhook-synced `users` table).
//!
//! Runtime-checked queries throughout (`sqlx::query`/`query_as`, not the
//! `query!` macro) so `cargo check` never needs a live database connection.

use crate::trace::TraceEvent;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::types::Json;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Canvas {
    pub id: Uuid,
    pub owner_id: String,
    pub name: String,
    pub language: String,
    pub source_code: String,
    pub trace_data: Option<Json<Vec<TraceEvent>>>,
    pub stdout: Option<String>,
    pub compile_command: Option<String>,
    pub compiler_output: Option<String>,
    pub truncated: bool,
    pub step_index: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Lightweight row for the canvases quick-switcher — no source/trace
/// payload, just enough to render and sort the list.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct CanvasSummary {
    pub id: Uuid,
    pub name: String,
    pub language: String,
    pub updated_at: DateTime<Utc>,
    pub step_count: i32,
}

/// `PATCH /api/canvases/{id}` body — every field optional, `None` means
/// "leave unchanged" (see `update`'s `COALESCE` usage).
#[derive(Debug, Default, Deserialize)]
pub struct CanvasPatch {
    pub name: Option<String>,
    pub language: Option<String>,
    pub source_code: Option<String>,
    pub step_index: Option<i32>,
}

/// What a completed sandbox run writes onto a canvas (see `record_run`).
/// Borrowed, not owned — the caller (`api::execute`) already has these
/// values live from the sandbox outcome it's persisting.
pub struct RunResult<'a> {
    pub source_code: &'a str,
    pub trace_data: Option<&'a [TraceEvent]>,
    pub stdout: Option<&'a str>,
    pub compile_command: Option<&'a str>,
    pub compiler_output: Option<&'a str>,
    pub truncated: bool,
}

pub async fn list(pool: &PgPool, owner_id: &str) -> sqlx::Result<Vec<CanvasSummary>> {
    sqlx::query_as::<_, CanvasSummary>(
        "SELECT id, name, language, updated_at, COALESCE(jsonb_array_length(trace_data), 0) AS step_count \
         FROM canvases WHERE owner_id = $1 ORDER BY updated_at DESC",
    )
    .bind(owner_id)
    .fetch_all(pool)
    .await
}

pub async fn create(pool: &PgPool, owner_id: &str, name: &str, language: &str) -> sqlx::Result<Canvas> {
    let id = Uuid::new_v4();
    sqlx::query_as::<_, Canvas>(
        "INSERT INTO canvases (id, owner_id, name, language) VALUES ($1, $2, $3, $4) RETURNING *",
    )
    .bind(id)
    .bind(owner_id)
    .bind(name)
    .bind(language)
    .fetch_one(pool)
    .await
}

pub async fn get(pool: &PgPool, owner_id: &str, id: Uuid) -> sqlx::Result<Option<Canvas>> {
    sqlx::query_as::<_, Canvas>("SELECT * FROM canvases WHERE id = $1 AND owner_id = $2")
        .bind(id)
        .bind(owner_id)
        .fetch_optional(pool)
        .await
}

pub async fn update(
    pool: &PgPool,
    owner_id: &str,
    id: Uuid,
    patch: &CanvasPatch,
) -> sqlx::Result<Option<Canvas>> {
    sqlx::query_as::<_, Canvas>(
        "UPDATE canvases SET \
            name = COALESCE($1, name), \
            language = COALESCE($2, language), \
            source_code = COALESCE($3, source_code), \
            step_index = COALESCE($4, step_index), \
            updated_at = now() \
         WHERE id = $5 AND owner_id = $6 \
         RETURNING *",
    )
    .bind(&patch.name)
    .bind(&patch.language)
    .bind(&patch.source_code)
    .bind(patch.step_index)
    .bind(id)
    .bind(owner_id)
    .fetch_optional(pool)
    .await
}

pub async fn delete(pool: &PgPool, owner_id: &str, id: Uuid) -> sqlx::Result<bool> {
    let result = sqlx::query("DELETE FROM canvases WHERE id = $1 AND owner_id = $2")
        .bind(id)
        .bind(owner_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

/// Overwrites a canvas's run-related fields after a sandbox execution
/// completes (§ "spin containers inside canvases") — unconditional, unlike
/// `update`'s `COALESCE` patch semantics, because a new run always fully
/// replaces the previous one's results and resets the resume step to 0.
/// Returns `false` if `id` doesn't exist or isn't owned by `owner_id`, so
/// the caller can 404 rather than silently drop the save.
pub async fn record_run(
    pool: &PgPool,
    owner_id: &str,
    id: Uuid,
    run: RunResult<'_>,
) -> sqlx::Result<bool> {
    let trace_json = run.trace_data.map(|events| Json(events.to_vec()));
    let result = sqlx::query(
        "UPDATE canvases SET \
            source_code = $1, trace_data = $2, stdout = $3, compile_command = $4, \
            compiler_output = $5, truncated = $6, step_index = 0, updated_at = now() \
         WHERE id = $7 AND owner_id = $8",
    )
    .bind(run.source_code)
    .bind(trace_json)
    .bind(run.stdout)
    .bind(run.compile_command)
    .bind(run.compiler_output)
    .bind(run.truncated)
    .bind(id)
    .bind(owner_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}
