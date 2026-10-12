#!/usr/bin/env bash
#
# Builds an installable CalcS APK on this machine.
#
#   npm run apk              developer APK (for testing, keeps the version)
#   npm run apk:release      release APK (release signed when a keystore is set)
#
# One build produces exactly one APK.
#
# The version comes from version.json:
#
#   * a developer build keeps the version that is already in version.json -
#     running test builds must never move the release counter, otherwise two
#     builds (a test and a release) can end up fighting over the same number.
#   * a release build takes the next version in the sequence
#     (1.0, 1.1, 1.2, ... 1.9, 2.0) and, with WRITE_VERSION=1, stores it back.
#
# GitHub Actions runs the same script; there the release build also commits the
# new version and publishes the single APK.
#
# Environment overrides:
#   BUILD_VARIANT     developer | release      (default: developer)
#   VERSION_NAME      explicit version         (default: see above)
#   VERSION_CODE      numeric version code     (default: derived from the version)
#   WRITE_VERSION     1 stores a new release version in version.json
#   ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
#
# Output: dist/CalcS_<version>_<variant>.apk (+ .sha256)

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
IS_RELEASE="0"
case "$VARIANT" in
  developer)
    TASK="assembleDeveloper"
    ;;
  release)
    TASK="assembleRelease"
    IS_RELEASE="1"
    ;;
  *)
    fail "Unknown BUILD_VARIANT '${VARIANT}' (expected developer or release)."
    ;;
esac

[ -d node_modules ] || npm ci

if [ -n "${VERSION_NAME:-}" ]; then
  VERSION="$VERSION_NAME"
elif [ "$IS_RELEASE" = "1" ]; then
  # A release build owns the version counter.
  if [ "${WRITE_VERSION:-0}" = "1" ]; then
    VERSION="$(node scripts/version.mjs next --write)"
  else
    VERSION="$(node scripts/version.mjs next)"
  fi
else
  # Developer builds are for testing on a phone: they never advance the
  # counter, so they cannot collide with a release build.
  VERSION="$(node scripts/version.mjs current)"
fi

VERSION_CODE="${VERSION_CODE:-$(node scripts/version.mjs code "$VERSION")}"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
APK_FILE="CalcS_${VERSION}_${VARIANT}.apk"

export BUILD_VERSION="$VERSION"
export BUILD_VARIANT="$VARIANT"
export BUILD_COMMIT="$COMMIT"
export BUILD_TIME="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

printf '\nBuilding CalcS\n'
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

# The APK is normally named app-<variant>.apk. A build type without a signing
# config would be written as app-<variant>-unsigned.apk instead, so the folder
# is searched as a fallback and a missing APK fails with a readable message
# rather than a bare `cp: cannot stat`.
APK_DIR="android/app/build/outputs/apk/${VARIANT}"
APK_SOURCE="${APK_DIR}/app-${VARIANT}.apk"

if [ ! -f "$APK_SOURCE" ]; then
  APK_SOURCE="$(find "$APK_DIR" -maxdepth 1 -name '*.apk' -type f -print -quit 2>/dev/null || true)"
fi

if [ -z "$APK_SOURCE" ] || [ ! -f "$APK_SOURCE" ]; then
  ls -la "$APK_DIR" 2>/dev/null || true
  fail "Gradle did not produce an APK in ${APK_DIR}."
fi

printf 'Using %s\n' "$APK_SOURCE"
cp "$APK_SOURCE" "dist/${APK_FILE}"

# One build, one APK. The checksum is what the in-app updater verifies.
if command -v sha256sum >/dev/null 2>&1; then
  (cd dist && sha256sum "$APK_FILE" > "${APK_FILE}.sha256")
fi

printf '\nAPK ready: dist/%s\n' "$APK_FILE"
if [ "$IS_RELEASE" = "1" ]; then
  printf 'Release version: %s (version.json %s)\n\n' "$VERSION" \
    "$([ "${WRITE_VERSION:-0}" = "1" ] && echo updated || echo unchanged)"
else
  printf 'Developer build: version %s was not advanced.\n\n' "$VERSION"
fi
