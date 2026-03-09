# SpecHub is the open community (marketplace) that people can share their idea as a spec file

## Goal / scope

Build a SpecHub marketplace website backed by this repository where every spec lives under `specs/<slug>/`, with an install/download command users can copy for each spec.

## Background

The current preview app is a minimal harness status page and does not present specs as a marketplace catalog. The PRD requires a `skills.sh`-style browsing surface and per-spec download commands.

## Milestones

- [x] Milestone 1: Establish `specs/` as the catalog source and ship a first-pass marketplace UI in `harnesscli serve app` that lists spec folders.
- [x] Milestone 2: Add a repository-aware install command generator and copy-to-clipboard download button per spec.
- [x] Milestone 3: Polish layout/content parity toward `skills.sh` style and finalize plan handoff.

## Current progress

- Created `specs/create-harness/SPEC.md` as the initial catalog entry.
- Replaced the simple app preview page with a card-based marketplace UI that reads `specs/*`.
- Added `/api/specs` response for structured spec listing from the same `specs/` source.
- Added per-spec install command generation that binds to GitHub `origin` when available and falls back to placeholders when not.
- Added copy-to-clipboard install button per spec card and committed `scripts/install-spec.sh` to install `specs/<slug>` into the current directory.
- Polished the marketplace surface with a stronger hero, search/filter interaction, and refined card styling closer to `skills.sh`.
- Refactored app rendering into `harness/src/util/marketplace.rs` with dedicated asset files for maintainability and lint compliance.

## Key decisions

- Keep serving via the existing Rust preview server (`harness/src/cmd/serve.rs`) to avoid introducing a second web stack.
- Treat each direct subdirectory in `specs/` as one publishable spec.

## Remaining issues / open questions

- None.

## Links to related documents

- [PRD](../../../PRD.md)
- [Frontend](../../../docs/FRONTEND.md)
- [Architecture](../../../ARCHITECTURE.md)
