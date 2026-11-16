import * as THREE from './vendor/three.module.min.js';
import { unzlibSync } from './vendor/fflate-browser.js';
import {
  BARK_MAP_SLOTS, DEFAULT_BARK_PRESET, barkBase64ToBytes, generateBarkTextureMaps,
  isLibraryBark, normalizeBarkMaterial,
} from './bark-materials.js';
import { generateBarkCompanionMaps } from './bark-map-generator.js';
import { libraryBarkCatalog } from './library-bark.js';

export const WHOLE_TREE_BARK_SIZE = 2048;
const woodNames = new Set(['M_Bark', 'M_UnitBark', 'M_CutScar']);
const importedMapSlots = ['baseColor', 'normal', 'metallicRoughness', 'occlusion', 'emissive'];

export function isSharedTreeBarkMaterial(material) {
  if (!material || material.userData?.treeLightStrip || material.userData?.base_branch_atlas) return false;
  const imported = material.importedTrunk;
  if (imported) {
    const source = imported.asset?.materials?.[imported.index];
    return Boolean(source) && !importedMapSlots.some(slot => source[slot]);
  }
  return woodNames.has(material.name) || Boolean(material.userData?.bark_material);
}

async function fetchAsset(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error('缺少整树导出的高分辨率树皮素材');
  return new Uint8Array(await response.arrayBuffer());
}

async function loadLibraryColor(style, readAsset) {
  const bytes = await readAsset(new URL(`./assets/bark/whole-tree-export/${style}.rgb.zlib`, import.meta.url));
  if (bytes.byteLength <= 8) throw Error('整树树皮素材损坏');
  const header = new DataView(bytes.buffer, bytes.byteOffset, 8);
  const width = header.getUint32(0, true);
  const height = header.getUint32(4, true);
  if (!width || !height || width > 4096 || height > 4096) throw Error('整树树皮素材尺寸无效');
  const rgb = unzlibSync(bytes.subarray(8));
  if (rgb.byteLength !== width * height * 3) throw Error('整树树皮素材像素不完整');
  const data = new Uint8Array(width * height * 4);
  for (let read = 0, write = 0; read < rgb.length; read += 3, write += 4) {
    data[write] = rgb[read];
    data[write + 1] = rgb[read + 1];
    data[write + 2] = rgb[read + 2];
    data[write + 3] = 255;
  }
  return { width, height, data };
}

const srgbToLinear = Float32Array.from({ length: 256 }, (_, byte) => {
  const value = byte / 255;
  return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
});
const linearToSrgb = Uint8Array.from({ length: 4097 }, (_, index) => {
  const value = index / 4096;
  return Math.round(255 * (value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055));
});

function resample(source, slot) {
  const size = WHOLE_TREE_BARK_SIZE;
  const { width, height, data: pixels } = source;
  if (width === size && height === size) return source;
  const data = new Uint8Array(size * size * 4);
  const left = new Uint32Array(size);
  const right = new Uint32Array(size);
  const weights = new Float32Array(size);
  const color = slot === 'color';
  const normal = slot === 'normal';
  for (let x = 0; x < size; x++) {
    const sx = (x + .5) * width / size - .5;
    const ix = Math.floor(sx);
    left[x] = ((ix + width) % width) * 4;
    right[x] = ((ix + 1) % width) * 4;
    weights[x] = sx - ix;
  }
  for (let y = 0; y < size; y++) {
    const sy = (y + .5) * height / size - .5;
    const iy = Math.floor(sy);
    const top = (iy + height) % height * width * 4;
    const bottom = (iy + 1) % height * width * 4;
    const fy = sy - iy;
    for (let x = 0; x < size; x++) {
      const fx = weights[x];
      const a = top + left[x], b = top + right[x], c = bottom + left[x], d = bottom + right[x];
      const out = (y * size + x) * 4;
      const wa = (1 - fx) * (1 - fy), wb = fx * (1 - fy), wc = (1 - fx) * fy, wd = fx * fy;
      for (let channel = 0; channel < 4; channel++) {
        const av = pixels[a + channel], bv = pixels[b + channel], cv = pixels[c + channel], dv = pixels[d + channel];
        if (color && channel < 3) {
          const value = wa * srgbToLinear[av] + wb * srgbToLinear[bv] + wc * srgbToLinear[cv] + wd * srgbToLinear[dv];
          data[out + channel] = linearToSrgb[Math.round(value * 4096)];
        } else {
          data[out + channel] = Math.round(wa * av + wb * bv + wc * cv + wd * dv);
        }
      }
      if (normal) {
        const nx = data[out] / 127.5 - 1, ny = data[out + 1] / 127.5 - 1, nz = data[out + 2] / 127.5 - 1;
        const length = Math.hypot(nx, ny, nz);
        if (length > 1e-5) {
          data[out] = Math.round((nx / length + 1) * 127.5);
          data[out + 1] = Math.round((ny / length + 1) * 127.5);
          data[out + 2] = Math.round((nz / length + 1) * 127.5);
        }
      }
    }
  }
  return { width: size, height: size, data };
}

