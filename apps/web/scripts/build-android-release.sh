#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${WEB_DIR}/../.." && pwd)"
VERSION="${PLAINLIST_VERSION:-2.3.0}"
API_BASE="${VITE_API_BASE_URL:-}"
OUT_DIR="${WEB_DIR}/.android-release"
KEYPROPS="${WEB_DIR}/android-signing/keystore.properties"

if [[ -z "$API_BASE" ]]; then
  echo "error: VITE_API_BASE_URL is required for release APK (refusing empty API base)" >&2
  exit 1
fi

if [[ ! -f "$KEYPROPS" ]]; then
  echo "error: missing $KEYPROPS — see apps/web/android-signing/README.md" >&2
  exit 1
fi

if [[ ! -d "${WEB_DIR}/android" ]]; then
  echo "error: apps/web/android missing — run: (cd apps/web && npx cap add android)" >&2
  exit 1
fi

# Capacitor Android / AGP expect JDK 21+ for compileReleaseJavaWithJavac.
if [[ -z "${JAVA_HOME:-}" ]]; then
  for candidate in \
    /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
    /usr/libexec/java_home; do
    if [[ -x "${candidate}/bin/java" ]]; then
      export JAVA_HOME="$candidate"
      break
    fi
  done
fi
if command -v java >/dev/null 2>&1; then
  echo "[android-release] java: $(java -version 2>&1 | head -1)"
fi

if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" ]]; then
  if [[ -d /opt/homebrew/share/android-commandlinetools ]]; then
    export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
    export ANDROID_SDK_ROOT="$ANDROID_HOME"
  fi
fi

echo "[android-release] API_BASE=$API_BASE VERSION=$VERSION"
cd "$ROOT_DIR"
npm run build:shared
cd "$WEB_DIR"
VITE_API_BASE_URL="$API_BASE" npm run build
npx cap sync android

cd "${WEB_DIR}/android"
./gradlew assembleRelease

APK_SRC="${WEB_DIR}/android/app/build/outputs/apk/release/app-release.apk"
mkdir -p "$OUT_DIR"
APK_DST="${OUT_DIR}/PlainList-${VERSION}.apk"
cp "$APK_SRC" "$APK_DST"
shasum -a 256 "$APK_DST" | tee "${OUT_DIR}/PlainList-${VERSION}.apk.sha256"
echo "[android-release] wrote $APK_DST"
