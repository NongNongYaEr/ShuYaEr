import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {instantiateNativeGeometryKernel} from '../web/native-geometry-kernel.js';
import {installGeometryAccelerator} from '../web/geometry-accelerator.js';
import {createTrunkFormPreviewGeometry,normalizeSettings,buildBranchAsset,disposeBranchAsset} from '../web/branch-kernel.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {createDirectTrunkForm} from '../web/trunk-form.js';
import {summarizeDurations} from '../web/performance-recorder.js';

const bytes=fs.readFileSync(new URL('../web/native/geometry-kernel-v1.wasm',import.meta.url)),native=await instantiateNativeGeometryKernel(bytes);
test.afterEach(()=>installGeometryAccelerator(null));
test('C++ indexed normals, grouped tangents and unused vertices are bit-identical to the JS geometry reference',()=>{
  const make=()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,1,1,.4,0,1,-.2,3,3,3],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1,0,0],2));g.setIndex([0,1,2,0,2,3]);g.addGroup(0,3,0);g.addGroup(3,3,1);return g;};
  const expected=make(),actual=make();try{expected.computeVertexNormals();expected.computeTangents();assert.equal(native.normals(actual),true);assert.deepEqual(actual.attributes.normal.array,expected.attributes.normal.array);assert.equal(native.tangents(actual),true);assert.deepEqual(actual.attributes.tangent.array,expected.attributes.tangent.array);assert.ok(actual.attributes.tangent.array.every(Number.isFinite));}finally{actual.dispose();expected.dispose();}
});
test('C++ normal and tangent stages preserve the complete sampled trunk, seams and surface UVs bit for bit',()=>{
  const settings=normalizeSettings({surface_roughness:.02,cross_section:'LOBED',groove_depth:.05,twist:33,junction_collar:false}),branch={id:0,stableId:'ROOT',parentId:-1,order:0,points:[[0,0,0],[.4,.2,1],[.3,-.1,3]].map(p=>new THREE.Vector3(...p)),length:3.3,startRadius:.4,endRadius:.2,phase:.31,windPhase:.4,windStiffness:1,sections:[],children:[]};
  const direct=createDirectTrunkForm();direct.sections=[{id:'A',t:.2,radius:1.5,oval:1.2,roll:47,span:.2},{id:'B',t:.8,radius:.7,oval:.8,roll:73,span:.2}];direct.details=[{id:'D',type:'GROOVE',t:.4,angle:13,width:7,height:.04,strength:.2}];
  for(const form of [null,direct]){installGeometryAccelerator(null);const expected=createTrunkFormPreviewGeometry(branch,settings,form);installGeometryAccelerator(native);const actual=createTrunkFormPreviewGeometry(branch,settings,form);try{for(const key of Object.keys(expected.attributes))assert.deepEqual(actual.attributes[key].array,expected.attributes[key].array,key);assert.deepEqual(actual.index.array,expected.index.array);assert.deepEqual(actual.userData,expected.userData);}finally{expected.dispose();actual.dispose();}}
  assert.ok(native.stats.normals_calls>0);assert.ok(native.stats.tangent_calls>0);assert.ok(native.stats.surface_tangent_calls>0);
});
test('real dense-user trunk passes strict differential checks and records end-to-end kernel cost including buffer transfer',()=>{
  const input=new URL('../.runtime/bark-material-workspace/用户当前工程_只读副本.branch.json',import.meta.url);if(!fs.existsSync(input))return;
  const doc=JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,'')),settings=normalizeSettings(doc.settings),a=normalizeAuthoring(doc.authoring),asset=buildBranchAsset(settings,null,[],0,a,{skeletonOnly:true}),branch=asset.masterBranches.find(b=>b.stableId==='CAMPHOR_TRUNK'),form=a.workbench.trunk_forms.branches[branch.stableId];
  const timings={javascript:[],cpp_wasm:[]};let expected;
  try{for(let i=0;i<5;i++)for(const [name,backend]of [['javascript',null],['cpp_wasm',native]]){installGeometryAccelerator(backend);const start=performance.now(),g=createTrunkFormPreviewGeometry(branch,settings,form);timings[name].push(performance.now()-start);
    if(!expected)expected=g;else{for(const key of Object.keys(expected.attributes))assert.deepEqual(g.attributes[key].array,expected.attributes[key].array,name+' '+key);assert.deepEqual(g.index.array,expected.index.array);g.dispose();}}
    fs.mkdirSync(new URL('../.runtime/professional-upgrade/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../.runtime/professional-upgrade/native-kernel-benchmark.json',import.meta.url),JSON.stringify({vertices:expected.attributes.position.count,stats:native.stats,methodology:'Same real dense trunk, same JS sampler; C++ normal/tangent stages include JS/Wasm buffer copies. Five runs per backend, strict Float32 equality.',results:Object.fromEntries(Object.entries(timings).map(([key,values])=>[key,{...summarizeDurations(values),values_ms:values}]))},null,2));
  }finally{expected?.dispose();disposeBranchAsset(asset);}
});
