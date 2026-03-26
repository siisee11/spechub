#!/usr/bin/env sh
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: sh install-spec.sh <owner/repo> <ref> <spec-slug>" >&2
  exit 1
fi

repo="$1"
ref="$2"
spec_slug="$3"
specs_root="./specs"
spec_target="$specs_root/$spec_slug"

if [ -e "$specs_root" ] && [ ! -d "$specs_root" ]; then
  echo "destination root '$specs_root' is not a directory" >&2
  exit 1
fi

mkdir -p "$specs_root"

if [ -e "$spec_target" ]; then
  printf "%s" "destination '$spec_target' already exists. Overwrite? [y/N] " >&2
  overwrite_reply=""
  if ! read -r overwrite_reply; then
    overwrite_reply=""
  fi

  case "$overwrite_reply" in
    y|Y|yes|YES|Yes)
      rm -rf "$spec_target"
      ;;
    *)
      echo "skipped overwriting existing destination '$spec_target'" >&2
      exit 1
      ;;
  esac
fi

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

if [ ! -d "$spec_source" ]; then
  echo "spec '$spec_slug' not found in ${repo}@${ref}" >&2
  exit 1
fi

if [ ! -f "$spec_source/SPEC.md" ]; then
  echo "spec '$spec_slug' is missing SPEC.md in ${repo}@${ref}" >&2
  exit 1
fi

cp -R "$spec_source" "$spec_target"
printf '%s\n' "installed $spec_slug into $(pwd)/specs/$spec_slug"
