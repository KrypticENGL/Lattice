//! One-shot import of everything Clerk already knows, run at startup.
//!
//! Webhooks only tell us about changes *from now on*. An instance that had
//! users before these tables existed would otherwise show an empty
//! `users` table until each person next edited their profile — so on boot
//! we page through Clerk's Backend API once and write what's there.
//!
//! Cheap to repeat: every write is an upsert keyed on Clerk's own ids, and
//! `upsert` never touches `role_id`, so a restart can't undo a promotion.
//! Failures are logged and swallowed — Clerk being briefly unreachable is
//! not a reason for the backend to refuse to start, since webhooks and
//! `users::ensure` will converge the tables anyway.

use super::{ClerkSession, ClerkUser};
use clerk_rs::clerk::Clerk;
use serde_json::Value;
use sqlx::PgPool;

/// Clerk's per-request maximum for these list endpoints.
const PAGE_SIZE: usize = 500;
/// Stop after this many pages. A guard against an unbounded loop if a
/// Clerk-side change ever made the "short page means done" test below stop
/// terminating; 100 pages is 50,000 users, far past anything this instance
/// will hold before someone revisits this.
const MAX_PAGES: usize = 100;
/// How many sessions to pull per user. Sessions are a mirror for querying,
/// not an archive — the recent ones are what anybody looks at.
const SESSIONS_PER_USER: usize = 50;

pub async fn run(pool: &PgPool, clerk: &Clerk) {
    let users = match fetch_users(clerk).await {
        Ok(users) => users,
        Err(e) => {
            tracing::warn!(error = %e, "could not import users from Clerk — webhooks will fill the table instead");
            return;
        }
    };

    let mut imported = 0usize;
    let mut sessions = 0usize;
    for user in &users {
        if let Err(e) = super::upsert(pool, user).await {
            tracing::warn!(error = %e, user_id = %user.id, "failed to import a Clerk user");
            continue;
        }
        imported += 1;
        match fetch_sessions(clerk, &user.id).await {
            Ok(found) => {
                for session in &found {
                    // Anything not currently active is closed as far as we
                    // care; `end_session` records when, while
                    // `upsert_session` leaves an active one open.
                    let result = match session.status.as_deref() {
                        Some("active") | None => super::upsert_session(pool, session, None, None).await,
                        Some(status) => {
                            // Clerk doesn't report *when* a session ended,
                            // so this is the closest honest answer: the
                            // last moment we know it was alive, or failing
                            // that its expiry. Both beat the import's own
                            // clock, which would date every historical row
                            // to this restart.
                            let ended_at = super::clerk_time(session.last_active_at)
                                .or_else(|| super::clerk_time(session.expire_at));
                            super::end_session(pool, session, status, ended_at).await
                        }
                    };
                    match result {
                        Ok(()) => sessions += 1,
                        Err(e) => tracing::warn!(error = %e, session_id = %session.id, "failed to import a session"),
                    }
                }
            }
            Err(e) => tracing::warn!(error = %e, user_id = %user.id, "could not list a user's Clerk sessions"),
        }
    }

    tracing::info!(users = imported, sessions, "imported existing Clerk users and sessions");
}

/// Pages through `GET /v1/users`.
///
/// Uses the pre-authenticated `reqwest::Client` inside the Clerk SDK's
/// configuration rather than its typed `UsersApi`, for two reasons: the
/// typed call has no pagination parameters, and its generated model
/// rejects payloads with unexpected shapes — which for a sync job means
/// one odd account could drop every user on the floor. Deserializing into
/// our own lenient `ClerkUser` (see `super`) is what keeps that from
/// happening.
async fn fetch_users(clerk: &Clerk) -> Result<Vec<ClerkUser>, String> {
    let mut all = Vec::new();
    for page in 0..MAX_PAGES {
        let url = format!(
            "{}/users?limit={PAGE_SIZE}&offset={}",
            clerk.config.base_path,
            page * PAGE_SIZE
        );
        let batch: Vec<ClerkUser> = get_list(clerk, &url).await?;
        let short = batch.len() < PAGE_SIZE;
        all.extend(batch);
        if short {
            break;
        }
    }
    Ok(all)
}

async fn fetch_sessions(clerk: &Clerk, user_id: &str) -> Result<Vec<ClerkSession>, String> {
    let url = format!(
        "{}/sessions?user_id={}&limit={SESSIONS_PER_USER}",
        clerk.config.base_path,
        urlencoding(user_id)
    );
    get_list(clerk, &url).await
}

/// Fetches a Clerk list endpoint, tolerating both response shapes it may
/// answer with: a bare JSON array (what these two endpoints return today)
/// or `{"data": [...]}` (the newer envelope Clerk has been moving list
/// endpoints toward). Rows that don't deserialize are skipped rather than
/// failing the batch.
async fn get_list<T: serde::de::DeserializeOwned>(clerk: &Clerk, url: &str) -> Result<Vec<T>, String> {
    let response = clerk
        .config
        .client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = response.status();
    let body: Value = response.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Clerk returned {status}: {body}"));
    }
    let items = match body {
        Value::Array(items) => items,
        Value::Object(mut map) => match map.remove("data") {
            Some(Value::Array(items)) => items,
            _ => return Err("unexpected response shape from Clerk".into()),
        },
        _ => return Err("unexpected response shape from Clerk".into()),
    };
    Ok(items
        .into_iter()
        .filter_map(|item| match serde_json::from_value(item) {
            Ok(parsed) => Some(parsed),
            Err(e) => {
                tracing::debug!(error = %e, "skipping a Clerk record this backend can't read");
                None
            }
        })
        .collect())
}

/// Percent-encodes a value for use in a query string. Clerk user ids are
/// `[A-Za-z0-9_]` only, so this is belt-and-braces rather than a
/// general-purpose encoder — it exists so a malformed id can't smuggle a
/// second query parameter into the URL.
fn urlencoding(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}
