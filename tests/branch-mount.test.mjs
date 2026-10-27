import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBranchAsset,disposeBranchAsset} from '../web/branch-kernel.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {makeMountOperation,evaluateBranchMount,mountPreviewBase} from '../web/branch-mount.js';
const shape=(id,parent,points)=>({id,parent,points,attach:.7,length:2,start_radius:.03,end_radius:.009});
const settings={leaf_density:0,child_count:0,branch_levels:4,wind_strength:0};
const fixture=()=>normalizeAuthoring({branch_shape:{branches:[shape('R','',[[0,0,0],[.2,0,1],[0,.2,2],[0,0,3]]),shape('A','R',[[0,.1,2.1],[.7,.1,2.4],[1.2,.3,2.8],[2,.4,3]]),shape('C','A',[[1,.2,2.6],[1.3,.2,3],[1.5,.4,3.2]]),shape('B','R',[[0,0,1],[-1,0,1.3],[-1.5,0,2]])]}});
const points=b=>b.points.map(p=>p.toArray());
const near=(a,b)=>assert.ok(a.distanceTo(b)<1e-7,`${a.toArray()} vs ${b.toArray()}`);
test('mount moves whole curved subtree rigidly; repeated settings, undo-equivalent and serialization are stable',()=>{
 const a=fixture(),base=buildBranchAsset(settings,null,null,0,a),root=base.masterBranches.find(b=>b.stableId==='A');
 const values={attach:.25,azimuth:40,elevation:25};let op=makeMountOperation(base.masterBranches,root,values,{azimuth:0,elevation:0},null);
 a.sculpt_layers=[{id:'MOUNT_TEST',name:'mount',strength:1,enabled:true,operation:op,branches:{}}];
 const mounted=buildBranchAsset(settings,null,null,0,a),expected=evaluateBranchMount(base.masterBranches,op);
 for(const b of mounted.masterBranches){const e=expected.find(v=>v.stableId===b.stableId);b.points.forEach((p,i)=>near(p,e.points[i])); const old=base.masterBranches.find(v=>v.stableId===b.stableId);assert.equal(b.startRadius,old.startRadius);assert.equal(b.endRadius,old.endRadius);for(let i=1;i<b.points.length;i++)assert.ok(Math.abs(b.points[i].distanceTo(b.points[0])-old.points[i].distanceTo(old.points[0]))<1e-7);}
 assert.deepEqual(points(mounted.masterBranches.find(b=>b.stableId==='B')),points(base.masterBranches.find(b=>b.stableId==='B')));
 const loaded=buildBranchAsset(settings,null,null,0,normalizeAuthoring(JSON.parse(JSON.stringify(a))));assert.deepEqual(loaded.masterBranches.map(points),mounted.masterBranches.map(points));
 // Consecutive numeric changes replace the operation, retaining one layer.
 const r=mounted.masterBranches.find(b=>b.stableId==='A');const next={attach:.45,azimuth:60,elevation:15};
 const delta=makeMountOperation(mounted.masterBranches,r,next,values,null),merged=makeMountOperation(mounted.masterBranches,r,next,values,op);
 const want=evaluateBranchMount(base.masterBranches,makeMountOperation(base.masterBranches,root,next,{azimuth:0,elevation:0},null));a.sculpt_layers[0].operation=merged;
 const changed=buildBranchAsset(settings,null,null,0,a);for(const b of changed.masterBranches)b.points.forEach((p,i)=>near(p,want.find(v=>v.stableId===b.stableId).points[i]));
 const preview=evaluateBranchMount(mountPreviewBase(mounted.masterBranches,r,op),merged);for(const b of preview)b.points.forEach((p,i)=>near(p,want.find(v=>v.stableId===b.stableId).points[i]));
 const back=makeMountOperation(changed.masterBranches,changed.masterBranches.find(b=>b.stableId==='A'),{attach:root.parentT,azimuth:0,elevation:0},next,merged);a.sculpt_layers[0].operation=back;const restored=buildBranchAsset(settings,null,null,0,a);for(const b of restored.masterBranches)b.points.forEach((p,i)=>near(p,base.masterBranches.find(v=>v.stableId===b.stableId).points[i]));
 [base,mounted,loaded,changed,restored].forEach(disposeBranchAsset);
});
import * as THREE from 'three';
import {withAxisTimes,sampleAxis} from '../web/branch-axis.js';
import {makeMountRotationOperation} from '../web/branch-mount.js';

