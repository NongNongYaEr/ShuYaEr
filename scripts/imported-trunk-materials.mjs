import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import { BASE_BRANCH_BARK_SLOT, BASE_BRANCH_SHARED_SLOT } from '../web/base-branch-export-materials.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function createImportedTrunkMaterialExporter(output){
 const records=new Map(),images=new Map(),barkAtlasBindings=new WeakMap(),sharedAtlasBindings=new WeakMap();
 const image=source=>{const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(source.data);if(!match)throw Error('树干贴图必须内嵌');const bytes=Buffer.from(match[2],'base64'),sha256=hash(bytes);if(!images.has(sha256)){const file='trunk-image-'+sha256.slice(0,24)+'.'+(match[1]==='jpeg'?'jpg':match[1]);fs.writeFileSync(path.join(output,file),bytes);images.set(sha256,{file,sha256,bytes:bytes.length});}return images.get(sha256);};
 function atlasMaterial(material, shared){
  const atlasBindings = shared ? sharedAtlasBindings : barkAtlasBindings;
  if (atlasBindings.has(material)) return atlasBindings.get(material);
  const atlas = material.sampleLeafMaterial;
  const maps = {};
  for (const [slot, source] of [['baseColor', atlas?.color], ['normal', atlas?.normal]]) {
   if (!source) continue;
   const data = typeof source === 'string' ? source : source.data;
   const exactType = data.startsWith('data:image/png;base64,/9j/') ? data.replace('image/png', 'image/jpeg') : data;
   maps[slot] = {
    ...image({ data: exactType }), offset: [0, 0], scale: [1, 1], rotation: 0,
    sampler: { wrapS: 33071, wrapT: 33071 },
   };
  }
  if (!Object.keys(maps).length) throw Error('基础枝木质图集缺少贴图');
  const data = {
   name: shared ? BASE_BRANCH_SHARED_SLOT : BASE_BRANCH_BARK_SLOT,
   ...(shared ? { unit_atlas_role: 'shared' } : { unit_bark_role: 'atlas' }),
   base_color_linear: [...material.color.toArray(), 1],
   roughness: material.roughness, metalness: material.metalness, normal_scale: material.normalScale.x,
   occlusion_strength: 1, emissive_factor: [0, 0, 0], alpha_mode: 'OPAQUE', alpha_cutoff: .5,
   double_sided: true, unlit: false, maps,
  };
  const id = (shared ? 'unit-atlas-' : 'unit-bark-') + hash(JSON.stringify(data)).slice(0, 24);
  if (!records.has(id)) records.set(id, { id, ...data });
  const binding = { material_id: id, uv_policy: 'source_gltf_uv0_no_extra_flip' };
  atlasBindings.set(material, binding);
  return binding;
 }
 function binding(material){
  const flow=material.userData.treeLightStrip;
  if(flow){
   const data={name:'M_TreeLightStrip',flow:{...flow,color:material.emissive.toArray(),intensity:material.emissiveIntensity},
     base_color_linear:[...material.color.toArray(),1],roughness:material.roughness,metalness:0,
     normal_scale:1,occlusion_strength:1,emissive_factor:material.emissive.toArray(),alpha_mode:'OPAQUE',alpha_cutoff:.5,
     double_sided:false,unlit:false,maps:{}};
   const id='tree-light-'+hash(JSON.stringify(data)).slice(0,24);
   records.set(id,{id,...data});
   return {material_id:id,uv_policy:'source_gltf_uv0_no_extra_flip'};
  }
  if(!material.importedTrunk)return null;const {asset,index}=material.importedTrunk,source=asset.materials[index],maps={};for(const key of ['baseColor','normal','metallicRoughness','occlusion','emissive'])if(source[key])maps[key]={...source[key],image:undefined,...image(asset.images[source[key].image])};const data={name:source.name,base_color_linear:source.color,roughness:source.roughness,metalness:source.metalness,normal_scale:source.normalScale??1,occlusion_strength:source.occlusionStrength??1,emissive_factor:source.emissiveFactor||[0,0,0],alpha_mode:source.alphaMode,alpha_cutoff:source.alphaCutoff??.5,double_sided:source.doubleSided,unlit:!!source.unlit,maps},id='trunk-material-'+hash(JSON.stringify(data)).slice(0,24);if(!records.has(id))records.set(id,{id,...data});return {material_id:id,uv_policy:'source_gltf_uv0_no_extra_flip'};}
 function vertexColors(mesh,vertices){if(!mesh.material.importedTrunk||!mesh.material.vertexColors)return null;const attr=mesh.geometry.getAttribute('color');if(!attr)return null;const bytes=Buffer.alloc(vertices.length*16);vertices.forEach((v,i)=>[attr.getX(v),attr.getY(v),attr.getZ(v),attr.itemSize===4?attr.getW(v):1].forEach((x,c)=>{if(!Number.isFinite(x))throw Error('树干顶点颜色无效');bytes.writeFloatLE(x,i*16+c*4);}));const sha256=hash(bytes),file='trunk-colors-'+sha256.slice(0,24)+'.bin';if(!fs.existsSync(path.join(output,file)))fs.writeFileSync(path.join(output,file),bytes);return {file,sha256,sha1:createHash('sha1').update(bytes).digest('hex'),count:vertices.length,stride:16};}
 function finish(sharedBark=null){if(!records.size&&!sharedBark)return null;const setup='setup_imported_trunk_materials.py';fs.copyFileSync(new URL('./setup_imported_trunk_materials.py',import.meta.url),path.join(output,setup));return {version:1,materials:[...records.values(),...(sharedBark?[sharedBark]:[])],setup};}
 return {binding,atlasBark: material => atlasMaterial(material, false), sharedAtlas: material => atlasMaterial(material, true),vertexColors,finish};
}
