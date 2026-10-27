import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {evaluatePointRotation,pointRotationPlan} from '../web/branch-point-rotation.js';
import {evaluatePointSlide} from '../web/branch-point-slide.js';
import {evaluatePointScale} from '../web/branch-point-scale.js';
import {captureBranchShape,normalizeBranchShape,transformBranchShape} from '../web/branch-workbench-data.js';
import {axisTimes,axisTime,sampleAxis,cloneAxis} from '../web/branch-axis.js';
import {sampleLine,lineTangent,nearestParameter} from '../web/tree-sculpt.js';
import {branchMountAt} from '../web/branch-mount-frame.js';
import {mountDistanceAt} from '../web/branch-mount-drag.js';
import {createTrunkFormPreviewGeometry,normalizeSettings,DEFAULT_SETTINGS,buildBranchAsset,disposeBranchAsset,branchInstanceFrame} from '../web/branch-kernel.js';
import {completeInstanceMatrix} from '../web/branch-instance-matrix.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {createPVESkeleton} from '../web/pve-skeleton-export.js';
import {createDirectTrunkForm} from '../web/trunk-form.js';

const v=p=>new THREE.Vector3(...p),near=(a,b,e=1e-8)=>assert.ok(a.distanceTo(b)<e,`${a.toArray()} != ${b.toArray()}`);
const root=()=>({id:0,stableId:'ROOT',parentId:-1,order:0,points:[[0,0,0],[1,0,0],[2,0,0],[3,0,0],[4,0,0]].map(v),controlPoints:[[0,0,0],[.19,0,0],[.21,0,0],[3,0,0],[4,0,0]].map(v),length:4,startRadius:.035,endRadius:.01,phase:.1,windPhase:.2,windStiffness:1,sections:[],children:[]});
const operation=()=>({type:'POINT_ROTATE',sampling_version:2,root:'ROOT',point:2,targets:['ROOT'],rotation:new THREE.Quaternion().setFromAxisAngle(v([0,1,0]),-Math.PI/2).toArray()});
const settings=normalizeSettings({...DEFAULT_SETTINGS,leaf_density:0,adaptive_tessellation:true,junction_collar:false,surface_roughness:0,groove_depth:0});

