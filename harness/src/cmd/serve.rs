use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::Path;

use anyhow::Result;

use crate::ServeKind;

pub fn run(kind: ServeKind, port: u16, worktree_id: &str, _repo_root: &Path) -> Result<()> {
    let listener = TcpListener::bind(("127.0.0.1", port))?;
    for stream in listener.incoming() {
        let mut stream = stream?;
        let mut buffer = [0_u8; 4096];
        let bytes = stream.read(&mut buffer)?;
        let request = String::from_utf8_lossy(&buffer[..bytes]);
        let path = request
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .unwrap_or("/");
        let response = build_response(&kind, path, worktree_id);
        stream.write_all(response.as_bytes())?;
    }
    Ok(())
}

fn build_response(kind: &ServeKind, path: &str, worktree_id: &str) -> String {
    let (content_type, body) = match kind {
        ServeKind::App => app_preview_body(path, worktree_id),
        ServeKind::Collector => json_body(path, worktree_id, "collector"),
        ServeKind::Logs => json_body(path, worktree_id, "logs"),
        ServeKind::Metrics => json_body(path, worktree_id, "metrics"),
        ServeKind::Traces => json_body(path, worktree_id, "traces"),
    };

    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

fn json_body(path: &str, worktree_id: &str, signal: &str) -> (&'static str, String) {
    let body = if path.starts_with("/health") {
        format!(r#"{{"status":"ok","signal":"{signal}","worktree_id":"{worktree_id}"}}"#)
    } else {
        format!(
            r#"{{"status":"ok","signal":"{signal}","path":"{path}","worktree_id":"{worktree_id}"}}"#
        )
    };
    ("application/json", body)
}

fn app_preview_body(path: &str, worktree_id: &str) -> (&'static str, String) {
    if path.starts_with("/health") {
        return (
            "application/json",
            format!(r#"{{"status":"ok","worktree_id":"{worktree_id}"}}"#),
        );
    }

    let body = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>SpecHub Harness Preview</title></head><body><main><h1>Harness Preview</h1><p>Product website ownership moved to <code>apps/web</code>. This endpoint is reserved for local harness runtime checks.</p></main></body></html>".to_string();
    ("text/html; charset=utf-8", body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serve_health_response_is_ok() {
        let response = build_response(&ServeKind::Logs, "/health", "repo-123");
        assert!(response.contains("\"status\":\"ok\""));
    }

    #[test]
    fn app_health_response_is_ok() {
        let response = build_response(&ServeKind::App, "/health", "repo-123");
        assert!(response.contains("\"worktree_id\":\"repo-123\""));
    }

    #[test]
    fn app_root_returns_harness_preview_html() {
        let response = build_response(&ServeKind::App, "/", "repo-123");
        assert!(response.contains("Harness Preview"));
        assert!(response.contains("apps/web"));
    }
}
