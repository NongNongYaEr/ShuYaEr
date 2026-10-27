import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTrunkFormPreset,createDirectTrunkForm,normalizeTrunkForm,getBaseTrunkForm} from '../web/trunk-form.js';
import {createTrunkFormPreviewGeometry,normalizeSettings,DEFAULT_SETTINGS} from '../web/branch-kernel.js';
import {trunkRootPlaneSpan} from '../web/trunk-root-plane.js';

const branch=()=>({id:0,stableId:'ROOT',parentId:-1,order:0,length:4,startRadius:.4,endRadius:.1,phase:.27,windPhase:.43,windStiffness:1,children:[],sections:[],points:[[0,0,.3],[.4,-.16,1.3],[.5,.1,2.3],[.9,.4,3.3],[1.1,.5,4.3]].map(p=>new THREE.Vector3(...p))});
const settings=normalizeSettings({...DEFAULT_SETTINGS,radial_segments:9,leaf_density:0,adaptive_tessellation:false,twist:11,section_roll:21});
const recipe=direct=>{const f=createTrunkFormPreset('BUTTRESS');f.sections=[{id:'A',t:.22,radius:1.05,oval:.9,roll:37,span:.18},{id:'B',t:.64,radius:.85,oval:1.1,roll:-15,span:.18}];return direct?createDirectTrunkForm(f):normalizeTrunkForm(f);};
const row=(g,r)=>Array.from(g.attributes.position.array.slice(r.offset*3,(r.offset+r.count)*3));

test('root-plane intent is optional, strictly normalized and retained by direct/base views',()=>{
 const source=recipe(false);assert.ok(!('root_plane'in source));assert.deepEqual(normalizeTrunkForm({...source,root_plane:'FOLLOW'}),source);assert.deepEqual(normalizeTrunkForm({...source,root_plane:'bogus'}),source);
 const horizontal=normalizeTrunkForm({...source,root_plane:'HORIZONTAL'});assert.equal(createDirectTrunkForm(horizontal).root_plane,'HORIZONTAL');assert.equal(getBaseTrunkForm(horizontal).root_plane,'HORIZONTAL');assert.equal(trunkRootPlaneSpan(horizontal),.18);assert.equal(trunkRootPlaneSpan({...horizontal,sections:[{t:0},{t:.08},{t:.5}]}),.08);
});
test('V1 and DIRECT base skin, cap and editing frames are horizontal at all LODs while higher authored circle vertices remain exact',()=>{
 for(const direct of [false,true])for(let lod=0;lod<4;lod++){
  const source=recipe(direct),before=structuredClone(source),b=branch(),flat={...source,root_plane:'HORIZONTAL'},old=createTrunkFormPreviewGeometry(b,settings,source,lod),g=createTrunkFormPreviewGeometry(b,settings,flat,lod);
  try{
   const root=g.userData.radiusRings[0],zs=row(g,root).filter((_,i)=>i%3===2);assert.ok(Math.max(...zs)-Math.min(...zs)<1e-6);assert.ok(Math.abs(zs[0]-.3)<1e-6);assert.ok(Math.abs(old.attributes.position.getZ(0)-g.attributes.position.getZ(0))>1e-4);
   assert.ok(Math.abs(Math.abs(root.tangent[2])-1)<1e-10);for(const key of ['x','y','rolledX','rolledY'])assert.ok(Math.abs(root[key][2])<1e-10,key);
   for(let i=0;i<g.userData.radiusRings.length;i++){const r=g.userData.radiusRings[i];if(r.t>=trunkRootPlaneSpan(flat))assert.deepEqual(row(g,r),row(old,old.userData.radiusRings[i]));}
   assert.deepEqual(g.index.array,old.index.array);assert.deepEqual(g.attributes.color.array,old.attributes.color.array);
   // V1 keeps historical UV bytes. The direct skin recomputes UV from its new
   // physical surface after flattening the root, while authored circles stay.
   if(!direct)assert.deepEqual(g.attributes.uv.array,old.attributes.uv.array);else assert.ok(g.attributes.uv.array.every(Number.isFinite));
   assert.ok([...g.attributes.position.array,...g.attributes.normal.array].every(Number.isFinite));assert.equal(g.attributes.position.getZ(g.attributes.position.count-2),old.attributes.position.getZ(old.attributes.position.count-2));
   assert.deepEqual(source,before);assert.deepEqual(b.points,branch().points);
  }finally{old.dispose();g.dispose();}
 }
});
test('horizontal intent never flattens an attached branch or an explicitly disabled form',()=>{
 const f=recipe(true);for(const b of [{...branch(),parentId:1,order:1},branch()]){const disabled=b.parentId===1?{}:{enabled:false},a=createTrunkFormPreviewGeometry(b,settings,{...f,...disabled}),c=createTrunkFormPreviewGeometry(b,settings,{...f,...disabled,root_plane:'HORIZONTAL'});try{assert.deepEqual(c.attributes.position.array,a.attributes.position.array);}finally{a.dispose();c.dispose();}}
});
test('drag-budget and final meshes share a horizontal base and common transition rows',()=>{
 const form={...recipe(true),root_plane:'HORIZONTAL',mesh:{version:1,radial_segments:192,segment_length:.008,detail_samples:12}},b=branch(),p=createTrunkFormPreviewGeometry(b,settings,form,{vertexLimit:48000}),f=createTrunkFormPreviewGeometry(b,settings,form,{vertexLimit:250000});
 try{for(const g of [p,f]){const z=row(g,g.userData.radiusRings[0]).filter((_,i)=>i%3===2);assert.ok(Math.max(...z)-Math.min(...z)<1e-6);}assert.ok(p.attributes.position.count<=48000);assert.ok(f.attributes.position.count<=250000);let shared=0;for(const r of p.userData.radiusRings){const final=f.userData.radiusRings.find(s=>s.t===r.t);if(final){assert.deepEqual(row(p,r),row(f,final));shared++;}}assert.ok(shared>=2);}finally{p.dispose();f.dispose();}
});
