// Export-only atlas packing. Retain the existing one-atlas UE package contract.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { writePveAtlas } from './pve-atlas.mjs';

export const atlasKey = material => createHash('sha256').update(material?.color || '').update('\0').update(material?.normal || '').digest('hex');
function imageSize(uri) {
  const match = /^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(uri || '');
  if (!match) throw Error('完整包缺少内嵌叶片图集，请重新选择植物单元的模型与贴图');
  const b = Buffer.from(match[1], 'base64');
  if (b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b[0] === 255 && b[1] === 216) {
    for (let i = 2; i + 8 < b.length;) {
      if (b[i++] !== 255) break;
      const marker = b[i++];
      if (marker === 255) { i--; continue; }
      if (marker === 217 || marker === 218) break;
      const length = b.readUInt16BE(i);
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) return [b.readUInt16BE(i + 5), b.readUInt16BE(i + 3)];
      if (length < 2) break;
      i += length;
    }
  }
  throw Error('图集内容不是有效的 PNG/JPEG，请重新选择贴图');
}
const power = n => 2 ** Math.ceil(Math.log2(n));
export function packAtlasRegions(sizes, limit = 16384) {
  const tiles = sizes.map(([width,height], index) => ({ index,width,height }));
  if (!tiles.length || tiles.some(t => !Number.isInteger(t.width) || !Number.isInteger(t.height) || t.width < 1 || t.height < 1 || t.width > limit || t.height > limit)) throw Error('图集尺寸无效或超出完整包上限');
  tiles.sort((a,b) => b.height - a.height || b.width - a.width || a.index - b.index);
  let best;
  for (let width = power(Math.max(...tiles.map(t => t.width))); width <= limit; width *= 2) {
    let x=0,y=0,row=0;
    const regions = [];
    for (const tile of tiles) {
      if (x + tile.width > width) { y += row + 16; x=0; row=0; }
      regions[tile.index] = { x,y,width:tile.width,height:tile.height };
      x += tile.width + 16; row = Math.max(row,tile.height);
    }
    const height = power(y + row);
    if (height <= limit && (!best || width * height < best.width * best.height)) best = { width,height,regions };
  }
  if (!best) throw Error('混合素材图集超过 16384 像素上限，请减少本树使用的贴图种类；未降低原图清晰度');
  return best;
}
export function atlasUv(region, layout, u, v) {
  return [(region.x + u * region.width) / layout.width,
    1 - (region.y + region.height) / layout.height + v * region.height / layout.height];
}
// A saved legacy model may deliberately use an untextured M_Leaf surface.
// Register that exact surface explicitly; never use this tile as a fallback
// for a missing or unrecognized source texture. Its material tint is retained.
function whitePng(width = 1, height = 1) {
  const chunk = (name, bytes) => {
    const body = Buffer.concat([Buffer.from(name),bytes]), result = Buffer.alloc(body.length+8);
    result.writeUInt32BE(bytes.length); body.copy(result,4);
    let crc = 0xffffffff;
    for (const value of body) { crc ^= value; for (let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
    result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4); return result;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height,4); header[8]=8; header[9]=6;
  const pixels = Buffer.alloc((width*4+1)*height,255);
  for (let row=0;row<height;row++) pixels[row*(width*4+1)]=0;
  return 'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
export function createPveAtlas(materials, output, { untexturedMaterials = [] } = {}) {
  const unique = new Map();
  for (const m of materials) { if (m?.color) unique.set(atlasKey(m),m); }
  for (const material of untexturedMaterials) {
    if (material?.color) throw Error('已有颜色贴图的表面不能登记为无贴图材质');
    const key = atlasKey(material); if (unique.has(key)) continue;
    const size = material?.normal ? imageSize(material.normal) : [1,1];
    // Validate dimensions before allocating the optional normal-only canvas.
    packAtlasRegions([size]);
    unique.set(key,{color:whitePng(...size),normal:material?.normal || '',untextured:true});
  }
  if (!unique.size) throw Error('完整包缺少叶片图集，请重新选择植物单元的模型与贴图');
  const entries = [...unique.entries()];
  if (entries.length === 1) {
    const m=entries[0][1];
    writePveAtlas(m.color,path.join(output,'leaf_atlas_color.png'));
    if (m.normal) writePveAtlas(m.normal,path.join(output,'leaf_atlas_normal.png'));
    return null; // Byte-identical established single-atlas path; no UV changes.
  }
  const layout = packAtlasRegions(entries.map(([,m]) => imageSize(m.color)));
  const sources = entries.map(([key,m],i) => ({ key,color:m.color,normal:m.normal || '',
    ...(m.untextured ? {untextured:true} : {}),...layout.regions[i] }));
  try { execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',
    fileURLToPath(new URL('./pve-merged-atlas.ps1',import.meta.url)),'-OutputDirectory',output],
    { input:JSON.stringify({width:layout.width,height:layout.height,sources}),windowsHide:true,timeout:120000,maxBuffer:1024*1024,stdio:['pipe','pipe','pipe'] });
  } catch(error) {
    const detail=error.stderr?.length ? new TextDecoder('gbk').decode(error.stderr).trim() : error.message;
    throw Error('合并导出图集失败：'+detail);
  }
  const byKey = new Map(sources.map(s => [s.key,s]));
  const cache = new WeakMap();
  return { ...layout, sources:sources.map(({color,normal,...s}) => s),
    uv(material,u,v) {
      let region = material && cache.get(material);
      if (!region) { region=byKey.get(atlasKey(material)); if(material && region) cache.set(material,region); }
      if (!region) throw Error('实际装配材质未登记到导出图集，已停止发布');
      return atlasUv(region,layout,u,v);
    } };
}
