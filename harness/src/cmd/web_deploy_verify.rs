use std::thread;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};

use crate::util::process;

const VERIFY_ATTEMPTS: usize = 6;
const VERIFY_DELAY_MS: u64 = 2_000;
const HTTP_OK_MIN: u16 = 200;
const HTTP_OK_MAX: u16 = 399;

pub(super) fn deployment_url_from_output(stdout: &str, stderr: &str) -> Result<String> {
    let combined = format!("{stdout}\n{stderr}");
    extract_deployment_url(&combined)
        .ok_or_else(|| anyhow!("web deploy did not produce a deployment URL"))
}

pub(super) fn verify_deployment_target(deployment_url: &str) -> Result<()> {
    if let Some(command) = std::env::var_os("HARNESS_WEB_DEPLOY_VERIFY_CMD") {
        return process::run_shell(
            command.to_string_lossy().as_ref(),
            None,
            "web deploy verify override",
        );
    }

    let mut last_error: Option<anyhow::Error> = None;
    for attempt in 1..=VERIFY_ATTEMPTS {
        match fetch_http_status_code(deployment_url) {
            Ok(status) if (HTTP_OK_MIN..=HTTP_OK_MAX).contains(&status) => return Ok(()),
            Ok(status) => {
                last_error = Some(anyhow!(
                    "deployment URL {deployment_url} returned HTTP status {status}"
                ));
            }
            Err(error) => {
                last_error = Some(error);
            }
        }

        if attempt < VERIFY_ATTEMPTS {
            thread::sleep(Duration::from_millis(VERIFY_DELAY_MS));
        }
    }

    Err(anyhow!(
        "deployment verification failed for {deployment_url}: {}",
        last_error
            .map(|error| error.to_string())
            .unwrap_or_else(|| "unknown error".to_string())
    ))
}

pub(super) fn extract_deployment_url(output: &str) -> Option<String> {
    let mut https_urls = Vec::new();
    let mut pages_urls = Vec::new();

    for token in output.split_whitespace() {
        let trimmed = trim_url_token(token);
        if !trimmed.starts_with("https://") {
            continue;
        }
        let value = trimmed.to_string();
        if value.contains(".pages.dev") {
            pages_urls.push(value);
        } else {
            https_urls.push(value);
        }
    }

    pages_urls.pop().or_else(|| https_urls.pop())
}

fn trim_url_token(token: &str) -> &str {
    token.trim_matches(|value: char| {
        matches!(
            value,
            '"' | '\'' | ',' | ';' | ')' | '(' | '[' | ']' | '{' | '}' | '<' | '>' | '.'
        )
    })
}

fn fetch_http_status_code(url: &str) -> Result<u16> {
    let status = process::capture_command(
        "curl",
        [
            "--silent",
            "--show-error",
            "--location",
            "--max-time",
            "20",
            "--output",
            "/dev/null",
            "--write-out",
            "%{http_code}",
            url,
        ],
        None,
    )
    .with_context(|| format!("failed to fetch deployment URL {url}"))?;

    status
        .trim()
        .parse::<u16>()
        .with_context(|| format!("invalid HTTP status code from curl output `{status}`"))
}
