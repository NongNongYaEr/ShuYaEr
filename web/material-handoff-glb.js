import * as T from './vendor/three.module.min.js';
import {GLTFExporter} from './vendor/GLTFExporter.js';
import {trunkCalibrationMatrix,trunkDimensions,validateTrunkGuides} from './imported-trunk-data.js';
import {readTrunkGlbData} from './imported-trunk-glb.js';
import {base64Bytes} from './trunk-material-workflow.js';

// Use the currently edited geometry, not source.glb_base64 (which predates sculpting).
// The repaint route uses one wood surface; the overlay route preserves the material slots.
export async function materialHandoffGlb(model,{preserveMaterials=false}={}){
 validateTrunkGuides(model.guides);const height=trunkDimensions(model).height;
 if(!(height>=.1&&height<=200))throw Error('材质工坊支持0.1–200米树高，请先校准尺寸。');
 const vertices=model.primitives.reduce((n,p)=>n+p.geometry.position.length/3,0),faces=model.primitives.reduce((n,p)=>n+p.geometry.index.length/3,0);
 if(vertices>2000000||faces>2000000)throw Error('材质工作副本支持最多200万顶点和200万三角面。');
 if(preserveMaterials)return {bytes:await overlayGlb(model),height};
 const pos=new Float32Array(vertices*3),normal=new Float32Array(vertices*3),uv=new Float32Array(vertices*2),ids=new Uint32Array(faces*3);
 const matrix=new T.Matrix4().makeRotationX(-Math.PI/2).multiply(trunkCalibrationMatrix(model.calibration)),nm=new T.Matrix3().getNormalMatrix(matrix),v=new T.Vector3();let offset=0,index=0;
 for(const {geometry:g} of model.primitives){for(let i=0;i<g.position.length/3;i++){v.fromArray(g.position,i*3).applyMatrix4(matrix).toArray(pos,(offset+i)*3);v.fromArray(g.normal,i*3).applyMatrix3(nm).normalize().toArray(normal,(offset+i)*3);uv[(offset+i)*2]=g.uv?.[i*2]||0;uv[(offset+i)*2+1]=g.uv?.[i*2+1]||0;}for(const i of g.index)ids[index++]=offset+i;offset+=g.position.length/3;}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(pos,3));geometry.setAttribute('normal',new T.BufferAttribute(normal,3));geometry.setAttribute('uv',new T.BufferAttribute(uv,2));geometry.setIndex(new T.BufferAttribute(ids,1));
 const material=new T.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:0}),mesh=new T.Mesh(geometry,material);mesh.name=model.name;
 try{const bytes=await new GLTFExporter().parseAsync(mesh,{binary:true});if(bytes.byteLength>150000000)throw Error('材质工作副本超过150MB，请先减少网格。');return {bytes,height};}finally{geometry.dispose();material.dispose();}
}

