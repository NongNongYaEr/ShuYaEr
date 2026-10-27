import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {withAxisTimes,axisTime,uniqueAxisTimes} from '../web/branch-axis.js';
import {evaluatePointRotation} from '../web/branch-point-rotation.js';
import {evaluatePointSlide} from '../web/branch-point-slide.js';
import {createTrunkFormPreviewGeometry,normalizeSettings} from '../web/branch-kernel.js';
import {relaxSweepStrips} from '../web/branch-sweep-continuity.js';
import {createTrunkMeshSampling,createTrunkMeshPreset} from '../web/trunk-mesh-density.js';

const v=p=>new THREE.Vector3(...p),base=()=>({id:0,stableId:'ROOT',parentId:-1,order:0,points:[[0,0,0],[1,0,0],[2,0,0],[3,0,0],[4,0,0]].map(v),controlPoints:[[0,0,0],[.19,0,0],[.21,0,0],[3,0,0],[4,0,0]].map(v),length:4,startRadius:.035,endRadius:.01,phase:.31,windPhase:.2,windStiffness:1,sections:[],children:[]});
const settings=normalizeSettings({leaf_density:0,adaptive_tessellation:false,junction_collar:false,surface_roughness:.06,groove_depth:0,radial_segments:12,twist:0,section_roll:0});
test('near-duplicate chains compare with the retained ring and keep the exact tip endpoint',()=>{assert.deepEqual(uniqueAxisTimes([0,.4,.40000005,.40000011,.40000016,.99999995,1]),[0,.4,.40000011,1]);});
function strips(g){const rows=g.userData.radiusRings,p=g.attributes.position;let min=Infinity;for(let k=1;k<rows.length;k++){const a=rows[k-1],b=rows[k],delta=v(b.center).sub(v(a.center));assert.ok(delta.length()>1e-9,'collapsed duplicate ring');assert.ok(b.t-a.t>1e-10,'duplicate parameter');for(let s=0;s<a.count;s++){const edge=new THREE.Vector3().fromBufferAttribute(p,b.offset+s).sub(new THREE.Vector3().fromBufferAttribute(p,a.offset+s));min=Math.min(min,edge.dot(delta)/delta.lengthSq());}}return min;}
test('repeated G/R and reprojected control cuts create one ring per position in every LOD, with finite positive inside strips',()=>{
 let b=base();for(const [t,degrees]of [[.0525,-55],[.054,20],[.051,15],[.055,-10],[.0535,12]]){b=evaluatePointSlide([b],{root:'ROOT',point:2,attach:t})[0];b=evaluatePointRotation([b],{root:'ROOT',point:2,sampling_version:2,rotation:new THREE.Quaternion().setFromAxisAngle(v([0,1,0]),degrees*Math.PI/180).toArray()})[0];}
 b.sections=[{t:axisTime(b.points,3)+1e-15,radius:1,oval:1,roll:0}];for(let lod=0;lod<4;lod++){const g=createTrunkFormPreviewGeometry(b,settings,null,lod);try{const minimum=strips(g);assert.ok(minimum>0,`LOD ${lod}: ${minimum}`);assert.ok([...g.attributes.position.array,...g.attributes.normal.array].every(Number.isFinite));}finally{g.dispose();}}
});
test('adding uneven samples to a straight axis never rephases surface roughness at retained rings',()=>{
 const b=base(),times=[0,.1,.3,.7,1];b.points=withAxisTimes(times.map(t=>v([4*t,0,0])),times,times);const dense=[0,.1,.100001,.2,.3,.30000000000001,.31,.7,1],c={...b,points:withAxisTimes(dense.map(t=>v([4*t,0,0])),dense,dense)};const a=createTrunkFormPreviewGeometry(b,settings,null),d=createTrunkFormPreviewGeometry(c,settings,null);try{assert.equal(d.userData.radiusRings.length,dense.length-1);for(const row of a.userData.radiusRings){const other=d.userData.radiusRings.find(r=>Math.abs(r.t-row.t)<1e-10);assert.ok(other);for(let s=0;s<row.count;s++){const p=new THREE.Vector3().fromBufferAttribute(a.attributes.position,row.offset+s),q=new THREE.Vector3().fromBufferAttribute(d.attributes.position,other.offset+s);assert.ok(p.distanceTo(q)<1e-8);}}assert.ok(strips(d)>.99);}finally{a.dispose();d.dispose();}
});
test('a straight surface is not changed by continuity relaxation',()=>{
 const b=base(),g=createTrunkFormPreviewGeometry(b,{...settings,surface_roughness:0},null);try{const before=g.attributes.position.array.slice();assert.equal(relaxSweepStrips(g.attributes.position.array,g.userData.radiusRings),false);assert.deepEqual(g.attributes.position.array,before);}finally{g.dispose();}
});
test('mesh length refinement follows physical nonuniform spans rather than the added-point index',()=>{
 const b=base();b.points=withAxisTimes([v([0,0,0]),v([.001,0,0]),v([4,0,0])],[0,.00025,1],[0,.00025,1]);const sample=createTrunkMeshSampling(b,createTrunkMeshPreset('COARSE'),[],[0,.00025,1]);assert.ok(sample.ts.includes(.00025));for(let i=1;i<sample.ts.length;i++)assert.ok((sample.ts[i]-sample.ts[i-1])*4<=.160001);assert.ok(sample.ts.length<120);
});
