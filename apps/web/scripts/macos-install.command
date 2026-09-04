#!/bin/bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="${PLAINLIST_INSTALL_SRC:-${DIR}/PlainList.app}"
DEST="${PLAINLIST_INSTALL_DEST:-/Applications/PlainList.app}"
NONINTERACTIVE="${PLAINLIST_INSTALL_NONINTERACTIVE:-}"
SUDO="${PLAINLIST_INSTALL_SUDO:-/usr/bin/sudo}"
REQUIRE_AUTH="${PLAINLIST_INSTALL_REQUIRE_AUTH:-}"
SKIP_LAUNCH="${PLAINLIST_INSTALL_SKIP_LAUNCH:-}"
PRODUCT_VERSION="2.5.3"
USE_SUDO=""

# macOS sudo already owns password entry and retries (passwd_tries, typically 3).
# This script must never read, echo, store, or log a password.

wait_for_enter() {
  [[ -z "$NONINTERACTIVE" && -c /dev/tty ]] || return 0
  local _line
  while IFS= read -r _line </dev/tty; do
    [[ -z "$_line" ]] && break
  done || true
}

restore_tty() {
  [[ -z "$NONINTERACTIVE" && -c /dev/tty ]] || return 0
  /bin/stty sane </dev/tty 2>/dev/null || true
}

close_this_terminal_window() {
  [[ -z "$NONINTERACTIVE" ]] || return 0
  [[ "${TERM_PROGRAM:-}" == "Apple_Terminal" ]] || return 0
  local t short
  t="$(/usr/bin/tty 2>/dev/null || true)"
  [[ "$t" == /dev/* ]] || return 0
  short="${t#/dev/}"
  /usr/bin/osascript >/dev/null 2>&1 <<APPLESCRIPT || true
tell application "Terminal"
  repeat with w in windows
    try
      set tabTty to tty of selected tab of w
      if tabTty is "$t" or tabTty is "$short" then
        close w
        exit repeat
      end if
    end try
  end repeat
end tell
APPLESCRIPT
}

hold_and_exit() {
  local code="${1:-0}"
  restore_tty
  if [[ -z "$NONINTERACTIVE" ]]; then
    echo
    if [[ "$code" -eq 0 ]]; then
      printf '按回车关闭此窗口…'
    else
      printf '按回车退出…'
    fi
    wait_for_enter
    close_this_terminal_window
  fi
  exit "$code"
}

fail() {
  echo "✗ $*"
  hold_and_exit 1
}

rollback() {
  if [[ -n "${BACKUP:-}" && -d "$BACKUP/PlainList.app" ]]; then
    dest_run /bin/rm -rf "$DEST"
    dest_run /usr/bin/ditto "$BACKUP/PlainList.app" "$DEST" 2>/dev/null || true
  fi
}

dest_run() {
  if [[ -n "$USE_SUDO" ]]; then
    "$SUDO" "$@"
  else
    "$@"
  fi
}

dest_needs_privilege() {
  local parent
  parent="$(/usr/bin/dirname "$DEST")"
  if [[ -e "$DEST" ]]; then
    [[ -w "$DEST" ]] && return 1
    return 0
  fi
  [[ -w "$parent" ]] && return 1
  return 0
}

authenticate_admin() {
  if [[ -z "$REQUIRE_AUTH" && -n "$NONINTERACTIVE" ]]; then
    return 0
  fi
  if [[ -z "$REQUIRE_AUTH" ]] && ! dest_needs_privilege; then
    return 0
  fi
  echo "需要管理员权限才能将 PlainList 安装到“应用程序”。"
  echo "请在系统密码提示中输入。输错可直接重试；三次失败后安装会取消。"
  local sudo_status=0
  if [[ -c /dev/tty ]]; then
    "$SUDO" -v </dev/tty >/dev/tty 2>/dev/tty || sudo_status=$?
  else
    "$SUDO" -v || sudo_status=$?
  fi
  if [[ "$sudo_status" -eq 0 ]]; then
    USE_SUDO=1
    return 0
  fi
  fail "密码验证失败，安装已取消。"
}

echo "========================================"
echo "  PlainList 安装（会自动清除隔离标记）"
echo "========================================"

if [[ ! -d "$SRC" ]]; then
  fail "找不到 PlainList.app，请从磁盘映像根目录运行本脚本。"
fi

authenticate_admin

echo "→ 正在检查来源包（未改动现有安装）…"
ver="$(/usr/bin/defaults read "$SRC/Contents/Info" CFBundleShortVersionString 2>/dev/null || true)"
bid="$(/usr/bin/defaults read "$SRC/Contents/Info" CFBundleIdentifier 2>/dev/null || true)"
if [[ "$ver" != "$PRODUCT_VERSION" ]]; then
  fail "版本必须是 ${PRODUCT_VERSION}，当前是 ${ver:-unknown}。这可能是已损坏的旧包，未改动现有安装。"
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
if [[ -x "$exe" ]]; then
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    /bin/kill "$pid" 2>/dev/null || true
  done < <(/usr/bin/pgrep -f "$exe" 2>/dev/null || true)
  sleep 0.5
fi

BACKUP=""
if [[ -d "$DEST" ]]; then
  BACKUP="$(mktemp -d /tmp/plainlist-install-backup-XXXX)"
  dest_run /usr/bin/ditto "$DEST" "$BACKUP/PlainList.app"
fi

echo "→ 正在复制到 ${DEST} …"
dest_run /bin/rm -rf "$DEST"
if ! dest_run /usr/bin/ditto "$SRC" "$DEST"; then
  rollback
  fail "复制失败。已尝试恢复原安装。"
fi

echo "→ 正在清除隔离属性…"
dest_run /usr/bin/xattr -cr "$DEST" 2>/dev/null || true
dest_run /usr/bin/find "$DEST" -exec /usr/bin/xattr -d com.apple.quarantine {} \; 2>/dev/null || true
if dest_run /usr/bin/xattr -l "$DEST" 2>/dev/null | grep -q quarantine; then
  rollback
  fail "未能清除隔离属性，未启动。已尝试恢复原安装。"
fi

if ! /usr/bin/codesign --verify --deep --strict "$DEST"; then
  rollback
  fail "复制后签名校验失败，未启动。已尝试恢复原安装。"
fi
dest_ver="$(/usr/bin/defaults read "$DEST/Contents/Info" CFBundleShortVersionString 2>/dev/null || true)"
if [[ "$dest_ver" != "$PRODUCT_VERSION" ]]; then
  rollback
  fail "复制后版本不是 ${PRODUCT_VERSION}。已尝试恢复原安装。"
fi

echo "→ 正在启动…"
if [[ -z "$SKIP_LAUNCH" ]]; then
  /usr/bin/open "$DEST"
  sleep 1
fi
echo "安装完成。"
if [[ -n "$BACKUP" ]]; then
  rm -rf "$BACKUP" 2>/dev/null || true
fi
hold_and_exit 0
