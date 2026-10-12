<div align="center">

# Calcivo

**A full screen calculator for Android that shows the answer before you press equals.**

![Version](https://img.shields.io/badge/version-1.0-8b5cff)
![Platform](https://img.shields.io/badge/platform-Android-3ddc84)
![Updates](https://img.shields.io/badge/updates-in--app-8b5cff)

[**Download the latest APK**](https://github.com/jakariatanjim-svg/test/releases/latest/download/Calcivo-latest.apk)

</div>

---

## What is Calcivo

Calcivo is a finished, ready to install Android calculator. It fills the whole
screen - no floating window, no distracting background - and it is built for the
way people actually calculate on a phone: type the whole expression, watch the
answer appear, fix a mistake without starting over.

It works completely offline. Your history stays on your phone.

## Install

1. Tap **[Download the latest APK](https://github.com/jakariatanjim-svg/test/releases/latest/download/Calcivo-latest.apk)**
   on your Android phone, or open the newest release on the
   [releases page](https://github.com/jakariatanjim-svg/test/releases/latest)
   and pick the `.apk` file.
2. When Android asks, allow installing apps from this source.
3. Open the downloaded file and tap **Install**.

Calcivo needs Android 7.0 or newer.

## Updating

You never have to come back to this page.

Open Calcivo, tap the **info button** in the top right corner and press
**Check for updates**. Calcivo asks GitHub for the newest release, compares it
with the version installed on your phone and, when a newer one exists:

- it shows the new version number and what changed,
- downloads the APK inside the app while a progress bar fills up (you can
  cancel at any time),
- verifies the download against the checksum published with the release,
- and opens the Android installer, so the update finishes inside Calcivo.

Android may ask once for permission to install updates for Calcivo. After that
the whole update is a few taps.

The app also checks quietly in the background each time it starts, and marks the
info button when something new is waiting.

## Using Calcivo

| Action | How |
| --- | --- |
| Calculate | Type the full expression, for example `12 + 5 × 2`, then press `=` |
| See the answer early | Just keep typing - the preview chip under the result shows the answer while you type, so you almost never need `=` |
| Brackets | Tap the `(` `)` key in the extra row, it opens and closes groups for you |
| Percent | `200 + 10%` gives `220`, `200 × 10%` gives `20` |
| Square root, square, 1/x, π | Toggle the extra key row with the button next to the app title |
| Fix a mistake | Backspace (the key with the arrow) removes the last digit, then walks back through the expression |
| Keep a number | Tap `=` and continue with `+`, `−`, `×` or `÷` to keep calculating with the result |
| Copy a result | Long press the big number |
| Look back | The history button opens your last 50 results; tapping one loads it back |
| Bigger screen? | A Bluetooth keyboard works too: numbers, `+ - * /`, `Enter`, `Backspace`, `Esc` |

### The preview, in short

Most calculators make you press `=` again and again to see where you are.
Calcivo shows the running answer the moment your expression can be calculated:

```
expression:   12 + 5 × 2
preview:      = 22
```

It respects the usual order of operations and warns you early if something is
not calculable, for example `8 ÷ 0`.

## Privacy

- No account, no tracking, no ads.
- Calculations and history never leave the device.
- The only network request the app makes is the version check against GitHub,
  and only when you tap *Check for updates* or when the app starts.

## New features coming soon

Calcivo is being extended. On the way:

- Currency and money calculators, including different countries' currencies
- A unit and measurement converter
- Scientific functions and simple graphs
- Light and dark themes with accent colours
- Home screen widgets and quick tiles
- Export and share your calculation history

The roadmap is also visible inside the app, under **About**.

---

<sub>Developer documentation - building, releasing and the version scheme - lives in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).</sub>
