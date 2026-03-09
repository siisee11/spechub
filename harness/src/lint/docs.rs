use std::fs;
use std::path::Path;

use anyhow::Result;

use super::{Severity, Violation};

const REQUIRED_LINKS: &[&str] = &[
    "NON_NEGOTIABLE_RULES.md",
    "ARCHITECTURE.md",
    "docs/design-docs/index.md",
    "docs/product-specs/index.md",
    "docs/PLANS.md",
];

pub fn scan_agents_document(repo_root: &Path) -> Result<Vec<Violation>> {
    let path = repo_root.join("AGENTS.md");
    let content = fs::read_to_string(&path)?;
    let mut violations = Vec::new();

    if content.lines().count() > 130 {
        violations.push(Violation {
            principle_id: "docs-as-infrastructure".to_string(),
            file: "AGENTS.md".to_string(),
            line: 1,
            description: "AGENTS.md exceeded the size budget for a navigation file.".to_string(),
            severity: Severity::Error,
            remediation:
                "Move substantive guidance into canonical docs and keep AGENTS.md as a map."
                    .to_string(),
            message: "AGENTS.md is too large".to_string(),
        });
    }

    for link in REQUIRED_LINKS {
        if !content.contains(link) {
            violations.push(Violation {
                principle_id: "docs-as-infrastructure".to_string(),
                file: "AGENTS.md".to_string(),
                line: 1,
                description: format!("AGENTS.md is missing the canonical link `{link}`."),
                severity: Severity::Error,
                remediation:
                    "Restore the canonical link so agents can navigate to the source of truth."
                        .to_string(),
                message: "AGENTS.md missing canonical link".to_string(),
            });
        }
    }

    Ok(violations)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn docs_scan_flags_missing_links() {
        let repo = std::env::temp_dir().join(format!("harness-lint-docs-{}", std::process::id()));
        let _ = fs::remove_dir_all(&repo);
        fs::create_dir_all(&repo).expect("create repo");
        fs::write(repo.join("AGENTS.md"), "# only one line\n").expect("write agents");
        let violations = scan_agents_document(&repo).expect("scan");
        assert!(!violations.is_empty());
    }
}
