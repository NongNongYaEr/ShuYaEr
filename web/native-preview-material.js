import {TangentSpaceNormalMap} from './vendor/three.module.min.js';

const previews = new WeakMap();

export function setNativePreviewMaterial(source, preview) {
  previews.set(source,preview);
}

export function nativePreviewMaterial(source) {
  return previews.get(source) ?? source;
}

export function nativeMaterialUnsupported(material,capabilities=null){
  if(material.isShaderMaterial||material.isRawShaderMaterial)return '自定义着色器';
  if(material.displacementMap||material.alphaMap||material.lightMap||material.envMap)return '扩展材质贴图';
  if((material.emissiveMap||material.aoMap||material.metalnessMap&&material.metalness>0||[material.map,material.normalMap,material.roughnessMap].some(t=>t?.userData.importedTrunk))&&capabilities?.gltf_pbr_protocol!==1)return 'GLB 材质需要更新 DX12 运行库';
  if(material.clearcoat>0||material.transmission>0||material.sheen>0||material.iridescence>0||material.anisotropy>0)return '扩展物理材质';
  if(material.clippingPlanes?.length||material.stencilWrite)return '材质裁切';
  if([material.map,material.normalMap,material.roughnessMap,material.metalnessMap,material.aoMap,material.emissiveMap].some(t=>t&&t.channel!==0))return '额外 UV 通道';
  if(material.normalMap&&material.normalMapType!==TangentSpaceNormalMap)return '物体空间法线';
  return null;
}
