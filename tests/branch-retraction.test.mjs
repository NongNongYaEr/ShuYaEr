import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { retractAlongPath } from '../web/branch-retraction.js';
import { createSculptSnapshot, deformTree, nearestParameter, sampleLine } from '../web/tree-sculpt.js';
const line = a => a.map(p => new THREE.Vector3(...p));
const length = pts => pts.slice(1).reduce((n,p,i)=>n+p.distanceTo(pts[i]),0);
test('retraction preserves the actual curved prefix and root, not a scaled curve or chord',()=>{
 const pts=line([[0,0,0],[1,0,0],[1,1,0],[2,1,0]]),r=retractAlongPath(pts,4,.5);
 assert.deepEqual(r.points.map(p=>p.toArray()),[[0,0,0],[1,0,0],[1,.5,0]]);
 assert.equal(length(r.points),1.5);assert.equal(r.controlPoints.length,4);
 for(const p of r.controlPoints)assert.ok(p.distanceTo(sampleLine(pts,nearestParameter(pts,p)))<1e-10);
 assert.equal(retractAlongPath(pts,4,1),null);
 const tiny=line([[0,0,0],[.01,0,0]]);assert.equal(retractAlongPath(tiny,4,.1),null);
 assert.ok(length(retractAlongPath(pts,4,-10).points)>=.3-1e-10);
 assert.ok(pts[3].equals(new THREE.Vector3(2,1,0)));
});
const branch=(id,parentId,points,extra={})=>({id,stableId:'B'+id,parentId,parentT:.5,controlPoints:points,points,startRadius:.1,endRadius:.01,...extra});
test('retracting a parent keeps child geometry rigid, unrelated branches unchanged, and IDs/radii intact',()=>{
 const bs=[branch(0,-1,line([[0,0,0],[1,0,0],[1,1,0],[2,1,0]])),branch(1,0,line([[1,.5,0],[1,.5,1],[1,1,2],[2,1,3]]),{instanceId:'UNIT'}),branch(2,-1,line([[0,5,0],[1,5,0],[1,6,0],[2,6,0]]))];
 const s=createSculptSnapshot(bs),w=new Map([[0,[0,1,1,1]]]),opts={strength:1,retractAmount:.5,preserveLength:1};
 const a=deformTree(s,w,new THREE.Vector3(),'RETRACT',opts);
 assert.equal(length(a.get(0).points),1.5);assert.equal(a.size,s.size);assert.equal(a.get(2),s.get(2));
 for(let i=0;i<4;i++)for(let j=0;j<4;j++)assert.ok(Math.abs(a.get(1).points[i].distanceTo(a.get(1).points[j])-s.get(1).points[i].distanceTo(s.get(1).points[j]))<1e-10);
 assert.ok(a.get(1).points[0].distanceTo(sampleLine(a.get(0).points,.5))<1e-10);
 for(const b of a.values()){assert.equal(b.stableId,s.get(b.id).stableId);assert.equal(b.startRadius,s.get(b.id).startRadius);assert.equal(b.endRadius,s.get(b.id).endRadius);}
 assert.deepEqual(deformTree(s,w,new THREE.Vector3(),'RETRACT',opts),a);
 assert.deepEqual(deformTree(s,w,new THREE.Vector3(),'RETRACT',{...opts,retractAmount:0}),s);
});
test('pinned or masked branches and ancestors of pinned children are protected',()=>{
 const bs=[branch(0,-1,line([[0,0,0],[1,0,0],[1,1,0],[2,1,0]])),branch(1,0,line([[1,.5,0],[1,.5,1],[1,1,2],[2,1,3]]))];
 for(const overrides of [{B0:{pinned_points:[2]}},{B0:{sculpt_mask:[0,0,1,0]}},{B1:{pinned_points:[2]}}]){
  const s=createSculptSnapshot(bs,overrides),a=deformTree(s,new Map([[0,[0,1,1,1]]]),new THREE.Vector3(),'RETRACT',{strength:1,retractAmount:.8});
  assert.deepEqual(a,s);
 }
});
