#!/bin/bash
# Build a DMG from a packaged .app using hdiutil.
# Avoids dmg-builder's mac_alias bug on newer macOS.
#
# Usage: build-dmg.sh <arch>
#   arch: arm64 | x64

set -euo pipefail

ARCH="${1:-arm64}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${WEB_DIR}/../.." && pwd)"
STAGE_DIR="${WEB_DIR}/.electron-stage"
RELEASE_DIR="${STAGE_DIR}/release"
APP_NAME="PlainList"
VERSION="${PLAINLIST_VERSION:-$(node "${ROOT_DIR}/scripts/read-product-version.cjs")}"
DMG_NAME="${APP_NAME}-${VERSION}-macos-${ARCH}.dmg"

case "$ARCH" in
  arm64) APP_DIR="${RELEASE_DIR}/mac-arm64" ;;
  x64)   APP_DIR="${RELEASE_DIR}/mac" ;;
  *) echo "unknown arch: $ARCH"; exit 1 ;;
esac

if [[ ! -d "${APP_DIR}/${APP_NAME}.app" ]]; then
  echo "no .app at ${APP_DIR}/${APP_NAME}.app"
  exit 1
fi

echo "[build-dmg] ${ARCH}: ${APP_DIR}/${APP_NAME}.app -> ${DMG_NAME}"

# Working dir: temp dir with .app + Applications symlink
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK" "${WORK}-rw.dmg" "${WORK}-ro.dmg"' EXIT

cp -R "${APP_DIR}/${APP_NAME}.app" "${WORK}/"
ln -s /Applications "${WORK}/Applications"

# Fail-closed installer: verify 2.5.1 + sealed ad-hoc before replacing /Applications.
cp "${SCRIPT_DIR}/macos-install.command" "${WORK}/① 双击我安装并打开.command"
chmod +x "${WORK}/① 双击我安装并打开.command"

# Keep short aliases (download page and older notes use these names)
ln -sf "① 双击我安装并打开.command" "${WORK}/安装并打开.command"
ln -sf "① 双击我安装并打开.command" "${WORK}/安装 PlainList.command"

cat > "${WORK}/请先双击安装.txt" <<'EOF'
请双击「安装 PlainList」或「① 双击我安装并打开」。

不要直接打开 PlainList.app。
从浏览器下载后，直接打开应用会被系统隔离并立即退出。
安装脚本会复制到“应用程序”并清除隔离标记。
EOF

# Layout the dmg in a way that shows a "drag to Applications" hint
TMP_DMG="${WORK}-rw.dmg"
hdiutil create \
  -volname "${APP_NAME} ${VERSION}" \
  -srcfolder "${WORK}" \
  -ov \
  -format UDRO \
  "${TMP_DMG}" >/dev/null

# Convert to compressed, read-only
RO_DMG="${WORK}-ro.dmg"
hdiutil convert "${TMP_DMG}" \
  -format UDZO \
  -imagekey zlib-level=9 \
  -o "${RO_DMG}" >/dev/null

# Move to release dir
mv "${RO_DMG}" "${RELEASE_DIR}/${DMG_NAME}"

# Cleanup staged .app/zip for this arch to keep release tidy
# (don't delete the .app yet — caller decides)

ls -lh "${RELEASE_DIR}/${DMG_NAME}"
echo "[build-dmg] done: ${DMG_NAME}"
