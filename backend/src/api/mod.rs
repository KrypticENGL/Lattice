//! HTTP route handlers (BLUEPRINT.md §11 API contract).

pub mod canvases;
pub mod code_canvases;
pub mod posts;
pub mod streaks;
pub mod users;
pub mod webhooks;

use crate::canvases as canvas_store;
use crate::sandbox::{self, SandboxConfig, SandboxOutcome};
use crate::trace::{ExecuteRequest, ExecuteResponse, TraceEvent};
use axum::extract::{Extension, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use bollard::Docker;
use chrono::Utc;
use clerk_rs::validators::authorizer::ClerkJwt;
use serde_json::json;
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Clone)]
pub struct AppState {
    /// `None` when the backend couldn't reach the Docker daemon at
    /// startup — `/api/health` still works, but `/api/execute` reports
    /// 503 instead of taking the whole process down. Lets local dev boot
    /// before Docker is set up.
    pub docker: Option<Arc<Docker>>,
    /// Total containers ever spun up per signed-in user (Clerk `sub`
    /// claim) — a lifetime usage counter, not a concurrency limit: it only
    /// ever increases (see `reserve_container`), and the free-tier cap
    /// (`MAX_CONTAINERS_PER_USER`) is checked against it. In-memory only
    /// — resets on restart, so this is a soft cap today, not a durable
    /// one; a `usage` table keyed on `users.user_id` is the natural next
    /// step if that matters.
    pub container_count: Arc<Mutex<HashMap<String, u32>>>,
    /// Names of containers *currently* running per user — separate from
    /// `container_count` above, this is purely bookkeeping for
    /// `/api/resources`'s live-stats sampling (which containers to query),
    /// not cap-enforcing.
    pub active_containers: Arc<Mutex<HashMap<String, Vec<String>>>>,
    /// Peak usage observed *during* each user's most recent run (see
    /// `execute`'s sampler task) — a typical run's container lives well
    /// under a second (measured: ~0.5s for a small trace, start to
    /// removal), far shorter than any reasonable external poll interval
    /// could reliably catch live. `/api/resources` falls back to this,
    /// while fresh, when there's no currently-active container to sample
    /// directly — otherwise the monitor would show 0 almost always, not
    /// because nothing happened, but because polling can't win a race
    /// against a container that's already gone.
    pub recent_usage: Arc<Mutex<HashMap<String, RecentUsage>>>,
    /// Backs the Clerk-synced `users`/`sessions` tables (§ crate::users)
    /// — unlike `docker`, a missing connection here is fatal at startup
    /// (see main.rs), not a soft-503 degradation.
    pub pool: PgPool,
    /// Where the user's work lives — canvases, graphs and posts
    /// (§ crate::mongo). Fatal at startup if unreachable, same as `pool`:
    /// almost every route below reads or writes it.
    pub mongo: mongodb::Database,
    /// Svix signing secret for `POST /api/webhooks/clerk`. `None` when
    /// `CLERK_WEBHOOK_SECRET` isn't set — that route then reports 503
    /// rather than accepting unverified events (see api::webhooks), and
    /// the user tables are kept current by the startup import and
    /// `users::ensure` alone.
    pub clerk_webhook_secret: Option<String>,
}

#[derive(Clone, Copy)]
pub struct RecentUsage {
    pub at: Instant,
    pub cpu_percent: f64,
    pub memory_bytes: u64,
}

/// How long a recent-run's peak usage stays visible in `/api/resources`
/// after the container itself is gone.
const RECENT_USAGE_TTL: Duration = Duration::from_secs(20);
/// Sampling cadence for the peak-usage tracker in `execute` — frequent
/// enough to catch a sub-second container's actual peak, cheap enough
/// (a handful of samples per run at most) not to matter.
const PEAK_SAMPLE_INTERVAL: Duration = Duration::from_millis(150);

/// Generous for a data-structure demo snippet, small enough to reject
/// abuse (giant paste jobs) before it ever reaches a container.
const MAX_SOURCE_BYTES: usize = 64 * 1024;

/// Free-tier lifetime cap: how many sandbox containers a single signed-in
/// user may spin up in total. Not a concurrency limit — `container_count`
/// only ever goes up, so containers finishing doesn't free anything back.
pub const MAX_CONTAINERS_PER_USER: u32 = 100;

