//! Persistent Code-Canvas graphs (BLUEPRINT.md §4.3) and the derived
//! Visualizer canvases they generate.
//!
//! Same conventions as `crate::canvases`: runtime-checked queries
//! (`sqlx::query`/`query_as`, never the `query!` macro) so `cargo check`
//! never needs a live database, and every query scoped to the Clerk `sub`
//! of the caller.

pub mod codegen;
pub mod graph;

use chrono::{DateTime, Utc};
use graph::CanvasGraph;
use serde::{Deserialize, Serialize};
use sqlx::types::Json;
use sqlx::PgPool;
use uuid::Uuid;

/// The language every graph compiles to today. Kept as a named constant
/// rather than inlined, so the day a second backend lands there's one
/// place that has to grow a decision.
pub const GENERATED_LANGUAGE: &str = "cpp";

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct CodeCanvas {
    pub id: Uuid,
    pub owner_id: String,
    pub name: String,
    pub graph: Json<CanvasGraph>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Row for a quick-switcher: no graph payload, just enough to list and
/// sort. Counts come from the JSON itself rather than denormalized
/// columns — nothing has to stay in sync that way.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct CodeCanvasSummary {
    pub id: Uuid,
    pub name: String,
    pub node_count: i32,
    pub edge_count: i32,
    pub updated_at: DateTime<Utc>,
}

/// `PATCH /api/code-canvases/{id}` body. `None` means "leave unchanged".
#[derive(Debug, Default, Deserialize)]
pub struct CodeCanvasPatch {
    pub name: Option<String>,
    pub graph: Option<CanvasGraph>,
}

const SUMMARY_COLUMNS: &str = "id, name, \
     COALESCE(jsonb_array_length(graph -> 'nodes'), 0) AS node_count, \
     COALESCE(jsonb_array_length(graph -> 'edges'), 0) AS edge_count, \
     updated_at";

pub async fn list(pool: &PgPool, owner_id: &str) -> sqlx::Result<Vec<CodeCanvasSummary>> {
    sqlx::query_as::<_, CodeCanvasSummary>(&format!(
        "SELECT {SUMMARY_COLUMNS} FROM code_canvases WHERE owner_id = $1 ORDER BY updated_at DESC"
    ))
    .bind(owner_id)
    .fetch_all(pool)
    .await
}

pub async fn create(
    pool: &PgPool,
    owner_id: &str,
    name: &str,
    graph: &CanvasGraph,
) -> sqlx::Result<CodeCanvas> {
    sqlx::query_as::<_, CodeCanvas>(
        "INSERT INTO code_canvases (id, owner_id, name, graph) VALUES ($1, $2, $3, $4) RETURNING *",
    )
    .bind(Uuid::new_v4())
    .bind(owner_id)
    .bind(name)
    .bind(Json(graph))
    .fetch_one(pool)
    .await
}

pub async fn get(pool: &PgPool, owner_id: &str, id: Uuid) -> sqlx::Result<Option<CodeCanvas>> {
    sqlx::query_as::<_, CodeCanvas>("SELECT * FROM code_canvases WHERE id = $1 AND owner_id = $2")
        .bind(id)
        .bind(owner_id)
        .fetch_optional(pool)
        .await
}

pub async fn update(
    pool: &PgPool,
    owner_id: &str,
    id: Uuid,
    patch: &CodeCanvasPatch,
) -> sqlx::Result<Option<CodeCanvas>> {
    sqlx::query_as::<_, CodeCanvas>(
        "UPDATE code_canvases SET \
            name = COALESCE($1, name), \
            graph = COALESCE($2, graph), \
            updated_at = now() \
         WHERE id = $3 AND owner_id = $4 \
         RETURNING *",
    )
    .bind(&patch.name)
    .bind(patch.graph.as_ref().map(Json))
    .bind(id)
    .bind(owner_id)
    .fetch_optional(pool)
    .await
}

