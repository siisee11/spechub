use std::fs;
use std::path::PathBuf;

use anyhow::{anyhow, Context, Result};

use crate::util::process;

const TRIGGER_PATHS_FILE: &str = "harness/config/web-deploy-trigger-paths.txt";
const ZERO_SHA: &str = "0000000000000000000000000000000000000000";

pub(super) fn changed_files() -> Result<Vec<String>> {
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

pub(super) fn load_trigger_patterns() -> Result<Vec<String>> {
    let path = resolve_trigger_paths_file()?;
    let content = fs::read_to_string(&path)
        .with_context(|| format!("failed to read trigger contract at {}", path.display()))?;

    Ok(content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| line.to_string())
        .collect())
}

pub(super) fn has_deploy_surface_change(
    changed_files: &[String],
    trigger_patterns: &[String],
) -> bool {
    changed_files.iter().any(|path| {
        trigger_patterns
            .iter()
            .any(|pattern| path_matches_pattern(path, pattern))
    })
}

pub(super) fn path_matches_pattern(path: &str, pattern: &str) -> bool {
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

fn parse_changed_files(raw: &str) -> Vec<String> {
    raw.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(normalize_path)
        .collect()
}

fn normalize_path(path: &str) -> String {
    path.trim_start_matches("./").replace('\\', "/")
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

    Err(anyhow!(
        "failed to locate trigger contract file `{TRIGGER_PATHS_FILE}`"
    ))
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
