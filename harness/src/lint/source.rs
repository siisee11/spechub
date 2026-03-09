use std::fs;
use std::path::Path;

use anyhow::Result;

use super::{Severity, Violation};
use crate::util::fswalk;

pub fn scan_shell_scripts(repo_root: &Path) -> Result<Vec<Violation>> {
    let mut violations = Vec::new();
    for file in fswalk::files_with_extension(repo_root, "sh")? {
        let content = fs::read_to_string(&file)?;
        if !content.contains("set -euo pipefail") {
            violations.push(Violation {
                principle_id: "shell-strict-mode".to_string(),
                file: relative(repo_root, &file),
                line: 1,
                description: "Harness shell scripts must enable strict mode.".to_string(),
                severity: Severity::Warn,
                remediation: "Add `set -euo pipefail` near the top of the script.".to_string(),
                message: "shell script missing strict mode".to_string(),
            });
        }
    }
    Ok(violations)
}

pub fn scan_wildcard_exports(repo_root: &Path) -> Result<Vec<Violation>> {
    let mut violations = Vec::new();
    for file in fswalk::script_and_source_files(repo_root)? {
        let content = fs::read_to_string(&file)?;
        for (index, line) in content.lines().enumerate() {
            let trimmed = line.trim_start();
            if trimmed.starts_with("export * from ") {
                violations.push(Violation {
                    principle_id: "no-wildcard-re-exports".to_string(),
                    file: relative(repo_root, &file),
                    line: index + 1,
                    description: "Wildcard re-exports hide the public API.".to_string(),
                    severity: Severity::Warn,
                    remediation: "Replace `export *` with explicit named exports.".to_string(),
                    message: "wildcard export detected".to_string(),
                });
            }
        }
    }
    Ok(violations)
}

pub fn scan_file_sizes(repo_root: &Path, max_lines: usize) -> Result<Vec<Violation>> {
    let mut violations = Vec::new();
    for file in fswalk::script_and_source_files(repo_root)? {
        let content = fs::read_to_string(&file)?;
        let lines = content.lines().count();
        if lines > max_lines {
            violations.push(Violation {
                principle_id: "keep-source-files-focused".to_string(),
                file: relative(repo_root, &file),
                line: 1,
                description: format!(
                    "Source file has {lines} lines, above the {max_lines} line budget."
                ),
                severity: Severity::Warn,
                remediation: "Split the file into focused helpers or modules.".to_string(),
                message: "source file exceeds line budget".to_string(),
            });
        }
    }
    Ok(violations)
}

fn relative(repo_root: &Path, file: &Path) -> String {
    file.strip_prefix(repo_root)
        .unwrap_or(file)
        .display()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn create_repo() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("harness-lint-source-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(path.join("scripts")).expect("create scripts dir");
        path
    }

    #[test]
    fn shell_scan_flags_missing_strict_mode() {
        let repo = create_repo();
        fs::write(repo.join("scripts/test.sh"), "#!/bin/sh\necho hi\n").expect("write script");
        let violations = scan_shell_scripts(&repo).expect("scan");
        assert_eq!(violations.len(), 1);
    }

    #[test]
    fn file_size_scan_flags_large_files() {
        let repo = create_repo();
        let mut file = fs::File::create(repo.join("scripts/test.mts")).expect("create file");
        for _ in 0..300 {
            writeln!(file, "const x = 1;").expect("write line");
        }
        let violations = scan_file_sizes(&repo, 260).expect("scan");
        assert_eq!(violations.len(), 1);
    }
}
