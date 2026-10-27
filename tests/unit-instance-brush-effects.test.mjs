import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { buildBranchAsset, disposeBranchAsset, normalizeSettings, deserializeGeometry } from '../web/branch-kernel.js';
import { applyInstanceFamilyPlacement, evaluatedInstanceFrame } from '../web/branch-instance-operations.js';
import { resolvePveExportPlan } from '../web/pve-export-plan.js';
import { prepareUnitCombEntries, combUnitInstance, advanceUnitCombEntries, evaluateUnitInstanceCombing, unitCombEffectState } from '../web/unit-instance-combing.js';
import { INSTANCE_SCALE_MIN, INSTANCE_SCALE_MAX } from '../web/assembly-scale.js';

const wood=(id,parent,points)=>({id,parent,points,length:1,start_radius:.035,end_radius:.007});
const shape={connector:{position:[0,0,0],direction:[1,0,0]},branches:[wood('R1','',[[0,0,0],[1,0,0]]),wood('B1','R1',[[.5,0,0],[.7,.4,.2]])]};
const fixture=()=>normalizeAuthoring({branch_shape:{branches:[wood('ROOT','',[[0,0,0],[0,0,3]])]},branch_library:[{id:'A',revision:2,shape}],
 branch_instances:[{id:'I',parent:'ROOT',asset_id:'A',linked:true,pinned_revision:2,attach:.4,scale:1.2,radius_scale:1.3,variation:0,
  frame:{position:[0,0,1.2],direction:[1,0,0],parent_position:[0,0,1.2],parent_tangent:[0,0,1]}},
 {id:'N',parent:'I.B1',asset_id:'A',linked:true,pinned_revision:2,attach:.7,scale:.5,variation:0},
 {id:'O',parent:'ROOT',asset_id:'A',linked:true,pinned_revision:2,attach:.8,scale:.8,variation:0}]});
const settings=normalizeSettings({leaf_density:0,child_count:0,wind_strength:0});
const near=(a,b,message='')=>assert.ok(a.distanceTo(b)<1e-7,`${message}: ${a.distanceTo(b)}`);
const scalarNear=(a,b,message='')=>assert.ok(Math.abs(a-b)<1e-8,`${message}: ${a} / ${b}`);
function paint(entry,options,{count=32,distance=.2}={}){
 let entries=[entry],matrix=new THREE.Matrix4(),updates=[];
 for(let n=0;n<count;n++){
  const update=combUnitInstance(entries[0],{delta:new THREE.Vector3(0,distance/count,0),worldRadius:1,strength:1,...options});
  if(update){updates.push(update);matrix.premultiply(update.matrix);entries=advanceUnitCombEntries(entries,[update]);}
 }
 return {entry:entries[0],matrix,updates};
}
const configurations=[
 {effect:'ALIGN',sampleDirection:new THREE.Vector3(0,1,0)},
 {effect:'SPREAD',centerPoint:new THREE.Vector3(0,-2,1.2),spreadMode:'OUT',angleLimitDegrees:25},
 {effect:'SCALE',sizeMode:'GROW',sizeLimitPercent:20},
 {effect:'JITTER',seed:733,angleLimitDegrees:25},
];

test('fixed pen baselines make ALIGN/SPREAD/SCALE/JITTER independent of dab frequency and preserve original snapshots',()=>{
 const a=fixture(),asset=buildBranchAsset(settings,null,[],0,a),original=structuredClone(a);
 try{
  const [entry]=prepareUnitCombEntries({authoring:a,branches:asset.masterBranches,settings,selection:['I','N']});
  assert.deepEqual(entry.familyIds,['I','N']);
  for(const config of configurations){
   const once=paint(entry,config,{count:1}),many=paint(entry,config,{count:113});
   near(once.entry.longAxis,many.entry.longAxis,config.effect+' axis at equal path distance');
   near(once.entry.frame.direction,many.entry.frame.direction,config.effect+' frame at equal path distance');
   scalarNear(once.entry.instance.scale,many.entry.instance.scale,config.effect+' size at equal path distance');
   once.matrix.elements.forEach((value,n)=>scalarNear(value,many.matrix.elements[n],config.effect+' cumulative family matrix'));
   near(many.entry.frame.position,entry.frame.position);assert.equal(many.entry.instance.radius_scale,entry.instance.radius_scale);
   assert.equal(many.entry.instance.asset_id,entry.instance.asset_id);assert.equal(many.entry.instance.pinned_revision,entry.instance.pinned_revision);
   assert.ok(many.entry.stroke.progress>0&&many.entry.stroke.progress<1);assert.ok(!Object.hasOwn(many.entry.instance,'stroke'));
  }
  assert.deepEqual(a,original,'no dab edits authoring, source contents or child instances');assert.ok(!entry.stroke,'prepare/cache entry remains clean for another pen');
 }finally{disposeBranchAsset(asset);}
});

