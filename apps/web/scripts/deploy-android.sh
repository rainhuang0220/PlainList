#!/usr/bin/env bash
# Deploy PlainList Android APK + download page to 175.24.134.228.
#
# Layout on the server:
#   /www/wwwroot/175.24.134.228/
#     index.html              # download page
#     downloads/
#       PlainList-2.0.0.apk
#       PlainList-2.0.0-*.dmg   # (existing macOS builds)
#       SHA256SUMS.txt
#
# Requires: SSH key access and passwordless sudo for the deployment account.

set -euo pipefail

SERVER="${PLAINLIST_SERVER:-ubuntu@175.24.134.228}"
REMOTE_ROOT="/www/wwwroot/175.24.134.228"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PAGE_DIR="${SCRIPT_DIR}/download-page"
VERSION="${PLAINLIST_VERSION:-2.2.1}"
APK="${WEB_DIR}/.android-release/PlainList-${VERSION}.apk"
GUIDE="${WEB_DIR}/public/guide.html"

SSH_OPTS=(
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=20
  -o PreferredAuthentications=publickey
  -o PasswordAuthentication=no
)

[[ -f "$APK" ]] || { echo "missing $APK — run mobile:android:release first"; exit 1; }

ssh "${SSH_OPTS[@]}" "$SERVER" \
  "sudo -n mkdir -p '${REMOTE_ROOT}/downloads' && \
   sudo -n chown -R www:www '${REMOTE_ROOT}'"

DST_NAME="PlainList-${VERSION}.apk"
scp "${SSH_OPTS[@]}" "$APK" "$SERVER:/tmp/$DST_NAME"
ssh "${SSH_OPTS[@]}" "$SERVER" \
  "sudo -n mv '/tmp/$DST_NAME' '${REMOTE_ROOT}/downloads/$DST_NAME' && \
   sudo -n chown www:www '${REMOTE_ROOT}/downloads/$DST_NAME'"

# Rebuild SUMS on server for all PlainList artifacts
ssh "${SSH_OPTS[@]}" "$SERVER" \
  "cd '${REMOTE_ROOT}/downloads' && sudo -n bash -lc 'shasum -a 256 PlainList-*.dmg PlainList-*.apk > SHA256SUMS.txt && chown www:www SHA256SUMS.txt'"

scp "${SSH_OPTS[@]}" "${PAGE_DIR}/index.html" "$SERVER:/tmp/plainlist-index.html"
scp "${SSH_OPTS[@]}" "$GUIDE" "$SERVER:/tmp/plainlist-guide.html"
ssh "${SSH_OPTS[@]}" "$SERVER" \
  "sudo -n mv /tmp/plainlist-index.html '${REMOTE_ROOT}/index.html' && \
   sudo -n mv /tmp/plainlist-guide.html '${REMOTE_ROOT}/guide.html' && \
   sudo -n chown www:www '${REMOTE_ROOT}/index.html' '${REMOTE_ROOT}/guide.html'"

echo "[deploy-android] done → http://175.24.134.228/"
