#!/usr/bin/env python3
"""
Regenerates the Android app icon, adaptive-icon foreground, Play Store
listing icon, and splash screens from the game's own design tokens
(src/styles/tokens.css) rather than the stock Capacitor/Android defaults.

Mark: three ascending rev-counter bars, teal -> teal -> warm red, echoing the
tyre-cliff gauge language from CLAUDE.md section 6.2 ("a living gauge that
shifts colour teal -> amber -> hot red"). Background: a deep navy gradient
with two faint floodlight glow points, echoing the "Pit Wall at Night"
aesthetic (section 6.1) already used in src/ui/MainMenu.tsx's AmbientHero.

Everything is rendered at 8x supersample and downsampled with LANCZOS for
clean edges without any external rasterizer (no rsvg-convert/inkscape/sharp
assumed to be installed). Requires: pillow, numpy.

Run from anywhere:
    python3 scripts/gen-app-icon.py
"""
import os

import numpy as np
from PIL import Image, ImageDraw

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES_ROOT = os.path.join(REPO_ROOT, "android", "app", "src", "main", "res")

# --- design tokens (src/styles/tokens.css) ---
BG_DEEP = (0x0A, 0x0E, 0x1A)
BG_PANEL = (0x12, 0x18, 0x29)
ACCENT = (0x00, 0xE5, 0xD0)
ACCENT_WARM = (0xFF, 0x4D, 0x5E)

SCALE = 8
CANVAS = 108 * SCALE  # adaptive-icon viewport is 108x108dp


