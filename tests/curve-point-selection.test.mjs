import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCurvePointSelection,planCurvePointDeletion,planCurvePointInsertion,curvePointBoxHits,projectedCurveHit} from '../web/curve-point-selection.js';
import {withAxisTimes} from '../web/branch-axis.js';
const v=p=>new THREE.Vector3(...p);
test('branch selection and an empty point selection remain distinct deletion scopes',()=>{
 const s=createCurvePointSelection();s.branch('A');assert.equal(s.sync('A',-1,9).scope,'BRANCH');s.select('A',[],null,9);assert.deepEqual(s.sync('A',-1,9),{owner:'A',scope:'POINTS',indices:[],primary:-1});s.branch('A');assert.equal(s.sync('A',-1,9).scope,'BRANCH');
});
test('clearing an active point or rebuilding topology never promotes an empty point selection to branch scope',()=>{
 const s=createCurvePointSelection();s.select('A',[2,3],3,9);assert.equal(s.sync('A',-1,7).scope,'POINTS');assert.deepEqual(s.sync('A',-1,7).indices,[]);s.branch('B');assert.equal(s.sync('B',-1,7).scope,'BRANCH');
});
test('point add, subtract and toggle preserve the real selected set and active point',()=>{
 const s=createCurvePointSelection();s.select('A',[2,3],3,9);assert.deepEqual(s.sync('A',3,9).indices,[2,3]);s.select('A',[5],5,9,'ADD');assert.deepEqual(s.sync('A',5,9).indices,[2,3,5]);s.select('A',[3],null,9,'SUBTRACT');assert.deepEqual(s.sync('A',5,9).indices,[2,5]);s.select('A',[2],2,9,'TOGGLE');assert.deepEqual(s.sync('A',5,9).indices,[5]);s.branch('B');assert.deepEqual(s.sync('B',-1,9).indices,[]);
});
test('batch deletion preserves endpoints and pins, remaps pins and does not mutate source controls',()=>{
 const p=Array.from({length:9},(_,i)=>v([i,0,0])),before=p.map(p=>p.toArray()),r=planCurvePointDeletion(p,[0,2,3,5,8],[5]);assert.deepEqual(r.removed,[2,3]);assert.deepEqual(r.pinned,[3]);assert.equal(r.retained,3);assert.deepEqual(r.points.map(p=>p.x),[0,1,4,5,6,7,8]);assert.deepEqual(p.map(p=>p.toArray()),before);
});
test('empty, protected and excessive point deletions are no-ops and never request branch deletion',()=>{
 const p=Array.from({length:6},(_,i)=>v([i,0,0]));for(const ids of [[],[0,5],[1,2,3,4]]){const r=planCurvePointDeletion(p,ids);assert.deepEqual(r.removed,[]);assert.ok(r.reason);}
});
test('marquee selection uses visible control centres in either drag direction and excludes tangent handles',()=>{
 const record=(i,x,y,category='control_point')=>({x,y,object:{userData:{point_index:i,category}}}),r=[record(1,10,20),record(2,30,40),record(3,50,10),record(4,20,30,'tangent_handle')];assert.deepEqual(curvePointBoxHits(r,{x:5,y:15},{x:35,y:45}),[1,2]);assert.deepEqual(curvePointBoxHits(r,{x:35,y:45},{x:5,y:15}),[1,2]);
});
test('curve hover respects CSS hit radius, nonuniform parameters and perspective depth',()=>{
 const points=withAxisTimes([v([0,0,0]),v([1,0,0]),v([3,0,0])],[0,.2,1]);const project=p=>({x:p.x*100,y:20,z:0,w:1}),h=projectedCurveHit(points,project,150,25);assert.ok(Math.abs(h.t-.4)<1e-10);assert.ok(h.point.distanceTo(v([1.5,0,0]))<1e-10);assert.equal(projectedCurveHit(points,project,150,31),null);
 const perspective=projectedCurveHit([v([0,0,0]),v([1,0,0])],p=>({x:p.x*100,y:0,z:0,w:p.x?2:1}),50,0);assert.ok(Math.abs(perspective.point.x-1/3)<1e-10);
});
test('curve insertion keeps existing controls, chooses the actual interval and shifts pinned indices',()=>{
 const p=Array.from({length:7},(_,i)=>v([i,0,0])),branch={points:p,controlPoints:p},r=planCurvePointInsertion(branch,{point:v([2.5,0,0]),t:2.5/6},[1,4]);assert.equal(r.index,3);assert.deepEqual(r.pinned,[1,5]);assert.deepEqual(r.points.map(p=>p.x),[0,1,2,2.5,3,4,5,6]);assert.ok(planCurvePointInsertion(branch,{point:p[2],t:2/6}).reason);
});
