use anyhow::Result;

use crate::util::process;

#[path = "web_deploy_changes.rs"]
mod changes;
#[path = "web_deploy_verify.rs"]
mod verify;

pub fn run() -> Result<()> {
    let trigger_patterns = changes::load_trigger_patterns()?;
    let changed_files = changes::changed_files()?;

    if !changes::has_deploy_surface_change(&changed_files, &trigger_patterns) {
        println!("web deploy skipped: no deploy-surface changes detected");
        return Ok(());
    }

    println!("web deploy triggered: deploy-surface changes detected");

    run_install_step()?;
    let deployment_url = run_deploy_step()?;
    verify::verify_deployment_target(&deployment_url)?;
    println!("web deploy verified: {deployment_url}");
    Ok(())
}

fn run_install_step() -> Result<()> {
    if let Some(command) = std::env::var_os("HARNESS_WEB_DEPLOY_INSTALL_CMD") {
        return process::run_shell(
            command.to_string_lossy().as_ref(),
            None,
            "web deploy install override",
        );
    }

    process::run_command(
        "npm",
        ["--prefix", "apps/web", "ci"],
        None,
        "npm --prefix apps/web ci",
    )
}

fn run_deploy_step() -> Result<String> {
    if let Some(command) = std::env::var_os("HARNESS_WEB_DEPLOY_CMD") {
        let output = process::capture_shell_output(
            command.to_string_lossy().as_ref(),
            None,
            "web deploy override",
        )?;
        return verify::deployment_url_from_output(&output.stdout, &output.stderr);
    }

    let output = process::capture_command_output(
        "npm",
        ["run", "web:cf:build-and-deploy"],
        None,
        "npm run web:cf:build-and-deploy",
    )?;
    verify::deployment_url_from_output(&output.stdout, &output.stderr)
}

#[cfg(test)]
#[path = "web_deploy_test.rs"]
mod tests;
