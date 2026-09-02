//! `POST /api/webhooks/clerk` — how `users` and `sessions` stay in step
//! with Clerk.
//!
//! This route sits *outside* the `ClerkLayer` that protects everything
//! else (see main.rs). Clerk's webhook delivery is a server-to-server call
//! carrying no user session token, so requiring one would reject every
//! event. Its authentication is the Svix signature verified below instead,
//! which is why `verify` is not optional: without it this endpoint would
//! let anyone on the internet rewrite the users table.

use super::AppState;
use crate::users::{self, ClerkSession, ClerkUser};
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use hmac::{Hmac, Mac};
use serde::Deserialize;
use serde_json::json;
use sha2::Sha256;
use subtle::ConstantTimeEq;

/// How far a webhook's own timestamp may be from ours before we reject it.
/// Svix's recommended tolerance: long enough to absorb clock skew and
/// retry delay, short enough that a captured request can't be replayed
/// days later.
const TIMESTAMP_TOLERANCE_SECS: i64 = 5 * 60;

/// The envelope every Clerk webhook shares. `data` stays untyped here and
/// is deserialized per event below, because the shape depends entirely on
/// `type`.
#[derive(Deserialize)]
struct Event {
    #[serde(rename = "type")]
    event_type: String,
    data: serde_json::Value,
}

pub async fn clerk(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> Response {
    let Some(secret) = state.clerk_webhook_secret.as_deref() else {
        // Not configured is a deployment problem, not a caller problem —
        // and answering 200 would tell Clerk the event was handled when
        // nothing was written.
        tracing::warn!("received a Clerk webhook but CLERK_WEBHOOK_SECRET is not set");
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "webhooks are not configured on this server" })),
        )
            .into_response();
    };

    if let Err(reason) = verify(secret, &headers, &body) {
        tracing::warn!(reason, "rejected a Clerk webhook with a bad signature");
        return (StatusCode::UNAUTHORIZED, Json(json!({ "error": "invalid signature" }))).into_response();
    }

    let event: Event = match serde_json::from_slice(&body) {
        Ok(event) => event,
        Err(e) => {
            tracing::warn!(error = %e, "could not parse a Clerk webhook body");
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": "malformed event" }))).into_response();
        }
    };

    match handle(&state, &event).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        // 500 rather than 200-and-log: Svix retries a failed delivery with
        // backoff, so reporting the failure honestly is what gets the row
        // written on the next attempt instead of losing the event.
        Err(e) => {
            tracing::error!(error = %e, event = %event.event_type, "failed to apply a Clerk webhook");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "could not apply event" })),
            )
                .into_response()
        }
    }
}

async fn handle(state: &AppState, event: &Event) -> sqlx::Result<()> {
    match event.event_type.as_str() {
        "user.created" | "user.updated" => {
            let Some(user) = parse::<ClerkUser>(event) else { return Ok(()) };
            users::upsert(&state.pool, &user).await?;
        }
        "user.deleted" => {
            // A delete event carries only `{id, deleted, object}`, not a
            // full user, so it gets its own minimal shape.
            #[derive(Deserialize)]
            struct Deleted {
                id: String,
            }
            let Some(deleted) = parse::<Deleted>(event) else { return Ok(()) };
            let removed = users::delete(&state.pool, &deleted.id).await?;
            // Postgres's ON DELETE CASCADE stops at its own database, so
            // the user's work in Mongo has to be erased explicitly — a
            // failure here is logged rather than retried, because the
            // identity row is already gone and answering 500 would make
            // Svix redeliver an event whose Postgres half has succeeded.
            match crate::mongo::delete_owner(&state.mongo, &deleted.id).await {
                Ok(documents) => {
                    tracing::info!(user_id = %deleted.id, removed, documents, "applied user.deleted")
                }
                Err(e) => tracing::error!(
                    error = %e,
                    user_id = %deleted.id,
                    "removed the user but failed to erase their content from MongoDB"
                ),
            }
        }
        "session.created" | "session.pending" => {
            let Some(session) = parse::<ClerkSession>(event) else { return Ok(()) };
            // Clerk does not include the signing-in client's IP or user
            // agent in this payload, so both stay NULL until something
            // that does know them fills them in. Recording *our* peer
            // address would be worse than nothing: it is Svix's, not the
            // user's.
            users::upsert_session(&state.pool, &session, None, None).await?;
        }
        "session.ended" | "session.removed" | "session.revoked" => {
            let Some(session) = parse::<ClerkSession>(event) else { return Ok(()) };
            // The event name is more precise than the payload's `status`
            // (which may still read "active" on a just-revoked session),
            // so the name is what gets stored.
            let status = event.event_type.trim_start_matches("session.");
            // `None` for the end instant: this event *is* the session
            // ending, so now() is the truth.
            users::end_session(&state.pool, &session, status, None).await?;
        }
        other => tracing::debug!(event = other, "ignoring an unsubscribed Clerk event"),
    }
    Ok(())
}

/// A malformed `data` for an event type we *do* handle is logged and
/// skipped rather than retried: retrying can only produce the same
/// unparseable payload, so a 500 here would just make Svix repeat it until
/// it gave up.
fn parse<T: serde::de::DeserializeOwned>(event: &Event) -> Option<T> {
    match serde_json::from_value(event.data.clone()) {
        Ok(parsed) => Some(parsed),
        Err(e) => {
            tracing::warn!(error = %e, event = %event.event_type, "could not read a Clerk webhook payload");
            None
        }
    }
}

