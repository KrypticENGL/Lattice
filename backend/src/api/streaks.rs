//! `GET /api/streaks/me` — the caller's day streak.
//!
//! Read side of `crate::streaks`; the write side (`record_activity`)
//! isn't reachable through a route at all — it runs inside `execute`
//! (§ api::mod) each time a trace actually completes, so a streak reports
//! what a user did, never what they told the API they did.

use super::{db_error, AppState};
use axum::extract::{Extension, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use clerk_rs::validators::authorizer::ClerkJwt;

pub async fn me(State(state): State<AppState>, Extension(clerk_jwt): Extension<ClerkJwt>) -> Response {
    match crate::streaks::get(&state.pool, &clerk_jwt.sub).await {
        Ok(streak) => (StatusCode::OK, Json(streak)).into_response(),
        Err(e) => db_error(e),
    }
}
