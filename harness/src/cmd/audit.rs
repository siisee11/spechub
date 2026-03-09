use std::path::PathBuf;

use anyhow::{anyhow, Result};

use crate::util::process;

const REQUIRED_FILES: &[&str] = &[
    "AGENTS.md",
    "ARCHITECTURE.md",
    "NON_NEGOTIABLE_RULES.md",
    "docs/PLANS.md",
    "docs/design-docs/index.md",
    "docs/exec-plans/tech-debt-tracker.md",
    "docs/product-specs/index.md",
    "Makefile.harness",
    "harness/Cargo.toml",
    ".github/workflows/harness.yml",
];

const REQUIRED_DIRS: &[&str] = &[
    "docs/design-docs",
    "docs/exec-plans/active",
    "docs/exec-plans/completed",
    "docs/product-specs",
    "docs/references",
    "docs/generated",
];

pub fn run(path: Option<PathBuf>) -> Result<()> {
    let repo = path.unwrap_or(std::env::current_dir()?);
    let mut failures = 0usize;

    for file in REQUIRED_FILES {
        let full = repo.join(file);
        if full.exists() {
            println!("[ok] file {}", file);
        } else {
            println!("[missing] file {}", file);
            failures += 1;
        }
    }

    for dir in REQUIRED_DIRS {
        let full = repo.join(dir);
        if full.is_dir() {
            println!("[ok] dir {}", dir);
        } else {
            println!("[missing] dir {}", dir);
            failures += 1;
        }
    }

    if std::env::var("HARNESS_AUDIT_SKIP_BUILD").ok().as_deref() != Some("1") {
        if process::run_command(
            "cargo",
            ["build", "--manifest-path", "harness/Cargo.toml", "--quiet"],
            Some(&repo),
            "cargo build",
        )
        .is_ok()
        {
            println!("[ok] build harnesscli");
        } else {
            println!("[missing] build harnesscli");
            failures += 1;
        }
    }

    if failures > 0 {
        return Err(anyhow!(
            "Harness audit failed with {} missing item(s).",
            failures
        ));
    }

    println!("Harness audit passed.");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;

    fn temp_dir(name: &str) -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("harness-audit-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("create temp dir");
        path
    }

    fn touch(path: &Path) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent");
        }
        fs::write(path, "x").expect("write file");
    }

    #[test]
    fn audit_succeeds_when_required_paths_exist() {
        let repo = temp_dir("ok");
        for file in REQUIRED_FILES {
            touch(&repo.join(file));
        }
        for dir in REQUIRED_DIRS {
            fs::create_dir_all(repo.join(dir)).expect("create dir");
        }
        std::env::set_var("HARNESS_AUDIT_SKIP_BUILD", "1");
        run(Some(repo)).expect("audit should pass");
        std::env::remove_var("HARNESS_AUDIT_SKIP_BUILD");
    }
}
