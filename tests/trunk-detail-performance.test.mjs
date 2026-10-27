import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { normalizeTrunkDetails, createTrunkDetailSampler, TRUNK_DETAIL_TYPES } from '../web/trunk-details.js';
import { createDirectTrunkForm, createDirectTrunkFormSampler } from '../web/trunk-form.js';
import { createTrunkMeshPreset } from '../web/trunk-mesh-density.js';
import { createTrunkFormPreviewGeometry, normalizeSettings, DEFAULT_SETTINGS } from '../web/branch-kernel.js';
import { interpolateSectionRing } from '../web/trunk-section-interaction.js';
import { intersectTrunkSurface } from '../web/trunk-surface-picker.js';

const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=v=>Math.atan2(Math.sin(v),Math.cos(v));
// Frozen unaccelerated evaluator: a correctness oracle for support rejection,
// independently scanning every authored segment in its original order.
function reference(raw,t,angle){
 if(!Number.isFinite(t)||!Number.isFinite(angle))return 1;t=clamp(t,0,1);let delta=0;
 for(const d of normalizeTrunkDetails(raw).filter(d=>d.enabled&&d.strength>0)){
  const points=d.path.length?d.path:[{t:d.t,angle:d.angle,pressure:1}],halfT=d.height/2,halfA=d.width*Math.PI/360;
  let best=Infinity,result=null;
  for(let i=0;i<Math.max(1,points.length-1);i++){
   const a=points[i],b=points[Math.min(i+1,points.length-1)],base=a.angle*Math.PI/180;
   if(t<Math.min(a.t,b.t)-halfT||t>Math.max(a.t,b.t)+halfT)continue;
   const dt=(b.t-a.t)/halfT,da=wrap(b.angle*Math.PI/180-base)/halfA,denom=dt*dt+da*da;
   const x=(t-a.t)/halfT,y=wrap(angle-base)/halfA,u=denom?clamp((x*dt+y*da)/denom,0,1):0;
   const dx=x-dt*u,dy=y-da*u,distance=dx*dx+dy*dy;
   if(distance<best&&distance<1){best=distance;result={distance,x:dx,y:dy,pressure:a.pressure+(b.pressure-a.pressure)*u};}
  }
  if(!result)continue;const sample=result,q=Math.sqrt(sample.distance),u=clamp(1-sample.distance,0,1),envelope=u*u*(3-2*u),strength=d.strength*sample.pressure,phase=d.seed*.7548776662466927%TAU;
  switch(d.type){
   case 'GROOVE':delta+=strength*envelope*(-1+.18*Math.pow(Math.abs(sample.y),2));break;
   case 'RIDGE':delta+=strength*envelope;break;
   case 'KNOT':delta+=strength*envelope*(1+.12*Math.cos(q*Math.PI*4+phase)*q);break;
   case 'SCAR':delta+=strength*envelope*(-.7+1.6*Math.sin(q*Math.PI));break;
   case 'FLARE':delta+=strength*envelope*(1-.12*sample.x);break;
   case 'WRINKLE':delta+=strength*envelope*(.7*Math.sin((t-d.t)/d.height*TAU*5+phase)+.3*Math.sin(sample.y*Math.PI*3+phase*1.7));break;
  }
 }return clamp(1+delta,.12,4);
}
const settings=normalizeSettings({...DEFAULT_SETTINGS,leaf_density:0,junction_collar:false,surface_roughness:0,twist:18,section_roll:9});
const branch=()=>({id:0,stableId:'ROOT',parentId:-1,order:0,length:10,startRadius:.5,endRadius:.25,points:[[0,0,0],[.5,.1,3],[.8,-.3,7],[1,.1,10]].map(p=>new THREE.Vector3(...p)),sections:[],phase:.2,windPhase:.4,windStiffness:1,children:[]});
const denseForm=()=>{const form=createDirectTrunkForm();form.mesh=createTrunkMeshPreset('FINE');form.details=Array.from({length:8},(_,i)=>({id:'D'+i,type:TRUNK_DETAIL_TYPES[i%6],strength:.2,width:1.5,height:.002,t:.2+i*.05,angle:i*45,path:[{t:.2+i*.05,angle:i*45,pressure:.8},{t:.25+i*.05,angle:i*45+12,pressure:.6}]}));return form;};

test('angular acceleration exactly retains the unaccelerated field at seams, bin edges and pressure overlaps',()=>{
 const details=TRUNK_DETAIL_TYPES.map((type,i)=>({id:'D'+i,type,strength:.4,width:[1,2.5,8,40,100,180][i],height:[.001,.003,.02,.2,.6,1][i],t:.5,angle:355,seed:i+5,path:[{t:.48,angle:350,pressure:.2},{t:.5,angle:10,pressure:1},{t:.52,angle:190,pressure:.7},{t:.46,angle:340,pressure:.4}]}));
 const sample=createTrunkDetailSampler(details);
 for(const t of [0,.46,.4795,.48,.4995,.5,.5005,.52,.6,1])for(let bin=0;bin<=128;bin++)for(const delta of [-1e-12,0,1e-12]){
  const angle=bin/128*TAU+delta;assert.equal(sample(t,angle),reference(details,t,angle));assert.equal(sample(t,angle-TAU*2),reference(details,t,angle-TAU*2));
 }
 for(const angle of [-1e20,1e20,NaN])assert.equal(sample(.5,angle),reference(details,.5,angle));
});

