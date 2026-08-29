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
# Requires: SSHPASS env var with the server password (or use ssh keys via sshpass -e).

set -euo pipefail

SERVER="${PLAINLIST_SERVER:-ubuntu@175.24.134.228}"
PASSWORD="${SSHPASS:?SSHPASS is required}"
REMOTE_ROOT="/www/wwwroot/175.24.134.228"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PAGE_DIR="${SCRIPT_DIR}/download-page"
VERSION="2.1.1"
APK="${WEB_DIR}/.android-release/PlainList-${VERSION}.apk"
GUIDE="${WEB_DIR}/public/guide.html"

SSHPASS_OPTS=(
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=20
  -o PreferredAuthentications=password
  -o PubkeyAuthentication=no
)
export SSHPASS="$PASSWORD"

[[ -f "$APK" ]] || { echo "missing $APK — run mobile:android:release first"; exit 1; }

sshpass -e ssh "${SSHPASS_OPTS[@]}" "$SERVER" \
  "echo '${SSHPASS}' | sudo -S mkdir -p '${REMOTE_ROOT}/downloads' && \
   echo '${SSHPASS}' | sudo -S chown -R www:www '${REMOTE_ROOT}'"

DST_NAME="PlainList-${VERSION}.apk"
sshpass -e scp "${SSHPASS_OPTS[@]}" "$APK" "$SERVER:/tmp/$DST_NAME"
sshpass -e ssh "${SSHPASS_OPTS[@]}" "$SERVER" \
  "echo '${SSHPASS}' | sudo -S mv '/tmp/$DST_NAME' '${REMOTE_ROOT}/downloads/$DST_NAME' && \
   echo '${SSHPASS}' | sudo -S chown www:www '${REMOTE_ROOT}/downloads/$DST_NAME'"

# Rebuild SUMS on server for all PlainList artifacts
sshpass -e ssh "${SSHPASS_OPTS[@]}" "$SERVER" \
  "cd '${REMOTE_ROOT}/downloads' && echo '${SSHPASS}' | sudo -S bash -lc 'shasum -a 256 PlainList-*.dmg PlainList-*.apk > SHA256SUMS.txt && chown www:www SHA256SUMS.txt'"

sshpass -e scp "${SSHPASS_OPTS[@]}" "${PAGE_DIR}/index.html" "$SERVER:/tmp/plainlist-index.html"
sshpass -e scp "${SSHPASS_OPTS[@]}" "$GUIDE" "$SERVER:/tmp/plainlist-guide.html"
sshpass -e ssh "${SSHPASS_OPTS[@]}" "$SERVER" \
  "echo '${SSHPASS}' | sudo -S mv /tmp/plainlist-index.html '${REMOTE_ROOT}/index.html' && \
   echo '${SSHPASS}' | sudo -S mv /tmp/plainlist-guide.html '${REMOTE_ROOT}/guide.html' && \
   echo '${SSHPASS}' | sudo -S chown www:www '${REMOTE_ROOT}/index.html' '${REMOTE_ROOT}/guide.html'"

echo "[deploy-android] done → http://175.24.134.228/"
