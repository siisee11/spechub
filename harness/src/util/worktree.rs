use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, Result};

use crate::util::process;

pub fn repo_root_from(start: &Path) -> Result<PathBuf> {
    let output = process::capture_command("git", ["rev-parse", "--show-toplevel"], Some(start))?;
    Ok(PathBuf::from(output))
}

pub fn branch_name(repo_root: &Path) -> Result<String> {
    let branch = process::capture_command("git", ["branch", "--show-current"], Some(repo_root))?;
    if branch.is_empty() {
        Ok("main".to_string())
    } else {
        Ok(branch)
    }
}

pub fn worktree_id(repo_root: &Path) -> Result<String> {
    if let Ok(override_id) = std::env::var("DISCODE_WORKTREE_ID") {
        return Ok(override_id);
    }
    let repo_name = repo_root
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| anyhow!("repo root missing final path segment"))?;
    let branch = branch_name(repo_root)?;
    let slug = sanitize(repo_name);
    let hash = fnv1a(&format!("{}::{branch}", repo_root.display()));
    Ok(format!("{slug}-{:06x}", hash & 0x00ff_ffff))
}

pub fn runtime_root(repo_root: &Path, worktree_id: &str) -> PathBuf {
    repo_root.join(".worktree").join(worktree_id)
}

pub fn ensure_runtime_dirs(runtime_root: &Path) -> Result<()> {
    fs::create_dir_all(runtime_root.join("logs"))?;
    fs::create_dir_all(runtime_root.join("tmp"))?;
    fs::create_dir_all(runtime_root.join("run"))?;
    fs::create_dir_all(runtime_root.join("observability"))?;
    Ok(())
}

pub fn derive_port(
    repo_root: &Path,
    worktree_id: &str,
    start: u16,
    slots: u16,
    env_key: &str,
) -> Result<u16> {
    if let Ok(value) = std::env::var(env_key) {
        return value.parse().map_err(Into::into);
    }
    let seed = fnv1a(&format!("{}::{worktree_id}::{start}", repo_root.display())) as u16;
    Ok(start + (seed % slots))
}

fn sanitize(value: &str) -> String {
    value
        .chars()
        .map(|char| {
            if char.is_ascii_alphanumeric() {
                char.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn fnv1a(value: &str) -> u64 {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in value.bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_replaces_non_alphanumeric_characters() {
        assert_eq!(sanitize("spec hub"), "spec-hub");
    }

    #[test]
    fn fnv_hash_is_deterministic() {
        assert_eq!(fnv1a("abc"), fnv1a("abc"));
    }
}
