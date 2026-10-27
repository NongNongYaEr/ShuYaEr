// Private runtime ownership. Nothing here is written to an authored model.
const owners=new WeakMap();
const geometryOwners=new WeakMap(),retiredGeometries=new WeakSet();
export function compiledSamples(owner){return owners.get(owner);}
export function registerCompiledSamples(owner,records,stats){owners.set(owner,{records,stats});}
export function compiledSampleCacheStats(owner){const s=owners.get(owner)?.stats;return s?{...s}:null;}
export function compiledSampleHistoryStats(owner){const s=owners.get(owner)?.history?.stats;return s?{...s}:null;}
export function forgetCompiledSamples(owner){owners.delete(owner);}
export function ownCompiledGeometry(p){
  p.built.compiledSampleGeometries=new Set(p.geometryStates.map(s=>s.geometry));
  for(const geometry of p.built.compiledSampleGeometries){let users=geometryOwners.get(geometry);if(!users)geometryOwners.set(geometry,users=new Set());users.add(p);retiredGeometries.delete(geometry);}
}
export function compiledGeometryLive(geometry){return Boolean(geometryOwners.get(geometry)?.size);}
export function retireCompiledGeometry(geometry,retiring){
  const users=geometryOwners.get(geometry);if(!users||retiredGeometries.has(geometry)||![...users].every(p=>retiring.has(p)))return;
  geometry.dispose();retiredGeometries.add(geometry);
}

const attributeState=a=>{if(!a)return null;const data=a.data||a;return {attribute:a,data,array:data.array,version:data.version,stride:data.stride,size:a.itemSize,count:a.count,normalized:a.normalized,offset:a.offset};};
const sameAttribute=(a,s)=>{if(!s)return !a;const data=a?.data||a;return a===s.attribute&&data===s.data&&data.array===s.array&&data.version===s.version&&data.stride===s.stride&&a.itemSize===s.size&&a.count===s.count&&a.normalized===s.normalized&&a.offset===s.offset;};
export function geometryState(g){return {geometry:g,keys:Object.keys(g.attributes),attrs:Object.values(g.attributes).map(attributeState),index:attributeState(g.index),groups:g.groups.map(v=>({...v})),start:g.drawRange.start,count:g.drawRange.count,morph:Object.keys(g.morphAttributes).map(k=>[k,g.morphAttributes[k].map(attributeState)])};}
export function geometryUnchanged(g,s){return g===s.geometry&&s.keys.length===Object.keys(g.attributes).length&&s.keys.every((k,i)=>sameAttribute(g.attributes[k],s.attrs[i]))&&sameAttribute(g.index,s.index)&&g.drawRange.start===s.start&&g.drawRange.count===s.count&&g.groups.length===s.groups.length&&s.groups.every((v,i)=>{const b=g.groups[i];return v.start===b.start&&v.count===b.count&&v.materialIndex===b.materialIndex;})&&Object.keys(g.morphAttributes).length===s.morph.length&&s.morph.every(([key,attrs])=>g.morphAttributes[key]?.length===attrs.length&&attrs.every((a,i)=>sameAttribute(g.morphAttributes[key][i],a)));}

