//! `/api/canvases` handlers — the Visualizer's backend.
//!
//! All routes here sit behind the same `ClerkLayer` as the rest (see
//! main.rs): every handler takes `Extension<ClerkJwt>` and scopes every
//! query to `clerk_jwt.sub`, so one user can never read, edit or delete
//! another's canvas. A canvas that exists but isn't theirs 404s, same as
//! one that doesn't exist at all — existence isn't leaked.

use super::{mongo_error, AppState};
use crate::canvases::{self, CanvasPatch, UpdateOutcome};
use axum::extract::{Extension, Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use clerk_rs::validators::authorizer::ClerkJwt;
use serde_json::json;

fn not_found() -> Response {
    (StatusCode::NOT_FOUND, Json(json!({ "error": "canvas not found" }))).into_response()
}

pub async fn list(State(state): State<AppState>, Extension(jwt): Extension<ClerkJwt>) -> Response {
    match canvases::list(&state.mongo, &jwt.sub).await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => mongo_error(e, "canvas list"),
    }
}

/// Every field optional — the frontend always sends at least `{}`, so this
/// avoids a body-optional extractor for the common "just give me a new
/// canvas" case.
#[derive(serde::Deserialize, Default)]
pub struct CreateCanvasRequest {
    name: Option<String>,
    language: Option<String>,
}

pub async fn create(
    State(state): State<AppState>,
    Extension(jwt): Extension<ClerkJwt>,
    Json(req): Json<CreateCanvasRequest>,
) -> Response {
    let name = req.name.unwrap_or_else(|| "Untitled canvas".to_string());
    let language = req.language.unwrap_or_else(|| "cpp".to_string());
    // The owner row lives in Postgres and arrives by webhook, which a
    // local dev machine never receives and which can lag a fresh signup
    // anywhere else. Making it exist here keeps `users` a complete record
    // of everyone who has actually used Lattice, rather than only of
    // everyone whose webhook landed.
    if let Err(e) = crate::users::ensure(&state.pool, &jwt.sub).await {
        return super::db_error(e);
    }
    match canvases::create(&state.mongo, &jwt.sub, &name, &language).await {
        Ok(canvas) => (StatusCode::CREATED, Json(canvas)).into_response(),
        Err(e) => mongo_error(e, "canvas create"),
    }
}

pub async fn get(
    State(state): State<AppState>,
    Extension(jwt): Extension<ClerkJwt>,
    Path(id): Path<String>,
) -> Response {
    match canvases::get(&state.mongo, &jwt.sub, &id).await {
        Ok(Some(canvas)) => (StatusCode::OK, Json(canvas)).into_response(),
        Ok(None) => not_found(),
        Err(e) => mongo_error(e, "canvas get"),
    }
}

pub async fn update(
    State(state): State<AppState>,
    Extension(jwt): Extension<ClerkJwt>,
    Path(id): Path<String>,
    Json(patch): Json<CanvasPatch>,
) -> Response {
    match canvases::update(&state.mongo, &jwt.sub, &id, &patch).await {
        Ok(UpdateOutcome::Updated(canvas)) => (StatusCode::OK, Json(canvas)).into_response(),
        Ok(UpdateOutcome::NotFound) => not_found(),
        // 409 rather than 403: the caller is allowed to touch this canvas
        // (they own it), the request just conflicts with what it *is* —
        // its code belongs to the graph that generated it.
        Ok(UpdateOutcome::ReadOnly) => (
            StatusCode::CONFLICT,
            Json(json!({
                "error": "this canvas's code is generated from a Code-Canvas graph — \
                          edit the graph and press Visualize to change it"
            })),
        )
            .into_response(),
        Err(e) => mongo_error(e, "canvas update"),
    }
}

pub async fn delete(
    State(state): State<AppState>,
    Extension(jwt): Extension<ClerkJwt>,
    Path(id): Path<String>,
) -> Response {
    match canvases::delete(&state.mongo, &jwt.sub, &id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => not_found(),
        Err(e) => mongo_error(e, "canvas delete"),
    }
}
