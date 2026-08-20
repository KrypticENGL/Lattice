//! `/api/code-canvases` handlers — the Code-Canvas page's backend
//! (BLUEPRINT.md §4.3).
//!
//! Same shape and same guarantees as `api::canvases`: every route sits
//! behind the `ClerkLayer` (see main.rs), every query is scoped to
//! `clerk_jwt.sub`, and a row that exists but isn't the caller's 404s
//! exactly like one that doesn't exist — existence is never leaked.
//!
//! Beyond CRUD there are two derived-output routes: `generate` compiles a
//! stored graph to C++ and hands it back without writing anything, and
//! `visualize` compiles it into the graph's linked Visualizer canvas.

use super::AppState;
use crate::code_canvas::{self, codegen, graph::CanvasGraph, CodeCanvasPatch, VisualizeOutcome};
use axum::extract::{Extension, Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use clerk_rs::validators::authorizer::ClerkJwt;
use serde_json::json;
use uuid::Uuid;

fn db_error(e: sqlx::Error) -> Response {
    tracing::error!(error = %e, "code-canvas query failed");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({ "error": "database error, please try again" })),
    )
        .into_response()
}

fn not_found() -> Response {
    (
        StatusCode::NOT_FOUND,
        Json(json!({ "error": "code canvas not found" })),
    )
        .into_response()
}

/// A graph the server can't make sense of — an unknown block kind, a wire
/// to a handle that doesn't exist, a single-connection handle with two
/// wires on it. Rejected rather than stored: a graph that can't be
/// described also can't be compiled, and finding that out at save time
/// beats finding out at Visualize time.
fn invalid_graph(reason: String) -> Response {
    (StatusCode::BAD_REQUEST, Json(json!({ "error": reason }))).into_response()
}

/// Parses and validates a graph off the wire.
///
/// The graph arrives as raw JSON and is converted here rather than being
/// deserialized straight into the handler's argument, so that a bad *shape*
/// (an unknown block kind, a missing field) comes back as the same 400 with
/// the same `{"error": ...}` body as a bad *structure*. Letting axum's own
/// extractor reject it would answer 422 with a plain-text body the frontend
/// can't read a message out of.
fn parse_graph(raw: serde_json::Value) -> Result<CanvasGraph, Response> {
    let graph: CanvasGraph = serde_json::from_value(raw)
        .map_err(|e| invalid_graph(format!("this graph isn't one Lattice understands: {e}")))?;
    graph.validate().map_err(invalid_graph)?;
    Ok(graph)
}

pub async fn list(State(state): State<AppState>, Extension(clerk_jwt): Extension<ClerkJwt>) -> Response {
    match code_canvas::list(&state.pool, &clerk_jwt.sub).await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => db_error(e),
    }
}

/// Both fields optional: the page creates a canvas before the user has
/// named it or dragged anything out, so `{}` is the common case.
#[derive(serde::Deserialize, Default)]
pub struct CreateRequest {
    name: Option<String>,
    graph: Option<serde_json::Value>,
}

pub async fn create(
    State(state): State<AppState>,
    Extension(clerk_jwt): Extension<ClerkJwt>,
    Json(req): Json<CreateRequest>,
) -> Response {
    let name = req.name.unwrap_or_else(|| "Untitled graph".to_string());
    let graph = match req.graph {
        Some(raw) => match parse_graph(raw) {
            Ok(graph) => graph,
            Err(response) => return response,
        },
        None => CanvasGraph::default(),
    };
    match code_canvas::create(&state.pool, &clerk_jwt.sub, &name, &graph).await {
        Ok(canvas) => (StatusCode::CREATED, Json(canvas)).into_response(),
        Err(e) => db_error(e),
    }
}

pub async fn get(
    State(state): State<AppState>,
    Extension(clerk_jwt): Extension<ClerkJwt>,
    Path(id): Path<Uuid>,
) -> Response {
    match code_canvas::get(&state.pool, &clerk_jwt.sub, id).await {
        Ok(Some(canvas)) => (StatusCode::OK, Json(canvas)).into_response(),
        Ok(None) => not_found(),
        Err(e) => db_error(e),
    }
}

/// Mirrors `CodeCanvasPatch`, but with the graph left as raw JSON so
/// `parse_graph` can own the error shape (see its docs).
#[derive(serde::Deserialize, Default)]
pub struct UpdateRequest {
    name: Option<String>,
    graph: Option<serde_json::Value>,
}

pub async fn update(
    State(state): State<AppState>,
    Extension(clerk_jwt): Extension<ClerkJwt>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateRequest>,
) -> Response {
    let graph = match req.graph {
        Some(raw) => match parse_graph(raw) {
            Ok(graph) => Some(graph),
            Err(response) => return response,
        },
        None => None,
    };
    let patch = CodeCanvasPatch { name: req.name, graph };
    match code_canvas::update(&state.pool, &clerk_jwt.sub, id, &patch).await {
        Ok(Some(canvas)) => (StatusCode::OK, Json(canvas)).into_response(),
        Ok(None) => not_found(),
        Err(e) => db_error(e),
    }
}

pub async fn delete(
    State(state): State<AppState>,
    Extension(clerk_jwt): Extension<ClerkJwt>,
    Path(id): Path<Uuid>,
) -> Response {
    match code_canvas::delete(&state.pool, &clerk_jwt.sub, id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => not_found(),
        Err(e) => db_error(e),
    }
}

/// Compiles the stored graph and returns the source without persisting
/// anything — what the code pane shows, and the authority the frontend's
/// own preview generator is checked against.
pub async fn generate(
    State(state): State<AppState>,
    Extension(clerk_jwt): Extension<ClerkJwt>,
    Path(id): Path<Uuid>,
) -> Response {
    let canvas = match code_canvas::get(&state.pool, &clerk_jwt.sub, id).await {
        Ok(Some(canvas)) => canvas,
        Ok(None) => return not_found(),
        Err(e) => return db_error(e),
    };
    // Re-validated on the way out, not just on the way in: a graph stored
    // by an older build could predate a rule this one enforces.
    if let Err(reason) = canvas.graph.validate() {
        return invalid_graph(reason);
    }
    let generated = codegen::generate(&canvas.graph);
    (StatusCode::OK, Json(generated)).into_response()
}

/// Compiles the graph into its linked Visualizer canvas, creating that
/// canvas on first use. Answers with the canvas id to navigate to.
///
/// 201 the first time, 200 on every later press — the graph keeps one
/// derived canvas rather than spawning a new one per click.
pub async fn visualize(
    State(state): State<AppState>,
    Extension(clerk_jwt): Extension<ClerkJwt>,
    Path(id): Path<Uuid>,
) -> Response {
    let canvas = match code_canvas::get(&state.pool, &clerk_jwt.sub, id).await {
        Ok(Some(canvas)) => canvas,
        Ok(None) => return not_found(),
        Err(e) => return db_error(e),
    };
    if let Err(reason) = canvas.graph.validate() {
        return invalid_graph(reason);
    }

    match code_canvas::visualize(&state.pool, &clerk_jwt.sub, &canvas).await {
        Ok(result) => {
            let status = if result.outcome == VisualizeOutcome::Created {
                StatusCode::CREATED
            } else {
                StatusCode::OK
            };
            (
                status,
                Json(json!({
                    "canvas_id": result.canvas_id,
                    "outcome": result.outcome,
                    "source": result.generated.source,
                    "notes": result.generated.notes,
                })),
            )
                .into_response()
        }
        Err(e) => db_error(e),
    }
}
