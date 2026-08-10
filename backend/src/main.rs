//! Lattice backend — a Tokio + Axum HTTP API.
//!
//! Listen on `http://127.0.0.1:3001` by default (override with `BACKEND_PORT`).
//! During development the Next.js frontend proxies `/api/*` requests here
//! (see `frontend/next.config.ts`), so browser code can use relative URLs.

mod api;
mod sandbox;
mod trace;

use api::AppState;
use axum::{routing::{get, post}, Json, Router};
use bollard::Docker;
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::sync::Arc;

/// Liveness check — proves the frontend ↔ backend wiring works.
async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

/// Build the application router. Add your own routes here.
fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/execute", post(api::execute))
        .with_state(state)
}

#[tokio::main]
async fn main() {
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

    let port = std::env::var("BACKEND_PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(3001);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind socket");
    tracing::info!("lattice-backend listening on http://{addr}");

    axum::serve(listener, router(AppState { docker }))
        .await
        .expect("server error");
}
