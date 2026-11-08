import * as T from './vendor/three.module.min.js';
import {trunkCalibrationMatrix} from './imported-trunk-data.js';
import {TRUNK_WEIGHT_VERTEX_LIMIT} from './trunk-weight-data.js';

// Content identity is independent of the embedded PBR images. Never reuse skin
// merely because a filename, material project, or vertex count matches.
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
export const digest=async bytes=>hex(await crypto.subtle.digest('SHA-256',bytes));
export async function materialGeometryKey(model){
 const keys=[];
 for(const p of model.primitives){const g=p.geometry;keys.push([await digest(new Float32Array(g.position)),await digest(new Uint32Array(g.index)),await digest(new Float32Array(g.uv))]);}
 return digest(new TextEncoder().encode(JSON.stringify(keys)));
}
export function bytesBase64(bytes){let value='';for(let i=0;i<bytes.length;i+=32768)value+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(value);}
export function base64Bytes(value){const raw=atob(value),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;}
function overlayVertexSplits(parsed,previous){
 if(parsed.primitives.length!==previous.primitives.length)return null;
 const matrix=trunkCalibrationMatrix(previous.calibration),point=new T.Vector3(),splits=new Map();
 function matches(a,b,sourceVertex,outputVertex){
  point.fromArray(a.position,sourceVertex*3).applyMatrix4(matrix);
  for(let axis=0;axis<3;axis++){
   const expected=point.getComponent(axis);
   if(Math.abs(expected-b.position[outputVertex*3+axis])>Math.max(1e-6,Math.abs(expected)*3e-7))return false;
  }
  return true;
 }
 for(const [i,p] of previous.primitives.entries()){
  const result=parsed.primitives[i],a=p.geometry,b=result.geometry;
  const count=a.position.length/3,extra=b.position.length/3-count;
  if(p.id!==result.id||extra<0||a.index.length!==b.index.length)return null;
  for(let j=0;j<count;j++)if(!matches(a,b,j,j))return null;
  // The GLB writer keeps original vertex order and only appends UV seam duplicates.
  const appended=new Int32Array(extra).fill(-1);
  for(let j=0;j<a.index.length;j++){
   const before=a.index[j],after=b.index[j];
   if(after<count){if(before!==after)return null;continue;}
   const at=after-count,known=appended[at];
   if(known===-1){
    if(!matches(a,b,before,after))return null;
    appended[at]=before;
   }else if(known!==before){
    return null;
   }
  }
  if(appended.some(index=>index<0))return null;
  if(extra)splits.set(p.id,{count,appended});
 }
 return splits;
}
function carryOverlayWeights(repairs,splits,geometryKey){
 repairs.surface=geometryKey;
 let total=0;
 for(const mesh of repairs.meshes){
  const split=splits.get(mesh.id);
  if(split){
   const targets=new Map(mesh.vertices);
   for(const [offset,sourceVertex] of split.appended.entries()){
    const target=targets.get(sourceVertex);
    if(target!==undefined)mesh.vertices.push([split.count+offset,target]);
   }
  }
  total+=mesh.vertices.length;
 }
 if(total>TRUNK_WEIGHT_VERTEX_LIMIT)throw Error('叠加效果的 UV 接缝复制了部分顶点，当前权重修复超过树干容量。已保留材质结果和原树干草稿。');
}
export async function attachMaterialCheckpoint(parsed,previous,{sessionId,projectId,bundle,bundleSHA256,inputId,preparation,preserveRig=false}){
 if(!bundle?.byteLength||bundle.byteLength>200000000)throw Error('材质编辑包不完整或超过200MB。');
 const hash=await digest(bundle);if(hash!==bundleSHA256)throw Error('材质编辑包校验失败，未替换当前树干。');
 const geometryKey=await materialGeometryKey(parsed),old=previous.material_workflow;
 const calibration={base:[0,0,0],tip:[0,0,1],front:[0,1,0],scale:1};
 const overlay=preparation==='overlay';
 const splits=overlay?overlayVertexSplits(parsed,previous):null;
 const same=overlay?!!splits:old?.geometryKey===geometryKey&&JSON.stringify(previous.calibration)===JSON.stringify(calibration);
 const binding=same?structuredClone(previous.binding||{}):{};
 if(splits&&binding.weight_repairs)carryOverlayWeights(binding.weight_repairs,splits,geometryKey);
 const needsSkeleton=overlay?!same||!(preserveRig||previous.guides.length>1||Object.keys(binding).length||old?.rigConfirmed):!same;
 return {...parsed,id:previous.id,name:previous.name,revision:previous.revision,calibration,guides:structuredClone(previous.guides),binding,physical_size_confirmed:true,
  material_editable:{version:1,sha256:hash,bytes:bundle.byteLength,base64:bytesBase64(new Uint8Array(bundle))},
  material_workflow:{version:1,sessionId,inputId,projectId,geometryKey,finalSHA256:parsed.source.sha256,bundleSHA256:hash,needsSkeleton,rigConfirmed:!overlay&&same&&old.rigConfirmed===true,...(overlay&&{preparation})},
  material_parent:{version:1,inputId,sourceSHA256:previous.source.sha256,reviewRequired:needsSkeleton}};
}