// Keep original material JSON and image bytes while using the edited, calibrated mesh.
async function overlayGlb(model){
 if(!model.source?.glb_base64)throw Error('找不到内嵌的原始 GLB，请从原文件重新导入后再叠加效果。');
 const source=readTrunkGlbData(base64Bytes(model.source.glb_base64));
 const {materials=[],textures=[],samplers=[]}=source.json;
 for(const slot of new Set(model.primitives.map(p=>p.material))){
  const material=model.materials[slot];
  if(material.alphaMode!=='OPAQUE'||material.unlit)throw Error('「保留原材质 · 叠加效果」目前支持标准不透明 PBR。材质「'+material.name+'」使用了透明或无光照模式。');
  for(const key of ['baseColor','normal','metallicRoughness','occlusion','emissive']){
   const map=material[key];
   if(map&&model.images[map.image]?.data.startsWith('data:image/webp;'))throw Error('「保留原材质 · 叠加效果」支持内嵌 PNG 或 JPEG。材质「'+material.name+'」含 WebP 贴图。');
  }
 }
 const bufferViews=[],accessors=[],chunks=[];
 let byteLength=0;
 function append(data,target){
  const padding=(4-data.byteLength%4)%4;
  const index=bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:data.byteLength,...(target&&{target})})-1;
  byteLength+=data.byteLength+padding;
  if(byteLength>150000000)throw Error('材质工作副本超过150MB，请先减少网格或贴图尺寸。');
  chunks.push(data);
  if(padding)chunks.push(new Uint8Array(padding));
  return index;
 }
 function attribute(data,type,size,target,bounds){
  const bufferView=append(data,target),componentType=data instanceof Uint32Array?5125:5126;
  return accessors.push({bufferView,componentType,type,count:data.length/size,...bounds})-1;
 }
 const images=(source.json.images||[]).map(image=>{
  if(image.uri){
   const [,mimeType,encoded]=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image.uri)||[];
   if(!encoded)throw Error('原材质贴图需内嵌在 GLB 中。');
   const embedded={...image,mimeType,bufferView:append(base64Bytes(encoded))};
   delete embedded.uri;
   return embedded;
  }
  const view=source.bv(image.bufferView),start=view.byteOffset||0;
  return {...image,bufferView:append(source.bin.subarray(start,start+view.byteLength))};
 });
 const matrix=trunkCalibrationMatrix(model.calibration),normals=new T.Matrix3().getNormalMatrix(matrix),v=new T.Vector3();
 const meshes=model.primitives.map(({id,name,material,geometry:g})=>{
  const count=g.position.length/3,pos=new Float32Array(count*3),normal=new Float32Array(count*3),tangent=new Float32Array(count*4);
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<count;i++){
   const offset=i*3,tangentOffset=i*4;
   v.fromArray(g.position,offset).applyMatrix4(matrix);
   pos[offset]=v.x;pos[offset+1]=v.z;pos[offset+2]=-v.y;
   for(let c=0;c<3;c++){const coordinate=pos[offset+c];min[c]=Math.min(min[c],coordinate);max[c]=Math.max(max[c],coordinate);}
   v.fromArray(g.normal,offset).applyMatrix3(normals).normalize();
   normal[offset]=v.x;normal[offset+1]=v.z;normal[offset+2]=-v.y;
   v.fromArray(g.tangent,tangentOffset).transformDirection(matrix);
   tangent[tangentOffset]=v.x;tangent[tangentOffset+1]=v.z;tangent[tangentOffset+2]=-v.y;tangent[tangentOffset+3]=g.tangent[tangentOffset+3];
  }
  const attributes={POSITION:attribute(pos,'VEC3',3,34962,{min,max}),NORMAL:attribute(normal,'VEC3',3,34962),TANGENT:attribute(tangent,'VEC4',4,34962),TEXCOORD_0:attribute(new Float32Array(g.uv),'VEC2',2,34962)};
  if(g.uv1)attributes.TEXCOORD_1=attribute(new Float32Array(g.uv1),'VEC2',2,34962);
  if(g.color){const size=g.color.length/count;attributes.COLOR_0=attribute(new Float32Array(g.color),'VEC'+size,size,34962);}
  const primitive={attributes,indices:attribute(new Uint32Array(g.index),'SCALAR',1,34963),extras:{branchforgeSourcePrimitiveId:id}};
  if(material<materials.length)primitive.material=material;
  return {name,primitives:[primitive]};
 });
 const retained=['KHR_texture_transform','KHR_materials_unlit','KHR_materials_emissive_strength'];
 const extensionsUsed=source.json.extensionsUsed?.filter(name=>retained.includes(name));
 const extensionsRequired=source.json.extensionsRequired?.filter(name=>retained.includes(name));
 const nodes=meshes.map((mesh,i)=>({mesh:i,name:mesh.name}));
 const json={asset:{version:'2.0',generator:'树鸭儿 · 原材质效果'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,buffers:[{byteLength}],bufferViews,accessors};
 for(const [key,values] of Object.entries({materials,textures,samplers,images}))if(values.length)json[key]=values;
 if(extensionsUsed?.length)json.extensionsUsed=extensionsUsed;
 if(extensionsRequired?.length)json.extensionsRequired=extensionsRequired;
 const encoded=new TextEncoder().encode(JSON.stringify(json)),paddedLength=Math.ceil(encoded.length/4)*4,total=28+paddedLength+byteLength;
 if(total>150000000)throw Error('材质工作副本超过150MB，请先减少网格或贴图尺寸。');
 const padded=new Uint8Array(paddedLength).fill(32);padded.set(encoded);
 const header=new Uint32Array([0x46546c67,2,total,paddedLength,0x4e4f534a]),binHeader=new Uint32Array([byteLength,0x004e4942]);
 return new Blob([header,padded,binHeader,...chunks],{type:'model/gltf-binary'}).arrayBuffer();
}

// Returned GLB is already in calibrated meters. Use an identity Z-up calibration.
export function carryMaterialTrunk(model,context){
 return {...model,name:context.name+' · 材质完成',calibration:{base:[0,0,0],tip:[0,0,1],front:[0,1,0],scale:1},guides:structuredClone(context.guides),binding:{},physical_size_confirmed:true,
  material_parent:{version:1,inputId:context.id,sourceSHA256:context.sourceSHA256,reviewRequired:true}};
}
