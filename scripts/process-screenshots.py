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
    python3 scripts/process-screenshots.py
"""
import glob
import os

from PIL import Image

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(REPO_ROOT, "store", "screenshots_raw")
OUT_DIR = os.path.join(REPO_ROOT, "store", "screenshots")

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


if __name__ == "__main__":
    main()
