import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildBranchAsset, DEFAULT_SETTINGS, disposeBranchAsset, deserializeGeometry, createDefaultLeafGeometry, serializeGeometry } from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { normalizeBranchShape } from '../web/branch-workbench-data.js';
import { applyAssemblyScale } from '../web/assembly-scale.js';

const allocated = [], geometries = [];
test.afterEach(() => { allocated.splice(0).forEach(disposeBranchAsset); geometries.splice(0).forEach(g => g.dispose()); });
const shape = normalizeBranchShape({ branches: [
  { id:'ROOT',parent:'',points:[[0,0,0],[0,0,1]],length:1,start_radius:.08,end_radius:.06 },
  { id:'LIMB',parent:'ROOT',attach:.8,points:[[0,0,.8],[1,0,1]],length:1.02,start_radius:.04,end_radius:.03 },
  { id:'CARRIER',parent:'LIMB',attach:.8,points:[[.8,0,.96],[1.4,.5,1.2]],length:.82,start_radius:.02,end_radius:.015 },
] });

function loadFinished(species, role='混合') {
  const folder = new URL(`../次枝资产/全植物次枝成品V1/${species}/`, import.meta.url);
  const name=fs.readdirSync(folder).find(n=>n.includes('短弯细梢')&&n.includes(role)&&n.endsWith('.branchasset.json'));
  return JSON.parse(fs.readFileSync(new URL(name,folder),'utf8')).asset;
}
function render(library, {settings={},instances=null,sources=null,authoring={}}={}) {
  const input=sources||[...new Map(library.flatMap(a=>a.sample.leaf_meshes).map(u=>[u.id,u])).values()];
  const leaves=input.map(u=>{ const geometry=deserializeGeometry(u.geometry);geometries.push(geometry);return {...u,geometry}; });
  const state=normalizeAuthoring({branch_shape:shape,branch_library:library,
    recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY','REAL_TREE_LEAVES']},
    profiles:{leaf_scale:[4,4,4],leaf_density:[0,0,0]},
    branch_instances:instances||library.map((a,i)=>({id:'I'+i,parent:'CARRIER',attach:.35+i*.2,asset_id:a.id,linked:true,scale:1,variation:0,angle:25,azimuth:i*60,seed:42})),
    ...authoring},42);
  const built=buildBranchAsset({...DEFAULT_SETTINGS,seed:42,branch_levels:4,leaf_density:0,leaf_scale:1,leaf_aspect:1,petiole_length:0,
    max_leaves:2000,max_triangles:2000000,collision_avoidance:false,...settings},null,leaves,0,state);
  allocated.push(built);return built;
}
const signature = a => a.placements.map(p=>[p.stableId,p.branchStableId,p.source,p.scale,p.branchT]);

test('finished Celtis foliage uses sample density and physical leaf scale instead of whole-tree defaults',()=>{
  const asset=loadFinished('朴树');
  const sparse=render([asset],{settings:{leaf_density:0,leaf_scale:.01}});
  const dense=render([asset],{settings:{leaf_density:120,leaf_scale:2}});
  assert.ok(sparse.placements.length>0,'sample foliage survives zero global density');
  assert.deepEqual(signature(sparse),signature(dense));
  assert.ok(sparse.placements.every(p=>p.branchStableId.startsWith('I0.')),'native backbone carries no duplicate leaves');
  assert.ok(sparse.placements.every(p=>p.scale<.14&&p.scale>.06),'uses calibrated sample .1 metre basis');
  const larger=render([asset],{instances:[{id:'I0',parent:'CARRIER',asset_id:asset.id,linked:true,attach:.35,scale:2,variation:0,seed:42}]});
  const mean=a=>a.placements.reduce((s,p)=>s+p.scale,0)/a.placements.length;
  assert.ok(Math.abs(mean(larger)/mean(sparse)-2)<1e-10,'whole sample scaling doubles leaf size');
  assert.equal(larger.placements.length,sparse.placements.length,'scaling never reseeds or adds leaves');
});

test('finished Ginkgo manual leaves retain local parents and explicit sources after global source reorder',()=>{
  const asset=loadFinished('银杏');
  const sources=[...asset.sample.leaf_meshes].reverse();
  const built=render([asset],{sources});
  const manual=asset.sample.authoring.leaf_edits.added;
  assert.ok(manual.length>0,'fixture contains authored spur leaves');
  assert.equal(built.placements.length,manual.length);
  for(const m of manual){
    const p=built.placements.find(p=>p.stableId==='I0.'+m.id);
    assert.ok(p,`manual leaf ${m.id} remains present`);
    assert.equal(p.branchStableId,'I0.'+m.parent);
    assert.equal(sources[p.source].id,asset.sample.leaf_meshes[m.source].id);
    assert.equal(built.masterBranches.find(b=>b.id===p.branchId).stableId,p.branchStableId);
  }
});

