#!/bin/bash
# Mirror versioned DMGs to the production download directory.
#
# Layout on the server:
#   /www/wwwroot/plainlist-downloads/
#     PlainList-<version>-macos-arm64.dmg
#     PlainList-<version>-macos-x64.dmg
#     SHA256SUMS.txt
#
# Canonical download page is https://plainlist.space/download.
# This script only uploads artifacts. It does not publish a second page.
#
# Requires: SSH key access and passwordless sudo for the deployment account.

set -euo pipefail

SERVER="${PLAINLIST_SERVER:-ubuntu@175.24.134.228}"
REMOTE_ROOT="/www/wwwroot/plainlist-downloads"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${WEB_DIR}/../.." && pwd)"
STAGE_DIR="${WEB_DIR}/.electron-stage"
DMG_DIR="${STAGE_DIR}/release"
ANDROID_RELEASE_DIR="${WEB_DIR}/.android-release"
VERSION="${PLAINLIST_VERSION:-$(node "${ROOT_DIR}/scripts/read-product-version.cjs")}"

SSH_OPTS=(-o BatchMode=yes -o PreferredAuthentications=publickey -o PasswordAuthentication=no -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)

# 1. Ensure remote dirs exist (sudo mkdir)
echo "[deploy] preparing remote dirs..."
ssh "${SSH_OPTS[@]}" "$SERVER" \
  "sudo -n mkdir -p '${REMOTE_ROOT}' && \
   sudo -n chown -R www:www '${REMOTE_ROOT}'"

# 2. Generate SHA256SUMS locally
echo "[deploy] generating SHA256SUMS..."
SUMS_FILE="${STAGE_DIR}/SHA256SUMS.txt"
(cd "${DMG_DIR}" && shasum -a 256 "PlainList-${VERSION}-macos-"*.dmg) > "${SUMS_FILE}"
if [[ -f "${ANDROID_RELEASE_DIR}/PlainList-${VERSION}-android.apk" ]]; then
  (cd "${ANDROID_RELEASE_DIR}" && shasum -a 256 "PlainList-${VERSION}-android.apk") >> "${SUMS_FILE}"
fi
cat "${SUMS_FILE}"

# 3. Upload DMG files via scp directly to the target dir
echo "[deploy] uploading DMG files..."
for arch in arm64 x64; do
  src="${DMG_DIR}/PlainList-${VERSION}-macos-${arch}.dmg"
  dst_name="PlainList-${VERSION}-macos-${arch}.dmg"
  # Write to /tmp with the final name, then sudo-mv into place.
  scp "${SSH_OPTS[@]}" "$src" \
    "$SERVER:/tmp/$dst_name"
  ssh "${SSH_OPTS[@]}" "$SERVER" \
    "sudo -n mv '/tmp/$dst_name' '${REMOTE_ROOT}/$dst_name' && \
     sudo -n chown www:www '${REMOTE_ROOT}/$dst_name'"
done

# 4. Upload SHA256SUMS
echo "[deploy] uploading SHA256SUMS..."
scp "${SSH_OPTS[@]}" "${SUMS_FILE}" \
  "$SERVER:/tmp/SHA256SUMS.txt"
ssh "${SSH_OPTS[@]}" "$SERVER" \
  "sudo -n mv /tmp/SHA256SUMS.txt '${REMOTE_ROOT}/SHA256SUMS.txt' && \
   sudo -n chown www:www '${REMOTE_ROOT}/SHA256SUMS.txt'"

echo "[deploy] verifying..."
ssh "${SSH_OPTS[@]}" "$SERVER" \
  "sudo -n ls -la '${REMOTE_ROOT}/'"

echo "[deploy] done. Artifacts at https://plainlist.space/downloads/"
