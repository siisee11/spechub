use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

use crate::util::process;

const TRIGGER_PATHS_FILE: &str = "harness/config/web-deploy-trigger-paths.txt";
const ZERO_SHA: &str = "0000000000000000000000000000000000000000";

pub fn run() -> Result<()> {
    let trigger_patterns = load_trigger_patterns(&resolve_trigger_paths_file()?)?;
    let changed_files = changed_files()?;

    if !has_deploy_surface_change(&changed_files, &trigger_patterns) {
        println!("web deploy skipped: no deploy-surface changes detected");
        return Ok(());
    }

    println!("web deploy triggered: deploy-surface changes detected");

    run_install_step()?;
    run_deploy_step()
}

fn run_install_step() -> Result<()> {
    if let Some(command) = std::env::var_os("HARNESS_WEB_DEPLOY_INSTALL_CMD") {
        return process::run_shell(
            command.to_string_lossy().as_ref(),
            None,
            "web deploy install override",
        );
    }

    process::run_command(
        "npm",
        ["--prefix", "apps/web", "ci"],
        None,
        "npm --prefix apps/web ci",
    )
}

fn run_deploy_step() -> Result<()> {
    if let Some(command) = std::env::var_os("HARNESS_WEB_DEPLOY_CMD") {
        return process::run_shell(
            command.to_string_lossy().as_ref(),
            None,
            "web deploy override",
        );
    }

    process::run_command(
        "npm",
        ["run", "web:cf:build-and-deploy"],
        None,
        "npm run web:cf:build-and-deploy",
    )
}

fn changed_files() -> Result<Vec<String>> {
    if let Some(value) = std::env::var_os("HARNESS_WEB_CHANGED_FILES") {
        return Ok(parse_changed_files(value.to_string_lossy().as_ref()));
    }

    let base = std::env::var("HARNESS_WEB_DEPLOY_BASE_SHA").ok();
    let head = std::env::var("HARNESS_WEB_DEPLOY_HEAD_SHA").ok();

    if let Some(base_sha) = base.as_deref() {
        if base_sha == ZERO_SHA {
            let head_sha = head.unwrap_or_else(|| "HEAD".to_string());
            return git_changed_files_from_head(&head_sha);
        }
    }

    let base_ref = base.unwrap_or_else(|| "HEAD~1".to_string());
    let head_ref = head.unwrap_or_else(|| "HEAD".to_string());

    git_changed_files_between(&base_ref, &head_ref)
}

fn git_changed_files_between(base: &str, head: &str) -> Result<Vec<String>> {
    let output = process::capture_command(
        "git",
        ["diff", "--name-only", "--diff-filter=ACMR", base, head],
        None,
    )
    .with_context(|| format!("failed to read changed files from git diff {base} {head}"))?;

    Ok(parse_changed_files(&output))
}

fn git_changed_files_from_head(head: &str) -> Result<Vec<String>> {
    let output = process::capture_command(
        "git",
        ["diff-tree", "--no-commit-id", "--name-only", "-r", head],
        None,
    )
    .with_context(|| format!("failed to read changed files from git diff-tree {head}"))?;

    Ok(parse_changed_files(&output))
}

fn load_trigger_patterns(path: &Path) -> Result<Vec<String>> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("failed to read trigger contract at {}", path.display()))?;

    Ok(content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| line.to_string())
        .collect())
}

fn resolve_trigger_paths_file() -> Result<PathBuf> {
    let direct = PathBuf::from(TRIGGER_PATHS_FILE);
    if direct.exists() {
        return Ok(direct);
    }

    let from_manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join(TRIGGER_PATHS_FILE);
    if from_manifest.exists() {
        return Ok(from_manifest);
    }

    let from_parent = PathBuf::from("..").join(TRIGGER_PATHS_FILE);
    if from_parent.exists() {
        return Ok(from_parent);
    }

    Err(anyhow::anyhow!(
        "failed to locate trigger contract file `{TRIGGER_PATHS_FILE}`"
    ))
}

fn parse_changed_files(raw: &str) -> Vec<String> {
    raw.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(normalize_path)
        .collect()
}

fn has_deploy_surface_change(changed_files: &[String], trigger_patterns: &[String]) -> bool {
    changed_files.iter().any(|path| {
        trigger_patterns
            .iter()
            .any(|pattern| path_matches_pattern(path, pattern))
    })
}

fn path_matches_pattern(path: &str, pattern: &str) -> bool {
    let normalized_path = normalize_path(path);
    let normalized_pattern = normalize_path(pattern);

    if let Some(prefix) = normalized_pattern.strip_suffix("/**") {
        return normalized_path == prefix || normalized_path.starts_with(&format!("{prefix}/"));
    }

    if let Some(prefix) = normalized_pattern.strip_suffix("**") {
        return normalized_path.starts_with(prefix);
    }

    normalized_path == normalized_pattern
}

fn normalize_path(path: &str) -> String {
    path.trim_start_matches("./").replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn directory_glob_matches_nested_file() {
        assert!(path_matches_pattern("apps/web/src/main.tsx", "apps/web/**"));
    }

    #[test]
    fn exact_pattern_matches_only_exact_file() {
        assert!(path_matches_pattern("package.json", "package.json"));
        assert!(!path_matches_pattern("package-lock.json", "package.json"));
    }

    #[test]
    fn deploy_surface_detection_uses_trigger_patterns() {
        let changed = vec!["specs/example/SPEC.md".to_string()];
        let trigger_patterns = vec!["apps/web/**".to_string(), "specs/**".to_string()];
        assert!(has_deploy_surface_change(&changed, &trigger_patterns));
    }

    #[test]
    fn web_deploy_skips_when_no_matching_files() {
        let _guard = env_lock().lock().expect("lock");
        let result = std::panic::catch_unwind(|| {
            std::env::set_var("HARNESS_WEB_CHANGED_FILES", "harness/src/main.rs");
            std::env::set_var("HARNESS_WEB_DEPLOY_INSTALL_CMD", "false");
            std::env::set_var("HARNESS_WEB_DEPLOY_CMD", "false");
            run().expect("web deploy should skip");
            std::env::remove_var("HARNESS_WEB_CHANGED_FILES");
            std::env::remove_var("HARNESS_WEB_DEPLOY_INSTALL_CMD");
            std::env::remove_var("HARNESS_WEB_DEPLOY_CMD");
        });
        assert!(result.is_ok());
    }

    #[test]
    fn web_deploy_uses_overrides_when_matching_files_exist() {
        let _guard = env_lock().lock().expect("lock");
        let result = std::panic::catch_unwind(|| {
            std::env::set_var("HARNESS_WEB_CHANGED_FILES", "apps/web/src/main.tsx");
            std::env::set_var("HARNESS_WEB_DEPLOY_INSTALL_CMD", "true");
            std::env::set_var("HARNESS_WEB_DEPLOY_CMD", "true");
            run().expect("web deploy override should succeed");
            std::env::remove_var("HARNESS_WEB_CHANGED_FILES");
            std::env::remove_var("HARNESS_WEB_DEPLOY_INSTALL_CMD");
            std::env::remove_var("HARNESS_WEB_DEPLOY_CMD");
        });
        assert!(result.is_ok());
    }
}
