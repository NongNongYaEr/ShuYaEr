import * as THREE from './vendor/three.module.min.js';

// GPU preview clones add shader-only lookup attributes. Their native vertex
// payload is initially an exact clone of the source, so retain that resource.
// Any supported attribute, storage, range or group change revokes the alias.
const names=['position','normal','uv','color','sampleCenter','sampleTangent'];
const aliases=new WeakMap();
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
