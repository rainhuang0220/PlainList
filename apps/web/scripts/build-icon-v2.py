#!/usr/bin/env python3
"""
Build PlainList v2 icon — minimal, meaningful, flat.

Concept: 5 horizontal bars, each shorter than the last.
Maps directly to the product's 5 time scales (year → month → week → day → now).
No 3D, no shadow, no gradient. Just ink on a soft card.

Output: 1024x1024 PNG + .icns at apps/web/build/icon.icns
"""
from PIL import Image, ImageDraw, ImageFont
import os, subprocess, shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
BUILD_DIR = os.path.join(ROOT, '..', 'build')
ICONSET_DIR = os.path.join(BUILD_DIR, 'icon.iconset')
OUTPUT_ICNS = os.path.join(BUILD_DIR, 'icon.icns')

# colors — flat, no gradient
BG = (245, 245, 247)        # soft off-white
INK = (28, 28, 32)          # near-black ink
SOFT = (28, 28, 32, 200)    # softer ink for the "now" indicator

SIZE = 1024
PAD = 96                    # square card padding inside the icon
RADIUS = 192                # rounded corner

# 5 time scales: year / month / week / day / now
# Decreasing width. All same height, same gap.
BAR_H = 56
GAP = 84
WIDTHS = [780, 640, 500, 360, 220]


def rounded_card(size, bg, pad, radius):
    """Solid rounded-square card, no gradient."""
    img = Image.new('RGB', (size, size), (255, 255, 255))
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (pad, pad, size - pad, size - pad),
        radius=radius,
        fill=255,
    )
    card = Image.new('RGB', (size, size), bg)
    out = Image.new('RGB', (size, size), (255, 255, 255))
    out.paste(card, (0, 0), mask)
    return out


def draw_time_scales(card):
    """5 horizontal bars, decreasing length, centered."""
    layer = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    cx = SIZE // 2
    # vertically center the whole stack
    total_h = 5 * BAR_H + 4 * GAP
    top = (SIZE - total_h) // 2

    for i, w in enumerate(WIDTHS):
        x0 = cx - w // 2
        y = top + i * (BAR_H + GAP)
        d.rounded_rectangle((x0, y, x0 + w, y + BAR_H),
                            radius=BAR_H // 2, fill=INK)
    card.paste(layer, (0, 0), layer)


def draw_now_dot(card):
    """A small dot at the right tip of the shortest bar — 'this moment'."""
    layer = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx = SIZE // 2
    total_h = 5 * BAR_H + 4 * GAP
    top = (SIZE - total_h) // 2
    w = WIDTHS[-1]
    y = top + 4 * (BAR_H + GAP) + BAR_H // 2
    x = cx + w // 2 + 24
    d.ellipse((x - 18, y - 18, x + 18, y + 18), fill=INK)
    card.paste(layer, (0, 0), layer)


def main():
    os.makedirs(BUILD_DIR, exist_ok=True)
    card = rounded_card(SIZE, BG, PAD, RADIUS)
    draw_time_scales(card)
    draw_now_dot(card)

    # preview
    card.save(os.path.join(BUILD_DIR, 'icon-preview-v2.png'))

    # master 1024
    card.save(os.path.join(BUILD_DIR, 'icon-1024.png'))

    # iconset
    if os.path.exists(ICONSET_DIR):
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
        src.resize((size, size), Image.LANCZOS).save(os.path.join(ICONSET_DIR, name))

    subprocess.run(['iconutil', '-c', 'icns', ICONSET_DIR, '-o', OUTPUT_ICNS], check=True)
    print(f'Wrote {OUTPUT_ICNS}')


if __name__ == '__main__':
    main()
