import * as THREE from './vendor/three.module.min.js';
import {decodePreview} from './bonsai-pot-images.js';
import {createImportedTrunkMaterial,hydrateImportedTrunkMaterials} from './imported-trunk-runtime.js';
import {readImportedTrunkGlb,trunkContentHash} from './imported-trunk-glb.js';
import {sealImmutableJson} from './immutable-json.js';
import {normalizeLeafMaterial} from './leaf-material-data.js';
import {plantAttachmentBase} from './plant-attachment.js';
import {normalizePlantUnit} from './plant-unit-data.js';
import {trunkSurfaceTangents} from './trunk-surface-tangents.js';

const MAX_GLB_BYTES=64*1024*1024;
const MAX_TRIANGLES=250000;
const MAX_PREVIEW_PIXELS=2048*2048;
const up=new THREE.Matrix4().makeRotationX(Math.PI/2);
const textEncoder=new TextEncoder();
const hashText=text=>trunkContentHash(textEncoder.encode(text));
const attributeSizes={position:3,normal:3,uv:2,uv1:2,tangent:4};

function geometryFromData(data){
  const geometry=new THREE.BufferGeometry();
  for(const [name,size] of Object.entries(attributeSizes)){
    if(data[name])geometry.setAttribute(name,new THREE.Float32BufferAttribute(data[name],size));
  }
  if(data.color){
    const width=data.color.length/geometry.getAttribute('position').count;
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(data.color,width));
  }
  geometry.setIndex(data.index);
  return geometry;
}

function sourceFromData({sha256,name,revision,role,connector,model,estimatedConnector=false}){
  const id='MESH_'+sha256.slice(0,32);
  return sealImmutableJson({id,name,revision,role,connector,estimatedConnector,
    model:{...model,id,revision,source:{sha256}}});
}

export async function meshUnitFromPack(pack,unitId){
  const raw=pack?.units?.find(unit=>unit.id===unitId);
  if(!raw)throw Error('这套素材中找不到所选单件，请刷新套装');
  const unit=normalizePlantUnit(raw),material=normalizeLeafMaterial(pack.material);
  const revision=Math.max(1,Math.trunc(Number(pack.revision)||1));
  const calibrated=String(pack.id||'').startsWith('prepared-');
  const geometry=geometryFromData(unit.geometry);
  let positions,normals,coords,tangents,index;
  try{
    const base=calibrated?new THREE.Vector3():plantAttachmentBase(geometry);
    geometry.translate(-base.x,-base.y,-base.z).scale(unit.size_m,unit.size_m,unit.size_m).applyMatrix4(up);
    const uv=geometry.getAttribute('uv');
    // Pack UVs sample an upright PNG. The imported PBR route samples glTF UVs.
    for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i));
    if(!geometry.hasAttribute('normal'))geometry.computeVertexNormals();
    geometry.computeTangents();
    positions=Array.from(geometry.getAttribute('position').array);
    normals=Array.from(geometry.getAttribute('normal').array);
    coords=Array.from(uv.array);
    tangents=Array.from(trunkSurfaceTangents(normals,geometry.getAttribute('tangent')?.array));
    index=Array.from(geometry.index.array);
  }finally{geometry.dispose();}
  const images=[];
  function texture(data,name){
    if(!data)return null;
    const image=images.length;images.push({data,name});
    return {image,offset:[0,0],scale:[1,1],rotation:0,sampler:{}};
  }
  const surface={id:'M0',name:pack.name||'叶花果',color:[...new THREE.Color(unit.colorTint||'#ffffff').toArray(),1],
    roughness:material.roughness,metalness:0,baseColor:texture(material.color,material.color_name),normal:texture(material.normal,material.normal_name),
    alphaMode:material.color?'MASK':'OPAQUE',alphaCutoff:material.cutoff,doubleSided:true};
  const primitive={id:'UNIT',name:unit.name,material:0,geometry:{position:positions,normal:normals,uv:coords,tangent:tangents,index}};
  const imageHashes=[];
  for(const image of images)imageHashes.push(await hashText(image.data));
  const sha256=await hashText(JSON.stringify([pack.id,revision,unit.id,unit.name,unit.role,surface,primitive.geometry,imageHashes]));
  return sourceFromData({sha256,name:unit.name,revision,role:unit.role,connector:{position:[0,0,0],direction:[0,0,1]},
    estimatedConnector:!calibrated,model:{primitives:[primitive],materials:[surface],images}});
}

export async function meshUnitFromGlb(file){
  if(!/\.glb$/i.test(file?.name||'')||file.size>MAX_GLB_BYTES)throw Error('请选择 64 MiB 以内、资源内嵌的静态 GLB');
  let imported;
  try{
    imported=await readImportedTrunkGlb(await file.arrayBuffer(),{name:file.name,maxBytes:MAX_GLB_BYTES,maxTriangles:MAX_TRIANGLES,meshUnit:true});
  }catch(error){throw Error(error.message.replace(/^树干 GLB：/,'整支 GLB：'));}
  const {primitives,materials,images,name,source}=imported;
  const bounds=new THREE.Box3(),point=new THREE.Vector3();
  for(const part of primitives){
    const values=part.geometry.position;
    for(let i=0;i<values.length;i+=3)bounds.expandByPoint(point.fromArray(values,i));
  }
  if(bounds.isEmpty()||bounds.getSize(point).lengthSq()<1e-14)throw Error('整支 GLB 缺少有效尺寸');
  const center=bounds.getCenter(point);
  return sourceFromData({sha256:source.sha256,name,revision:1,role:'GLB',
    connector:{position:[center.x,center.y,bounds.min.z],direction:[0,0,1]},estimatedConnector:true,
    model:{primitives,materials,images}});
}

export function buildMeshUnitModel(source){
  const group=new THREE.Group(),materials=new Map();
  group.name=source.name;
  for(const part of source.model.primitives){
    const useVertexColors=!!part.geometry.color,key=part.material+':'+useVertexColors;
    let material=materials.get(key);
    if(!material){
      material=createImportedTrunkMaterial(source.model,part.material);
      material.name=source.model.materials[part.material].name;
      material.userData.meshUnit=true;
      material.vertexColors=useVertexColors;
      if(material.transparent)material.depthWrite=false;
      materials.set(key,material);
    }
    const mesh=new THREE.Mesh(geometryFromData(part.geometry),material);
    mesh.name=part.name;
    mesh.castShadow=mesh.receiveShadow=true;
    mesh.userData.branchforge_color_is_display=useVertexColors;
    group.add(mesh);
  }
  return group;
}

export async function hydrateMeshUnitModel(group,{preview=true,signal}={}){
  return hydrateImportedTrunkMaterials(group,{signal,acceptMaterial:m=>m.userData.meshUnit,
    cacheNamespace:preview?'mesh-preview:':'mesh-export:',shareImages:!preview,
    ...(preview?{async loadTexture(data,asset){
      const maxPixels=Math.min(MAX_PREVIEW_PIXELS,Math.floor(8*MAX_PREVIEW_PIXELS/Math.max(1,asset.images.length)));
      const response=await fetch(data);
      const {bitmap}=await decodePreview(await response.blob(),Math.max(1,maxPixels));
      const texture=new THREE.Texture(bitmap);
      texture.addEventListener('dispose',()=>bitmap.close());
      return texture;
    }}:{})});
}
