# Architecture

This repository is both the source blueprint for a portable harness system and the first repository that consumes that blueprint.

## Repository Zones

### `create-harness/`

Source specification. These documents describe the portable harness phases and are the canonical input for the generated system.

### `docs/`

Applied repository knowledge. This is the system of record for design rationale, product specs, plans, quality policy, reliability policy, and references needed by agents working in this repository.

### `harness/`

Rust control plane. The `harnesscli` binary owns the executable harness surface:

- repo audit
- smoke, lint, typecheck, and test orchestration
- worktree-aware runtime metadata
- lightweight local observability endpoints
- recurring cleanup scans and grading

### `scripts/harness/`

Thin shell entrypoints only when the spec requires a stable script path. All durable logic lives in `harnesscli`.

### `scripts/ralph-loop/`

Bun-based automation layer that speaks to Codex app-server and composes the setup, coding, and PR agents.

### `.worktree/`

Ephemeral runtime state derived from a deterministic worktree ID. This includes:

- logs
- temporary files
- metadata
- PID files
- generated observability configuration

## Dependency Direction

The repository enforces a small set of explicit boundaries:

1. `AGENTS.md` only points to canonical docs and never becomes the knowledge base.
2. `create-harness/` is specification source and must not depend on generated runtime state.
3. `harness/src/cmd/*` may depend on `harness/src/util/*` and `harness/src/lint/*`, but command implementations must not import other command implementations directly.
4. `harness/src/util/*` is foundational and may not depend on `harness/src/cmd/*`.
5. `scripts/ralph-loop/ralph-loop.mts` may depend on `scripts/ralph-loop/lib/*`; library files may not import the CLI entrypoint.
6. Runtime state under `.worktree/` is derived output, never source of truth.

The machine-readable version of these rules lives in [`architecture-rules.json`](architecture-rules.json).

## Major Entrypoints

- `make ci`
- `cargo build --manifest-path harness/Cargo.toml`
- `scripts/harness/init.sh`
- `harness/target/release/harnesscli boot`
- `harness/target/release/harnesscli observability start`
- `bun run ralph-loop -- --prd`

## Verification Surface

The harness is considered healthy when all of the following succeed:

- `make smoke`
- `make lint`
- `make typecheck`
- `make test`
- `make ci`
- `harness/target/release/harnesscli audit .`
