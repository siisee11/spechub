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

- [x] Milestone 1: Identify the correct surface for JAN-10's greeting behavior and define the acceptance contract.
- [x] Milestone 2: Implement the greeting behavior with focused code changes only in the selected surface.
- [x] Milestone 3: Add/update automated tests for all touched code paths and verify checks for the changed scope.
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
- Mapped current user-facing surfaces and constraints:
  - `harnesscli` (`harness/src/main.rs`) is the harness control plane, not the product UI surface.
  - `apps/web` is the product-facing website surface for end-user-visible copy and interactions.
- Completed Milestone 1 by selecting `apps/web` as the greeting surface and locking the acceptance contract for implementation.
- Completed Milestone 2 with a minimal product-surface change:
  - Added visible greeting copy `Hi Jay.` in `apps/web/src/App.tsx` hero content.
  - Preserved existing spec catalog and copy-to-clipboard interactions unchanged.
  - Updated `apps/web/src/App.test.tsx` to assert the greeting text.
  - Ran `npm test` in `apps/web`; suite passed with 100% coverage.
- Completed Milestone 3 verification for changed scope:
  - Confirmed `apps/web/src/App.test.tsx` covers the greeting behavior and existing interactions.
  - Ran `npm run typecheck` in `apps/web` successfully.
  - Re-ran `npm test` in `apps/web`; all tests passed with 100% statement/branch/function/line coverage.
- Created this execution plan in `docs/exec-plans/active/` as source of truth for JAN-10 implementation.

## Key decisions

- Use current checked-out worktree/branch context because harness init checkout could not complete in this environment.
- Keep implementation minimal and issue-scoped, with tests updated in the same iteration as code changes.
- Implement the greeting in `apps/web/src/App.tsx` to align with architecture boundaries that keep product-facing behavior out of `harnesscli`.
- Acceptance contract for the next implementation milestone:
  - Add visible greeting copy that says hi to Jay in the web app hero area.
  - Preserve existing app behavior and copy interactions for spec cards/detail actions.
  - Cover the new greeting behavior with automated tests in `apps/web/src/App.test.tsx`.
- Track progress in this active plan until implementation lands, then move to `docs/exec-plans/completed/`.

## Remaining issues / open questions

- None for Milestone 1.

## Links to related documents

- [Agent Entry Point](../../../AGENTS.md)
- [Architecture](../../../ARCHITECTURE.md)
- [Non-Negotiable Rules](../../../NON_NEGOTIABLE_RULES.md)
- [Execution Plans](../../../docs/PLANS.md)
