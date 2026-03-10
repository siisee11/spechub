# JAN-11 - Copy harness.spec into spechub

## Goal / scope

Copy the upstream `https://github.com/siisee11/harness.spec` repository into this repository under `specs/` in a way that is reproducible, reviewable, and consistent with repository guardrails.

## Background

- Linear issue: `JAN-11`
- Priority: `0` (urgent)
- Requested outcome: "Copy this repo under `specs/`."
- Setup note: `scripts/harness/init.sh --base-branch main --work-branch symphony/jan-11` was attempted and failed at git checkout due to a worktree metadata lock permission error. Per loop instructions, execution continues in the current tree/branch (`symphony/jan-11`) without further git setup workarounds.

## Milestones

- [x] Inspect `specs/` and define import shape (vendored snapshot vs git subtree/submodule style metadata-free copy).
- [x] Copy `harness.spec` contents into `specs/` while preserving required files and excluding irrelevant git metadata.
- [x] Add or update tests/checks that validate expected imported structure/content.
- [x] Run repository validation commands for touched scope and fix any failures.
- [ ] Prepare issue handoff notes and move plan state forward.

## Current progress

- Guardrails reviewed: `AGENTS.md`, `ARCHITECTURE.md`, `NON_NEGOTIABLE_RULES.md`.
- Plan created and checked in under `docs/exec-plans/active/`.
- Milestone 1 complete: inspected existing `specs/` conventions (`specs/create-harness`, `specs/symphony`) and upstream `siisee11/harness.spec` repository layout.
- Milestone 2 complete: imported upstream tracked files into `specs/harness-spec/` and added `specs/harness-spec/UPSTREAM.md` provenance metadata for commit `7779e5f7f2ecffc78174d8381a488e3f08a0ce12`.
- Milestone 3 complete: added `scripts/harness-spec-import.test.mts` to validate vendored file set, `.git` metadata exclusion, and `UPSTREAM.md` provenance fields for `specs/harness-spec/`.
- Milestone 4 complete: ran touched-scope validation commands and confirmed pass:
  - `bun test scripts/harness-spec-import.test.mts`
  - `bun test scripts/install-spec.test.mts`
  - `npm_config_cache=/tmp/jan11-npm-cache npm --prefix apps/web ci`
  - `npm_config_cache=/tmp/jan11-npm-cache npm --prefix apps/web exec -- vitest run src/lib/spec-discovery.test.ts --coverage=false`

## Key decisions

- Keep `AGENTS.md` as a map; put operational details in canonical docs/plans only.
- Treat `.worktree/` runtime output as non-canonical and out of scope for this issue.
- Continue work on current branch when harness init cannot complete branch/worktree setup in this environment.
- Import method will be a vendored snapshot (plain checked-in files) under `specs/harness-spec/`, explicitly excluding upstream `.git` metadata.
- Add `specs/harness-spec/UPSTREAM.md` during import to record repository URL, fetched reference, resolved commit, and file integrity hashes for reproducibility.
- Imported file set mirrors upstream tracked files at commit `7779e5f7f2ecffc78174d8381a488e3f08a0ce12` (plus local `UPSTREAM.md` metadata).
- Import validation strategy is a repository-level Bun test that enforces expected snapshot structure and provenance markers.
- For this environment, npm-based validation uses a temp cache path under `/tmp` to avoid local cache permission issues (`/Users/dev/.npm` ownership mismatch).

## Remaining issues / open questions

- None for current scope; remaining work is final issue handoff and plan state transition.

## Links to related documents

- `AGENTS.md`
- `ARCHITECTURE.md`
- `NON_NEGOTIABLE_RULES.md`
- `docs/PLANS.md`
- `create-harness/SPEC.md`
