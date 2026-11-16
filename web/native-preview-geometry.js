import * as THREE from './vendor/three.module.min.js';

// GPU preview clones add shader-only lookup attributes. Their native vertex
// payload is initially an exact clone of the source, so retain that resource.
// Any supported attribute, storage, range or group change revokes the alias.
const names=['position','normal','uv','color','sampleCenter','sampleTangent'];
const aliases=new WeakMap();
const objectUvPreviews=new WeakMap(),uvGeometries=new WeakMap();
const objectPosePreviews=new WeakMap();
const attributeState=attribute=>{if(!attribute)return null;const data=attribute.data||attribute;return {attribute,data,array:data.array,version:data.version,stride:data.stride,count:attribute.count,size:attribute.itemSize,normalized:attribute.normalized,offset:attribute.offset};};
const sameAttribute=(attribute,state)=>{if(!state)return !attribute;const data=attribute?.data||attribute;return attribute===state.attribute&&data===state.data&&data.array===state.array&&data.version===state.version&&data.stride===state.stride&&attribute.count===state.count&&attribute.itemSize===state.size&&attribute.normalized===state.normalized&&attribute.offset===state.offset;};
const state=geometry=>({attributes:names.map(name=>attributeState(geometry.attributes[name])),index:attributeState(geometry.index),start:geometry.drawRange.start,count:geometry.drawRange.count,groups:geometry.groups.map(g=>({...g}))});
const unchanged=(geometry,s)=>s.start===geometry.drawRange.start&&s.count===geometry.drawRange.count&&s.groups.length===geometry.groups.length&&s.groups.every((g,i)=>{const other=geometry.groups[i];return g.start===other.start&&g.count===other.count&&g.materialIndex===other.materialIndex;})&&names.every((name,i)=>sameAttribute(geometry.attributes[name],s.attributes[i]))&&sameAttribute(geometry.index,s.index);
export function cloneNativePreviewGeometry(source){
 const clone=source.clone();
 // Unknown custom clone/copy implementations keep the normal transport path.
 if(source.clone===THREE.BufferGeometry.prototype.clone&&source.copy===THREE.BufferGeometry.prototype.copy)aliases.set(clone,{source,sourceState:state(source),cloneState:state(clone)});
 return clone;
}
export function nativePreviewGeometrySource(geometry){const a=aliases.get(geometry);return a&&unchanged(a.source,a.sourceState)&&unchanged(geometry,a.cloneState)?a.source:geometry;}

// DX12 accepts one UV attribute per draw. Share the static glTF buffers and
// substitute the chosen channel only in the geometry used for presentation.
export function setNativePreviewUv(object,uv){
  const source=object.geometry;
  let byUv=uvGeometries.get(source);
  if(!byUv)uvGeometries.set(source,byUv=new WeakMap());
  let geometry=byUv.get(uv);
  if(!geometry){
    geometry=new THREE.BufferGeometry();
    geometry.attributes={...source.attributes,uv};
    geometry.index=source.index;
    geometry.groups=source.groups;
    geometry.drawRange=source.drawRange;
    byUv.set(uv,geometry);
  }
  objectUvPreviews.set(object,{source,geometry});
}

export function nativePreviewGeometryForObject(object){
  const preview=objectUvPreviews.get(object);
  return preview&&preview.source===object.geometry ? preview.geometry : nativePreviewGeometrySource(object.geometry);
}

export function clearNativePreviewUv(object){objectUvPreviews.delete(object);}

// Keep the editor's baked geometry for picking and export. DX12 can draw the
// same vertices from a fixed source and apply the placement as a draw matrix.
export function setNativePreviewPose(object, geometry, matrix) {
  objectPosePreviews.set(object, { baked:object.geometry, bakedState:state(object.geometry), geometry, matrix });
}

export function nativePreviewPoseForObject(object) {
  const preview = objectPosePreviews.get(object);
  if (preview?.baked === object.geometry && objectUvPreviews.get(object)?.source !== object.geometry
    && unchanged(object.geometry, preview.bakedState)) return preview;
  return null;
}
