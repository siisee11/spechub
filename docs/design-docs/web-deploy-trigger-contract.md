# Web Deploy Trigger Contract

## Purpose

Define the canonical change-detection contract for harness-enforced web deploy verification.

This document covers milestone 1 only: where detection should live and which paths are considered deploy-triggering changes.

## Audited decision points

Current project execution path:

1. `.github/workflows/harness.yml` runs `make ci` on `push` and `pull_request`.
2. `make ci` in `Makefile.harness` orchestrates `harnesscli` checks.
3. Cloudflare deploy commands are already checked in as npm scripts (`package.json` delegating to `apps/web/package.json`).

Conclusion: web-change detection should be enforced inside the harness/CI workflow path (the same `harness.yml` -> `make ci` chain), not as a standalone ad hoc script outside repository control surfaces.

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

Implementation milestones must consume that file for decision logic so trigger rules stay centralized.
