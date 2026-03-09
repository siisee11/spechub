use std::fs;
use std::path::Path;
use std::process::Command;

use serde::Serialize;

const APP_CSS: &str = include_str!("marketplace_assets/app.css");
const APP_JS: &str = include_str!("marketplace_assets/app.js");

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
struct SpecEntry {
    slug: String,
    title: String,
    summary: String,
    install_command: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RepoSource {
    owner_repo: String,
    reference: String,
}

pub fn app_body(path: &str, worktree_id: &str, repo_root: &Path) -> (&'static str, String) {
    let route = path.split('?').next().unwrap_or(path);
    if route == "/health" {
        return (
            "application/json",
            format!(r#"{{"status":"ok","worktree_id":"{worktree_id}"}}"#),
        );
    }

    let repo_source = detect_repo_source(repo_root);
    let specs = load_spec_entries(repo_root, repo_source.as_ref());

    if route == "/api/specs" {
        let body = serde_json::to_string_pretty(&specs).unwrap_or_else(|_| "[]".to_string());
        return ("application/json", body);
    }

    let body = render_app_html(worktree_id, &specs, repo_source.as_ref());
    ("text/html; charset=utf-8", body)
}

fn render_app_html(
    worktree_id: &str,
    specs: &[SpecEntry],
    repo_source: Option<&RepoSource>,
) -> String {
    let cards_html = render_spec_cards(specs);
    let source_hint = match repo_source {
        Some(source) => format!(
            "Install commands are linked to <code>{}</code> at ref <code>{}</code>.",
            escape_html(&source.owner_repo),
            escape_html(&source.reference)
        ),
        None => {
            "Install commands use placeholders because `origin` is not a GitHub remote.".to_string()
        }
    };

    format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>SpecHub Marketplace</title><style>{APP_CSS}</style></head><body><main class=\"shell\"><nav class=\"topbar\"><p class=\"brand\">SpecHub</p><p class=\"topbar-meta\">Open spec marketplace</p></nav><header class=\"hero\"><p class=\"eyebrow\">COMMUNITY SPECS</p><h1>Find, copy, and install reusable specs.</h1><p class=\"hero-copy\">Every listing is sourced from <code>specs/&lt;slug&gt;/</code> in this repository. Download commands install only the selected folder into your current directory.</p><p class=\"hero-note\">{source_hint}</p><div class=\"hero-meta\"><span id=\"visible-count\">{count}</span><span>specs visible</span><span class=\"meta-divider\">·</span><span>worktree: {worktree_id}</span></div><label class=\"search-wrap\" for=\"spec-search\"><span>Search specs</span><input id=\"spec-search\" type=\"search\" placeholder=\"Search by name, slug, or summary\" autocomplete=\"off\"></label></header><section id=\"spec-grid\" class=\"grid\">{cards_html}</section><p id=\"empty-state\" class=\"empty-state\" hidden>No specs match your search.</p></main><script>{APP_JS}</script></body></html>",
        count = specs.len(),
    )
}

fn render_spec_cards(specs: &[SpecEntry]) -> String {
    specs
        .iter()
        .map(|spec| {
            let search_blob = format!("{} {} {}", spec.slug, spec.title, spec.summary).to_lowercase();
            format!(
                "<article class=\"spec-card\" data-search=\"{search}\"><p class=\"spec-slug\">{slug}</p><h2>{title}</h2><p class=\"summary\">{summary}</p><p class=\"spec-path\">specs/{slug}</p><pre class=\"install-command\">{command}</pre><button class=\"copy-command\" type=\"button\" data-command=\"{attr_command}\">Download spec</button></article>",
                search = escape_html(&search_blob),
                slug = escape_html(&spec.slug),
                title = escape_html(&spec.title),
                summary = escape_html(&spec.summary),
                command = escape_html(&spec.install_command),
                attr_command = escape_html(&spec.install_command),
            )
        })
        .collect::<String>()
}

fn load_spec_entries(repo_root: &Path, repo_source: Option<&RepoSource>) -> Vec<SpecEntry> {
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
            let spec_md = fs::read_to_string(entry.path().join("SPEC.md")).unwrap_or_default();
            let (title, summary) = parse_spec_content(&slug, &spec_md);
            let install_command = build_install_command(repo_source, &slug);
            Some(SpecEntry {
                slug,
                title,
                summary,
                install_command,
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

fn build_install_command(repo_source: Option<&RepoSource>, slug: &str) -> String {
    match repo_source {
        Some(source) => format!(
            "curl -fsSL \"https://raw.githubusercontent.com/{owner_repo}/{reference}/scripts/install-spec.sh\" | sh -s -- \"{owner_repo}\" \"{reference}\" \"{slug}\"",
            owner_repo = source.owner_repo,
            reference = source.reference,
            slug = slug,
        ),
        None => format!(
            "REPO=owner/repo REF=main curl -fsSL \"https://raw.githubusercontent.com/${{REPO}}/${{REF}}/scripts/install-spec.sh\" | sh -s -- \"${{REPO}}\" \"${{REF}}\" \"{slug}\"",
            slug = slug,
        ),
    }
}

fn detect_repo_source(repo_root: &Path) -> Option<RepoSource> {
    let remote_url = git_output(repo_root, &["remote", "get-url", "origin"])?;
    let owner_repo = parse_github_owner_repo(&remote_url)?;
    let reference = git_output(
        repo_root,
        &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    )
    .and_then(|value| value.strip_prefix("origin/").map(ToOwned::to_owned))
    .filter(|value| !value.is_empty())
    .unwrap_or_else(|| "main".to_string());

    Some(RepoSource {
        owner_repo,
        reference,
    })
}

fn git_output(repo_root: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_root)
        .args(args)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8(output.stdout).ok()?.trim().to_string();
    if value.is_empty() {
        return None;
    }
    Some(value)
}

fn parse_github_owner_repo(remote_url: &str) -> Option<String> {
    let trimmed = remote_url.trim();
    let without_suffix = trimmed.strip_suffix(".git").unwrap_or(trimmed);
    if let Some(path) = without_suffix.strip_prefix("git@github.com:") {
        return Some(path.to_string());
    }
    if let Some(path) = without_suffix.strip_prefix("https://github.com/") {
        return Some(path.trim_matches('/').to_string());
    }
    if let Some(path) = without_suffix.strip_prefix("ssh://git@github.com/") {
        return Some(path.trim_matches('/').to_string());
    }
    None
}

fn escape_html(raw: &str) -> String {
    raw.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[cfg(test)]
#[path = "marketplace_tests.rs"]
mod marketplace_tests;
