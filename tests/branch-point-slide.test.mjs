import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {evaluatePointRotation,pointRotationPlan} from '../web/branch-point-rotation.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {buildBranchAsset,disposeBranchAsset,branchInstanceFrame,DEFAULT_SETTINGS} from '../web/branch-kernel.js';
import {completeInstanceMatrix} from '../web/branch-instance-matrix.js';
const v=p=>new THREE.Vector3(...p), near=(a,b)=>assert.ok(a.distanceTo(b)<1e-8);
const branch=(id,parentId,points,extra={})=>({id,stableId:'B'+id,parentId,parentT:.8,points:points.map(v),controlPoints:points.map(v),length:3,startRadius:.03,endRadius:.01,...extra});
const fixture=()=>[branch(0,-1,[[0,0,0],[0,0,1],[0,0,2]]),branch(1,0,[[0,0,1],[1,0,1.3],[2,.2,1.5],[3,.5,1.7],[4,.9,1.8],[5,1,2]]),branch(2,1,[[1,0,1.3],[1,.5,2]],{parentT:.2}),branch(3,1,[[4,.9,1.8],[4,1.6,2.1]],{unitOwner:'U',instanceId:'U'}),branch(4,3,[[4,1.3,2],[4.5,1.6,2.1]],{unitOwner:'U',instanceId:'U'})];

import {evaluatePointSlide,pointSlideRange} from '../web/branch-point-slide.js';
import {sampleLine} from '../web/tree-sculpt.js';
import {slideMountParameter,mountDistanceAt} from '../web/branch-mount-drag.js';

const op={type:'POINT_SLIDE',root:'B1',targets:['B1'],point:2,attach:.5};
test('point slide changes only the selected handle and leaves geometry, units and other handles untouched',()=>{
 const bs=fixture(),saved=JSON.stringify(bs),a=evaluatePointSlide(bs,op);
 for(let n=0;n<bs.length;n++){
  assert.equal(a[n].points,bs[n].points);
  assert.equal(a[n].startRadius,bs[n].startRadius);assert.equal(a[n].parentT,bs[n].parentT);
  for(let i=0;i<bs[n].controlPoints.length;i++)near(a[n].controlPoints[i],n===1&&i===2 ? sampleLine(bs[1].points,.5) : bs[n].controlPoints[i]);
 }
 assert.equal(JSON.stringify(bs),saved);
});
test('arc distances follow bends, clamp between neighbors, and protect endpoints and fixed handles',()=>{
 const bs=fixture(),b=bs[1],range=pointSlideRange(b,2);
 const t=slideMountParameter(b.points,range.start,.2);assert.ok(Math.abs(mountDistanceAt(b.points,t)-mountDistanceAt(b.points,range.start)-.2)<1e-9);
 for(const [attach,want] of [[1,range.max],[0,range.min]])near(evaluatePointSlide(bs,{...op,attach})[1].controlPoints[2],sampleLine(b.points,want));
 for(const point of [0,5])assert.deepEqual(evaluatePointSlide(bs,{...op,point}),bs);
 assert.deepEqual(evaluatePointSlide(bs,op,1,{B1:{pinned_points:[2]}}),bs);
 assert.notDeepEqual(evaluatePointSlide(bs,op,1,{B1:{pinned_points:[4]},B3:{pinned_points:[1]}}),bs);
 assert.deepEqual(evaluatePointSlide(bs,op,0),bs);
});
test('rebuild and saved slide retain every rendered vertex; later point rotation uses the moved handle',()=>{
 const a=normalizeAuthoring({branch_shape:{branches:fixture().filter(b=>!b.unitOwner).map(b=>({id:b.stableId,parent:b.parentId<0?'':'B'+b.parentId,attach:b.parentT,points:b.points.map(p=>p.toArray()),knots:b.controlPoints.map(p=>p.toArray()),length:3,start_radius:.03,end_radius:.01}))}});
 const settings={leaf_density:8,child_count:0,branch_levels:4,wind_strength:0},before=buildBranchAsset(settings,null,null,0,a);
 const meshData=asset=>{const data=[];asset.group.traverse(m=>{if(m.isMesh)data.push(Object.fromEntries(Object.entries(m.geometry.attributes).map(([k,v])=>[k,Array.from(v.array)])));});return data;};
 a.sculpt_layers=[{id:'G',name:'slide',enabled:true,strength:1,operation:op,branches:{}}];
 const loaded=normalizeAuthoring(JSON.parse(JSON.stringify(a))),after=buildBranchAsset(settings,null,null,0,loaded);
 assert.deepEqual(meshData(after),meshData(before));
 const expected=evaluatePointSlide(before.masterBranches,op);for(let n=0;n<expected.length;n++)expected[n].controlPoints.forEach((p,i)=>near(after.masterBranches[n].controlPoints[i],p));
 const rotation={type:'POINT_ROTATE',root:'B1',targets:['B1'],point:2,rotation:new THREE.Quaternion().setFromAxisAngle(v([0,1,0]),.6).toArray()};
 const rotated=evaluatePointRotation(after.masterBranches,rotation);loaded.sculpt_layers.push({id:'R',name:'rotate',enabled:true,strength:1,operation:rotation,branches:{}});
 const final=buildBranchAsset(settings,null,null,0,normalizeAuthoring(JSON.parse(JSON.stringify(loaded))));
 for(let n=0;n<rotated.length;n++)rotated[n].points.forEach((p,i)=>near(final.masterBranches[n].points[i],p));
 disposeBranchAsset(before);disposeBranchAsset(after);disposeBranchAsset(final);
});
