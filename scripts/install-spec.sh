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
if [ -z "$repo_root" ]; then
  echo "downloaded archive for ${repo}@${ref} had no repository directory" >&2
  exit 1
fi

resolve_install_order() {
  python3 - "$repo_root" "$spec_slug" <<'PY'
import json
import sys
from pathlib import Path


def fail(message: str) -> "None":
    print(message, file=sys.stderr)
    raise SystemExit(1)


repo_root = Path(sys.argv[1])
requested_slug = sys.argv[2]
specs_root = repo_root / "specs"


def ensure_spec(slug: str) -> None:
    spec_root = specs_root / slug
    if not spec_root.is_dir():
        fail(f"spec '{slug}' not found in archive")
    if not (spec_root / "SPEC.md").is_file():
        fail(f"spec '{slug}' is missing SPEC.md in archive")


def load_config(slug: str):
    config_path = specs_root / slug / "spec.config.json"
    if not config_path.is_file():
        return None

    try:
        raw = json.loads(config_path.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover - shell contract path
        fail(f"invalid spec.config.json for '{slug}': {exc}")

    if not isinstance(raw, dict):
        fail(f"invalid spec.config.json for '{slug}': expected object")

    spec = raw.get("spec")
    if not isinstance(spec, dict):
        fail(f"invalid spec.config.json for '{slug}': missing spec object")

    key = spec.get("key")
    if not isinstance(key, str) or not key.strip():
        fail(f"invalid spec.config.json for '{slug}': missing spec.key")

    dependencies_raw = raw.get("dependencies", [])
    if not isinstance(dependencies_raw, list):
        fail(f"invalid spec.config.json for '{slug}': dependencies must be an array")

    dependency_keys: list[str] = []
    for dependency in dependencies_raw:
        if not isinstance(dependency, dict):
            fail(f"invalid spec.config.json for '{slug}': dependency entries must be objects")
        dependency_key = dependency.get("key")
        dependency_type = dependency.get("type")
        if dependency_type != "requires":
            fail(f"invalid spec.config.json for '{slug}': unsupported dependency type")
        if not isinstance(dependency_key, str) or not dependency_key.strip():
            fail(f"invalid spec.config.json for '{slug}': dependency key must be a non-empty string")
        dependency_keys.append(dependency_key.strip())

    install = raw.get("install", {})
    include_dependencies = "transitive"
    if install is not None:
        if not isinstance(install, dict):
            fail(f"invalid spec.config.json for '{slug}': install must be an object")
        include_dependencies = install.get("include_dependencies", "transitive")
        if include_dependencies not in {"none", "direct", "transitive"}:
            fail(f"invalid spec.config.json for '{slug}': unsupported install.include_dependencies")

    return {
        "key": key.strip(),
        "dependencies": dependency_keys,
        "mode": include_dependencies,
    }


configs_by_slug = {}
key_to_slug = {}

for spec_dir in sorted(path for path in specs_root.iterdir() if path.is_dir()):
    ensure_spec(spec_dir.name)
    config = load_config(spec_dir.name)
    configs_by_slug[spec_dir.name] = config
    if not config:
        continue
    if config["key"] in key_to_slug and key_to_slug[config["key"]] != spec_dir.name:
        fail(f"duplicate spec key '{config['key']}' found in archive")
    key_to_slug[config["key"]] = spec_dir.name


def dependency_slugs(slug: str) -> list[str]:
    config = configs_by_slug.get(slug)
    if not config:
        return []

    slugs: list[str] = []
    for dependency_key in config["dependencies"]:
        dependency_slug = key_to_slug.get(dependency_key)
        if not dependency_slug:
            fail(f"dependency '{dependency_key}' declared by '{slug}' was not found in archive")
        ensure_spec(dependency_slug)
        slugs.append(dependency_slug)
    return slugs


ensure_spec(requested_slug)
requested_config = configs_by_slug.get(requested_slug)
requested_mode = requested_config["mode"] if requested_config else "none"

if requested_mode == "none":
    print(requested_slug)
    raise SystemExit(0)

if requested_mode == "direct":
    seen: set[str] = set()
    for dependency_slug in dependency_slugs(requested_slug):
        if dependency_slug == requested_slug:
            fail(f"dependency cycle detected for '{requested_slug}'")
        if dependency_slug in seen:
            continue
        seen.add(dependency_slug)
        print(dependency_slug)
    print(requested_slug)
    raise SystemExit(0)

ordered: list[str] = []
visiting: set[str] = set()
seen: set[str] = set()


def walk(slug: str) -> None:
    if slug in seen:
        return
    if slug in visiting:
        fail(f"dependency cycle detected while resolving '{requested_slug}'")

    visiting.add(slug)
    for dependency_slug in dependency_slugs(slug):
        walk(dependency_slug)
    visiting.remove(slug)
    seen.add(slug)
    ordered.append(slug)


walk(requested_slug)
for slug in ordered:
    print(slug)
PY
}

ensure_requested_target() {
  if [ ! -e "$spec_target" ]; then
    return
  fi

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
}

copy_spec_directory() {
  install_slug="$1"
  source_root="$repo_root/specs/$install_slug"
  target_root="$specs_root/$install_slug"

  if [ ! -d "$source_root" ]; then
    echo "spec '$install_slug' not found in ${repo}@${ref}" >&2
    exit 1
  fi

  if [ ! -f "$source_root/SPEC.md" ]; then
    echo "spec '$install_slug' is missing SPEC.md in ${repo}@${ref}" >&2
    exit 1
  fi

  cp -R "$source_root" "$target_root"
}

install_order="$(resolve_install_order)"

ensure_requested_target

old_ifs=$IFS
IFS='
'
for install_slug in $install_order; do
  target_root="$specs_root/$install_slug"

  if [ "$install_slug" = "$spec_slug" ]; then
    copy_spec_directory "$install_slug"
    continue
  fi

  if [ -e "$target_root" ]; then
    echo "dependency '$install_slug' already exists at '$target_root'; skipping" >&2
    continue
  fi

  copy_spec_directory "$install_slug"
  printf '%s\n' "installed dependency $install_slug into $(pwd)/specs/$install_slug" >&2
done
IFS=$old_ifs

printf '%s\n' "installed $spec_slug into $(pwd)/specs/$spec_slug"
