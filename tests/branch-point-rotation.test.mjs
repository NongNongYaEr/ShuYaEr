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
const op=()=>({type:'POINT_ROTATE',root:'B1',targets:['B1'],point:2,rotation:new THREE.Quaternion().setFromAxisAngle(v([0,1,0]),-.9).toArray()});
test('point rotation fixes prefix, preserves every dense segment and rigid descendants with roll',()=>{
 const bs=fixture(),operation=op(),a=evaluatePointRotation(bs,operation),plan=pointRotationPlan(bs[1],2,operation.rotation);
 assert.equal(a[0],bs[0]);assert.equal(a[2],bs[2]);
 for(let i=0;i<=2;i++){near(a[1].points[i],bs[1].points[i]);near(a[1].controlPoints[i],bs[1].controlPoints[i]);}
 assert.ok(a[1].points.at(-1).distanceTo(bs[1].points.at(-1))>1);
 for(let b=0;b<bs.length;b++)for(let i=1;i<bs[b].points.length;i++)assert.ok(Math.abs(a[b].points[i].distanceTo(a[b].points[i-1])-bs[b].points[i].distanceTo(bs[b].points[i-1]))<1e-10);
 for(const id of [3,4])for(let i=0;i<bs[id].points.length;i++)near(a[id].points[i],bs[id].points[i].clone().applyMatrix4(plan.at(.8)));
 const loaded=normalizeAuthoring({sculpt_layers:[{id:'P',enabled:true,strength:1,operation,branches:{}}]});loaded.sculpt_layers[0].operation.rotation.forEach((x,i)=>assert.ok(Math.abs(x-operation.rotation[i])<1e-12));
});
test('pivot pins allowed; moving pins, endpoint and direct unit edits protected',()=>{
 const bs=fixture(),operation=op();
 assert.notDeepEqual(evaluatePointRotation(bs,operation,1,{B1:{pinned_points:[0,2]},B2:{pinned_points:[1]}}),bs);
 for(const overrides of [{B1:{pinned_points:[3]}},{B3:{pinned_points:[0]}}])assert.deepEqual(evaluatePointRotation(bs,operation,1,overrides),bs);
 for(const point of [0,5])assert.deepEqual(evaluatePointRotation(bs,{...operation,point}),bs);
 assert.deepEqual(evaluatePointRotation(bs,{...operation,root:'B3',point:1}),bs);
 assert.deepEqual(evaluatePointRotation(bs,operation,0),bs);
});
test('compiled instance attachment uses the full local quaternion including axial roll',()=>{
 const bs=fixture(),operation=op(),after=evaluatePointRotation(bs,operation),shape={connector:{position:[0,0,0],direction:[0,0,1]}},settings={...DEFAULT_SETTINGS,gravity:0};
 for(const attach of [.1,.48,.82,.98]){
   const i={attach,angle:45,azimuth:25,scale:1,variation:0,seed:10,roll:40};
   const old=completeInstanceMatrix(i,shape,bs[1],settings,branchInstanceFrame),now=completeInstanceMatrix(i,shape,after[1],settings,branchInstanceFrame);
   const expected=pointRotationPlan(bs[1],2,operation.rotation).at(attach).clone().multiply(old);
   now.elements.forEach((x,k)=>assert.ok(Math.abs(x-expected.elements[k])<1e-8,`${attach}/${k}`));
 }
});
test('retained point rotation survives real normalized rebuild without modifying source geometry',()=>{
 const input=normalizeAuthoring({branch_shape:{branches:fixture().filter(b=>!b.unitOwner).map(b=>({id:b.stableId,parent:b.parentId<0?'':'B'+b.parentId,attach:b.parentT,points:b.points.map(p=>p.toArray()),knots:b.controlPoints.map(p=>p.toArray()),length:b.length,start_radius:.03,end_radius:.01}))}});
 const settings={leaf_density:0,child_count:0,branch_levels:4,wind_strength:0},before=buildBranchAsset(settings,null,null,0,input),operation=op();
 const expected=evaluatePointRotation(before.masterBranches,operation);
 input.sculpt_layers=[{id:'P',name:'point',enabled:true,strength:1,operation,branches:{}}];
 const loaded=normalizeAuthoring(JSON.parse(JSON.stringify(input))),after=buildBranchAsset(settings,null,null,0,loaded);
 for(let b=0;b<expected.length;b++)expected[b].points.forEach((p,i)=>near(after.masterBranches[b].points[i],p));
 disposeBranchAsset(before);disposeBranchAsset(after);
});
