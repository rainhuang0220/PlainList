#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${WEB_DIR}/../.." && pwd)"
API_BASE="$(node "${SCRIPT_DIR}/production-api-contract.cjs" "${VITE_API_BASE_URL:-}")"

cd "$WEB_DIR"
VITE_API_BASE_URL="$API_BASE" npm run desktop:build
node scripts/verify-production-api-bundle.cjs dist
node scripts/prepare-electron.cjs
(cd .electron-stage && "${ROOT_DIR}/node_modules/.bin/electron-builder" "$@")

for arch in arm64 x64; do
  if [[ "$arch" == arm64 ]]; then
    app_path=.electron-stage/release/mac-arm64/PlainList.app
  else
    app_path=.electron-stage/release/mac/PlainList.app
  fi
  if [[ -d "$app_path" ]]; then
    node scripts/verify-packaged-api-bundle.cjs "$app_path"
    bash scripts/sign-adhoc.sh "$app_path"
    bash scripts/verify-macos-app.sh "$app_path"
    bash scripts/build-dmg.sh "$arch"
  fi
done