test('ALIGN samples a complete actual long axis and aligns every selected instance while retaining its mount and model',()=>{
 const a=fixture(),asset=buildBranchAsset(settings,null,[],0,a);
 try{
  const [entry]=prepareUnitCombEntries({authoring:a,branches:asset.masterBranches,settings,selection:['I']});
  const target=new THREE.Vector3(-.2,.7,.4).normalize(),result=paint(entry,{effect:'ALIGN',sampleDirection:target},{distance:2});
  near(result.entry.longAxis,target);near(result.entry.frame.position,entry.frame.position);
  assert.equal(result.entry.instance.scale,entry.instance.scale);assert.equal(result.entry.instance.radius_scale,entry.instance.radius_scale);
  assert.ok(result.updates.every(update=>Math.abs(update.matrix.determinant()-1)<1e-10));
  const next=evaluatedInstanceFrame(result.entry.instance,entry.shape,asset.masterBranches,settings);near(next.position,entry.frame.position);
  const changedAxis=entry.longAxis.clone().transformDirection(result.matrix);near(changedAxis,target,'actual source geometry is transported into sampled direction');
 }finally{disposeBranchAsset(asset);}
});

test('SPREAD uses one fixed radial center, bounds each pen and supports outward and inward whole-unit turns',()=>{
 const a=fixture(),asset=buildBranchAsset(settings,null,[],0,a);
 try{
  const [entry]=prepareUnitCombEntries({authoring:a,branches:asset.masterBranches,settings,selection:['I']});
  const center=new THREE.Vector3(0,-2,1.2),out=paint(entry,{effect:'SPREAD',centerPoint:center,spreadMode:'OUT'},{distance:20}),inside=paint(entry,{effect:'SPREAD',centerPoint:center,spreadMode:'IN'},{distance:20});
  scalarNear(THREE.MathUtils.radToDeg(entry.longAxis.angleTo(out.entry.longAxis)),25);scalarNear(THREE.MathUtils.radToDeg(entry.longAxis.angleTo(inside.entry.longAxis)),25);
  assert.ok(out.entry.longAxis.y>0);assert.ok(inside.entry.longAxis.y<0);near(out.entry.frame.position,entry.frame.position);near(inside.entry.frame.position,entry.frame.position);
  const stopped=paint(out.entry,{effect:'SPREAD',centerPoint:center,spreadMode:'OUT'},{distance:20});near(stopped.entry.longAxis,out.entry.longAxis,'same pen cannot keep accumulating beyond its cap');
  const frozenTarget=paint(out.entry,{effect:'SPREAD',centerPoint:new THREE.Vector3(0,2,1.2),spreadMode:'OUT'},{distance:2});near(frozenTarget.entry.longAxis,out.entry.longAxis,'center is fixed for the entire pen');
 }finally{disposeBranchAsset(asset);}
});

