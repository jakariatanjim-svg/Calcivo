#!/usr/bin/env python3
"""Draws every icon and splash image used by CalcS.

    python3 assets/generate-icons.py

Art direction: a vivid violet gradient surface with a clean white calculator
card on top. The display panel and the keys are punched out of the card, so the
gradient shows through them - the mark stays readable from 48 px launcher icons
up to the 512 px store image.

Writes:
  android/app/src/main/res/mipmap-*/ic_launcher.png             legacy launcher icon
  android/app/src/main/res/mipmap-*/ic_launcher_round.png       round launcher icon
  android/app/src/main/res/mipmap-*/ic_launcher_foreground.png  adaptive foreground layer
  android/app/src/main/res/mipmap-*/ic_launcher_monochrome.png  themed icon layer
  android/app/src/main/res/drawable*/splash.png                 launch screens
  src/icons/*.png                                               web and PWA icons

Requires Pillow:  pip install pillow
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:  # pragma: no cover
    sys.exit("Pillow is required:  pip install pillow")

ROOT = Path(__file__).resolve().parents[1]
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"
WEB_ICONS = ROOT / "src" / "icons"

SUPERSAMPLE = 4

# Brand palette, matches the gradient in src/styles.css
GRADIENT_START = (139, 92, 255)   # #8b5cff
GRADIENT_END = (67, 34, 201)      # #4322c9
SPLASH_BACKGROUND = (20, 18, 24)  # #141218
MARK = (255, 255, 255)

# Geometry of the mark, relative to the square that holds it.
CARD = (0.275, 0.175, 0.725, 0.825)
CARD_RADIUS = 0.100
DISPLAY = (0.350, 0.265, 0.650, 0.375)
DISPLAY_RADIUS = 0.032
KEY_COLUMNS = (0.395, 0.500, 0.605)
KEY_ROWS = (0.515, 0.660)
KEY_RADIUS = 0.030

DENSITIES = {
    "mdpi": 1.0,
    "hdpi": 1.5,
    "xhdpi": 2.0,
    "xxhdpi": 3.0,
    "xxxhdpi": 4.0,
}

SPLASH_SIZES = {
    "drawable": (480, 320),
    "drawable-port-mdpi": (320, 480),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
}

GRADIENT_CACHE: dict[int, Image.Image] = {}


def gradient(px: int) -> Image.Image:
    """Diagonal violet gradient with a soft light from the top left."""
    if px in GRADIENT_CACHE:
        return GRADIENT_CACHE[px]

    base = 1024
    canvas = Image.new("RGB", (base, base))
    pixels = canvas.load()
    denominator = (base - 1) * 2
    for y in range(base):
        for x in range(base):
            ratio = (x + y) / denominator
            pixels[x, y] = (
                round(GRADIENT_START[0] + (GRADIENT_END[0] - GRADIENT_START[0]) * ratio),
                round(GRADIENT_START[1] + (GRADIENT_END[1] - GRADIENT_START[1]) * ratio),
                round(GRADIENT_START[2] + (GRADIENT_END[2] - GRADIENT_START[2]) * ratio),
            )

    # soft highlight in the upper area
    glow = Image.new("L", (base, base), 0)
    ImageDraw.Draw(glow).ellipse(
        [-base * 0.35, -base * 0.75, base * 1.35, base * 0.55], fill=70
    )
    glow = glow.filter(ImageFilter.GaussianBlur(base * 0.12))
    canvas = Image.composite(Image.new("RGB", (base, base), (255, 255, 255)), canvas, glow.point(lambda v: v // 3))

    # gentle vignette at the bottom right
    shade = Image.new("L", (base, base), 0)
    ImageDraw.Draw(shade).ellipse(
        [base * 0.1, base * 0.45, base * 1.5, base * 1.6], fill=90
    )
    shade = shade.filter(ImageFilter.GaussianBlur(base * 0.15))
    canvas = Image.composite(Image.new("RGB", (base, base), GRADIENT_END), canvas, shade.point(lambda v: v // 4))

    sized = canvas.resize((px, px), Image.LANCZOS)
    GRADIENT_CACHE[px] = sized
    return sized


def mark_mask(px: int) -> Image.Image:
    """Alpha mask of the calculator card with its display and keys punched out."""
    size = px * SUPERSAMPLE
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)

    def box(rect):
        return [rect[0] * size, rect[1] * size, rect[2] * size, rect[3] * size]

    draw.rounded_rectangle(box(CARD), radius=CARD_RADIUS * size, fill=255)
    draw.rounded_rectangle(box(DISPLAY), radius=DISPLAY_RADIUS * size, fill=0)

    radius = KEY_RADIUS * size
    for row in KEY_ROWS:
        for column in KEY_COLUMNS:
            center_x = column * size
            center_y = row * size
            draw.ellipse(
                [center_x - radius, center_y - radius, center_x + radius, center_y + radius],
                fill=0,
            )

    return mask.resize((px, px), Image.LANCZOS)


def mark(px: int, color: tuple[int, int, int] = MARK) -> Image.Image:
    """The calculator card as a transparent PNG in the given colour."""
    layer = Image.new("RGBA", (px, px), color + (255,))
    layer.putalpha(mark_mask(px))
    return layer


def rounded_mask(px: int, radius_ratio: float) -> Image.Image:
    size = px * SUPERSAMPLE
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=size * radius_ratio, fill=255
    )
    return mask.resize((px, px), Image.LANCZOS)


def circle_mask(px: int) -> Image.Image:
    size = px * SUPERSAMPLE
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    return mask.resize((px, px), Image.LANCZOS)


def icon(px: int, *, circular: bool = False, mark_scale: float = 0.88) -> Image.Image:
    """Full bleed launcher icon: gradient surface plus the white card."""
    layer = gradient(px).convert("RGBA")

    mark_px = max(8, round(px * mark_scale))
    card = mark(mark_px)

    # soft shadow so the card lifts off the gradient
    shadow = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    shadow_mask = card.split()[3].resize((mark_px, mark_px), Image.LANCZOS)
    shadow_layer = Image.new("RGBA", (mark_px, mark_px), (20, 6, 60, 120))
    shadow_layer.putalpha(shadow_mask)
    offset = max(1, round(px * 0.012))
    shadow.alpha_composite(shadow_layer, ((px - mark_px) // 2, (px - mark_px) // 2 + offset))
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(1, px * 0.018)))
    layer.alpha_composite(shadow)

    layer.alpha_composite(card, ((px - mark_px) // 2, (px - mark_px) // 2))
    layer.putalpha(circle_mask(px) if circular else rounded_mask(px, 0.235))
    return layer


def foreground(px: int, color: tuple[int, int, int] = MARK, scale: float = 0.66) -> Image.Image:
    """Adaptive icon layer: transparent with the card inside the safe zone."""
    layer = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    mark_px = max(8, round(px * scale))
    layer.alpha_composite(mark(mark_px, color), ((px - mark_px) // 2, (px - mark_px) // 2))
    return layer


def splash(width: int, height: int) -> Image.Image:
    canvas = Image.new("RGB", (width, height), SPLASH_BACKGROUND)
    icon_px = int(min(width, height) * 0.30)
    badge = icon(icon_px)
    canvas.paste(badge, ((width - icon_px) // 2, (height - icon_px) // 2), badge)
    return canvas


def main() -> None:
    for density, scale in DENSITIES.items():
        target = ANDROID_RES / f"mipmap-{density}"
        target.mkdir(parents=True, exist_ok=True)

        legacy = int(48 * scale)
        icon(legacy).save(target / "ic_launcher.png")
        icon(legacy, circular=True).save(target / "ic_launcher_round.png")

        adaptive = int(108 * scale)
        foreground(adaptive).save(target / "ic_launcher_foreground.png")
        foreground(adaptive, (255, 255, 255)).save(target / "ic_launcher_monochrome.png")

    for folder, (width, height) in SPLASH_SIZES.items():
        target = ANDROID_RES / folder
        target.mkdir(parents=True, exist_ok=True)
        splash(width, height).save(target / "splash.png")

    WEB_ICONS.mkdir(parents=True, exist_ok=True)
    icon(32).save(WEB_ICONS / "favicon.png")
    icon(180).save(WEB_ICONS / "apple-touch-icon.png")
    icon(192).save(WEB_ICONS / "icon-192.png")
    icon(512).save(WEB_ICONS / "icon-512.png")
    icon(512, mark_scale=0.62).save(WEB_ICONS / "maskable-512.png")

    print(f"icons written to {ANDROID_RES} and {WEB_ICONS}")


if __name__ == "__main__":
    main()
