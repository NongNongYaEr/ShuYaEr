import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBranchAsset,disposeBranchAsset,normalizeSettings,LOD_PROFILES} from '../web/branch-kernel.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {createDirectTrunkForm} from '../web/trunk-form.js';
import {encodeGeometryRuntime,decodeGeometryRuntime} from '../web/geometry-transfer.js';
import {computeTrunkGeometry} from '../web/trunk-geometry-compute.js';
import {prepareBackgroundTrunks} from '../web/trunk-background-geometry.js';
import {createGeometryJobClient} from '../web/geometry-job-client.js';
import {pointCornerPlan} from '../web/branch-point-corner.js';
import * as THREE from 'three';

const snapshot=(settings,authoring)=>({settings,authoring,leaf_sources:[]});
test('background trunk buffers, surface UVs and editor rings exactly match a cold rebuild at each LOD',async()=>{
  for(const lod of [0,1,2,3]){
    const settings=normalizeSettings({leaf_density:0,junction_collar:false,preview_lod:lod,adaptive_tessellation:true}),a=normalizeAuthoring({branch_shape:{branches:[{id:'ROOT',parent:'',points:[[0,0,0],[.3,0,1],[.8,.2,3]],length:3.3,start_radius:.4,end_radius:.2}]}}),asset=buildBranchAsset(settings,null,[],lod,a);
    const next=structuredClone(a),form=createDirectTrunkForm();form.sections=[{id:'LOW',t:.15,radius:1.6,oval:1.1,roll:34,span:.2},{id:'TOP',t:.7,radius:.8,oval:.9,roll:67,span:.2}];form.details=[{id:'CUT',type:'SCAR',t:.3,angle:15,strength:.2,width:15,height:.08}];next.workbench||={};next.workbench.trunk_forms={version:1,branches:{ROOT:form}};
    let count=0;const client={run:async job=>{count++;return {geometry:computeTrunkGeometry(job)};}},cache=await prepareBackgroundTrunks(client,asset,snapshot(settings,a),snapshot(settings,next),LOD_PROFILES[lod]);
    const cached=buildBranchAsset(settings,null,[],lod,next,{branchGeometries:cache}),cold=buildBranchAsset(settings,null,[],lod,next);
    try{assert.equal(count,1);assert.equal(cache.size,0);const meshes=x=>{const out=[];x.group.traverse(o=>{if(o.isMesh)out.push(o);});return out;},actual=meshes(cached),expected=meshes(cold);assert.equal(actual.length,expected.length);
      for(let i=0;i<actual.length;i++){for(const key of Object.keys(expected[i].geometry.attributes))assert.deepEqual(actual[i].geometry.attributes[key].array,expected[i].geometry.attributes[key].array,key+' LOD'+lod);assert.deepEqual(actual[i].geometry.index.array,expected[i].geometry.index.array);assert.deepEqual(actual[i].geometry.userData.radiusRings,expected[i].geometry.userData.radiusRings);}
      assert.deepEqual(asset.authoring,a);assert.equal(a.workbench?.trunk_forms,undefined);
    }finally{disposeBranchAsset(asset);disposeBranchAsset(cached);disposeBranchAsset(cold);}
  }
});
test('corner deformation callbacks are reconstructed from numeric descriptors without changing the curve or transported frames',()=>{
  const points=[[0,0,0],[0,0,1],[.3,0,2],[.5,0,3]].map(p=>new THREE.Vector3(...p)),branch={points,controlPoints:points.map(p=>p.clone())},plan=pointCornerPlan(branch,1,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.4).toArray());
  const decoded=decodeGeometryRuntime(structuredClone(encodeGeometryRuntime(plan.points)));
  assert.deepEqual(decoded.map(p=>p.toArray()),plan.points.map(p=>p.toArray()));assert.deepEqual(decoded.axisTimes,plan.points.axisTimes);assert.deepEqual(decoded.axisCuts,plan.points.axisCuts);
  for(let t=0;t<=1;t+=.01)assert.deepEqual(decoded.axisDeformation.turnAt(t).toArray(),plan.points.axisDeformation.turnAt(t).toArray());
});
test('new geometry jobs reject and terminate old work; stale replies cannot resolve the current request',async()=>{
  const workers=[];class FakeWorker{constructor(){workers.push(this);}postMessage(message){this.message=message;}terminate(){this.terminated=true;}}
  const client=createGeometryJobClient({createWorker:()=>new FakeWorker()});const first=client.run({first:true});const rejected=assert.rejects(first,{name:'AbortError'});const second=client.run({second:true});assert.equal(workers[0].terminated,true);workers[0].onmessage({data:{id:workers[0].message.id,geometry:'old'}});assert.equal(client.stats.active,true);workers[1].onmessage({data:{id:workers[1].message.id,geometry:'new'}});assert.equal((await second).geometry,'new');await rejected;assert.equal(client.stats.completed,1);assert.equal(client.stats.cancelled,1);client.dispose();assert.equal(workers[1].terminated,true);
});
test('worker failures preserve the error and allow a new worker to compute the next job',async()=>{
  const workers=[];class FakeWorker{constructor(){workers.push(this);}postMessage(m){this.message=m;}terminate(){this.terminated=true;}}
  const client=createGeometryJobClient({createWorker:()=>new FakeWorker()}),failed=client.run({});workers[0].onerror({message:'exact failure'});await assert.rejects(failed,/exact failure/);const second=client.run({});assert.equal(workers.length,2);workers[1].onmessage({data:{id:workers[1].message.id,geometry:'ok'}});assert.equal((await second).geometry,'ok');client.dispose();
});

test('late errors from a terminated worker cannot reject or terminate the replacement job',async()=>{
  const workers=[];class FakeWorker{constructor(){workers.push(this);}postMessage(message){this.message=message;}terminate(){this.terminated=true;}}
  const client=createGeometryJobClient({createWorker:()=>new FakeWorker()}),first=client.run({});const rejected=assert.rejects(first,{name:'AbortError'}),second=client.run({});await rejected;
  workers[0].onerror({message:'late old error'});workers[0].onmessageerror();assert.equal(client.stats.active,true);assert.equal(workers[1].terminated,undefined);
  workers[1].onmessage({data:{id:workers[1].message.id,geometry:'current'}});assert.equal((await second).geometry,'current');client.dispose();
});
