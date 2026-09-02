//! `/api/code-canvases` handlers — the Code-Canvas page's backend.
//!
//! Same shape and same guarantees as `api::canvases`: behind the
//! `ClerkLayer`, every query scoped to `clerk_jwt.sub`, and a row that
//! isn't the caller's 404s exactly like one that doesn't exist.

use super::{mongo_error, AppState};
use crate::code_canvas::{self, CodeCanvasPatch};
use axum::extract::{Extension, Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use clerk_rs::validators::authorizer::ClerkJwt;
use mongodb::bson::Document;
use serde_json::json;

fn not_found() -> Response {
    (StatusCode::NOT_FOUND, Json(json!({ "error": "code canvas not found" }))).into_response()
}

fn invalid_graph(reason: String) -> Response {
    (StatusCode::BAD_REQUEST, Json(json!({ "error": reason }))).into_response()
}

/// Converts an incoming graph from JSON to the BSON document that gets
/// stored, rejecting anything that isn't shaped like a graph.
///
/// The conversion can itself fail — BSON can't hold every JSON value (a
/// key containing a `.`, for instance) — so both failures are answered as
/// the same 400 with the same `{"error": ...}` body the frontend already
/// reads a message out of.
fn parse_graph(raw: serde_json::Value) -> Result<Document, Response> {
    let graph: Document = mongodb::bson::to_document(&raw)
        .map_err(|e| invalid_graph(format!("this graph isn't one Lattice understands: {e}")))?;
    code_canvas::validate(&graph).map_err(invalid_graph)?;
    Ok(graph)
}

pub async fn list(State(state): State<AppState>, Extension(jwt): Extension<ClerkJwt>) -> Response {
    match code_canvas::list(&state.mongo, &jwt.sub).await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => mongo_error(e, "code-canvas list"),
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
    Extension(jwt): Extension<ClerkJwt>,
    Json(req): Json<CreateRequest>,
) -> Response {
    let name = req.name.unwrap_or_else(|| "Untitled graph".to_string());
    let graph = match req.graph.map(parse_graph).transpose() {
        Ok(graph) => graph,
        Err(response) => return response,
    };
    if let Err(e) = crate::users::ensure(&state.pool, &jwt.sub).await {
        return super::db_error(e);
    }
    match code_canvas::create(&state.mongo, &jwt.sub, &name, graph).await {
        Ok(canvas) => (StatusCode::CREATED, Json(canvas)).into_response(),
        Err(e) => mongo_error(e, "code-canvas create"),
    }
}

pub async fn get(
    State(state): State<AppState>,
    Extension(jwt): Extension<ClerkJwt>,
    Path(id): Path<String>,
) -> Response {
    match code_canvas::get(&state.mongo, &jwt.sub, &id).await {
        Ok(Some(canvas)) => (StatusCode::OK, Json(canvas)).into_response(),
        Ok(None) => not_found(),
        Err(e) => mongo_error(e, "code-canvas get"),
    }
}

#[derive(serde::Deserialize, Default)]
pub struct PatchRequest {
    name: Option<String>,
    graph: Option<serde_json::Value>,
}

pub async fn update(
    State(state): State<AppState>,
    Extension(jwt): Extension<ClerkJwt>,
    Path(id): Path<String>,
    Json(req): Json<PatchRequest>,
) -> Response {
    let graph = match req.graph.map(parse_graph).transpose() {
        Ok(graph) => graph,
        Err(response) => return response,
    };
    let patch = CodeCanvasPatch { name: req.name, graph };
    match code_canvas::update(&state.mongo, &jwt.sub, &id, &patch).await {
        Ok(Some(canvas)) => (StatusCode::OK, Json(canvas)).into_response(),
        Ok(None) => not_found(),
        Err(e) => mongo_error(e, "code-canvas update"),
    }
}

pub async fn delete(
    State(state): State<AppState>,
    Extension(jwt): Extension<ClerkJwt>,
    Path(id): Path<String>,
) -> Response {
    match code_canvas::delete(&state.mongo, &jwt.sub, &id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => not_found(),
        Err(e) => mongo_error(e, "code-canvas delete"),
    }
}

/// The compiled C++ the client wants pushed into this graph's canvas.
///
/// Sent rather than generated here because the compiler lives in
/// `frontend/lib/code-canvas/codegen.ts`, where it also drives the live
/// code pane — one implementation, so what you watch being built is what
/// runs. See `code_canvas::visualize`.
#[derive(serde::Deserialize)]
pub struct VisualizeRequest {
    source: String,
}

pub async fn visualize(
    State(state): State<AppState>,
    Extension(jwt): Extension<ClerkJwt>,
    Path(id): Path<String>,
    Json(req): Json<VisualizeRequest>,
) -> Response {
    if req.source.trim().is_empty() {
        return invalid_graph("there's nothing on this canvas to visualize yet".to_string());
    }
    match code_canvas::visualize(&state.mongo, &jwt.sub, &id, &req.source).await {
        Ok(Some(result)) => {
            // 201 only when a canvas was actually created, so the frontend
            // can tell "here's a new one" from "here's yours again".
            let status = match result.outcome {
                code_canvas::VisualizeOutcome::Created => StatusCode::CREATED,
                _ => StatusCode::OK,
            };
            (
                status,
                Json(json!({ "canvas_id": result.canvas_id, "outcome": result.outcome })),
            )
                .into_response()
        }
        Ok(None) => not_found(),
        Err(e) => mongo_error(e, "code-canvas visualize"),
    }
}