// Snapshot ordinary material values without duplicating embedded PNG strings.
// Loaded leaf images may finish asynchronously, but must resolve to the exact
// declared atlas. Generated texture buffers remain versioned mutable resources.
const textureKeys=['mapping','channel','wrapS','wrapT','magFilter','minFilter','anisotropy','format','internalFormat','type','rotation','matrixAutoUpdate','generateMipmaps','premultiplyAlpha','flipY','unpackAlignment','colorSpace','compareFunction'];
const declaredTextureImages=new WeakMap();
function textureValues(t,url){
  const image=t.image;let declared=false;
  if(url&&!t.isDataTexture){
    // Reading HTMLImageElement.src allocates the entire embedded atlas URL.
    // All variants borrow the same texture. Check it once per image/version,
    // using Three's normal needsUpdate contract for changed image contents.
    let proof=declaredTextureImages.get(t);
    if(!proof||proof.image!==image||proof.source!==t.source||proof.version!==t.version||proof.sourceVersion!==t.source.version||proof.url!==url){
      proof={image,source:t.source,version:t.version,sourceVersion:t.source.version,url,declared:!image||image.src===url};declaredTextureImages.set(t,proof);
    }
    declared=proof.declared;
  }
  return [t,t.source,...textureKeys.map(k=>t[k]),...t.offset.toArray(),...t.repeat.toArray(),...t.center.toArray(),...(t.matrixAutoUpdate?[]:t.matrix.elements),declared?url:t.version,declared?null:image,declared?null:image?.data,declared?null:image?.width,declared?null:image?.height];
}
function capture(value,url='',seen=new Set()){
  if(value===null||typeof value!=='object')return {kind:'value',value};
  if(value.isTexture)return {kind:'texture',value:textureValues(value,url),url};
  if(value.toArray&&['isColor','isVector2','isVector3','isVector4','isMatrix3','isMatrix4','isEuler','isQuaternion'].some(k=>value[k]))return {kind:'array-value',value:value.toArray()};
  if(Array.isArray(value)&&value.every(v=>v===null||typeof v!=='object'&&typeof v!=='function'))return {kind:'primitive-array',value:value.slice()};
  if(seen.has(value)||!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)return {kind:'unsupported'};
  seen.add(value);const keys=Object.keys(value),result={kind:'object',keys,values:keys.map(k=>capture(value[k],'',seen))};seen.delete(value);return result;
}
function matches(value,s){
  if(s.kind==='value')return Object.is(value,s.value);
  if(s.kind==='unsupported')return false;
  if(s.kind==='texture'){if(!value?.isTexture)return false;const v=textureValues(value,s.url);return v.length===s.value.length&&v.every((x,i)=>Object.is(x,s.value[i]));}
  if(s.kind==='array-value'){if(!value?.toArray)return false;const v=value.toArray();return v.length===s.value.length&&v.every((x,i)=>Object.is(x,s.value[i]));}
  if(s.kind==='primitive-array')return Array.isArray(value)&&value.length===s.value.length&&value.every((v,i)=>Object.is(v,s.value[i]));
  return value&&typeof value==='object'&&Object.keys(value).length===s.keys.length&&s.keys.every((k,i)=>Object.hasOwn(value,k)&&matches(value[k],s.values[i]));
}
export const compiledInputState=value=>capture(value);
export const compiledInputUnchanged=(value,state)=>matches(value,state);
export function materialState(material){
  const keys=Object.keys(material).filter(k=>!['id','uuid','version','_listeners'].includes(k));
  return {material,keys,values:keys.map(k=>capture(material[k],k==='map'?material.sampleLeafMaterial?.color:k==='normalMap'?material.sampleLeafMaterial?.normal:''))};
}
export function materialUnchanged(material,s){return material===s.material&&Object.keys(material).filter(k=>!['id','uuid','version','_listeners'].includes(k)).length===s.keys.length&&s.keys.every((k,i)=>matches(material[k],s.values[i]));}
export function prototypeUnchanged(p){return p.refs>0&&p.geometryStates.every(s=>geometryUnchanged(s.geometry,s))&&p.meshStates.every(s=>s.mesh.geometry===s.geometry&&s.mesh.material===s.material&&[...s.mesh.position.toArray(),...s.mesh.quaternion.toArray(),...s.mesh.scale.toArray(),s.mesh.matrixAutoUpdate,...s.mesh.matrix.elements,...s.mesh.matrixWorld.elements].every((v,i)=>v===s.pose[i]))&&p.materialStates.every(s=>materialUnchanged(s.material,s))&&p.palette.materialStates.every(s=>materialUnchanged(s.material,s));}
export function sealCompiledSampleMaterials(owner){for(const p of owners.get(owner)?.records.values()||[])if(p.needsMaterialSeal){p.materialStates=p.materials.map(materialState);p.needsMaterialSeal=false;}}

export function retainCompiledPrototype(p){if(p.refs<=0)throw Error('Cannot retain a released compiled sample');p.refs++;return p;}
export function releaseCompiledPrototype(p,dispose){
  if(p.refs<=0)return;if(--p.refs)return;
  dispose(p.built);
  for(const {geometry}of p.geometryStates){const users=geometryOwners.get(geometry);users.delete(p);if(!users.size){if(!retiredGeometries.has(geometry))geometry.dispose();geometryOwners.delete(geometry);retiredGeometries.delete(geometry);}}
  if(--p.palette.refs===0)dispose({materials:p.palette.materials,ownsMaterials:true});
}
