#!/usr/bin/env bash
# Fail the macOS release if the .app is only linker-signed.
# That signature is what Gatekeeper reports as “文件已损坏，无法打开”
# after a web download. A valid ad-hoc bundle must verify and seal resources.
set -euo pipefail

APP="${1:?usage: verify-macos-app.sh <PlainList.app>}"

if [[ ! -d "$APP" ]]; then
  echo "verify-macos-app: missing app at $APP" >&2
  exit 1
fi

if ! codesign --verify --deep --strict "$APP"; then
  echo "verify-macos-app: codesign --verify --deep --strict failed" >&2
  exit 1
fi

info="$(codesign -dv --verbose=2 "$APP" 2>&1)"
echo "$info"

if grep -q 'linker-signed' <<<"$info"; then
  echo "verify-macos-app: linker-signed ad-hoc is not a distributable bundle signature" >&2
  exit 1
fi

if ! grep -q 'Identifier=com.plainlist.app' <<<"$info"; then
  echo "verify-macos-app: Identifier must be com.plainlist.app, not Electron" >&2
  exit 1
fi

if ! grep -q 'Sealed Resources version=' <<<"$info"; then
  echo "verify-macos-app: missing sealed resources" >&2
  exit 1
fi

echo "[verify-macos-app] ok: $APP"