test('ring-bound direct sampler agrees exactly with full queries without mutating authored keys',()=>{
 const form=createDirectTrunkForm();form.sections=[{id:'A',t:.2,radius:1.7,oval:1.2,roll:175,span:.2},{id:'B',t:.8,radius:.6,oval:.7,roll:-170,span:.2}];
 const before=JSON.stringify(form),sampler=createDirectTrunkFormSampler(form);
 for(const t of [0,.1,.2,.4,.8,.9,1]){const ring=sampler.at(t);assert.deepEqual(ring.section,sampler.sectionAt(t));for(let a=-6;a<7;a+=.05)assert.equal(ring.radialAt(a),sampler.radialAt(t,a));}
 assert.equal(JSON.stringify(form),before);
});

test('lazy ring points reproduce dense outlines including endpoints, roll and nonuniform sample angles',()=>{
 const g=createTrunkFormPreviewGeometry(branch(),settings,denseForm()),rings=g.userData.radiusRings,positions=g.attributes.position;
 for(const t of [0,.2,.22345,.48,.77,1]){
  const full=interpolateSectionRing(rings,t,positions),lazy=interpolateSectionRing(rings,t,positions,{points:false});assert.equal(lazy.points,undefined);
  for(const key of ['center','tangent','x','y','rolledX','rolledY','angleOffset'])assert.deepEqual(lazy[key],full[key]);
  for(let i=0;i<full.count;i+=13)assert.deepEqual(lazy.pointAt(i).toArray(),full.points[i].toArray());assert.equal(lazy.pointAt(-1),null);assert.equal(lazy.pointAt(full.count),null);
 }g.dispose();
});

test('interactive density is bounded and never changes the saved recipe or final mesh precision',()=>{
 const b=branch(),form=denseForm(),before=JSON.stringify(form),full=createTrunkFormPreviewGeometry(b,settings,form),preview=createTrunkFormPreviewGeometry(b,settings,form,0,{vertexLimit:48000});
 assert.ok(preview.attributes.position.count<=48000);assert.ok(full.attributes.position.count>48000);assert.equal(preview.userData.trunkMeshSampling.interactive_preview,true);assert.equal(full.userData.trunkMeshSampling.interactive_preview,undefined);assert.equal(JSON.stringify(form),before);
 const cold=createTrunkFormPreviewGeometry(b,settings,JSON.parse(before));for(const key of ['position','normal','uv','color'])assert.deepEqual(cold.attributes[key].array,full.attributes[key].array);assert.deepEqual(cold.index.array,full.index.array);
 full.dispose();preview.dispose();cold.dispose();
});

test('band hierarchy picks the identical real triangle under world transforms, front/back sides and caps',()=>{
 const geometry=createTrunkFormPreviewGeometry(branch(),settings,denseForm()),material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(geometry,material);
 mesh.position.set(2,-1,3);mesh.rotation.set(.2,-.3,.1);mesh.scale.set(1.3,.7,1.1);mesh.updateMatrixWorld(true);
 const ray=new THREE.Raycaster();let hits=0;const before=JSON.stringify(geometry.drawRange);
 for(const side of [THREE.FrontSide,THREE.DoubleSide,THREE.BackSide]){material.side=side;
  for(let j=0;j<32;j++){
   const t=(j%16)/15,center=new THREE.Vector3(0,0,t*10).applyMatrix4(mesh.matrixWorld),a=j*1.345,origin=center.clone().add(new THREE.Vector3(Math.cos(a)*7,Math.sin(a)*7,j>15?13:-3));
   ray.set(origin,center.clone().sub(origin).normalize());const native=ray.intersectObject(mesh,false)[0]||null,fast=intersectTrunkSurface(mesh,ray);
   assert.equal(Boolean(fast),Boolean(native));if(native){hits++;assert.equal(fast.faceIndex,native.faceIndex);assert.equal(fast.distance,native.distance);assert.deepEqual(fast.point.toArray(),native.point.toArray());assert.equal(fast.object,mesh);}assert.equal(JSON.stringify(geometry.drawRange),before);
  }
 }
 assert.ok(hits>30);geometry.attributes.position.needsUpdate=true;ray.set(new THREE.Vector3(8,0,4),new THREE.Vector3(-1,0,0));assert.equal(intersectTrunkSurface(mesh,ray)?.faceIndex,ray.intersectObject(mesh,false)[0]?.faceIndex);
 geometry.dispose();material.dispose();
});

test('surface picking falls back for unsupported geometry and preserves clipping even when native raycast throws',()=>{
 const geometry=createTrunkFormPreviewGeometry(branch(),settings,denseForm()),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide})),ray=new THREE.Raycaster(new THREE.Vector3(4,0,4),new THREE.Vector3(-1,0,0));mesh.updateMatrixWorld(true);
 geometry.setDrawRange(0,24);assert.equal(intersectTrunkSurface(mesh,ray)?.faceIndex,ray.intersectObject(mesh,false)[0]?.faceIndex);assert.equal(geometry.drawRange.count,24);geometry.setDrawRange(0,Infinity);
 const original=mesh.raycast;mesh.raycast=()=>{throw Error('test material failure');};assert.throws(()=>intersectTrunkSurface(mesh,ray),/test material/);assert.deepEqual(geometry.drawRange,{start:0,count:Infinity});mesh.raycast=original;
 geometry.dispose();mesh.material.dispose();
});
