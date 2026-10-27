import * as THREE from 'three';
import { GLTFLoader } from './vendor/surface/loaders/GLTFLoader.js';
import { normalizePlantUnit, geometryExtent } from './plant-unit-data.js';
import { normalizeLeafMaterial } from './leaf-material-data.js';

const fingerprints = new Map();
async function textureFingerprint(data) {
  if (!fingerprints.has(data)) {
    const pending = (async () => {
      const image = new Image(); image.src = data; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const digest = await crypto.subtle.digest('SHA-256', pixels);
      return `${canvas.width}x${canvas.height}:` + Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
    })();
    fingerprints.set(data, pending);
    if (fingerprints.size > 4) fingerprints.delete(fingerprints.keys().next().value);
    pending.catch(() => fingerprints.delete(data));
  }
  return fingerprints.get(data);
}
export async function samePlantTexture(first, second) {
  if (first === second) return true;
  if (!first || !second) return false;
  return await textureFingerprint(first) === await textureFingerprint(second);
}

export async function imageFileData(file) {
  if (file.size > 64 * 1024 * 1024) throw Error('单张贴图请控制在 64 MB 内');
  const image = await createImageBitmap(file);
  try { return imagePng(image); } finally { image.close(); }
}
function imagePng(image, factor = null) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width || image.naturalWidth; canvas.height = image.height || image.naturalHeight;
  if (!canvas.width || !canvas.height || canvas.width > 8192 || canvas.height > 8192) throw Error('贴图尺寸应不超过 8192 像素');
  const ctx = canvas.getContext('2d', { willReadFrequently: !!factor }); ctx.drawImage(image, 0, 0);
  if (factor && (factor.r !== 1 || factor.g !== 1 || factor.b !== 1)) {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const linear = x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
    const srgb = x => x <= .0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - .055;
    const channels = [factor.r, factor.g, factor.b];
    for (let i = 0; i < pixels.data.length; i += 4) for (let c = 0; c < 3; c++) pixels.data[i + c] = Math.round(srgb(linear(pixels.data[i + c] / 255) * channels[c]) * 255);
    ctx.putImageData(pixels, 0, 0);
  }
  return canvas.toDataURL('image/png');
}

