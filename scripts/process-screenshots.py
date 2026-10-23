#!/usr/bin/env python3
"""Crops the OS status bar and gesture-nav bar off raw device screenshots and
flattens them to opaque RGB, for Play Store listing screenshots.

Play requires 24-bit PNG/JPEG with no alpha, and the long edge no more than
2x the short edge; a raw 1080x2404 screenshot (2.226:1) is over that limit
once you count the system chrome the player never sees in normal use, so
cropping it is correction, not cosmetic.

The crop offsets below were measured for the Pixel this project ships to
(1080x2404, gesture nav) -- retake them if the recording device changes.

Run from anywhere:
    python3 scripts/process-screenshots.py          # raw -> store/screenshots
    python3 scripts/process-screenshots.py --16x9   # store/screenshots -> store/screenshots_16x9

--16x9 makes exact 9:16 (1080x1920) copies of the processed screenshots for
listings that want a 16:9 ratio. The UI is never cropped: each shot is scaled
down to fit 1920 tall and centred on the ink ground (#120E2B, --ink in
styles/tokens.css), so the side bars read as part of the app's own background.
It only reads store/screenshots, never screenshots_raw.
"""
import glob
import os
import sys

from PIL import Image

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(REPO_ROOT, "store", "screenshots_raw")
OUT_DIR = os.path.join(REPO_ROOT, "store", "screenshots")
OUT_16X9_DIR = os.path.join(REPO_ROOT, "store", "screenshots_16x9")

PORTRAIT_16X9 = (1080, 1920)
INK = (0x12, 0x0E, 0x2B)  # --ink

TOP_CROP = 110     # status bar (clock, signal, battery)
BOTTOM_CROP = 150  # gesture-nav pill / 3-button nav


def main():
    if not os.path.isdir(SRC_DIR):
        print(f"no {SRC_DIR} -- nothing to process")
        return
    os.makedirs(OUT_DIR, exist_ok=True)
    for path in sorted(glob.glob(os.path.join(SRC_DIR, "*.png"))):
        im = Image.open(path)
        w, h = im.size
        cropped = im.crop((0, TOP_CROP, w, h - BOTTOM_CROP)).convert("RGB")
        ratio = cropped.height / cropped.width
        assert ratio <= 2.0, f"{path}: {ratio:.3f} still exceeds Play's 2:1 limit"
        out = os.path.join(OUT_DIR, os.path.basename(path))
        cropped.save(out)
        print("wrote", out, cropped.size, f"ratio={ratio:.3f}")


def pad_16x9():
    os.makedirs(OUT_16X9_DIR, exist_ok=True)
    tw, th = PORTRAIT_16X9
    for path in sorted(glob.glob(os.path.join(OUT_DIR, "*.png"))):
        im = Image.open(path).convert("RGB")
        scale = min(tw / im.width, th / im.height)
        size = (round(im.width * scale), round(im.height * scale))
        fitted = im.resize(size, Image.LANCZOS) if size != im.size else im
        canvas = Image.new("RGB", PORTRAIT_16X9, INK)
        canvas.paste(fitted, ((tw - size[0]) // 2, (th - size[1]) // 2))
        out = os.path.join(OUT_16X9_DIR, os.path.basename(path))
        canvas.save(out, optimize=True)
        print("wrote", out, canvas.size, "content", size)


if __name__ == "__main__":
    if "--16x9" in sys.argv[1:]:
        pad_16x9()
    else:
        main()
