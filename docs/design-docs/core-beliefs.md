# Core Beliefs

## Product Beliefs

- Repository-native specs are the product. Markdown in Git is the distribution format, not a side effect.
- A portable harness is more valuable than a one-off local setup because it lets future repositories inherit the same operating model.
- Local preview surfaces should stay simple and inspectable so agents can validate behavior directly.
- The repo should prefer boring, well-documented tooling over opaque magic.

## Agent-First Operating Principles

1. **Repository knowledge is the system of record.**
   Anything that matters must live in versioned repository artifacts.

2. **What the agent cannot see does not exist.**
   Product intent, architecture, and conventions must be discoverable in-repo.

3. **Enforce boundaries centrally, allow autonomy locally.**
   Guardrails belong in lint rules, tests, and CI. Solutions inside those guardrails can stay flexible.

4. **Corrections are cheap, waiting is expensive.**
   Prefer short feedback loops and tractable fixes over large, slow-moving change sets.

5. **Prefer boring technology.**
   Stable tools with strong documentation are easier for agents to reason about and recover.

6. **Encode taste once, enforce continuously.**
   Quality rules should be machine-readable and applied on every run.

7. **Treat documentation as executable infrastructure.**
   Docs must be linked, linted, freshness-checked, and updated alongside code.
