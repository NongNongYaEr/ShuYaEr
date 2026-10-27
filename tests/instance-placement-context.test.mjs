import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { buildBranchAsset, disposeBranchAsset, normalizeSettings } from '../web/branch-kernel.js';
import { createInstancePlacementContext, applyInstanceFamilyPlacement, rotateInstance, instanceTransformMatrix } from '../web/branch-instance-operations.js';

const branch=(id,parent,points)=>({id,parent,attach:.5,points,length:1,start_radius:.03,end_radius:.006});
const shape={branches:[branch('ROOT','',[[0,0,0],[1,0,0]]),branch('TIP','ROOT',[[.5,0,0],[.7,.4,.2]])],connector:{position:[0,0,0],direction:[1,0,0]}};
const fixture=()=>normalizeAuthoring({branch_shape:{branches:[branch('HOST','',[[0,0,0],[0,0,3]])]},branch_library:[{id:'ASSET',name:'完整单元枝',revision:3,shape}],branch_instances:[{id:'I',asset_id:'ASSET',linked:true,pinned_revision:3,parent:'HOST',attach:.5,scale:1,seed:20,variation:0},{id:'N',asset_id:'ASSET',linked:true,pinned_revision:3,parent:'I.TIP',attach:.7,scale:.5,seed:21,variation:0}]});

test('a dense indexed placement batch never reads singleton geometry, copies prototypes or scales unrelated unit records',()=>{
  const a=fixture();a.branch_instances=Array.from({length:1126},(_,n)=>({...a.branch_instances[0],id:'U'+n}));
  a.overrides.HOST={curve_knots:[[0,0,0],[0,0,3]]};a.curve_editor.affect_children=false;
  a.unit_editing.items=[{id:'EXPLICIT',parent:'U7.TIP',offset:[1,2,3],scale:2,base_scale:2},{id:'UNRELATED',parent:'HOST',offset:[2,3,4],scale:3,base_scale:3}];
  const library=structuredClone(a.branch_library),unrelated=structuredClone(a.unit_editing.items[1]),branches=a.branch_instances.map((i,n)=>({id:n,stableId:i.id+'.ROOT',instanceId:i.id,unitOwner:i.id,manual:false,
    get points(){throw Error('singleton placement must not read wood points');},get controlPoints(){throw Error('singleton placement must not read control points');}}));
  const settings={},context=createInstancePlacementContext(a,branches,settings);
  for(const i of a.branch_instances){const before=structuredClone(i),after={...before,scale:1.2,frame:{position:[0,0,1],direction:[0,1,0],parent_position:[0,0,1],parent_tangent:[0,0,1]}};applyInstanceFamilyPlacement(a,before,after,a.branch_library[0].shape,branches,settings,context);}
  assert.equal(context.stats.rigidWrites,1126);assert.equal(context.stats.legacyReframes,0);assert.equal(context.stats.movedBranches,0);
  assert.equal(a.curve_editor.affect_children,true);assert.deepEqual(a.branch_library,library);assert.deepEqual(a.unit_editing.items[1],unrelated);
  assert.deepEqual(a.unit_editing.items[0].offset,[1.2,2.4,3.5999999999999996]);assert.equal(a.unit_editing.items[0].scale,2.4);
  assert.ok(a.branch_instances.every(i=>i.scale===1.2&&i.assembly_manual&&i.assembly_refined));
  const cold=normalizeAuthoring(JSON.parse(JSON.stringify(a)));assert.deepEqual(cold.branch_instances,a.branch_instances);assert.deepEqual(cold.branch_library,library);
});

test('shared placement indices preserve nested rigid rotation, scale, source identity and cold reload',()=>{
  const a=fixture(),settings=normalizeSettings({leaf_density:0,child_count:0,wind_strength:0}),assets=[];
  try{
    const original=buildBranchAsset(settings,null,[],0,a);assets.push(original);const before=structuredClone(a.branch_instances[0]),parent=original.masterBranches.find(b=>b.stableId==='HOST'),source=structuredClone(a.branch_library);
    const after=rotateInstance(before,parent,settings,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,1).normalize(),.47),shape);after.scale*=1.3;
    const matrix=instanceTransformMatrix(before,after,shape,original.masterBranches,settings),context=createInstancePlacementContext(a,original.masterBranches,settings);
    assert.deepEqual(context.familyOf('I').map(i=>i.id),['I','N']);applyInstanceFamilyPlacement(a,before,after,shape,original.masterBranches,settings,context);
    assert.equal(context.stats.legacyReframes,0);assert.equal(context.stats.rigidWrites,2);assert.equal(context.stats.movedBranches,4);assert.deepEqual(a.branch_library,source);
    const cold=buildBranchAsset(settings,null,[],0,normalizeAuthoring(JSON.parse(JSON.stringify(a))));assets.push(cold);
    for(const b of original.masterBranches.filter(b=>b.instanceId)){const next=cold.masterBranches.find(n=>n.stableId===b.stableId);for(let n=0;n<b.points.length;n++)assert.ok(b.points[n].clone().applyMatrix4(matrix).distanceTo(next.points[n])<1e-7,b.stableId);assert.ok(Math.abs(next.startRadius-b.startRadius*1.3)<1e-7);}
  }finally{assets.forEach(disposeBranchAsset);}
});

