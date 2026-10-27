import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTrunkFormPreviewGeometry,createTrunkFormPreviewJob,normalizeSettings} from '../web/branch-kernel.js';
import {createDirectTrunkForm,createTrunkFormPreset} from '../web/trunk-form.js';
import {computeTrunkGeometry} from '../web/trunk-geometry-compute.js';
import {unpackComputedGeometry,packComputedGeometry} from '../web/geometry-transfer.js';
import {createCoalescedGeometryPreview} from '../web/coalesced-geometry-preview.js';
const branch={id:0,stableId:'ROOT',parentId:-1,order:0,points:[[0,0,0],[.2,.3,2],[.5,0,5]].map(p=>new THREE.Vector3(...p)),sections:[],children:[],length:5.2,startRadius:.4,endRadius:.2,phase:.13,windPhase:.4,windStiffness:1};
const form=createDirectTrunkForm({...createTrunkFormPreset('BUTTRESS'),sections:[{id:'LOW',t:.3,radius:1.4,roll:36,oval:1.2},{id:'HIGH',t:.8,radius:.8,roll:73,oval:.9}]});
test('background preview jobs reproduce every JS preview attribute at each LOD and in both inspection views',()=>{
 const settings=normalizeSettings({twist:23});for(const lod of [0,1,2,3])for(const view of ['BASE','FINAL']){const expected=createTrunkFormPreviewGeometry(branch,settings,form,lod,{view,vertexLimit:48000}),actual=unpackComputedGeometry(computeTrunkGeometry(createTrunkFormPreviewJob(branch,settings,form,lod,{view,vertexLimit:48000})));try{for(const [key,a]of Object.entries(expected.attributes))assert.deepEqual(actual.attributes[key].array,a.array,key);assert.deepEqual(actual.index.array,expected.index.array);assert.deepEqual(actual.userData.radiusRings,expected.userData.radiusRings);}finally{actual.dispose();expected.dispose();}}
});
test('lightweight control geometry retains exact sampled ring coordinates and every around-ring corner',()=>{
 const settings=normalizeSettings({twist:23}),full=createTrunkFormPreviewGeometry(branch,settings,form,0,{vertexLimit:48000}),light=createTrunkFormPreviewGeometry(branch,settings,form,0,{vertexLimit:48000,handleTs:[0,.275,.3,.325,.8,1]});
 try{assert.ok(light.attributes.position.count<full.attributes.position.count/2);assert.equal(light.attributes.normal,undefined);for(const ring of light.userData.radiusRings){const original=full.userData.radiusRings.find(r=>Math.abs(r.t-ring.t)<1e-12);assert.ok(original);assert.equal(ring.count,original.count);assert.deepEqual(light.attributes.position.array.slice(ring.offset*3,(ring.offset+ring.count)*3),full.attributes.position.array.slice(original.offset*3,(original.offset+original.count)*3));}}finally{full.dispose();light.dispose();}
});
const tick=()=>new Promise(setImmediate),data=()=>{const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(1,0,0)]);return packComputedGeometry(g);};
test('continuous preview has one active and one latest queued job, advancing results monotonically',async()=>{
 const work=[],installed=[];const client={run:job=>new Promise(resolve=>work.push({job,resolve})),cancel(){},dispose(){},stats:{}};
 const q=createCoalescedGeometryPreview(client,{install:(g,c,r)=>{installed.push([c,r]);g.dispose();}});for(let n=1;n<=20;n++)q.request({n},n);assert.equal(work.length,1);assert.equal(q.stats.queued,true);assert.equal(q.stats.merged,18);work[0].resolve({geometry:data()});await tick();assert.equal(work.length,2);assert.equal(work[1].job.n,20);work[1].resolve({geometry:data()});await tick();assert.deepEqual(installed,[[1,1],[20,20]]);assert.equal(q.stats.active,false);q.dispose();
});
test('cancelled gestures and changed owners cannot install late preview meshes',async()=>{
 const work=[],installed=[];const client={run:job=>new Promise(resolve=>work.push({job,resolve})),cancel(){},dispose(){},stats:{}};let owner=1;
 const q=createCoalescedGeometryPreview(client,{valid:c=>c===owner,install:g=>{installed.push(g);}});q.request({},1);q.cancel();owner=2;q.request({},2);work[0].resolve({geometry:data()});await tick();assert.equal(installed.length,0);assert.equal(q.stats.active,true);work[1].resolve({geometry:data()});await tick();assert.equal(installed.length,1);installed[0].dispose();q.dispose();
});
