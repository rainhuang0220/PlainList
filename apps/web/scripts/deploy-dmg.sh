#!/bin/bash
# Deploy PlainList DMG + download page to 175.24.134.228.
#
# Layout on the server:
#   /www/wwwroot/175.24.134.228/
#     index.html              # download page
#     favicon.ico
#     downloads/
#       PlainList-2.0.0-arm64.dmg
#       PlainList-2.0.0-x64.dmg
#       SHA256SUMS.txt
#
# The existing 80-port nginx vhost already serves this root, so no nginx
# config changes are needed.
#
# Requires: SSHPASS env var with the server password (or use ssh keys).
# The script uses sudo to write into /www/wwwroot/ (root:root).

set -euo pipefail

SERVER="${PLAINLIST_SERVER:-ubuntu@175.24.134.228}"
PASSWORD="${SSHPASS:-Hzy20060220}"
REMOTE_ROOT="/www/wwwroot/175.24.134.228"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STAGE_DIR="${SCRIPT_DIR}/../.electron-stage"
PAGE_DIR="${SCRIPT_DIR}/download-page"
DMG_DIR="${STAGE_DIR}/release"
VERSION="2.0.0"

if [[ -z "${SSHPASS:-}" ]]; then
  export SSHPASS="$PASSWORD"
fi

SSHPASS_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)

# 1. Ensure remote dirs exist (sudo mkdir)
echo "[deploy] preparing remote dirs..."
sshpass -e ssh "${SSHPASS_OPTS[@]}" "$SERVER" \
  "echo '${SSHPASS}' | sudo -S mkdir -p '${REMOTE_ROOT}/downloads' && \
   echo '${SSHPASS}' | sudo -S chown -R www:www '${REMOTE_ROOT}'"

# 2. Generate SHA256SUMS locally
echo "[deploy] generating SHA256SUMS..."
SUMS_FILE="${STAGE_DIR}/SHA256SUMS.txt"
(cd "${DMG_DIR}" && shasum -a 256 PlainList-2.0.0-*.dmg) > "${SUMS_FILE}"
cat "${SUMS_FILE}"

# 3. Upload DMG files via scp directly to the target dir
echo "[deploy] uploading DMG files..."
for arch in arm64 x64; do
  src="${DMG_DIR}/PlainList-${VERSION}-${arch}.dmg"
  dst_name="PlainList-${VERSION}-${arch}.dmg"
  # write to /tmp with the final name, then sudo-mv into place (avoids rsync
  # path-resolution issues with sudo + sshpass)
  sshpass -e scp "${SSHPASS_OPTS[@]}" "$src" \
    "$SERVER:/tmp/$dst_name"
  sshpass -e ssh "${SSHPASS_OPTS[@]}" "$SERVER" \
    "echo '${SSHPASS}' | sudo -S mv '/tmp/$dst_name' '${REMOTE_ROOT}/downloads/$dst_name' && \
     echo '${SSHPASS}' | sudo -S chown www:www '${REMOTE_ROOT}/downloads/$dst_name'"
done

# 4. Upload SHA256SUMS
echo "[deploy] uploading SHA256SUMS..."
sshpass -e scp "${SSHPASS_OPTS[@]}" "${SUMS_FILE}" \
  "$SERVER:/tmp/SHA256SUMS.txt"
sshpass -e ssh "${SSHPASS_OPTS[@]}" "$SERVER" \
  "echo '${SSHPASS}' | sudo -S mv /tmp/SHA256SUMS.txt '${REMOTE_ROOT}/downloads/SHA256SUMS.txt' && \
   echo '${SSHPASS}' | sudo -S chown www:www '${REMOTE_ROOT}/downloads/SHA256SUMS.txt'"

# 5. Upload download page
echo "[deploy] uploading index.html..."
sshpass -e scp "${SSHPASS_OPTS[@]}" "${PAGE_DIR}/index.html" \
  "$SERVER:/tmp/plainlist-index.html"
sshpass -e ssh "${SSHPASS_OPTS[@]}" "$SERVER" \
  "echo '${SSHPASS}' | sudo -S mv /tmp/plainlist-index.html '${REMOTE_ROOT}/index.html' && \
   echo '${SSHPASS}' | sudo -S chown www:www '${REMOTE_ROOT}/index.html'"

# 6. Copy favicon from existing plainlist dir if not present
echo "[deploy] ensuring favicon..."
sshpass -e ssh "${SSHPASS_OPTS[@]}" "$SERVER" \
  "echo '${SSHPASS}' | sudo -S cp /www/wwwroot/plainlist/favicon.ico '${REMOTE_ROOT}/favicon.ico' && \
   echo '${SSHPASS}' | sudo -S chown www:www '${REMOTE_ROOT}/favicon.ico'"

# 7. Final check
echo "[deploy] verifying..."
sshpass -e ssh "${SSHPASS_OPTS[@]}" "$SERVER" \
  "echo $SSHPASS | sudo -S ls -la ${REMOTE_ROOT}/ ${REMOTE_ROOT}/downloads/"

echo "[deploy] done. Visit http://175.24.134.228/ to test."
