# Add Harness-Enforced Web Deploy Verification

## Goal / scope

Add a harness-driven workflow that automatically deploys `apps/web` changes to Cloudflare Pages and deterministically verifies the resulting deployment target. The flow must fail on deploy or verification errors, avoid running for unrelated changes, and include automated test coverage for decision logic and workflow behavior.

## Background

The website at `apps/web` already has checked-in Wrangler commands, but deployment currently relies on manual usage. This misses the harness requirement that key delivery workflows are executable and verifiable by automation instead of tribal knowledge. The new flow must live in the existing harness/Ralph Loop architecture and include machine-checkable post-deploy validation beyond process exit status.

## Milestones

- [x] Milestone 1: Audit existing harness and CI decision points to identify where web-change detection should live, then codify the deploy trigger contract (paths and rationale).
- [x] Milestone 2: Implement harness/project workflow logic that runs deploy commands only when web/deploy-surface changes are detected.
- [x] Milestone 3: Implement deterministic post-deploy verification (for example: extract deployment URL/metadata and assert revision-target consistency plus reachability) and wire hard failure behavior.
- [x] Milestone 4: Add/extend automated tests to cover change detection, deploy/verify orchestration, and failure modes with repository-required coverage levels.
- [x] Milestone 5: Add minimal canonical documentation updates describing trigger conditions and verification contract; run relevant repository checks and record outcomes.

## Current progress

- Reviewed canonical guardrails and architecture sources:
  - `AGENTS.md`
  - `ARCHITECTURE.md`
  - `NON_NEGOTIABLE_RULES.md`
  - `docs/PLANS.md`
  - `docs/design-docs/harness-blueprint.md`
  - `docs/design-docs/worktree-runtime.md`
  - `docs/product-specs/create-harness.md`
  - `create-harness/SPEC.md`
- Ran `scripts/harness/init.sh --base-branch main --work-branch ralph/add-harness-enforced-web-deploy-verification-goa`.
- Init failed because git could not create `.git/index.lock` (`Operation not permitted`) during checkout/worktree setup in this sandboxed environment.
- Per task instructions, continued in the current repository tree/branch rather than attempting unrelated git workarounds.
- Created this active execution plan as the source of truth for implementation.
- Audited current decision points across `.github/workflows/harness.yml`, `Makefile.harness`, and checked-in web deploy npm scripts (`package.json` + `apps/web/package.json`).
- Codified the trigger contract in:
  - `docs/design-docs/web-deploy-trigger-contract.md` (canonical rationale + integration location)
  - `harness/config/web-deploy-trigger-paths.txt` (machine-readable trigger glob set)
- Updated `docs/design-docs/index.md` to include the new canonical design document.
- Added `harnesscli web-deploy` command in `harness/src/cmd/web_deploy.rs` and wired it through the CLI command surface.
- Implemented deploy-surface gating by loading `harness/config/web-deploy-trigger-paths.txt`, computing changed files, and skipping deploy when no trigger path matches.
- Wired CI to run the harness deploy gate via `.github/workflows/harness.yml` after `make ci`:
  - sets base/head SHAs for deterministic change detection
  - runs `harness/target/release/harnesscli web-deploy`
  - runs checked-in deploy command (`npm run web:cf:build-and-deploy`) only when gated changes are detected
- Implemented deterministic post-deploy verification in `harnesscli web-deploy`:
  - captures deploy output and extracts the deployed HTTPS URL (preferring `*.pages.dev`)
  - fails when no deployment URL is emitted
  - verifies reachability with bounded retry (`curl` HTTP status check) and fails on non-2xx/3xx responses
  - keeps a test override path (`HARNESS_WEB_DEPLOY_VERIFY_CMD`) for deterministic automated testing
- Split `web_deploy` command internals into focused modules to stay inside harness source-file budget lint constraints:
  - `harness/src/cmd/web_deploy_changes.rs`
  - `harness/src/cmd/web_deploy_verify.rs`
  - `harness/src/cmd/web_deploy_test.rs`
- Expanded automated tests in `harness/src/cmd/web_deploy_test.rs` for deploy/verify failure modes and orchestration behavior:
  - deploy command failure propagates hard failure
  - missing deployment URL in deploy output fails deterministically
  - verify command failure propagates hard failure
  - deployment URL extraction from stderr output is accepted
  - existing positive-path and skip-path coverage retained
- Added deterministic env-scoping helper in tests to prevent cross-test env leakage while exercising command overrides.
- Verified with:
  - `cargo test --manifest-path harness/Cargo.toml` (31 passing tests)
- Finalized canonical documentation for the trigger + verification contract in `docs/design-docs/web-deploy-trigger-contract.md`:
  - CI/harness integration entrypoint
  - trigger detection inputs and machine-readable source
  - deploy execution contract
  - deterministic verification requirements and failure behavior
- Recorded final verification commands and outcomes (2026-03-09):
  - `cargo test --manifest-path harness/Cargo.toml` ✅
  - `HARNESS_WEB_CHANGED_FILES='apps/web/src/main.tsx' HARNESS_WEB_DEPLOY_INSTALL_CMD='true' HARNESS_WEB_DEPLOY_CMD=\"printf 'https://example.pages.dev\\n'\" HARNESS_WEB_DEPLOY_VERIFY_CMD='true' cargo run --quiet --manifest-path harness/Cargo.toml -- web-deploy` ✅
  - `make lint` ⚠️ fails on pre-existing unrelated line-budget warnings in `scripts/ralph-loop/lib/codex-client.mts` and `scripts/ralph-loop/lib/driver.mts`

## Key decisions

- Keep deploy/verification orchestration inside existing harness/project workflow surfaces instead of ad hoc standalone scripts.
- Treat deploy verification as a contract with explicit machine-checkable assertions; command success alone is insufficient.
- Keep web deploy gating path-based and explicit so non-web changes skip this path by design.
- Use the existing CI chain (`harness.yml` -> `make ci`) as the canonical integration point for deploy gating and verification.
- Centralize trigger path definitions in `harness/config/web-deploy-trigger-paths.txt` so implementation and docs consume one contract.
- Keep deploy execution behind a dedicated harness CLI command (`harnesscli web-deploy`) so workflow logic remains thin and testable.
- Treat deployment verification as an explicit contract: deploy output must yield a URL, and that URL must return an HTTP success/redirect status within bounded retries.

## Remaining issues / open questions

- None.

## Links to related documents

- [Architecture](../../../ARCHITECTURE.md)
- [Non-Negotiable Rules](../../../NON_NEGOTIABLE_RULES.md)
- [Execution Plans](../../../docs/PLANS.md)
- [Harness Blueprint](../../../docs/design-docs/harness-blueprint.md)
- [Web Deploy Trigger Contract](../../../docs/design-docs/web-deploy-trigger-contract.md)
- [Worktree Runtime](../../../docs/design-docs/worktree-runtime.md)
- [Create Harness Product Spec](../../../docs/product-specs/create-harness.md)
- [Create Harness Source Spec](../../../create-harness/SPEC.md)
