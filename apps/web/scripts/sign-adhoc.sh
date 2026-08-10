#!/bin/bash
# Ad-hoc sign a packaged PlainList.app (Electron) with hardened runtime.
set -euo pipefail
APP="${1:?usage: sign-adhoc.sh <PlainList.app>}"
ENT="$(cd "$(dirname "$0")" && pwd)/entitlements.mac.plist"
sign() { codesign --force --options runtime --entitlements "$ENT" --sign - "$@"; }

# 1) deepest helpers first
while IFS= read -r -d '' f; do sign "$f"; done < <(
  find "$APP/Contents/Frameworks" -type f -name 'chrome_crashpad_handler' -print0
)
while IFS= read -r -d '' f; do sign "$f"; done < <(
  find "$APP/Contents/Frameworks" -type f -name '*.dylib' -print0
)
while IFS= read -r -d '' f; do sign "$f"; done < <(
  find "$APP/Contents/Frameworks" -type f \( -name 'Mantle' -o -name 'ReactiveObjC' -o -name 'Squirrel' \) -print0
)
while IFS= read -r -d '' f; do sign "$f"; done < <(
  find "$APP/Contents/Frameworks" -type f -name 'Electron Framework' -print0
)

# 2) helper apps
for helper in "$APP"/Contents/Frameworks/*.app; do
  [[ -d "$helper" ]] || continue
  sign --deep "$helper"
done

# 3) frameworks
for fw in "$APP"/Contents/Frameworks/*.framework; do
  [[ -d "$fw" ]] || continue
  sign "$fw"
done

# 4) main exe
sign "$APP/Contents/MacOS/PlainList"

# 5) sync asar integrity
python3 - "$APP" <<'PY'
import hashlib, plistlib, pathlib, sys
app = pathlib.Path(sys.argv[1])
asar = app / 'Contents' / 'Resources' / 'app.asar'
h = hashlib.sha256(asar.read_bytes()).hexdigest()
pl_path = app / 'Contents' / 'Info.plist'
pl = plistlib.loads(pl_path.read_bytes())
pl['ElectronAsarIntegrity'] = {'Resources/app.asar': {'algorithm': 'SHA256', 'hash': h}}
pl.setdefault('NSCameraUsageDescription', 'PlainList 需要使用摄像头以运行 Focus Bay 专注检测。')
pl.setdefault('NSMicrophoneUsageDescription', 'PlainList 可能需要麦克风权限以支持插件功能。')
pl_path.write_bytes(plistlib.dumps(pl))
print('asar hash', h)
PY

# 6) bundle
sign "$APP"
codesign --verify --deep --strict "$APP"
codesign -dv --verbose=4 "$APP" 2>&1 | grep -E 'Identifier=|Signature=|flags=|TeamIdentifier='
echo "[sign-adhoc] ok: $APP"