/// Checks and increments `user_id`'s lifetime container count, rejecting
/// the request with 429 once they've reached `MAX_CONTAINERS_PER_USER`.
/// Check-and-increment happens under one lock so concurrent requests from
/// the same user can't race past the cap.
fn reserve_container(container_count: &Mutex<HashMap<String, u32>>, user_id: &str) -> Result<(), Response> {
    let mut counts = container_count.lock().unwrap();
    let count = counts.entry(user_id.to_string()).or_insert(0);
    if *count >= MAX_CONTAINERS_PER_USER {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({
                "error": format!(
                    "free tier is limited to {MAX_CONTAINERS_PER_USER} containers — you've used them all"
                )
            })),
        )
            .into_response());
    }
    *count += 1;
    Ok(())
}

fn track_active(active_containers: &Mutex<HashMap<String, Vec<String>>>, user_id: &str, container_name: &str) {
    let mut active = active_containers.lock().unwrap();
    active.entry(user_id.to_string()).or_default().push(container_name.to_string());
}

fn untrack_active(active_containers: &Mutex<HashMap<String, Vec<String>>>, user_id: &str, container_name: &str) {
    let mut active = active_containers.lock().unwrap();
    if let Some(names) = active.get_mut(user_id) {
        names.retain(|n| n != container_name);
    }
}

pub async fn execute(
    State(state): State<AppState>,
    Extension(clerk_jwt): Extension<ClerkJwt>,
    Json(req): Json<ExecuteRequest>,
) -> Response {
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

    // A canvas whose code was generated from a graph runs *its stored
    // source*, never whatever arrived in the request. The Visualizer
    // renders such a canvas read-only, so a mismatch means a stale tab or
    // a hand-rolled client — and either way the trace about to be returned
    // has to describe the code the canvas actually holds, or the step
    // highlight would point at lines that aren't there.
    let mut req = req;
    if let Some(canvas_id) = req.canvas_id.clone() {
        match canvas_store::generated_source(&state.mongo, &clerk_jwt.sub, &canvas_id).await {
            Ok(Some(stored)) => {
                if stored != req.source {
                    tracing::debug!(
                        %canvas_id,
                        "ignoring submitted source for a generated canvas; running its stored source"
                    );
                }
                req.source = stored;
            }
            Ok(None) => {}
            Err(e) => return mongo_error(e, "canvas source lookup"),
        }
    }

    let mut config = match req.language.as_str() {
        "cpp" | "c++" => SandboxConfig::cpp(),
        other => {
            return bad_request(&format!(
                "unsupported language {other:?} — only \"cpp\" is available right now"
            ));
        }
    };
    config.emit_all_steps = req.full_steps;

    let Some(docker_arc) = state.docker.clone() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "sandbox is unavailable (no Docker connection)" })),
        )
            .into_response();
    };
    let docker = docker_arc.as_ref();

    let container_name = format!("lattice-trace-{}", uuid::Uuid::new_v4());
    if let Err(too_many) = reserve_container(&state.container_count, &clerk_jwt.sub) {
        return too_many;
    }
    track_active(&state.active_containers, &clerk_jwt.sub, &container_name);

    // Samples the container's own stats throughout its (typically
    // sub-second) lifetime, tracking the peak seen — the only reliable way
    // to observe it at all, given how briefly it lives (see AppState's
    // `recent_usage` docs). A plain shared Mutex, not the task's own return
    // value, carries the result out: `abort()` below cuts the task off
    // mid-loop, which drops whatever it would have returned.
    let peak = Arc::new(Mutex::new((0.0_f64, 0_u64)));
    let sampler = tokio::spawn({
        let docker = Arc::clone(&docker_arc);
        let name = container_name.clone();
        let peak = Arc::clone(&peak);
        async move {
            loop {
                if let Some((cpu, mem)) = sandbox::container_stats(&docker, &name).await {
                    let mut peak = peak.lock().unwrap();
                    if cpu > peak.0 {
                        peak.0 = cpu;
                    }
                    if mem > peak.1 {
                        peak.1 = mem;
                    }
                }
                tokio::time::sleep(PEAK_SAMPLE_INTERVAL).await;
            }
        }
    });

    let outcome = sandbox::run_cpp_trace(docker, &container_name, &req.source, &config).await;
    untrack_active(&state.active_containers, &clerk_jwt.sub, &container_name);
    sampler.abort();
    let (peak_cpu_percent, peak_memory_bytes) = *peak.lock().unwrap();
    if peak_cpu_percent > 0.0 || peak_memory_bytes > 0 {
        state.recent_usage.lock().unwrap().insert(
            clerk_jwt.sub.clone(),
            RecentUsage { at: Instant::now(), cpu_percent: peak_cpu_percent, memory_bytes: peak_memory_bytes },
        );
    }

    match outcome {
        Ok(SandboxOutcome::Trace { events, compile_command, compiler_output }) => {
            // The sandbox and pipeline worked fine here — this is the
            // user's *own* code crashing (segfault, etc.), a normal
            // outcome (§11), not an error. Worth a lower-severity log
            // line for crash-rate visibility, distinct from the
            // `tracing::error!` below for actual infra failures.
            if events.iter().any(TraceEvent::is_exception) {
                tracing::debug!("trace completed with an exception in the user's code");
            }

            // The code compiled and ran — that's what a day streak counts,
            // regardless of whether it then threw or segfaulted (still a
            // trace the user ran). A failure here is logged, not
            // propagated: losing today's streak update is not a reason to
            // fail a trace that already succeeded.
            if let Err(e) = crate::streaks::record_activity(&state.pool, &clerk_jwt.sub, Utc::now().date_naive()).await {
                tracing::error!(error = %e, "failed to record streak activity");
            }

            let response = ExecuteResponse::from_events(events, compile_command, compiler_output);
            (StatusCode::OK, Json(response)).into_response()
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

/// A MongoDB failure. The `context` names the operation so a log line
/// says which query broke; the response deliberately doesn't, because a
/// driver error can carry connection strings and collection internals.
pub fn mongo_error(e: mongodb::error::Error, context: &str) -> Response {
    tracing::error!(error = %e, context, "mongodb query failed");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({ "error": "database error, please try again" })),
    )
        .into_response()
}

