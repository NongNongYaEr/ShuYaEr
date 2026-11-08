import * as THREE from 'three';
import {GLTFLoader} from './vendor/surface/loaders/GLTFLoader.js';
import {MAX_POT_BYTES,potFileSizeMessage} from './bonsai-pot-data.js';
import {nativeMaterialUnsupported,nativePreviewMaterial,setNativePreviewMaterial} from './native-preview-material.js';
import {setNativePreviewUv} from './native-preview-geometry.js';
import {createPotImagePreview} from './bonsai-pot-images.js';

const NATIVE_GLTF = {gltf_pbr_protocol:1};
const NATIVE_MAPS = ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap'];
// Native texture uploads are indivisible. Allow at most 64 MiB of RGBA per preview map.
const MAX_NATIVE_PREVIEW_PIXELS = 4096 * 4096;

function uvAttribute(channel) {
  return channel === 0 ? 'uv' : 'uv' + channel;
}

function needsSmallerPreview(texture) {
  const image = texture?.image;
  return image && image.width * image.height > MAX_NATIVE_PREVIEW_PIXELS;
}

function createPotNativePreview(material,channel,texturePreviews) {
  if (!nativeMaterialUnsupported(material,NATIVE_GLTF) && !NATIVE_MAPS.some(slot => needsSmallerPreview(material[slot]))) return null;
  const preview = material.isMeshPhysicalMaterial ? new THREE.MeshStandardMaterial().copy(material) : material.clone();
  for (const slot of NATIVE_MAPS) {
    const texture = preview[slot];
    if (!texture) continue;
    if (texture.channel !== channel) preview[slot] = null;
    else if (channel !== 0 || needsSmallerPreview(texture)) {
      let mapped = texturePreviews.get(texture);
      if (!mapped) {
        mapped = texture.clone();
        mapped.channel = 0;
        if (needsSmallerPreview(texture)) {
          const image = texture.image;
          const scale = Math.sqrt(MAX_NATIVE_PREVIEW_PIXELS / (image.width * image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1,Math.floor(image.width * scale));
          canvas.height = Math.max(1,Math.floor(image.height * scale));
          canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
          // Cloned textures share their source until explicitly detached.
          mapped.source = new THREE.Source(canvas);
          mapped.needsUpdate = true;
        }
        texturePreviews.set(texture,mapped);
      }
      preview[slot] = mapped;
    }
  }
  preview.displacementMap = preview.alphaMap = preview.lightMap = preview.envMap = null;
  preview.clippingPlanes = null;
  preview.stencilWrite = false;
  if (preview.normalMapType !== THREE.TangentSpaceNormalMap) preview.normalMap = null;
  if (material.transmission > 0 && !preview.alphaTest) {
    preview.transparent = true;
    preview.opacity *= 1 - .65 * material.transmission;
    preview.depthWrite = false;
  }
  return preview;
}

export function potBytes(encoded) {
  const raw = atob(encoded), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

export function potBase64(bytes) {
  const data = new Uint8Array(bytes), chunks = [];
  const chunkSize = 3 * 8192;
  for (let i = 0; i < data.length; i += chunkSize) chunks.push(btoa(String.fromCharCode(...data.subarray(i, i + chunkSize))));
  return chunks.join('');
}

export function disposePotModel(root) {
  const geometry = new Set(), materials = new Set(), textures = new Set(), images = new Set();
  root.traverse(object => {
    if (!object.isMesh) return;
    geometry.add(object.geometry);
    for (const source of [object.material].flat()) {
      for (const material of [source,nativePreviewMaterial(source)]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    }
  });
  geometry.forEach(value => value.dispose());
  materials.forEach(value => value.dispose());
  textures.forEach(value => { images.add(value.image); value.dispose(); });
  images.forEach(value => value?.close?.());
}

export async function loadPotModel(bytes) {
  if (bytes.byteLength > MAX_POT_BYTES) throw Error(potFileSizeMessage(bytes.byteLength));
  if (bytes.byteLength < 20) throw Error('花盆文件不是有效的 GLB。');
  const header = new DataView(bytes);
  if (header.getUint32(0,true) !== 0x46546c67 || header.getUint32(4,true) !== 2 || header.getUint32(8,true) !== bytes.byteLength)
    throw Error('花盆文件不是有效的 GLB。');
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    if (/^(blob:|data:)/.test(url)) return url;
    throw Error('花盆的网格和贴图须内嵌在同一个 GLB 中。');
  });
  const loader = new GLTFLoader(manager);
  const imagePreview = createPotImagePreview(loader,manager);
  const axis = new THREE.Group();
  axis.rotation.x = Math.PI / 2;
  const content = new THREE.Group();
  content.add(axis);
  try {
    const {scene, animations} = await loader.parseAsync(bytes, '');
    axis.add(scene);
    imagePreview.check();
    let triangles = 0, unsupported = animations.length > 0;
    const extras = [], materialMeshes = new Map(), images = new Set();
    scene.traverse(object => {
      if (object.isLight || object.isCamera) extras.push(object);
      if (!object.isMesh) return;
      if (object.isSkinnedMesh || object.isInstancedMesh || object.morphTargetInfluences?.length) unsupported = true;
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
      for (const material of [object.material].flat()) {
        if (!materialMeshes.has(material)) materialMeshes.set(material,[]);
        materialMeshes.get(material).push(object);
      }
    });
    for (const material of materialMeshes.keys()) for (const texture of Object.values(material)) {
      if (!texture?.isTexture) continue;
      if (Math.max(texture.image?.width || 0,texture.image?.height || 0) > 8192) throw Error('花盆贴图单边请控制在 8192 像素以内。');
      images.add(texture.image);
    }
    extras.forEach(object => object.removeFromParent());
    if (unsupported || !triangles || triangles > 250000) throw Error('花盆须为静态网格，三角面请控制在 25 万以内。');
    const bounds = new THREE.Box3().setFromObject(content,true);
    if (bounds.isEmpty() || ![...bounds.min,...bounds.max].every(Number.isFinite) || bounds.getSize(new THREE.Vector3()).lengthSq() < 1e-12)
      throw Error('花盆模型尺寸无效。');
    const point = bounds.getCenter(new THREE.Vector3());
    point.z = bounds.max.z;
    let hasNativeMaterialFallback = false;
    const texturePreviews = new Map();
    for (const [material,meshes] of materialMeshes) {
      // The loader gives each glTF primitive its own mesh and material.
      // Prefer the color map if the primitive uses several UV channels.
      const texture = NATIVE_MAPS.map(slot => material[slot]).find(map =>
        map && meshes.every(mesh => mesh.geometry.hasAttribute(uvAttribute(map.channel))));
      const channel = texture?.channel ?? 0;
      const preview = createPotNativePreview(material,channel,texturePreviews);
      if (!preview) continue;
      setNativePreviewMaterial(material,preview);
      if (channel !== 0) {
        for (const mesh of meshes) setNativePreviewUv(mesh,mesh.geometry.getAttribute(uvAttribute(channel)));
      }
      hasNativeMaterialFallback = true;
    }
    imagePreview.finish(images);
    return {root:content,axis,bounds,planting:point.toArray(),hasNativeMaterialFallback,hasReducedImages:imagePreview.reduced};
  } catch (error) {
    disposePotModel(content);
    imagePreview.finish();
    throw error;
  }
}

export function applyPotTransform(model, value) {
  model.root.position.fromArray(value.position);
  model.root.quaternion.fromArray(value.rotation);
  model.root.scale.setScalar(value.scale);
  model.axis.position.fromArray(value.planting).negate();
  model.root.updateWorldMatrix(true,true);
}
