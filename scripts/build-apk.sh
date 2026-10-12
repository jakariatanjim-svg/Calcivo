#!/usr/bin/env bash
#
# Builds an installable Calcivo APK on this machine.
#
#   npm run apk              developer APK
#   npm run apk:release      release APK (release signed when a keystore is set)
#
# The version is read from version.json and every build takes the next one in
# the sequence (1.0, 1.1, 1.2, ... 1.9, 2.0), so no two builds share a version.
# GitHub Actions runs the same script and also commits the new version back.
#
# Environment overrides:
#   BUILD_VARIANT     developer | release      (default: developer)
#   VERSION_NAME      explicit version         (default: next version)
#   VERSION_CODE      numeric version code     (default: derived from the version)
#   WRITE_VERSION     1 to store the new version in version.json
#   ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
#
# Output: dist/Calcivo_<version>_<variant>.apk (+ .sha256)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() {
  printf '\n  %s\n\n' "$1" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "Node.js is required. Install Node 20 or newer."

if [ -z "${JAVA_HOME:-}" ] && ! command -v java >/dev/null 2>&1; then
  fail "No JDK found. Android Gradle Plugin 8.13 needs JDK 21 - install one and set JAVA_HOME."
fi

if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
  fail "ANDROID_HOME / ANDROID_SDK_ROOT is not set. Install the Android command line tools and set ANDROID_HOME."
fi

VARIANT="${BUILD_VARIANT:-developer}"
case "$VARIANT" in
  developer) TASK="assembleDeveloper" ;;
  release) TASK="assembleRelease" ;;
  *) fail "Unknown BUILD_VARIANT '${VARIANT}' (expected developer or release)." ;;
esac

[ -d node_modules ] || npm ci

if [ -n "${VERSION_NAME:-}" ]; then
  VERSION="$VERSION_NAME"
else
  if [ "${WRITE_VERSION:-0}" = "1" ]; then
    VERSION="$(node scripts/version.mjs next --write)"
  else
    VERSION="$(node scripts/version.mjs next)"
  fi
fi

VERSION_CODE="${VERSION_CODE:-$(node scripts/version.mjs code "$VERSION")}"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
APK_FILE="Calcivo_${VERSION}_${VARIANT}.apk"

export BUILD_VERSION="$VERSION"
export BUILD_VARIANT="$VARIANT"
export BUILD_COMMIT="$COMMIT"
export BUILD_TIME="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

printf '\nBuilding Calcivo\n'
printf '  version : %s\n' "$VERSION"
printf '  code    : %s\n' "$VERSION_CODE"
printf '  variant : %s\n' "$VARIANT"
printf '  commit  : %s\n\n' "$COMMIT"

npm run build:web
npx cap sync android

(
  cd android
  ./gradlew --no-daemon ":app:${TASK}" \
    "-PappVersionName=${VERSION}" \
    "-PappVersionCode=${VERSION_CODE}"
)

mkdir -p dist
cp "android/app/build/outputs/apk/${VARIANT}/app-${VARIANT}.apk" "dist/${APK_FILE}"

if command -v sha256sum >/dev/null 2>&1; then
  (cd dist && sha256sum "$APK_FILE" > "${APK_FILE}.sha256")
  # Same stable name the release uses, so the updater can verify a local build too.
  cp "dist/$APK_FILE" "dist/Calcivo-latest.apk"
  (cd dist && sha256sum "Calcivo-latest.apk" > "Calcivo-latest.apk.sha256")
fi

printf '\nAPK ready: dist/%s\n\n' "$APK_FILE"
