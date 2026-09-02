//! Lattice backend — a Tokio + Axum HTTP API.
//!
//! Listen on `http://127.0.0.1:3001` by default (override with `BACKEND_PORT`).
//! During development the Next.js frontend proxies `/api/*` requests here
//! (see `frontend/next.config.ts`), so browser code can use relative URLs.

mod api;
mod canvases;
mod code_canvas;
mod mongo;
mod posts;
mod sandbox;
mod trace;
mod users;

use api::AppState;
use axum::{
    routing::{get, post},
    Json, Router,
};
use bollard::Docker;
use clerk_rs::{
    clerk::Clerk,
    validators::{axum::ClerkLayer, jwks::MemoryCacheJwksProvider},
    ClerkConfiguration,
};
use serde_json::{json, Value};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Liveness check — proves the frontend ↔ backend wiring works.
async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

/// Build the application router. `clerk` is used to build a `ClerkLayer`
/// applied to a nested sub-router covering every route below except
/// `/api/health`, with `None` passed as its own route filter (protect
/// everything within that sub-router) — `ClerkLayer`'s own per-path
/// allowlist only does exact string equality against the raw request path
/// (verified against its source), so it can't express "protect
/// /api/canvases/{id} for any id." Nesting middleware onto a route subset
/// instead of relying on that allowlist sidesteps the limitation entirely,
/// for every route here, not just the parameterized ones. (Built inline
/// here, rather than passed in as a constructed `ClerkLayer`, purely to
/// avoid spelling out that generic type in this function's signature.)
fn router(state: AppState, clerk: Clerk) -> Router {
    let clerk_layer = ClerkLayer::new(MemoryCacheJwksProvider::new(clerk), None, true);

    let protected = Router::new()
        .route("/api/execute", post(api::execute))
        .route("/api/resources", get(api::resources))
        .route("/api/me", get(api::users::me))
        .route(
            "/api/canvases",
            get(api::canvases::list).post(api::canvases::create),
        )
        .route(
            "/api/canvases/{id}",
            get(api::canvases::get)
                .patch(api::canvases::update)
                .delete(api::canvases::delete),
        )
        .route(
            "/api/code-canvases",
            get(api::code_canvases::list).post(api::code_canvases::create),
        )
        .route(
            "/api/code-canvases/{id}",
            get(api::code_canvases::get)
                .patch(api::code_canvases::update)
                .delete(api::code_canvases::delete),
        )
        .route("/api/code-canvases/{id}/visualize", post(api::code_canvases::visualize))
        .route("/api/posts", get(api::posts::list).post(api::posts::create))
        .route("/api/posts/saved", get(api::posts::saved))
        .route("/api/posts/{id}", get(api::posts::get).delete(api::posts::delete))
        .route("/api/posts/{id}/like", post(api::posts::like))
        .route("/api/posts/{id}/save", post(api::posts::save))
        .route("/api/posts/{id}/comments", post(api::posts::comment))
        .route(
            "/api/posts/{id}/comments/{comment_id}",
            axum::routing::delete(api::posts::delete_comment),
        )
        .layer(clerk_layer);

    Router::new()
        .route("/api/health", get(health))
        // Deliberately outside `protected`: Clerk's webhook delivery is a
        // server-to-server call carrying no user session token, so a
        // `ClerkLayer` here would reject every event. It authenticates by
        // Svix signature instead (see api::webhooks::verify).
        .route("/api/webhooks/clerk", post(api::webhooks::clerk))
        .merge(protected)
        .with_state(state)
}

/// Supabase's pooler answers on two ports, and they want opposite things
/// from a client.
///
/// Port 5432 is *session* mode: a client connection is pinned to one
/// backend process for its whole life, so prepared statements are safe and
/// worth caching — but every pooled connection costs the database a
/// process.
///
/// Port 6543 is *transaction* mode, where many clients are multiplexed
/// onto far fewer backends. That is the setting that actually cuts the
/// database's connection memory, and it is a one-word edit to
/// `DATABASE_URL` — but a statement prepared on one backend won't exist on
/// the next one a query lands on, which surfaces as intermittent
/// `prepared statement "sqlx_s_1" does not exist` errors. Disabling the
/// cache there is what makes that edit safe to make.
fn connect_options(database_url: &str) -> PgConnectOptions {
    let options: PgConnectOptions = database_url
        .parse()
        .expect("DATABASE_URL is not a valid Postgres connection string");
    if options.get_port() == 6543 {
        tracing::info!("connecting in transaction-pooling mode — statement cache disabled");
        options.statement_cache_capacity(0)
    } else {
        options
    }
}

