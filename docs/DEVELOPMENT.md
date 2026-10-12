# Calcivo - developer notes

Everything in this document is about building, releasing and extending Calcivo.
End users only need the [README](../README.md).

## Requirements

| Tool | Version |
| --- | --- |
| Node.js | 20 or newer |
| JDK | 21 (Android Gradle Plugin 8.13) |
| Android SDK | platform 36 + build-tools 36.0.0, `ANDROID_HOME` set |
| Python + Pillow | only to regenerate icons and splash screens |

## Build an APK locally

```bash
npm install
npm run apk            # developer APK
npm run apk:release    # release APK (release signed when a keystore is configured)
```

Output: `dist/Calcivo_<version>_<variant>.apk` plus a `.sha256` file.

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `BUILD_VARIANT` | `developer` | `developer` or `release` |
| `VERSION_NAME` | next version | explicit version, skips the bump |
| `VERSION_CODE` | derived | numeric Android version code |
| `WRITE_VERSION` | `0` | `1` stores the new version in `version.json` |
| `ANDROID_KEYSTORE_PATH` | - | keystore for release builds |
| `ANDROID_KEYSTORE_PASSWORD` | - | keystore password |
| `ANDROID_KEY_ALIAS` | - | key alias |
| `ANDROID_KEY_PASSWORD` | - | key password |

Without a keystore the release APK is signed with the debug key, so it still
installs on any device (it is not suitable for a store listing).

Other commands:

```bash
npm run dev         # build www/ and serve it on 0.0.0.0:5173, rebuild on change
npm test            # builds www/ and runs every test
npm run build:web   # bundle src/ into www/
npm run sync        # build + cap sync android
npm run icons       # regenerate launcher icons and splash screens
npm run version     # print the current version
npm run version:next  # print the version the next build would carry
```

## Version scheme

`version.json` at the root holds the version of the last build, in the compact
two digit form:

```json
{ "name": "Calcivo", "version": "1.0" }
```

Every build takes the next version in the sequence, one step at a time:

```
1.0 -> 1.1 -> 1.2 -> … -> 1.9 -> 2.0 -> 2.1 -> … -> 9.9 -> 10.0
```

Digits roll over at nine, so the version stays short and still increases
monotonically. `scripts/version.mjs` does the arithmetic, and the same rules are
implemented in `src/js/version.js` so the app can compare its own version with a
release without shipping a third party dependency.

The Android version code is derived from the version (`1.4` -> `10400`) and is
what Android uses internally to decide whether an APK is an upgrade.

```bash
node scripts/version.mjs                    # the version of the last build
node scripts/version.mjs next               # the version of the next build
node scripts/version.mjs next --from-tags --write   # what CI runs
node scripts/version.mjs code 1.4           # 10400
```

`--from-tags` compares `version.json` with the released git tags and continues
above the highest one, so a re-run or a manual release can never hand out a
version that already exists.

## Releases

The workflow [`.github/workflows/android-build.yml`](../.github/workflows/android-build.yml)
runs on demand (`Actions ▸ Build APK ▸ Run workflow`) and does the whole chain:

1. `node scripts/version.mjs next --from-tags --write` computes the new version.
2. Tests run, the web bundle is built and synced into the Android project.
3. Gradle assembles the APK with that version name and code.
4. The build is tagged `v<version>` (for example `v1.4`), and the moving
   `latest` tag is force pushed to the same commit.
5. A release is created with the title `Calcivo <version> — <date and time>`
   (for example `Calcivo 1.4 — 12 Oct 2026, 14:30 +06:00`), marked as the latest
   release, with these assets:
   - `Calcivo_<version>_<variant>.apk` — this build
   - `Calcivo-latest.apk` — a copy with a stable name, used by the in-app updater
   - `Calcivo_<version>_<variant>.apk.sha256` — checksum the app verifies against
6. `version.json` is committed back to the branch the workflow ran on, so the
   next run starts one step higher.

To also build on every push to `main`, uncomment the `push` trigger at the top
of the workflow.

### Signing

Android only installs an update when it is signed with the same key as the
installed app, so a stable key matters for the in-app updater.

