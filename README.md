<div align="center">

# CalcS NOTE: This is Test Project.

**A full screen calculator for Android that shows the answer before you press equals.**

![Version](https://img.shields.io/badge/version-1.0-8b5cff)
![Platform](https://img.shields.io/badge/platform-Android-3ddc84)
![Updates](https://img.shields.io/badge/updates-in--app-8b5cff)
![Licence](https://img.shields.io/badge/licence-MIT-8b5cff)

[**Download the newest APK**](https://github.com/jakariatanjim-svg/Calcivo/releases/latest)

</div>

---

## What is CalcS

CalcS is a finished, ready to install Android calculator. It fills the whole
screen - no distracting background - and it is built for the way people actually
calculate on a phone: type the whole expression, watch the answer appear, fix a
mistake without starting over.

When you need to keep an eye on a sum while you do something else, the two arrow
button on the left sends the calculator into a floating window above the other
app.

It works completely offline. Your history stays on your phone.

## Install

1. Open the newest [release](https://github.com/jakariatanjim-svg/Calcivo/releases/latest)
   on your Android phone and tap the `.apk` file (`CalcS_<version>_release.apk`).
   Every release carries exactly one APK, named after the version it contains.
2. When Android asks, allow installing apps from this source.
3. Open the downloaded file and tap **Install**.

CalcS needs Android 7.0 or newer. The floating window (picture in picture)
needs Android 8.0 or newer.

## Updating

You never have to come back to this page.

Open CalcS, tap the **three dot menu** in the top right corner, then **Settings**.
The version installed on your phone is shown there; press **Check for Update**.
CalcS asks GitHub for the newest release, compares it with that version and,
when a newer one exists:

- it shows the new version number and what changed,
- downloads the APK inside the app while a progress bar fills up (you can
  cancel at any time),
- verifies the download against the checksum published with the release,
- and opens the Android installer, so the update finishes inside CalcS.

Android may ask once for permission to install updates for CalcS. After that
the whole update is a few taps.

The app also checks quietly in the background each time it starts, and marks the
three dot button when something new is waiting.

## Using CalcS

| Action | How |
| --- | --- |
| Calculate | Type the full expression, for example `12 + 5 × 2`, then press `=` |
| See the answer early | Just keep typing - the preview chip under the result shows the answer while you type, so you almost never need `=` |
| Brackets | Tap the `(` `)` key in the extra row, it opens and closes groups for you |
| Percent | `200 + 10%` gives `220`, `200 × 10%` gives `20` |
| Square root, square, 1/x, π | Tap the **∑** button (or pick *Scientific* from the mode chip) to show the extra key row |
| Fix a mistake | Backspace (the key with the arrow) removes the last digit, then walks back through the expression |
| Keep a number | Tap `=` and continue with `+`, `−`, `×` or `÷` to keep calculating with the result |
| Copy a result | Long press the big number |
| Look back | Open the **three dot menu ▸ History** to see your last 50 results; tapping one loads it back |
| Calculator modes | The mode chip in the top left lists the modes: *Standard* and *Scientific* today, currency, unit converter and graphs are marked *Soon* |
| Floating window | The two arrow button on the far left puts the calculator in the Android floating window, so it can stay on screen above another app (Android 8+) |
| Settings | **Three dot menu ▸ Settings**: the installed version, *Check for Update*, *About CalcS*, the privacy note and this roadmap |
| Bigger screen? | A Bluetooth keyboard works too: numbers, `+ - * /`, `Enter`, `Backspace`, `Esc` |

### The preview, in short

Most calculators make you press `=` again and again to see where you are.
CalcS shows the running answer the moment your expression can be calculated:

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
  and only when you tap *Check for Update* or when the app starts.
- The full text is inside the app: **three dot menu ▸ Settings ▸ Privacy note**.

## New features coming soon

CalcS is being extended. On the way:

- Currency and money calculators, including different countries' currencies
- A unit and measurement converter
- Scientific functions and simple graphs
- Light and dark themes with accent colours
- Home screen widgets and quick tiles
- Export and share your calculation history

The roadmap is also visible inside the app: **three dot menu ▸ Settings ▸ About CalcS**.

---

<sub>CalcS is published under the [MIT licence](LICENSE).
Developer documentation - building, releasing and the version scheme - lives in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).</sub>
