import {validateBarkFlow,validateDirectionCorrections} from './bark-flow-rules.js';
export const FLOW_FIELD_CACHE_BYTES=32*1024*1024;
const schema={position:['Float32Array','vertex',3],growth:['Float32Array','vertex',3],across:['Float32Array','vertex',3],branchIds:['Int32Array','vertex',1],faceBranch:['Int32Array','face',1],faceConfidence:['Float32Array','face',1],confidence:['Float32Array','vertex',1],banyanTypes:['Int8Array','face',1],banyanDirections:['Float32Array','face',3],banyanConfidence:['Float32Array','face',1],projectionNormal:['Float32Array','vertex',3]};
const types={Float32Array,Int32Array,Int8Array},stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
export async function flowFieldCacheKey(mesh,doc,algorithm){
 const flow=validateBarkFlow(doc.barkFlow,mesh.sourceSHA256);if(flow?.version!==5||!/^[a-f0-9]{64}$/.test(algorithm))return null;
 const text=JSON.stringify(stable({version:1,algorithm,source:mesh.sourceSHA256,vertices:mesh.pos.length/3,faces:mesh.indices.length/3,min:mesh.min,height:mesh.height,actualHeightMeters:doc.actualHeightMeters||10,transition:doc.flowTransition??1,corrections:validateDirectionCorrections(doc.directionCorrections),flow}));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
}
function validArrays(field,mesh,branches){
 const vertex=mesh.pos.length/3,face=mesh.indices.length/3;if(vertex>750000||face>250000)return false;
 for(const[key,[type,kind,size]]of Object.entries(schema)){
  const a=field[key];if(!(a instanceof types[type])||a.length!==(kind==='vertex'?vertex:face)*size)return false;
  for(const v of a)if(!Number.isFinite(v)||Math.abs(v)>1000000||((key==='branchIds'||key==='faceBranch')&&(v< -1||v>=branches))||(key==='banyanTypes'&&(v< -1||v>3)))return false;
 }
 return field.summary?.algorithm==='banyan-surface-guided-flow-v5';
}
export function encodeFlowFieldCache(field,mesh,flow,key){
 if(!/^[a-f0-9]{64}$/.test(key)||!validArrays(field,mesh,flow.guides.length))return null;
 const header=new TextEncoder().encode(JSON.stringify({kind:'tree-flow-field-cache',version:1,key,source:mesh.sourceSHA256,vertices:mesh.pos.length/3,faces:mesh.indices.length/3,summary:field.summary}));if(header.length>1500000)return null;
 const align=n=>Math.ceil(n/4)*4;let length=align(12+header.length);for(const name of Object.keys(schema))length=align(length+field[name].byteLength);if(length>FLOW_FIELD_CACHE_BYTES)return null;
 const bytes=new Uint8Array(length),view=new DataView(bytes.buffer);bytes.set(new TextEncoder().encode('TMLFLW01'));view.setUint32(8,header.length,true);bytes.set(header,12);let at=align(12+header.length);
 for(const name of Object.keys(schema)){const a=field[name];bytes.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),at);at=align(at+a.byteLength);}return bytes;
}
export function decodeFlowFieldCache(bytes,mesh,flow,key){
 try{
  if(!(bytes instanceof Uint8Array)||bytes.length<12||bytes.length>FLOW_FIELD_CACHE_BYTES||new TextDecoder().decode(bytes.subarray(0,8))!=='TMLFLW01')return null;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=view.getUint32(8,true);if(n>1500000||12+n>bytes.length)return null;
  const h=JSON.parse(new TextDecoder().decode(bytes.subarray(12,12+n))),vertex=mesh.pos.length/3,face=mesh.indices.length/3;
  if(h.kind!=='tree-flow-field-cache'||h.version!==1||h.key!==key||h.source!==mesh.sourceSHA256||h.vertices!==vertex||h.faces!==face||!h.summary||typeof h.summary!=='object'||Array.isArray(h.summary))return null;
  const field={summary:h.summary},align=n=>Math.ceil(n/4)*4;let at=align(12+n);
  for(const[name,[type,kind,size]]of Object.entries(schema)){const Type=types[type],count=(kind==='vertex'?vertex:face)*size,length=count*Type.BYTES_PER_ELEMENT;if(at+length>bytes.length)return null;field[name]=new Type(bytes.buffer.slice(bytes.byteOffset+at,bytes.byteOffset+at+length));at=align(at+length);}
  if(at!==bytes.length||!validArrays(field,mesh,flow.guides.length))return null;return field;
 }catch{return null;}
}
