use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use crate::util::{http, process, worktree};
use crate::{QuerySignal, ServeKind};

#[derive(Debug, Serialize, Deserialize)]
struct ObservabilityState {
    worktree_id: String,
    vector_log_port: u16,
    vector_otlp_port: u16,
    vlogs_port: u16,
    vmetrics_port: u16,
    vtraces_port: u16,
    pids: Vec<u32>,
}

pub fn start() -> Result<()> {
    let repo_root = worktree::repo_root_from(&std::env::current_dir()?)?;
    let worktree_id = worktree::worktree_id(&repo_root)?;
    let runtime_root = worktree::runtime_root(&repo_root, &worktree_id);
    worktree::ensure_runtime_dirs(&runtime_root)?;

    let vector_log_port = worktree::derive_port(
        &repo_root,
        &worktree_id,
        4300,
        100,
        "HARNESS_VECTOR_LOG_PORT",
    )?;
    let vector_otlp_port = worktree::derive_port(
        &repo_root,
        &worktree_id,
        4400,
        100,
        "HARNESS_VECTOR_OTLP_PORT",
    )?;
    let vlogs_port =
        worktree::derive_port(&repo_root, &worktree_id, 4500, 100, "HARNESS_VLOGS_PORT")?;
    let vmetrics_port =
        worktree::derive_port(&repo_root, &worktree_id, 4600, 100, "HARNESS_VMETRICS_PORT")?;
    let vtraces_port =
        worktree::derive_port(&repo_root, &worktree_id, 4700, 100, "HARNESS_VTRACES_PORT")?;

    let mut pids = Vec::new();
    pids.push(spawn_service(
        ServeKind::Collector,
        vector_log_port,
        "vector-log.pid",
        &worktree_id,
        &repo_root,
        &runtime_root,
    )?);
    pids.push(spawn_service(
        ServeKind::Collector,
        vector_otlp_port,
        "vector-otlp.pid",
        &worktree_id,
        &repo_root,
        &runtime_root,
    )?);
    pids.push(spawn_service(
        ServeKind::Logs,
        vlogs_port,
        "vlogs.pid",
        &worktree_id,
        &repo_root,
        &runtime_root,
    )?);
    pids.push(spawn_service(
        ServeKind::Metrics,
        vmetrics_port,
        "vmetrics.pid",
        &worktree_id,
        &repo_root,
        &runtime_root,
    )?);
    pids.push(spawn_service(
        ServeKind::Traces,
        vtraces_port,
        "vtraces.pid",
        &worktree_id,
        &repo_root,
        &runtime_root,
    )?);

    http::wait_for_http_ok(&format!("http://127.0.0.1:{vlogs_port}/health"), 40, 100)?;
    http::wait_for_http_ok(&format!("http://127.0.0.1:{vmetrics_port}/health"), 40, 100)?;
    http::wait_for_http_ok(&format!("http://127.0.0.1:{vtraces_port}/health"), 40, 100)?;

    let state = ObservabilityState {
        worktree_id,
        vector_log_port,
        vector_otlp_port,
        vlogs_port,
        vmetrics_port,
        vtraces_port,
        pids,
    };

    let state_path = runtime_root.join("observability/state.json");
    std::fs::write(&state_path, serde_json::to_vec_pretty(&state)?)?;
    println!("{}", serde_json::to_string_pretty(&state)?);
    Ok(())
}

pub fn stop(clean: bool) -> Result<()> {
    let (repo_root, state_path) = state_path()?;
    if !state_path.exists() {
        return Ok(());
    }
    let state: ObservabilityState = serde_json::from_slice(&std::fs::read(&state_path)?)?;
    for pid in state.pids {
        let _ = process::run_command(
            "kill",
            ["-TERM", &pid.to_string()],
            Some(&repo_root),
            "kill",
        );
    }
    std::fs::remove_file(&state_path)?;
    if clean {
        let runtime_root = worktree::runtime_root(&repo_root, &state.worktree_id);
        let _ = std::fs::remove_dir_all(runtime_root.join("observability"));
    }
    Ok(())
}

pub fn query(signal: QuerySignal, query: &str) -> Result<()> {
    let (_repo_root, state_path) = state_path()?;
    let state: ObservabilityState = serde_json::from_slice(&std::fs::read(&state_path)?)?;
    let encoded = http::percent_encode(query);
    let url = match signal {
        QuerySignal::Logs => {
            format!(
                "http://127.0.0.1:{}/select/logsql/query?query={encoded}",
                state.vlogs_port
            )
        }
        QuerySignal::Metrics => {
            format!(
                "http://127.0.0.1:{}/api/v1/query?query={encoded}",
                state.vmetrics_port
            )
        }
        QuerySignal::Traces => {
            format!(
                "http://127.0.0.1:{}/api/v3/search?query={encoded}",
                state.vtraces_port
            )
        }
    };
    println!("{}", http::http_get(&url)?);
    Ok(())
}

fn spawn_service(
    kind: ServeKind,
    port: u16,
    pid_name: &str,
    worktree_id: &str,
    repo_root: &std::path::Path,
    runtime_root: &std::path::Path,
) -> Result<u32> {
    let pid_path = runtime_root.join(format!("run/{pid_name}"));
    if process::pid_file_alive(&pid_path)? {
        return process::read_pid(&pid_path)
            .ok_or_else(|| anyhow!("failed to read running pid from {}", pid_path.display()));
    }

    let exe = std::env::current_exe()?;
    let log_path = runtime_root.join(format!("logs/{pid_name}.log"));
    process::spawn_background(
        exe,
        vec![
            "serve".to_string(),
            serve_kind_name(kind).to_string(),
            "--port".to_string(),
            port.to_string(),
            "--worktree-id".to_string(),
            worktree_id.to_string(),
            "--repo-root".to_string(),
            repo_root.display().to_string(),
        ],
        &pid_path,
        &log_path,
    )
}

fn state_path() -> Result<(std::path::PathBuf, std::path::PathBuf)> {
    let repo_root = worktree::repo_root_from(&std::env::current_dir()?)?;
    let worktree_id = worktree::worktree_id(&repo_root)?;
    let runtime_root = worktree::runtime_root(&repo_root, &worktree_id);
    Ok((repo_root, runtime_root.join("observability/state.json")))
}

fn serve_kind_name(kind: ServeKind) -> &'static str {
    match kind {
        ServeKind::App => "app",
        ServeKind::Collector => "collector",
        ServeKind::Logs => "logs",
        ServeKind::Metrics => "metrics",
        ServeKind::Traces => "traces",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn observability_state_serializes() {
        let state = ObservabilityState {
            worktree_id: "repo-123".to_string(),
            vector_log_port: 4301,
            vector_otlp_port: 4401,
            vlogs_port: 4501,
            vmetrics_port: 4601,
            vtraces_port: 4701,
            pids: vec![1, 2, 3],
        };
        let json = serde_json::to_string(&state).expect("serialize");
        assert!(json.contains("vlogs_port"));
    }
}
