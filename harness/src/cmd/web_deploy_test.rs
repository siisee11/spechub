use super::*;
use std::sync::{Mutex, OnceLock};

fn env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[test]
fn directory_glob_matches_nested_file() {
    assert!(changes::path_matches_pattern(
        "apps/web/src/main.tsx",
        "apps/web/**"
    ));
}

#[test]
fn exact_pattern_matches_only_exact_file() {
    assert!(changes::path_matches_pattern(
        "package.json",
        "package.json"
    ));
    assert!(!changes::path_matches_pattern(
        "package-lock.json",
        "package.json"
    ));
}

#[test]
fn deploy_surface_detection_uses_trigger_patterns() {
    let changed = vec!["specs/example/SPEC.md".to_string()];
    let trigger_patterns = vec!["apps/web/**".to_string(), "specs/**".to_string()];
    assert!(changes::has_deploy_surface_change(
        &changed,
        &trigger_patterns
    ));
}

#[test]
fn web_deploy_skips_when_no_matching_files() {
    let _guard = env_lock().lock().expect("lock");
    let result = std::panic::catch_unwind(|| {
        std::env::set_var("HARNESS_WEB_CHANGED_FILES", "harness/src/main.rs");
        std::env::set_var("HARNESS_WEB_DEPLOY_INSTALL_CMD", "false");
        std::env::set_var("HARNESS_WEB_DEPLOY_CMD", "false");
        run().expect("web deploy should skip");
        std::env::remove_var("HARNESS_WEB_CHANGED_FILES");
        std::env::remove_var("HARNESS_WEB_DEPLOY_INSTALL_CMD");
        std::env::remove_var("HARNESS_WEB_DEPLOY_CMD");
    });
    assert!(result.is_ok());
}

#[test]
fn web_deploy_uses_overrides_when_matching_files_exist() {
    let _guard = env_lock().lock().expect("lock");
    let result = std::panic::catch_unwind(|| {
        std::env::set_var("HARNESS_WEB_CHANGED_FILES", "apps/web/src/main.tsx");
        std::env::set_var("HARNESS_WEB_DEPLOY_INSTALL_CMD", "true");
        std::env::set_var(
            "HARNESS_WEB_DEPLOY_CMD",
            "printf 'https://example.pages.dev\\n'",
        );
        std::env::set_var("HARNESS_WEB_DEPLOY_VERIFY_CMD", "true");
        run().expect("web deploy override should succeed");
        std::env::remove_var("HARNESS_WEB_CHANGED_FILES");
        std::env::remove_var("HARNESS_WEB_DEPLOY_INSTALL_CMD");
        std::env::remove_var("HARNESS_WEB_DEPLOY_CMD");
        std::env::remove_var("HARNESS_WEB_DEPLOY_VERIFY_CMD");
    });
    assert!(result.is_ok());
}

#[test]
fn extract_deployment_url_prefers_pages_domain() {
    let output = "Logs https://example.com\nSuccess https://abc123.spechub-web.pages.dev";
    assert_eq!(
        verify::extract_deployment_url(output),
        Some("https://abc123.spechub-web.pages.dev".to_string())
    );
}

#[test]
fn extract_deployment_url_trims_trailing_punctuation() {
    let output = "Success: (https://spechub-web.pages.dev).";
    assert_eq!(
        verify::extract_deployment_url(output),
        Some("https://spechub-web.pages.dev".to_string())
    );
}
