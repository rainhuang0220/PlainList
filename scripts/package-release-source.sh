#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <output-tar-gz>" >&2
  exit 64
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$(dirname "$1")"
output_dir="$(cd "$(dirname "$1")" && pwd)"
output_path="${output_dir}/$(basename "$1")"

tar_excludes=(
  --exclude='.git'
  --exclude='node_modules'
  --exclude='._*'
  --exclude='.DS_Store'
  --exclude='__MACOSX'
)

if [[ "$output_path" == "$repo_root/"* ]]; then
  tar_excludes+=("--exclude=${output_path#"$repo_root/"}")
fi

COPYFILE_DISABLE=1 tar -C "$repo_root" -czf "$output_path" "${tar_excludes[@]}" .

if tar -tzf "$output_path" | grep -E '(^|/)(\._[^/]*|\.DS_Store|__MACOSX)(/|$)' >/dev/null; then
  echo "refusing release archive containing macOS metadata: $output_path" >&2
  exit 1
fi

echo "created clean release archive: $output_path"