test('mounting a sampled carrier retains its child attachment parameters through rigid movement and inverse preview',()=>{
 const a=fixture(),asset=buildBranchAsset(settings,null,null,0,a),branches=asset.masterBranches,root=branches.find(b=>b.stableId==='A');
 for(const b of branches)withAxisTimes(b.points,b.points.map((_,i)=>(i/(b.points.length-1))**2),[.2,.7]);
 const op=makeMountOperation(branches,root,{attach:.23,azimuth:17,elevation:9},{azimuth:0,elevation:0},null),moved=evaluateBranchMount(branches,op),now=moved.find(b=>b.stableId==='A');
 for(const b of moved){const old=branches.find(v=>v.id===b.id);assert.deepEqual(b.points.axisTimes,old.points.axisTimes);assert.deepEqual(b.points.axisCuts,old.points.axisCuts);}
 const matrix=now.mountMatrix.clone().multiply((root.mountMatrix||new THREE.Matrix4()).clone().invert());
 for(const t of [.01,.05,.2,.5,.85,.99])near(sampleAxis(now.points,t),sampleAxis(root.points,t).applyMatrix4(matrix));
 const restored=mountPreviewBase(moved,now,op);for(const b of branches){const r=restored.find(v=>v.id===b.id);assert.deepEqual(r.points.axisTimes,b.points.axisTimes);b.points.forEach((p,i)=>near(p,r.points[i]));}
 disposeBranchAsset(asset);
});
test('three-axis rotation fixes the actual root, composes full orientation and preserves later mounting',()=>{
 const a=fixture(),base=buildBranchAsset(settings,null,null,0,a),root=base.masterBranches.find(b=>b.stableId==='A');
 const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.37,.62,-.45));
 const op=makeMountRotationOperation(base.masterBranches,root,q,{azimuth:0,elevation:0});
 a.sculpt_layers=[{id:'ROTATE',name:'rotation',enabled:true,strength:1,operation:op,branches:{}}];
 const rotated=buildBranchAsset(settings,null,null,0,a),r=rotated.masterBranches.find(b=>b.stableId==='A');near(r.points[0],root.points[0]);assert.equal(r.parentT,root.parentT);
 for(const id of ['A','C']){const old=base.masterBranches.find(b=>b.stableId===id),now=rotated.masterBranches.find(b=>b.stableId===id);now.points.forEach((p,i)=>near(p,old.points[i].clone().sub(root.points[0]).applyQuaternion(q).add(root.points[0])));}
 const loaded=buildBranchAsset(settings,null,null,0,normalizeAuthoring(JSON.parse(JSON.stringify(a))));assert.deepEqual(loaded.masterBranches.map(points),rotated.masterBranches.map(points));
 const q2=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.28),merged=makeMountRotationOperation(rotated.masterBranches,r,q2,{azimuth:0,elevation:0},op);
 const expected=evaluateBranchMount(rotated.masterBranches,makeMountRotationOperation(rotated.masterBranches,r,q2,{azimuth:0,elevation:0}));a.sculpt_layers[0].operation=merged;
 const again=buildBranchAsset(settings,null,null,0,a);for(const b of again.masterBranches)b.points.forEach((p,i)=>near(p,expected.find(v=>v.stableId===b.stableId).points[i]));
 const carrier=again.masterBranches.find(b=>b.stableId==='A');a.sculpt_layers.push({id:'MOVE',name:'move',enabled:true,strength:1,operation:makeMountOperation(again.masterBranches,carrier,{attach:.2,azimuth:0,elevation:0},{azimuth:0,elevation:0},null),branches:{}});
 const moved=buildBranchAsset(settings,null,null,0,a);for(const id of ['A','C']){const b=again.masterBranches.find(v=>v.stableId===id),n=moved.masterBranches.find(v=>v.stableId===id);for(let i=1;i<b.points.length;i++)assert.ok(Math.abs(b.points[i].distanceTo(b.points[0])-n.points[i].distanceTo(n.points[0]))<1e-7);}
 [base,rotated,loaded,again,moved].forEach(disposeBranchAsset);
});
