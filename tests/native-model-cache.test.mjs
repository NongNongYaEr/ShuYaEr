import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from '../web/vendor/three.module.min.js';
import {nativeModelRevision,markNativeModelChanged} from '../web/native-model-changes.js';
import {createNativeModelCache} from '../web/native-model-cache.js';
const fixture=()=>{const root=new THREE.Group(),group=new THREE.Group(),material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);root.add(group);group.add(mesh);const draw={id:mesh.uuid,geometry:'geometry-v1',matrix:new THREE.Matrix4().elements},cache=createNativeModelCache(),pose={root:'display-root',matrix:new THREE.Matrix4().elements},context=()=>({root,revision:nativeModelRevision(root),epoch:1,pose,materialIndex:()=>0});cache.capture({...context(),draws:[draw],objects:[mesh],materials:[{material,index:0}],bindings:new Map([['unit','v1']])});return {root,group,mesh,material,draw,cache,pose,context};};
test('explicit model revisions invalidate display snapshots without writing project or mesh fields',()=>{
 const f=fixture(),keys=Object.keys(f.root),data=structuredClone(f.root.userData),before=f.context();assert(f.cache.read(before));assert.equal(markNativeModelChanged({group:f.root}),1);assert.equal(nativeModelRevision(f.root),1);assert.equal(f.cache.read(f.context()),null);assert.deepEqual(Object.keys(f.root),keys);assert.deepEqual(f.root.userData,data);assert.equal(nativeModelRevision({}),0);
});
test('model reuse checks ownership, root pose, epoch and group visibility/hierarchy',()=>{
 const f=fixture();assert(f.cache.read(f.context()));assert.equal(f.cache.read({...f.context(),epoch:2}),null);f.pose.matrix[12]=2;assert.equal(f.cache.read(f.context()),null);f.pose.matrix[12]=0;f.group.visible=false;assert.equal(f.cache.read(f.context()),null);f.group.visible=true;const extra=new THREE.Object3D();f.group.add(extra);assert.equal(f.cache.read(f.context()),null);f.group.remove(extra);assert(f.cache.read(f.context()));const other=new THREE.Group();other.add(f.root);assert.equal(f.cache.read(f.context()),null);
});
test('material visibility, compatibility and changed encoded uniforms require a fresh model record',()=>{
 const f=fixture();assert.equal(f.cache.read({...f.context(),materialIndex:()=>1}),null);f.material.visible=false;assert.equal(f.cache.read(f.context()),null);f.material.visible=true;f.material.depthTest=false;assert.equal(f.cache.read(f.context()),null);f.material.depthTest=true;f.material.isShaderMaterial=true;assert.equal(f.cache.read(f.context()),null);
});
test('full model audits detect changed geometry records and physical instance bindings',()=>{
 const f=fixture(),snapshot=f.cache.read(f.context());assert(f.cache.matches(snapshot,[f.draw],new Map([['unit','v1']])));assert(!f.cache.matches(snapshot,[{...f.draw,geometry:'geometry-v2'}],new Map([['unit','v1']])));assert(!f.cache.matches(snapshot,[f.draw],new Map([['unit','v2']])));assert(!f.cache.matches(snapshot,[],new Map([['unit','v1']])));f.cache.clear();assert.equal(f.cache.read(f.context()),null);
});
test('models with auxiliary or unsupported members do not retain a partial native snapshot',()=>{
 const f=fixture();f.cache.capture({...f.context(),draws:[f.draw],objects:[f.mesh],materials:[],bindings:new Map(),eligible:false});assert.equal(f.cache.read(f.context()),null);
});
