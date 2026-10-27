import * as THREE from 'three';
import { GLTFExporter } from './vendor/GLTFExporter.js';
import { normalizeLeafMaterial } from './leaf-material-data.js';
import { pveGlbMatrix } from './pve-export.js';
import { mergeGeometries } from './vendor/surface/utils/BufferGeometryUtils.js';

// Export textures own their images; never reuse an incompletely loaded preview map.
export async function bindGlbTextures(material, raw, cache = null) {
  const data = normalizeLeafMaterial(raw);
  for (const [key, slot] of [['color', 'map'], ['normal', 'normalMap']]) {
    if (!data[key]) continue;
    const cacheKey = key + ':' + data[key];
    const texture = cache?.get(cacheKey) || await new THREE.TextureLoader().loadAsync(data[key]);
    cache?.set(cacheKey, texture);
    texture.name = data[`${key}_name`] || `${material.name}_${key}`;
    texture.colorSpace = key === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.userData.branchforge_export = true;
    material[slot] = texture;
  }
  if (data.color) material.color.set(material.vegetationTint || '#ffffff');
  material.alphaTest = data.color ? data.cutoff : 0;
  material.roughness = data.roughness;
}

// The exporter combines roughness and metalness with drawImage, which cannot
// consume a DataTexture's { data, width, height } image. Rasterize only this
// export-owned copy; source textures and their physical UV transforms stay live.
export function prepareGlbBarkTexture(texture, { canvasFactory = () => document.createElement('canvas') } = {}) {
  if (!texture?.isDataTexture) return texture;
  const raw = texture.image;
  if (texture.format !== THREE.RGBAFormat || texture.type !== THREE.UnsignedByteType
      || !raw?.data || raw.data.length !== raw.width * raw.height * 4) {
    throw new Error('树皮导出需要完整的 RGBA 像素贴图');
  }
  const canvas = canvasFactory();
  canvas.width = raw.width;
  canvas.height = raw.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建树皮导出贴图');
  const pixels = context.createImageData(raw.width, raw.height);
  pixels.data.set(raw.data);
  context.putImageData(pixels, 0, 0);
  const copy = new THREE.CanvasTexture(canvas);
  copy.copy(texture);
  // Texture.copy shares Source; assigning image would replace the live map too.
  copy.source = new THREE.Source(canvas);
  copy.needsUpdate = true;
  return copy;
}

export function createGlbExportScene(root, { connector = null, singleMesh = false, rasterizeBarkTextures = false } = {}) {
  const scene = new THREE.Scene();
  scene.name = root.name;
  const geometries = [];
  const exportMaterials = new Map();
  const exportTextures = new Map();
  function exportMaterial(material) {
    if (!material?.userData?.bark_material) return material;
    if (!exportMaterials.has(material)) {
      const copy = material.clone();
      delete copy.userData.bark_material;
      if (rasterizeBarkTextures && material.roughnessMap?.isDataTexture) {
        if (!exportTextures.has(material.roughnessMap)) {
          exportTextures.set(material.roughnessMap, prepareGlbBarkTexture(material.roughnessMap));
        }
        copy.roughnessMap = exportTextures.get(material.roughnessMap);
      }
      exportMaterials.set(material, copy);
    }
    return exportMaterials.get(material);
  }
  if (connector || singleMesh) {
    const frame = connector ? pveGlbMatrix(connector) : new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    const materials = [], groups = [];
    let indexOffset = 0;
    root.updateWorldMatrix(true, true);
    root.traverseVisible((object) => {
      if (!object.isMesh) return;
      const geometry = object.geometry.clone();
      geometries.push(geometry);
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(frame, object.matrixWorld));
      const slots = Array.isArray(object.material) ? object.material : [object.material];
      const slotIndices = slots.map((material) => {
        if (!materials.includes(material)) materials.push(material);
        return materials.indexOf(material);
      });
      const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
      const ranges = Array.isArray(object.material) && geometry.groups.length ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
      for (const range of ranges) groups.push({ start: indexOffset + range.start, count: range.count, materialIndex: slotIndices[range.materialIndex] });
      indexOffset += count;
    });
    const merged = geometries.length ? mergeGeometries(geometries, false) : null;
    if (!merged) {
      geometries.forEach((geometry) => geometry.dispose());
      throw new Error('无法合并完整模型，请检查网格属性');
    }
    geometries.push(merged);
    for (const group of groups) merged.addGroup(group.start, group.count, group.materialIndex);
    // One mesh, multiple material slots. No parent rotations for the importer to lose.
    const mesh = new THREE.Mesh(merged, materials);
    mesh.name = root.name;
    if (Number.isInteger(root.userData.lod)) mesh.userData.lod = root.userData.lod;
    scene.add(mesh);
    if (connector) scene.userData = { pve_target: 'UE 5.8', ue_growth_axis: '+Z', ue_face_axis: '+Y', pivot: 'connector_at_origin' };
  } else {
    const copy = root.clone(true);
    // The generator uses Z-up metres; glTF uses Y-up metres.
    const axis = new THREE.Group();
    axis.name = 'BranchForge_Z_to_Y';
    axis.rotation.x = -Math.PI / 2;
    axis.add(copy);
    scene.add(axis);
    copy.traverse((object) => {
      if (!object.isMesh) return;
      const geometry = object.geometry.clone();
      geometries.push(geometry);
      object.geometry = geometry;
    });
  }
  scene.traverse((object) => {
    if (!object.isMesh) return;
    object.material = Array.isArray(object.material) ? object.material.map(exportMaterial) : exportMaterial(object.material);
    const geometry = object.geometry;
    // COLOR_0 always tints a glTF material. Our vertex RGBA contains wind data,
    // not visible colour; preserve it as a custom attribute instead.
    if (geometry.hasAttribute('color')) {
      geometry.setAttribute('_BRANCH_WIND', geometry.getAttribute('color'));
      geometry.deleteAttribute('color');
    }
  });
  scene.updateMatrixWorld(true);
  return { scene, dispose: () => { geometries.forEach(geometry => geometry.dispose()); exportMaterials.forEach(material => material.dispose()); exportTextures.forEach(texture => texture.dispose()); } };
}

export async function exportGlb(root, options = {}) {
  const { scene, dispose } = createGlbExportScene(root, { ...options, rasterizeBarkTextures: true });
  try {
    return await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true });
  } finally {
    dispose();
  }
}

export function modelOutputPath(path, format) {
  const extension = format === 'GLB' ? '.glb' : '.fbx';
  return /\.(fbx|glb)$/i.test(path) ? path.replace(/\.(fbx|glb)$/i, extension) : path + extension;
}
