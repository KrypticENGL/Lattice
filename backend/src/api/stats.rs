//! `GET /api/stats/me` — the You page's three stat cards (canvases created,
//! traces run, day streak), backed by real counts instead of the mock
//! `STATS` array `lib/dashboard-data.ts` used to export.

use super::{db_error, mongo_error, AppState};
use axum::extract::{Extension, State};
use axum::response::{IntoResponse, Response};
use axum::{http::StatusCode, Json};
use chrono::{Duration, Utc};
use clerk_rs::validators::authorizer::ClerkJwt;
use serde::Serialize;

#[derive(Serialize)]
pub struct StatsResponse {
    canvases_created: u64,
    canvases_created_this_week: u64,
    traces_run: u64,
    traces_run_this_week: u64,
    current_streak: i32,
    longest_streak: i32,
}

pub async fn me(State(state): State<AppState>, Extension(clerk_jwt): Extension<ClerkJwt>) -> Response {
    let user_id = &clerk_jwt.sub;
    // A rolling 7 days, not a calendar week — there's no "start of week"
    // that means the same thing to every caller, and this is what the
    // streak's own UTC-day accounting already assumes elsewhere.
    let since = (Utc::now() - Duration::days(7)).to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    let canvases_created = match crate::canvases::count(&state.mongo, user_id).await {
        Ok(n) => n,
        Err(e) => return mongo_error(e, "canvas count"),
    };
    let canvases_created_this_week = match crate::canvases::count_since(&state.mongo, user_id, &since).await {
        Ok(n) => n,
        Err(e) => return mongo_error(e, "canvas count since"),
    };
    let traces_run = match crate::trace_runs::count(&state.mongo, user_id).await {
        Ok(n) => n,
        Err(e) => return mongo_error(e, "trace run count"),
    };
    let traces_run_this_week = match crate::trace_runs::count_since(&state.mongo, user_id, &since).await {
        Ok(n) => n,
        Err(e) => return mongo_error(e, "trace run count since"),
    };
    let streak = match crate::streaks::get(&state.pool, user_id).await {
        Ok(streak) => streak,
        Err(e) => return db_error(e),
    };

    (
        StatusCode::OK,
        Json(StatsResponse {
            canvases_created,
            canvases_created_this_week,
            traces_run,
            traces_run_this_week,
            current_streak: streak.current_streak,
            longest_streak: streak.longest_streak,
        }),
    )
        .into_response()
}
