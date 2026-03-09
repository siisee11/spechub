# OpenAI Symphony Upstream Metadata

This directory vendors third-party specification content from `openai/symphony`.

## Upstream repository

- Repository: `https://github.com/openai/symphony`
- License in upstream repo: Apache License 2.0
- Source branch/reference fetched: `main`
- Resolved commit at fetch time (2026-03-09): `b0e0ff0082236a73c12a48483d0c6036fdd31fe1`

## Canonical source URLs

- SPEC: `https://github.com/openai/symphony/blob/main/SPEC.md`
- LICENSE: `https://github.com/openai/symphony/blob/main/LICENSE`
- NOTICE: `https://github.com/openai/symphony/blob/main/NOTICE`

## Raw fetch URLs used for import prep

- `https://raw.githubusercontent.com/openai/symphony/main/SPEC.md`
- `https://raw.githubusercontent.com/openai/symphony/main/LICENSE`
- `https://raw.githubusercontent.com/openai/symphony/main/NOTICE`

## Integrity hashes from fetched files

- `SPEC.md`: `15aeef8444c54f8f7b2a8ed270796e4604db3370923eafe6627337cd4afb6552`
- `LICENSE`: `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4`
- `NOTICE`: `38c76eb8701e52953f63154a77b407667a6ee34c3a2a8785c8f8b2cd5494d09d`

## Modification status

- `SPEC.md`: unmodified copy of upstream file at commit `b0e0ff0082236a73c12a48483d0c6036fdd31fe1`.
- `LICENSE`: unmodified copy of upstream file at commit `b0e0ff0082236a73c12a48483d0c6036fdd31fe1`.
- `NOTICE`: unmodified copy of upstream file at commit `b0e0ff0082236a73c12a48483d0c6036fdd31fe1`.

## Install/discovery compatibility verification

Validated on 2026-03-09 against current repository conventions:

- `bun test scripts/install-spec.test.mts` passed (2/2), confirming `scripts/install-spec.sh` copies companion files from the spec directory and enforces `SPEC.md` presence.
- `npm --prefix apps/web exec vitest run src/lib/spec-discovery.test.ts --coverage=false` passed (3/3), confirming repository discovery behavior for `specs/*/SPEC.md`.
- `find specs -mindepth 2 -maxdepth 2 -name SPEC.md | sort` includes `specs/symphony/SPEC.md`.