test('SCALE has one grow/shrink percentage per pen, respects nested global size bounds and scales the complete family uniformly',()=>{
 const a=fixture(),asset=buildBranchAsset(settings,null,[],0,a);
 try{
  const [entry]=prepareUnitCombEntries({authoring:a,branches:asset.masterBranches,settings,selection:['I']});
  const grow=paint(entry,{effect:'SCALE',sizeMode:'GROW'},{distance:20}),shrink=paint(entry,{effect:'SCALE',sizeMode:'SHRINK'},{distance:20});
  scalarNear(grow.entry.instance.scale,entry.instance.scale*1.2);scalarNear(shrink.entry.instance.scale,entry.instance.scale*.8);
  scalarNear(grow.matrix.determinant(),1.2**3);near(grow.entry.longAxis,entry.longAxis);near(grow.entry.frame.position,entry.frame.position);
  assert.equal(grow.entry.instance.radius_scale,entry.instance.radius_scale);assert.equal(paint(grow.entry,{effect:'SCALE'},{distance:20}).entry.instance.scale,grow.entry.instance.scale);
  applyInstanceFamilyPlacement(a,entry.instance,grow.entry.instance,entry.shape,asset.masterBranches,settings);
  scalarNear(a.branch_instances.find(i=>i.id==='N').scale,.6);
  const loaded=buildBranchAsset(settings,null,[],0,normalizeAuthoring(JSON.parse(JSON.stringify(a))));
  try{for(const branch of asset.masterBranches.filter(b=>['I','N'].includes(b.instanceId))){const next=loaded.masterBranches.find(b=>b.stableId===branch.stableId);branch.points.forEach((point,n)=>near(next.points[n],point.clone().applyMatrix4(grow.matrix),'complete uniform family '+branch.stableId));}}
  finally{disposeBranchAsset(loaded);}
  const large={...entry,familyScales:[entry.instance.scale,490]},capped=paint(large,{effect:'SCALE',sizeMode:'GROW',sizeLimitPercent:100},{distance:20});
  scalarNear(capped.entry.instance.scale/entry.instance.scale,INSTANCE_SCALE_MAX/490);assert.ok(capped.entry.instance.scale<=INSTANCE_SCALE_MAX);
  const tiny={...entry,familyScales:[entry.instance.scale,.0006]},limited=paint(tiny,{effect:'SCALE',sizeMode:'SHRINK',sizeLimitPercent:100},{distance:20});
  scalarNear(limited.entry.instance.scale/entry.instance.scale,INSTANCE_SCALE_MIN/.0006);assert.ok(limited.entry.instance.scale>=INSTANCE_SCALE_MIN);
  const maxRoot={...entry,instance:{...entry.instance,scale:INSTANCE_SCALE_MAX},familyScales:[INSTANCE_SCALE_MAX]};
  assert.equal(combUnitInstance(maxRoot,{effect:'SCALE',delta:new THREE.Vector3(0,2,0),strength:1}),null,'already maximal whole model cannot exceed the legal scale');
 }finally{disposeBranchAsset(asset);}
});

test('JITTER is deterministic per actual instance and seed, stays within one angular limit and does not draw per-frame randomness',()=>{
 const a=fixture(),asset=buildBranchAsset(settings,null,[],0,a);
 try{
  const [entry]=prepareUnitCombEntries({authoring:a,branches:asset.masterBranches,settings,selection:['I']});
  const first=paint(entry,{effect:'JITTER',seed:731},{distance:20}),same=paint(entry,{effect:'JITTER',seed:731},{count:71,distance:20}),otherSeed=paint(entry,{effect:'JITTER',seed:732},{distance:20});
  near(first.entry.longAxis,same.entry.longAxis);assert.ok(first.entry.longAxis.distanceTo(otherSeed.entry.longAxis)>.01);
  const otherId=paint({...entry,id:'ACTUAL_OTHER',instance:{...entry.instance,id:'ACTUAL_OTHER'}},{effect:'JITTER',seed:731},{distance:20});
  assert.ok(first.entry.longAxis.distanceTo(otherId.entry.longAxis)>.01);
  const degrees=THREE.MathUtils.radToDeg(entry.longAxis.angleTo(first.entry.longAxis));assert.ok(degrees>0&&degrees<=25+1e-9);
  const stopped=paint(first.entry,{effect:'JITTER',seed:731},{distance:100});near(stopped.entry.longAxis,first.entry.longAxis);
  assert.equal(first.entry.instance.scale,entry.instance.scale);near(first.entry.frame.position,entry.frame.position);
 }finally{disposeBranchAsset(asset);}
});

test('brush eligibility preserves surface/through/sphere selection and reports missing targets without touching any source',()=>{
 const a=fixture(),asset=buildBranchAsset(settings,null,[],0,a),project=p=>({x:p.x*100,y:p.y*100,depth:p.z,clip:0});
 try{
  const entries=prepareUnitCombEntries({authoring:a,branches:asset.masterBranches,settings,scope:'ALL'}),brush={project,center:{x:50,y:0,depth:1.2,world:new THREE.Vector3(.5,0,1.2)},radius:20,worldRadius:.2,depthRange:.4,delta:new THREE.Vector3(0,.04,0)};
  for(const config of configurations){
   const surface=evaluateUnitInstanceCombing(entries,{...brush,...config,scope:'SURFACE'}),through=evaluateUnitInstanceCombing(entries,{...brush,...config,scope:'THROUGH'}),sphere=evaluateUnitInstanceCombing(entries,{...brush,...config,scope:'SPHERE'});
   assert.deepEqual(surface.updates.map(update=>update.id),['I']);assert.deepEqual(through.updates.map(update=>update.id),['I','O']);assert.deepEqual(sphere.updates.map(update=>update.id),['I']);
   assert.ok(through.matrices.has('N'),'nested child follows the same complete root matrix, never a separate dab');
  }
  const missing=evaluateUnitInstanceCombing(entries,{...brush,effect:'ALIGN',scope:'THROUGH'});assert.equal(missing.updates.length,0);assert.equal(missing.weights.get('I'),0);assert.equal(missing.skipped.get('I'),'MISSING_SAMPLE_DIRECTION');
  assert.equal(unitCombEffectState(entries[0],{effect:'SPREAD',centerPoint:entries[0].frame.position}).skipReason,'CENTER_AT_ROOT');
  assert.equal(unitCombEffectState(entries[0],{effect:'SPREAD'}).skipReason,'MISSING_CENTER');
  assert.equal(unitCombEffectState(entries[0],{effect:'SCALE',sizeLimitPercent:NaN}).skipReason,'INVALID_SIZE_LIMIT');
  assert.equal(unitCombEffectState(entries[0],{effect:'JITTER',angleLimitDegrees:-1}).skipReason,'INVALID_ANGLE_LIMIT');
  for(const config of configurations)assert.equal(combUnitInstance(entries[0],{...config,delta:new THREE.Vector3()}),null,'hover never edits complete models');
  a.branch_instances.find(i=>i.id==='N').assembly_locked=true;
  assert.deepEqual(prepareUnitCombEntries({authoring:a,branches:asset.masterBranches,settings,selection:['I','N']}).map(entry=>entry.id),[]);
 }finally{disposeBranchAsset(asset);}
});

