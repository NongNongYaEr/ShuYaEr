import {createHash} from 'node:crypto';
import {validateSourcePbrSlots} from '../source-pbr-base.js';

const types = {1:'SCALAR', 2:'VEC2', 3:'VEC3', 4:'VEC4'};
const appearanceExtensions = new Set(['KHR_texture_transform', 'KHR_materials_emissive_strength', 'KHR_materials_unlit']);
const rgbaTextureKeys = ['baseColor', 'normal', 'orm'];
const align = length => (length + 3) & ~3;
const asBuffer = data => Buffer.from(data.buffer, data.byteOffset, data.byteLength);

function sourceBinary(sourceBytes) {
  const data = Buffer.from(sourceBytes);
  for (let offset = 12; offset + 8 <= data.length;) {
    const size = data.readUInt32LE(offset);
    const type = data.readUInt32LE(offset + 4);
    const end = offset + 8 + size;
    if (end > data.length) break;
    if (type === 0x004e4942) return data.subarray(offset + 8, end);
    offset = end;
  }
  throw Error('原材质 GLB 缺少内嵌数据。');
}

// Prefer the original local vertex order. Add a vertex only when the working
// atlas split that original vertex along a UV seam.
function assignWorkingVertices(source, mesh, range, localByWorking) {
  const {firstIndex, indexCount, firstVertex, vertexCount} = range;
  const working = new Array(vertexCount).fill(-1);
  const indices = new Uint32Array(indexCount);
  for (let i = 0; i < indexCount; i++) {
    const corner = firstIndex + i;
    const work = mesh.indices[corner];
    const sourceVertex = source.indices[corner];
    const local = sourceVertex - firstVertex;
    if (mesh.sourceIndices[work] !== sourceVertex || local < 0 || local >= vertexCount) {
      throw Error('叠加效果模型改变了原始材质分组的面角。');
    }
    if (localByWorking[work] < 0) {
      if (working[local] < 0) {
        localByWorking[work] = local;
        working[local] = work;
      } else {
        localByWorking[work] = working.length;
        working.push(work);
      }
    }
    indices[i] = localByWorking[work];
  }
  return {indices, working};
}

function copyAttribute(sourceData, workingData, range, working, components) {
  const {firstVertex, vertexCount} = range;
  if (!working) return sourceData.slice(firstVertex * components, (firstVertex + vertexCount) * components);
  const output = new Float32Array(working.length * components);
  for (let i = 0; i < working.length; i++) {
    const work = working[i];
    const data = work < 0 ? sourceData : workingData;
    const at = (work < 0 ? firstVertex + i : work) * components;
    for (let c = 0; c < components; c++) output[i * components + c] = data[at + c];
  }
  return output;
}

function packedMaterial(original, textures, emissiveStrength) {
  const material = {
    ...(original?.name == null ? {} : {name:original.name}),
    ...(original?.extras == null ? {} : {extras:original.extras}),
    pbrMetallicRoughness:{
      baseColorTexture:{index:textures.baseColor},
      metallicRoughnessTexture:{index:textures.orm},
      baseColorFactor:[1, 1, 1, 1],
      metallicFactor:1,
      roughnessFactor:1
    },
    normalTexture:{index:textures.normal, scale:1},
    occlusionTexture:{index:textures.orm, strength:1},
    doubleSided:!!original?.doubleSided
  };
  if (textures.emissive != null) {
    material.emissiveTexture = {index:textures.emissive};
    material.emissiveFactor = [1, 1, 1];
    material.extensions = {KHR_materials_emissive_strength:{emissiveStrength}};
  }
  return material;
}

function copyPreservedMaterials(original, sourceBytes, slots, add) {
  const bin = sourceBinary(sourceBytes);
  const materials = (original.materials ?? []).map(material => material?.name == null ? {} : {name:material.name});
  const samplers = [], textures = [], images = [];
  const imageIndices = new Map(), samplerIndices = new Map(), textureIndices = new Map(), copiedViews = new Map();
  const remap = (indices, output, index, copy) => {
    if (!indices.has(index)) indices.set(index, output.push(copy(index)) - 1);
    return indices.get(index);
  };
  const copyImage = index => {
    const image = original.images[index], view = original.bufferViews[image.bufferView];
    if (!copiedViews.has(image.bufferView)) {
      const offset = view.byteOffset ?? 0;
      copiedViews.set(image.bufferView, add(bin.subarray(offset, offset + view.byteLength)));
    }
    return {...image, bufferView:copiedViews.get(image.bufferView)};
  };
  const copyTexture = index => {
    const texture = original.textures[index];
    return {
      source:remap(imageIndices, images, texture.source, copyImage),
      ...(texture.sampler == null ? {} : {sampler:remap(samplerIndices, samplers, texture.sampler, i => original.samplers[i])}),
      ...(texture.name == null ? {} : {name:texture.name}),
      ...(texture.extras == null ? {} : {extras:texture.extras})
    };
  };
  for (const slot of slots) {
    if (slot < 0) continue;
    const material = structuredClone(original.materials[slot]);
    const pbr = material.pbrMetallicRoughness;
    for (const info of [pbr?.baseColorTexture, pbr?.metallicRoughnessTexture, material.normalTexture,
      material.occlusionTexture, material.emissiveTexture]) {
      if (info) info.index = remap(textureIndices, textures, info.index, copyTexture);
    }
    materials[slot] = material;
  }
  return {materials, samplers, textures, outputImages:images};
}

