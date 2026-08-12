#!/bin/bash
# One-shot PlainList installer for macOS.
# Downloaded via curl/Terminal — does NOT get Chrome's quarantine stamp,
# which is what forces "设置 → 仍要打开".
set -euo pipefail

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) DMG_ARCH=arm64 ;;
  x86_64) DMG_ARCH=x64 ;;
  *) echo "不支持的架构: $ARCH"; exit 1 ;;
esac

BASE_URL="${PLAINLIST_BASE_URL:-http://175.24.134.228}"
DMG_URL="${BASE_URL}/downloads/PlainList-2.0.17-${DMG_ARCH}.dmg"
TMP_DMG="$(mktemp -t plainlist).dmg"
DEST="/Applications/PlainList.app"

echo "========================================"
echo "  PlainList 一键安装 (${DMG_ARCH})"
echo "========================================"
echo "下载: $DMG_URL"

# curl does not apply com.apple.quarantine
curl -fL --progress-bar -o "$TMP_DMG" "$DMG_URL"

echo "挂载 DMG…"
ATTACH_OUT="$(hdiutil attach -nobrowse "$TMP_DMG")"
VOL="$(echo "$ATTACH_OUT" | awk -F'\t' '/\/Volumes\// {print $NF; exit}')"
if [[ -z "$VOL" || ! -d "$VOL/PlainList.app" ]]; then
  echo "挂载失败或找不到 PlainList.app"
  hdiutil detach "$VOL" -force 2>/dev/null || true
  rm -f "$TMP_DMG"
  exit 1
fi

echo "安装到 /Applications…"
pkill -f '/Applications/PlainList.app/Contents/MacOS/PlainList' 2>/dev/null || true
sleep 0.3
rm -rf "$DEST"
ditto "$VOL/PlainList.app" "$DEST"

# Belt-and-suspenders: strip any quarantine if present
xattr -cr "$DEST" 2>/dev/null || true
find "$DEST" -exec xattr -d com.apple.quarantine {} \; 2>/dev/null || true

hdiutil detach "$VOL" -force >/dev/null 2>&1 || true
rm -f "$TMP_DMG"

echo "启动 PlainList…"
open "$DEST"
sleep 1

if pgrep -f '/Applications/PlainList.app/Contents/MacOS/PlainList' >/dev/null; then
  echo "✓ 安装成功并已启动。"
else
  echo "已安装到 $DEST。"
  echo "若仍提示无法验证：右键 PlainList → 打开（只需一次）。"
fi