- **Recommended** — create a keystore once and add these repository secrets:

  ```bash
  keytool -genkeypair -v -keystore release.keystore -alias calcivo \
    -keyalg RSA -keysize 2048 -validity 10000
  base64 -w0 release.keystore   # -> ANDROID_KEYSTORE_BASE64
  ```

  | Secret | Value |
  | --- | --- |
  | `ANDROID_KEYSTORE_BASE64` | `base64 -w0 release.keystore` |
  | `ANDROID_KEYSTORE_PASSWORD` | keystore password |
  | `ANDROID_KEY_ALIAS` | `calcivo` |
  | `ANDROID_KEY_PASSWORD` | key password |

- **Fallback** — without the secrets the workflow keeps a generated key in the
  Actions cache (`calcivo-ci-keystore-v1`) so consecutive builds stay compatible
  with each other. If that cache is evicted, the next build gets a new key and
  users have to uninstall once before installing.

## In-app updates

The update path is fully client side - no server is needed.

```
About sheet ─▶ src/js/update.js      GitHub API /repos/:owner/:repo/releases/latest
            ─▶ comparison with src/js/version.js
            ─▶ src/js/apk-updater.js  download with progress + checksum
            ─▶ ApkUpdaterPlugin.java  Android installer (FileProvider)
```

- `src/js/update.js` normalises the repository slug, picks the APK asset,
  compares versions numerically and returns a status of `update`, `current`,
  `no-releases`, `disabled` or `error`.
- `src/js/update-ui.js` is the state machine behind the About sheet:
  `idle -> checking -> available -> downloading -> ready -> installing`, plus the
  `permission`, `error` and `no-releases` branches. It is written against an
  injectable native bridge, which is how `tests/update-ui.test.mjs` drives the
  whole flow without a device.
- `android/app/src/main/java/io/github/jakariatanjim/calcivo/ApkUpdaterPlugin.java`
  streams the APK on a background thread, emits `downloadProgress` events and
  computes the SHA-256 while downloading. Installing goes through the
  `app.fileprovider` FileProvider, and
  `REQUEST_INSTALL_PACKAGES` is declared in the manifest.

The repository slug is baked into `www/version.json` at build time (from
`GITHUB_REPOSITORY`, or the git remote locally), so renaming the repository only
requires updating that value - GitHub keeps redirecting the old slug for old
installs.

## Project layout

```
src/                       web app source (this is what ships inside the APK)
  index.html               full screen app shell, calculator and About sheet
  styles.css               Material 3 dark theme, mobile layout
  manifest.webmanifest     PWA metadata
  js/engine.js             tokenizer, parser, evaluator, calculator state machine
  js/version.js            version parsing, comparison, bumping
  js/update.js             GitHub release lookup
  js/update-ui.js          About and update sheet state machine
  js/apk-updater.js        bridge to the native ApkUpdater plugin
  js/native.js             haptics, clipboard, hardware back button
  js/app.js                rendering, gestures, history, wiring
  icons/                   generated web icons
www/                       build output bundled into the APK (generated)
android/
  app/src/main/java/io/github/jakariatanjim/calcivo/
    MainActivity.java      immersive full screen shell
    ApkUpdaterPlugin.java  in-app update downloads and installs
  app/src/main/res/        icons, splash screens, themes
assets/generate-icons.py   draws every icon and splash image
scripts/build-web.mjs      esbuild bundler -> www/ plus build metadata
scripts/version.mjs        version arithmetic and CLI
scripts/dev-server.mjs     local development server
scripts/build-apk.sh       the `npm run apk` command
tests/                     engine, version, update, update flow and DOM tests
```

## Tests

```bash
npm test
```

- `tests/engine.test.mjs` - calculator engine: precedence, percent semantics,
  editing, errors, formatting.
- `tests/version.test.mjs` - version parsing, the bump sequence, version codes.
- `tests/update.test.mjs` - release lookup, asset selection, checksum matching,
  error handling.
- `tests/update-ui.test.mjs` - the update flow with a fake native bridge.
- `tests/ui.test.mjs` - jsdom smoke test of the production bundle: preview,
  history, sheets, keyboard, update badge.

## Icons

```bash
python3 assets/generate-icons.py   # or: npm run icons
```

Draws the launcher icons (legacy, round, adaptive, monochrome), the splash
screens for every density and the web icons from the same vector definition, so
the look stays consistent everywhere. The UI itself uses inline Material icons
only - the app contains no emoji.