export function writeSourcePbrGLB(mesh, source, base, {images, emissiveStrength = 1, actualHeightMeters, name}) {
  const preservedSlots = validateSourcePbrSlots(base, source);
  const affected = new Set(base.affectedSlots);
  const {doc:original, primitives:ranges} = source.sourcePbr;
  const scale = actualHeightMeters == null ? 1 : actualHeightMeters / mesh.height;
  if (!(scale > 0 && Number.isFinite(scale))) throw Error('模型实际高度无效。');
  if (source.indices.length !== mesh.indices.length || mesh.sourceSHA256 !== source.sourceSHA256) {
    throw Error('叠加效果模型与原始 GLB 的面或来源不匹配。');
  }

  const chunks = [], bufferViews = [], accessors = [];
  let length = 0;
  const add = (data, target) => {
    const bytes = asBuffer(data);
    const offset = length;
    const bufferView = bufferViews.push({buffer:0, byteOffset:offset, byteLength:bytes.length, ...(target ? {target} : {})}) - 1;
    chunks.push({bytes, offset});
    length = align(length + bytes.length);
    return bufferView;
  };
  const attr = (data, components, {index = false, bounds = false} = {}) => {
    const accessor = {bufferView:add(data, index ? 34963 : 34962), componentType:index ? 5125 : 5126,
      count:data.length / components, type:types[components]};
    if (bounds) {
      accessor.min = Array(components).fill(Infinity);
      accessor.max = Array(components).fill(-Infinity);
      for (let i = 0; i < data.length; i++) {
        const c = i % components;
        accessor.min[c] = Math.min(accessor.min[c], data[i]);
        accessor.max[c] = Math.max(accessor.max[c], data[i]);
      }
    }
    return accessors.push(accessor) - 1;
  };

  const {materials, samplers, textures, outputImages} = copyPreservedMaterials(original, source.sourceBytes, preservedSlots, add);
  const extensionsUsed = new Set(original.extensionsUsed?.filter(name => appearanceExtensions.has(name)));
  const extensionsRequired = original.extensionsRequired?.filter(name => appearanceExtensions.has(name)) ?? [];
  const materialBySlot = new Map();
  if (affected.size) {
    if (rgbaTextureKeys.some(key => !images?.[key])) throw Error('叠加效果模型材质贴图不完整。');
    if (images.emissive && (!Number.isFinite(emissiveStrength) || emissiveStrength <= 0 || emissiveStrength > 320)) {
      throw Error('GLB 发光强度无效。');
    }
    const sampler = samplers.push({magFilter:9729, minFilter:9987, wrapS:33071, wrapT:33071}) - 1;
    const packed = {};
    for (const key of [...rgbaTextureKeys, ...(images.emissive ? ['emissive'] : [])]) {
      const source = outputImages.push({bufferView:add(images[key]), mimeType:'image/png', name:key}) - 1;
      packed[key] = textures.push({source, sampler}) - 1;
    }
    for (const slot of affected) {
      const material = packedMaterial(original.materials?.[slot], packed, emissiveStrength);
      const index = slot < 0 ? materials.push(material) - 1 : slot;
      materials[index] = material;
      materialBySlot.set(slot, index);
    }
    if (images.emissive) extensionsUsed.add('KHR_materials_emissive_strength');
  }

  const uvHash = createHash('sha256'), cornerUV = Buffer.alloc(64 * 1024);
  let pendingUV = 0;
  const localByWorking = affected.size ? new Int32Array(mesh.pos.length / 3).fill(-1) : null;
  const primitives = ranges.map(range => {
    const {firstIndex, indexCount, firstVertex, materialIndex, meshIndex, primitiveIndex} = range;
    const descriptor = original.meshes[meshIndex].primitives[primitiveIndex];
    const baked = affected.has(materialIndex);
    const geometry = baked ? assignWorkingVertices(source, mesh, range, localByWorking) : {
      indices:Uint32Array.from(source.indices.subarray(firstIndex, firstIndex + indexCount), vertex => vertex - firstVertex),
      working:null
    };
    const copy = (fromSource, fromWorking, components) => copyAttribute(fromSource, fromWorking, range, geometry.working, components);
    const positions = copy(source.pos, mesh.pos, 3);
    for (let i = 0; i < positions.length; i++) positions[i] *= scale;
    const attributes = {POSITION:attr(positions, 3, {bounds:true}), NORMAL:attr(copy(source.normal, mesh.normal, 3), 3)};
    if (baked || descriptor.attributes.TANGENT != null) attributes.TANGENT = attr(copy(source.tangent, mesh.tangent, 4), 4);
    const uv = copy(source.uv, mesh.uv, 2);
    if (baked || descriptor.attributes.TEXCOORD_0 != null) attributes.TEXCOORD_0 = attr(uv, 2);
    for (const index of geometry.indices) {
      cornerUV.writeFloatLE(uv[index * 2], pendingUV);
      cornerUV.writeFloatLE(uv[index * 2 + 1], pendingUV + 4);
      pendingUV += 8;
      if (pendingUV === cornerUV.length) {
        uvHash.update(cornerUV);
        pendingUV = 0;
      }
    }
    for (const key of ['TEXCOORD_1', 'COLOR_0', '_TML_SOURCE_COLOR_0']) {
      if (descriptor.attributes[key] == null) continue;
      if (baked && key === 'COLOR_0' && descriptor.attributes._TML_SOURCE_COLOR_0 != null) continue;
      const {data, components} = source.extraAttributes[key];
      const sourceComponents = original.accessors[descriptor.attributes[key]].type === 'VEC3' ? 3 : components;
      const copied = copy(data, mesh.extraAttributes[key].data, components);
      const outputKey = baked && key === 'COLOR_0' ? '_TML_SOURCE_COLOR_0' : key;
      const output = sourceComponents === components ? copied : Float32Array.from(
        {length:copied.length / components * sourceComponents},
        (_, i) => copied[Math.floor(i / sourceComponents) * components + i % sourceComponents]
      );
      attributes[outputKey] = attr(output, sourceComponents);
    }
    return {
      attributes, indices:attr(geometry.indices, 1, {index:true}), mode:4,
      ...(baked || materialIndex >= 0 ? {material:baked ? materialBySlot.get(materialIndex) : materialIndex} : {}),
      ...(descriptor.extras == null ? {} : {extras:descriptor.extras})
    };
  });
  const outputUvSHA256 = uvHash.update(cornerUV.subarray(0, pendingUV)).digest('hex');

  const doc = {
    asset:{...original.asset, generator:'TreeMaterialLab'}, scene:0, scenes:[{nodes:[0]}],
    nodes:[{mesh:0, name}], meshes:[{primitives}], buffers:[{byteLength:length}], bufferViews, accessors,
    ...(materials.length ? {materials} : {}), ...(samplers.length ? {samplers} : {}),
    ...(textures.length ? {textures} : {}), ...(outputImages.length ? {images:outputImages} : {}),
    ...(extensionsUsed.size ? {extensionsUsed:[...extensionsUsed]} : {}),
    ...(extensionsRequired.length ? {extensionsRequired} : {}),
    extras:{treeMaterialLab:{version:2, uvHashConvention:'sha256-uv0-triangle-corners-f32le-v1',
      sourceSHA256:mesh.sourceSHA256, uvSHA256:outputUvSHA256, workingUvSHA256:mesh.uvSHA256,
      materialBase:{...base, preservedSlots}, tangents:'MikkTSpace for baked slots; source tangents otherwise',
      sourceCoordinates:'glTF Y-up', scaleApplied:scale}}
  };
  const json = Buffer.from(JSON.stringify(doc));
  const jsonLength = align(json.length), binAt = 28 + jsonLength;
  const data = Buffer.alloc(binAt + length);
  data.writeUInt32LE(0x46546c67, 0);
  data.writeUInt32LE(2, 4);
  data.writeUInt32LE(data.length, 8);
  data.writeUInt32LE(jsonLength, 12);
  data.writeUInt32LE(0x4e4f534a, 16);
  json.copy(data, 20);
  data.fill(32, 20 + json.length, 20 + jsonLength);
  data.writeUInt32LE(length, 20 + jsonLength);
  data.writeUInt32LE(0x004e4942, 24 + jsonLength);
  for (const chunk of chunks) chunk.bytes.copy(data, binAt + chunk.offset);
  return {data, outputUvSHA256, preservedSlots};
}
