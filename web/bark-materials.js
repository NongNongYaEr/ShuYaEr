import {packageOrigins} from './asset-origins.js';
import * as THREE from './vendor/three.module.min.js';
import { encodeRGBA8PNG } from './vendor/fbx-exporter/data/textureEncoder.js';
import {LIBRARY_BARK_STYLE,libraryBarkMaps,libraryBarkStyles,libraryBarkCatalog,hasLibraryBark} from './library-bark.js';
import {BARK_TEXTURE_DEFAULTS} from './bark-material-defaults.js';
export {BARK_TEXTURE_DEFAULTS} from './bark-material-defaults.js';

export const BARK_MATERIAL_VERSION = 1;
export const BARK_MAP_SLOTS = ['color', 'normal', 'roughness'];
export const DEFAULT_BARK_PRESET={id:'builtin-library-celtis-v1',name:'默认 · 朴树细皮（素材库）',style:LIBRARY_BARK_STYLE,color:'#ffffff',roughness:.92,normal_strength:.65,...BARK_TEXTURE_DEFAULTS};
export const isLibraryBark=recipe=>hasLibraryBark(recipe?.style);
export const BARK_PRESETS = [
  { id: 'builtin-camphor', name: '香樟细皮', style: 'CAMPHOR', color: '#78664c', roughness: .88, normal_strength: .65 },
  { id: 'builtin-old', name: '粗裂老树', style: 'OLD', color: '#655344', roughness: .96, normal_strength: 1.2 },
  { id: 'builtin-vertical', name: '深色纵裂', style: 'VERTICAL', color: '#534433', roughness: .9, normal_strength: 1 },
  { id: 'builtin-pale', name: '浅色细皮', style: 'PALE', color: '#c6bda7', roughness: .75, normal_strength: .3 },
  { id: 'builtin-scaly', name: '片状松皮', style: 'SCALY', color: '#8d6350', roughness: .93, normal_strength: .95 },
  { id: 'builtin-red', name: '暖褐细纹', style: 'CAMPHOR', color: '#a27452', roughness: .84, normal_strength: .5 },
  DEFAULT_BARK_PRESET,
  ...libraryBarkCatalog.map(record=>record.preset),
].map(preset=>({...preset,...BARK_TEXTURE_DEFAULTS}));
const styles = new Set(['CAMPHOR', 'OLD', 'VERTICAL', 'PALE', 'SCALY', 'IMPORTED',...libraryBarkStyles]);
const bounded = (v, min, max, fallback) => Number.isFinite(Number(v)) && v !== '' && v !== null ? Math.max(min, Math.min(max, Number(v))) : fallback;
const clone = value => JSON.parse(JSON.stringify(value));
const safeId = id => typeof id === 'string' && id.length > 0 && id.length <= 160 && !['__proto__', 'constructor', 'prototype'].includes(id);
const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
export function barkBytesToBase64(bytes) {
  let binary = ''; for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
export function barkBase64ToBytes(value) { const binary = atob(value), bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes; }
function normalizeImage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const width = Number(raw.width), height = Number(raw.height), pixels = raw.pixels;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 1024 || height > 1024 || typeof pixels !== 'string'
    || pixels.length > 5592408 || !base64Pattern.test(pixels)) return null;
  try { if (atob(pixels).length !== width * height * 4) return null; } catch { return null; }
  const image = { width, height, pixels, name: String(raw.name || '').slice(0, 160) };
  // The decoded pixels are the self-contained source of truth in browser/CLI.
  // An optional original encoded image is preserved only when bounded and valid.
  if (typeof raw.data_uri === 'string' && raw.data_uri.length <= 12000000 && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(raw.data_uri)) image.data_uri = raw.data_uri;
  return image;
}
export function normalizeBarkMaterial(raw = {}) {
  const result = { version: 1, style: styles.has(raw?.style) ? raw.style : 'CAMPHOR',
    color: /^#[a-f0-9]{6}$/i.test(raw?.color) ? raw.color.toLowerCase() : '#78664c',
    roughness: bounded(raw?.roughness, .04, 1, .88), normal_strength: bounded(raw?.normal_strength, 0, 3, .65),
    scale_u_m: bounded(raw?.scale_u_m, .02, 20, BARK_TEXTURE_DEFAULTS.scale_u_m), scale_v_m: bounded(raw?.scale_v_m, .02, 20, BARK_TEXTURE_DEFAULTS.scale_v_m),
    direction: raw?.direction === 'HORIZONTAL' ? 'HORIZONTAL' : 'VERTICAL', seed: Math.trunc(bounded(raw?.seed, 0, 2147483647, 37)) };
  const maps = {};
  for (const slot of BARK_MAP_SLOTS) { const image = normalizeImage(raw?.maps?.[slot]); if (image) maps[slot] = image; }
  if (Object.keys(maps).length) result.maps = maps;
  if(raw.package_origins?.length)result.package_origins=packageOrigins(raw.package_origins);
  return result;
}
export function normalizeBarkMaterials(raw) {
  if (!raw || raw.version !== 1 || typeof raw !== 'object') return null;
  const result = { version: 1, branches: {} };
  if (raw.default && typeof raw.default === 'object') result.default = normalizeBarkMaterial(raw.default);
  for (const [id, material] of Object.entries(raw.branches || {}).slice(0, 4096)) if (safeId(id)) {
    if (material === null) result.branches[id] = null;
    else if (material && typeof material === 'object') result.branches[id] = normalizeBarkMaterial(material);
  }
  return result;
}
export function ensureDefaultTreeBark(authoring){
  const previous=normalizeBarkMaterials(authoring.workbench?.bark_materials);
  if(previous?.default)return false;
  authoring.workbench={...authoring.workbench,bark_materials:{...(previous||{version:1,branches:{}}),default:normalizeBarkMaterial(DEFAULT_BARK_PRESET)}};return true;
}
export function barkMaterialForBranch(authoring, id) {
  const materials = authoring?.workbench?.bark_materials;
  if (materials?.version !== 1) return null;
  const raw = Object.hasOwn(materials.branches || {}, id) ? materials.branches[id] : materials.default;
  return raw ? normalizeBarkMaterial(raw) : null;
}
export function applyBarkMaterialAssignments(authoring, material, branchIds = [], { all = false } = {}) {
  const recipe = normalizeBarkMaterial(material), previous = normalizeBarkMaterials(authoring.workbench?.bark_materials);
  const data = previous || { version: 1, branches: {} };
  if (all) { data.default = clone(recipe); data.branches = {}; }
  else for (const id of branchIds) if (safeId(id)) data.branches[id] = clone(recipe);
  authoring.workbench = { ...authoring.workbench, bark_materials: data };
  return data;
}
export function removeBarkMaterialAssignments(authoring, branchIds = [], { all = false } = {}) {
  const data = normalizeBarkMaterials(authoring.workbench?.bark_materials); if (!data) return false;
  if (all) delete authoring.workbench.bark_materials;
  else { for (const id of branchIds) if (safeId(id)) { if (data.default) data.branches[id] = null; else delete data.branches[id]; }
    if (!data.default && !Object.keys(data.branches).length) delete authoring.workbench.bark_materials; else authoring.workbench.bark_materials = data; }
  return true;
}
export function normalizeBarkPreset(raw) {
  const id = String(raw?.id || ''), name = String(raw?.name || '').replace(/[\u0000-\u001f]/g, '').trim();
  if (!/^(trunk-preset|bark)-[a-f0-9]{32}$/.test(id) || !name || name.length > 80 || !(raw?.shape || raw?.recipe)) throw Error('树皮预设名称或记录无效');
  return { id, name, recipe: normalizeBarkMaterial(raw.shape || raw.recipe), updatedAt: Math.trunc(bounded(raw.updatedAt, 0, Number.MAX_SAFE_INTEGER, Date.now())) };
}
function heightAt(m, u, v) {
  const tau = Math.PI * 2, phase = m.seed * .17;
  const warp = .023 * Math.sin(tau * (3 * v + 2 * u) + phase) + .009 * Math.sin(tau * (7 * v - 3 * u));
  const groove = Math.pow(Math.max(0, Math.sin(tau * (9 * (u + warp)) + phase)), m.style === 'OLD' ? 5 : 10);
  const fine = Math.sin(tau * (31 * u + 3 * v) + phase) * .025 + Math.sin(tau * (17 * u - 11 * v)) * .018;
  if (m.style === 'PALE') return .7 - .05 * groove + fine * .65;
  if (m.style === 'IMPORTED') return .7;
  const cross = Math.pow(Math.max(0, Math.sin(tau * (6 * v + .12 * Math.sin(tau * 4 * u)) + phase)), 18);
  if (m.style === 'OLD') return .78 - .5 * groove - .2 * cross + fine;
  if (m.style === 'VERTICAL') return .78 - .48 * groove + fine;
  if (m.style === 'SCALY') return .75 - .3 * groove - .28 * cross + fine;
  return .8 - .23 * groove + fine;
}
const textureMapCache = new Map();
const libraryTextureSources=new Map();
const importedTextureSources=new Map();
let importedTextureSourceBytes=0;
let materialRecipeCache=new WeakMap();
function materialRecipeInfo(raw){
  const values=['style','color','roughness','normal_strength','scale_u_m','scale_v_m','direction','seed'].map(key=>raw?.[key]);
  for(const slot of BARK_MAP_SLOTS)for(const key of ['width','height','pixels','name','data_uri'])values.push(raw?.maps?.[slot]?.[key]);
  const cacheable=raw&&typeof raw==='object',previous=cacheable&&materialRecipeCache.get(raw);
  if(previous&&values.every((value,i)=>Object.is(value,previous.values[i])))return previous;
  const recipe=normalizeBarkMaterial(raw),serialized=JSON.stringify(recipe);let hash=2166136261;for(let i=0;i<serialized.length;i++)hash=Math.imul(hash^serialized.charCodeAt(i),16777619);
  const info={recipe,serialized,hash:(hash>>>0).toString(16),values,keys:new Map()};if(cacheable)materialRecipeCache.set(raw,info);return info;
}
let textureMapCacheBytes = 0;
const copyMaps = maps => Object.fromEntries(BARK_MAP_SLOTS.map(slot => [slot, { ...maps[slot], data: maps[slot].data.slice() }]));
export function clearBarkTextureCache() { textureMapCache.clear(); textureMapCacheBytes = 0;libraryTextureSources.clear();importedTextureSources.clear();importedTextureSourceBytes=0;materialRecipeCache=new WeakMap(); }
function rememberTextureSources(key,sources){
  const bytes=key.length*2+BARK_MAP_SLOTS.reduce((sum,slot)=>sum+sources[slot].data.data.byteLength,0);
  if(bytes>16*1024*1024)return;
  while(importedTextureSources.size>=8||importedTextureSourceBytes+bytes>16*1024*1024){const first=importedTextureSources.keys().next().value;importedTextureSourceBytes-=importedTextureSources.get(first).bytes;importedTextureSources.delete(first);}
  importedTextureSources.set(key,{sources,bytes});importedTextureSourceBytes+=bytes;
}
function rememberMaps(key,result){
  const bytes=BARK_MAP_SLOTS.reduce((sum,slot)=>sum+result[slot].data.byteLength,0);
  if(bytes<=16*1024*1024){while(textureMapCache.size>=8||textureMapCacheBytes+bytes>16*1024*1024){const first=textureMapCache.keys().next().value;textureMapCacheBytes-=textureMapCache.get(first).bytes;textureMapCache.delete(first);}textureMapCache.set(key,{maps:result,bytes});textureMapCacheBytes+=bytes;}
  return copyMaps(result);
}
export function generateBarkTextureMaps(raw, size = 256) {
  const recipe = normalizeBarkMaterial(raw), width = Math.trunc(bounded(size, 16, 512, 256)), height = width;
  // Physical repeats belong to each material, while the expensive pixel maps
  // can be shared across branches. Bound both entry count and retained bytes.
  const key = JSON.stringify([width, recipe]), cached = textureMapCache.get(key);
  if (cached) { textureMapCache.delete(key); textureMapCache.set(key, cached); return copyMaps(cached.maps); }
  if(isLibraryBark(recipe)){
    const result=libraryBarkMaps(width,recipe.style);for(const slot of BARK_MAP_SLOTS)if(recipe.maps?.[slot]){const map=recipe.maps[slot];result[slot]={width:map.width,height:map.height,data:barkBase64ToBytes(map.pixels)};}
    return rememberMaps(key,result);
  }
  const heights = new Float32Array(width * height), color = new Uint8Array(width * height * 4), normal = new Uint8Array(color.length), roughness = new Uint8Array(color.length);
  const rgb = [1, 3, 5].map(index => parseInt(recipe.color.slice(index, index + 2), 16));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) heights[y * width + x] = heightAt(recipe, x / width, y / height);
  const h = (x, y) => heights[((y + height) % height) * width + (x + width) % width];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4, value = h(x, y), shade = Math.max(.25, Math.min(1.2, .53 + value * .65));
    for (let c = 0; c < 3; c++) color[index + c] = Math.round(rgb[c] * shade);
    const dx = (h(x - 1, y) - h(x + 1, y)) * 5, dy = (h(x, y - 1) - h(x, y + 1)) * 5, length = Math.hypot(dx, dy, 1);
    normal[index] = Math.round((dx / length * .5 + .5) * 255); normal[index + 1] = Math.round((dy / length * .5 + .5) * 255); normal[index + 2] = Math.round((1 / length * .5 + .5) * 255);
    const rough = Math.round((.72 + (1 - value) * .28) * 255); roughness.fill(rough, index, index + 3);
    color[index + 3] = normal[index + 3] = roughness[index + 3] = 255;
  }
  const result = { color: { width, height, data: color }, normal: { width, height, data: normal }, roughness: { width, height, data: roughness } };
  for (const slot of BARK_MAP_SLOTS) if (recipe.maps?.[slot]) { const map = recipe.maps[slot]; result[slot] = { width: map.width, height: map.height, data: barkBase64ToBytes(map.pixels) }; }
  const bytes = BARK_MAP_SLOTS.reduce((total, slot) => total + result[slot].data.byteLength, 0);
  if (bytes <= 16 * 1024 * 1024) {
    while (textureMapCache.size >= 8 || textureMapCacheBytes + bytes > 16 * 1024 * 1024) {
      const oldestKey = textureMapCache.keys().next().value, oldest = textureMapCache.get(oldestKey);
      textureMapCacheBytes -= oldest.bytes; textureMapCache.delete(oldestKey);
    }
    textureMapCache.set(key, { maps: result, bytes }); textureMapCacheBytes += bytes;
    return copyMaps(result);
  }
  return result;
}
export function createBarkSurfaceMaterial(raw, { branch = {}, settings = {}, size, continuousBark=false,referencePerimeter } = {}) {
  const info=materialRecipeInfo(raw),recipe=info.recipe,resolution=size??(isLibraryBark(recipe)?512:256),shared=isLibraryBark(recipe)&&!recipe.maps;
  if(recipe.maps&&!info.keys.has(resolution))info.keys.set(resolution,'['+resolution+','+info.serialized+']');const poolKey=recipe.maps?info.keys.get(resolution):null;
  const libraryKey=recipe.style+':'+resolution,retained=poolKey?importedTextureSources.get(poolKey):null,pool=shared?libraryTextureSources.get(libraryKey):retained?.sources;
  if(retained){importedTextureSources.delete(poolKey);importedTextureSources.set(poolKey,retained);}
  const maps=pool?null:generateBarkTextureMaps(recipe,resolution),sources={},material = new THREE.MeshStandardMaterial({ color: recipe.maps?.color||isLibraryBark(recipe) ? recipe.color : '#ffffff', roughness: recipe.roughness, metalness: 0 });
  material.name = 'M_Bark'; material.userData.bark_key = info.hash;
  // Image payloads are immutable strings. Copy their records without parsing a
  // new multi-megabyte string for every carrier using the same generated maps.
  material.userData.bark_material={...recipe,...(recipe.maps?{maps:Object.fromEntries(Object.entries(recipe.maps).map(([slot,image])=>[slot,{...image}]))}:{})};
  const radius = Number(branch.startRadius || settings.base_radius || .07), denominator = Math.max(radius * 12, .2), tiling = Number(settings.bark_tiling || 1);
  for (const slot of BARK_MAP_SLOTS) {
    const map = pool?pool[slot].data:maps[slot], texture = new THREE.DataTexture(pool?null:map.data, map.width, map.height, THREE.RGBAFormat);
    if(pool)texture.source=pool[slot];sources[slot]=texture.source;
    texture.colorSpace = slot === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(Math.max(.001, 2 * Math.PI * radius / recipe.scale_u_m), denominator / tiling / recipe.scale_v_m);
    if(continuousBark){const around=Math.max(1,Math.round((referencePerimeter||2*Math.PI*radius)/recipe.scale_u_m)),along=denominator/tiling/recipe.scale_v_m;
      texture.repeat.set(...(recipe.direction==='HORIZONTAL'?[along,around]:[around,along]));}
    if (recipe.direction === 'HORIZONTAL') { texture.rotation = Math.PI / 2; texture.center.set(.5, .5); }
    texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true;
    texture.userData.branchforge_export = true; texture.userData.bark_slot = slot; texture.needsUpdate = true;
    material[slot === 'color' ? 'map' : slot === 'normal' ? 'normalMap' : 'roughnessMap'] = texture;
  }
  if(shared&&!pool)libraryTextureSources.set(libraryKey,sources);
  if(poolKey&&!pool)rememberTextureSources(poolKey,sources);
  material.normalScale.set(recipe.normal_strength, recipe.normal_strength); return material;
}
export function barkTextureFiles(raw, prefix = 'bark') {
  const maps = generateBarkTextureMaps(raw,isLibraryBark(raw)?512:256);
  return BARK_MAP_SLOTS.map(slot => { const map = maps[slot], bytes = encodeRGBA8PNG(map.data, map.width, map.height); return { key: slot, slot: 'M_Bark', name: `${String(prefix).replace(/[^a-zA-Z0-9_-]/g, '_')}.${slot}.png`, width: map.width, height: map.height, bytes, base64: barkBytesToBase64(bytes) }; });
}
