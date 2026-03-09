# Non-Negotiable Rules

These rules are absolute. No exceptions, no workarounds, no "we'll fix it later." Every agent and every human must follow them on every change. Violations block merge unconditionally.

---

## Rule 1: 100% Test Coverage

Every line of code must be covered by tests. No exceptions.

- Every new function, method, module, and code path must have corresponding tests before it can be merged.
- If you change existing code, update or add tests to cover the change.
- Coverage is measured mechanically and enforced in CI. If coverage drops, the build fails.
- "It's too hard to test" is not an excuse — refactor the code until it is testable.
- Test coverage includes unit tests, integration tests, or both — whichever is appropriate for the code under test.
- Dead code that cannot be reached by tests must be deleted, not excluded from coverage.

### Why

Untested code is unverified code. In an agent-driven codebase, tests are the only reliable contract between what the code claims to do and what it actually does. Without full coverage, agents will build on top of broken assumptions, and bugs compound silently.

### Enforcement

- CI runs the harness pipeline on every PR.
- Every command added to `harnesscli` or `scripts/ralph-loop/` must have a corresponding automated test.
- `make ci` and `harnesscli audit .` must both pass before merge.
- Coverage and quality artifacts belong under `docs/generated/`.

## Rule 2: AGENTS.md Stays A Map

`AGENTS.md` must remain a navigation document. Canonical knowledge belongs in `docs/`, `ARCHITECTURE.md`, or `NON_NEGOTIABLE_RULES.md`.

### Enforcement

- If guidance grows beyond quick routing value, move it into a canonical document and leave only the pointer here.
- The harness lint suite fails if `AGENTS.md` exceeds the allowed size budget or loses its canonical links.

## Rule 3: Runtime State Must Be Worktree-Scoped

Ports, logs, PID files, temporary files, and generated configs must resolve beneath `.worktree/<worktree_id>/` unless there is a documented exception.

### Enforcement

- `harnesscli init`, `boot`, and `observability` derive a deterministic worktree ID.
- Tests cover worktree ID derivation and runtime-root generation.
- Runtime artifacts are ignored by Git and are never treated as source documents.
