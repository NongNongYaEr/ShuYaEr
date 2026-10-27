import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {trunkSectionContext,trunkSectionOutline,createTrunkSectionReferenceCache} from '../web/trunk-section-reference.js';

const keys=[{id:'TIP',t:.8},{id:'CURRENT',t:.4},{id:'ROOT',t:.1}];
test('section navigation sorts without changing authored arrays and stops at both boundaries',()=>{
  const before=JSON.stringify(keys),middle=trunkSectionContext(keys,'CURRENT');
  assert.deepEqual(middle.items.map(s=>s.id),['ROOT','CURRENT','TIP']);
  assert.equal(middle.previous.id,'ROOT');assert.equal(middle.next.id,'TIP');
  assert.equal(trunkSectionContext(keys,'ROOT').previous,null);assert.equal(trunkSectionContext(keys,'TIP').next,null);
  assert.equal(JSON.stringify(keys),before);
});
test('coincident identities remain navigable but comparison uses the final effective key at each neighbouring position',()=>{
  const sections=[{id:'A',t:.1},{id:'A_LAST',t:.1},{id:'B',t:.4},{id:'B_LAST',t:.4},{id:'C',t:.8},{id:'C_LAST',t:.8}];
  const context=trunkSectionContext(sections,'B');
  assert.equal(context.next.id,'B_LAST');assert.equal(context.coincident,2);
  assert.equal(context.root.id,'A_LAST');assert.equal(context.tip.id,'C_LAST');
  assert.equal(trunkSectionContext(sections,'B_LAST').previous.id,'B');
});
test('missing identities and invalid entries do not turn a view into an implicit all-section range',()=>{
  const context=trunkSectionContext([null,{id:'BAD',t:NaN},...keys],'MISSING');
  assert.equal(context.previous,null);assert.equal(context.root,null);assert.equal(context.tip,null);assert.equal(context.coincident,0);
  assert.equal(context.next.id,'ROOT');assert.deepEqual(trunkSectionContext(null,'').items,[]);
});
test('near-coincident positions use the same tolerance as direct shape keys',()=>{
  const sections=[{id:'A',t:.2},{id:'B',t:.2+5e-11},{id:'C',t:.6},{id:'C_LAST',t:.6+5e-11}];
  const context=trunkSectionContext(sections,'B');assert.equal(context.coincident,2);assert.equal(context.root,null);assert.equal(context.tip.id,'C_LAST');assert.equal(context.previous.id,'A');
});
const ring={center:[3,5,7],x:[0,1,0],y:[0,0,1]};
const points=[new THREE.Vector3(3,7,7),new THREE.Vector3(3,5,8),new THREE.Vector3(3,3,7)];
test('bent rings flatten in their own frame while retaining physical size and leaving inputs untouched',()=>{
  const before=JSON.stringify({ring,points});
  assert.deepEqual(trunkSectionOutline(ring,points),[{x:2,y:0},{x:0,y:1},{x:-2,y:0}]);
  assert.equal(JSON.stringify({ring,points}),before);
});
test('unrolled axes preserve a rolled surface rather than cancelling its twist',()=>{
  const r={center:[0,0,0],x:[1,0,0],y:[0,1,0],rolledX:[0,1,0],rolledY:[-1,0,0]};
  assert.deepEqual(trunkSectionOutline(r,[[0,2,0],[-1,0,0],[0,-2,0]]),[{x:0,y:2},{x:-1,y:0},{x:0,y:-2}]);
});
test('a common rigid transform changes neither ring dimensions nor comparison coordinates',()=>{
  const matrix=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(.9,1.2,-.4)).setPosition(10,-6,2);
  const transformed={center:new THREE.Vector3(...ring.center).applyMatrix4(matrix),x:new THREE.Vector3(...ring.x).transformDirection(matrix),y:new THREE.Vector3(...ring.y).transformDirection(matrix)};
  const result=trunkSectionOutline(transformed,points.map(p=>p.clone().applyMatrix4(matrix)));
  const expected=trunkSectionOutline(ring,points);
  result.forEach((p,i)=>{assert.ok(Math.abs(p.x-expected[i].x)<1e-12);assert.ok(Math.abs(p.y-expected[i].y)<1e-12);});
});
test('invalid frames and nonfinite geometry omit a reference instead of drawing misleading coordinates',()=>{
  for(const r of [null,{...ring,x:[0,0,0]},{...ring,y:ring.x},{...ring,center:[NaN,0,0]}])assert.equal(trunkSectionOutline(r,points),null);
  assert.equal(trunkSectionOutline(ring,[[0,0,0],[NaN,0,0],[1,1,1]]),null);
  assert.equal(trunkSectionOutline(ring,[]),null);
});
function fixture(){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,1,1,2,2,2],3));geometry.userData.radiusRings=[];
  let reads=0;const read=createTrunkSectionReferenceCache(),ringAt=()=>{reads++;return ring;},ringData=()=>points;
  const references=[{side:'ROOT',section:keys[2]},{side:'TIP',section:keys[0]}];
  return {geometry,read,ringAt,ringData,references,reads:()=>reads};
}
test('hover and view redraws reuse exactly two read-only outlines',()=>{
  const f=fixture(),first=f.read(f.geometry,f.references,f.ringAt,f.ringData);
  for(let i=0;i<100;i++){const result=f.read(f.geometry,f.references,f.ringAt,f.ringData);assert.equal(result[0].outline,first[0].outline);}
  assert.equal(f.reads(),2);assert.deepEqual(first.map(r=>[r.side,r.id,r.t]),[['ROOT','ROOT',.1],['TIP','TIP',.8]]);
});
test('changed positions, replaced arrays and rebuilt geometries invalidate stale reference outlines',()=>{
  const f=fixture(),run=()=>f.read(f.geometry,f.references,f.ringAt,f.ringData);
  run();f.geometry.attributes.position.needsUpdate=true;run();assert.equal(f.reads(),4);
  f.geometry.userData.radiusRings=[];run();assert.equal(f.reads(),6);
  f.geometry.setAttribute('position',f.geometry.attributes.position.clone());run();assert.equal(f.reads(),8);
  f.read(f.geometry.clone(),f.references,f.ringAt,f.ringData);assert.equal(f.reads(),10);
});
test('switching sections evicts old references rather than retaining a growing whole-branch cache',()=>{
  const f=fixture();f.read(f.geometry,f.references,f.ringAt,f.ringData);
  f.read(f.geometry,[{side:'ROOT',section:{id:'NEW',t:.3}}],f.ringAt,f.ringData);assert.equal(f.reads(),3);
  f.read(f.geometry,f.references,f.ringAt,f.ringData);assert.equal(f.reads(),5);
  assert.deepEqual(f.read(null,f.references,f.ringAt,f.ringData),[]);
  assert.deepEqual(f.read(f.geometry,[{side:'ROOT',section:null}],f.ringAt,f.ringData),[]);
});
