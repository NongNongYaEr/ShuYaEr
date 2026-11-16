"""Bundle full-resolution, repeatable color sources for the tree export preset."""

import argparse
import hashlib
import json
from pathlib import Path
import struct
import zlib

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "web/assets/bark"


def blend_edges(image):
    for axis in (0, 1):
        if axis:
            image = image.transpose(Image.Transpose.TRANSPOSE)
        width, height = image.size
        band = min(width // 2, max(2, round(width / 16)))
        original = image.copy()
        for i in range(band):
            opposite = width - 1 - i
            left = original.crop((i, 0, i + 1, height))
            right = original.crop((opposite, 0, opposite + 1, height))
            weight = 0.5 * (1 - i / (band - 1)) ** 2
            image.paste(Image.blend(left, right, weight), (i, 0))
            image.paste(Image.blend(right, left, weight), (opposite, 0))
        if axis:
            image = image.transpose(Image.Transpose.TRANSPOSE)
    return image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source_root", type=Path)
    args = parser.parse_args()
    default = json.loads((ASSETS / "celtis-bark-v1.source.json").read_text(encoding="utf-8"))
    catalog = json.loads((ASSETS / "bark-library-v2.source.json").read_text(encoding="utf-8"))
    output = ASSETS / "whole-tree-export"
    output.mkdir(parents=True, exist_ok=True)
    for record in [default, *catalog["records"]]:
        source = args.source_root / record["source"]
        if hashlib.sha256(source.read_bytes()).hexdigest() != record["source_sha256"]:
            raise ValueError(f"Unexpected source for {record['style']}: {source}")
        with Image.open(source) as original:
            image = blend_edges(original.convert("RGB"))
        header = struct.pack("<II", *image.size)
        name = record["style"] + ".rgb.zlib"
        (output / name).write_bytes(header + zlib.compress(image.tobytes(), level=9))
        print(f"{name} {image.width}x{image.height}")


if __name__ == "__main__":
    main()
