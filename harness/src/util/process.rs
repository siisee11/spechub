use std::ffi::OsStr;
use std::fs;
use std::path::Path;
use std::process::{Command, Stdio};

use anyhow::{anyhow, Context, Result};

pub fn run_command<I, S>(program: &str, args: I, cwd: Option<&Path>, label: &str) -> Result<()>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = Command::new(program);
    command.args(args);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    let status = command
        .status()
        .with_context(|| format!("failed to start {label}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(anyhow!("{label} failed with status {status}"))
    }
}

pub fn capture_command<I, S>(program: &str, args: I, cwd: Option<&Path>) -> Result<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = Command::new(program);
    command.args(args);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    let output = command.output()?;
    if !output.status.success() {
        return Err(anyhow!("{program} exited with status {}", output.status));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn run_shell(command: &str, cwd: Option<&Path>, label: &str) -> Result<()> {
    run_command("sh", ["-lc", command], cwd, label)
}

pub fn spawn_background(
    exe: std::path::PathBuf,
    args: Vec<String>,
    pid_path: &Path,
    log_path: &Path,
) -> Result<u32> {
    if let Some(parent) = pid_path.parent() {
        fs::create_dir_all(parent)?;
    }
    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let command = format!(
        "nohup {} >/dev/null 2>>{} </dev/null & echo $!",
        shell_join(
            std::iter::once(exe.as_os_str().to_string_lossy().to_string())
                .chain(args.into_iter())
                .collect::<Vec<_>>()
                .as_slice()
        ),
        shell_quote(&log_path.display().to_string())
    );

    let output = Command::new("sh")
        .args(["-lc", &command])
        .output()
        .context("failed to start detached process")?;
    if !output.status.success() {
        return Err(anyhow!(
            "detached launch failed with status {}",
            output.status
        ));
    }

    let pid = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<u32>()?;
    fs::write(pid_path, pid.to_string())?;
    Ok(pid)
}

pub fn pid_file_alive(pid_path: &Path) -> Result<bool> {
    if let Some(pid) = read_pid(pid_path) {
        let status = Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()?;
        return Ok(status.success());
    }
    Ok(false)
}

pub fn read_pid(pid_path: &Path) -> Option<u32> {
    fs::read_to_string(pid_path).ok()?.trim().parse().ok()
}

fn shell_join(args: &[String]) -> String {
    args.iter()
        .map(|value| shell_quote(value))
        .collect::<Vec<_>>()
        .join(" ")
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}
