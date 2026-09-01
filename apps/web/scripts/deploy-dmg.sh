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
# Requires: SSH key access and passwordless sudo for the deployment account.

set -euo pipefail

SERVER="${PLAINLIST_SERVER:-ubuntu@175.24.134.228}"
REMOTE_ROOT="/www/wwwroot/175.24.134.228"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STAGE_DIR="${SCRIPT_DIR}/../.electron-stage"
PAGE_DIR="${SCRIPT_DIR}/download-page"
DMG_DIR="${STAGE_DIR}/release"
VERSION="${PLAINLIST_VERSION:-2.3.0}"

SSH_OPTS=(-o BatchMode=yes -o PreferredAuthentications=publickey -o PasswordAuthentication=no -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)

# 1. Ensure remote dirs exist (sudo mkdir)
echo "[deploy] preparing remote dirs..."
ssh "${SSH_OPTS[@]}" "$SERVER" \
  "sudo -n mkdir -p '${REMOTE_ROOT}/downloads' && \
   sudo -n chown -R www:www '${REMOTE_ROOT}'"

# 2. Generate SHA256SUMS locally
echo "[deploy] generating SHA256SUMS..."
SUMS_FILE="${STAGE_DIR}/SHA256SUMS.txt"
(cd "${DMG_DIR}" && shasum -a 256 "PlainList-${VERSION}-"*.dmg) > "${SUMS_FILE}"
cat "${SUMS_FILE}"

# 3. Upload DMG files via scp directly to the target dir
echo "[deploy] uploading DMG files..."
for arch in arm64 x64; do
  src="${DMG_DIR}/PlainList-${VERSION}-${arch}.dmg"
  dst_name="PlainList-${VERSION}-${arch}.dmg"
  # Write to /tmp with the final name, then sudo-mv into place.
  scp "${SSH_OPTS[@]}" "$src" \
    "$SERVER:/tmp/$dst_name"
  ssh "${SSH_OPTS[@]}" "$SERVER" \
    "sudo -n mv '/tmp/$dst_name' '${REMOTE_ROOT}/downloads/$dst_name' && \
     sudo -n chown www:www '${REMOTE_ROOT}/downloads/$dst_name'"
done

# 4. Upload SHA256SUMS
echo "[deploy] uploading SHA256SUMS..."
scp "${SSH_OPTS[@]}" "${SUMS_FILE}" \
  "$SERVER:/tmp/SHA256SUMS.txt"
ssh "${SSH_OPTS[@]}" "$SERVER" \
  "sudo -n mv /tmp/SHA256SUMS.txt '${REMOTE_ROOT}/downloads/SHA256SUMS.txt' && \
   sudo -n chown www:www '${REMOTE_ROOT}/downloads/SHA256SUMS.txt'"

# 5. Upload download page
echo "[deploy] uploading index.html..."
scp "${SSH_OPTS[@]}" "${PAGE_DIR}/index.html" \
  "$SERVER:/tmp/plainlist-index.html"
ssh "${SSH_OPTS[@]}" "$SERVER" \
  "sudo -n mv /tmp/plainlist-index.html '${REMOTE_ROOT}/index.html' && \
   sudo -n chown www:www '${REMOTE_ROOT}/index.html'"

# 6. Copy favicon from existing plainlist dir if not present
echo "[deploy] ensuring favicon..."
ssh "${SSH_OPTS[@]}" "$SERVER" \
  "sudo -n cp /www/wwwroot/plainlist/favicon.ico '${REMOTE_ROOT}/favicon.ico' && \
   sudo -n chown www:www '${REMOTE_ROOT}/favicon.ico'"

# 7. Final check
echo "[deploy] verifying..."
ssh "${SSH_OPTS[@]}" "$SERVER" \
  "sudo -n ls -la '${REMOTE_ROOT}/' '${REMOTE_ROOT}/downloads/'"

echo "[deploy] done. Visit http://175.24.134.228/ to test."
