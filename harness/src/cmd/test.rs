use anyhow::Result;

use crate::util::process;

pub fn run() -> Result<()> {
    if let Some(command) = std::env::var_os("HARNESS_TEST_CMD") {
        return process::run_shell(command.to_string_lossy().as_ref(), None, "test override");
    }

    process::run_command(
        "cargo",
        ["test", "--manifest-path", "harness/Cargo.toml"],
        None,
        "cargo test",
    )?;

    process::run_command("bun", ["test", "scripts/ralph-loop"], None, "bun test")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_override_uses_shell_command() {
        let result = std::panic::catch_unwind(|| {
            std::env::set_var("HARNESS_TEST_CMD", "true");
            run().expect("override should succeed");
            std::env::remove_var("HARNESS_TEST_CMD");
        });
        assert!(result.is_ok());
    }
}
