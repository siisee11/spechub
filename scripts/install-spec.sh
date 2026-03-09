#!/usr/bin/env sh
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: sh install-spec.sh <owner/repo> <ref> <spec-slug>" >&2
  exit 1
fi

repo="$1"
ref="$2"
spec_slug="$3"

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/spechub-spec.XXXXXX")"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT INT TERM

archive_url="https://codeload.github.com/${repo}/tar.gz/${ref}"
archive_path="$tmp_dir/repo.tar.gz"
curl -fsSL "$archive_url" -o "$archive_path"
tar -xzf "$archive_path" -C "$tmp_dir"

repo_root="$(find "$tmp_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
spec_source="$repo_root/specs/$spec_slug"
spec_target="./$spec_slug"

if [ ! -d "$spec_source" ]; then
  echo "spec '$spec_slug' not found in ${repo}@${ref}" >&2
  exit 1
fi

if [ ! -f "$spec_source/SPEC.md" ]; then
  echo "spec '$spec_slug' is missing SPEC.md in ${repo}@${ref}" >&2
  exit 1
fi

if [ -e "$spec_target" ]; then
  echo "destination '$spec_target' already exists" >&2
  exit 1
fi

cp -R "$spec_source" "$spec_target"
printf '%s\n' "installed $spec_slug into $(pwd)/$spec_slug"
