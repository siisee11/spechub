use anyhow::{anyhow, Result};

use crate::lint::{self, Severity};
use crate::util::process;

pub fn run() -> Result<()> {
    if let Some(command) = std::env::var_os("HARNESS_LINT_CMD") {
        return process::run_shell(command.to_string_lossy().as_ref(), None, "lint override");
    }

    process::run_command(
        "cargo",
        [
            "fmt",
            "--manifest-path",
            "harness/Cargo.toml",
            "--all",
            "--",
            "--check",
        ],
        None,
        "cargo fmt --check",
    )?;

    let report = lint::scan_repo(&std::env::current_dir()?)?;
    if report.violations.is_empty() {
        return Ok(());
    }

    for violation in &report.violations {
        eprintln!(
            "{}: {}:{} {}",
            violation.severity.as_str(),
            violation.file,
            violation.line,
            violation.message
        );
        eprintln!("  Fix: {}", violation.remediation);
    }

    if report
        .violations
        .iter()
        .any(|violation| matches!(violation.severity, Severity::Error | Severity::Warn))
    {
        return Err(anyhow!("lint violations detected"));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lint_override_uses_shell_command() {
        let result = std::panic::catch_unwind(|| {
            std::env::set_var("HARNESS_LINT_CMD", "true");
            run().expect("override should succeed");
            std::env::remove_var("HARNESS_LINT_CMD");
        });
        assert!(result.is_ok());
    }
}
