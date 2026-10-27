import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {trunkFoldFeatures} from '../web/trunk-fold-points.js';
import {createTrunkMeshSampling,createTrunkMeshPreset} from '../web/trunk-mesh-density.js';
import {createTrunkFormPreviewGeometry,normalizeSettings,DEFAULT_SETTINGS} from '../web/branch-kernel.js';

const TAU=Math.PI*2;
const effect=a=>1-.34*Math.max(0,Math.cos(a*11))**2;

test('fold extrema include the periodic seam and reject flat/invalid fields',()=>{
 const features=trunkFoldFeatures(effect);assert.ok(features.length>=22);assert.ok(features.some(p=>p.kind==='TURN'));
 assert.ok(features.some(p=>p.kind==='MIN'&&Math.abs((p.angle+180)%360-180)<1e-3));
 assert.deepEqual(trunkFoldFeatures(()=>1),[]);assert.deepEqual(trunkFoldFeatures(()=>NaN),[]);
});
test('bounded sampling preserves authored section heights when ordinary seeds exceed the ring budget',()=>{
 const b={length:30,points:[new THREE.Vector3(0,0,0),new THREE.Vector3(.2,.1,15),new THREE.Vector3(.5,0,30)]};
 const authored=Array.from({length:24},(_,i)=>(i+.37)/25),seed=[...authored,...Array.from({length:129},(_,i)=>i/128)];
 const plan=createTrunkMeshSampling(b,{...createTrunkMeshPreset(),radial_segments:512},[],seed,
  {vertexLimit:48000,priorityTs:authored,seedAngles:Array.from({length:1600},(_,i)=>i*TAU/1600)});
 assert.ok(plan.ts.length*plan.angles.length+2<=48000);assert.equal(plan.info.limited,true);
 for(const t of authored)assert.ok(plan.ts.some(x=>Math.abs(x-t)<1e-10),`dropped section ${t}`);
 assert.equal(plan.ts[0],0);assert.equal(plan.ts.at(-1),1);
});
test('interactive skin includes the actual edited ring even with many dense neighbouring sections',()=>{
 const b={id:0,stableId:'ROOT',parentId:-1,order:0,length:30,startRadius:.5,endRadius:.1,
 points:[new THREE.Vector3(0,0,0),new THREE.Vector3(.2,.1,15),new THREE.Vector3(.5,0,30)],sections:[],phase:.2,windPhase:.4,windStiffness:1,children:[]};
 const sections=Array.from({length:24},(_,i)=>({id:'S'+i,t:(i+.37)/25,radius:1,oval:1,roll:i,span:.18,
 profile:Array.from({length:128},(_,j)=>({id:'P'+j,angle:(j*360/128+i*.33)%360,radius:1+.1*Math.cos(j/128*TAU*11)}))}));
 const form={geometry_version:2,enabled:true,sections,details:[],mesh:{...createTrunkMeshPreset(),radial_segments:512}};
 const g=createTrunkFormPreviewGeometry(b,normalizeSettings({...DEFAULT_SETTINGS,leaf_density:0}),form,0,{view:'FINAL',vertexLimit:48000});
 try{assert.ok(g.attributes.position.count<=48000);for(const s of sections)assert.ok(g.userData.radiusRings.some(r=>Math.abs(r.t-s.t)<1e-10));}
 finally{g.dispose();}
});
