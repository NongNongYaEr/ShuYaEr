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
export async function attachMaterialCheckpoint(parsed,previous,{sessionId,projectId,bundle,bundleSHA256,inputId}){
 if(!bundle?.byteLength||bundle.byteLength>200000000)throw Error('材质编辑包不完整或超过200MB。');
 const hash=await digest(bundle);if(hash!==bundleSHA256)throw Error('材质编辑包校验失败，未替换当前树干。');
 const geometryKey=await materialGeometryKey(parsed),old=previous.material_workflow;
 const calibration={base:[0,0,0],tip:[0,0,1],front:[0,1,0],scale:1};
 const same=old?.geometryKey===geometryKey&&JSON.stringify(previous.calibration)===JSON.stringify(calibration);
 return {...parsed,id:previous.id,name:previous.name,revision:previous.revision,calibration,guides:structuredClone(previous.guides),binding:same?structuredClone(previous.binding||{}):{},physical_size_confirmed:true,
  material_editable:{version:1,sha256:hash,bytes:bundle.byteLength,base64:bytesBase64(new Uint8Array(bundle))},
  material_workflow:{version:1,sessionId,inputId,projectId,geometryKey,finalSHA256:parsed.source.sha256,bundleSHA256:hash,needsSkeleton:!same,rigConfirmed:same&&old.rigConfirmed===true},
  material_parent:{version:1,inputId,sourceSHA256:previous.source.sha256,reviewRequired:!same}};
}
