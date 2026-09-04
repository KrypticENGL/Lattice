//! Day streaks: how many consecutive UTC days in a row a user has run a
//! trace, and the longest run they've ever put together.
//!
//! `activity_days` is the append-only log (one row per user per day they
//! qualified); `streaks` is a cached rollup of it, kept current by
//! `record_activity`'s single upsert rather than recomputed from the log
//! on every read — the same shape as `sessions` alongside
//! `users.last_login_at` (§ crate::users).
//!
//! Runtime-checked queries throughout (`sqlx::query`/`query_as`, not the
//! `query!` macro) so `cargo check` never needs a live database.

use chrono::{DateTime, NaiveDate, Utc};
use serde::Serialize;
use sqlx::PgPool;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Streak {
    pub user_id: String,
    pub current_streak: i32,
    pub longest_streak: i32,
    pub last_active_date: Option<NaiveDate>,
    pub updated_at: DateTime<Utc>,
}

/// Records `user_id` as active on `date` (UTC) and returns their streak
/// afterward.
///
/// The upsert does the whole thing atomically — Postgres's row lock on the
/// `ON CONFLICT` target means two concurrent calls for the same user (two
/// trace runs landing at once) can't both read a stale `last_active_date`
/// and each think they're the one extending it. Calling this more than
/// once for the same day is harmless: the `CASE` below leaves
/// `current_streak` unchanged when `last_active_date` is already `date`.
pub async fn record_activity(pool: &PgPool, user_id: &str, date: NaiveDate) -> sqlx::Result<Streak> {
    sqlx::query(
        "INSERT INTO activity_days (user_id, activity_date) VALUES ($1, $2) \
         ON CONFLICT (user_id, activity_date) DO NOTHING",
    )
    .bind(user_id)
    .bind(date)
    .execute(pool)
    .await?;

    sqlx::query_as::<_, Streak>(
        "INSERT INTO streaks (user_id, current_streak, longest_streak, last_active_date, updated_at) \
         VALUES ($1, 1, 1, $2, now()) \
         ON CONFLICT (user_id) DO UPDATE SET \
            current_streak = CASE \
                WHEN streaks.last_active_date = EXCLUDED.last_active_date THEN streaks.current_streak \
                WHEN streaks.last_active_date = EXCLUDED.last_active_date - 1 THEN streaks.current_streak + 1 \
                ELSE 1 \
            END, \
            longest_streak = GREATEST(streaks.longest_streak, CASE \
                WHEN streaks.last_active_date = EXCLUDED.last_active_date THEN streaks.current_streak \
                WHEN streaks.last_active_date = EXCLUDED.last_active_date - 1 THEN streaks.current_streak + 1 \
                ELSE 1 \
            END), \
            last_active_date = EXCLUDED.last_active_date, \
            updated_at = now() \
         RETURNING *",
    )
    .bind(user_id)
    .bind(date)
    .fetch_one(pool)
    .await
}

/// The signed-in user's streak, or all-zero defaults for someone who has
/// never recorded a day — there's no row to read yet, and that's not an
/// error.
pub async fn get(pool: &PgPool, user_id: &str) -> sqlx::Result<Streak> {
    let existing = sqlx::query_as::<_, Streak>("SELECT * FROM streaks WHERE user_id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    Ok(existing.unwrap_or(Streak {
        user_id: user_id.to_string(),
        current_streak: 0,
        longest_streak: 0,
        last_active_date: None,
        updated_at: Utc::now(),
    }))
}
