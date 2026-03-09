use std::fs;

use anyhow::Result;
use serde::Serialize;

use crate::util::{process, worktree};

#[derive(Serialize)]
struct InitOutput {
    worktree_id: String,
    worktree_path: String,
    work_branch: String,
    base_branch: String,
    deps_installed: bool,
    build_verified: bool,
    runtime_root: String,
}

pub fn run(base_branch: &str, work_branch: Option<&str>) -> Result<()> {
    let repo_root = worktree::repo_root_from(&std::env::current_dir()?)?;
    let current_branch = worktree::branch_name(&repo_root)?;
    let target_branch = work_branch.unwrap_or(current_branch.as_str());

    eprintln!(
        "Initializing harness environment in {}",
        repo_root.display()
    );
    maybe_stash(&repo_root)?;

    if let Some(branch) = work_branch {
        process::run_command(
            "git",
            ["checkout", "-B", branch],
            Some(&repo_root),
            "git checkout",
        )?;
    }

    install_dependencies(&repo_root)?;
    verify_build(&repo_root)?;
    let worktree_id = worktree::worktree_id(&repo_root)?;
    let runtime_root = worktree::runtime_root(&repo_root, &worktree_id);
    worktree::ensure_runtime_dirs(&runtime_root)?;
    ensure_env_file(&repo_root, &worktree_id, &runtime_root)?;

    let output = InitOutput {
        worktree_id,
        worktree_path: repo_root.display().to_string(),
        work_branch: target_branch.to_string(),
        base_branch: base_branch.to_string(),
        deps_installed: true,
        build_verified: true,
        runtime_root: runtime_root.display().to_string(),
    };

    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}

fn maybe_stash(repo_root: &std::path::Path) -> Result<()> {
    let status = process::capture_command("git", ["status", "--porcelain"], Some(repo_root))?;
    if !status.trim().is_empty() {
        eprintln!("Stashing existing changes before init.");
        process::run_command(
            "git",
            [
                "stash",
                "push",
                "--include-untracked",
                "--message",
                "harness-init-auto-stash",
            ],
            Some(repo_root),
            "git stash",
        )?;
    }
    Ok(())
}

fn install_dependencies(repo_root: &std::path::Path) -> Result<()> {
    if repo_root.join("package.json").exists() {
        eprintln!("Installing Bun dependencies.");
        process::run_command("bun", ["install"], Some(repo_root), "bun install")?;
    }

    if repo_root.join("harness/Cargo.toml").exists() {
        eprintln!("Building harness CLI dependencies.");
        process::run_command(
            "cargo",
            ["build", "--manifest-path", "harness/Cargo.toml"],
            Some(repo_root),
            "cargo build",
        )?;
    }

    Ok(())
}

fn verify_build(repo_root: &std::path::Path) -> Result<()> {
    if repo_root.join("Makefile.harness").exists() {
        eprintln!("Running make smoke.");
        return process::run_command("make", ["smoke"], Some(repo_root), "make smoke");
    }

    process::run_command(
        "cargo",
        ["build", "--manifest-path", "harness/Cargo.toml"],
        Some(repo_root),
        "cargo build",
    )
}

fn ensure_env_file(
    repo_root: &std::path::Path,
    worktree_id: &str,
    runtime_root: &std::path::Path,
) -> Result<()> {
    let env_example = repo_root.join(".env.example");
    let env_path = repo_root.join(".env");
    if env_example.exists() && !env_path.exists() {
        fs::copy(env_example, &env_path)?;
    }

    let mut lines = if env_path.exists() {
        fs::read_to_string(&env_path)?
            .lines()
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };

    upsert_line(&mut lines, "DISCODE_WORKTREE_ID", worktree_id);
    upsert_line(
        &mut lines,
        "HARNESS_RUNTIME_ROOT",
        &runtime_root.display().to_string(),
    );
    let body = if lines.is_empty() {
        String::new()
    } else {
        format!("{}\n", lines.join("\n"))
    };
    fs::write(env_path, body)?;
    Ok(())
}

fn upsert_line(lines: &mut Vec<String>, key: &str, value: &str) {
    let replacement = format!("{key}={value}");
    if let Some(existing) = lines
        .iter_mut()
        .find(|line| line.starts_with(&format!("{key}=")))
    {
        *existing = replacement;
    } else {
        lines.push(replacement);
    }
}

#[cfg(test)]
mod tests {
    use super::upsert_line;

    #[test]
    fn upsert_replaces_existing_values() {
        let mut lines = vec!["FOO=1".to_string()];
        upsert_line(&mut lines, "FOO", "2");
        assert_eq!(lines, vec!["FOO=2"]);
    }
}
