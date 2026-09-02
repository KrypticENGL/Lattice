-- Lattice's Postgres schema, rebuilt from scratch.
--
-- Shape follows the ROLES -> USERS -> SESSIONS ERD, with the two canvas
-- tables kept alongside it. Three decisions worth stating up front, since
-- each is a deliberate departure from the diagram or from what was here
-- before:
--
-- 1. Clerk owns identity, so `users.user_id` is Clerk's own id string
--    ("user_2xyz..."), not a local serial. The JWT `sub` claim that
--    already scopes every query in this backend then *is* the primary
--    key, and nothing has to translate between two id spaces. For the
--    same reason there is no `password_hash` column: Clerk holds
--    credentials, and a copy here would be pure liability.
--
-- 2. The ERD's `sessions.refresh_token` is absent. Clerk never hands a
--    refresh token to the backend — its session id (`sess_...`) is the
--    handle we actually have, so that is the primary key. Rows here are a
--    mirror of Clerk's sessions kept for querying ("who signed in, from
--    where, when"), never an authentication mechanism: nothing in this
--    codebase authenticates against this table.
--
-- 3. This database holds identity and nothing else. Canvases, graphs,
--    traces, stdout and compiler output live nowhere in Postgres: a run
--    recomputes what it needs and returns it to the client, and the work
--    itself is the client's to keep. There is deliberately no table here
--    for user content.

-- Fixed, seeded once. Numbers are the contract (0/1/2), not surrogates:
-- they're what a JWT claim or an admin tool would carry.
CREATE TABLE roles (
    role_id   INTEGER PRIMARY KEY,
    role_name TEXT NOT NULL UNIQUE
);

INSERT INTO roles (role_id, role_name) VALUES
    (0, 'user'),
    (1, 'admin'),
    (2, 'maintainer');

CREATE TABLE users (
    -- Clerk's user id, verbatim. Matches the `sub` claim on every request.
    user_id       TEXT PRIMARY KEY,
    -- Every profile column below is nullable because Clerk makes them
    -- optional: an instance configured for email-only sign-in has no
    -- usernames, and an OAuth user may arrive with no name at all.
    username      TEXT UNIQUE,
    email         TEXT UNIQUE,
    full_name     TEXT,
    image_url     TEXT,
    role_id       INTEGER NOT NULL DEFAULT 0 REFERENCES roles (role_id),
    -- Mirrors "can this person sign in": false once Clerk reports them
    -- banned or locked. Not enforced here — Clerk already refuses the
    -- sign-in — it's here so the flag is queryable alongside the rest.
    is_active     BOOLEAN NOT NULL DEFAULT true,
    -- Clerk's own creation instant, not ours, so this survives a rebuild
    -- of this table. `synced_at` is the local one.
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ,
    synced_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX users_role_idx ON users (role_id);

CREATE TABLE sessions (
    -- Clerk's session id ("sess_..."), verbatim — see note 2 above.
    session_id     TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    -- Clerk's own vocabulary, passed through rather than re-encoded, and
    -- deliberately unconstrained: active, ended, removed, revoked,
    -- expired, replaced and abandoned are what turn up today, but Clerk
    -- adding a state shouldn't be able to fail a webhook write.
    status         TEXT NOT NULL DEFAULT 'active',
    ip_address     TEXT,
    user_agent     TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_active_at TIMESTAMPTZ,
    expires_at     TIMESTAMPTZ,
    ended_at       TIMESTAMPTZ
);

-- The two queries this table exists to answer: one user's sign-in history,
-- newest first, and "who is signed in right now".
CREATE INDEX sessions_user_created_idx ON sessions (user_id, created_at DESC);
CREATE INDEX sessions_active_idx ON sessions (status) WHERE status = 'active';