def paint_background(size=CANVAS):
    """Deep navy vertical gradient + two faint floodlight glows, matching
    the AmbientHero motif. SPLASH SCREENS ONLY -- no launcher tile or store
    icon uses it, because the adaptive background layer is a flat
    colour (values/ic_launcher_background.xml) that Android composites live
    with masking and parallax. Putting this gradient on an icon is what made
    the store listing differ from the app; see composite_as_masked."""
    ramp = np.linspace(0.0, 1.0, size).reshape(size, 1)
    a = np.array(BG_DEEP, dtype=np.float64)
    b = np.array(BG_PANEL, dtype=np.float64)
    grad = a + (b - a) * ramp  # (size, 3), varies by row only
    grad_rows = np.repeat(grad[:, np.newaxis, :], size, axis=1)  # (size, size, 3)
    # Deterministic dither to break 8-bit banding on a very tall, low-contrast
    # gradient (visible on the splash's ~2000px portrait crops). A fixed seed
    # keeps every regeneration byte-identical.
    rng = np.random.default_rng(20260823)
    noise = rng.uniform(-1.5, 1.5, size=(size, size, 1))
    grad_rows = np.clip(grad_rows + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(grad_rows, mode="RGB")

    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for (gx, gy, r, alpha) in [
        (size * 0.16, size * 0.14, size * 0.22, 46),
        (size * 0.86, size * 0.12, size * 0.20, 40),
    ]:
        steps = 24
        for i in range(steps, 0, -1):
            t = i / steps
            a = int(alpha * (1 - t) ** 2)
            rr = r * t
            gd.ellipse([gx - rr, gy - rr, gx + rr, gy + rr], fill=(0xF2, 0xC9, 0x4C, a))
    img.paste(glow, (0, 0), glow)
    return img.convert("RGB")


def paint_mark(size=CANVAS):
    """Three ascending rev-counter bars on a transparent canvas, in the
    108-unit adaptive-icon coordinate space scaled by `size / 108`. Kept
    within the ~60dp safe-zone circle so no launcher mask clips it —
    verified against Android's circular mask in review."""
    u = size / 108
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    bars = [
        # (x0, width, height, color)
        (30, 12, 22, ACCENT),
        (48, 12, 34, ACCENT),
        (66, 12, 46, ACCENT_WARM),
    ]
    baseline = 74
    for x0, w, h, color in bars:
        x1 = x0 + w
        y1 = baseline
        y0 = baseline - h
        d.rounded_rectangle(
            [x0 * u, y0 * u, x1 * u, y1 * u],
            radius=(w / 2) * u,
            fill=color,
        )
    return img


def composite_as_masked(px_size):
    """What an Android 8+ launcher ACTUALLY draws, reproduced exactly.

    THE SINGLE SOURCE for every square icon we ship: the Play Store listing
    icon, `ic_launcher.png`, and (circle-masked) `ic_launcher_round.png`. They
    must all agree, because Play policy requires the listing icon to match the
    app's own icon and the listing was rejected in Sept 2026 for exactly that.

    Two things make the adaptive rendering differ from a naive full-canvas
    composite, and the code this replaced accounted for neither:

    1. THE MASK CROPS. Adaptive layers are 108dp but only the centre 72dp
       survives masking -- the outer 18dp ring is reserved for parallax and is
       never visible. Cropping to it and scaling up takes the mark from 44% of
       the tile to 66%. That 1.5x is the difference that got flagged.
       The 66% mark still clears the circular mask used for
       `ic_launcher_round.png`: its furthest reach from the tile centre is
       32.91 of 36 units, an 8.6% margin (rounded bar ends, so the reach is
       less than the bounding box suggests).
    2. THE BACKGROUND IS FLAT. The adaptive background layer is a solid colour
       (values/ic_launcher_background.xml, #0A0E1A). `paint_background`'s
       gradient and floodlight glows are real on the splash, which we render
       ourselves, but they never reach a launcher tile.
    """
    out = Image.new("RGBA", (px_size, px_size), BG_DEEP + (255,))
    hi = px_size * SCALE
    full = paint_mark(hi)
    inset = round(hi * 18 / 108)          # the 18dp the mask eats on each side
    visible = full.crop((inset, inset, hi - inset, hi - inset))
    out.alpha_composite(visible.resize((px_size, px_size), Image.LANCZOS))
    return out


def circle_mask(img):
    size = img.size[0]
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    out = img.copy()
    out.putalpha(mask)
    return out


DENSITIES = {
    "mdpi": 1.0,
    "hdpi": 1.5,
    "xhdpi": 2.0,
    "xxhdpi": 3.0,
    "xxxhdpi": 4.0,
}
LEGACY_BASE = 48   # ic_launcher.png / ic_launcher_round.png at mdpi
FG_BASE = 108      # ic_launcher_foreground.png at mdpi (dp == px at mdpi)

# Splash screens. Portrait is what ships (MainActivity is locked
# android:screenOrientation="portrait"); the landscape variants are
# regenerated too so no mismatched stock asset is left in the tree.
SPLASH_TARGETS = {
    "drawable/splash.png": (480, 320),
    "drawable-land-mdpi/splash.png": (480, 320),
    "drawable-land-hdpi/splash.png": (800, 480),
    "drawable-land-xhdpi/splash.png": (1280, 720),
    "drawable-land-xxhdpi/splash.png": (1600, 960),
    "drawable-land-xxxhdpi/splash.png": (1920, 1280),
    "drawable-port-mdpi/splash.png": (320, 480),
    "drawable-port-hdpi/splash.png": (480, 800),
    "drawable-port-xhdpi/splash.png": (720, 1280),
    "drawable-port-xxhdpi/splash.png": (960, 1600),
    "drawable-port-xxxhdpi/splash.png": (1280, 1920),
}


def write(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    print("wrote", path, img.size)


def make_splash(w, h):
    W, H = w * 4, h * 4  # supersample, then downsample for AA
    bg = paint_background(max(W, H)).resize((max(W, H), max(W, H)), Image.LANCZOS)
    bg = bg.crop(((bg.width - W) // 2, 0, (bg.width - W) // 2 + W, H)) if bg.height >= H else bg.resize((W, H))
    canvas = Image.new("RGB", (W, H))
    canvas.paste(bg.resize((W, H)), (0, 0))

    mark_unit = min(W, H) * 0.34  # mark's 108-unit box scaled to this many px
    mark = paint_mark(int(mark_unit * SCALE)).resize((int(mark_unit), int(mark_unit)), Image.LANCZOS)
    # paint_mark's bars sit within roughly x:[30,78] y:[24,78] of a 108 box;
    # recentre that sub-box rather than the full transparent canvas
    sub = mark.crop((int(mark_unit * 30 / 108), int(mark_unit * 24 / 108),
                      int(mark_unit * 78 / 108), int(mark_unit * 78 / 108)))
    ox = (W - sub.width) // 2
    oy = (H - sub.height) // 2
    canvas.paste(sub, (ox, oy), sub)
    return canvas.resize((w, h), Image.LANCZOS)


def main():
    for name, scale in DENSITIES.items():
        folder = os.path.join(RES_ROOT, f"mipmap-{name}")

        # composite_as_masked, NOT a full-canvas composite: a pre-API26 launcher
        # draws this square as-is, so for it to look like the same app as the
        # adaptive icon the mark must already be at the post-mask 66% scale on
        # the flat background. minSdk is 24, so Android 7.0-7.1 sees these.
        legacy_px = round(LEGACY_BASE * scale)
        square = composite_as_masked(legacy_px)
        write(square, os.path.join(folder, "ic_launcher.png"))
        write(circle_mask(square), os.path.join(folder, "ic_launcher_round.png"))

        fg_px = round(FG_BASE * scale)
        fg = paint_mark(fg_px * SCALE).resize((fg_px, fg_px), Image.LANCZOS)
        write(fg, os.path.join(folder, "ic_launcher_foreground.png"))

    # Play Store listing icon, 512x512, no alpha (Play requires opaque PNG).
    # Same composite_as_masked the launcher icons use, so the listing icon and
    # the installed icon cannot drift apart again. See that function.
    store_icon = composite_as_masked(512).convert("RGB")
    write(store_icon, os.path.join(REPO_ROOT, "store", "icon_512.png"))

    for rel, (w, h) in SPLASH_TARGETS.items():
        write(make_splash(w, h), os.path.join(RES_ROOT, rel))


if __name__ == "__main__":
    main()
