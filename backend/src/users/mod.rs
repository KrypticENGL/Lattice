//! Users, roles and sessions — the Clerk-owned side of the database.
//!
//! Clerk is the source of truth for all three. Nothing in this module
//! authenticates anybody: `ClerkLayer` (see main.rs) has already verified
//! the session token by the time any of this runs. What these tables give
//! us is the ability to *query* identity — "how many maintainers are
//! there", "when did this person last sign in", "who is signed in right
//! now" — which a JWT claim on a single in-flight request can't answer.
//!
//! Rows arrive by webhook (`api::webhooks`) and, for an instance that
//! already had users before this table existed, by a one-shot import at
//! startup (`users::backfill`).
//!
//! Runtime-checked queries throughout (`sqlx::query`/`query_as`, not the
//! `query!` macro) so `cargo check` never needs a live database.

pub mod backfill;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

/// The three roles, matching the seeded `roles` rows in migration 0001.
/// Numbers are the contract, so they're spelled out rather than derived
/// from a declaration order that could quietly shift.
pub const ROLE_USER: i32 = 0;
pub const ROLE_ADMIN: i32 = 1;
pub const ROLE_MAINTAINER: i32 = 2;

/// `roles.role_name` for a `role_id`, or `None` if it isn't one of the
/// three. Kept beside the constants so the mapping lives in one place.
pub fn role_name(role_id: i32) -> Option<&'static str> {
    match role_id {
        ROLE_USER => Some("user"),
        ROLE_ADMIN => Some("admin"),
        ROLE_MAINTAINER => Some("maintainer"),
        _ => None,
    }
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct User {
    /// Clerk's user id — also the `sub` claim every request carries.
    pub user_id: String,
    pub username: Option<String>,
    pub email: Option<String>,
    pub full_name: Option<String>,
    pub image_url: Option<String>,
    pub role_id: i32,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub last_login_at: Option<DateTime<Utc>>,
    pub synced_at: DateTime<Utc>,
}

/// A Clerk user as it arrives on the wire — from a `user.*` webhook or
/// from `GET /v1/users`, which send the same object.
///
/// Deliberately not `clerk_rs::models::User`: every field here is optional
/// and unknown ones are ignored, so a Clerk-side addition (or an instance
/// configured without usernames, or an OAuth sign-up with no name) can't
/// turn into a deserialization failure that drops the event on the floor.
#[derive(Debug, Clone, Deserialize)]
pub struct ClerkUser {
    pub id: String,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub first_name: Option<String>,
    #[serde(default)]
    pub last_name: Option<String>,
    #[serde(default)]
    pub image_url: Option<String>,
    #[serde(default)]
    pub primary_email_address_id: Option<String>,
    #[serde(default)]
    pub email_addresses: Vec<ClerkEmailAddress>,
    #[serde(default)]
    pub banned: bool,
    #[serde(default)]
    pub locked: bool,
    /// Unix milliseconds — Clerk's timestamps are ms, not seconds.
    #[serde(default)]
    pub created_at: Option<i64>,
    #[serde(default)]
    pub last_sign_in_at: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClerkEmailAddress {
    pub id: String,
    pub email_address: String,
}

impl ClerkUser {
    /// The primary address if Clerk named one, else the first on file.
    /// Falling back rather than storing `NULL` matters because a user with
    /// exactly one unverified address has no primary id yet, and dropping
    /// their email would make the row far less useful than it needs to be.
    pub fn email(&self) -> Option<&str> {
        self.primary_email_address_id
            .as_ref()
            .and_then(|id| self.email_addresses.iter().find(|e| &e.id == id))
            .or_else(|| self.email_addresses.first())
            .map(|e| e.email_address.as_str())
    }

    /// `"First Last"`, or whichever half exists. `None` when Clerk has
    /// neither — an empty string would read as "their name is blank"
    /// rather than "we were never told".
    pub fn full_name(&self) -> Option<String> {
        let parts: Vec<&str> = [self.first_name.as_deref(), self.last_name.as_deref()]
            .into_iter()
            .flatten()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .collect();
        (!parts.is_empty()).then(|| parts.join(" "))
    }

