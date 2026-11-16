"""Pack existing library tree bark tiles into the scene overlay accent atlas."""
import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "material" / "web" / "assets"
EXPANSION = ASSETS / "bark-expansion"
OUTPUT = ASSETS / "coatings" / "scene-bark-patches.png"
TILE = 512
STYLES = ("camphor-fissures", "birch-papery", "ironbark")


def source_asset(source, recorded):
    if hashlib.sha256(source.read_bytes()).hexdigest() != recorded.get(source):
        raise ValueError(f"Library material hash does not match: {source.name}")
    with Image.open(source) as image:
        image.load()
        if image.format != "PNG" or image.width != image.height or image.width < TILE:
            raise ValueError(f"Expected a square library PNG: {source.name}")
        return image.copy()


def byte_height(image):
    if not image.mode.startswith("I"):
        raise ValueError("Expected the existing 16-bit bark height map")
    pixels = image.convert("F").resize((TILE, TILE), Image.Resampling.LANCZOS)
    result = Image.new("L", (TILE, TILE))
    result.putdata([round(min(65535, max(value, 0)) / 257) for value in pixels.getdata()])
    return result


def build():
    descriptions = json.loads((EXPANSION / "metadata.json").read_text(encoding="utf-8"))
    library = {item["id"]: item for item in descriptions["materials"]}
    output = Image.new("RGB", (TILE, TILE * len(STYLES) * 2))
    for index, style in enumerate(STYLES):
        recorded = {
            (EXPANSION / item["file"]).resolve(): item["sha256"]
            for item in library[style]["files"]
        }
        prefix = f"bark-new-{style}-v1"
        color = source_asset((ASSETS / f"{prefix}.png").resolve(), recorded)
        height = source_asset((ASSETS / f"{prefix}-height16.png").resolve(), recorded)
        roughness = source_asset((ASSETS / f"{prefix}-roughness.png").resolve(), recorded)
        ao = source_asset((EXPANSION / f"{style}-ao-estimated-v1.png").resolve(), recorded)
        if not color.size == height.size == roughness.size == ao.size:
            raise ValueError(f"Source maps have different resolutions: {style}")
        if color.mode != "RGB" or roughness.mode != "L" or ao.mode != "L":
            raise ValueError(f"Unexpected source channel format: {style}")
        color = color.resize((TILE, TILE), Image.Resampling.LANCZOS)
        height = byte_height(height)
        roughness = roughness.resize((TILE, TILE), Image.Resampling.LANCZOS)
        ao = ao.resize((TILE, TILE), Image.Resampling.LANCZOS)
        output.paste(color, (0, 2 * index * TILE))
        output.paste(Image.merge("RGB", (height, roughness, ao)), (0, (2 * index + 1) * TILE))
    output.save(OUTPUT, compress_level=6)
    packed = OUTPUT.read_bytes()
    print(json.dumps({"styles": STYLES, "width": output.width, "height": output.height,
                      "bytes": len(packed), "sha256": hashlib.sha256(packed).hexdigest()}))


if __name__ == "__main__":
    build()
