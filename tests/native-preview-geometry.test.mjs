import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from '../web/vendor/three.module.min.js';
import {nativeGeometry} from '../web/native-viewport.js';
import {cloneNativePreviewGeometry,nativePreviewGeometrySource} from '../web/native-preview-geometry.js';
const fixture=()=>{const source=new THREE.BufferGeometry().copy(new THREE.BoxGeometry());source.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:source.attributes.position.count*4},(_,i)=>i%4===3?.5:.25),4));return {source,preview:cloneNativePreviewGeometry(source)};};
test('preview clone retains exactly the original native payload while private lookup attributes remain local',()=>{
 const {source,preview}=fixture(),originalKeys=Object.keys(source.attributes);preview.setAttribute('duckEditVertex',new THREE.Float32BufferAttribute(Array.from({length:preview.attributes.position.count},(_,i)=>i),1));assert.equal(nativePreviewGeometrySource(preview),source);assert.deepEqual(nativeGeometry(preview),nativeGeometry(source));assert.notEqual(preview.attributes.position.array,source.attributes.position.array);assert.deepEqual(Object.keys(source.attributes),originalKeys);assert.equal(source.userData.nativeSource,undefined);preview.dispose();assert.deepEqual(Object.keys(source.attributes),originalKeys);source.dispose();
});
test('a clone-side vertex or index change revokes resource reuse before encoding',()=>{
 for(const mutate of [g=>g.setAttribute('position',g.attributes.position.clone()),g=>{g.attributes.normal.needsUpdate=true;},g=>g.setIndex(g.index.clone()),g=>{g.attributes.color.array=g.attributes.color.array.slice();},g=>{g.attributes.uv.normalized=true;}]){const {source,preview}=fixture();mutate(preview);assert.equal(nativePreviewGeometrySource(preview),preview);source.dispose();preview.dispose();}
});
test('source changes cannot leak into an existing preview clone',()=>{
 const {source,preview}=fixture(),before=nativeGeometry(preview);source.attributes.position.setX(0,source.attributes.position.getX(0)+1);source.attributes.position.needsUpdate=true;assert.equal(nativePreviewGeometrySource(preview),preview);assert.deepEqual(nativeGeometry(preview),before);assert.notDeepEqual(nativeGeometry(source).vertices,before.vertices);source.dispose();preview.dispose();
});
test('draw range and group edits revoke aliases while ordinary source geometries are unchanged',()=>{
 const {source,preview}=fixture();assert.equal(nativePreviewGeometrySource(source),source);preview.groups[0].materialIndex++;assert.equal(nativePreviewGeometrySource(preview),preview);const other=cloneNativePreviewGeometry(source);other.setDrawRange(3,6);assert.equal(nativePreviewGeometrySource(other),other);source.dispose();preview.dispose();other.dispose();
});
test('custom clone implementations use their own actual native payload',()=>{
 const source=new THREE.BufferGeometry().copy(new THREE.BoxGeometry());source.clone=function(){const g=new THREE.BufferGeometry().copy(this);g.attributes.position.setX(0,99);return g;};const preview=cloneNativePreviewGeometry(source);assert.equal(nativePreviewGeometrySource(preview),preview);assert.equal(preview.attributes.position.getX(0),99);source.dispose();preview.dispose();
});
test('interleaved preview reuse is exact and is revoked when its storage layout changes',()=>{
 const source=new THREE.BufferGeometry(),data=new THREE.InterleavedBuffer(new Float32Array([1,2,3,99,4,5,6,98]),4);source.setAttribute('position',new THREE.InterleavedBufferAttribute(data,3,0));const preview=cloneNativePreviewGeometry(source);assert.equal(nativePreviewGeometrySource(preview),source);assert.deepEqual(nativeGeometry(preview),nativeGeometry(source));preview.attributes.position.data.stride=5;assert.equal(nativePreviewGeometrySource(preview),preview);assert.notDeepEqual(nativeGeometry(preview).vertices,nativeGeometry(source).vertices);source.dispose();preview.dispose();
});
