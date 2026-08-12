//! `/api/canvases` handlers (BLUEPRINT.md §11, scoped per the plan this
//! shipped under — see `crate::canvases` for the data-access layer these
//! wrap). All routes here sit behind the same `ClerkLayer` protection as
//! `/api/execute` (see main.rs) — every handler takes `Extension<ClerkJwt>`
//! and scopes every query to `clerk_jwt.sub`, so one user can never read,
//! edit, or delete another's canvas. A row that exists but isn't theirs
//! 404s, same as a row that doesn't exist at all — existence isn't leaked.

use super::AppState;
use crate::canvases::{self, CanvasPatch};
use axum::extract::{Extension, Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use clerk_rs::validators::authorizer::ClerkJwt;
use serde_json::json;
use uuid::Uuid;

fn db_error(e: sqlx::Error) -> Response {
    tracing::error!(error = %e, "canvas query failed");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({ "error": "database error, please try again" })),
    )
        .into_response()
}

fn not_found() -> Response {
    (StatusCode::NOT_FOUND, Json(json!({ "error": "canvas not found" }))).into_response()
}

pub async fn list(State(state): State<AppState>, Extension(clerk_jwt): Extension<ClerkJwt>) -> Response {
    match canvases::list(&state.pool, &clerk_jwt.sub).await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => db_error(e),
    }
}

/// Every field optional — the frontend always sends at least `{}` (see
/// `lib/canvases.ts`'s `createCanvas`), so this avoids needing a
/// body-optional extractor for the common "just give me a new canvas" case.
#[derive(serde::Deserialize, Default)]
pub struct CreateCanvasRequest {
    name: Option<String>,
    language: Option<String>,
}

pub async fn create(
    State(state): State<AppState>,
    Extension(clerk_jwt): Extension<ClerkJwt>,
    Json(req): Json<CreateCanvasRequest>,
) -> Response {
    let name = req.name.unwrap_or_else(|| "Untitled canvas".to_string());
    let language = req.language.unwrap_or_else(|| "cpp".to_string());
    match canvases::create(&state.pool, &clerk_jwt.sub, &name, &language).await {
        Ok(canvas) => (StatusCode::CREATED, Json(canvas)).into_response(),
        Err(e) => db_error(e),
    }
}

pub async fn get(
    State(state): State<AppState>,
    Extension(clerk_jwt): Extension<ClerkJwt>,
    Path(id): Path<Uuid>,
) -> Response {
    match canvases::get(&state.pool, &clerk_jwt.sub, id).await {
        Ok(Some(canvas)) => (StatusCode::OK, Json(canvas)).into_response(),
        Ok(None) => not_found(),
        Err(e) => db_error(e),
    }
}

pub async fn update(
    State(state): State<AppState>,
    Extension(clerk_jwt): Extension<ClerkJwt>,
    Path(id): Path<Uuid>,
    Json(patch): Json<CanvasPatch>,
) -> Response {
    match canvases::update(&state.pool, &clerk_jwt.sub, id, &patch).await {
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
    match canvases::delete(&state.pool, &clerk_jwt.sub, id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => not_found(),
        Err(e) => db_error(e),
    }
}
