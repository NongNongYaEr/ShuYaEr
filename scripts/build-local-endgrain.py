"""Append four local endgrain stamps; retain every existing coating/decal pixel.

The input is the bundled B11 authored PBR set, not an image-to-depth estimate.
No new shader texture slot or model geometry is required.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'material/web/assets'
ATLAS = ASSETS / 'coatings'
MANIFEST = ATLAS / 'coating-atlas-v3.json'
PROOF = ASSETS / 'sculpt-bark/local-endgrain.json'
SIDE = 512


def sha(data):
    return hashlib.sha256(data).hexdigest()


def legacy_hash(pixels):
    h = hashlib.sha256(pixels[:1024].tobytes())
    for cell in range(61 * 3):
        x, y = cell % 16 * SIDE, 1024 + cell // 16 * SIDE
        h.update(pixels[y:y + SIDE, x:x + SIDE].tobytes())
    return h.hexdigest()


def crop(im, center, span):
    # All meaningful stamp pixels fall inside the source; padding is clamped.
    cx, cy = center
    return np.asarray(im.transform((SIDE, SIDE), Image.Transform.EXTENT,
        ((cx-span/2)*im.width, (cy-span/2)*im.height,
         (cx+span/2)*im.width, (cy+span/2)*im.height), Image.Resampling.BILINEAR)).astype(np.float32)


def main():
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8-sig'))
    if manifest['width'] != 8192 or manifest['decalCount'] not in (61, 65):
        raise ValueError('Unexpected atlas source; no files changed')
    old = np.concatenate([np.asarray(Image.open(ATLAS / p['file']).convert('RGB')) for p in manifest['parts']])
    legacy = legacy_hash(old)
    previous = json.loads(PROOF.read_text(encoding='utf-8')) if PROOF.exists() else None
    if previous and previous['legacyPixelsSHA256'] != legacy:
        raise ValueError('Existing 61 stamps changed; no files changed')
    pixels = np.zeros((7680, 8192, 3), dtype=np.uint8)
    pixels[:old.shape[0]] = old
    yy, xx = np.mgrid[-1:1:SIDE*1j, -1:1:SIDE*1j]
    radius = np.sqrt(xx*xx + yy*yy)
    theta = np.arctan2(yy, xx)
    centers = [(.72, .51), (.72, .51), (.62, .40), (.72, .51)]
    records = []
    for variant in range(4):
        key = f'b11-{variant+1}'
        files = {'color': f'bark-sculpt-{key}-v1.png', 'height': f'bark-sculpt-{key}-v1-height16.png',
                 'roughness': f'bark-sculpt-{key}-v1-roughness.png', 'orm': f'sculpt-bark/{key}-orm.png'}
        color = crop(Image.open(ASSETS / files['color']).convert('RGB'), centers[variant], .65) / 255
        height = crop(Image.open(ASSETS / files['height']).convert('F'), centers[variant], .65) / 65535
        rough = crop(Image.open(ASSETS / files['roughness']).convert('L'), centers[variant], .65) / 255
        ao = crop(Image.open(ASSETS / files['orm']).convert('RGB'), centers[variant], .65)[:, :, 0] / 255
        edge = 1 - radius
        if variant == 1:
            edge -= .045*np.sin(theta*13 + np.sin(theta*5)*2) + .025*np.sin(theta*31)
        elif variant == 2:
            edge += .04*np.sin(theta*3)
        elif variant == 3:
            edge -= .025*np.sin(theta*19)
        alpha = np.clip((edge-.06)/.09, 0, 1)
        alpha = alpha*alpha*(3-2*alpha)
        # Preserve the designed paired height around a neutral .5; no RGB luminance.
        h = np.clip(.5 + (height-.5)*.7, .05, .95)
        panels = [np.clip(np.rint(color*alpha[:, :, None]*255), 0, 255).astype('uint8'),
                  np.clip(np.rint(np.stack([alpha, h, rough], axis=2)*255), 0, 255).astype('uint8'),
                  np.clip(np.rint(np.repeat(ao[:, :, None], 3, axis=2)*255), 0, 255).astype('uint8')]
        style = 61 + variant
        for panel, data in enumerate(panels):
            cell = style*3 + panel
            x, y = cell % 16 * SIDE, 1024 + cell // 16 * SIDE
            pixels[y:y+SIDE, x:x+SIDE] = data
        rgba = np.concatenate([np.clip(np.rint(color*255), 0, 255).astype('uint8'),
                               np.rint(alpha[:, :, None]*255).astype('uint8')], axis=2)
        record = {'style': style, 'sourcePreset': key, 'center': centers[variant], 'sourceSpan': .65,
                        'sourceMaps': {k: {'file': f, 'sha256': sha((ASSETS/f).read_bytes())} for k, f in files.items()},
                        'panelsSHA256': [sha(p.tobytes()) for p in panels], 'alphaPixels': int((alpha > .5).sum())}
        old_record = next((p for p in (previous or {}).get('records', []) if p['style'] == style), {})
        preview = old_record.get('preview')
        if (preview and old_record.get('sourceMaps') == record['sourceMaps']
                and old_record.get('panelsSHA256') == record['panelsSHA256']
                and preview.get('file') == f'effect-library/decal-{style}.png'
                and sha((ASSETS / preview['file']).read_bytes()) == preview['sha256']):
            record['preview'] = preview
        else:
            Image.fromarray(rgba).resize((128, 128), Image.Resampling.LANCZOS).save(ASSETS / f'effect-library/decal-{style}.png')
        records.append(record)
    if legacy_hash(pixels) != legacy:
        raise ValueError('Legacy preservation failed; no atlas changed')
    # a/b strips remain byte-identical; only c gains the final 512-pixel row.
    last = manifest['parts'][2]
    Image.fromarray(pixels[5120:]).save(ATLAS / last['file'], compress_level=6)
    last.update(height=2560, bytes=(ATLAS/last['file']).stat().st_size, sha256=sha((ATLAS/last['file']).read_bytes()))
    assert last['bytes'] < 50000000
    manifest.update(height=7680, decalCount=65, sha256=sha(pixels.tobytes()), legacy61PixelsExact=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    for target in [ROOT/'material/web/coating-asset-config.js', ROOT/'material/coating-asset-config.js']:
        text = target.read_text(encoding='utf-8')
        head, raw = text.split('export const COATING_ASSET=', 1)
        config = json.loads(raw.strip().removesuffix(';'))
        for field in ['height', 'decalCount', 'sha256', 'parts']:
            config[field] = manifest[field]
        target.write_text(head+'export const COATING_ASSET='+json.dumps(config, ensure_ascii=False, separators=(',', ':'))+';\n', encoding='utf-8')
    report = {'version': 1, 'method': 'authored-B11-PBR-local-projection-v1', 'measuredPBR': False,
              'legacyPixelsSHA256': legacy, 'legacy61PixelsExact': True, 'atlasSHA256': manifest['sha256'],
              'textureSlots': 13, 'rgbaMipBytesApprox': 8192*7680*4*4//3,
              'notes': '512px alpha stamps from authored 1024 B11 maps; no holes or silhouette geometry', 'records': records}
    PROOF.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'passed': True, 'styles': 65, 'legacy61PixelsExact': True, 'atlasSHA256': manifest['sha256'], 'lastStripBytes': last['bytes']}))


if __name__ == '__main__':
    main()
