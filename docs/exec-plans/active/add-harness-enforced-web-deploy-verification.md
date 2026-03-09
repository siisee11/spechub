# Add Harness-Enforced Web Deploy Verification

## Goal / scope

Add a harness-driven workflow that automatically deploys `apps/web` changes to Cloudflare Pages and deterministically verifies the resulting deployment target. The flow must fail on deploy or verification errors, avoid running for unrelated changes, and include automated test coverage for decision logic and workflow behavior.

## Background

The website at `apps/web` already has checked-in Wrangler commands, but deployment currently relies on manual usage. This misses the harness requirement that key delivery workflows are executable and verifiable by automation instead of tribal knowledge. The new flow must live in the existing harness/Ralph Loop architecture and include machine-checkable post-deploy validation beyond process exit status.

## Milestones

- [x] Milestone 1: Audit existing harness and CI decision points to identify where web-change detection should live, then codify the deploy trigger contract (paths and rationale).
- [ ] Milestone 2: Implement harness/project workflow logic that runs deploy commands only when web/deploy-surface changes are detected.
- [ ] Milestone 3: Implement deterministic post-deploy verification (for example: extract deployment URL/metadata and assert revision-target consistency plus reachability) and wire hard failure behavior.
- [ ] Milestone 4: Add/extend automated tests to cover change detection, deploy/verify orchestration, and failure modes with repository-required coverage levels.
- [ ] Milestone 5: Add minimal canonical documentation updates describing trigger conditions and verification contract; run relevant repository checks and record outcomes.

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

## Key decisions

- Keep deploy/verification orchestration inside existing harness/project workflow surfaces instead of ad hoc standalone scripts.
- Treat deploy verification as a contract with explicit machine-checkable assertions; command success alone is insufficient.
- Keep web deploy gating path-based and explicit so non-web changes skip this path by design.
- Use the existing CI chain (`harness.yml` -> `make ci`) as the canonical integration point for deploy gating and verification.
- Centralize trigger path definitions in `harness/config/web-deploy-trigger-paths.txt` so implementation and docs consume one contract.

## Remaining issues / open questions

- Confirm the most robust verification signal available from Wrangler output/API for asserting that the deployed target maps to the current revision/build.

## Links to related documents

- [Architecture](../../../ARCHITECTURE.md)
- [Non-Negotiable Rules](../../../NON_NEGOTIABLE_RULES.md)
- [Execution Plans](../../../docs/PLANS.md)
- [Harness Blueprint](../../../docs/design-docs/harness-blueprint.md)
- [Web Deploy Trigger Contract](../../../docs/design-docs/web-deploy-trigger-contract.md)
- [Worktree Runtime](../../../docs/design-docs/worktree-runtime.md)
- [Create Harness Product Spec](../../../docs/product-specs/create-harness.md)
- [Create Harness Source Spec](../../../create-harness/SPEC.md)
