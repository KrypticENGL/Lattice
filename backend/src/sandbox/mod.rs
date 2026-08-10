//! Sandbox orchestration (BLUEPRINT.md §3, §6, §12 Phase 1).
//!
//! Spawns a fresh, ephemeral Docker container per execution, feeds it the
//! user's source on stdin, and collects the tracer's NDJSON stdout —
//! never touching the tracer directly, never reusing a container across
//! requests. Enforces §6.3's defense-in-depth caps at *this* layer too
//! (independent of the tracer's own, in case the tracer itself hangs or
//! misbehaves): a wall-clock deadline and an output-byte cap.

use crate::trace::TraceEvent;
use bollard::container::LogOutput;
use bollard::models::{ContainerCreateBody, HostConfig};
use bollard::query_parameters::{
    AttachContainerOptionsBuilder, CreateContainerOptionsBuilder, RemoveContainerOptionsBuilder,
};
use bollard::Docker;
use futures_util::{Stream, StreamExt};
use std::collections::HashMap;
use std::fmt;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::time::Instant;

pub const CPP_IMAGE: &str = "lattice-cpp-tracer:latest";

#[derive(Debug, Clone)]
pub struct SandboxConfig {
    pub image: String,
    /// Orchestrator-side wall-clock deadline (§6.3 layer 2) — fires even
    /// if the tracer's own internal timeout fails to (e.g. it's stuck in
    /// something it can't instrument, or gdb itself hangs — see the
    /// tight-infinite-loop caveat documented in gdb_hook.py).
    pub timeout: Duration,
    pub step_cap: u32,
    pub max_heap_objects: u32,
    /// Orchestrator-side output cap (§6.3 layer 3), independent of and in
    /// addition to tracer.py's own --output-byte-cap.
    pub output_byte_cap: usize,
}

impl SandboxConfig {
    pub fn cpp() -> Self {
        Self {
            image: CPP_IMAGE.to_string(),
            timeout: Duration::from_secs(15),
            step_cap: 5000,
            max_heap_objects: 2000,
            output_byte_cap: 5 * 1024 * 1024,
        }
    }

    /// The deadline handed to tracer.py's own `--timeout`, kept a little
    /// shorter than the orchestrator's so the tracer gets a chance to shut
    /// down cleanly (and emit its own graceful truncation marker) before
    /// this layer kills the container outright.
    fn inner_timeout_secs(&self) -> f64 {
        (self.timeout.as_secs_f64() - 3.0).max(1.0)
    }
}

#[derive(Debug)]
pub enum SandboxOutcome {
    Trace {
        events: Vec<TraceEvent>,
        /// From tracer.py's preamble line (emitted before any TraceEvents
        /// on a successful compile) — the `g++ ...` invocation and any
        /// stderr it produced (empty string, not `None`, when there were
        /// no warnings), so a caller can render a real compile-then-run
        /// transcript instead of just the program's own stdout.
        compile_command: String,
        compiler_output: String,
    },
    /// tracer.py's single-object `{"error": "compile_error", ...}` contract
    /// — not a TraceEvent, source never ran at all.
    CompileError(String),
}

#[derive(Debug)]
pub enum SandboxError {
    Docker(bollard::errors::Error),
    Io(std::io::Error),
    /// The tracer emitted something that doesn't match its own contract
    /// (NDJSON TraceEvents or a single compile_error object). Carries
    /// captured stderr as a diagnostic.
    InvalidOutput { detail: String, stderr: String },
}

impl fmt::Display for SandboxError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SandboxError::Docker(e) => write!(f, "docker error: {e}"),
            SandboxError::Io(e) => write!(f, "io error talking to sandbox container: {e}"),
            SandboxError::InvalidOutput { detail, stderr } => {
                write!(f, "sandbox produced invalid output: {detail}")?;
                if !stderr.is_empty() {
                    write!(f, " (stderr: {stderr})")?;
                }
                Ok(())
            }
        }
    }
}

impl std::error::Error for SandboxError {}