export async function createWholeTreeSharedBark(authoring, { readAsset = fetchAsset } = {}) {
  const recipe = normalizeBarkMaterial(authoring?.workbench?.bark_materials?.default ?? DEFAULT_BARK_PRESET);
  const library = isLibraryBark(recipe);
  let maps;
  if (library) {
    const color = resample(await loadLibraryColor(recipe.style, readAsset), 'color');
    const generation = libraryBarkCatalog.find(record => record.style === recipe.style)?.generation;
    maps = { color, ...generateBarkCompanionMaps(color, { ...generation, exportResolution: true }) };
  } else {
    maps = generateBarkTextureMaps(recipe, WHOLE_TREE_BARK_SIZE, { exportResolution: true });
  }

  const material = new THREE.MeshStandardMaterial({
    color: recipe.maps?.color || library ? recipe.color : '#ffffff',
    roughness: recipe.roughness,
    metalness: 0,
  });
  material.name = 'M_Bark';
  material.userData.bark_material = recipe;
  material.userData.whole_tree_shared_bark = true;
  material.normalScale.setScalar(recipe.normal_strength);
  for (const slot of BARK_MAP_SLOTS) {
    const override = library ? recipe.maps?.[slot] : null;
    if (override) maps[slot] = { width: override.width, height: override.height, data: barkBase64ToBytes(override.pixels) };
    const map = maps[slot] = resample(maps[slot], slot);
    const texture = new THREE.DataTexture(map.data, map.width, map.height, THREE.RGBAFormat);
    texture.name = 'M_Bark_' + slot;
    texture.colorSpace = slot === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.userData.branchforge_export = true;
    texture.userData.bark_slot = slot;
    texture.needsUpdate = true;
    material[slot === 'color' ? 'map' : slot === 'normal' ? 'normalMap' : 'roughnessMap'] = texture;
  }
  return { recipe, maps, material };
}

export function projectUntexturedTrunkBarkUV(geometry, matrixWorld, recipe) {
  const source = geometry.getAttribute('uv');
  if (source?.count) {
    const x = source.getX(0), y = source.getY(0);
    for (let i = 1; i < source.count; i++) {
      if (Math.abs(source.getX(i) - x) + Math.abs(source.getY(i) - y) > 1e-7) return false;
    }
  }
  const position = geometry.getAttribute('position');
  const uv = new THREE.Float32BufferAttribute(new Float32Array(position.count * 2), 2);
  const point = new THREE.Vector3();
  // White meshes may have collapsed UV0. Give them a metre-scaled
  // projection without introducing vertices or changing binding.
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    if (matrixWorld) point.applyMatrix4(matrixWorld);
    const across = (point.x + point.y) * Math.SQRT1_2;
    const along = point.z + (point.y - point.x) * 0.125;
    if (recipe.direction === 'HORIZONTAL') uv.setXY(i, along / recipe.scale_v_m, -across / recipe.scale_u_m);
    else uv.setXY(i, across / recipe.scale_u_m, along / recipe.scale_v_m);
  }
  geometry.setAttribute('uv', uv);
  return true;
}

export function bakeWholeTreeBarkUV(geometry, sourceMaterial) {
  const uv = geometry.getAttribute('uv');
  if (!uv) return false;
  const texture = sourceMaterial?.map ?? sourceMaterial?.normalMap ?? sourceMaterial?.roughnessMap;
  if (texture?.matrixAutoUpdate) texture.updateMatrix();
  const matrix = texture?.matrix.elements ?? sourceMaterial?.userData?.bark_pve_binding?.texture_transforms?.color?.matrix;
  if (!matrix || (matrix[0] === 1 && matrix[1] === 0 && matrix[3] === 0 && matrix[4] === 1 && matrix[6] === 0 && matrix[7] === 0)) return false;
  const [a, b, , c, d, , x, y] = matrix;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, a * u + c * v + x, b * u + d * v + y);
  }
  uv.needsUpdate = true;
  return true;
}
