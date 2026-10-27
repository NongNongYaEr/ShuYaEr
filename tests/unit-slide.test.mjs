import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createUnitSlide } from '../web/unit-slide.js';
import { unitFrame, resolveUnit } from '../web/unit-authoring.js';
const camera=new THREE.PerspectiveCamera(50,1,.01,100);camera.position.set(0,0,8);camera.lookAt(0,0,0);camera.updateMatrixWorld();
const modelRoot=new THREE.Group();modelRoot.updateMatrixWorld();
const bounds={left:0,top:0,width:800,height:800};
const branch={id:0,stableId:'R',points:[[0,0,0],[1,0,0],[1,2,0]].map(p=>new THREE.Vector3(...p))};
const record={id:'L',kind:'LEAF',parent:'R',t:.2,offset:[0,0,0],direction:[1,0,0],normal:[0,0,1],twist:0,scale:.12,base_scale:.12,source_id:'S',source:0,added:false};
const setup={camera,modelRoot,bounds},start={x:600,y:400};
test('G slides by arc distance over bends, preserving local pose, source and size; stops at both ends',()=>{
  const slide=createUnitSlide(branch,record,setup),result=slide({start,pointer:start,numeric:'.9'});
  assert.ok(Math.abs(result.record.t-.5)<1e-12);assert.deepEqual(result.record.offset,[0,0,0]);
  for(const key of ['direction','normal','source_id','scale','base_scale','parent'])assert.deepEqual(result.record[key],record[key]);
  const placement=resolveUnit(result.record,branch,[{id:'S'}]);
  assert.ok(placement.position.distanceTo(unitFrame(branch,.5).position)<1e-12);
  assert.ok(placement.direction.distanceTo(new THREE.Vector3(...record.direction).applyQuaternion(unitFrame(branch,.5).quaternion))<1e-12);
  assert.equal(slide({start,pointer:start,numeric:'100'}).record.t,1);
  assert.equal(slide({start,pointer:start,numeric:'-100'}).record.t,0);
  assert.equal(slide({start,pointer:start,numeric:''}).record,record);
});
test('mouse sliding follows projected curved carrier with arc-length conversion and no initial jump',()=>{
  const project=t=>{const v=unitFrame(branch,t).position.project(camera);return {x:(v.x+1)*400,y:(1-v.y)*400};};
  const from=project(record.t),to=project(.7),pointer={x:start.x+to.x-from.x,y:start.y+to.y-from.y};
  const slide=createUnitSlide(branch,record,setup),r=slide({start,pointer});
  assert.ok(Math.abs(r.record.t-.7)<1e-10);assert.deepEqual(r.record.offset,[0,0,0]);
  const oldFree={...record,offset:[.1,.2,.3]};
  assert.deepEqual(createUnitSlide(branch,oldFree,setup)({start,pointer}).record.offset,[0,0,0]);
  assert.equal(createUnitSlide(branch,oldFree,setup)({start,pointer:start}).record,oldFree);
});

test('leaf and organ reparent across carriers, protect installed units, and resist crossing jitter',()=>{
  const main={id:0,stableId:'MAIN',points:[[0,0,0],[0,3,0]].map(p=>new THREE.Vector3(...p))};
  const child={id:1,parentId:0,stableId:'CHILD',points:[[0,1,0],[2,1,0]].map(p=>new THREE.Vector3(...p))};
  const protectedUnit={id:2,stableId:'INSTALLED',unitOwner:'I',points:[[0,0,0],[0,3,0]].map(p=>new THREE.Vector3(...p))};
  const r={...record,parent:'CHILD',t:.7},origin=unitFrame(child,r.t).position;
  const project=p=>{const v=p.clone().project(camera);return {x:(v.x+1)*400,y:(1-v.y)*400};},a=project(origin);
  const at=p=>{const b=project(p);return {start,pointer:{x:start.x+b.x-a.x,y:start.y+b.y-a.y}};};
  for(const kind of ['LEAF','ORGAN']){
    const slide=createUnitSlide(child,{...r,kind},{...setup,branches:[child,protectedUnit,main]});
    const result=slide(at(unitFrame(main,.7).position));
    assert.equal(result.record.parent,'MAIN');assert.ok(Math.abs(result.record.t-.7)<1e-8);assert.deepEqual(result.record.offset,[0,0,0]);
    for(const key of ['source_id','scale','direction','normal'])assert.deepEqual(result.record[key],r[key]);
    const crossing=slide(at(new THREE.Vector3(.005,1,0)));assert.equal(crossing.record.parent,'MAIN');
    assert.equal(slide(at(unitFrame(child,.8).position)).record.parent,'CHILD');
    assert.equal(slide({start,pointer:start}).record.parent,'CHILD');
    assert.equal(slide({...at(unitFrame(main,.7).position),numeric:'.1'}).record.parent,'CHILD');
    assert.equal(slide({point:unitFrame(main,.8).position}).record.parent,'MAIN');
  }
});
