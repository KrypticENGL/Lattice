//! `GET /api/traces` — the You page's Recent Traces list and Activity
//! heatmap, both read off the same `trace_runs` history (§ crate::trace_runs)
//! in one round trip, mirroring how the two widgets already sit side by
//! side reading the same mock array in `lib/dashboard-data.ts` today.

use super::{mongo_error, AppState};
use axum::extract::{Extension, State};
use axum::response::{IntoResponse, Response};
use axum::{http::StatusCode, Json};
use chrono::{DateTime, Duration, NaiveDate, Utc};
use clerk_rs::validators::authorizer::ClerkJwt;
use serde::Serialize;
use std::collections::HashMap;

/// Weeks of history the heatmap grid shows — matches the column count the
/// dummy `getActivityWeeks()` used to generate.
const WEEKS: i64 = 18;

#[derive(Debug, Clone, Serialize)]
pub struct ActivityDay {
    date: String,
    count: i64,
    level: u8,
}

#[derive(Serialize)]
pub struct TracesResponse {
    recent: Vec<crate::trace_runs::TraceRunView>,
    weeks: Vec<Vec<ActivityDay>>,
}

fn level_for(count: i64) -> u8 {
    match count {
        0 => 0,
        1 => 1,
        2 | 3 => 2,
        4 | 5 => 3,
        _ => 4,
    }
}

pub async fn list(State(state): State<AppState>, Extension(clerk_jwt): Extension<ClerkJwt>) -> Response {
    let user_id = &clerk_jwt.sub;

    let recent = match crate::trace_runs::recent(&state.mongo, user_id).await {
        Ok(rows) => rows,
        Err(e) => return mongo_error(e, "recent trace runs"),
    };

    let total_days = WEEKS * 7;
    let today = Utc::now().date_naive();
    let window_start = today - Duration::days(total_days - 1);
    let since = window_start
        .and_hms_opt(0, 0, 0)
        .expect("midnight is a valid time")
        .and_utc()
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    let timestamps = match crate::trace_runs::ran_at_since(&state.mongo, user_id, &since).await {
        Ok(rows) => rows,
        Err(e) => return mongo_error(e, "trace run activity"),
    };

    let mut counts: HashMap<NaiveDate, i64> = HashMap::new();
    for ts in timestamps {
        if let Ok(dt) = DateTime::parse_from_rfc3339(&ts) {
            *counts.entry(dt.with_timezone(&Utc).date_naive()).or_insert(0) += 1;
        }
    }

    let mut days = Vec::with_capacity(total_days as usize);
    for i in (0..total_days).rev() {
        let date = today - Duration::days(i);
        let count = *counts.get(&date).unwrap_or(&0);
        days.push(ActivityDay { date: date.format("%Y-%m-%d").to_string(), count, level: level_for(count) });
    }
    let weeks: Vec<Vec<ActivityDay>> = days.chunks(7).map(<[ActivityDay]>::to_vec).collect();

    (StatusCode::OK, Json(TracesResponse { recent, weeks })).into_response()
}
