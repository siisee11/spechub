# SpecHub is the open community (marketplace) that people can share their idea as a spec file

## Goal / scope

Build a SpecHub marketplace website backed by this repository where every spec lives under `specs/<slug>/`, with an install/download command users can copy for each spec.

## Background

The current preview app is a minimal harness status page and does not present specs as a marketplace catalog. The PRD requires a `skills.sh`-style browsing surface and per-spec download commands.

## Milestones

- [x] Milestone 1: Establish `specs/` as the catalog source and ship a first-pass marketplace UI in `harnesscli serve app` that lists spec folders.
- [ ] Milestone 2: Add a repository-aware install command generator and copy-to-clipboard download button per spec.
- [ ] Milestone 3: Polish layout/content parity toward `skills.sh` style and finalize plan handoff.

## Current progress

- Created `specs/create-harness/SPEC.md` as the initial catalog entry.
- Replaced the simple app preview page with a card-based marketplace UI that reads `specs/*`.
- Added `/api/specs` response for structured spec listing from the same `specs/` source.

## Key decisions

- Keep serving via the existing Rust preview server (`harness/src/cmd/serve.rs`) to avoid introducing a second web stack.
- Treat each direct subdirectory in `specs/` as one publishable spec.

## Remaining issues / open questions

- Need command generation that works for public GitHub remotes and degrades cleanly for local-only remotes.
- Need final visual tweaks and copy quality to better match `skills.sh`.

## Links to related documents

- [PRD](../../../PRD.md)
- [Frontend](../../../docs/FRONTEND.md)
- [Architecture](../../../ARCHITECTURE.md)
