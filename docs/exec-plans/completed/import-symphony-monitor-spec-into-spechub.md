# Import Symphony Monitor Spec Into SpecHub

## Goal / scope

Import `siisee11/symphony-monitor.spec` under `specs/symphony-monitor/` so it is discoverable by
SpecHub catalog scans and installable through the existing spec install flow.

## Background

- Requested outcome: "Add https://github.com/siisee11/symphony-monitor.spec to this repository."
- Existing repository convention for third-party spec imports is a vendored snapshot under
  `specs/<slug>/` with `metadata.json` and `UPSTREAM.md` provenance metadata.
- The upstream repository currently contains a single tracked file: `SPEC.md`.

## Milestones

- [x] Review repository guardrails and existing imported-spec conventions.
- [x] Fetch upstream repository metadata and inspect tracked files at the requested source.
- [x] Add `specs/symphony-monitor/` with the upstream spec plus repository-local provenance
  metadata.
- [x] Add focused validation for the imported file set and upstream metadata markers.
- [x] Run touched-scope validation and record the completed import.

## Current progress

- Reviewed `AGENTS.md`, `NON_NEGOTIABLE_RULES.md`, `ARCHITECTURE.md`, and `docs/PLANS.md`.
- Resolved upstream `HEAD` for `https://github.com/siisee11/symphony-monitor.spec` to commit
  `e5b0a64df2b7c85cf8dc07286ac3bf2ae9917f9b` on 2026-03-15.
- Verified the upstream tracked file set is currently `SPEC.md` only.
- Added `specs/symphony-monitor/SPEC.md` as an unmodified vendored copy of the upstream spec.
- Added `specs/symphony-monitor/metadata.json` and `specs/symphony-monitor/UPSTREAM.md` for
  discovery metadata and provenance.
- Added `scripts/symphony-monitor-spec-import.test.mts` to validate the imported file set and
  provenance markers.
- Ran touched-scope validation successfully:
  - `bun test scripts/symphony-monitor-spec-import.test.mts`
  - `bun test scripts/install-spec.test.mts`
  - `npm --prefix apps/web exec vitest run src/lib/spec-discovery.test.ts --coverage=false`
- Verified `specs/symphony-monitor/SPEC.md` is byte-for-byte identical to the upstream `SPEC.md`.

## Key decisions

- Use slug `symphony-monitor`, matching the repository name minus the `.spec` suffix.
- Treat the import as a vendored snapshot because the upstream repository name ends with `.spec`,
  matching the repository's existing sync/import rules.
- Preserve the upstream `SPEC.md` verbatim and record provenance separately in `UPSTREAM.md`.

## Remaining issues / open questions

- None.

## Final summary

- Imported `siisee11/symphony-monitor.spec` into `specs/symphony-monitor/`.
- Recorded upstream source, resolved commit, and file integrity hash in
  `specs/symphony-monitor/UPSTREAM.md`.
- Added focused import validation in `scripts/symphony-monitor-spec-import.test.mts`.
- Exact files added for this task:
  - `specs/symphony-monitor/SPEC.md`
  - `specs/symphony-monitor/metadata.json`
  - `specs/symphony-monitor/UPSTREAM.md`
  - `scripts/symphony-monitor-spec-import.test.mts`
  - `docs/exec-plans/completed/import-symphony-monitor-spec-into-spechub.md`

## Links to related documents

- `AGENTS.md`
- `ARCHITECTURE.md`
- `NON_NEGOTIABLE_RULES.md`
- `docs/PLANS.md`
- `https://github.com/siisee11/symphony-monitor.spec`
