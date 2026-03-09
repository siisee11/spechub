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
fn parse_spec_content_uses_heading_and_summary_line() {
    let (title, summary) =
        parse_spec_content("create-harness", "# Create Harness\n\nBuild systems.\n");
    assert_eq!(title, "Create Harness");
    assert_eq!(summary, "Build systems.");
}

#[test]
fn app_html_lists_specs_and_search_surface() {
    let root = test_repo_root();
    let (_, body) = app_body("/", "repo-123", &root);
    assert!(body.contains("Find, copy, and install reusable specs."));
    assert!(body.contains("id=\"spec-search\""));
    assert!(body.contains("Download spec"));
    assert!(body.contains("scripts/install-spec.sh"));
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn app_api_returns_json_list() {
    let root = test_repo_root();
    let (content_type, body) = app_body("/api/specs", "repo-123", &root);
    assert_eq!(content_type, "application/json");
    assert!(body.contains("\"slug\": \"create-harness\""));
    assert!(body.contains("\"install_command\":"));
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn build_install_command_uses_repo_source_when_available() {
    let source = RepoSource {
        owner_repo: "openai/spechub".to_string(),
        reference: "main".to_string(),
    };
    let command = build_install_command(Some(&source), "create-harness");
    assert!(
        command.contains("raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh")
    );
    assert!(command.contains("\"create-harness\""));
}

#[test]
fn parse_github_owner_repo_handles_multiple_remote_formats() {
    assert_eq!(
        parse_github_owner_repo("git@github.com:openai/spechub.git"),
        Some("openai/spechub".to_string())
    );
    assert_eq!(
        parse_github_owner_repo("https://github.com/openai/spechub.git"),
        Some("openai/spechub".to_string())
    );
    assert_eq!(
        parse_github_owner_repo("ssh://git@github.com/openai/spechub.git"),
        Some("openai/spechub".to_string())
    );
    assert_eq!(parse_github_owner_repo("/Users/dev/git/spechub"), None);
}