enum Truncation {
    None,
    OutputCap,
    Timeout,
}

pub async fn run_cpp_trace(
    docker: &Docker,
    source: &str,
    config: &SandboxConfig,
) -> Result<SandboxOutcome, SandboxError> {
    let container_name = format!("lattice-trace-{}", uuid::Uuid::new_v4());

    let host_config = HostConfig {
        network_mode: Some("none".to_string()),
        readonly_rootfs: Some(true),
        // `exec` must be explicit: Docker's --tmpfs defaults to `noexec`
        // when no options are given (verified empirically — a tmpfs
        // mounted without it silently breaks g++'s compiled binary from
        // ever running, surfacing as "program exited before reaching
        // main"). tracer.py compiles and executes inside this mount.
        tmpfs: Some(HashMap::from([(
            "/tmp".to_string(),
            "rw,exec,nosuid,size=16m".to_string(),
        )])),
        cap_drop: Some(vec!["ALL".to_string()]),
        // The one deliberate exception to "drop everything": gdb has to
        // ptrace(2) its own child to single-step it, and Docker's default
        // seccomp profile gates the ptrace syscall on this capability
        // regardless of the kernel's Yama ptrace_scope (verified against
        // this project's tracer — see tracers/cpp/gdb_hook.py). Every
        // other §6.1 restriction (network, filesystem, user, resource
        // limits) still applies unchanged.
        cap_add: Some(vec!["SYS_PTRACE".to_string()]),
        security_opt: Some(vec!["no-new-privileges".to_string()]),
        nano_cpus: Some(500_000_000), // 0.5 CPU
        memory: Some(256 * 1024 * 1024),
        memory_swap: Some(256 * 1024 * 1024), // == memory: no swap
        pids_limit: Some(64),
        ..Default::default()
    };

    let body = ContainerCreateBody {
        image: Some(config.image.clone()),
        user: Some("1000:1000".to_string()),
        attach_stdin: Some(true),
        attach_stdout: Some(true),
        attach_stderr: Some(true),
        open_stdin: Some(true),
        stdin_once: Some(true),
        tty: Some(false),
        cmd: Some(vec![
            "--step-cap".to_string(),
            config.step_cap.to_string(),
            "--max-heap-objects".to_string(),
            config.max_heap_objects.to_string(),
            "--timeout".to_string(),
            config.inner_timeout_secs().to_string(),
        ]),
        host_config: Some(host_config),
        ..Default::default()
    };

    docker
        .create_container(
            Some(
                CreateContainerOptionsBuilder::default()
                    .name(&container_name)
                    .build(),
            ),
            body,
        )
        .await
        .map_err(SandboxError::Docker)?;

    // Always clean up, however this turns out — containers are ephemeral,
    // never reused across requests (§6.1).
    let result = run_attached(docker, &container_name, source, config).await;
    let _ = docker
        .remove_container(
            &container_name,
            Some(RemoveContainerOptionsBuilder::default().force(true).build()),
        )
        .await;

    result
}

async fn run_attached(
    docker: &Docker,
    container_name: &str,
    source: &str,
    config: &SandboxConfig,
) -> Result<SandboxOutcome, SandboxError> {
    let attach_options = AttachContainerOptionsBuilder::default()
        .stdin(true)
        .stdout(true)
        .stderr(true)
        .stream(true)
        .logs(false)
        .build();

    let bollard::container::AttachContainerResults {
        mut output,
        mut input,
    } = docker
        .attach_container(container_name, Some(attach_options))
        .await
        .map_err(SandboxError::Docker)?;

    docker
        .start_container(
            container_name,
            None::<bollard::query_parameters::StartContainerOptions>,
        )
        .await
        .map_err(SandboxError::Docker)?;

    input
        .write_all(source.as_bytes())
        .await
        .map_err(SandboxError::Io)?;
    input.shutdown().await.map_err(SandboxError::Io)?;
    drop(input);

    let deadline = Instant::now() + config.timeout;
    let (stdout_bytes, stderr_bytes, truncation) =
        collect_output(&mut output, config.output_byte_cap, deadline).await?;

    parse_tracer_output(&stdout_bytes, &stderr_bytes, truncation)
}

