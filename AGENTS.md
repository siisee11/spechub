# Agent Entry Point

This repository keeps `AGENTS.md` intentionally small. Use it as a map, then load the canonical document for the topic you are working on.

Reference structure kept exactly as requested:

```text
AGENTS.md
ARCHITECTURE.md
NON_NEGOTIABLE_RULES.md
docs/
├── design-docs/
│   ├── index.md
│   ├── core-beliefs.md
│   └── ...
├── exec-plans/
│   ├── active/
│   ├── completed/
│   └── tech-debt-tracker.md
├── generated/
│   └── db-schema.md
├── product-specs/
│   ├── index.md
│   ├── new-user-onboarding.md
│   └── ...
├── references/
│   ├── design-system-reference-llms.txt
│   ├── nixpacks-llms.txt
│   ├── uv-llms.txt
│   └── ...
├── DESIGN.md
├── FRONTEND.md
├── PLANS.md
├── PRODUCT_SENSE.md
├── QUALITY_SCORE.md
├── RELIABILITY.md
└── SECURITY.md
```

## Read First

- Canonical guardrails: [`NON_NEGOTIABLE_RULES.md`](NON_NEGOTIABLE_RULES.md)
- Repository topology and dependency direction: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Harness implementation spec source: [`specs/harness-spec/SPEC.md`](specs/harness-spec/SPEC.md)

## Canonical Maps

- Design index: [`docs/design-docs/index.md`](docs/design-docs/index.md)
- Product spec index: [`docs/product-specs/index.md`](docs/product-specs/index.md)
- Execution plan conventions: [`docs/PLANS.md`](docs/PLANS.md)
- Tech debt tracker: [`docs/exec-plans/tech-debt-tracker.md`](docs/exec-plans/tech-debt-tracker.md)

## Core Topic Documents

- Product and agent-first beliefs: [`docs/design-docs/core-beliefs.md`](docs/design-docs/core-beliefs.md)
- Harness architecture and command surface: [`docs/design-docs/harness-blueprint.md`](docs/design-docs/harness-blueprint.md)
- Worktree runtime and isolation policy: [`docs/design-docs/worktree-runtime.md`](docs/design-docs/worktree-runtime.md)
- Product direction for the applied blueprint: [`docs/product-specs/create-harness.md`](docs/product-specs/create-harness.md)

## Operational Documents

- Design operating notes: [`docs/DESIGN.md`](docs/DESIGN.md)
- Frontend expectations for preview surfaces: [`docs/FRONTEND.md`](docs/FRONTEND.md)
- Product-sense heuristics: [`docs/PRODUCT_SENSE.md`](docs/PRODUCT_SENSE.md)
- Quality grading policy: [`docs/QUALITY_SCORE.md`](docs/QUALITY_SCORE.md)
- Reliability expectations: [`docs/RELIABILITY.md`](docs/RELIABILITY.md)
- Security expectations: [`docs/SECURITY.md`](docs/SECURITY.md)

## Generated And Reference Material

- Reference docs for external tooling: [`docs/references/`](docs/references/)
- Generated quality artifacts: [`docs/generated/quality-grade.json`](docs/generated/quality-grade.json)
- Worktree runtime state lives under `.worktree/<worktree_id>/` and is never canonical product documentation.

## Update Rules

- Do not expand this file into a manual.
- Move substantive guidance into the appropriate document under `docs/` or a top-level canonical file.
- Keep links current whenever a new canonical document is introduced.