/// The Postgres equivalent, for the identity half.
pub fn db_error(e: sqlx::Error) -> Response {
    tracing::error!(error = %e, "postgres query failed");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({ "error": "database error, please try again" })),
    )
        .into_response()
}

fn bad_request(message: &str) -> Response {
    (StatusCode::BAD_REQUEST, Json(json!({ "error": message }))).into_response()
}

/// Resource usage for the signed-in user: lifetime containers spun up
/// against the free-tier cap (`MAX_CONTAINERS_PER_USER`), and the max
/// CPU/memory a single run has been observed to use, against what a
/// single container is capped at (`SandboxConfig::cpp()`) — see `execute`'s
/// peak sampler and `RecentUsage` for where the CPU/memory numbers come
/// from.
pub async fn resources(State(state): State<AppState>, Extension(clerk_jwt): Extension<ClerkJwt>) -> Response {
    let Some(docker) = state.docker.as_deref() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "sandbox is unavailable (no Docker connection)" })),
        )
            .into_response();
    };

    let names = {
        let active = state.active_containers.lock().unwrap();
        active.get(&clerk_jwt.sub).cloned().unwrap_or_default()
    };

    // A container that finishes between the poll and this call just yields
    // `None` from container_stats — dropped via `flatten`, not an error.
    let samples =
        futures_util::future::join_all(names.iter().map(|name| sandbox::container_stats(docker, name)))
            .await;
    let (mut used_cpu_percent, mut used_memory_bytes) = samples
        .into_iter()
        .flatten()
        .fold((0.0_f64, 0_u64), |(cpu, mem), (c, m)| (cpu + c, mem + m));

    // Nothing active right now doesn't mean nothing happened — see
    // AppState's `recent_usage` docs. Only applies when there's truly
    // nothing live to report, so a currently-running container's real
    // reading is never shadowed by a stale one.
    if names.is_empty() {
        if let Some(recent) = state.recent_usage.lock().unwrap().get(&clerk_jwt.sub) {
            if recent.at.elapsed() < RECENT_USAGE_TTL {
                used_cpu_percent = recent.cpu_percent;
                used_memory_bytes = recent.memory_bytes;
            }
        }
    }

    // These are "max a single container could ever use" ceilings, not
    // scaled by MAX_CONTAINERS_PER_USER: cpu/memory here report the peak
    // *one run* hit (§ RecentUsage), never a sum across the lifetime
    // container count, so the meaningful denominator is one container's
    // own cap.
    let per_container = SandboxConfig::cpp();
    let cpu_limit_percent = (per_container.cpu_nano_cpus as f64 / 1_000_000_000.0) * 100.0;
    let memory_limit_bytes = per_container.memory_bytes as u64;

    let used_containers = {
        let counts = state.container_count.lock().unwrap();
        *counts.get(&clerk_jwt.sub).unwrap_or(&0)
    };

    (
        StatusCode::OK,
        Json(json!({
            "containers": { "used": used_containers, "limit": MAX_CONTAINERS_PER_USER },
            "cpu": { "used_percent": used_cpu_percent, "limit_percent": cpu_limit_percent },
            "memory": { "used_bytes": used_memory_bytes, "limit_bytes": memory_limit_bytes },
        })),
    )
        .into_response()
}
