import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { encodeRGBA8PNG } from '../web/vendor/fbx-exporter/data/textureEncoder.js';
import {
  bakeWholeTreeBarkUV,
  createWholeTreeSharedBark,
  isSharedTreeBarkMaterial,
  projectUntexturedTrunkBarkUV,
} from '../web/whole-tree-shared-bark.js';
import { rebuildPveGeometryTangents } from './pve-final-geometry.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const neutral = [1, 1, 1];

function tintedColor(map, color) {
  if (color.every(value => value === 1)) return map.data;
  const channels = color.map(factor => Uint8Array.from({ length: 256 }, (_, value) => {
    const srgb = value / 255;
    const linear = (srgb <= .04045 ? srgb / 12.92 : ((srgb + .055) / 1.055) ** 2.4) * factor;
    const tinted = linear <= .0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - .055;
    return Math.round(255 * Math.min(1, Math.max(0, tinted)));
  }));
  const pixels = map.data.slice();
  for (let i = 0; i < pixels.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) pixels[i + channel] = channels[channel][pixels[i + channel]];
  }
  return pixels;
}

function packedRoughness(map) {
  const pixels = new Uint8Array(map.data.length);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 255;
    pixels[i + 1] = map.data[i + 1];
    pixels[i + 3] = 255;
  }
  return pixels;
}

function writeMap(output, map, pixels) {
  const bytes = encodeRGBA8PNG(pixels, map.width, map.height);
  const sha256 = hash(bytes);
  const file = 'shared-bark-' + sha256.slice(0, 24) + '.png';
  fs.writeFileSync(path.join(output, file), bytes);
  return { file, sha256, bytes: bytes.length, offset: [0, 0], scale: [1, 1], rotation: 0,
    sampler: { wrapS: 10497, wrapT: 10497 } };
}

export async function exportPveSharedBark(output, asset, authoring) {
  let hasSharedBark = false;
  asset.group.traverseVisible(mesh => {
    if (mesh.isMesh && isSharedTreeBarkMaterial(mesh.material)) hasSharedBark = true;
  });
  if (!hasSharedBark) return null;

  const { maps, material, recipe } = await createWholeTreeSharedBark(authoring, { readAsset: url => fs.readFileSync(url) });
  try {
    const record = {
      name: 'M_UnitBark',
      tree_bark_role: 'shared',
      base_color_linear: [...neutral, 1],
      roughness: material.roughness,
      metalness: 0,
      normal_scale: material.normalScale.x,
      occlusion_strength: 1,
      emissive_factor: [0, 0, 0],
      alpha_mode: 'OPAQUE',
      alpha_cutoff: .5,
      double_sided: false,
      unlit: false,
      maps: {
        baseColor: writeMap(output, maps.color, tintedColor(maps.color, material.color.toArray())),
        normal: writeMap(output, maps.normal, maps.normal.data),
        metallicRoughness: writeMap(output, maps.roughness, packedRoughness(maps.roughness)),
      },
    };
    const materialId = 'shared-bark-' + hash(JSON.stringify(record)).slice(0, 24);
    return { recipe, reference: { version: 1, material_id: materialId }, record: { id: materialId, ...record },
      binding: { material_id: materialId, uv_policy: 'source_gltf_uv0_no_extra_flip' } };
  } finally {
    for (const texture of [material.map, material.normalMap, material.roughnessMap]) texture?.dispose();
    material.dispose();
  }
}

export function remapPveSharedBarkGeometry(mesh, recipe) {
  const geometry = mesh.geometry, sourceMaterial = mesh.material;
  const uv = geometry.getAttribute('uv');
  const hasMap = sourceMaterial.map || sourceMaterial.normalMap || sourceMaterial.roughnessMap
    || sourceMaterial.userData?.bark_pve_binding?.texture_transforms;
  if (uv && !sourceMaterial.importedTrunk && !hasMap) return geometry;
  const result = new THREE.BufferGeometry();
  result.setIndex(geometry.index);
  for (const [name, attribute] of Object.entries(geometry.attributes)) result.setAttribute(name, attribute);
  if (uv) result.setAttribute('uv', uv.clone());
  for (const group of geometry.groups) result.addGroup(group.start, group.count, group.materialIndex);
  result.setDrawRange(geometry.drawRange.start, geometry.drawRange.count);
  const projected = sourceMaterial.importedTrunk && projectUntexturedTrunkBarkUV(result, mesh.matrixWorld, recipe);
  if (!result.getAttribute('uv')) throw Error('共用树皮缺少 UV0');
  if (projected || bakeWholeTreeBarkUV(result, sourceMaterial)) {
    rebuildPveGeometryTangents(result);
    return result;
  }
  result.dispose();
  return geometry;
}

// Branch source files refer to the package's shared material instead of embedding
// an identical 2K set in every reusable GLB. Keep the existing bark slot name.
export function preparePveSharedBarkUnit(group, recipe) {
  const meshes = [];
  const material = new THREE.MeshStandardMaterial({ name: 'M_Bark', color: '#ffffff' });
  const restore = () => {
    for (const { mesh, sourceMaterial, sourceGeometry } of meshes) {
      if (mesh.geometry !== sourceGeometry) mesh.geometry.dispose();
      mesh.geometry = sourceGeometry;
      mesh.material = sourceMaterial;
    }
    material.dispose();
  };
  try {
    group.updateWorldMatrix(true, true);
    group.traverseVisible(mesh => {
      if (!mesh.isMesh || !isSharedTreeBarkMaterial(mesh.material)) return;
      meshes.push({ mesh, sourceMaterial: mesh.material, sourceGeometry: mesh.geometry });
      mesh.geometry = remapPveSharedBarkGeometry(mesh, recipe);
      mesh.material = material;
    });
    return restore;
  } catch (error) {
    restore();
    throw error;
  }
}
