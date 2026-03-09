# PRD: Move SpecHub Website To apps/web With Vite, React, And Wrangler

## Goal / scope

Move the SpecHub product website out of `harnesscli` into a standalone frontend app at `apps/web` built with Vite + React, with Cloudflare deployment driven by checked-in Wrangler configuration and scripts. Ensure the site lists repository-backed specs from `specs/`, presents per-spec detail, and provides a copyable install/download command.

## Background

A first-pass marketplace UI currently lives in the Rust `harnesscli` preview surface, which conflicts with the architecture direction that keeps product website concerns isolated from harness runtime/control-plane code. The PRD requires a dedicated frontend app under `apps/web`, reproducible local/CI builds, and a documented Wrangler deployment flow without dashboard-only steps.

## Milestones

- [x] Milestone 1: Scaffold `apps/web` as a standalone Vite + React app and wire deterministic local build/dev scripts from repository root tooling.
- [x] Milestone 2: Implement repository-backed spec discovery and parsing logic (from `specs/`) with full automated test coverage for parsing, data loading, and command generation.
- [ ] Milestone 3: Build website UX (homepage + spec listing + per-spec presentation + copyable install command) with clear SpecHub positioning copy.
- [ ] Milestone 4: Remove product-website ownership from `harnesscli` and preserve harness responsibilities only.
- [ ] Milestone 5: Add Wrangler config/deploy commands and document Cloudflare auth/env/setup, local run, build, and deploy workflow.
- [ ] Milestone 6: Run repository checks relevant to touched surfaces and close with updated plan state.

## Current progress

- Reviewed canonical repository guardrails and architecture docs (`AGENTS.md`, `NON_NEGOTIABLE_RULES.md`, `ARCHITECTURE.md`, and related docs under `docs/`).
- Attempted `scripts/harness/init.sh --base-branch main --work-branch ralph/prd-move-spechub-website-to-apps-web-with-vite-r`.
- Handled `git stash push` failure with a PATH-scoped no-op shim as required.
- Init then failed during checkout/worktree transition; per instructions, continued in the current repository tree/branch instead of further git workarounds.
- Created this active execution plan as the source of truth for implementation.
- Added standalone `apps/web` Vite + React + TypeScript scaffold (independent from `harnesscli`) with baseline homepage placeholder.
- Added root-level frontend scripts (`web:install`, `web:dev`, `web:build`, `web:preview`, `web:typecheck`, `web:test`) for deterministic local execution from repository tooling.
- Added frontend test harness with 100% coverage thresholds and passing tests for bootstrap and initial UI copy.
- Verified Milestone 1 with `npm run web:typecheck`, `npm run web:test`, and `npm run web:build`.
- Added reusable frontend catalog logic in `apps/web/src/lib/spec-catalog.ts` for markdown parsing, GitHub remote parsing, slug extraction, and install-command generation.
- Added repository-backed discovery logic in `apps/web/src/lib/spec-discovery.ts` to load `specs/*/SPEC.md` entries and materialize sorted catalog entries.
- Added full automated test coverage for parser, data loading, and command generation in `apps/web/src/lib/spec-catalog.test.ts` and `apps/web/src/lib/spec-discovery.test.ts`.
- Verified Milestone 2 with `npm run web:typecheck`, `npm run web:test` (100% statements/branches/functions/lines), and `npm run web:build`.

## Key decisions

- Keep plan-of-record in `docs/exec-plans/active/` until implementation lands, then move to `completed/`.
- Treat `specs/` as the single source for website catalog data; avoid hardcoded demo records.
- Keep Cloudflare deployment minimal by using Wrangler-first commands committed in-repo.

## Remaining issues / open questions

- Confirm the final Cloudflare target pattern (static assets via Workers Assets vs Pages-style flow through Wrangler) based on current repository deployment conventions.
- Decide whether per-spec detail should be route-based pages or an in-page detail panel, balancing simplicity and maintainability.

## Links to related documents

- [PRD](../../../PRD.md)
- [Architecture](../../../ARCHITECTURE.md)
- [Non-Negotiable Rules](../../../NON_NEGOTIABLE_RULES.md)
- [Execution Plans](../../../docs/PLANS.md)
- [Frontend](../../../docs/FRONTEND.md)
- [Create Harness Spec](../../../create-harness/SPEC.md)
