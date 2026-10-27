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

import {evaluatePointScale} from '../web/branch-point-scale.js';
import {sampleLine,lineTangent,nearestParameter} from '../web/tree-sculpt.js';

const op={type:'POINT_SCALE',root:'B1',targets:['B1'],point:2,scale:[.5,.5,.5]};
test('point scale fixes prefix and attached prefix children, scales only distal skeleton and redistributes handles',()=>{
 const bs=fixture(),a=evaluatePointScale(bs,op),origin=bs[1].points[2];
 assert.equal(a[0],bs[0]);assert.equal(a[2],bs[2]);
 for(let i=0;i<=2;i++){near(a[1].points[i],bs[1].points[i]);near(a[1].controlPoints[i],bs[1].controlPoints[i]);}
 for(let i=3;i<bs[1].points.length;i++)near(a[1].points[i],bs[1].points[i].clone().sub(origin).multiplyScalar(.5).add(origin));
 assert.equal(a[1].controlPoints.length,bs[1].controlPoints.length);
 const points=a[1].points,arc=t=>{const cursor=t*(points.length-1);let sum=0;for(let i=0;i<points.length-1;i++)sum+=points[i+1].distanceTo(points[i])*Math.max(0,Math.min(1,cursor-i));return sum;};
 const distances=a[1].controlPoints.slice(2).map(p=>{near(p,sampleLine(points,nearestParameter(points,p)));return arc(nearestParameter(points,p));});
 for(let i=2;i<distances.length;i++)assert.ok(Math.abs((distances[i]-distances[i-1])-(distances[1]-distances[0]))<1e-8);
 const old=[...bs[3].points,...bs[4].points],now=[...a[3].points,...a[4].points];for(let i=0;i<old.length;i++)for(let j=0;j<old.length;j++)assert.ok(Math.abs(old[i].distanceTo(old[j])-now[i].distanceTo(now[j]))<1e-8);
 for(let i=0;i<bs.length;i++){assert.equal(a[i].startRadius,bs[i].startRadius);assert.equal(a[i].endRadius,bs[i].endRadius);}
});
test('distal support children scale, complete units do not, even under axis scale',()=>{
 const bs=fixture();bs.push(branch(5,1,[[4,.9,1.8],[4,2,2.3],[4.4,2.4,3.3]]));
 const a=evaluatePointScale(bs,{...op,scale:[1.6,.7,1.2]}),origin=bs[1].points[2];
 bs[5].points.forEach((p,i)=>near(a[5].points[i],p.clone().sub(origin).multiply(v([1.6,.7,1.2])).add(origin)));
 for(const i of [3,4])bs[i].points.forEach((p,k)=>near(a[i].points[k],p.clone().applyMatrix4(a[i].mountMatrix)));
});
test('point scale honors pins, endpoints, zero change and source immutability',()=>{
 const bs=fixture(),saved=JSON.stringify(bs);
 assert.notDeepEqual(evaluatePointScale(bs,op,1,{B1:{pinned_points:[0,2]},B2:{pinned_points:[1]}}),bs);
 for(const o of [{B1:{pinned_points:[3]}},{B3:{pinned_points:[0]}}])assert.deepEqual(evaluatePointScale(bs,op,1,o),bs);
 for(const point of [0,5])assert.deepEqual(evaluatePointScale(bs,{...op,point}),bs);
 assert.deepEqual(evaluatePointScale(bs,op,0),bs);assert.equal(JSON.stringify(bs),saved);
});
test('scaled bent carrier and compiled instance use the same rigid motion, preserving prior roll',()=>{
 const raw=fixture(),rotation={type:'POINT_ROTATE',root:'B1',point:1,rotation:new THREE.Quaternion().setFromAxisAngle(v([1,0,0]),.7).toArray()},bs=evaluatePointRotation(raw,rotation),after=evaluatePointScale(bs,{...op,scale:[.7,1.3,.6]});
 for(const attach of [.1,.75,.94]){
  const instance={attach,angle:45,azimuth:25,scale:1,variation:0,seed:10,roll:40},shape={connector:{position:[0,0,0],direction:[0,0,1]}},settings={...DEFAULT_SETTINGS,gravity:0};
  const old=completeInstanceMatrix(instance,shape,bs[1],settings,branchInstanceFrame),now=completeInstanceMatrix(instance,shape,after[1],settings,branchInstanceFrame);
  const from=sampleLine(bs[1].points,attach),to=sampleLine(after[1].points,attach),q=new THREE.Quaternion().setFromUnitVectors(lineTangent(bs[1].points,attach),lineTangent(after[1].points,attach));
  const expected=new THREE.Matrix4().makeTranslation(...to.toArray()).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(...from.negate().toArray())).multiply(old);
  now.elements.forEach((x,k)=>assert.ok(Math.abs(x-expected.elements[k])<1e-8,`${attach}/${k}`));
 }
});
test('saved point scale rebuilds geometry and recalculated control points deterministically',()=>{
 const a=normalizeAuthoring({branch_shape:{branches:fixture().filter(b=>!b.unitOwner).map(b=>({id:b.stableId,parent:b.parentId<0?'':'B'+b.parentId,attach:b.parentT,points:b.points.map(p=>p.toArray()),knots:b.controlPoints.map(p=>p.toArray()),length:3,start_radius:.03,end_radius:.01}))}});
 const settings={leaf_density:0,child_count:0,branch_levels:4,wind_strength:0},before=buildBranchAsset(settings,null,null,0,a),expected=evaluatePointScale(before.masterBranches,op);
 a.sculpt_layers=[{id:'S',name:'scale',enabled:true,strength:1,operation:op,branches:{}}];
 const loaded=normalizeAuthoring(JSON.parse(JSON.stringify(a))),after=buildBranchAsset(settings,null,null,0,loaded);
 for(let b=0;b<expected.length;b++)for(const key of ['points','controlPoints'])expected[b][key].forEach((p,i)=>near(after.masterBranches[b][key][i],p));
 disposeBranchAsset(before);disposeBranchAsset(after);
});
