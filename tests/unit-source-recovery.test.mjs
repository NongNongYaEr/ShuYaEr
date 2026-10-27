import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import * as k from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { captureBranchDuplicate } from '../web/branch-duplicate.js';
import { captureLinkedBranchDuplicate } from '../web/linked-branch-duplicate.js';
import { makeMountOperation } from '../web/branch-mount.js';
import { resolvePveExportPlan } from '../web/pve-export-plan.js';
import { fitSourceUnitPose, planUnitSourceRecovery, recoverUnitSources, verifyUnitSourceRecovery } from '../web/unit-source-recovery.js';

const layer = (id, operation, branches = {}) => ({ id, name:id, enabled:true, strength:1, operation, branches });
const vectors = ps => ps.map(p => new T.Vector3(...p));
test('source recovery fits whole pose and reports internal changes while anchoring the root', () => {
  const a=vectors([[.2,0,0],[1,.2,0],[2,1,.4],[.3,-.7,.9]]);
  const matrix=new T.Matrix4().compose(new T.Vector3(3,7,-1),new T.Quaternion().setFromAxisAngle(new T.Vector3(1,2,3).normalize(),.87),new T.Vector3().setScalar(1.4));
  const b=a.map(p=>p.clone().applyMatrix4(matrix)),fit=fitSourceUnitPose(a,b);
  assert.ok(fit.maxError<1e-10);assert.ok(Math.abs(fit.scale-1.4)<1e-10);
  b[1].y+=.1;const edited=fitSourceUnitPose(a,b);
  assert.ok(edited.maxError>.01);assert.ok(a[0].clone().applyMatrix4(edited.matrix).distanceTo(b[0])<1e-10);
  assert.equal(fitSourceUnitPose(a,[b[0]]),null);
  b[0].x=NaN;assert.equal(fitSourceUnitPose(a,b),null);
  assert.equal(fitSourceUnitPose(vectors([[0,0,0],[0,0,0],[0,0,0]]),a.slice(0,3)),null);
});

