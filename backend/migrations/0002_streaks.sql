-- Streak tracking: consecutive UTC days on which a user ran a trace.
--
-- Same split as `users`/`sessions`: `activity_days` is the append-only
-- log — one row per user per day they qualified, the source of truth a
-- rollup could always be rebuilt from — and `streaks` is a cached rollup
-- of it (current run, the longest ever, and the date that run last
-- extended), kept current by one upsert per activity so reading a streak
-- never has to walk the log. Mirrors `sessions` alongside
-- `users.last_login_at` (§ crate::users::upsert_session).
--
-- A day is UTC, not the caller's local day: the backend has no reliable
-- timezone for a request, and a fixed boundary is at least consistent
-- for everyone rather than silently wrong for some of them.

CREATE TABLE activity_days (
    user_id       TEXT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    activity_date DATE NOT NULL,
    PRIMARY KEY (user_id, activity_date)
);

CREATE TABLE streaks (
    user_id          TEXT PRIMARY KEY REFERENCES users (user_id) ON DELETE CASCADE,
    current_streak   INTEGER NOT NULL DEFAULT 0,
    longest_streak   INTEGER NOT NULL DEFAULT 0,
    -- NULL only for a user row inserted with no activity yet, which
    -- `record_activity`'s upsert never does — it always carries a date.
    last_active_date DATE,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