function weightedSamples() {
  const geometry=createDefaultLeafGeometry(.5),serial=serializeGeometry(geometry);geometry.dispose();
  const shoot=normalizeBranchShape({branches:[
    {id:'R',parent:'',points:[[0,0,0],[1,0,0]],length:1,start_radius:.006,end_radius:.003},
    {id:'B',parent:'R',attach:.6,points:[[.6,0,0],[1.6,.2,.1]],length:1,start_radius:.003,end_radius:.0015},
  ]});
  return ['MIXED','YOUNG'].map((role,i)=>({id:'WEIGHT_'+role,revision:1,shape:shoot,leaf_source_ids:['ADULT','YOUNG'],sample:{
    settings:{...DEFAULT_SETTINGS,seed:77,leaf_density:90,leaf_scale:.1,leaf_scale_variation:0,leaf_aspect:1,
      collision_avoidance:false,leaf_min_spacing:0,leaf_zone_start:0,max_leaves:400,foliage_mode:'SINGLE',tip_cluster:0},
    authoring:normalizeAuthoring({branch_shape:shoot,recipe:{tags:['REAL_TREE_LEAVES']},
      foliage_range:{start:0,end:1},profiles:{leaf_scale:[1,1,1],leaf_density:[1,1,1]},
      attachment_layers:[{id:'LEAVES',type:'LEAF',enabled:true,order_min:1,order_max:1,start:0,end:1,density:1,scale:1}]},77),
    leaf_meshes:['ADULT','YOUNG'].map((id,j)=>({id,name:id,geometry:serial,weight:i===j?10:.01,orderMin:1,orderMax:1,season:'ANY',calibration:{scale:1}})),
  }}));
}

test('assembly factors scale the complete sample including every leaf without changing counts',()=>{
  const library=weightedSamples();
  const state=normalizeAuthoring({branch_instances:[{id:'I0',parent:'CARRIER',asset_id:library[0].id,linked:true,scale:1.4,variation:0,seed:42}]});
  const before=render(library,{instances:state.branch_instances});
  applyAssemblyScale(state,{overall:2,cards:{[library[0].id]:5}});
  const after=render(library,{instances:state.branch_instances,authoring:{workbench:state.workbench}});
  const root=a=>a.masterBranches.find(b=>b.stableId==='I0.R');
  assert.ok(Math.abs(root(after).length/root(before).length-10)<1e-10);
  assert.ok(Math.abs(root(after).startRadius/root(before).startRadius-10)<1e-10);
  assert.ok(after.placements.length>0);
  const mean=a=>a.placements.reduce((sum,p)=>sum+p.scale,0)/a.placements.length;
  const ratio=mean(after)/mean(before);
  assert.ok(Math.abs(ratio-10)<1e-10,`leaf size follows the whole sample (ratio ${ratio})`);
  assert.equal(after.placements.length,before.placements.length);
  assert.deepEqual(after.placements.map(p=>p.stableId),before.placements.map(p=>p.stableId));
});

test('sample local order and shared-ID weights survive attachment to a globally third-order carrier',()=>{
  const library=weightedSamples();
  const leaves=library[0].sample.leaf_meshes;
  const a=render(library,{sources:leaves.map((u,i)=>({...u,weight:i?1000:.001}))});
  const b=render(library,{sources:leaves.map((u,i)=>({...u,weight:i?.001:1000}))});
  assert.deepEqual(signature(a),signature(b),'merged global weights must not replace each card recipe');
  for(const i of [0,1]){
    const placements=a.placements.filter(p=>p.branchStableId.startsWith('I'+i+'.'));
    assert.ok(placements.length>30,'sample local order 1 remains eligible despite global order 3');
    assert.ok(placements.every(p=>p.branchStableId==='I'+i+'.B'),'local order filter excludes sample root');
    assert.ok(placements.filter(p=>p.source===i).length/placements.length>.95,'each card uses its own weights');
    assert.ok(placements.every(p=>a.masterBranches.find(b=>b.id===p.branchId).order===3));
  }
});

test('instance placement remains linked to its real global branch and deterministic across regeneration',()=>{
  const library=weightedSamples();
  const a=render(library),b=render(library);
  assert.deepEqual(signature(a),signature(b));
  const branchIds=new Set(a.masterBranches.map(b=>b.id));
  assert.ok(a.placements.every(p=>branchIds.has(p.branchId)));
  assert.equal(new Set(a.placements.map(p=>p.stableId)).size,a.placements.length);
});
