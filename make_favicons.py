#!/usr/bin/env python3
"""Render SINFORGE raster favicons (favicon.ico + favicon-192.png) to match
favicon.svg — a glowing yellow ID card (outline + photo box + data lines) on black.

No SVG renderer is available on this box, so the geometry from favicon.svg is
reproduced directly with Pillow (drawn supersampled, then downscaled for
antialiasing). Re-run if favicon.svg's shapes change.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageChops

ROOT = Path(__file__).resolve().parent
YELLOW = (252, 238, 10)          # #fcee0a
BLACK = (0, 0, 0)
BASE = 64                        # SVG viewBox is 64x64
SS = 16                          # supersample factor -> 1024px master
N = BASE * SS
SW = 3 * SS                      # stroke-width 3 in SVG units


def s(v):
    return v * SS


def round_line(draw, x0, y0, x1, y1, width, fill):
    """A line with round caps (Pillow's line caps are square)."""
    draw.line([(s(x0), s(y0)), (s(x1), s(y1))], fill=fill, width=width)
    r = width / 2
    for (cx, cy) in ((x0, y0), (x1, y1)):
        draw.ellipse([s(cx) - r, s(cy) - r, s(cx) + r, s(cy) + r], fill=fill)


def stroke_rrect(draw, x, y, w, h, rx, width, fill):
    """SVG-style centred stroke of a rounded rect (Pillow strokes inward, so
    grow the box by half the stroke width)."""
    hw = width / SS / 2
    draw.rounded_rectangle([s(x - hw), s(y - hw), s(x + w + hw), s(y + h + hw)],
                           radius=s(rx + hw), outline=fill, width=width)


def draw_glyph():
    """Draw the yellow glyph on a transparent RGBA master."""
    f = YELLOW + (255,)
    glyph = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(glyph)
    stroke_rrect(d, 10, 17, 44, 30, 3, SW, f)             # card outline
    stroke_rrect(d, 16, 23, 12, 15, 1, SW, f)             # photo box
    # data lines: M34 26 H48 M34 32 H48 M34 38 H42
    for (x0, x1, y) in ((34, 48, 26), (34, 48, 32), (34, 42, 38)):
        round_line(d, x0, y, x1, y, SW, f)
    return glyph


def compose(size):
    glyph = draw_glyph()
    # Flatten the yellow glyph onto black so the glow source is a bright RGB
    # image we can bloom additively.
    glyph_rgb = Image.alpha_composite(
        Image.new("RGBA", (N, N), BLACK + (255,)), glyph).convert("RGB")

    # GLOW: stack blurred copies with *additive* (screen) blending so the halo
    # actually brightens the black background — mimicking the SVG feGaussianBlur
    # merge (radii ~6/3/1.2 SVG units, replicated for a strong soft bloom).
    glow = Image.new("RGB", (N, N), BLACK)
    for radius, gain in ((8 * SS, 1.0), (4 * SS, 1.0), (2 * SS, 0.9), (1 * SS, 0.8)):
        blur = glyph_rgb.filter(ImageFilter.GaussianBlur(radius))
        if gain != 1.0:
            blur = blur.point(lambda p: int(p * gain))
        glow = ImageChops.screen(glow, blur)

    # crisp glyph on top of the bloom
    canvas = ImageChops.lighter(glow, glyph_rgb)
    out = canvas.resize((size, size), Image.LANCZOS)
    return out


def main():
    png = compose(192)
    png.save(ROOT / "favicon-192.png", "PNG")
    print("wrote favicon-192.png (192x192)")

    ico_master = compose(256)
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    ico_master.save(ROOT / "favicon.ico", format="ICO", sizes=sizes)
    print("wrote favicon.ico", sizes)


if __name__ == "__main__":
    main()
