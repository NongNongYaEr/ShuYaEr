import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { evaluateBranchRadius, radiusFactorAt, createRadiusPreview } from '../web/branch-radius.js';
import { branchRadiusAt } from '../web/branch-shaping.js';
import { captureBranchShape } from '../web/branch-workbench-data.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { buildBranchAsset, disposeBranchAsset } from '../web/branch-kernel.js';
import { createPVESkeleton, validatePVESkeleton } from '../web/pve-skeleton-export.js';
const v=(x,z)=>new THREE.Vector3(x,0,z);
const fixture=()=>Array.from({length:7},(_,id)=>({id,stableId:'B'+id,parentId:id===0?-1:id===1?0:id===6?4:1,parentT:id===2?.1:.9,points:Array.from({length:21},(_,i)=>v(i/10,id+i/100)),controlPoints:[v(0,id),v(1,id+.1),v(2,id+.2)],...(id===4?{unitOwner:'U'}:{})}));
test('thickness changes only support radii, respects point prefix and excluded subtrees',()=>{
 const bs=fixture(),whole=evaluateBranchRadius(bs,{targets:['B1'],factor:2,point:0,excluded:['B5']});
 for(let i=0;i<bs.length;i++){
  assert.equal(whole[i].points,bs[i].points);assert.equal(whole[i].controlPoints,bs[i].controlPoints);
  assert.equal(radiusFactorAt(whole[i],.9),[1,2,2,2,1,1,1][i]);
 }
 const tail=evaluateBranchRadius(bs,{targets:['B1'],factor:.5,point:1});
 assert.equal(radiusFactorAt(tail[1],.5),1);assert.equal(radiusFactorAt(tail[1],.3),1);
 assert.ok(radiusFactorAt(tail[1],.55)<1);assert.equal(radiusFactorAt(tail[1],.9),.5);
 assert.equal(radiusFactorAt(tail[2],.9),1);assert.equal(radiusFactorAt(tail[3],.9),.5);
 assert.equal(radiusFactorAt(tail[4],.9),1);assert.equal(radiusFactorAt(tail[6],.9),1);
 assert.equal(evaluateBranchRadius(bs,{targets:['B1'],factor:1,point:1}),bs);
});

const doc=()=>normalizeAuthoring({branch_shape:{branches:[{id:'ROOT',points:[[0,0,0],[0,0,1],[0,0,2],[0,0,3],[0,0,4]],knots:[[0,0,0],[0,0,1],[0,0,2],[0,0,3],[0,0,4]],start_radius:.1,end_radius:.02,length:4}]}});
const operation={type:'RADIUS',targets:['ROOT'],point:2,factor:2};
test('preview equals committed mesh, cancellation/no-op restore, calibrated radius and PVE reload agree',()=>{
 for(const calibrated of [false,true]){
  const a=doc();if(calibrated)a.workbench={skeleton_thickness:{levels:[{mode:'RADIUS_CURVE',scale:1,curve:[1,.8,.6,.4,.2]}]}};
  const before=buildBranchAsset({leaf_density:8,child_count:0},null,[],0,a),settings=before.settings;
  const preview=createRadiusPreview(before),updated=evaluateBranchRadius(before.masterBranches,operation);
  const geometry=asset=>{let g;asset.group.traverse(m=>{if(m.userData.category==='branch'&&m.userData.stable_id==='ROOT')g=m.geometry;});return g;};
  const original=geometry(before);preview.update(updated);assert.notEqual(geometry(before),original);
  const vertices=Array.from(geometry(before).getAttribute('position').array);
  preview.update(before.masterBranches);assert.equal(geometry(before),original);preview.update(updated);preview.restore();assert.equal(geometry(before),original);
  a.sculpt_layers=[{id:'R',enabled:true,strength:1,operation,branches:{}}];
  const after=buildBranchAsset(settings,null,[],0,normalizeAuthoring(JSON.parse(JSON.stringify(a))));
  try{
   const actual=geometry(after).getAttribute('position').array;vertices.forEach((v,i)=>assert.ok(Math.abs(v-actual[i])<1e-6));
   const b=before.masterBranches[0],c=after.masterBranches[0];assert.deepEqual(c.points,b.points);
   for(const t of [0,.2,.5])assert.equal(branchRadiusAt(c,settings,t),branchRadiusAt(b,settings,t));
   assert.ok(Math.abs(branchRadiusAt(c,settings,1)/branchRadiusAt(b,settings,1)-2)<1e-10);
   assert.deepEqual(after.placements,before.placements);
   const pve=createPVESkeleton(after);assert.ok(validatePVESkeleton(pve).valid);
   for(const p of pve.branches[0].points)assert.ok(Math.abs(p.radius_m-branchRadiusAt(c,settings,p.t))<1e-10);
   const captured=captureBranchShape(after.masterBranches,'ROOT');
   const replay=buildBranchAsset(settings,null,[],0,normalizeAuthoring({branch_shape:captured.shape}));
   try{for(let n=0;n<=100;n++)assert.ok(Math.abs(branchRadiusAt(replay.masterBranches[0],settings,n/100)/branchRadiusAt(c,settings,n/100)-1)<.006,'extracted radius matches');}finally{disposeBranchAsset(replay);}
  }finally{disposeBranchAsset(before);disposeBranchAsset(after);}
 }
});

