//! HTTP route handlers (BLUEPRINT.md §11 API contract).

use crate::sandbox::{self, SandboxConfig, SandboxOutcome};
use crate::trace::{ExecuteRequest, ExecuteResponse};
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use bollard::Docker;
use serde_json::json;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    /// `None` when the backend couldn't reach the Docker daemon at
    /// startup — `/api/health` still works, but `/api/execute` reports
    /// 503 instead of taking the whole process down. Lets local dev boot
    /// before Docker is set up.
    pub docker: Option<Arc<Docker>>,
}

/// Generous for a data-structure demo snippet, small enough to reject
/// abuse (giant paste jobs) before it ever reaches a container.
const MAX_SOURCE_BYTES: usize = 64 * 1024;

pub async fn execute(State(state): State<AppState>, Json(req): Json<ExecuteRequest>) -> Response {
    // Client errors (bad input) before infra errors (no Docker) — an
    // unsupported language is never fixed by retrying, so a caller should
    // find that out immediately rather than being told the service is
    // temporarily down.
    if req.source.trim().is_empty() {
        return bad_request("source is empty");
    }
    if req.source.len() > MAX_SOURCE_BYTES {
        return bad_request(&format!(
            "source exceeds the {MAX_SOURCE_BYTES}-byte limit"
        ));
    }

    let config = match req.language.as_str() {
        "cpp" | "c++" => SandboxConfig::cpp(),
        other => {
            return bad_request(&format!(
                "unsupported language {other:?} — only \"cpp\" is available right now"
            ));
        }
    };

    let Some(docker) = state.docker.as_deref() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "sandbox is unavailable (no Docker connection)" })),
        )
            .into_response();
    };

    match sandbox::run_cpp_trace(docker, &req.source, &config).await {
        Ok(SandboxOutcome::Trace(events)) => {
            (StatusCode::OK, Json(ExecuteResponse::from_events(events))).into_response()
        }
        // A snippet that fails to compile never ran at all — closer to
        // "bad input" (§11) than a normal execution outcome, so 4xx
        // rather than 200-with-error (which is reserved for the user's
        // code compiling fine but throwing/crashing at runtime).
        Ok(SandboxOutcome::CompileError(message)) => bad_request(&message),
        Err(e) => {
            tracing::error!(error = %e, "sandbox execution failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "sandbox execution failed, please try again" })),
            )
                .into_response()
        }
    }
}

fn bad_request(message: &str) -> Response {
    (StatusCode::BAD_REQUEST, Json(json!({ "error": message }))).into_response()
}