pub async fn delete(pool: &PgPool, owner_id: &str, id: Uuid) -> sqlx::Result<bool> {
    let result = sqlx::query("DELETE FROM code_canvases WHERE id = $1 AND owner_id = $2")
        .bind(id)
        .bind(owner_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

/// What `visualize` did, so the handler can answer 200 vs 201 honestly and
/// the frontend can tell "here's your canvas again" from "here's a new one".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum VisualizeOutcome {
    Created,
    Refreshed,
    /// The graph compiled to exactly what the linked canvas already holds,
    /// so nothing was written — and, importantly, the trace already sitting
    /// on it is still valid and was left alone.
    Unchanged,
}

pub struct Visualized {
    pub canvas_id: Uuid,
    pub outcome: VisualizeOutcome,
    pub generated: codegen::GeneratedCode,
}

/// Compiles a graph and pushes the result into its linked Visualizer
/// canvas, creating that canvas the first time.
///
/// Upsert rather than insert: a graph has at most one derived canvas (see
/// the unique index in migration 0002), so pressing Visualize repeatedly
/// refreshes one canvas instead of littering the Visualizer with a new one
/// per click. When the regenerated source differs from what's stored, the
/// trace is cleared along with it — a trace describes the code it ran
/// against, and holding a stale one beside fresh source would put the
/// step highlight on the wrong lines.
///
/// Runs in a transaction: generating, inserting the canvas, and linking it
/// have to happen together or not at all, or a failure halfway leaves a
/// canvas nothing points at.
pub async fn visualize(
    pool: &PgPool,
    owner_id: &str,
    code_canvas: &CodeCanvas,
) -> sqlx::Result<Visualized> {
    let generated = codegen::generate(&code_canvas.graph);

    let mut tx = pool.begin().await?;

    let existing: Option<(Uuid, String)> = sqlx::query_as(
        "SELECT id, source_code FROM canvases WHERE code_canvas_id = $1 AND owner_id = $2 FOR UPDATE",
    )
    .bind(code_canvas.id)
    .bind(owner_id)
    .fetch_optional(&mut *tx)
    .await?;

    let result = match existing {
        Some((canvas_id, current_source)) if current_source == generated.source => {
            Visualized { canvas_id, outcome: VisualizeOutcome::Unchanged, generated }
        }
        Some((canvas_id, _)) => {
            // `name` is deliberately absent: it is seeded from the graph
            // when the canvas is created, but renaming a canvas is
            // something the user does to *that canvas*, and a later
            // Visualize shouldn't silently undo it.
            sqlx::query(
                "UPDATE canvases SET \
                    source_code = $1, trace_data = NULL, stdout = NULL, \
                    compile_command = NULL, compiler_output = NULL, truncated = false, \
                    step_index = 0, updated_at = now() \
                 WHERE id = $2 AND owner_id = $3",
            )
            .bind(&generated.source)
            .bind(canvas_id)
            .bind(owner_id)
            .execute(&mut *tx)
            .await?;
            Visualized { canvas_id, outcome: VisualizeOutcome::Refreshed, generated }
        }
        None => {
            let canvas_id = Uuid::new_v4();
            sqlx::query(
                "INSERT INTO canvases (id, owner_id, name, language, source_code, origin, code_canvas_id) \
                 VALUES ($1, $2, $3, $4, $5, 'code_canvas', $6)",
            )
            .bind(canvas_id)
            .bind(owner_id)
            .bind(derived_name(&code_canvas.name))
            .bind(GENERATED_LANGUAGE)
            .bind(&generated.source)
            .bind(code_canvas.id)
            .execute(&mut *tx)
            .await?;
            Visualized { canvas_id, outcome: VisualizeOutcome::Created, generated }
        }
    };

    tx.commit().await?;
    Ok(result)
}

/// Seeds the derived canvas's name from its graph, so it arrives in the
/// Visualizer's switcher already recognisable. Only applied at creation —
/// see the refresh branch above.
fn derived_name(graph_name: &str) -> String {
    let trimmed = graph_name.trim();
    if trimmed.is_empty() {
        "Untitled graph".to_string()
    } else {
        trimmed.to_string()
    }
}
