pub mod architecture;
pub mod docs;
pub mod source;

use std::path::Path;

use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Warn,
    Error,
}

impl Severity {
    pub fn as_str(&self) -> &'static str {
        match self {
            Severity::Warn => "warn",
            Severity::Error => "error",
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct Violation {
    pub principle_id: String,
    pub file: String,
    pub line: usize,
    pub description: String,
    pub severity: Severity,
    pub remediation: String,
    #[serde(skip)]
    pub message: String,
}

#[derive(Default)]
pub struct Report {
    pub violations: Vec<Violation>,
}

pub fn scan_repo(repo_root: &Path) -> Result<Report> {
    let mut report = Report::default();
    report
        .violations
        .extend(source::scan_shell_scripts(repo_root)?);
    report
        .violations
        .extend(source::scan_wildcard_exports(repo_root)?);
    report
        .violations
        .extend(source::scan_file_sizes(repo_root, 260)?);
    report
        .violations
        .extend(docs::scan_agents_document(repo_root)?);
    report
        .violations
        .extend(architecture::scan_architecture(repo_root)?);
    Ok(report)
}

pub fn timestamp() -> String {
    "2026-03-09T00:00:00Z".to_string()
}
