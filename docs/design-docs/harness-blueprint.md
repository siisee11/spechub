# Harness Blueprint

This repository applies `create-harness/SPEC.md` to itself.

## Scope

- Scaffold a structured documentation system.
- Provide a Rust `harnesscli` binary as the executable control plane.
- Expose a worktree-aware boot contract and local observability stubs that are deterministic and testable.
- Add recurring cleanup scans, grading, and CI.
- Add Bun-based Ralph Loop scripts for Codex app-server automation.

## Tradeoffs

- The required `scripts/harness/init.sh` path is kept as a thin wrapper because Phase 2 requires that interface. Durable logic stays in `harnesscli`.
- Observability is implemented as a lightweight local stack that exposes the expected query surfaces and contract without requiring external infrastructure in this repo.
- The repository is documentation-heavy, so lint and cleanup focus on structure, boundary discipline, and script hygiene more than application runtime behavior.

## Canonical Commands

- `make ci`
- `scripts/harness/init.sh`
- `harnesscli boot`
- `harnesscli observability start`
- `bun run ralph-loop -- --prd`
