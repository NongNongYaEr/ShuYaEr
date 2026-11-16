import * as THREE from 'three';
import { normalizeLeafMaterial } from './leaf-material-data.js';
import { trunkSurfaceTangents } from './trunk-surface-tangents.js';
import {
  bakeWholeTreeBarkUV, createWholeTreeSharedBark, isSharedTreeBarkMaterial, projectUntexturedTrunkBarkUV,
} from './whole-tree-shared-bark.js';
import { encodeRGBA8PNG, encodeTexture } from './vendor/fbx-exporter/data/textureEncoder.js';

const FBX_BARK_CHANNELS = [
  ['color', 'map', 'sRGB'], ['normal', 'normalMap', 'linear'],
  ['roughness', 'roughnessMap', 'linear'], ['occlusion', 'aoMap', 'linear'],
  ['emissive', 'emissiveMap', 'sRGB'],
];

function refreshTangents(geometry) {
  if (!geometry.index || !geometry.getAttribute('normal') || !geometry.getAttribute('uv')) return;
  geometry.computeTangents();
  const old = geometry.getAttribute('tangent');
  const values = trunkSurfaceTangents(geometry.getAttribute('normal').array, old.array);
  if (values !== old.array) geometry.setAttribute('tangent', new THREE.BufferAttribute(values, 4));
  else old.needsUpdate = true;
}

async function writeFbxTexture(texture) {
  if (texture.flipY !== false) return (await encodeTexture(texture)).bytes;
  const image = texture.image, width = image.width, height = image.height;
  // FBX uses the lower-left UV origin, whereas these source rows are stored
  // in the order sampled by unflipped GLB/DataTexture images.
  if (texture.isDataTexture) {
    const stride = width * 4, reversed = new Uint8Array(image.data.length);
    for (let row = 0; row < height; row++) {
      reversed.set(image.data.subarray(row * stride, (row + 1) * stride), (height - 1 - row) * stride);
    }
    return encodeRGBA8PNG(reversed, width, height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.setTransform(1, 0, 0, -1, 0, height);
  context.drawImage(image, 0, 0);
  const png = await new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(Error('树皮贴图无法编码为 PNG'));
  }, 'image/png'));
  return new Uint8Array(await png.arrayBuffer());
}

export function createWholeTreeBarkExport(authoring) {
  const baked = new Map(), leaves = new Map(), textureIds = new Map(), leafKeys = new Map();
  let shared;

  function textureId(value) {
    if (!textureIds.has(value)) textureIds.set(value, textureIds.size);
    return textureIds.get(value);
  }

  function canonicalLeaf(material) {
    if (!leafKeys.has(material)) {
      const maps = normalizeLeafMaterial(material.sampleLeafMaterial || authoring.leaf_material);
      // Exact-equivalent clones from the same leaf/flower/fruit pack may
      // share a slot. Separate packs, render settings and tints stay distinct.
      const color = maps.color ? new THREE.Color(material.vegetationTint || '#ffffff') : material.color;
      leafKeys.set(material, JSON.stringify([
        textureId(maps.color || material.map), textureId(maps.normal || material.normalMap), color?.toArray(),
        maps.color ? maps.cutoff : 0, maps.roughness, material.side, material.transparent, material.opacity,
        material.vertexColors, material.metalness, material.normalScale?.toArray(),
        Boolean(material.userData.base_branch_atlas), maps.merge_unit_materials === true,
      ]));
    }
    const key = leafKeys.get(material);
    if (!leaves.has(key)) leaves.set(key, material);
    return leaves.get(key);
  }

  function retainBakedTrunk(mesh, material) {
    const { asset, index } = material.importedTrunk;
    const { id, name, ...surface } = asset.materials[index];
    const key = JSON.stringify([asset.source.sha256, surface, material.vertexColors]);
    if (!baked.has(key)) {
      material.name = baked.size ? `M_BakedTrunk_${baked.size + 1}` : 'M_BakedTrunk';
      baked.set(key, material);
    }
    mesh.material = baked.get(key);
    if (material.vertexColors) mesh.userData.branchforge_color_is_display = true;
  }

  return {
    async apply(asset) {
      const wood = [];
      asset.group.updateMatrixWorld(true);
      if (asset.materials.leaf?.name === 'M_Leaf') canonicalLeaf(asset.materials.leaf);
      asset.group.traverse(mesh => {
        if (!mesh.isMesh || mesh.userData.category === 'tree_light' || mesh.material?.userData?.meshUnit || Array.isArray(mesh.material)) return;
        const material = mesh.material;
        if (mesh.userData.attachment_type !== 'THORN' && isSharedTreeBarkMaterial(material)) wood.push(mesh);
        else if (mesh.userData.imported_trunk && material?.importedTrunk) retainBakedTrunk(mesh, material);
        else if (material?.name === 'M_Leaf' || material?.sampleLeafMaterial) mesh.material = canonicalLeaf(material);
      });
      if (!wood.length) {
        asset.exportBarkMaterial = baked.values().next().value;
        return;
      }
      shared ||= await createWholeTreeSharedBark(authoring);
      asset.exportBarkMaterial = shared.material;
      for (const mesh of wood) {
        const source = mesh.material, geometry = mesh.geometry;
        const sourceMap = source.map || source.normalMap || source.roughnessMap;
        if (mesh.userData.imported_trunk && projectUntexturedTrunkBarkUV(geometry, mesh.matrixWorld, shared.recipe)) {
          refreshTangents(geometry);
        } else {
          bakeWholeTreeBarkUV(geometry, source);
          if (sourceMap?.rotation || sourceMap?.repeat.x < 0 || sourceMap?.repeat.y < 0) refreshTangents(geometry);
        }
        mesh.material = shared.material;
        delete mesh.userData.branchforge_color_is_display;
      }
    },
    async fbxTextures(prefix) {
      const names = new Map(), files = [], bindings = [];
      const materials = [...(shared ? [shared.material] : []), ...baked.values()];
      for (const material of materials) {
        for (const [key, field, colorSpace] of FBX_BARK_CHANNELS) {
          const texture = material[field];
          if (!texture) continue;
          const packed = field === 'roughnessMap' && material.metalnessMap === texture;
          const channel = packed ? material.aoMap === texture ? 'orm' : 'metallic-roughness' : key;
          let name = names.get(texture);
          if (!name) {
            name = `${prefix}.${material.name}-${channel}.png`;
            texture.userData.export_filename = name;
            names.set(texture, name);
            files.push({ name, bytes: await writeFbxTexture(texture) });
          }
          bindings.push({ slot: material.name, key: channel, name, color_space: colorSpace });
        }
      }
      return { files, bindings };
    },
    dispose() {
      if (!shared) return;
      for (const field of ['map', 'normalMap', 'roughnessMap']) shared.material[field]?.dispose();
      shared.material.dispose();
    },
  };
}
