#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <output-tar-gz>" >&2
  exit 64
fi

output_path="$1"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$(dirname "$output_path")"

COPYFILE_DISABLE=1 tar -C "$repo_root" -czf "$output_path" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='._*' \
  --exclude='.DS_Store' \
  --exclude='__MACOSX' \
  .

if tar -tzf "$output_path" | grep -E '(^|/)(\._[^/]*|\.DS_Store|__MACOSX)(/|$)' >/dev/null; then
  echo "refusing release archive containing macOS metadata: $output_path" >&2
  exit 1
fi

echo "created clean release archive: $output_path"
