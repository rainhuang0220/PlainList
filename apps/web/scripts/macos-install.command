#!/bin/bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="${PLAINLIST_INSTALL_SRC:-${DIR}/PlainList.app}"
DEST="${PLAINLIST_INSTALL_DEST:-/Applications/PlainList.app}"
NONINTERACTIVE="${PLAINLIST_INSTALL_NONINTERACTIVE:-}"

pause() {
  if [[ -z "$NONINTERACTIVE" ]]; then
    read -r -p "按回车退出…"
  fi
}

fail() {
  echo "✗ $*"
  pause
  exit 1
}

rollback() {
  if [[ -n "${BACKUP:-}" && -d "$BACKUP/PlainList.app" ]]; then
    rm -rf "$DEST"
    /usr/bin/ditto "$BACKUP/PlainList.app" "$DEST" 2>/dev/null || true
  fi
}

echo "========================================"
echo "  PlainList 安装（会自动清除隔离标记）"
echo "========================================"

if [[ ! -d "$SRC" ]]; then
  fail "找不到 PlainList.app，请从磁盘映像根目录运行本脚本。"
fi

echo "→ 正在检查来源包（未改动现有安装）…"
ver="$(/usr/bin/defaults read "$SRC/Contents/Info" CFBundleShortVersionString 2>/dev/null || true)"
bid="$(/usr/bin/defaults read "$SRC/Contents/Info" CFBundleIdentifier 2>/dev/null || true)"
if [[ "$ver" != "2.5.1" ]]; then
  fail "版本必须是 2.5.1，当前是 ${ver:-unknown}。这可能是已损坏的旧包，未改动现有安装。"
fi
if [[ "$bid" != "com.plainlist.app" ]]; then
  fail "Bundle id 必须是 com.plainlist.app，当前是 ${bid:-unknown}。未改动现有安装。"
fi
if ! /usr/bin/codesign --verify --deep --strict "$SRC"; then
  fail "codesign 校验失败。典型是旧版 2.5.0 linker-signed 包，系统会提示「已损坏」。未改动现有安装。"
fi
info="$(/usr/bin/codesign -dv --verbose=2 "$SRC" 2>&1)"
if grep -q 'linker-signed' <<<"$info"; then
  fail "检测到 linker-signed 签名。这就是「已损坏，无法打开」。未改动现有安装。"
fi
if ! grep -q 'Identifier=com.plainlist.app' <<<"$info"; then
  fail "codesign Identifier 必须是 com.plainlist.app，不能是 Electron。未改动现有安装。"
fi
if ! grep -q 'Sealed Resources version=' <<<"$info"; then
  fail "缺少 Sealed Resources。未改动现有安装。"
fi

exe="${DEST}/Contents/MacOS/PlainList"
/usr/bin/pkill -f "$exe" 2>/dev/null || true
sleep 0.5

BACKUP=""
if [[ -d "$DEST" ]]; then
  BACKUP="$(mktemp -d /tmp/plainlist-install-backup-XXXX)"
  /usr/bin/ditto "$DEST" "$BACKUP/PlainList.app"
fi

echo "→ 正在复制到 ${DEST} …"
rm -rf "$DEST"
if ! /usr/bin/ditto "$SRC" "$DEST"; then
  rollback
  fail "复制失败。已尝试恢复原安装。"
fi

echo "→ 正在清除隔离属性…"
/usr/bin/xattr -cr "$DEST" 2>/dev/null || true
/usr/bin/find "$DEST" -exec /usr/bin/xattr -d com.apple.quarantine {} \; 2>/dev/null || true
if /usr/bin/xattr -l "$DEST" 2>/dev/null | grep -q quarantine; then
  rollback
  fail "未能清除隔离属性，未启动。已尝试恢复原安装。"
fi

if ! /usr/bin/codesign --verify --deep --strict "$DEST"; then
  rollback
  fail "复制后签名校验失败，未启动。已尝试恢复原安装。"
fi
dest_ver="$(/usr/bin/defaults read "$DEST/Contents/Info" CFBundleShortVersionString 2>/dev/null || true)"
if [[ "$dest_ver" != "2.5.1" ]]; then
  rollback
  fail "复制后版本不是 2.5.1。已尝试恢复原安装。"
fi

echo "→ 正在启动…"
/usr/bin/open "$DEST"
sleep 1
echo "安装完成。"
if [[ -z "$NONINTERACTIVE" ]]; then
  read -r -p "按回车关闭此窗口…"
fi
if [[ -n "$BACKUP" ]]; then
  rm -rf "$BACKUP"
fi