function fixture(run) {
  const item=JSON.parse(fs.readFileSync('次枝资产/全植物次枝成品V1/香樟/香樟_短弯细梢_混合_成品V1.branchasset.json','utf8')).asset;
  const sources=item.sample.leaf_meshes.map(s=>({...s,geometry:k.deserializeGeometry(s.geometry)}));
  const settings=k.normalizeSettings({...item.sample.settings,leaf_density:0,max_triangles:8000000});
  const authoring=normalizeAuthoring({branch_shape:{branches:[
    {id:'ROOT',points:[[0,0,0],[0,0,4]],length:4,start_radius:.15,end_radius:.07},
    {id:'A',parent:'ROOT',attach:.5,points:[[0,0,2],[1,0,2.6],[2,0,2.8]],length:2,start_radius:.08,end_radius:.03}]},
    branch_library:[item],branch_instances:[{id:'IA',parent:'A',asset_id:item.id,linked:true,pinned_revision:item.revision,attach:.7,scale:1.3,variation:0,roll:27}],
    recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']},leaf_material:item.sample.authoring.leaf_material});
  const assets=[];
  const build=a=>{const asset=k.buildBranchAsset(settings,null,sources,0,normalizeAuthoring(JSON.parse(JSON.stringify(a))),{instanced:true,resolveSources:true});assets.push(asset);return asset;};
  try {run({item,sources,settings,authoring,build});}finally{assets.forEach(k.disposeBranchAsset);sources.forEach(s=>s.geometry.dispose());}
}

test('recover saved snapshots and old local bends into source instances without rewriting the original',()=>fixture(({authoring,build,sources,item})=>{
  const first=build(authoring);
  authoring.sculpt_layers.push(layer('COPY',captureBranchDuplicate(first,new Set(['A']),'COPY',sources)));
  const copied=build(authoring),unit=resolvePveExportPlan(copied).units.find(u=>u.variantRequired);
  authoring.sculpt_layers.push(layer('BEND',null,{[unit.root.stableId]:{parent:unit.parent.stableId,
    deltas:unit.root.points.map((_,i)=>[0,i*.001,0]),knot_deltas:unit.root.controlPoints.map((_,i)=>[0,i*.001,0])}}));
  const before=build(authoring),original=JSON.stringify(before.authoring),report=planUnitSourceRecovery(before,sources);
  assert.equal(report.summary.restore,1);assert.equal(report.summary.shapeResets,1);
  const repaired=recoverUnitSources(before,sources,report),after=build(repaired),plan=resolvePveExportPlan(after);
  assert.equal(JSON.stringify(before.authoring),original);
  assert.equal(plan.units.length,2);assert.ok(plan.units.every(u=>!u.variantRequired&&u.sourceAsset.id===item.id));
  assert.equal(after.masterPlacements.length,before.masterPlacements.length);
  for(const b of report.plan.structuralBranches)assert.deepEqual(plan.byStable.get(b.stableId).points.map(p=>p.toArray()),b.points.map(p=>p.toArray()));
  for(const u of report.plan.units)assert.ok(plan.units.find(v=>v.id===u.id).root.points[0].distanceTo(u.root.points[0])<1e-7);
  assert.equal(planUnitSourceRecovery(after,sources).summary.restore,0,'recovery is idempotent after serialization');
  assert.equal(verifyUnitSourceRecovery(report.plan,after).units.length,2);
}));

test('source-less old copies require one matching complete source; ambiguity never silently chooses',()=>fixture(({authoring,build,sources,item})=>{
  const copy=captureBranchDuplicate(build(authoring),new Set(['A']),'OLD',sources);
  for(const r of copy.records){r.sourceAssetId='';r.sourceInstanceId='';if(r.owner)r.owner='MISSING_OWNER';for(const p of [...r.leaves,...r.organs])p.metadata={};}
  authoring.sculpt_layers.push(layer('OLD',copy));
  const old=build(authoring),report=planUnitSourceRecovery(old,sources);
  assert.equal(report.summary.inferred,1);assert.equal(report.summary.unresolved,0);
  assert.ok(resolvePveExportPlan(build(recoverUnitSources(old,sources,report))).units.every(u=>!u.variantRequired));
  authoring.branch_library.push({...structuredClone(item),id:'OTHER_IDENTICAL',name:'same geometry'});
  const ambiguous=build(authoring),blocked=planUnitSourceRecovery(ambiguous,sources);
  assert.equal(blocked.summary.unresolved,1);assert.throws(()=>recoverUnitSources(ambiguous,sources,blocked),/无法确定来源/);
}));

test('structural Shift+D keeps installed models linked through copy, reattachment and copy of copy',()=>fixture(({authoring,build,sources,item})=>{
  const before=build(authoring),original=JSON.stringify(authoring);
  const copy=captureLinkedBranchDuplicate(before,new Set(['A']),'LINK',sources);
  assert.equal(JSON.stringify(authoring),original,'capturing a cancellable gesture cannot mutate authoring');
  assert.equal(copy.operation.records.length,1);assert.equal(copy.copies.length,1);assert.equal(copy.copies[0].asset_id,item.id);
  authoring.sculpt_layers.push(layer('LINK',copy.operation));authoring.branch_instances.push(...copy.copies);
  const copied=build(authoring);
  for(const p of before.masterPlacements){
    const actual=copied.masterPlacements.find(v=>v.stableId===copy.copies[0].id+p.stableId.slice('IA'.length));
    assert.ok(actual);assert.ok(actual.position.distanceTo(p.position)<1e-7);assert.equal(actual.source,p.source);
  }
  for(const b of before.masterBranches.filter(b=>b.instanceId)){
    const actual=copied.masterBranches.find(v=>v.stableId===copy.mapping.get(b.stableId));
    assert.ok(actual);for(let i=0;i<b.points.length;i++)assert.ok(actual.points[i].distanceTo(b.points[i])<1e-7);
  }
  const op=makeMountOperation(copied.masterBranches,copied.masterBranches.find(b=>b.stableId==='LINK_0'),{target_parent:'ROOT',attach:.8,azimuth:0,elevation:0},{azimuth:0,elevation:0});
  authoring.sculpt_layers.push(layer('MOVE',op));
  const moved=build(authoring),plan=resolvePveExportPlan(moved);
  assert.equal(plan.units.length,2);assert.ok(plan.units.every(u=>!u.variantRequired));
  assert.ok(plan.units[1].root.points[0].distanceTo(resolvePveExportPlan(copied).units[1].root.points[0])>.1);
  assert.equal(moved.masterPlacements.length,before.masterPlacements.length*2);
  const repeated=captureLinkedBranchDuplicate(moved,new Set(['LINK_0']),'AGAIN',sources);
  authoring.sculpt_layers.push(layer('AGAIN',repeated.operation));authoring.branch_instances.push(...repeated.copies);
  const final=resolvePveExportPlan(build(authoring));
  assert.equal(final.units.length,3);assert.ok(final.units.every(u=>!u.variantRequired&&u.sourceAsset.id===item.id));
}));
