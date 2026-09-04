//! `GET /api/notifications` — the You page's Notifications widget: comments
//! on the caller's own posts, written by someone else. Read side of
//! `crate::posts::notifications`; see that function for why every row here
//! reads "commented on" rather than distinguishing a "replied to" case.

use super::{mongo_error, AppState};
use axum::extract::{Extension, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use clerk_rs::validators::authorizer::ClerkJwt;

pub async fn list(State(state): State<AppState>, Extension(clerk_jwt): Extension<ClerkJwt>) -> Response {
    match crate::posts::notifications(&state.mongo, &clerk_jwt.sub).await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => mongo_error(e, "notifications"),
    }
}
