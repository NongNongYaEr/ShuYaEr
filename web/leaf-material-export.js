import * as THREE from 'three';
import { leafTextureFiles, normalizeLeafMaterial } from './leaf-material-data.js';

// Export external texture references without a browser image decoder or repeated embedded images.
export function bindLeafExportTextures(material, raw, prefix, kind = 'leaf') {
  const m = normalizeLeafMaterial(raw), files = leafTextureFiles(m, prefix, kind);
  for (const file of files) {
    const texture = new THREE.Texture(); texture.name = file.name;
    texture.userData.branchforge_export = true; texture.userData.export_filename = file.name;
    material[file.key === 'color' ? 'map' : 'normalMap'] = texture;
  }
  if (m.color) material.color.set(material.vegetationTint || '#ffffff');
  material.alphaTest = m.color ? m.cutoff : 0; material.roughness = m.roughness;
  return files.map((file) => ({ ...file, slot: material.name }));
}
export function preserveLeafTextureNames(sceneData) {
  for (const entry of sceneData.textures?.textures?.values() || []) {
    if (entry.texture.userData.export_filename) entry.fileName = entry.texture.userData.export_filename;
  }
}