#[tokio::main]
async fn main() {
    // Optional — local dev convenience (see backend/.env.example). Ignored
    // if absent; deployments are expected to set CLERK_SECRET_KEY directly
    // in the environment instead.
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    // Connected once at startup and reused for every sandbox run — a
    // failure here doesn't take the whole process down (see AppState's
    // docs), it just disables /api/execute until Docker is reachable.
    //
    // `connect_with_socket_defaults()` alone only checks that the socket
    // *file* exists, not that we can actually use it — a process started
    // in a shell before `usermod -aG docker` takes effect "connects" fine
    // here and then fails on every real request with a confusing 500.
    // `ping()` forces a real round-trip so that failure mode surfaces now,
    // as the intended clean 503, instead of mid-request.
    let docker = match Docker::connect_with_socket_defaults() {
        Ok(docker) => match docker.ping().await {
            Ok(_) => {
                tracing::info!("connected to Docker daemon");
                Some(Arc::new(docker))
            }
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    "Docker socket exists but ping failed (often: this shell predates \
                     `usermod -aG docker` taking effect — restart from a fresh shell) — \
                     /api/execute will report 503"
                );
                None
            }
        },
        Err(e) => {
            tracing::warn!(error = %e, "no Docker connection — /api/execute will report 503");
            None
        }
    };

    // Required, not optional like Docker above: without it there's no way
    // to identify who's calling /api/execute, and the per-user container
    // quota (§ MAX_CONTAINERS_PER_USER) has nothing to key on.
    let clerk_secret_key = std::env::var("CLERK_SECRET_KEY").expect(
        "CLERK_SECRET_KEY must be set (see backend/.env.example) — needed to verify signed-in \
         users and enforce the per-user container quota",
    );
    let clerk_config = ClerkConfiguration::new(None, None, Some(clerk_secret_key), None);
    let clerk = Clerk::new(clerk_config);

    // Also required, unlike Docker: this database is where identity lives
    // (§ crate::users), and a backend that can't say who its users are has
    // nothing to degrade *to* the way /api/execute degrades to a 503
    // without Docker.
    let database_url = std::env::var("DATABASE_URL").expect(
        "DATABASE_URL must be set (see backend/.env.example) — the Supabase connection \
         string from Project Settings -> Database, with the password percent-encoded",
    );
    // Every connection this pool holds is a whole backend process on the
    // database server, costing several MB of its RAM whether or not it is
    // doing anything — so the pool is tuned to hold as few as it can get
    // away with, for as short a time as possible. This backend's queries
    // are all small identity lookups; it has no workload that benefits
    // from keeping connections warm.
    let pool = PgPoolOptions::new()
        // Enough for the startup import's burst of writes plus a couple of
        // concurrent requests. Nothing here fans out.
        .max_connections(4)
        // Hold nothing open at rest. An idle backend serves no requests
        // and still costs the database memory, so between bursts this pool
        // should shrink to zero.
        .min_connections(0)
        // sqlx's own default is 10 minutes, which for a service that talks
        // to Postgres in short bursts means ten idle minutes of paying for
        // connections nobody is using.
        .idle_timeout(Duration::from_secs(60))
        .max_lifetime(Duration::from_secs(30 * 60))
        .connect_with(connect_options(&database_url))
        .await
        .expect("failed to connect to Postgres");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("failed to run database migrations");
    tracing::info!("connected to Postgres and ran migrations");

    // Optional, and warned about rather than fatal: without it
    // /api/webhooks/clerk reports 503 and the user tables stay current
    // through the startup import below plus `users::ensure`. That's the
    // normal state of a local dev machine, which has no public URL for
    // Clerk to deliver to.
    let clerk_webhook_secret = std::env::var("CLERK_WEBHOOK_SECRET").ok().filter(|s| !s.is_empty());
    if clerk_webhook_secret.is_none() {
        tracing::warn!(
            "CLERK_WEBHOOK_SECRET is not set — /api/webhooks/clerk will report 503 and \
             users/sessions will only be as fresh as the startup import"
        );
    }

    // Webhooks only report changes from here on, so anyone who signed up
    // before these tables existed would otherwise be missing. Spawned
    // rather than awaited: it's a network round-trip per page of users,
    // and nothing serving traffic needs to wait for it.
    tokio::spawn({
        let pool = pool.clone();
        let clerk = clerk.clone();
        async move { users::backfill::run(&pool, &clerk).await }
    });

    // The user's work lives here, and unlike Docker there is nothing to
    // degrade to: almost every route reads or writes it.
    let mongo_uri = std::env::var("MONGODB_URI").expect(
        "MONGODB_URI must be set (see backend/.env.example) — the SRV connection string \
         from Atlas, which is where canvases, graphs and posts are stored",
    );
    // The Atlas SRV string carries no database name, so it is named
    // separately rather than being parsed out of a URI that doesn't have
    // one.
    let mongo_db = std::env::var("MONGODB_DATABASE").unwrap_or_else(|_| "lattice".to_string());
    let mongo = mongo::connect(&mongo_uri, &mongo_db)
        .await
        .expect("failed to connect to MongoDB (check MONGODB_URI, and that this IP is on the Atlas access list)");
    tracing::info!(database = %mongo_db, "connected to MongoDB and ensured indexes");

    // Gives a fresh install something to look at. No-ops once anybody has
    // posted — see `posts::seed`.
    match posts::seed(&mongo, include_str!("../seed/posts.json")).await {
        Ok(0) => {}
        Ok(n) => tracing::info!(posts = n, "seeded the feed"),
        Err(e) => tracing::warn!(error = %e, "could not seed the feed"),
    }

    let port = std::env::var("BACKEND_PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(3001);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind socket");
    tracing::info!("lattice-backend listening on http://{addr}");

    let state = AppState {
        docker,
        container_count: Arc::new(Mutex::new(HashMap::new())),
        active_containers: Arc::new(Mutex::new(HashMap::new())),
        recent_usage: Arc::new(Mutex::new(HashMap::new())),
        pool,
        mongo,
        clerk_webhook_secret,
    };
    axum::serve(listener, router(state, clerk))
        .await
        .expect("server error");
}
