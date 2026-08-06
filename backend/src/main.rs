//! Lattice backend — a Tokio + Axum HTTP API.
//!
//! Listen on `http://127.0.0.1:3001` by default (override with `BACKEND_PORT`).
//! During development the Next.js frontend proxies `/api/*` requests here
//! (see `frontend/next.config.ts`), so browser code can use relative URLs.

use axum::{routing::get, Json, Router};
use serde_json::{json, Value};
use std::net::SocketAddr;

/// Liveness check — proves the frontend ↔ backend wiring works.
async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

/// Build the application router. Add your own routes here.
fn router() -> Router {
    Router::new().route("/api/health", get(health))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let port = std::env::var("BACKEND_PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(3001);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind socket");
    tracing::info!("lattice-backend listening on http://{addr}");

    axum::serve(listener, router()).await.expect("server error");
}
