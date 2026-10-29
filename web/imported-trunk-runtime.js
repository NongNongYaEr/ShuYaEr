import {indexedTrunkAttribute} from './imported-trunk-buffer.js';
import * as THREE from './vendor/three.module.min.js';
import {isImmutableJson,sealImmutableJson} from './immutable-json.js';
import {trunkPoseGeometry} from './imported-trunk-binding.js';
export {materialFor as createImportedTrunkMaterial};
import {validateImportedTrunk,validateTrunkGuides,defaultTrunkCalibration,defaultTrunkGuides,partitionTrunkGeometry,closestTrunkGuide,pointOnTrunkGuide} from './imported-trunk-data.js';

const partitions=new WeakMap();
export function normalizeImportedTrunks(raw){
 if(raw==null)return null;if(raw.version!==1||!Array.isArray(raw.assets)||!Array.isArray(raw.mounts)||raw.assets.length>16||raw.mounts.length>16)throw Error('外部树干数据格式无效');const ids=new Set();for(const asset of raw.assets){if(!isImmutableJson(asset)){validateImportedTrunk(asset);validateTrunkGuides(asset.guides);if(!Number.isInteger(asset.revision)||asset.revision<1)throw Error('外部树干版本无效');sealImmutableJson(asset);}if(ids.has(asset.id))throw Error('外部树干素材身份重复');ids.add(asset.id);}
 const mounts=new Set(),hosts=new Set();for(const mount of raw.mounts){if(typeof mount.id!=='string'||!/^[A-Za-z0-9_]+$/.test(mount.id)||mounts.has(mount.id)||!ids.has(mount.asset_id)||!mount.guide_map||typeof mount.guide_map!=='object'||!['PRESERVE','FLEX'].includes(mount.binding))throw Error('外部树干实例引用无效');mounts.add(mount.id);const model=raw.assets.find(a=>a.id===mount.asset_id);if(mount.revision!==model.revision)throw Error('外部树干实例版本不匹配');for(const g of model.guides){const id=mount.guide_map[g.id];if(typeof id!=='string'||!/^[A-Za-z0-9_.-]+$/.test(id)||hosts.has(id))throw Error('外部树干缺少或重复控制骨架');hosts.add(id);}}return raw;
}
export function importedTrunkHostIds(authoring){return new Set((authoring.imported_trunks?.mounts||[]).flatMap(m=>Object.values(m.guide_map)));}
export function prepareImportedTrunk(asset){validateImportedTrunk(asset);asset.calibration=defaultTrunkCalibration(asset);asset.guides=defaultTrunkGuides(asset);return asset;}
function guideTimes(points){const times=[0];for(let i=1;i<points.length;i++)times.push(times.at(-1)+new THREE.Vector3(...points[i]).distanceTo(new THREE.Vector3(...points[i-1])));const length=times.at(-1);return times.map(t=>t/length);}
export function normalizeImportedTrunkShapeTimes(shape,data){
 if(!shape||!data?.mounts?.length)return shape;const hosts=new Map();for(const mount of data.mounts){const model=data.assets.find(a=>a.id===mount.asset_id);for(const guide of model.guides)hosts.set(mount.guide_map[guide.id],guide);}
 let changed=false;const branches=shape.branches.map(record=>{const guide=hosts.get(record.id);if(!guide||record.sample_times?.length===record.points.length)return record;changed=true;return {...record,sample_times:guideTimes(guide.points.length===record.points.length?guide.points:record.points)};});return changed?{...shape,branches}:shape;
}
export function importedTrunkShape(asset,mountId='TRUNK_1'){
 const guide_map=Object.fromEntries(asset.guides.map(g=>[g.id,mountId+'_'+g.id]));const branches=asset.guides.map(g=>{const length=g.points.slice(1).reduce((sum,p,i)=>sum+new THREE.Vector3(...p).distanceTo(new THREE.Vector3(...g.points[i])),0);return {...g,id:guide_map[g.id],parent:g.parent?guide_map[g.parent]:'',length,knots:g.points,sample_times:guideTimes(g.points)};});return {shape:{branches,connector:{position:branches[0].points[0],direction:[0,0,1],locked:true}},mount:{id:mountId,asset_id:asset.id,revision:asset.revision,guide_map,binding:'PRESERVE'}};
}
function materialFor(asset,index){const source=asset.materials[index],m=source.unlit?new THREE.MeshBasicMaterial():new THREE.MeshStandardMaterial({roughness:source.roughness,metalness:source.metalness});m.color.fromArray(source.color);m.opacity=source.color[3];m.transparent=source.alphaMode==='BLEND';m.alphaTest=source.alphaMode==='MASK'?source.alphaCutoff:0;m.side=source.doubleSided?THREE.DoubleSide:THREE.FrontSide;m.name='M_Bark';m.importedTrunk={asset,index};if(m.emissive)m.emissive.fromArray(source.emissiveFactor||[0,0,0]);return m;}
export async function hydrateImportedTrunkMaterials(group,{onProgress=()=>{},signal}={}){
 const materials=new Set();group.traverse(o=>{for(const m of [o.material].flat().filter(Boolean))if(m.importedTrunk)materials.add(m);});const textures=new Map(),created=new Set();
 const filters={9728:THREE.NearestFilter,9729:THREE.LinearFilter,9984:THREE.NearestMipmapNearestFilter,9985:THREE.LinearMipmapNearestFilter,9986:THREE.NearestMipmapLinearFilter,9987:THREE.LinearMipmapLinearFilter};
 try{for(const m of materials){const {asset,index}=m.importedTrunk,source=asset.materials[index];let changed=false;
  for(const [key,slot,colorSpace]of [['baseColor','map',THREE.SRGBColorSpace],['normal','normalMap',THREE.NoColorSpace],['metallicRoughness','roughnessMap',THREE.NoColorSpace],['occlusion','aoMap',THREE.NoColorSpace],['emissive','emissiveMap',THREE.SRGBColorSpace]]){
   if(signal?.aborted)throw new DOMException('已取消加载','AbortError');const info=source[key];if(!info)continue;
   const identity=asset.source.sha256+':'+info.image+':'+JSON.stringify(info)+':'+colorSpace;
   let texture=m[slot]?.userData.importedTrunkSource===identity?m[slot]:textures.get(identity);
   if(!texture){texture=await new THREE.TextureLoader().loadAsync(asset.images[info.image].data);created.add(texture);if(signal?.aborted)throw new DOMException('已取消加载','AbortError');texture.flipY=false;texture.colorSpace=colorSpace;texture.offset.fromArray(info.offset);texture.repeat.fromArray(info.scale);texture.rotation=info.rotation;texture.wrapS=info.sampler.wrapS===33071?THREE.ClampToEdgeWrapping:info.sampler.wrapS===33648?THREE.MirroredRepeatWrapping:THREE.RepeatWrapping;texture.wrapT=info.sampler.wrapT===33071?THREE.ClampToEdgeWrapping:info.sampler.wrapT===33648?THREE.MirroredRepeatWrapping:THREE.RepeatWrapping;texture.magFilter=filters[info.sampler.magFilter]||THREE.LinearFilter;texture.minFilter=filters[info.sampler.minFilter]||THREE.LinearMipmapLinearFilter;texture.userData.importedTrunk=true;texture.userData.importedTrunkSource=identity;texture.needsUpdate=true;}
   textures.set(identity,texture);if(m[slot]!==texture){m[slot]=texture;changed=true;}if(key==='metallicRoughness')m.metalnessMap=texture;
  }
  if(m.normalScale)m.normalScale.setScalar(source.normalScale??1);m.aoMapIntensity=source.occlusionStrength??1;if(changed){m.needsUpdate=true;onProgress(m);}
 }return textures;}catch(error){created.forEach(t=>t.dispose());throw error;}
}
export function buildImportedTrunkMeshes(authoring,branches,elements){
 const data=authoring.imported_trunks;if(!data)return {meshes:[],lookup:[],materials:[]};const meshes=[],lookup=[],materials=[],byId=new Map(branches.map(b=>[b.stableId,b])),elementById=new Map(elements.map(e=>[e.id,e.index]));
 for(const mount of data.mounts){const asset=data.assets.find(a=>a.id===mount.asset_id);if(!asset)throw Error('外部树干素材缺失');let cached=partitions.get(asset);if(!cached||cached.guides!==asset.guides||cached.calibration!==asset.calibration){cached={guides:asset.guides,calibration:asset.calibration,parts:partitionTrunkGeometry(asset)};partitions.set(asset,cached);}const usedMaterials=new Map();
  const posed=trunkPoseGeometry(asset,mount,branches);
  for(const part of cached.parts){const g=new THREE.BufferGeometry(),source=posed.primitives.get(part.primitive_id);for(const [name,size]of [['position',3],['normal',3],['uv',2],['tangent',4]]){const values=name==='uv'?new Float32Array(part.geometry.uv):indexedTrunkAttribute(source[name],part.source_vertices,size);g.setAttribute(name,new THREE.BufferAttribute(values,size));}if(part.geometry.color)g.setAttribute('color',new THREE.Float32BufferAttribute(part.geometry.color,part.geometry.color.length/part.owners.length));g.setIndex(part.geometry.index);if(!usedMaterials.has(part.material)){const m=materialFor(asset,part.material);usedMaterials.set(part.material,m);materials.push(m);}const m=usedMaterials.get(part.material);if(part.geometry.color)m.vertexColors=true;
   const current=byId.get(mount.guide_map[asset.guides[0].id]);if(!current)throw Error('外部树干控制骨架丢失');
   const mesh=new THREE.Mesh(g,m);mesh.name='外部树干_'+mount.id+'_'+part.primitive_id;mesh.castShadow=mesh.receiveShadow=true;mesh.userData={category:'branch',stable_id:current.stableId,imported_trunk:true,trunk_mount_id:mount.id,trunk_asset_id:asset.id,trunk_primitive_id:part.primitive_id,trunk_source_vertices:part.source_vertices,branch_id:current.id,element_index:elementById.get(current.stableId)};meshes.push(mesh);
   lookup.push({geometry:g,elementIndices:part.owners.map(owner=>{const id=mount.guide_map[owner],index=elementById.get(id);if(index===undefined)throw Error('外部树干缺少枝内归属');return index;})});
  }
 }return {meshes,lookup,materials};
}
export function disposeImportedTrunkTextures(group){const textures=new Set();group?.traverse(o=>{for(const m of [o.material].flat().filter(Boolean))for(const value of Object.values(m))if(value?.isTexture&&value.userData.importedTrunk)textures.add(value);});textures.forEach(t=>t.dispose());}