/// Verifies a Svix signature over the raw request body.
///
/// Implemented directly rather than pulling in the `svix` crate: the
/// scheme is four lines of HMAC, and the whole of what that dependency
/// would add here is this function.
///
/// The signed content is `{svix-id}.{svix-timestamp}.{body}` — the id and
/// timestamp are inside the MAC, so neither can be altered to replay a
/// captured body under a fresh timestamp.
fn verify(secret: &str, headers: &HeaderMap, body: &[u8]) -> Result<(), &'static str> {
    let header = |name: &str| headers.get(name).and_then(|v| v.to_str().ok());
    let id = header("svix-id").ok_or("missing svix-id")?;
    let timestamp = header("svix-timestamp").ok_or("missing svix-timestamp")?;
    let signatures = header("svix-signature").ok_or("missing svix-signature")?;

    let sent: i64 = timestamp.parse().map_err(|_| "unparseable svix-timestamp")?;
    let skew = (chrono::Utc::now().timestamp() - sent).abs();
    if skew > TIMESTAMP_TOLERANCE_SECS {
        return Err("svix-timestamp is outside the replay window");
    }

    // Signing secrets are given as `whsec_<base64>`; the bytes after the
    // prefix are the key. A raw secret without the prefix is accepted too,
    // since that is how it is sometimes pasted into an env file.
    let encoded = secret.strip_prefix("whsec_").unwrap_or(secret);
    let key = BASE64.decode(encoded).map_err(|_| "webhook secret is not valid base64")?;

    let mut mac = Hmac::<Sha256>::new_from_slice(&key).map_err(|_| "webhook secret is unusable as an HMAC key")?;
    mac.update(id.as_bytes());
    mac.update(b".");
    mac.update(timestamp.as_bytes());
    mac.update(b".");
    mac.update(body);
    let expected = mac.finalize().into_bytes();

    // The header carries a space-separated list — Svix sends every key
    // that is currently valid, so a secret rotation has a window where two
    // signatures arrive and either one is legitimate.
    for entry in signatures.split(' ') {
        let Some((version, signature)) = entry.split_once(',') else { continue };
        if version != "v1" {
            continue;
        }
        let Ok(decoded) = BASE64.decode(signature) else { continue };
        if decoded.ct_eq(&expected).into() {
            return Ok(());
        }
    }
    Err("no signature matched")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A secret in the same `whsec_`-prefixed, base64 form Clerk hands out.
    const SECRET: &str = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";

    fn sign(secret: &str, id: &str, timestamp: &str, body: &[u8]) -> String {
        let key = BASE64.decode(secret.strip_prefix("whsec_").unwrap()).unwrap();
        let mut mac = Hmac::<Sha256>::new_from_slice(&key).unwrap();
        mac.update(format!("{id}.{timestamp}.").as_bytes());
        mac.update(body);
        format!("v1,{}", BASE64.encode(mac.finalize().into_bytes()))
    }

    fn headers(id: &str, timestamp: &str, signature: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert("svix-id", id.parse().unwrap());
        headers.insert("svix-timestamp", timestamp.parse().unwrap());
        headers.insert("svix-signature", signature.parse().unwrap());
        headers
    }

    #[test]
    fn accepts_a_correctly_signed_body() {
        let now = chrono::Utc::now().timestamp().to_string();
        let body = br#"{"type":"user.created"}"#;
        let signature = sign(SECRET, "msg_1", &now, body);
        assert!(verify(SECRET, &headers("msg_1", &now, &signature), body).is_ok());
    }

    #[test]
    fn accepts_one_valid_signature_among_several() {
        let now = chrono::Utc::now().timestamp().to_string();
        let body = br#"{"type":"user.created"}"#;
        let good = sign(SECRET, "msg_1", &now, body);
        let both = format!("v1,{} {good}", BASE64.encode([0u8; 32]));
        assert!(verify(SECRET, &headers("msg_1", &now, &both), body).is_ok());
    }

    #[test]
    fn rejects_a_tampered_body() {
        let now = chrono::Utc::now().timestamp().to_string();
        let signature = sign(SECRET, "msg_1", &now, br#"{"type":"user.created"}"#);
        let tampered = br#"{"type":"user.deleted"}"#;
        assert!(verify(SECRET, &headers("msg_1", &now, &signature), tampered).is_err());
    }

    /// The id is inside the MAC precisely so a captured body can't be
    /// re-sent under a new message id.
    #[test]
    fn rejects_a_replay_under_a_different_id() {
        let now = chrono::Utc::now().timestamp().to_string();
        let body = br#"{"type":"user.created"}"#;
        let signature = sign(SECRET, "msg_1", &now, body);
        assert!(verify(SECRET, &headers("msg_2", &now, &signature), body).is_err());
    }

    #[test]
    fn rejects_an_old_timestamp() {
        let old = (chrono::Utc::now().timestamp() - TIMESTAMP_TOLERANCE_SECS - 1).to_string();
        let body = br#"{"type":"user.created"}"#;
        let signature = sign(SECRET, "msg_1", &old, body);
        assert!(verify(SECRET, &headers("msg_1", &old, &signature), body).is_err());
    }

    #[test]
    fn rejects_a_missing_signature_header() {
        let now = chrono::Utc::now().timestamp().to_string();
        let mut headers = HeaderMap::new();
        headers.insert("svix-id", "msg_1".parse().unwrap());
        headers.insert("svix-timestamp", now.parse().unwrap());
        assert!(verify(SECRET, &headers, b"{}").is_err());
    }
}