async fn collect_output(
    stream: &mut (impl Stream<Item = Result<LogOutput, bollard::errors::Error>> + Unpin),
    output_byte_cap: usize,
    deadline: Instant,
) -> Result<(Vec<u8>, Vec<u8>, Truncation), SandboxError> {
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    loop {
        let next = match tokio::time::timeout_at(deadline, stream.next()).await {
            Ok(item) => item,
            Err(_) => return Ok((stdout, stderr, Truncation::Timeout)),
        };
        let Some(chunk) = next else { break };
        let chunk = chunk.map_err(SandboxError::Docker)?;
        match chunk {
            LogOutput::StdOut { message } => {
                stdout.extend_from_slice(&message);
                if stdout.len() > output_byte_cap {
                    return Ok((stdout, stderr, Truncation::OutputCap));
                }
            }
            LogOutput::StdErr { message } => {
                stderr.extend_from_slice(&message);
                stderr.truncate(64 * 1024);
            }
            LogOutput::StdIn { .. } | LogOutput::Console { .. } => {}
        }
    }
    Ok((stdout, stderr, Truncation::None))
}

fn parse_tracer_output(
    stdout_bytes: &[u8],
    stderr_bytes: &[u8],
    truncation: Truncation,
) -> Result<SandboxOutcome, SandboxError> {
    let stderr_text = String::from_utf8_lossy(stderr_bytes).into_owned();
    let text = String::from_utf8_lossy(stdout_bytes);

    // A byte-cap or wall-clock cutoff can land mid-line — drop the
    // dangling partial line rather than fail parsing on it.
    let mut lines: Vec<&str> = text.lines().collect();
    if !matches!(truncation, Truncation::None) && !stdout_bytes.ends_with(b"\n") {
        lines.pop();
    }

    let mut events = Vec::with_capacity(lines.len());
    let mut compile_command = String::new();
    let mut compiler_output = String::new();
    for line in lines {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // tracer.py's contract: a compile failure is a single JSON object
        // shaped `{"error": "compile_error", "message": "..."}`, not a
        // TraceEvent — check that shape before attempting schema parsing.
        if let Ok(raw) = serde_json::from_str::<serde_json::Value>(line) {
            if raw.get("error").and_then(|v| v.as_str()) == Some("compile_error") {
                let message = raw
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("compilation failed")
                    .to_string();
                return Ok(SandboxOutcome::CompileError(message));
            }
            // The one-time preamble a successful compile emits before any
            // TraceEvents (tracer.py's contract) — also not a TraceEvent,
            // so it must be pulled out here rather than falling through to
            // schema parsing below, where it would fail to match either
            // untagged variant.
            if let Some(cmd) = raw.get("compile_command").and_then(|v| v.as_str()) {
                compile_command = cmd.to_string();
                compiler_output = raw
                    .get("compiler_output")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                continue;
            }
        }

        match serde_json::from_str::<TraceEvent>(line) {
            Ok(event) => events.push(event),
            Err(e) => {
                return Err(SandboxError::InvalidOutput {
                    detail: format!("line didn't match the TraceEvent schema ({e}): {line:?}"),
                    stderr: stderr_text,
                });
            }
        }
    }

    let already_truncated = events.last().is_some_and(TraceEvent::is_truncated);
    if !already_truncated {
        let reason = match truncation {
            Truncation::None => None,
            Truncation::OutputCap => Some("output_cap"),
            Truncation::Timeout => Some("timeout"),
        };
        if let Some(reason) = reason {
            events.push(TraceEvent::Truncated(crate::trace::TruncatedEvent {
                step: -1,
                event: "truncated".to_string(),
                reason: reason.to_string(),
            }));
        }
    }

    Ok(SandboxOutcome::Trace {
        events,
        compile_command,
        compiler_output,
    })
}
