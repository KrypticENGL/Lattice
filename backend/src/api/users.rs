//! `GET /api/me` — the caller's own row from `users`, with their role.
//!
//! The JWT already tells the frontend who it is signed in as; what it
//! can't say is anything this backend stores *about* that person, which
//! right now means their role. So this returns the row rather than the
//! claims: it's the read side of the Clerk sync (§ crate::users), and the
//! only reason `roles` is queryable at all.

use super::{db_error, AppState};
use crate::users;
use axum::extract::{Extension, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use clerk_rs::validators::authorizer::ClerkJwt;
use serde_json::json;

pub async fn me(State(state): State<AppState>, Extension(clerk_jwt): Extension<ClerkJwt>) -> Response {
    // A verified caller always has a row after this, even on the very
    // first request of a fresh signup whose webhook hasn't landed — the
    // profile columns fill in when it does. Answering 404 for somebody
    // Clerk just authenticated would be a lie about who exists.
    if let Err(e) = users::ensure(&state.pool, &clerk_jwt.sub).await {
        return db_error(e);
    }

    match users::get(&state.pool, &clerk_jwt.sub).await {
        Ok(Some(user)) => {
            // `role_name` alongside `role_id` so a client can render "admin"
            // without hardcoding the same 0/1/2 mapping the server already
            // owns. `None` is impossible while the foreign key holds, but
            // it's read from the same source of truth rather than assumed.
            let role_name = users::role_name(user.role_id);
            (StatusCode::OK, Json(json!({ "user": user, "role_name": role_name }))).into_response()
        }
        // The `ensure` above just wrote this row, so its absence means it
        // was deleted between the two statements — a real race, not a
        // routine miss, and not worth a retry loop.
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "user not found" })),
        )
            .into_response(),
        Err(e) => db_error(e),
    }
}
