import { Buffer } from 'node:buffer';

// PVE imports the packed complete StaticMesh directly. Keep the authored PBR
// maps as original compressed image bytes without a browser or a texture bake.
export async function exportPveMeshUnit({ source, model, THREE, GLTFExporter, mergeGeometries, frame }) {
  const scene = new THREE.Scene();
  const geometries = [], materials = [], groups = [];
  let indexOffset = 0;
  model.updateMatrixWorld(true);
  model.traverseVisible(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(frame, mesh.matrixWorld));
    geometries.push(geometry);
    const materialIndex = materials.includes(mesh.material) ? materials.indexOf(mesh.material) : materials.push(mesh.material) - 1;
    const count = geometry.index?.count;
    if (!count || count % 3 || Array.isArray(mesh.material)) throw Error('静态装配单元缺少三角面或独立材质槽：' + source.name);
    groups.push([indexOffset, count, materialIndex]);
    indexOffset += count;
  });
  const allAttributes = new Map();
  for (const geometry of geometries) for (const [key, attribute] of Object.entries(geometry.attributes)) {
    allAttributes.set(key, Math.max(attribute.itemSize, allAttributes.get(key) || 0));
  }
  let merged;
  try {
    for (const geometry of geometries) for (const [key, size] of allAttributes) {
      const attribute = geometry.getAttribute(key);
      const vertices = geometry.getAttribute('position').count;
      if (attribute?.itemSize === size && attribute.array instanceof Float32Array && !attribute.normalized) continue;
      const values = new Float32Array(vertices * size);
      for (let i = 0; i < vertices; i++) for (let c = 0; c < size; c++) {
        values[i * size + c] = attribute && c < attribute.itemSize ? attribute.getComponent(i, c)
          : (key === 'color' || (key === 'tangent' && c === 3)) ? 1 : 0;
      }
      geometry.setAttribute(key, new THREE.BufferAttribute(values, size));
    }
    merged = geometries.length && mergeGeometries(geometries, false);
    if (!merged) throw Error('静态装配单元无法保留完整网格：' + source.name);
    for (const range of groups) merged.addGroup(...range);
    const mesh = new THREE.Mesh(merged, materials);
    mesh.name = source.id;
    scene.add(mesh);
    const exporter = new GLTFExporter().register(writer => {
      const images = new Map(), textures = new Map();
      async function textureInfo(descriptor) {
        let image = images.get(descriptor.image);
        if (image === undefined) {
          const value = source.model.images[descriptor.image];
          const raw = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value?.data || '');
          if (!raw) throw Error('完整单元贴图缺失或格式无效：' + source.name);
          const mime = raw[1];
          const bufferView = await writer.processBufferViewImage(new Blob([Buffer.from(raw[2], 'base64')], { type: mime }));
          image = (writer.json.images ??= []).push({ bufferView, mimeType: mime }) - 1;
          images.set(descriptor.image, image);
        }
        const key = JSON.stringify([image, descriptor.sampler]);
        let index = textures.get(key);
        if (index === undefined) {
          const sampler = (writer.json.samplers ??= []).push(descriptor.sampler || {}) - 1;
          const def = { sampler, source: image };
          if (writer.json.images[image].mimeType === 'image/webp') {
            delete def.source;
            def.extensions = { EXT_texture_webp: { source: image } };
            writer.extensionsUsed.EXT_texture_webp = true;
            writer.extensionsRequired.EXT_texture_webp = true;
          }
          index = (writer.json.textures ??= []).push(def) - 1;
          textures.set(key, index);
        }
        const result = { index };
        const channel = descriptor.channel ?? descriptor.texCoord ?? 0;
        if (channel) result.texCoord = channel;
        const transform = {};
        if (descriptor.offset?.some(v => v !== 0)) transform.offset = descriptor.offset;
        if (descriptor.scale?.some(v => v !== 1)) transform.scale = descriptor.scale;
        if (descriptor.rotation) transform.rotation = descriptor.rotation;
        if (Object.keys(transform).length) {
          result.extensions = { KHR_texture_transform: transform };
          writer.extensionsUsed.KHR_texture_transform = true;
        }
        return result;
      }
      return {
        async writeMaterialAsync(material, output) {
          const descriptor = source.model.materials[material.importedTrunk?.index];
          if (!descriptor) throw Error('完整单元缺少 PBR 材质：' + source.name);
          const pbr = output.pbrMetallicRoughness ??= {};
          pbr.baseColorFactor = descriptor.color;
          pbr.metallicFactor = descriptor.metalness ?? 0;
          pbr.roughnessFactor = descriptor.roughness ?? 1;
          if (descriptor.baseColor) pbr.baseColorTexture = await textureInfo(descriptor.baseColor);
          if (descriptor.metallicRoughness) pbr.metallicRoughnessTexture = await textureInfo(descriptor.metallicRoughness);
          if (descriptor.normal) output.normalTexture = { ...await textureInfo(descriptor.normal), scale: descriptor.normalScale ?? 1 };
          if (descriptor.occlusion) output.occlusionTexture = { ...await textureInfo(descriptor.occlusion), strength: descriptor.occlusionStrength ?? 1 };
          if (descriptor.emissive) output.emissiveTexture = await textureInfo(descriptor.emissive);
          output.alphaMode = descriptor.alphaMode || 'OPAQUE';
          if (output.alphaMode === 'MASK') output.alphaCutoff = descriptor.alphaCutoff ?? 0.5;
          output.doubleSided = descriptor.doubleSided === true;
          output.name = descriptor.name || 'Material_' + material.importedTrunk.index;
        },
      };
    });
    const bytes = await exporter.parseAsync(scene, { binary: true, onlyVisible: true });
    return { bytes: Buffer.from(bytes), triangles: indexOffset / 3 };
  } finally {
    for (const geometry of geometries) geometry.dispose();
    merged?.dispose();
  }
}
