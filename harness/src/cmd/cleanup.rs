use std::collections::BTreeMap;

use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::lint::{self, Severity, Violation};
use crate::util::worktree;

#[derive(Debug, Deserialize)]
struct PrinciplesFile {
    principles: Vec<Principle>,
}

#[derive(Debug, Deserialize)]
struct Principle {
    id: String,
    severity: Severity,
}

#[derive(Serialize)]
struct ScanOutput {
    timestamp: String,
    violations: Vec<Violation>,
    summary: Summary,
}

#[derive(Serialize)]
struct Summary {
    total: usize,
    by_severity: BTreeMap<String, usize>,
    by_principle: BTreeMap<String, usize>,
}

#[derive(Serialize)]
struct GradeOutput {
    grade: String,
    score: u32,
    timestamp: String,
    trend: String,
    breakdown: BTreeMap<String, GradeBreakdown>,
}

#[derive(Serialize)]
struct GradeBreakdown {
    violations: usize,
    max_score: u32,
    score: u32,
}

pub fn scan() -> Result<()> {
    let repo_root = worktree::repo_root_from(&std::env::current_dir()?)?;
    let output = build_scan_output(&repo_root)?;
    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}

pub fn grade() -> Result<()> {
    let repo_root = worktree::repo_root_from(&std::env::current_dir()?)?;
    let principles = load_principles(&repo_root)?;
    let report = lint::scan_repo(&repo_root)?;
    let mut breakdown = BTreeMap::new();
    let mut score = 100u32;

    for principle in principles.principles {
        let violations = report
            .violations
            .iter()
            .filter(|violation| violation.principle_id == principle.id)
            .count();
        let max_score: u32 = match principle.severity {
            Severity::Error => 30,
            Severity::Warn => 20,
        };
        let penalty = (violations as u32)
            * if matches!(principle.severity, Severity::Error) {
                10
            } else {
                4
            };
        let item_score = max_score.saturating_sub(penalty);
        score = score.saturating_sub(penalty);
        breakdown.insert(
            principle.id,
            GradeBreakdown {
                violations,
                max_score,
                score: item_score,
            },
        );
    }

    let output = GradeOutput {
        grade: letter_grade(score),
        score,
        timestamp: lint::timestamp(),
        trend: "stable".to_string(),
        breakdown,
    };

    let path = repo_root.join("docs/generated/quality-grade.json");
    std::fs::write(path, serde_json::to_vec_pretty(&output)?)?;
    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}

pub fn fix() -> Result<()> {
    let repo_root = worktree::repo_root_from(&std::env::current_dir()?)?;
    let output = build_scan_output(&repo_root)?;
    let path = repo_root.join("docs/generated/cleanup-fixes.json");
    std::fs::write(path, serde_json::to_vec_pretty(&output)?)?;
    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}

fn build_scan_output(repo_root: &std::path::Path) -> Result<ScanOutput> {
    let report = lint::scan_repo(repo_root)?;
    let mut by_severity = BTreeMap::new();
    let mut by_principle = BTreeMap::new();
    for violation in &report.violations {
        *by_severity
            .entry(violation.severity.as_str().to_string())
            .or_insert(0) += 1;
        *by_principle
            .entry(violation.principle_id.clone())
            .or_insert(0) += 1;
    }

    Ok(ScanOutput {
        timestamp: lint::timestamp(),
        violations: report.violations,
        summary: Summary {
            total: by_principle.values().sum(),
            by_severity,
            by_principle,
        },
    })
}

fn load_principles(repo_root: &std::path::Path) -> Result<PrinciplesFile> {
    let bytes = std::fs::read(repo_root.join("golden-principles.yaml"))?;
    Ok(serde_yaml::from_slice(&bytes)?)
}

fn letter_grade(score: u32) -> String {
    match score {
        97..=100 => "A+".to_string(),
        93..=96 => "A".to_string(),
        90..=92 => "A-".to_string(),
        87..=89 => "B+".to_string(),
        83..=86 => "B".to_string(),
        80..=82 => "B-".to_string(),
        _ => "C".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::letter_grade;

    #[test]
    fn grade_boundaries_match_expectations() {
        assert_eq!(letter_grade(100), "A+");
        assert_eq!(letter_grade(88), "B+");
        assert_eq!(letter_grade(70), "C");
    }
}
