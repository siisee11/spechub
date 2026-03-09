use std::fs;
use std::path::{Path, PathBuf};

use anyhow::Result;
use serde::Deserialize;

use super::{Severity, Violation};
use crate::util::fswalk;

#[derive(Debug, Deserialize)]
struct ArchitectureRules {
    rust: LanguageRules,
    typescript: LanguageRules,
}

#[derive(Debug, Deserialize)]
struct LanguageRules {
    disallow: Vec<Rule>,
}

#[derive(Debug, Deserialize)]
struct Rule {
    from_prefix: String,
    to_prefix: String,
    #[serde(default)]
    allow_same_file_module: bool,
    message: String,
}

pub fn scan_architecture(repo_root: &Path) -> Result<Vec<Violation>> {
    let rules: ArchitectureRules =
        serde_json::from_slice(&fs::read(repo_root.join("architecture-rules.json"))?)?;
    let mut violations = Vec::new();

    for file in fswalk::files_with_extension(repo_root, "rs")? {
        violations.extend(scan_file(
            repo_root,
            &file,
            &rules.rust.disallow,
            Language::Rust,
        )?);
    }

    for file in fswalk::files_with_extension(repo_root, "mts")? {
        violations.extend(scan_file(
            repo_root,
            &file,
            &rules.typescript.disallow,
            Language::TypeScript,
        )?);
    }

    Ok(violations)
}

enum Language {
    Rust,
    TypeScript,
}

fn scan_file(
    repo_root: &Path,
    file: &Path,
    rules: &[Rule],
    language: Language,
) -> Result<Vec<Violation>> {
    let content = fs::read_to_string(file)?;
    let from = relative(repo_root, file);
    let mut violations = Vec::new();
    for (index, line) in content.lines().enumerate() {
        let Some(target) = parse_target(&from, line, &language) else {
            continue;
        };
        for rule in rules {
            if from.starts_with(&rule.from_prefix)
                && target.starts_with(&rule.to_prefix)
                && !(rule.allow_same_file_module && target == from)
            {
                violations.push(Violation {
                    principle_id: "architecture-lint".to_string(),
                    file: from.clone(),
                    line: index + 1,
                    description: rule.message.clone(),
                    severity: Severity::Warn,
                    remediation: "Move shared logic into util or a library module that preserves the declared dependency direction.".to_string(),
                    message: "architecture rule violated".to_string(),
                });
            }
        }
    }
    Ok(violations)
}

fn parse_target(from: &str, line: &str, language: &Language) -> Option<String> {
    match language {
        Language::Rust => parse_rust_target(line),
        Language::TypeScript => parse_ts_target(from, line),
    }
}

fn parse_rust_target(line: &str) -> Option<String> {
    let trimmed = line.trim();
    if !trimmed.starts_with("use crate::") {
        return None;
    }
    let module = trimmed
        .trim_start_matches("use crate::")
        .split("::")
        .next()?;
    Some(format!("harness/src/{module}/"))
}

fn parse_ts_target(from: &str, line: &str) -> Option<String> {
    let trimmed = line.trim();
    if !trimmed.starts_with("import ") {
        return None;
    }
    let marker = trimmed.split(" from ").nth(1)?;
    let import_path = marker
        .trim()
        .trim_matches(';')
        .trim_matches('"')
        .trim_matches('\'');
    if !import_path.starts_with('.') {
        return None;
    }
    let base = Path::new(from).parent()?;
    let resolved = base.join(import_path);
    let normalized = normalize_path(resolved);
    Some(normalized)
}

fn normalize_path(path: PathBuf) -> String {
    let mut parts = Vec::new();
    for component in path.components() {
        let value = component.as_os_str().to_string_lossy();
        match value.as_ref() {
            "." => {}
            ".." => {
                let _ = parts.pop();
            }
            other => parts.push(other.to_string()),
        }
    }
    parts.join("/")
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

    #[test]
    fn rust_target_parsing_maps_to_module_roots() {
        assert_eq!(
            parse_rust_target("use crate::cmd::lint;"),
            Some("harness/src/cmd/".to_string())
        );
    }

    #[test]
    fn ts_target_parsing_resolves_relative_paths() {
        let target = parse_ts_target(
            "scripts/ralph-loop/lib/example.mts",
            "import x from \"../ralph-loop.mts\";",
        );
        assert_eq!(
            target,
            Some("scripts/ralph-loop/ralph-loop.mts".to_string())
        );
    }
}
