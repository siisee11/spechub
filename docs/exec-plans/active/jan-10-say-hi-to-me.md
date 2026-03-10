# JAN-10: Say hi to me

## Goal / scope

Implement issue `JAN-10` by adding a minimal, user-facing "hi" behavior for Jay in the appropriate product/runtime surface, with required automated test updates and clean Ralph-loop handoff.

## Background

Issue details:

- Title: `JAN-10 - Say hi to me`
- State: `Todo`
- Priority: `0`
- Description: `I'm Jay`

Repository constraints require following canonical docs (`AGENTS.md`, `ARCHITECTURE.md`, `NON_NEGOTIABLE_RULES.md`) and maintaining full test coverage for any code changes.

## Milestones

- [ ] Milestone 1: Identify the correct surface for JAN-10's greeting behavior and define the acceptance contract.
- [ ] Milestone 2: Implement the greeting behavior with focused code changes only in the selected surface.
- [ ] Milestone 3: Add/update automated tests for all touched code paths and verify checks for the changed scope.
- [ ] Milestone 4: Mark issue work complete and hand off through the normal Ralph loop flow.

## Current progress

- Confirmed workspace is `/Users/dev/git/spechub/.worktree/symphony-workspaces/JAN-10`.
- Ran `scripts/harness/init.sh --base-branch main --work-branch symphony/jan-10`.
- Init failed during checkout/worktree lock creation with:
  - `fatal: Unable to create '/Users/dev/git/spechub/.git/worktrees/JAN-10/index.lock': Operation not permitted`
- Per instructions, continued in the current repository tree and current branch instead of additional git workarounds.
- Confirmed current branch is `symphony/jan-10`.
- Reviewed required guardrail and architecture docs:
  - `AGENTS.md`
  - `ARCHITECTURE.md`
  - `NON_NEGOTIABLE_RULES.md`
  - `docs/PLANS.md`
- Created this execution plan in `docs/exec-plans/active/` as source of truth for JAN-10 implementation.

## Key decisions

- Use current checked-out worktree/branch context because harness init checkout could not complete in this environment.
- Keep implementation minimal and issue-scoped, with tests updated in the same iteration as code changes.
- Track progress in this active plan until implementation lands, then move to `docs/exec-plans/completed/`.

## Remaining issues / open questions

- Which exact user-facing surface should host the greeting behavior for this issue (CLI output, web UI, or another existing entrypoint)?

## Links to related documents

- [Agent Entry Point](../../../AGENTS.md)
- [Architecture](../../../ARCHITECTURE.md)
- [Non-Negotiable Rules](../../../NON_NEGOTIABLE_RULES.md)
- [Execution Plans](../../../docs/PLANS.md)