test('a close pair in the same old mesh segment turns at the exact anchor and completes within the nearest control gap',()=>{
 const b=root(),before=JSON.stringify(b),op=operation(),plan=pointRotationPlan(b,2,op.rotation,1,2),after=evaluatePointRotation([b],op)[0];
 assert.ok(Math.abs(plan.width-.02)<1e-10);near(sampleLine(after.points,plan.start),b.controlPoints[2]);assert.ok(plan.start<.06);assert.ok(plan.end<.06);
 for(let i=0;i<after.points.length;i++)if(axisTime(after.points,i)<=plan.start)near(after.points[i],sampleLine(b.points,axisTime(after.points,i)));
 assert.ok(Math.abs(mountDistanceAt(after.points,1)-mountDistanceAt(b.points,1))<1e-9);near(lineTangent(after.points,.9),v([0,0,1]));assert.equal(JSON.stringify(b),before);
 const legacy=pointRotationPlan(b,2,op.rotation);assert.equal(legacy.fixed,1);assert.ok(plan.points[plan.fixed].distanceTo(b.points[legacy.fixed])>.7);
});
test('G after a local bend retains parameter order, arc distances and all actual curve points; clone helpers retain runtime parameters',()=>{
 const b=evaluatePointRotation([root()],operation())[0],p=nearestParameter(b.points,b.controlPoints[2]);assert.ok(Math.abs(p-.0525)<1e-10);const clone=cloneAxis(b.points);assert.deepEqual(axisTimes(clone),axisTimes(b.points));for(const t of [.01,.0525,.055,.6,.9])near(sampleAxis(clone,t),sampleLine(b.points,t));
 const slid=evaluatePointSlide([b],{type:'POINT_SLIDE',root:'ROOT',point:2,attach:.08})[0];assert.equal(slid.points,b.points);near(slid.controlPoints[2],sampleLine(b.points,.08));
});
test('S after a tight bend retains local parameters and moves only downstream attachments as complete rigid units',()=>{
 const b=evaluatePointRotation([root()],operation())[0],unit=(id,t)=>{const p=sampleLine(b.points,t);return {...root(),id,stableId:'U'+id,parentId:0,parentT:t,unitOwner:'U'+id,instanceId:'U'+id,points:[p,p.clone().add(v([0,.3,0]))],controlPoints:[p,p.clone().add(v([0,.3,0]))]};},before=unit(1,.04),after=unit(2,.055),scaled=evaluatePointScale([b,before,after],{root:'ROOT',point:2,scale:[.6,.6,.6]});
 assert.deepEqual(axisTimes(scaled[0].points),axisTimes(b.points));assert.equal(scaled[1],before);assert.notEqual(scaled[2],after);near(sampleLine(scaled[0].points,.055),sampleLine(b.points,.055).sub(b.controlPoints[2]).multiplyScalar(.6).add(b.controlPoints[2]));assert.ok(Math.abs(scaled[2].points[1].distanceTo(scaled[2].points[0])-.3)<1e-9);
 const instance={attach:.055,scale:.8,angle:55,azimuth:24,roll:71,seed:3,variation:0},shape={connector:{position:[.1,.05,0],direction:[1,0,0]}},actual=completeInstanceMatrix(instance,shape,scaled[0],settings,branchInstanceFrame),original=completeInstanceMatrix(instance,shape,b,settings,branchInstanceFrame),delta=new THREE.Matrix4().makeTranslation(...sampleLine(scaled[0].points,.055).sub(sampleLine(b.points,.055)).toArray());for(const p of [[0,0,0],[1,.2,-.1]])near(v(p).applyMatrix4(actual),v(p).applyMatrix4(original).applyMatrix4(delta));
});
test('capturing a bent editable source and JSON reload retain the exact tiny corner and original mount parameters',()=>{
 const b=evaluatePointRotation([root()],operation())[0],captured=captureBranchShape([b],'ROOT',true),shape=normalizeBranchShape(JSON.parse(JSON.stringify(captured.shape)));assert.deepEqual(shape.branches[0].sample_times,axisTimes(b.points));
 const moved=transformBranchShape(shape,v([2,0,0]),v([1,0,0]));assert.deepEqual(moved[0].sample_times,axisTimes(b.points));
 const authoring=normalizeAuthoring({branch_shape:shape}),asset=buildBranchAsset(settings,null,[],0,authoring);try{const rebuilt=asset.masterBranches[0];assert.deepEqual(axisTimes(rebuilt.points),axisTimes(b.points));for(const t of [0,.03,.0525,.053,.055,.0575,.4,1])near(sampleLine(rebuilt.points,t),sampleLine(b.points,t));for(const lod of [0,3]){const g=createTrunkFormPreviewGeometry(rebuilt,settings,null,lod);try{assert.ok(g.userData.radiusRings.some(r=>Math.abs(r.t-.0525)<1e-10));}finally{g.dispose();}}}finally{disposeBranchAsset(asset);}
 const old=normalizeBranchShape({branches:[{id:'R',points:[[0,0,0],[1,0,0]]}]});assert.equal(Object.hasOwn(old.branches[0],'sample_times'),false);for(const times of [[0,0],[1,0],[0,NaN],[0,.9]]){const bad=normalizeBranchShape({branches:[{id:'R',points:[[0,0,0],[1,0,0]],sample_times:times}]});assert.equal(Object.hasOwn(bad.branches[0],'sample_times'),false);}
});
test('either neighbouring side can tighten the bend and an anchor inside the last old segment remains usable',()=>{
 for(const controls of [[[0,0,0],[.2,0,0],[.21,0,0],[3,0,0],[4,0,0]],[[0,0,0],[.19,0,0],[3.99,0,0],[3.995,0,0],[4,0,0]]]){
  const b={...root(),controlPoints:controls.map(v)},index=controls[2][0]<1?1:2,op={...operation(),point:index},plan=pointRotationPlan(b,index,op.rotation,1,2),after=evaluatePointRotation([b],op)[0];assert.ok(plan.width<=.010000001);near(sampleLine(after.points,plan.start),b.controlPoints[index]);assert.ok(after.points.at(-1).distanceTo(b.points.at(-1))>1e-4);assert.ok(plan.fixed<plan.points.length-1);
 }
});
test('every render LOD keeps the exact anchor and tight local bend rings without changing the radius/UV parameter',()=>{
 const b=evaluatePointRotation([root()],operation())[0];for(let lod=0;lod<4;lod++){const g=createTrunkFormPreviewGeometry(b,settings,null,lod);try{const r=g.userData.radiusRings.find(r=>Math.abs(r.t-.0525)<1e-10);assert.ok(r,`LOD ${lod} lost anchor`);near(v(r.center),b.controlPoints[2]);assert.ok(g.userData.radiusRings.filter(r=>r.t>=.0525&&r.t<=.0575).length>=6);for(const r of g.userData.radiusRings)near(v(r.center),sampleLine(b.points,r.t));assert.ok([...g.attributes.position.array,...g.attributes.normal.array].every(Number.isFinite));}finally{g.dispose();}}
});
test('descendants use parameter-aware rigid frames even when mounted inside the newly inserted transition',()=>{
 const b=root(),child={...root(),id:1,stableId:'UNIT',parentId:0,parentT:.055,order:1,unitOwner:'U',instanceId:'U',points:[[.22,0,0],[.22,.3,0]].map(v),controlPoints:[[.22,0,0],[.22,.3,0]].map(v)},op=operation(),after=evaluatePointRotation([b,child],op),plan=pointRotationPlan(b,2,op.rotation,1,2);
 for(let i=0;i<2;i++)near(after[1].points[i],child.points[i].clone().applyMatrix4(plan.at(child.parentT)));assert.ok(Math.abs(after[1].points[1].distanceTo(after[1].points[0])-.3)<1e-10);near(v([.22,0,0]).applyMatrix4(branchMountAt(after[0],child.parentT)),after[1].points[0]);
});
test('compiled complete-unit attachment agrees with the exact local rigid transform inside the tight transition',()=>{
 const b=root(),op=operation(),after=evaluatePointRotation([b],op)[0],plan=pointRotationPlan(b,2,op.rotation,1,2),instance={attach:.055,scale:.8,angle:55,azimuth:24,roll:71,seed:3,variation:0},shape={connector:{position:[.1,.05,0],direction:[1,0,0]}},before=completeInstanceMatrix(instance,shape,b,settings,branchInstanceFrame),actual=completeInstanceMatrix(instance,shape,after,settings,branchInstanceFrame),expected=plan.at(instance.attach).clone().multiply(before);
 for(const p of [[0,0,0],[1,.2,-.1],[-.5,.4,1]])near(v(p).applyMatrix4(actual),v(p).applyMatrix4(expected));
});
test('curved source frames preserve the full-sampling prefix and all LODs protect the exact anchor',()=>{
 const b=root();b.points=[[0,0,0],[.5,0,1],[1.5,0,2],[1.5,0,4],[2.5,0,5]].map(v);b.controlPoints=[b.points[0],sampleLine(b.points,.34),sampleLine(b.points,.35),b.points[3],b.points[4]];b.startRadius=.2;b.endRadius=.06;
 const after=evaluatePointRotation([b],operation())[0];for(const form of [null,createDirectTrunkForm()])for(let lod=0;lod<4;lod++){
  const sampling={...settings,adaptive_tessellation:false},before=createTrunkFormPreviewGeometry(b,sampling,form,lod),changed=createTrunkFormPreviewGeometry(after,sampling,form,lod);let count=0;
  try{const anchor=changed.userData.radiusRings.find(r=>Math.abs(r.t-.35)<1e-10);assert.ok(anchor);near(v(anchor.center),b.controlPoints[2]);for(const r of (lod===0?before.userData.radiusRings:[]).filter(r=>r.t<.35)){const s=changed.userData.radiusRings.find(s=>Math.abs(s.t-r.t)<1e-10);if(!s||s.count!==r.count)continue;for(let i=0;i<r.count;i++)near(new THREE.Vector3().fromBufferAttribute(before.attributes.position,r.offset+i),new THREE.Vector3().fromBufferAttribute(changed.attributes.position,s.offset+i),2e-7);count++;}if(lod===0)assert.ok(count>=1);}finally{before.dispose();changed.dispose();}
 }
});
test('a normalized operation rebuild preserves nonuniform parameters and exports the existing explicit PVE t/position fields',()=>{
 const b=root(),shape={branches:[{id:'ROOT',parent:'',length:4,start_radius:.035,end_radius:.01,points:b.points.map(p=>p.toArray()),knots:b.controlPoints.map(p=>p.toArray())}]},a=normalizeAuthoring({branch_shape:shape,sculpt_layers:[{id:'CORNER',enabled:true,strength:1,operation:operation(),branches:{}}]}),before=JSON.stringify(a),asset=buildBranchAsset({...settings,max_triangles:1000000},null,[],0,a);
 try{assert.equal(a.sculpt_layers[0].operation.sampling_version,2);const branch=asset.masterBranches.find(b=>b.stableId==='ROOT');assert.ok(axisTimes(branch.points));const skeleton=createPVESkeleton(asset),record=skeleton.branches.find(b=>b.id==='ROOT'),cut=record.points.find(p=>Math.abs(p.t-.0525)<1e-10);assert.ok(cut);near(v(cut.position_m),v([.21,0,0]));assert.deepEqual(Object.keys(cut),['t','position_m','radius_m']);assert.equal(JSON.stringify(a),before);}finally{disposeBranchAsset(asset);}
});
test('a bounded dense preview and final trunk both retain every tight-bend control row',()=>{
 const b=evaluatePointRotation([{...root(),length:100}],operation())[0],form={...createDirectTrunkForm(),mesh:{version:1,radial_segments:192,segment_length:.005,detail_samples:12}},preview=createTrunkFormPreviewGeometry(b,settings,form,{vertexLimit:48000}),final=createTrunkFormPreviewGeometry(b,settings,form,{vertexLimit:250000});
 try{assert.ok(preview.attributes.position.count<=48000);for(const g of [preview,final]){const rows=g.userData.radiusRings.filter(r=>r.t>=.0525-1e-10&&r.t<=.0575+1e-10);assert.ok(rows.length>=7);for(const row of rows)near(v(row.center),sampleLine(b.points,row.t));}for(const cut of b.points.axisCuts){assert.ok(preview.userData.radiusRings.some(r=>Math.abs(r.t-cut)<1e-10));assert.ok(final.userData.radiusRings.some(r=>Math.abs(r.t-cut)<1e-10));}}finally{preview.dispose();final.dispose();}
});
