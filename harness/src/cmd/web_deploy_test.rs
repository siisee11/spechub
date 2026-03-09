use super::*;
use std::sync::{Mutex, OnceLock};

fn env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

struct ScopedEnv {
    keys: Vec<&'static str>,
}

impl ScopedEnv {
    fn new() -> Self {
        Self { keys: Vec::new() }
    }

    fn set(mut self, key: &'static str, value: &str) -> Self {
        std::env::set_var(key, value);
        self.keys.push(key);
        self
    }
}

impl Drop for ScopedEnv {
    fn drop(&mut self) {
        for key in &self.keys {
            std::env::remove_var(key);
        }
    }
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
    let _env = ScopedEnv::new()
        .set("HARNESS_WEB_CHANGED_FILES", "harness/src/main.rs")
        .set("HARNESS_WEB_DEPLOY_INSTALL_CMD", "false")
        .set("HARNESS_WEB_DEPLOY_CMD", "false");

    run().expect("web deploy should skip");
}

#[test]
fn web_deploy_uses_overrides_when_matching_files_exist() {
    let _guard = env_lock().lock().expect("lock");
    let _env = ScopedEnv::new()
        .set("HARNESS_WEB_CHANGED_FILES", "apps/web/src/main.tsx")
        .set("HARNESS_WEB_DEPLOY_INSTALL_CMD", "true")
        .set(
            "HARNESS_WEB_DEPLOY_CMD",
            "printf 'https://example.pages.dev\\n'",
        )
        .set("HARNESS_WEB_DEPLOY_VERIFY_CMD", "true");

    run().expect("web deploy override should succeed");
}

#[test]
fn web_deploy_fails_when_deploy_command_fails() {
    let _guard = env_lock().lock().expect("lock");
    let _env = ScopedEnv::new()
        .set("HARNESS_WEB_CHANGED_FILES", "apps/web/src/main.tsx")
        .set("HARNESS_WEB_DEPLOY_INSTALL_CMD", "true")
        .set("HARNESS_WEB_DEPLOY_CMD", "false");

    let error = run().expect_err("deploy command should fail");
    assert!(
        error.to_string().contains("web deploy override failed"),
        "unexpected error: {error}"
    );
}

#[test]
fn web_deploy_fails_when_deploy_output_has_no_url() {
    let _guard = env_lock().lock().expect("lock");
    let _env = ScopedEnv::new()
        .set("HARNESS_WEB_CHANGED_FILES", "apps/web/src/main.tsx")
        .set("HARNESS_WEB_DEPLOY_INSTALL_CMD", "true")
        .set("HARNESS_WEB_DEPLOY_CMD", "printf 'deploy complete\\n'")
        .set("HARNESS_WEB_DEPLOY_VERIFY_CMD", "true");

    let error = run().expect_err("deploy output without URL should fail");
    assert!(
        error
            .to_string()
            .contains("web deploy did not produce a deployment URL"),
        "unexpected error: {error}"
    );
}

#[test]
fn web_deploy_fails_when_verify_command_fails() {
    let _guard = env_lock().lock().expect("lock");
    let _env = ScopedEnv::new()
        .set("HARNESS_WEB_CHANGED_FILES", "apps/web/src/main.tsx")
        .set("HARNESS_WEB_DEPLOY_INSTALL_CMD", "true")
        .set(
            "HARNESS_WEB_DEPLOY_CMD",
            "printf 'https://example.pages.dev\\n'",
        )
        .set("HARNESS_WEB_DEPLOY_VERIFY_CMD", "false");

    let error = run().expect_err("verify command should fail");
    assert!(
        error
            .to_string()
            .contains("web deploy verify override failed"),
        "unexpected error: {error}"
    );
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

#[test]
fn deployment_url_can_be_extracted_from_stderr_output() {
    let url = verify::deployment_url_from_output("", "Log https://stderr.pages.dev")
        .expect("stderr URL should be accepted");
    assert_eq!(url, "https://stderr.pages.dev");
}
