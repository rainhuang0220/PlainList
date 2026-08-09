#!/usr/bin/env python3
"""
Build a proper macOS .icns for PlainList.

Generates a 1024x1024 PNG icon with the PlainList visual language:
- Soft light-gray rounded square background
- 3 horizontal bars (list) in deep ink, with the middle one shorter / highlighted
  to evoke "today's focused task"
- Subtle drop shadow for depth

Then resizes to all the sizes macOS expects and packs them into an iconset
that iconutil converts to .icns.

The output is written to apps/web/build/icon.icns (or PNG intermediates).
"""
from PIL import Image, ImageDraw, ImageFilter
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
BUILD_DIR = os.path.join(ROOT, '..', 'build')
ICONSET_DIR = os.path.join(BUILD_DIR, 'icon.iconset')
OUTPUT_ICNS = os.path.join(BUILD_DIR, 'icon.icns')

# colors
BG_TOP = (247, 247, 247)      # #F7F7F7 from capacitor.config
BG_BOTTOM = (228, 228, 232)   # soft gray
INK = (28, 28, 32)            # near-black
INK_SOFT = (28, 28, 32, 200)  # for shadow

# canvas
SIZE = 1024
PAD = 120
CARD_RADIUS = 180

def make_base():
    """Create a soft light background card."""
    img = Image.new('RGB', (SIZE, SIZE), (255, 255, 255))
    # vertical gradient
    for y in range(SIZE):
        t = y / (SIZE - 1)
        r = int(BG_TOP[0] * (1 - t) + BG_BOTTOM[0] * t)
        g = int(BG_TOP[1] * (1 - t) + BG_BOTTOM[1] * t)
        b = int(BG_TOP[2] * (1 - t) + BG_BOTTOM[2] * t)
        ImageDraw.Draw(img).line([(0, y), (SIZE, y)], fill=(r, g, b))
    # rounded mask
    mask = Image.new('L', (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (PAD, PAD, SIZE - PAD, SIZE - PAD),
        radius=CARD_RADIUS,
        fill=255,
    )
    rounded = Image.new('RGB', (SIZE, SIZE), (255, 255, 255))
    rounded.paste(img, (0, 0), mask)
    return rounded


def draw_list(img):
    """Draw 3 horizontal list bars in the center."""
    draw = ImageDraw.Draw(img, 'RGBA')
    # layout: 3 bars, vertically centered, with horizontal padding
    cx = SIZE // 2
    bar_w_full = 520
    bar_w_short = 360
    bar_h = 64
    gap = 110
    top = (SIZE - (3 * bar_h + 2 * gap)) // 2

    # shadow (a soft offset duplicate)
    shadow = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    for i, w in enumerate([bar_w_full, bar_w_short, bar_w_full]):
        y = top + i * (bar_h + gap)
        x0 = cx - w // 2 + 6
        y0 = y + 8
        sd.rounded_rectangle((x0, y0, x0 + w, y0 + bar_h), radius=bar_h // 2, fill=(0, 0, 0, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=18))
    img.paste(shadow, (0, 0), shadow)

    # bars
    for i, w in enumerate([bar_w_full, bar_w_short, bar_w_full]):
        y = top + i * (bar_h + gap)
        x0 = cx - w // 2
        # middle bar gets the ink color, others soft
        fill = INK if i == 1 else (28, 28, 32, 90) if i == 0 else (28, 28, 32, 90)
        # opacity for non-middle: use RGBA via a separate layer
        layer = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        ld.rounded_rectangle((x0, y, x0 + w, y + bar_h), radius=bar_h // 2, fill=fill)
        img.paste(layer, (0, 0), layer)


def main():
    os.makedirs(BUILD_DIR, exist_ok=True)
    base = make_base()
    draw_list(base)
    base.save(os.path.join(BUILD_DIR, 'icon-1024.png'))

    # build iconset
    if os.path.exists(ICONSET_DIR):
        import shutil
        shutil.rmtree(ICONSET_DIR)
    os.makedirs(ICONSET_DIR, exist_ok=True)

    sizes = [
        ('icon_16x16.png', 16),
        ('icon_16x16@2x.png', 32),
        ('icon_32x32.png', 32),
        ('icon_32x32@2x.png', 64),
        ('icon_128x128.png', 128),
        ('icon_128x128@2x.png', 256),
        ('icon_256x256.png', 256),
        ('icon_256x256@2x.png', 512),
        ('icon_512x512.png', 512),
        ('icon_512x512@2x.png', 1024),
    ]
    src = Image.open(os.path.join(BUILD_DIR, 'icon-1024.png'))
    for name, size in sizes:
        s = src.resize((size, size), Image.LANCZOS)
        s.save(os.path.join(ICONSET_DIR, name))

    # convert to icns
    subprocess.run(['iconutil', '-c', 'icns', ICONSET_DIR, '-o', OUTPUT_ICNS], check=True)
    print(f'Wrote {OUTPUT_ICNS}')


if __name__ == '__main__':
    main()
