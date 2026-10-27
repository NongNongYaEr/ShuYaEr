// Presentation snapshots only. Never retain mutable Matrix4 arrays by reference.
const fields=['root','geometry','instances','instanceCount','start','count','line','castShadow','receiveShadow','radial','material','editLookup','editFrames'];
export function retainNativeDraw(cache,next){
 const old=cache.get(next.id);let same=!!old;if(same)for(const key of fields)if(old[key]!==next[key]){same=false;break;}if(same)for(let i=0;i<16;i++)if(old.matrix[i]!==next.matrix[i]){same=false;break;}if(same)return old;
 const record={...next,matrix:next.matrix.slice()};cache.set(next.id,record);return record;
}
export function createNativeSceneRetention(){
 let previous=[],materialSignature='',version=0,revision=0,snapshot=null;
 return {update(draws,materials){const signature=materials?JSON.stringify(materials):'';const changes=[];let topology=!snapshot||signature!==materialSignature||draws.length!==previous.length,changed=topology;for(let i=0;i<draws.length;i++){if(draws[i]!==previous[i]){changed=true;changes.push([draws[i],previous[i]]);}if(draws[i].id!==previous[i]?.id)topology=true;}if(!changed)return snapshot;if(!snapshot)version++;previous=draws;materialSignature=signature;let bytes=null;const fields={draws,...(materials?{materials}:{})};snapshot={version,revision:++revision,topologyChanged:topology,changes,fields,get bytes(){return bytes||(bytes=new TextEncoder().encode(JSON.stringify(fields)));}};return snapshot;}};
}
export function nativeDrawDelta(previous,current){const updates=[];for(let i=0;i<current.length;i++)if(previous[i]!==current[i])updates.push([i,current[i]]);return updates;}
// Preserve stable material indices and splice only the changed object interval.
export function nativeSceneDelta(previous,current){
 const before=previous.draws,after=current.draws;let prefix=0,suffix=0;while(prefix<Math.min(before.length,after.length)&&before[prefix].id===after[prefix].id)prefix++;while(suffix<Math.min(before.length,after.length)-prefix&&before[before.length-1-suffix].id===after[after.length-1-suffix].id)suffix++;
 const result={},updates=[];if(prefix+suffix<Math.max(before.length,after.length))result.drawSplice=[prefix,before.length-prefix-suffix,after.slice(prefix,after.length-suffix)];
 for(let i=0;i<prefix;i++)if(before[i]!==after[i])updates.push([i,after[i]]);for(let i=0;i<suffix;i++){const at=after.length-suffix+i;if(before[before.length-suffix+i]!==after[at])updates.push([at,after[at]]);}if(updates.length)result.drawUpdates=updates;
 const oldMaterials=previous.materials||[],newMaterials=current.materials||[];if(newMaterials.length>oldMaterials.length){result.materialBaseCount=oldMaterials.length;result.materialAppend=newMaterials.slice(oldMaterials.length);}return result;
}
export function createRetainedNativeMaterialTable({immutableRecords=false}={}){
 let materials=[],indices=new Map(),objects=new Map(),records=immutableRecords?new WeakMap():null;return {get materials(){return materials;},beginFrame(){objects.clear();},reset(){materials=[];indices.clear();objects.clear();records=immutableRecords?new WeakMap():null;},cachedIndex(object){return objects.get(object);},intern(object,encode){if(objects.has(object))return objects.get(object);const record=encode(object);let index=immutableRecords?records.get(record):undefined;if(index===undefined){const signature=JSON.stringify(record);index=indices.get(signature);if(index===undefined){index=materials.length;materials.push(record);indices.set(signature,index);}if(immutableRecords)records.set(record,index);}objects.set(object,index);return index;}};
}
export function encodeRetainedNativeScene(staticBytes,dynamic){
 const dynamicBytes=new TextEncoder().encode(JSON.stringify(dynamic));if(dynamicBytes.length===2)return staticBytes.slice();const bytes=new Uint8Array(staticBytes.length+dynamicBytes.length-1);bytes.set(staticBytes.subarray(0,-1));bytes[staticBytes.length-1]=44;bytes.set(dynamicBytes.subarray(1),staticBytes.length);return bytes;
}
export function nativeBindingDelta(previous,current){const result={};for(const [key,value]of current)if(previous.get(key)!==value)result[key]=value;return result;}