test('historical local curves and sculpt operations retain the compatibility reframe in an indexed family',()=>{
  const a=fixture();a.branch_instances=a.branch_instances.slice(0,1);const settings=normalizeSettings({leaf_density:0,child_count:0,wind_strength:0}),assets=[];
  try{
    const base=buildBranchAsset(settings,null,[],0,a);assets.push(base);const root=base.masterBranches.find(b=>b.stableId==='I.ROOT'),knots=root.controlPoints.map(p=>p.toArray());knots.at(-1)[2]+=.23;a.overrides['I.ROOT']={locked:true,curve_knots:knots,curve_samples:knots};
    a.sculpt_layers=[{id:'LOCAL',enabled:true,strength:1,branches:{},operation:{type:'POSE',targets:['I.TIP'],anchor:[0,0,1],offset:[0,0,.12],radius:.8}}];
    const original=buildBranchAsset(settings,null,[],0,a);assets.push(original);const before=structuredClone(a.branch_instances[0]),parent=original.masterBranches.find(b=>b.stableId==='HOST'),after=rotateInstance(before,parent,settings,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.31),shape),context=createInstancePlacementContext(a,original.masterBranches,settings),matrix=instanceTransformMatrix(before,after,shape,original.masterBranches,settings);
    applyInstanceFamilyPlacement(a,before,after,shape,original.masterBranches,settings,context);assert.equal(context.stats.legacyReframes,1);assert.ok(a.overrides['I.ROOT'].curve_parent_frame);assert.ok(a.sculpt_layers[0].operation);
    const cold=buildBranchAsset(settings,null,[],0,normalizeAuthoring(JSON.parse(JSON.stringify(a))));assets.push(cold);
    for(const b of original.masterBranches.filter(b=>b.instanceId==='I')){const next=cold.masterBranches.find(n=>n.stableId===b.stableId);for(let n=0;n<b.points.length;n++)assert.ok(b.points[n].clone().applyMatrix4(matrix).distanceTo(next.points[n])<2e-6,b.stableId);}
  }finally{assets.forEach(disposeBranchAsset);}
});

test('manual non-prefix wood follows the family and an index from another transaction cannot mutate its document',()=>{
  const a=fixture();a.branch_instances=a.branch_instances.slice(0,1);const settings=normalizeSettings({leaf_density:0,child_count:0,wind_strength:0}),assets=[];
  try{
    a.manual_branches=[{id:'CUSTOM',parent:'I.TIP',attach:.6,length:.7,radius:.012,angle:35,azimuth:20}];
    const base=buildBranchAsset(settings,null,[],0,a);assets.push(base);const manual=base.masterBranches.find(b=>b.stableId==='CUSTOM');assert.equal(manual.unitOwner,'I');a.overrides.CUSTOM={curve_knots:manual.controlPoints.map(p=>p.toArray()),curve_samples:manual.points.map(p=>p.toArray())};
    const original=buildBranchAsset(settings,null,[],0,a);assets.push(original);const before=structuredClone(a.branch_instances[0]),parent=original.masterBranches.find(b=>b.stableId==='HOST'),after=rotateInstance(before,parent,settings,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),.33),shape);after.scale*=1.2;
    const context=createInstancePlacementContext(a,original.masterBranches,settings),matrix=instanceTransformMatrix(before,after,shape,original.masterBranches,settings),next=structuredClone(a),sourceJson=JSON.stringify(a);
    applyInstanceFamilyPlacement(next,before,after,shape,original.masterBranches,settings,context);assert.equal(JSON.stringify(a),sourceJson,'context has to belong to the actual transaction');assert.ok(Math.abs(next.manual_branches[0].length-.84)<1e-9);assert.ok(next.overrides.CUSTOM.curve_parent_frame);
    const cold=buildBranchAsset(settings,null,[],0,normalizeAuthoring(JSON.parse(JSON.stringify(next))));assets.push(cold);
    for(const b of original.masterBranches.filter(b=>b.instanceId==='I'||b.unitOwner==='I')){const moved=cold.masterBranches.find(n=>n.stableId===b.stableId);assert.ok(moved);for(let n=0;n<b.points.length;n++)assert.ok(b.points[n].clone().applyMatrix4(matrix).distanceTo(moved.points[n])<2e-6,b.stableId);}
  }finally{assets.forEach(disposeBranchAsset);}
});
