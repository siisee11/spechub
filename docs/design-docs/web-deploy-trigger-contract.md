# Web Deploy Trigger Contract

## Purpose

Define the canonical change-detection contract for harness-enforced web deploy verification.

## Audited decision points

Current project execution path:

1. `.github/workflows/harness.yml` runs `make ci` on `push` and `pull_request`.
2. `make ci` in `Makefile.harness` orchestrates `harnesscli` checks.
3. Cloudflare deploy commands are already checked in as npm scripts (`package.json` delegating to `apps/web/package.json`).

Conclusion: web-change detection and deployment verification are enforced inside the harness/CI workflow path (`harness.yml` -> `make ci` -> `harnesscli web-deploy`), not as standalone ad hoc scripts.

## Trigger contract (v1)

The following globs define a web deploy-triggering change:

- `apps/web/**`
- `specs/**`
- `package.json`
- `Makefile.harness`
- `.github/workflows/harness.yml`

## Rationale

- `apps/web/**`: primary website source, build config, and Wrangler deploy configuration.
- `specs/**`: website build input, because `apps/web` materializes catalog content from `specs/*/SPEC.md` at build time.
- `package.json`: root-level wrappers for checked-in web deploy commands.
- `Makefile.harness`: CI command orchestration surface (`make ci`).
- `.github/workflows/harness.yml`: CI entrypoint wiring that decides whether deploy verification runs.

## Machine-readable source

Canonical path globs are duplicated in:

- `harness/config/web-deploy-trigger-paths.txt`

`harnesscli web-deploy` consumes this file so trigger rules stay centralized.

## Workflow contract

- CI entrypoint: `.github/workflows/harness.yml`.
- Harness command: `harness/target/release/harnesscli web-deploy`.
- Change detection inputs:
  - `HARNESS_WEB_DEPLOY_BASE_SHA` and `HARNESS_WEB_DEPLOY_HEAD_SHA` in CI.
  - fallback to `git diff HEAD~1..HEAD` when explicit SHAs are not set.
  - `HARNESS_WEB_CHANGED_FILES` override for deterministic tests.
- Deploy command path:
  - install: `npm --prefix apps/web ci`
  - deploy: `npm run web:cf:build-and-deploy`
  - both are overrideable for tests with `HARNESS_WEB_DEPLOY_INSTALL_CMD` and `HARNESS_WEB_DEPLOY_CMD`.

## Verification contract

`harnesscli web-deploy` must fail unless all of the following hold:

1. A deploy-surface path changed.
2. Deploy command succeeds.
3. Deploy output contains a deployment HTTPS URL (prefer `*.pages.dev` when present).
4. Deployment URL returns HTTP 2xx/3xx within bounded retries.

Verification behavior details:

- Default reachability check uses `curl` with follow redirects and timeout.
- Retries are bounded and deterministic (`6` attempts, `2s` delay).
- Verification can be override-driven in tests via `HARNESS_WEB_DEPLOY_VERIFY_CMD`.
