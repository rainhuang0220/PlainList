#!/bin/bash
# Build a DMG from a packaged .app using hdiutil.
# Avoids dmg-builder's mac_alias bug on newer macOS.
#
# Usage: build-dmg.sh <arch>
#   arch: arm64 | x64

set -euo pipefail

ARCH="${1:-arm64}"
STAGE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STAGE_DIR="${STAGE_DIR}/.electron-stage"
RELEASE_DIR="${STAGE_DIR}/release"
APP_NAME="PlainList"
VERSION="2.0.18"
DMG_NAME="${APP_NAME}-${VERSION}-${ARCH}.dmg"

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

# Installer helper: clear Gatekeeper quarantine + open the app.
# Without Apple Developer ID notarization, a downloaded ad-hoc app is
# blocked by macOS until quarantine is removed. Dragging alone leaves
# the quarantine xattr, which forces the "无法验证 / 去设置里打开" flow.
cat > "${WORK}/① 双击我安装并打开.command" <<'EOF'
#!/bin/bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="${DIR}/PlainList.app"
DEST="/Applications/PlainList.app"

echo "========================================"
echo "  PlainList 安装（会自动清除隔离标记）"
echo "========================================"
if [[ ! -d "$SRC" ]]; then
  echo "找不到 PlainList.app，请从 DMG 根目录运行本脚本。"
  read -r -p "按回车退出…"
  exit 1
fi

# Quit any running instance
pkill -f '/Applications/PlainList.app/Contents/MacOS/PlainList' 2>/dev/null || true
sleep 0.5

echo "→ 正在复制到 /Applications …"
rm -rf "$DEST"
ditto "$SRC" "$DEST"

echo "→ 正在清除 Gatekeeper 隔离属性…"
# Chrome/Safari downloads stamp com.apple.quarantine; that is exactly
# what forces "去设置里仍要打开". Strip it from the whole bundle.
/usr/bin/xattr -cr "$DEST" 2>/dev/null || true
/usr/bin/find "$DEST" -exec /usr/bin/xattr -d com.apple.quarantine {} \; 2>/dev/null || true

if /usr/bin/xattr -l "$DEST" 2>/dev/null | grep -q quarantine; then
  echo "⚠ 仍检测到隔离属性。请在「终端」再执行一次："
  echo "   xattr -cr /Applications/PlainList.app"
else
  echo "✓ 隔离属性已清除"
fi

echo "→ 正在启动…"
# open from a cleared path — should not bounce to Settings
/usr/bin/open "$DEST"
sleep 1
echo "完成。若仍弹出无法验证，请右键 PlainList → 打开（只需一次）。"
read -r -p "按回车关闭此窗口…"
EOF
chmod +x "${WORK}/① 双击我安装并打开.command"

# Keep a short alias name too (some users already know the old name)
ln -sf "① 双击我安装并打开.command" "${WORK}/安装并打开.command"

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
