#!/usr/bin/env python3
"""
PlainList v3 icon — single letter only. No decoration, no "meaningful" dots.

Generates TWO candidate 1024x1024 PNGs:
  - v3-P.png   : single bold "P"
  - v3-PL.png  : "PL" monogram, tight kerning

Background: warm cream (#F5F0E8) — feels like book paper.
Letter: deep ink (#1C1C20).
Font: Avenir Next / Avenir — geometric, confident, has personality.

No shadow, no gradient, no symbol. The letter IS the mark.
"""
from PIL import Image, ImageDraw, ImageFont
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
BUILD_DIR = os.path.join(ROOT, '..', 'build')

BG = (245, 240, 232)       # warm cream
INK = (28, 28, 32)          # deep ink

SIZE = 1024
PAD = 96

# font candidates in order of preference
FONT_CANDIDATES = [
    '/System/Library/Fonts/Avenir.ttc',
    '/System/Library/Fonts/Avenir Next.ttc',
    '/System/Library/Fonts/Helvetica.ttc',
    '/System/Library/Fonts/SFNS.ttf',
    '/Library/Fonts/Arial.ttf',
]


def find_font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    raise RuntimeError('no font found')


def base_canvas():
    img = Image.new('RGB', (SIZE, SIZE), BG)
    return img


def draw_centered_text(img, text, font_size, font_path):
    """Use a transient font to measure, then center precisely."""
    font = ImageFont.truetype(font_path, font_size)
    layer = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    bbox = d.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (SIZE - tw) // 2 - bbox[0]
    # optical center: shift up slightly (typographic ascender hangs above cap height)
    y = (SIZE - th) // 2 - bbox[1] - int(font_size * 0.04)
    d.text((x, y), text, font=font, fill=INK)
    img.paste(layer, (0, 0), layer)


def candidate_single_p():
    img = base_canvas()
    draw_centered_text(img, 'P', 720, FONT_CANDIDATES[0])
    img.save(os.path.join(BUILD_DIR, 'v3-P.png'))
    return img


def candidate_pl():
    """PL monogram — two letters, very tight kerning, large."""
    img = base_canvas()
    # draw 'PL' as two text passes, then offset L slightly to be tighter
    layer = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    font = ImageFont.truetype(FONT_CANDIDATES[0], 580)
    # measure P
    pb = d.textbbox((0, 0), 'P', font=font)
    pw = pb[2] - pb[0]
    lb = d.textbbox((0, 0), 'L', font=font)
    lw = lb[2] - lb[0]
    # gap between P and L
    gap = -int(font.size * 0.06)  # slight overlap to make monogram feel
    total = pw + gap + lw
    x = (SIZE - total) // 2
    y = (SIZE - (pb[3] - pb[1])) // 2 - pb[1] - int(font.size * 0.04)
    d.text((x, y), 'P', font=font, fill=INK)
    d.text((x + pw + gap - lb[0], y), 'L', font=font, fill=INK)
    img.paste(layer, (0, 0), layer)
    img.save(os.path.join(BUILD_DIR, 'v3-PL.png'))
    return img


def main():
    os.makedirs(BUILD_DIR, exist_ok=True)
    p_img = candidate_single_p()
    pl_img = candidate_pl()

    # side-by-side comparison sheet at 600x600 each
    sheet = Image.new('RGB', (600 * 2 + 60, 700), (255, 255, 255))
    sheet.paste(p_img.resize((600, 600), Image.LANCZOS), (0, 50))
    sheet.paste(pl_img.resize((600, 600), Image.LANCZOS), (660, 50))
    # label
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype(FONT_CANDIDATES[0], 32)
    except Exception:
        font = ImageFont.load_default()
    d.text((280, 10), 'A · single P', font=font, fill=(80, 80, 88))
    d.text((900, 10), 'B · PL monogram', font=font, fill=(80, 80, 88))
    sheet.save(os.path.join(BUILD_DIR, 'v3-compare.png'))
    print('wrote v3-compare.png (A: P, B: PL)')


if __name__ == '__main__':
    main()
