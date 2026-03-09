#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git -C "${PWD}" rev-parse --show-toplevel)"
release_bin="${repo_root}/harness/target/release/harnesscli"

if [[ -x "${release_bin}" ]]; then
  exec "${release_bin}" init "$@"
fi

exec cargo run --quiet --manifest-path "${repo_root}/harness/Cargo.toml" -- init "$@"