export async function importPlantGlb(file, { role = 'LEAF', axis = 'Y', reuseMaterial = false, sourceMode = false } = {}) {
  if (!/\.glb$/i.test(file.name) || file.size > 80 * 1024 * 1024) throw Error('请选择 80 MB 内、资源内嵌的静态 GLB');
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => { if (/^(blob:|data:)/.test(url)) return url; throw Error('GLB 需要内嵌网格和贴图'); });
  const root = (await new GLTFLoader(manager).parseAsync(await file.arrayBuffer(), '')).scene;
  const geometries = new Set(), materials = new Set(), textures = new Set();
  try {
    root.updateMatrixWorld(true);
    const meshes = [];
    root.traverse(o => { if (o.isMesh) { meshes.push(o); geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { materials.add(m); for (const v of Object.values(m)) if (v?.isTexture) textures.add(v); } } });
    if (!meshes.length) throw Error('GLB 中没有网格');
    const source = [...materials][0];
    if (!reuseMaterial && [...materials].some(m => m.map?.image !== source.map?.image || !m.color.equals(source.color))) throw Error('该 GLB 包含不同材质。请先合并为一张图集，或勾选复用当前植物共享材质');
    if(sourceMode&&[...materials].some(m=>m.normalMap?.image!==source.normalMap?.image||Math.abs(m.roughness-source.roughness)>1e-5||Math.abs((m.alphaTest||.4)-(source.alphaTest||.4))>1e-5))throw Error('整包整理需要一套共享颜色、法线和材质参数，请先统一材质后导入');
    const material = normalizeLeafMaterial({
      color: source.map ? imagePng(source.map.image, source.color) : '', color_name: source.map?.name || file.name + ' 颜色图集',
      normal: source.normalMap ? imagePng(source.normalMap.image) : '', normal_name: source.normalMap?.name || '',
      roughness: source.roughness, cutoff: source.alphaTest || .4,
    });
    const position = [], normal = [], uv = [], index = [];
    const direction = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1], '-X': [-1, 0, 0], '-Y': [0, -1, 0], '-Z': [0, 0, -1] }[axis];
    if (!direction) throw Error('未知生长方向');
    const orient = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...direction), new THREE.Vector3(0, 1, 0)));
    // GLB uses Y-up; the axis selector names the original Blender Z-up axes.
    orient.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    for (const o of meshes) {
      if (o.isSkinnedMesh || o.isInstancedMesh || o.geometry.morphAttributes.position?.length) throw Error('请先在 Blender 中应用变形并导出静态网格');
      const g = o.geometry, p = g.attributes.position, coords = g.attributes[sourceMode&&source.map?.channel?'uv'+source.map.channel:'uv'];
      if (!p || !coords) throw Error('每个单元必须有 UV，不能只导入白模');
      if(sourceMode&&source.normalMap&&(source.normalMap.channel||0)!==(source.map?.channel||0))throw Error('颜色与法线需要使用同一套 UV 后再进行整理');
      if(sourceMode&&g.attributes.color&&Array.from(g.attributes.color.array).some(v=>Math.abs(v-1)>1e-5))throw Error('请先把模型顶点色烘焙到共享颜色图集，再进行整包整理');
      if (!g.attributes.normal) g.computeVertexNormals();
      const matrix = orient.clone().multiply(o.matrixWorld), normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
      const count = g.index?.count || p.count;
      if (index.length + count > (sourceMode?1500000:180000) || count % 3) throw Error(sourceMode?'整包最多 50 万三角面':'单个单元最多 6 万三角面');
      const vertices = new Map();
      for (let i = 0; i < count; i += 3) for (const corner of matrix.determinant() < 0 ? [0, 2, 1] : [0, 1, 2]) {
        const at = g.index ? g.index.getX(i + corner) : i + corner;
        const group = g.groups.find(group => i >= group.start && i < group.start + group.count);
        const key = at + ':' + (group?.materialIndex || 0);
        if (vertices.has(key)) { index.push(vertices.get(key)); continue; }
        if (position.length / 3 >= (sourceMode?500000:50000)) throw Error(sourceMode?'整包最多 50 万顶点，请先简化网格':'单个单元最多 5 万顶点，请先简化网格');
        const point = new THREE.Vector3().fromBufferAttribute(p, at).applyMatrix4(matrix);
        const n = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, at).applyMatrix3(normalMatrix).normalize();
        const m = Array.isArray(o.material) ? o.material[group?.materialIndex || 0] : o.material;
        const coord = new THREE.Vector2().fromBufferAttribute(coords, at);
        if (m.map) { m.map.updateMatrix(); coord.applyMatrix3(m.map.matrix); }
        // The app's PNG TextureLoader uses flipY=true, while glTF uses false.
        if (m.map?.flipY !== true) coord.y = 1 - coord.y;
        vertices.set(key, position.length / 3); index.push(position.length / 3); position.push(...point.toArray()); normal.push(...n.toArray()); uv.push(...coord.toArray());
      }
    }
    const geometry = { position, normal, uv, index, source_name: file.name };
    const size = geometryExtent(geometry).longest;
    if(sourceMode&&(!(size>1e-8)||![position,normal,uv].every(values=>values.every(Number.isFinite))))throw Error('源 GLB 含无效坐标、法线或 UV，请检查模型后重新导入');
    if(sourceMode)return {geometry,material,measured_size:size};
    return { unit: normalizePlantUnit({ id: crypto.randomUUID(), name: file.name.replace(/\.glb$/i, ''), role, geometry,
      size_m: size, source_file: file.name }), material, measured_size: size };
  } finally {
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    textures.forEach(t => { t.dispose(); t.image?.close?.(); });
  }
}
