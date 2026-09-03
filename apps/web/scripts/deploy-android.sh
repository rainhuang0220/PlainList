#!/usr/bin/env bash
# Mirror the versioned Android APK to the production download directory.
#
# Layout on the server:
#   /www/wwwroot/plainlist-downloads/
#     PlainList-<version>-android.apk
#
# Canonical download page is https://plainlist.space/download.
#
# Requires: SSH key access and passwordless sudo for the deployment account.

set -euo pipefail

SERVER="${PLAINLIST_SERVER:-ubuntu@175.24.134.228}"
REMOTE_ROOT="/www/wwwroot/plainlist-downloads"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${WEB_DIR}/../.." && pwd)"
VERSION="${PLAINLIST_VERSION:-$(node "${ROOT_DIR}/scripts/read-product-version.cjs")}"
APK="${WEB_DIR}/.android-release/PlainList-${VERSION}-android.apk"

SSH_OPTS=(
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=20
  -o PreferredAuthentications=publickey
  -o PasswordAuthentication=no
)

[[ -f "$APK" ]] || { echo "missing $APK — run mobile:android:release first"; exit 1; }

ssh "${SSH_OPTS[@]}" "$SERVER" \
  "sudo -n mkdir -p '${REMOTE_ROOT}' && \
   sudo -n chown -R www:www '${REMOTE_ROOT}'"

DST_NAME="PlainList-${VERSION}-android.apk"
scp "${SSH_OPTS[@]}" "$APK" "$SERVER:/tmp/$DST_NAME"
ssh "${SSH_OPTS[@]}" "$SERVER" \
  "sudo -n mv '/tmp/$DST_NAME' '${REMOTE_ROOT}/$DST_NAME' && \
   sudo -n chown www:www '${REMOTE_ROOT}/$DST_NAME'"

ssh "${SSH_OPTS[@]}" "$SERVER" \
  "cd '${REMOTE_ROOT}' && sudo -n bash -lc 'shasum -a 256 PlainList-*.dmg PlainList-*.apk > SHA256SUMS.txt && chown www:www SHA256SUMS.txt'"

echo "[deploy-android] done → https://plainlist.space/download"
