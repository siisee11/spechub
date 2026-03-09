use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::Path;

use anyhow::Result;
use serde::Serialize;

use crate::ServeKind;

pub fn run(kind: ServeKind, port: u16, worktree_id: &str, repo_root: &Path) -> Result<()> {
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
        let response = build_response(&kind, path, worktree_id, repo_root);
        stream.write_all(response.as_bytes())?;
    }
    Ok(())
}

fn build_response(kind: &ServeKind, path: &str, worktree_id: &str, repo_root: &Path) -> String {
    let (content_type, body) = match kind {
        ServeKind::App => app_body(path, worktree_id, repo_root),
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
struct SpecEntry {
    slug: String,
    title: String,
    summary: String,
}

fn app_body(path: &str, worktree_id: &str, repo_root: &Path) -> (&'static str, String) {
    let route = path.split('?').next().unwrap_or(path);
    if route == "/health" {
        return (
            "application/json",
            format!(r#"{{"status":"ok","worktree_id":"{worktree_id}"}}"#),
        );
    }

    if route == "/api/specs" {
        let body =
            serde_json::to_string_pretty(&load_spec_entries(repo_root)).unwrap_or_else(|_| "[]".to_string());
        return ("application/json", body);
    }

    let specs = load_spec_entries(repo_root);
    let cards_html = specs
        .iter()
        .map(|spec| {
            format!(
                "<article class=\"spec-card\"><p class=\"spec-slug\">{slug}</p><h2>{title}</h2><p>{summary}</p><p class=\"spec-path\">specs/{slug}</p></article>",
                slug = escape_html(&spec.slug),
                title = escape_html(&spec.title),
                summary = escape_html(&spec.summary)
            )
        })
        .collect::<String>();
    let body = format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>SpecHub</title><style>{}</style></head><body><main><header><p class=\"badge\">SPECHUB</p><h1>Community Spec Marketplace</h1><p>Browse specs stored in this repository under <code>specs/&lt;slug&gt;/</code>.</p><p class=\"meta\">worktree: {worktree_id} · specs: {spec_count}</p></header><section class=\"grid\">{cards_html}</section></main></body></html>",
        app_styles(),
        spec_count = specs.len()
    );
    ("text/html; charset=utf-8", body)
}

fn load_spec_entries(repo_root: &Path) -> Vec<SpecEntry> {
    let specs_root = repo_root.join("specs");
    let entries = match fs::read_dir(specs_root) {
        Ok(entries) => entries,
        Err(_) => return Vec::new(),
    };

    let mut specs = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let file_type = entry.file_type().ok()?;
            if !file_type.is_dir() {
                return None;
            }
            let slug = entry.file_name().to_string_lossy().to_string();
            let spec_md_path = entry.path().join("SPEC.md");
            let spec_md = fs::read_to_string(spec_md_path).unwrap_or_default();
            let (title, summary) = parse_spec_content(&slug, &spec_md);
            Some(SpecEntry {
                slug,
                title,
                summary,
            })
        })
        .collect::<Vec<_>>();
    specs.sort_by(|a, b| a.slug.cmp(&b.slug));
    specs
}

fn parse_spec_content(slug: &str, content: &str) -> (String, String) {
    let title = content
        .lines()
        .map(str::trim)
        .find(|line| line.starts_with("# "))
        .map(|line| line.trim_start_matches("# ").trim().to_string())
        .filter(|line| !line.is_empty())
        .unwrap_or_else(|| slug.to_string());

    let summary = content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with('#') && !line.starts_with('`'))
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "No summary available yet.".to_string());

    (title, summary)
}

fn app_styles() -> &'static str {
    r#"
    :root {
      --bg: #f4efe5;
      --ink: #13202e;
      --muted: #5d6874;
      --card: #fffdf8;
      --line: #d8c7ab;
      --accent: #c55a2f;
      --accent-soft: #f8d9c4;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, "Avenir Next", "Trebuchet MS", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top right, #e9d7b6 0, transparent 38%),
        radial-gradient(circle at bottom left, #f2c8ab 0, transparent 42%),
        var(--bg);
      min-height: 100vh;
    }
    main { max-width: 1040px; margin: 0 auto; padding: 52px 20px 72px; }
    header { margin-bottom: 28px; }
    .badge {
      display: inline-block;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 12px;
      letter-spacing: 0.1em;
      background: var(--card);
      margin: 0 0 14px;
    }
    h1 {
      font-size: clamp(2rem, 4.6vw, 3.2rem);
      line-height: 1.05;
      margin: 0 0 12px;
      font-weight: 700;
    }
    header > p {
      max-width: 760px;
      margin: 0 0 10px;
      color: var(--muted);
      line-height: 1.45;
      font-size: 1.03rem;
    }
    .meta {
      color: var(--ink);
      font-weight: 600;
      font-size: 0.92rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
    }
    .spec-card {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--card);
      padding: 18px;
      box-shadow: 0 10px 22px rgba(29, 35, 41, 0.07);
    }
    .spec-slug {
      color: var(--accent);
      font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
      font-size: 0.78rem;
      letter-spacing: 0.04em;
      margin: 0 0 10px;
      text-transform: uppercase;
    }
    h2 {
      font-size: 1.25rem;
      margin: 0 0 8px;
      line-height: 1.2;
    }
    .spec-card p {
      margin: 0 0 10px;
      color: var(--muted);
      line-height: 1.35;
    }
    .spec-path {
      display: inline-block;
      background: var(--accent-soft);
      border-radius: 999px;
      padding: 6px 10px;
      font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
      color: var(--ink) !important;
      font-size: 0.79rem;
      margin-bottom: 0 !important;
    }
    @media (max-width: 620px) {
      main { padding-top: 36px; }
      .grid { grid-template-columns: 1fr; }
    }
    "#
}

fn escape_html(raw: &str) -> String {
    raw.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_repo_root() -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("duration")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("serve-spec-tests-{nonce}"));
        fs::create_dir_all(root.join("specs/create-harness")).expect("create dirs");
        fs::write(
            root.join("specs/create-harness/SPEC.md"),
            "# Create Harness\n\nPortable harness blueprint.\n",
        )
        .expect("write spec");
        root
    }

    #[test]
    fn serve_health_response_is_ok() {
        let response = build_response(&ServeKind::Logs, "/health", "repo-123", Path::new("."));
        assert!(response.contains("\"status\":\"ok\""));
    }

    #[test]
    fn parse_spec_content_uses_heading_and_summary_line() {
        let (title, summary) = parse_spec_content("create-harness", "# Create Harness\n\nBuild systems.\n");
        assert_eq!(title, "Create Harness");
        assert_eq!(summary, "Build systems.");
    }

    #[test]
    fn app_html_lists_specs_from_specs_directory() {
        let root = test_repo_root();
        let response = build_response(&ServeKind::App, "/", "repo-123", &root);
        assert!(response.contains("Community Spec Marketplace"));
        assert!(response.contains("create-harness"));
        assert!(response.contains("Create Harness"));
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn app_api_returns_json_list() {
        let root = test_repo_root();
        let response = build_response(&ServeKind::App, "/api/specs", "repo-123", &root);
        assert!(response.contains("\"slug\": \"create-harness\""));
        assert!(response.contains("\"title\": \"Create Harness\""));
        fs::remove_dir_all(root).expect("cleanup");
    }
}
