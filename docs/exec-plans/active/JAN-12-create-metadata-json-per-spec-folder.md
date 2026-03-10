# JAN-12 - Create metadata.json per each spec folder

## Goal / scope

Implement per-spec metadata for vendored specs by adding `metadata.json` in each relevant `specs/<slug>/` folder, remove `specs/create-harness/`, and expose metadata fields on the SpecHub web UI.

## Background

- Linear issue: `JAN-12`
- Priority: `2` (high)
- Requested outcomes:
  - Add `metadata.json` per spec folder with:
    - `source`: origin repository URL
    - `synced_date`: UTC sync timestamp
  - Required sources:
    - `specs/symphony` -> `https://github.com/openai/symphony`
    - `specs/harness-spec` -> `https://github.com/siisee11/harness.spec`
  - Remove `create-harness` spec folder.
  - Show metadata information on the website.
- Setup note: `scripts/harness/init.sh --base-branch main --work-branch symphony/jan-12` failed due inability to create worktree git lock file (`/Users/dev/git/spechub/.git/worktrees/JAN-12/index.lock`). Per loop instructions, work continues in the current repository tree/branch (`symphony/jan-12`) without additional git setup workarounds.

## Milestones

- [x] Create `metadata.json` in each remaining spec folder with correct `source` and current UTC `synced_date`.
- [x] Remove `specs/create-harness/` and update any tests/fixtures that currently expect it.
- [ ] Extend spec discovery/catalog logic to load and carry metadata fields.
- [ ] Render `source` and `synced_date` in the web UI detail/list views.
- [ ] Add/update automated tests for discovery parsing, catalog mapping, and UI rendering of metadata.
- [ ] Run targeted validation commands and fix failures.

## Current progress

- Guardrails reviewed: `AGENTS.md`, `ARCHITECTURE.md`, `NON_NEGOTIABLE_RULES.md`, and `docs/PLANS.md`.
- Execution plan created under `docs/exec-plans/active/`.
- Milestone 1 completed:
  - Added `specs/symphony/metadata.json` with:
    - `source`: `https://github.com/openai/symphony`
    - `synced_date`: `2026-03-10T12:34:10Z`
  - Added `specs/harness-spec/metadata.json` with:
    - `source`: `https://github.com/siisee11/harness.spec`
    - `synced_date`: `2026-03-10T12:34:10Z`
- Milestone 2 completed:
  - Removed `specs/create-harness/SPEC.md` and eliminated the now-empty `specs/create-harness/` directory.
  - Updated fixtures/tests that referenced `create-harness`:
    - `apps/web/src/lib/spec-discovery.test.ts`
    - `apps/web/src/lib/spec-catalog.test.ts`
    - `apps/web/src/App.test.tsx`

## Key decisions

- Keep metadata canonical in per-spec `metadata.json` files under `specs/<slug>/`.
- Use ISO-8601 UTC timestamps for `synced_date` (e.g., `2026-03-10T12:34:56Z`).
- Treat removal of `specs/create-harness/` as a breaking catalog fixture update and adjust tests accordingly.
- Limit code changes to `specs/` content and `apps/web` discovery/catalog/UI and tests for this issue.

## Remaining issues / open questions

- Confirm whether UI should show metadata in both card list and detail panel, or detail panel only.
- Confirm whether `synced_date` should be displayed raw UTC string or formatted for readability in UI.

## Links to related documents

- `AGENTS.md`
- `ARCHITECTURE.md`
- `NON_NEGOTIABLE_RULES.md`
- `docs/PLANS.md`
- `docs/exec-plans/completed/JAN-11-copy-harness-spec-into-spechub.md`
