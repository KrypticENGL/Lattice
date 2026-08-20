//! Lattice backend — a Tokio + Axum HTTP API.
//!
//! Listen on `http://127.0.0.1:3001` by default (override with `BACKEND_PORT`).
//! During development the Next.js frontend proxies `/api/*` requests here
//! (see `frontend/next.config.ts`), so browser code can use relative URLs.

mod api;
mod canvases;
mod code_canvas;
mod sandbox;
mod trace;

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
use sqlx::postgres::PgPoolOptions;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

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
        .route("/api/code-canvases/{id}/generate", post(api::code_canvases::generate))
        .route("/api/code-canvases/{id}/visualize", post(api::code_canvases::visualize))
        .layer(clerk_layer);

    Router::new()
        .route("/api/health", get(health))
        .merge(protected)
        .with_state(state)
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

    // Also required, unlike Docker: canvases (and, via them, the Visualizer
    // page's own routing — every visit lives at /dashboard/visualizer/{id})
    // don't degrade gracefully without a database the way /api/execute
    // degrades to a 503 without Docker.
    let database_url = std::env::var("DATABASE_URL").expect(
        "DATABASE_URL must be set (see backend/.env.example) — e.g. `docker compose up -d` \
         for local Postgres, then postgres://lattice:lattice@localhost:5432/lattice",
    );
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("failed to connect to Postgres");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("failed to run database migrations");
    tracing::info!("connected to Postgres and ran migrations");

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
    };
    axum::serve(listener, router(state, clerk))
        .await
        .expect("server error");
}