test('all new effects save and reload six actual camphor complete models without private PVE variants or source/material edits',()=>{
 const names=['紧凑侧枝_深绿','紧凑侧枝_混合','紧凑侧枝_嫩绿','短弯细梢_深绿','短弯细梢_混合','短弯细梢_嫩绿'];
 const library=names.map(name=>JSON.parse(fs.readFileSync(new URL(`../次枝资产/全植物次枝成品V1/香樟/香樟_${name}_成品V1.branchasset.json`,import.meta.url))).asset);
 const sources=[...new Map(library.flatMap(item=>item.sample.leaf_meshes).map(source=>[source.id,source])).values()].map(source=>({...source,geometry:deserializeGeometry(source.geometry)}));
 const a=normalizeAuthoring({branch_shape:{branches:[wood('ROOT','',[[0,0,0],[0,0,8]])]},branch_library:library,
  branch_instances:library.map((item,n)=>({id:'COMPLETE_'+n,parent:'ROOT',asset_id:item.id,linked:true,pinned_revision:item.revision,attach:.1+n*.13,scale:1,variation:0})),
  leaf_material:library[0].sample.authoring.leaf_material,recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']}});
 const s=normalizeSettings({...library[0].sample.settings,leaf_density:0,max_triangles:8000000,preview_lod:0}),sourceBefore=JSON.stringify(a.branch_library),assets=[];
 try{
  let current=buildBranchAsset(s,null,sources,0,a);assets.push(current);
  const triangleCount=current.report.triangles,leafCount=current.masterPlacements.length;
  for(const config of configurations){
   const entries=prepareUnitCombEntries({authoring:a,branches:current.masterBranches,settings:s,scope:'ALL'}),updates=entries.map(entry=>paint(entry,config,{distance:1}).entry);
   assert.equal(updates.length,6);const matrices=new Map();
   for(let n=0;n<entries.length;n++){const original=entries[n],next=updates[n];
    const result=paint(original,config,{distance:1});matrices.set(original.id,result.matrix);
    applyInstanceFamilyPlacement(a,original.instance,next.instance,original.shape,current.masterBranches,s);
   }
   const loaded=buildBranchAsset(s,null,sources,0,normalizeAuthoring(JSON.parse(JSON.stringify(a))));assets.push(loaded);
   const plan=resolvePveExportPlan(loaded,a);assert.equal(plan.units.length,6);assert.equal(new Set(plan.units.map(unit=>unit.sourceInstance.asset_id)).size,6);
   assert.ok(plan.units.every(unit=>!unit.variantRequired),config.effect+' keeps complete models reusable');assert.equal(loaded.report.triangles,triangleCount);assert.equal(loaded.masterPlacements.length,leafCount);
   assert.equal(JSON.stringify(a.branch_library),sourceBefore);assert.deepEqual(a.overrides,{});assert.deepEqual(a.sculpt_layers,[]);
   const byLeaf=new Map(loaded.masterPlacements.map(p=>[p.stableId,p]));
   for(const p of current.masterPlacements){const next=byLeaf.get(p.stableId),matrix=matrices.get(p.branchStableId.split('.')[0]);near(next.position,p.position.clone().applyMatrix4(matrix),config.effect+' complete leaves follow');assert.equal(next.source,p.source);}
   current=loaded;
  }
 }finally{assets.forEach(disposeBranchAsset);sources.forEach(source=>source.geometry.dispose());}
});
