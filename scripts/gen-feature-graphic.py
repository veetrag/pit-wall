#!/usr/bin/env python3
"""Play Store feature graphic, 1024x500, opaque (no alpha). Reuses the same
paint_background/paint_mark primitives as gen-app-icon.py so the listing
matches the game's own visual identity (src/styles/tokens.css).

Run from anywhere:
    python3 scripts/gen-feature-graphic.py
"""
import importlib.util
import os

from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# gen-app-icon.py's filename has a hyphen, so it isn't importable by name.
_spec = importlib.util.spec_from_file_location(
    "gen_app_icon", os.path.join(REPO_ROOT, "scripts", "gen-app-icon.py"))
gen_app_icon = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen_app_icon)

W, H = 1024, 500
SUPERSAMPLE = 3

# Avenir Next Condensed stands in for the brand's Rajdhani/Chakra Petch
# display face (not installed locally, and this graphic is marketing
# collateral rather than in-app UI, so an exact match isn't required the
# way it is for tokens.css consumers).
FONT_PATH = "/System/Library/Fonts/Avenir Next Condensed.ttc"
FONT_HEAVY = 8
FONT_DEMIBOLD = 2


def make():
    Wb, Hb = W * SUPERSAMPLE, H * SUPERSAMPLE
    bg = gen_app_icon.paint_background(max(Wb, Hb)).resize((max(Wb, Hb), max(Wb, Hb)), Image.LANCZOS)
    bg = bg.crop((0, (bg.height - Hb) // 2, Wb, (bg.height - Hb) // 2 + Hb))
    canvas = bg.resize((Wb, Hb), Image.LANCZOS).convert("RGB")
    d = ImageDraw.Draw(canvas)

    # mark, left-aligned, vertically centered
    mark_size = int(Hb * 0.62)
    mark = gen_app_icon.paint_mark(mark_size * gen_app_icon.SCALE).resize(
        (mark_size, mark_size), Image.LANCZOS)
    sub = mark.crop((int(mark_size * 30 / 108), int(mark_size * 22 / 108),
                      int(mark_size * 78 / 108), int(mark_size * 78 / 108)))
    mx = int(Wb * 0.09)
    my = (Hb - sub.height) // 2
    canvas.paste(sub, (mx, my), sub)

    # wordmark
    title_font = ImageFont.truetype(FONT_PATH, int(Hb * 0.225), index=FONT_HEAVY)
    sub_font = ImageFont.truetype(FONT_PATH, int(Hb * 0.072), index=FONT_DEMIBOLD)

    tx = mx + sub.width + int(Wb * 0.05)
    ty = int(Hb * 0.30)
    d.text((tx, ty), "PIT WALL", font=title_font, fill=(0xF2, 0xF5, 0xFF))

    sub_y = ty + int(Hb * 0.27)
    d.text((tx, sub_y), "RACE  STRATEGY  MANAGER", font=sub_font, fill=(0x00, 0xE5, 0xD0))

    return canvas.resize((W, H), Image.LANCZOS)


def main():
    img = make()
    out = os.path.join(REPO_ROOT, "store", "feature_graphic.png")
    img.save(out)
    print("wrote", out, img.size)


if __name__ == "__main__":
    main()
