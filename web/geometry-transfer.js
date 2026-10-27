import * as THREE from './vendor/three.module.min.js';
import {axisTimes,axisSegment,withAxisTimes} from './branch-axis.js';

// Attachment bindings are graph callbacks, not sweep inputs. Their sampled
// axes/frames are already on the branch; never clone these callbacks or images.
export function encodeSweepBranch(branch){
  const prune=b=>{const {mountFrameBinding,barkSurface,...rest}=b;if(rest.legacyRigidGeometry){const {collarParent,...legacy}=rest.legacyRigidGeometry;rest.legacyRigidGeometry={...legacy,baseline:prune(legacy.baseline)};}return rest;};
  return encodeGeometryRuntime(prune(branch));
}

// Explicit mathematical runtime protocol; never serializes scene/source models.
export function encodeGeometryRuntime(value){
  if(value===null||typeof value!=='object'){if(typeof value==='function')throw Error('Unsupported geometry callback');return value;}
  for(const [flag,type]of [['isVector3','Vector3'],['isVector2','Vector2'],['isQuaternion','Quaternion'],['isMatrix4','Matrix4']])if(value[flag])return {type,value:value.toArray()};
  if(ArrayBuffer.isView(value))return {type:'TypedArray',name:value.constructor.name,value:value.slice()};
  if(value instanceof Set)return {type:'Set',value:[...value].map(encodeGeometryRuntime)};
  if(Array.isArray(value))return {type:'Array',value:value.map(encodeGeometryRuntime),...(axisTimes(value)?{axisTimes:axisTimes(value),axisCuts:value.axisCuts,axisDeformation:encodeGeometryRuntime(value.axisDeformation)}:{})};
  return {type:'Object',value:Object.fromEntries(Object.entries(value).filter(([key])=>!(key==='turnAt'&&value.turnDescriptor)).map(([key,item])=>[key,encodeGeometryRuntime(item)]))};
}
const arrays={Float32Array,Float64Array,Uint8Array,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array};
export function decodeGeometryRuntime(record){
  if(record===null||typeof record!=='object')return record;
  if(['Vector3','Vector2','Quaternion','Matrix4'].includes(record.type))return new THREE[record.type]().fromArray(record.value);
  if(record.type==='TypedArray')return new arrays[record.name](record.value);
  if(record.type==='Set')return new Set(record.value.map(decodeGeometryRuntime));
  if(record.type==='Array'){const result=record.value.map(decodeGeometryRuntime);return record.axisTimes?withAxisTimes(result,record.axisTimes,record.axisCuts,decodeGeometryRuntime(record.axisDeformation)):result;}
  if(record.type!=='Object')throw Error('Unsupported geometry runtime record');
  const value=Object.fromEntries(Object.entries(record.value).map(([key,item])=>[key,decodeGeometryRuntime(item)]));
  if(value.turnDescriptor){const {distances,start,width,rotation,strength}=value.turnDescriptor,q=new THREE.Quaternion().fromArray(rotation);value.turnAt=t=>{const {index,u}=axisSegment(value.source,t),distance=distances[index]+(distances[index+1]-distances[index])*u,x=Math.max(0,Math.min(1,(distance-start)/width));return new THREE.Quaternion().slerp(q,x*x*(3-2*x)*strength);};}
  return value;
}
export function packComputedGeometry(geometry){
  const attributes=Object.fromEntries(Object.entries(geometry.attributes).map(([key,a])=>[key,{array:a.array,itemSize:a.itemSize,normalized:a.normalized}]));
  return {version:1,attributes,index:geometry.index?.array||null,groups:geometry.groups,userData:geometry.userData};
}
export function geometryTransferBuffers(data){return [...new Set([...Object.values(data.attributes).map(a=>a.array.buffer),...(data.index?[data.index.buffer]:[])])];}
export function unpackComputedGeometry(data){
  if(data?.version!==1||!data.attributes?.position)throw Error('Invalid computed geometry');
  const geometry=new THREE.BufferGeometry();for(const [key,a]of Object.entries(data.attributes))geometry.setAttribute(key,new THREE.BufferAttribute(a.array,a.itemSize,a.normalized));
  if(data.index)geometry.setIndex(new THREE.BufferAttribute(data.index,1));geometry.groups=data.groups||[];geometry.userData=data.userData||{};geometry.computeBoundingBox();return geometry;
}
