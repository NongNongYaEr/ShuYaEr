import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {evaluateRootScale} from '../web/branch-root-scale.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {buildBranchAsset,disposeBranchAsset} from '../web/branch-kernel.js';
const v=p=>new THREE.Vector3(...p), near=(a,b)=>assert.ok(a.distanceTo(b)<1e-8);
const branch=(id,parentId,points,extra={})=>({id,stableId:'B'+id,parentId,parentT:.5,points:points.map(v),controlPoints:points.map(v),startRadius:.03,endRadius:.01,...extra});
const fixture=()=>[branch(0,-1,[[0,0,0],[0,0,2]]),branch(1,0,[[0,0,1],[1,0,2],[2,1,3]]),branch(2,1,[[1,0,2],[1.5,1,3]]),branch(3,1,[[1,0,2],[2,1,2],[2.2,1.4,3]],{unitOwner:'U',instanceId:'U'}),branch(4,3,[[2,1,2],[2.5,.5,2.8]],{unitOwner:'U',instanceId:'U'}),branch(5,0,[[0,0,1],[-1,0,2]])];
test('root scale affects support subtree once, carries entire installed unit rigidly even under axis scaling',()=>{
 const bs=fixture(),op={targets:['B1','B2'],scale:[1.8,.6,1.2]},a=evaluateRootScale(bs,op);
 for(const id of [1,2])bs[id].points.forEach((p,i)=>near(a[id].points[i],p.clone().sub(bs[1].points[0]).multiply(v(op.scale)).add(bs[1].points[0])));
 near(a[1].points[0],bs[1].points[0]);assert.equal(a[0],bs[0]);assert.equal(a[5],bs[5]);
 const old=[...bs[3].points,...bs[4].points],updated=[...a[3].points,...a[4].points];
 for(let i=0;i<old.length;i++)for(let j=0;j<old.length;j++)assert.ok(Math.abs(old[i].distanceTo(old[j])-updated[i].distanceTo(updated[j]))<1e-8);
 for(const id of [3,4]) {assert.equal(a[id].startRadius,bs[id].startRadius);assert.ok(Math.abs(a[id].mountMatrix.determinant()-1)<1e-8);bs[id].points.forEach((p,i)=>near(a[id].points[i],p.clone().applyMatrix4(a[id].mountMatrix)));}
});
test('multiple roots keep their own origins; pinned subtree and installed unit direct selection protected',()=>{
 const bs=fixture(),a=evaluateRootScale(bs,{targets:['B1','B5'],scale:[.5,.5,.5]});
 near(a[1].points[0],bs[1].points[0]);near(a[5].points[0],bs[5].points[0]);
 assert.deepEqual(evaluateRootScale(bs,{targets:['B1'],scale:[2,2,2]},1,{B2:{pinned_points:[1]}}),bs);
 assert.deepEqual(evaluateRootScale(bs,{targets:['B3'],scale:[2,2,2]}),bs);
});
test('scale retained layer survives normalization and real rebuild after save',()=>{
 const a=normalizeAuthoring({branch_shape:{branches:fixture().filter(b=>!b.unitOwner).map(b=>({id:b.stableId,parent:b.parentId<0?'':'B'+b.parentId,attach:b.parentT,points:b.points.map(p=>p.toArray()),length:2,start_radius:.03,end_radius:.01}))}});
 const settings={leaf_density:0,child_count:0,branch_levels:4,wind_strength:0},base=buildBranchAsset(settings,null,null,0,a),op={type:'ROOT_SCALE',targets:['B1'],scale:[.7,1.2,.9]};
 const expected=evaluateRootScale(base.masterBranches,op);
 a.sculpt_layers=[{id:'ROOT_SCALE_TEST',name:'scale',enabled:true,strength:1,operation:op,branches:{}}];
 const loaded=normalizeAuthoring(JSON.parse(JSON.stringify(a))),after=buildBranchAsset(settings,null,null,0,loaded);
 assert.equal(loaded.sculpt_layers[0].operation.type,'ROOT_SCALE');for(let n=0;n<after.masterBranches.length;n++)after.masterBranches[n].points.forEach((p,i)=>near(p,expected[n].points[i]));
 disposeBranchAsset(base);disposeBranchAsset(after);
});
