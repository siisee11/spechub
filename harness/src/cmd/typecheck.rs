use anyhow::Result;

use crate::util::process;

pub fn run() -> Result<()> {
    if let Some(command) = std::env::var_os("HARNESS_TYPECHECK_CMD") {
        return process::run_shell(
            command.to_string_lossy().as_ref(),
            None,
            "typecheck override",
        );
    }

    process::run_command(
        "cargo",
        ["check", "--manifest-path", "harness/Cargo.toml"],
        None,
        "cargo check",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn typecheck_override_uses_shell_command() {
        let result = std::panic::catch_unwind(|| {
            std::env::set_var("HARNESS_TYPECHECK_CMD", "true");
            run().expect("override should succeed");
            std::env::remove_var("HARNESS_TYPECHECK_CMD");
        });
        assert!(result.is_ok());
    }
}