    /// Banned or locked in Clerk means they can't sign in, which is what
    /// `is_active` records.
    pub fn is_active(&self) -> bool {
        !self.banned && !self.locked
    }
}

/// A Clerk session as `session.*` webhooks send it. Lenient for the same
/// reason as `ClerkUser`.
#[derive(Debug, Clone, Deserialize)]
pub struct ClerkSession {
    pub id: String,
    pub user_id: String,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub created_at: Option<i64>,
    #[serde(default)]
    pub last_active_at: Option<i64>,
    #[serde(default)]
    pub expire_at: Option<i64>,
}

/// Clerk sends Unix **milliseconds**; `DateTime::from_timestamp_millis`
/// returns `None` only for values outside chrono's range, which a real
/// timestamp never is.
pub fn clerk_time(millis: Option<i64>) -> Option<DateTime<Utc>> {
    millis.and_then(DateTime::from_timestamp_millis)
}

/// Writes a Clerk user into `users`, creating the row or refreshing it.
///
/// `role_id` is conspicuously absent from the `UPDATE` clause: it is the
/// one column on this table Clerk does *not* own. Someone promoted to
/// maintainer here must not be silently demoted to 0 the next time they
/// change their avatar.
///
/// `created_at` is likewise only ever set on insert, and from Clerk's own
/// value — it records when the account was created, not when this row was.
pub async fn upsert(pool: &PgPool, user: &ClerkUser) -> sqlx::Result<()> {
    sqlx::query(
        "INSERT INTO users \
            (user_id, username, email, full_name, image_url, is_active, created_at, last_login_at, synced_at) \
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, now()), $8, now()) \
         ON CONFLICT (user_id) DO UPDATE SET \
            username = EXCLUDED.username, \
            email = EXCLUDED.email, \
            full_name = EXCLUDED.full_name, \
            image_url = EXCLUDED.image_url, \
            is_active = EXCLUDED.is_active, \
            last_login_at = COALESCE(EXCLUDED.last_login_at, users.last_login_at), \
            synced_at = now()",
    )
    .bind(&user.id)
    .bind(user.username.as_deref())
    .bind(user.email())
    .bind(user.full_name())
    .bind(user.image_url.as_deref())
    .bind(user.is_active())
    .bind(clerk_time(user.created_at))
    .bind(clerk_time(user.last_sign_in_at))
    .execute(pool)
    .await?;
    Ok(())
}

/// Guarantees a row exists for `user_id`, touching nothing if one already
/// does.
///
/// Every canvas's `owner_id` is a foreign key into this table, so a user
/// whose webhook hasn't landed yet (or an instance with no webhook
/// configured at all, which is every local dev machine without a tunnel)
/// would otherwise fail to create anything. This inserts the id and
/// nothing else, leaving all the profile columns at their defaults for the
/// real webhook to fill in — it is referential-integrity insurance, not a
/// second sync path competing with `upsert`.
pub async fn ensure(pool: &PgPool, user_id: &str) -> sqlx::Result<()> {
    sqlx::query("INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING")
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get(pool: &PgPool, user_id: &str) -> sqlx::Result<Option<User>> {
    sqlx::query_as::<_, User>("SELECT * FROM users WHERE user_id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await
}

/// Removes a user and, by cascade, their sessions, canvases and graphs.
/// Called on `user.deleted` — Clerk has erased the account, so keeping
/// their content would leave data nobody can ever reach or delete.
pub async fn delete(pool: &PgPool, user_id: &str) -> sqlx::Result<bool> {
    let result = sqlx::query("DELETE FROM users WHERE user_id = $1")
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

/// Records a session Clerk just created or updated.
///
/// `ensure` first, in the same call rather than left to the caller: a
/// `session.created` webhook can outrun the `user.created` that logically
/// precedes it (they are independent deliveries), and losing a sign-in
/// record to a foreign-key violation over a few hundred milliseconds of
/// ordering would be a silly way to lose data.
pub async fn upsert_session(
    pool: &PgPool,
    session: &ClerkSession,
    ip_address: Option<&str>,
    user_agent: Option<&str>,
) -> sqlx::Result<()> {
    ensure(pool, &session.user_id).await?;
    let status = session.status.as_deref().unwrap_or("active");
    sqlx::query(
        "INSERT INTO sessions \
            (session_id, user_id, status, ip_address, user_agent, created_at, last_active_at, expires_at) \
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()), $7, $8) \
         ON CONFLICT (session_id) DO UPDATE SET \
            status = EXCLUDED.status, \
            last_active_at = COALESCE(EXCLUDED.last_active_at, sessions.last_active_at), \
            expires_at = COALESCE(EXCLUDED.expires_at, sessions.expires_at), \
            ip_address = COALESCE(EXCLUDED.ip_address, sessions.ip_address), \
            user_agent = COALESCE(EXCLUDED.user_agent, sessions.user_agent)",
    )
    .bind(&session.id)
    .bind(&session.user_id)
    .bind(status)
    .bind(ip_address)
    .bind(user_agent)
    .bind(clerk_time(session.created_at))
    .bind(clerk_time(session.last_active_at))
    .bind(clerk_time(session.expire_at))
    .execute(pool)
    .await?;

    // A new session *is* a sign-in, and it's the only signal that reliably
    // reports one: Clerk's `last_sign_in_at` on the user object is not
    // refreshed by a `user.updated` we'd necessarily receive.
    if status == "active" {
        sqlx::query(
            "UPDATE users SET last_login_at = GREATEST(COALESCE($1, now()), COALESCE(last_login_at, 'epoch'::timestamptz)) \
             WHERE user_id = $2",
        )
        .bind(clerk_time(session.created_at))
        .bind(&session.user_id)
        .execute(pool)
        .await?;
    }
    Ok(())
}

/// Closes out a session on `session.ended` / `.removed` / `.revoked`.
///
/// `ended_at` is passed in rather than assumed to be now: a live webhook
/// arrives as the session ends and passes `None` for it, but the startup
/// import (§ backfill) is reading sessions that closed days ago, and
/// stamping those with the import's own clock would make every historical
/// row claim it ended the moment the backend last restarted.
///
/// Upserts rather than updates so an end event for a session we never saw
/// start (webhook configured mid-flight, say) still lands as a row.
pub async fn end_session(
    pool: &PgPool,
    session: &ClerkSession,
    status: &str,
    ended_at: Option<DateTime<Utc>>,
) -> sqlx::Result<()> {
    ensure(pool, &session.user_id).await?;
    sqlx::query(
        "INSERT INTO sessions (session_id, user_id, status, created_at, last_active_at, expires_at, ended_at) \
         VALUES ($1, $2, $3, COALESCE($4, now()), $5, $6, COALESCE($7, now())) \
         ON CONFLICT (session_id) DO UPDATE SET \
            status = EXCLUDED.status, \
            ended_at = COALESCE(sessions.ended_at, EXCLUDED.ended_at), \
            last_active_at = COALESCE(EXCLUDED.last_active_at, sessions.last_active_at)",
    )
    .bind(&session.id)
    .bind(&session.user_id)
    .bind(status)
    .bind(clerk_time(session.created_at))
    .bind(clerk_time(session.last_active_at))
    .bind(clerk_time(session.expire_at))
    .bind(ended_at)
    .execute(pool)
    .await?;
    Ok(())
}
