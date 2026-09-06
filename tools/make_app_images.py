#!/usr/bin/env python3
"""Generate the Homey app store images for com.fabeljet.layeredlight.

Homey requires /assets/images/{small,large,xlarge}.png at 250x175, 500x350 and
1000x700. These are placeholders: three stacked bars of coloured light on a dark ground,
evoking a layered scene stack. Replace them with real artwork before publishing.

Usage: python3 tools/make_app_images.py com.fabeljet.layeredlight/assets/images
"""

import sys
import os
from PIL import Image, ImageDraw, ImageFilter, ImageChops

SIZES = {
    'small': (250, 175),
    'large': (500, 350),
    'xlarge': (1000, 700),
}

# Bottom of the stack first, matching the priority list order.
BANDS = [
    # (cx, cy, rx, glow colour, core colour) — bottom of the stack first.
    (0.42, 0.735, 0.34, (150, 92, 34), (252, 186, 96)),    # warm amber — base layer
    (0.50, 0.500, 0.30, (108, 46, 126), (206, 118, 232)),  # magenta — mid layer
    (0.58, 0.265, 0.26, (38, 108, 150), (104, 206, 255)),  # cyan — top layer
]

GLOW_RY = 0.062
CORE_RY = 0.020

SS = 4  # supersampling factor


def background(size):
    w, h = size
    img = Image.new('RGB', size, (13, 17, 23))
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        shade = (
            int(13 + 9 * t),
            int(17 + 10 * t),
            int(23 + 13 * t),
        )
        draw.line([(0, y), (w, y)], fill=shade)
    return img


def bar(size, cx, cy, rx, ry, colour, blur):
    w, h = size
    layer = Image.new('RGB', size, (0, 0, 0))
    draw = ImageDraw.Draw(layer)
    box = [
        (cx - rx) * w, (cy - ry) * h,
        (cx + rx) * w, (cy + ry) * h,
    ]
    draw.rounded_rectangle(box, radius=ry * h, fill=colour)
    if blur:
        layer = layer.filter(ImageFilter.GaussianBlur(radius=w * blur))
    return layer


def vignette(size):
    w, h = size
    mask = Image.new('L', size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse([-w * 0.15, -h * 0.15, w * 1.15, h * 1.15], fill=255)
    return mask.filter(ImageFilter.GaussianBlur(radius=w * 0.06))


def render(size):
    big = (size[0] * SS, size[1] * SS)

    img = background(big)
    # Each layer is a soft halo with a crisp bar of light inside it.
    for cx, cy, rx, glow_colour, _ in BANDS:
        img = ImageChops.add(img, bar(big, cx, cy, rx, GLOW_RY, glow_colour, 0.030))
    for cx, cy, rx, _, core_colour in BANDS:
        img = ImageChops.add(img, bar(big, cx, cy, rx * 0.94, CORE_RY, core_colour, 0.004))

    # Dim the edges so the bands read as light rather than as flat blobs.
    dark = Image.new('RGB', big, (10, 13, 18))
    img = Image.composite(img, dark, vignette(big))

    return img.resize(size, Image.LANCZOS)


def main():
    out_dir = sys.argv[1]
    os.makedirs(out_dir, exist_ok=True)
    for name, size in SIZES.items():
        path = os.path.join(out_dir, f'{name}.png')
        render(size).save(path, 'PNG', optimize=True)
        print(f'{path} {size[0]}x{size[1]}')


if __name__ == '__main__':
    main()
