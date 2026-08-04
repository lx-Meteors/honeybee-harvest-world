from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image


KEYS = {
    "magenta": (255, 0, 255),
    "cyan": (0, 255, 255),
    "green": (0, 255, 0),
}


def remove_chroma(image: Image.Image, key: tuple[int, int, int]) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            distance = math.sqrt((r - key[0]) ** 2 + (g - key[1]) ** 2 + (b - key[2]) ** 2)
            if key == KEYS["magenta"]:
                dominant = r > 155 and b > 120 and g < min(r, b) * 0.68
                fringe = r > 135 and b > 100 and g < min(r, b) * 0.9
            elif key == KEYS["cyan"]:
                dominant = g > 155 and b > 155 and r < min(g, b) * 0.68
                fringe = g > 135 and b > 135 and r < min(g, b) * 0.9
            else:
                dominant = g > 155 and g > r * 1.32 and g > b * 1.32
                fringe = g > 135 and g > r * 1.12 and g > b * 1.12

            if distance <= 26 or dominant:
                alpha = 0
            elif fringe:
                alpha = round(a * min(1, max(0, distance - 26) / 104))
            elif distance >= 92:
                alpha = a
            else:
                alpha = round(a * (distance - 26) / 66)
            pixels[x, y] = (r, g, b, alpha)
    return rgba


def fit_sprite(image: Image.Image, size: tuple[int, int] = (512, 360)) -> Image.Image:
    bbox = image.getbbox()
    if bbox is None:
        raise ValueError("The chroma-key pass removed the whole image")
    cropped = image.crop(bbox)
    available = (size[0] - 12, size[1] - 12)
    cropped.thumbnail(available, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    x = (size[0] - cropped.width) // 2
    y = size[1] - cropped.height - 6
    canvas.alpha_composite(cropped, (x, y))
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--key", choices=KEYS, required=True)
    args = parser.parse_args()

    image = Image.open(args.source)
    result = fit_sprite(remove_chroma(image, KEYS[args.key]))
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    result.save(args.destination, optimize=True)


if __name__ == "__main__":
    main()
