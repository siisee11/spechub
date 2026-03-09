use anyhow::Result;
use serde::Serialize;

use crate::util::{http, process, worktree};

#[derive(Serialize)]
struct BootOutput {
    worktree_id: String,
    app_url: String,
    healthcheck_url: String,
    selected_port: u16,
    healthcheck_status: String,
    runtime_root: String,
}

pub fn run() -> Result<()> {
    let repo_root = worktree::repo_root_from(&std::env::current_dir()?)?;
    let worktree_id = worktree::worktree_id(&repo_root)?;
    let runtime_root = worktree::runtime_root(&repo_root, &worktree_id);
    worktree::ensure_runtime_dirs(&runtime_root)?;

    let port = worktree::derive_port(&repo_root, &worktree_id, 4100, 100, "HARNESS_APP_PORT")?;
    let healthcheck_url = format!("http://127.0.0.1:{port}/health");

    let pid_path = runtime_root.join("run/app.pid");
    if !process::pid_file_alive(&pid_path)? {
        let exe = std::env::current_exe()?;
        let log_path = runtime_root.join("logs/app.log");
        process::spawn_background(
            exe,
            vec![
                "serve".to_string(),
                "app".to_string(),
                "--port".to_string(),
                port.to_string(),
                "--worktree-id".to_string(),
                worktree_id.clone(),
                "--repo-root".to_string(),
                repo_root.display().to_string(),
            ],
            &pid_path,
            &log_path,
        )?;
    }

    http::wait_for_http_ok(&healthcheck_url, 40, 100)?;
    let output = BootOutput {
        worktree_id,
        app_url: format!("http://127.0.0.1:{port}/"),
        healthcheck_url,
        selected_port: port,
        healthcheck_status: "ok".to_string(),
        runtime_root: runtime_root.display().to_string(),
    };

    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn boot_output_serializes_expected_fields() {
        let output = BootOutput {
            worktree_id: "repo-123".to_string(),
            app_url: "http://127.0.0.1:4101/".to_string(),
            healthcheck_url: "http://127.0.0.1:4101/health".to_string(),
            selected_port: 4101,
            healthcheck_status: "ok".to_string(),
            runtime_root: ".worktree/repo-123".to_string(),
        };
        let json = serde_json::to_string(&output).expect("serialize");
        assert!(json.contains("app_url"));
        assert!(json.contains("worktree_id"));
    }
}
