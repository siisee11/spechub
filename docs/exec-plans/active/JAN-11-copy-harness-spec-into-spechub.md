# JAN-11 - Copy harness.spec into spechub

## Goal / scope

Copy the upstream `https://github.com/siisee11/harness.spec` repository into this repository under `specs/` in a way that is reproducible, reviewable, and consistent with repository guardrails.

## Background

- Linear issue: `JAN-11`
- Priority: `0` (urgent)
- Requested outcome: "Copy this repo under `specs/`."
- Setup note: `scripts/harness/init.sh --base-branch main --work-branch symphony/jan-11` was attempted and failed at git checkout due to a worktree metadata lock permission error. Per loop instructions, execution continues in the current tree/branch (`symphony/jan-11`) without further git setup workarounds.

## Milestones

- [ ] Inspect `specs/` and define import shape (vendored snapshot vs git subtree/submodule style metadata-free copy).
- [ ] Copy `harness.spec` contents into `specs/` while preserving required files and excluding irrelevant git metadata.
- [ ] Add or update tests/checks that validate expected imported structure/content.
- [ ] Run repository validation commands for touched scope and fix any failures.
- [ ] Prepare issue handoff notes and move plan state forward.

## Current progress

- Guardrails reviewed: `AGENTS.md`, `ARCHITECTURE.md`, `NON_NEGOTIABLE_RULES.md`.
- Plan created and checked in under `docs/exec-plans/active/`.

## Key decisions

- Keep `AGENTS.md` as a map; put operational details in canonical docs/plans only.
- Treat `.worktree/` runtime output as non-canonical and out of scope for this issue.
- Continue work on current branch when harness init cannot complete branch/worktree setup in this environment.

## Remaining issues / open questions

- Exact import method is not explicitly specified; decide between plain copied tree and history-preserving strategy based on repository norms.
- Identify the minimal automated tests/checks that satisfy "update tests for every code change" for this import-heavy task.

## Links to related documents

- `AGENTS.md`
- `ARCHITECTURE.md`
- `NON_NEGOTIABLE_RULES.md`
- `docs/PLANS.md`
- `create-harness/SPEC.md`
