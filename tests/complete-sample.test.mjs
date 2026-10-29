import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { buildBranchAsset, buildBranchAssetAsync, disposeBranchAsset, disposeBranchAssetAsync, deserializeGeometry, DEFAULT_SETTINGS, normalizeSettings, createProjectDocument } from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { applyAssemblyScale, restoreSampleThickness } from '../web/assembly-scale.js';
import { createPVESkeleton, validatePVESkeleton } from '../web/pve-skeleton-export.js';
import { createGlbExportScene } from '../web/glb-export.js';
import { canCompileSamples } from '../web/complete-sample-assembly.js';
import { skeletonThicknessState } from '../web/skeleton-thickness.js';
import { branchRadiusAt } from '../web/branch-shaping.js';
import {compiledSamples,compiledSampleCacheStats,sealCompiledSampleMaterials} from '../web/compiled-sample-cache.js';

const folder=new URL('../次枝资产/全植物次枝成品V1/朴树/',import.meta.url);
const filename=fs.readdirSync(folder).find(n=>n.includes('短弯细梢')&&n.includes('混合')&&n.endsWith('.branchasset.json'));
const source=JSON.parse(fs.readFileSync(new URL(filename,folder),'utf8')).asset;
const assets=[],geometries=[];
test.afterEach(()=>{assets.splice(0).forEach(disposeBranchAsset);geometries.splice(0).forEach(g=>g.dispose());});
function fixture(count=12){
 const leaves=source.sample.leaf_meshes.map(s=>{const geometry=deserializeGeometry(s.geometry);geometries.push(geometry);return {...s,geometry};});
 const settings=normalizeSettings({...DEFAULT_SETTINGS,preview_lod:0,petiole_length:0,leaf_density:0,max_triangles:8000000,collision_avoidance:false});
 const authoring=normalizeAuthoring({branch_shape:{branches:[{id:'ROOT',parent:'',points:[[0,0,0],[0,0,3]],length:3,start_radius:.3,end_radius:.25}]},
  branch_library:[source],branch_instances:Array.from({length:count},(_,n)=>({id:'I'+n,asset_id:source.id,linked:true,parent:'ROOT',attach:.2+n/count*.6,scale:.5+n*.01,angle:60,azimuth:n*37,seed:42,variation:0})),
  recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY','REAL_TREE_LEAVES']},
  tree_organs:{...source.sample.authoring.tree_organs,mode:'LEAVES'}},42);
 const build=(instanced=true,a=authoring)=>{const asset=buildBranchAsset(settings,null,leaves,0,a,{instanced});assets.push(asset);return asset;};
 return {authoring,settings,leaves,build};
}
const signature=a=>({branches:a.masterBranches.map(b=>[b.stableId,b.parentId,b.points.map(v=>v.toArray()),b.startRadius]),leaves:a.placements.map(p=>[p.stableId,p.source,p.position.toArray(),p.scale]),organs:a.treeOrgans.map(p=>[p.stableId,p.source,p.position.toArray(),p.scale])});

test('installed complete samples recover their source rendering without a whole-tree template tag',()=>{
 const f=fixture(3),raw=structuredClone(f.authoring);raw.recipe.tags=['WHOLE_PLANT','FOLIAGE_ON_INSTANCES_ONLY'];
 // Imported carriers intentionally have no independent foliage at all.
 f.settings.max_leaves=0;f.authoring.recipe.tags.push('WHOLE_PLANT');const before=JSON.stringify(raw),a=normalizeAuthoring(raw);
 assert(a.recipe.tags.includes('SAMPLE_FOLIAGE_FROM_LIBRARY'));assert(canCompileSamples(a));
 const recovered=f.build(true,a),expected=f.build();
 assert(recovered.placements.length>0);assert.deepEqual(signature(recovered),signature(expected));
 assert.deepEqual(createPVESkeleton(recovered,f.leaves),createPVESkeleton(expected,f.leaves));
 assert.equal(JSON.stringify(raw),before);assert.deepEqual(a.branch_library,f.authoring.branch_library);
 const doc=createProjectDocument(recovered,f.leaves),cold=normalizeAuthoring(JSON.parse(JSON.stringify(doc)).authoring);
 assert.deepEqual(signature(f.build(true,cold)),signature(recovered));
});

test('complete-source recovery respects pinned versions, independent instances and explicit seeded layouts',()=>{
 const f=fixture(1),raw=structuredClone(f.authoring),item=raw.branch_library[0];
 raw.recipe.tags=[];item.revision=2;item.versions=[{revision:1,shape:item.shape,sample:item.sample}];item.sample=null;
 raw.branch_instances[0].pinned_revision=1;raw.branch_instances[0].linked=false;raw.branch_instances[0].shape=item.shape;
 const a=normalizeAuthoring(raw);assert(canCompileSamples(a));assert(f.build(true,a).placements.length>0);
 raw.workbench={sample_layout:'INSTANCE_SEEDED'};const seeded=normalizeAuthoring(raw);
 assert.equal(seeded.workbench.sample_layout,'INSTANCE_SEEDED');assert(!canCompileSamples(seeded));
 const explicit=structuredClone(seeded);explicit.recipe.tags=['SAMPLE_FOLIAGE_FROM_LIBRARY'];
 assert.deepEqual(signature(f.build(false,seeded)),signature(f.build(false,explicit)));
});

test('source mode is inferred only from installed full samples and remains stable at the tag limit',()=>{
 const f=fixture(1),raw=structuredClone(f.authoring);raw.recipe.tags=[];raw.branch_instances=[];
 assert(!normalizeAuthoring(raw).recipe.tags.includes('SAMPLE_FOLIAGE_FROM_LIBRARY'));
 raw.branch_instances=f.authoring.branch_instances;raw.branch_library=raw.branch_library.map(item=>({...item,sample:null}));
 assert(!normalizeAuthoring(raw).recipe.tags.includes('SAMPLE_FOLIAGE_FROM_LIBRARY'));
 raw.branch_library=f.authoring.branch_library;raw.recipe.tags=Array.from({length:16},(_,n)=>'TAG_'+n);
 const a=normalizeAuthoring(raw);assert(a.recipe.tags.includes('SAMPLE_FOLIAGE_FROM_LIBRARY'));
 assert.deepEqual(normalizeAuthoring(a).recipe.tags,a.recipe.tags);
});

test('exact prototype reuse survives retirement of the first palette owner and matches a cold build',()=>{
 const f=fixture(3),root=source.shape.branches[0].id;for(const id of ['I0','I1','I2'])f.authoring.overrides[id+'.'+root]={leaf_density:1};
 const old=f.build(),records=compiledSamples(old).records,first=[...records.values()][0],other=[...records.values()][1],palette=first.palette;
 assert.equal(other.palette,palette);const g=other.meshes[0].geometry;let geometryReleased=0,paletteReleased=0;g.addEventListener('dispose',()=>geometryReleased++);palette.materials.bark.addEventListener('dispose',()=>paletteReleased++);
 const next=normalizeAuthoring(f.authoring);next.overrides['I0.'+root].leaf_density=.25;
 const reuse=buildBranchAsset(f.settings,null,f.leaves,0,next,{instanced:true,reuseSamplesFrom:old});assets.push(reuse);assert.deepEqual(compiledSampleCacheStats(reuse),{built:1,reused:2});
 const cold=f.build(true,next);assert.deepEqual(signature(reuse),signature(cold));assert.deepEqual(createPVESkeleton(reuse,f.leaves),createPVESkeleton(cold,f.leaves));
 disposeBranchAsset(old);assets.splice(assets.indexOf(old),1);assert.equal(geometryReleased,0);assert.equal(paletteReleased,0,'retiring the first prototype cannot release a borrowed palette');
 assert.deepEqual(signature(reuse),signature(cold));disposeBranchAsset(reuse);assets.splice(assets.indexOf(reuse),1);assert.equal(geometryReleased,1);assert.equal(paletteReleased,1);
});

test('changed source geometry, rendered geometry or material cannot enter an exact cached prototype',()=>{
 for(const mutate of [a=>{const m=[...compiledSamples(a).records.values()][0].meshes[0];m.geometry.attributes.position.needsUpdate=true;},a=>{[...compiledSamples(a).records.values()][0].palette.materials.bark.color.set('#aa3344');},()=>{f.leaves[0].geometry.attributes.position.needsUpdate=true;}]){
  var f=fixture(2);const old=f.build();mutate(old);const next=buildBranchAsset(f.settings,null,f.leaves,0,f.authoring,{instanced:true,reuseSamplesFrom:old});assets.push(next);assert.equal(compiledSampleCacheStats(next).reused,0);
  assert.deepEqual(signature(next),signature(f.build()));
 }
});

test('cancel after retaining prototypes leaves the displayed geometry and palette alive',async()=>{
 const f=fixture(3),old=f.build(),p=[...compiledSamples(old).records.values()][0],g=p.meshes[0].geometry;let released=0,abort=false;g.addEventListener('dispose',()=>released++);
 await assert.rejects(buildBranchAssetAsync(f.settings,null,f.leaves,0,f.authoring,{instanced:true,reuseSamplesFrom:old},{budgetMs:0,onSlice:({stage})=>{if(stage==='unit-prototypes')abort=true;},shouldAbort:()=>abort,yieldControl:async()=>{}}),{name:'AbortError'});
 assert.equal(released,0);assert.equal(p.refs,1);assert.deepEqual(signature(old),signature(f.build()));
});

test('an asynchronously loaded declared atlas stays reusable while a different image invalidates it',()=>{
 const f=fixture(2),old=f.build(),p=[...compiledSamples(old).records.values()][0],material=p.materials.find(m=>m.sampleLeafMaterial);
 assert.ok(material);const url='data:image/png;base64,exact-declared-atlas',texture=new THREE.Texture();
 material.sampleLeafMaterial={...material.sampleLeafMaterial,color:url};material.map=texture;sealCompiledSampleMaterials(old);
 texture.image={src:url,width:16,height:16};texture.needsUpdate=true;
 const reuse=buildBranchAsset(f.settings,null,f.leaves,0,f.authoring,{instanced:true,reuseSamplesFrom:old});assets.push(reuse);
 assert.equal(compiledSampleCacheStats(reuse).reused,1);
 texture.image.src='data:image/png;base64,different-atlas';texture.needsUpdate=true;
 const changed=buildBranchAsset(f.settings,null,f.leaves,0,f.authoring,{instanced:true,reuseSamplesFrom:reuse});assets.push(changed);
 assert.equal(compiledSampleCacheStats(changed).reused,0);
});

test('materializing a borrowed assembly preserves its displayed owner and export buffers',()=>{
 const f=fixture(3),old=f.build(),before=signature(old),p=[...compiledSamples(old).records.values()][0],g=p.meshes[0].geometry;let released=0;g.addEventListener('dispose',()=>released++);
 const next=buildBranchAsset(f.settings,null,f.leaves,0,f.authoring,{instanced:true,reuseSamplesFrom:old});assets.push(next);
 assert.equal(compiledSampleCacheStats(next).reused,1);next.materialize();assert.equal(released,0);assert.deepEqual(signature(old),before);
 const output=createGlbExportScene(next.group,{singleMesh:true});try{assert.equal(output.scene.children[0].geometry.index.count/3,next.report.triangles);}finally{output.dispose();}
 disposeBranchAsset(next);assets.splice(assets.indexOf(next),1);assert.equal(released,0);assert.deepEqual(signature(old),before);
 disposeBranchAsset(old);assets.splice(assets.indexOf(old),1);assert.equal(released,1);
});

test('cooperative full-tree construction preserves the exact synchronous geometry, report, PVE and authoring',async()=>{
 const f=fixture(4);f.authoring.branch_instances[1].parent='I0.'+source.shape.branches[0].id;
 f.authoring.overrides['I2.'+source.shape.branches[0].id]={leaf_density:.6};
 const original=JSON.stringify(f.authoring),sync=f.build(),stages=new Set();let yields=0;
 const asset=await buildBranchAssetAsync(f.settings,null,f.leaves,0,f.authoring,{instanced:true},{budgetMs:0,yieldControl:async()=>{yields++;},onSlice:({stage})=>stages.add(stage)});assets.push(asset);
 assert(yields>10&&stages.has('unit-prototypes')&&stages.has('instance-batches')&&stages.has('geometry-quality'));
 assert.deepEqual(signature(asset),signature(sync));assert.deepEqual(asset.elements,sync.elements);assert.deepEqual(asset.report,sync.report);
 const payload=a=>{const result=[];a.group.traverse(m=>{if(m.isMesh)result.push([m.name,m.matrixWorld.elements,m.geometry.index?.array,Object.fromEntries(Object.entries(m.geometry.attributes).map(([k,v])=>[k,v.array])),m.instanceMatrix?.array]);});return result;};
 assert.deepEqual(payload(asset),payload(sync));assert.deepEqual(createPVESkeleton(asset,f.leaves),createPVESkeleton(sync,f.leaves));assert.equal(JSON.stringify(f.authoring),original);
});

for(const stage of ['structural-meshes','unit-prototypes','instance-batches','geometry-quality'])test('superseded cooperative build releases unpublished '+stage+' resources',async()=>{
 const f=fixture(3),original=JSON.stringify(f.authoring),added=new Set(),disposed=new Set(),add=THREE.Group.prototype.add,dispose=THREE.BufferGeometry.prototype.dispose;let abort=false;
 THREE.Group.prototype.add=function(...objects){for(const o of objects)if(o.isMesh)added.add(o.geometry);return add.apply(this,objects);};
 THREE.BufferGeometry.prototype.dispose=function(){disposed.add(this);return dispose.call(this);};
 try{await assert.rejects(buildBranchAssetAsync(f.settings,null,f.leaves,0,f.authoring,{instanced:true},{budgetMs:0,shouldAbort:()=>abort,yieldControl:async()=>{},onSlice:s=>{if(s.stage===stage)abort=true;}}),{name:'AbortError'});}
 finally{THREE.Group.prototype.add=add;THREE.BufferGeometry.prototype.dispose=dispose;}
 assert(added.size>0);assert([...added].every(g=>disposed.has(g)),'every unpublished mesh geometry is released');assert.equal(JSON.stringify(f.authoring),original);
});

test('cooperative disposal drains all objects even when its scheduler rejects; geometry tables are released first',async()=>{
 const f=fixture(3),asset=f.build(),batches=[],disposed=new Set();asset.group.traverse(m=>{if(m.isInstancedMesh)batches.push(m);});
 const geometries=new Set(batches.map(m=>m.geometry));for(const g of geometries)g.addEventListener('dispose',()=>disposed.add(g));
 let objects=0;for(const m of batches)m.addEventListener('dispose',()=>{assert.equal(disposed.size,geometries.size);objects++;});
 await assert.rejects(disposeBranchAssetAsync(asset,{budgetMs:0,yieldControl:async()=>{throw Error('scheduler failed');},shouldAbort:()=>true}),/scheduler failed/);
 assert.equal(objects,batches.length);assets.splice(assets.indexOf(asset),1);
});

test('preview bindings follow each real compiled batch and expire when it is materialized',()=>{
 const f=fixture(3),asset=f.build(),batches=[];asset.group.traverse(m=>{if(m.isInstancedMesh)batches.push(m);});
 assert.ok(batches.length>1);
 const validate=()=>{for(const mesh of batches){const binding=asset.editPreviewBindings(mesh);assert.equal(binding.instances.length,mesh.count);for(const [n,d]of binding.instances.entries()){
   assert.equal(d.id,asset.authoring.branch_instances[n].id);assert.equal(d.radius,asset.authoring.branch_instances[n].radius_scale);
   for(const branch of d.branches){const actual=asset.masterBranches.find(b=>b.id===d.branchIds.get(branch.id));assert.equal(actual.stableId,d.id+'.'+branch.stableId);}
 }}};
 validate();const next=normalizeAuthoring(f.authoring);next.branch_instances[1].scale*=1.1;assert.equal(asset.updateAssemblyTransforms(f.settings,next),true);validate();
 const document=JSON.stringify(asset.authoring);asset.materialize();assert.equal(JSON.stringify(asset.authoring),document);
 for(const mesh of batches)assert.equal(asset.editPreviewBindings(mesh).instances,undefined,'retired GPU batches cannot retain live instance descriptors');
});

test('complete placements reuse prototypes through rotation, scale, reattachment and undo with cold-build/PVE equivalence',async()=>{
 const {rotateInstance,applyInstanceFamilyPlacement,moveInstanceToCarrier}=await import('../web/branch-instance-operations.js');
 const {createMeshPreview,createSculptSnapshot}=await import('../web/tree-sculpt.js');
 const f=fixture(4);f.authoring.branch_shape.branches.push({...structuredClone(f.authoring.branch_shape.branches[0]),id:'OTHER',parent:'ROOT',attach:.5,points:[[0,0,1.5],[1,.2,3]]});
 const asset=f.build(),original=signature(asset),objects=[];asset.group.traverse(mesh=>{if(mesh.isMesh)objects.push([mesh,mesh.geometry,mesh.material]);});
 const sourceBefore=JSON.stringify(f.authoring.branch_library);let releases=0;
 for(const mode of ['ROTATE','SCALE','REATTACH']){
  const next=normalizeAuthoring(asset.authoring),before=structuredClone(next.branch_instances[1]);
  const shape=next.branch_library[0].shape,parent=asset.masterBranches.find(b=>b.stableId===before.parent);
  let after=rotateInstance(before,parent,f.settings,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(.3,.6,.4).normalize(),.25),shape);
  if(mode==='SCALE')after.scale*=1.2;
  if(mode==='REATTACH')after=moveInstanceToCarrier(before,asset.masterBranches.find(b=>b.stableId==='OTHER'),parent,f.settings,.65,shape);
  applyInstanceFamilyPlacement(next,before,after,shape,asset.masterBranches,f.settings);
  const preview=createMeshPreview(asset,createSculptSnapshot(asset.masterBranches),{gpu:true,rigid:true});
  assert.equal(asset.updateAssemblyTransforms(f.settings,next,{beforeCommit:()=>{releases++;preview.restore();}}),true);
  const cold=f.build(true,normalizeAuthoring(JSON.parse(JSON.stringify(next))));
  assert.deepEqual(signature(asset),signature(cold));assert.deepEqual(asset.elements,cold.elements);
  assert.deepEqual(createPVESkeleton(asset,f.leaves),createPVESkeleton(cold,f.leaves));
  for(const [mesh,geometry,material]of objects){assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);}
  assert.equal(JSON.stringify(next.branch_library),sourceBefore);assert.equal(asset.report.compiled_samples,1);
 }
 assert.equal(releases,3);assert.equal(asset.updateAssemblyTransforms(f.settings,normalizeAuthoring(f.authoring)),true);
 assert.deepEqual(signature(asset),original);
});

test('placement reuse rejects source, internal thickness, topology and new nested parents before releasing preview',()=>{
 const f=fixture(2),asset=f.build(),original=signature(asset),objects=[];asset.group.traverse(mesh=>{if(mesh.isMesh)objects.push(mesh.geometry);});
 const edits=[a=>a.branch_instances[0].radius_scale*=1.2,a=>a.branch_instances[0].seed++,a=>a.branch_instances[0].variation=.3,
  a=>a.branch_instances[0].parent='I1.'+source.shape.branches[0].id,a=>a.branch_instances[0].asset_id='MISSING',
  a=>a.branch_library[0].revision++,a=>a.branch_instances.reverse(),a=>a.overrides['I0.'+source.shape.branches[0].id]={leaf_density:2},
  a=>a.branch_shape.branches[0].points[1][0]=.4,a=>a.leaf_material.color='#bad'];
 for(const mutate of edits){const next=normalizeAuthoring(f.authoring);mutate(next);let released=false;
  assert.equal(asset.updateAssemblyTransforms(f.settings,next,{beforeCommit:()=>released=true}),false);
  assert.equal(released,false);assert.deepEqual(signature(asset),original);
  const current=[];asset.group.traverse(mesh=>{if(mesh.isMesh)current.push(mesh.geometry);});assert.deepEqual(current,objects);
 }
});

test('successive carrier brush strokes retain rigid sample shape, shared foliage, undo and cold PVE output',async()=>{
 const {createSculptSnapshot,advanceSculptSnapshot,deformTree,sculptOverrides}=await import('../web/tree-sculpt.js');
 const {rigidSculptInstances,sculptInstanceFrames}=await import('../web/sculpt-instance-follow.js');
 const {branchInstanceFrame}=await import('../web/branch-kernel.js');
 const f=fixture(5),asset=f.build(),original=signature(asset),buffers=[];
 asset.group.traverse(m=>{if(m.isInstancedMesh)buffers.push([m,m.geometry,m.material]);});
 for(let stroke=0;stroke<2;stroke++){
  const snapshot=createSculptSnapshot(asset.masterBranches,asset.authoring.overrides);
  const followers=rigidSculptInstances(asset.authoring);assert.equal(followers.size,5);
  const root=[...snapshot.values()].find(b=>b.stableId==='ROOT');
  const weights=new Map([[root.id,root.controlPoints.map((_,i)=>i?1:0)]]);
  let working=snapshot,updated;
  for(let step=0;step<4;step++){
   updated=deformTree(working,weights,new THREE.Vector3(.03,-.02,.005),'COMB',{strength:1,worldRadius:1,rigidUnitFollowers:followers});
   working=advanceSculptSnapshot(working,updated);
  }
  const overrides=sculptOverrides(snapshot,updated,asset.authoring.overrides);
  const frames=sculptInstanceFrames(asset,snapshot,updated,overrides,branchInstanceFrame);
  assert.equal(frames.size,5);assert.deepEqual(Object.keys(overrides),['ROOT']);
  const a=normalizeAuthoring({...asset.authoring,overrides:{...asset.authoring.overrides,...overrides},
   curve_editor:{...asset.authoring.curve_editor,affect_children:true},branch_instances:asset.authoring.branch_instances.map(i=>frames.get(i.id)||i)});
  const beforeLeaves=asset.placements.map(p=>({...p,position:p.position.clone()}));
  assert.equal(asset.updateSupportingBranches(f.settings,a),true);
  assert.equal(asset.report.compiled_samples,1);
  for(const b of asset.masterBranches){const expected=updated.get(b.id);b.points.forEach((p,n)=>assert.ok(p.distanceTo(expected.points[n])<1e-8,b.stableId));}
  for(const [n,p] of asset.placements.entries()){
   const branch=[...snapshot.values()].find(b=>b.stableId===p.branchStableId);
   const matrix=updated.get(branch.id).sculptFollowMatrix;
   assert.ok(p.position.distanceTo(beforeLeaves[n].position.applyMatrix4(matrix))<1e-8,'leaf keeps its sample attachment');
   assert.ok(Math.abs(p.scale-beforeLeaves[n].scale)<1e-12,'rigid motion preserves leaf size');
  }
  for(const [m,g,material] of buffers){assert.equal(m.geometry,g);assert.equal(m.material,material);}
  const cold=f.build(true,normalizeAuthoring(JSON.parse(JSON.stringify(a))));
  assert.deepEqual(signature(asset),signature(cold));
  assert.deepEqual(createPVESkeleton(asset,f.leaves),createPVESkeleton(cold,f.leaves));
  const expanded=f.build(false,a);assert.deepEqual(signature(asset),signature(expanded));
 }
 const edited=signature(asset);
 assert.equal(asset.updateSupportingBranches(f.settings,normalizeAuthoring(f.authoring)),true);assert.deepEqual(signature(asset),original);
 assert.ok(edited.branches.some((b,n)=>JSON.stringify(b)!==JSON.stringify(original.branches[n])));
});

test('direct sample deformation, pinned units and layered editing preserve the existing curve fallback',async()=>{
 const {createSculptSnapshot,deformTree,sculptOverrides}=await import('../web/tree-sculpt.js');
 const {rigidSculptInstances,sculptInstanceFrames}=await import('../web/sculpt-instance-follow.js');
 const {branchInstanceFrame}=await import('../web/branch-kernel.js');
 const f=fixture(2),asset=f.build(),snapshot=createSculptSnapshot(asset.masterBranches);
 const b=asset.masterBranches.find(b=>b.instanceId==='I0');
 const updated=deformTree(snapshot,new Map([[b.id,b.controlPoints.map((_,i)=>i?1:0)]]),new THREE.Vector3(.2,.1,0),'COMB',{rigidUnitFollowers:rigidSculptInstances(f.authoring)});
 const overrides=sculptOverrides(snapshot,updated);
 assert.equal(sculptInstanceFrames(asset,snapshot,updated,overrides,branchInstanceFrame).has('I0'),false);
 assert.ok(Object.keys(overrides).some(id=>id.startsWith('I0.')));
 const custom=normalizeAuthoring({...f.authoring,overrides:{[b.stableId]:{pinned_points:[1]}}});
 assert.equal(rigidSculptInstances(custom).has('I0'),false);
 const layered=normalizeAuthoring({...f.authoring,sculpt_layers:[{id:'OLD',enabled:true,strength:1,branches:{ROOT:{knots:[[0,0,0],[.1,0,0]]}}}]});
 assert.equal(rigidSculptInstances(layered).size,0);
 const a=normalizeAuthoring(f.authoring);a.branch_instances[0].attach=.9;
 assert.equal(asset.updateSupportingBranches(f.settings,a),false,'frame-only fast path cannot swallow a placement edit');
});

test('carrier commits reuse sample geometry and match complete rebuilds through rotate, scale, radius and undo',async()=>{
 const {makeMountRotationOperation}=await import('../web/branch-mount.js');
 const f=fixture(8);
 const root=f.authoring.branch_shape.branches[0];root.parent='TRUNK';root.attach=.5;
 f.authoring.branch_shape.branches.unshift({...structuredClone(root),id:'TRUNK',parent:'',points:[[0,0,-2],[0,0,0],[0,0,2],[0,0,4]]});
 // An unaffected unit on the trunk must retain its world metadata and buffer.
 f.authoring.branch_instances[0].parent='TRUNK';
 const asset=f.build(),original=signature(asset),objects=[];
 asset.group.traverse(m=>{if(m.isInstancedMesh)objects.push([m,m.geometry,m.material]);});
 const untouched=asset.masterBranches.find(b=>b.instanceId==='I0');
 const ops=[makeMountRotationOperation(asset.masterBranches,asset.masterBranches.find(b=>b.stableId==='ROOT'),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.4),{attach:.5,azimuth:0,elevation:0}),
  {type:'ROOT_SCALE',targets:['ROOT'],scale:[1.2,.8,1.1]},
  {type:'RADIUS',targets:['ROOT'],factor:1.4,point:0,excluded:[]}];
 let a=normalizeAuthoring(f.authoring),releases=0;
 for(const [n,operation] of ops.entries()){
  a=normalizeAuthoring({...a,sculpt_layers:[...a.sculpt_layers,{id:'EDIT'+n,name:'edit',enabled:true,strength:1,branches:{},operation}]});
  const {canUpdateSupports}=await import('../web/support-update.js');assert.equal(canUpdateSupports(asset.authoring,a,new Set(['TRUNK','ROOT'])),true,'document is eligible');
  assert.equal(asset.updateSupportingBranches(f.settings,a,{beforeCommit:()=>releases++}),true);
  const rebuilt=f.build(true,a);
  assert.deepEqual(signature(asset),signature(rebuilt));
  assert.deepEqual(asset.elements,rebuilt.elements);
  assert.deepEqual(createPVESkeleton(asset,f.leaves),createPVESkeleton(rebuilt,f.leaves));
  assert.equal(asset.masterBranches.find(b=>b.instanceId==='I0'),untouched,'unchanged unit metadata remains cached');
  assert.ok(asset.report.support_update.reused_samples>=1);
  for(const [mesh,geometry,material] of objects){assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);}
  const beforeBounds=new THREE.Box3().setFromObject(asset.group),afterBounds=new THREE.Box3().setFromObject(rebuilt.group);
  assert.ok(beforeBounds.min.distanceTo(afterBounds.min)<1e-5&&beforeBounds.max.distanceTo(afterBounds.max)<1e-5);
 }
 assert.equal(releases,3);
 assert.equal(asset.updateSupportingBranches(f.settings,normalizeAuthoring(f.authoring)),true);
 assert.deepEqual(signature(asset),original);
 const rebuilt=f.build(false,a);assert.equal(asset.updateSupportingBranches(f.settings,a),true);
 asset.materialize();assert.deepEqual(signature(asset),signature(rebuilt));
 const buffers=a=>{const list=[];a.group.traverse(m=>{if(m.isMesh)list.push([m.name,Array.from(m.geometry.attributes.position.array),Array.from(m.geometry.attributes.uv1?.array||[])]);});return list;};
 assert.deepEqual(buffers(asset),buffers(rebuilt),'materialized export uses updated carrier lookup and sample matrices');
});

test('rejected local carrier updates leave all meshes and the held preview untouched',()=>{
 const f=fixture(2),asset=f.build(),original=signature(asset),ids=[];
 asset.group.traverse(m=>{if(m.isMesh)ids.push(m.geometry.uuid);});
 const edits=[a=>a.branch_instances.push({...a.branch_instances[0],id:'NEW'}),a=>a.branch_library[0].revision++,
  a=>a.overrides['I0.'+source.shape.branches[0].id]={leaf_density:2},
  a=>a.branch_shape.branches.push({...a.branch_shape.branches[0],id:'EXTRA',parent:'ROOT'}),
  a=>a.leaf_material.color='#bad',a=>a.sculpt_layers.push({id:'LOCAL',enabled:true,strength:1,branches:{},operation:{type:'RADIUS',targets:['I0.'+source.shape.branches[0].id],factor:2}})];
 for(const mutate of edits){const a=normalizeAuthoring(f.authoring);mutate(a);let released=false;
  assert.equal(asset.updateSupportingBranches(f.settings,a,{beforeCommit:()=>released=true}),false);
  assert.equal(released,false);assert.deepEqual(signature(asset),original);
  const current=[];asset.group.traverse(m=>{if(m.isMesh)current.push(m.geometry.uuid);});assert.deepEqual(current,ids);
 }
});

test('local thickness update preserves sample size, radial geometry, picking and repeated scale updates',()=>{
 const f=fixture(3),asset=f.build(),original=signature(asset),a=normalizeAuthoring(f.authoring);
 const state=skeletonThicknessState();state.levels[0]={...state.levels[0],mode:'RADIUS_CURVE',scale:2,curve:[1,.9,.7,.4,.2]};
 a.workbench={...a.workbench,skeleton_thickness:state};
 assert.equal(asset.updateSupportingBranches(f.settings,a),true);
 assert.deepEqual(signature(asset),signature(f.build(true,a)));assert.deepEqual(signature(asset).leaves,original.leaves);
 assert.equal(asset.report.support_update.updated_samples,0);
 applyAssemblyScale(a,{cards:{[source.id]:2}});assert.equal(asset.updateAssemblyTransforms(f.settings,a),true);
 assert.deepEqual(signature(asset),signature(f.build(true,a)));
 const b=asset.masterBranches.find(b=>b.instanceId==='I0');assert.equal(asset.branchMesh(b.stableId).userData.stable_id,b.stableId);
});

test('point rotate, point scale and point slide local commits keep precise prefix and leaf frames',()=>{
 const f=fixture(5),root=f.authoring.branch_shape.branches[0];
 root.points=[[0,0,0],[.2,0,1],[.5,.1,2],[1,.2,3],[1.6,.2,4]];root.knots=structuredClone(root.points);
 const operations=[{type:'POINT_ROTATE',root:'ROOT',targets:['ROOT'],point:2,rotation:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.4).toArray()},
  {type:'POINT_SCALE',root:'ROOT',targets:['ROOT'],point:2,scale:[.8,.8,.8]},
  {type:'POINT_SLIDE',root:'ROOT',targets:['ROOT'],point:2,attach:.7}];
 for(const operation of operations){const asset=f.build(),a=normalizeAuthoring({...f.authoring,sculpt_layers:[{id:'POINT',enabled:true,strength:1,branches:{},operation}]}),rebuilt=f.build(true,a);
  assert.equal(asset.updateSupportingBranches(f.settings,a),true);assert.deepEqual(signature(asset),signature(rebuilt));
  assert.deepEqual(asset.masterPlacements,rebuilt.masterPlacements);assert.deepEqual(createPVESkeleton(asset,f.leaves),createPVESkeleton(rebuilt,f.leaves));
 }
});

test('held GPU preview is restored only after a compatible carrier replacement is ready',async()=>{
 const {createSculptSnapshot,createMeshPreview}=await import('../web/tree-sculpt.js');
 const f=fixture(4),asset=f.build(),a=normalizeAuthoring(f.authoring),mesh=asset.group.getObjectByName('枝段_B001_L0'),material=mesh.material;
 const preview=createMeshPreview(asset,createSculptSnapshot(asset.masterBranches),{gpu:true,targets:new Set(['ROOT']),rigidUnits:true});
 assert.equal(preview.stats.mode,'GPU');assert.notEqual(mesh.material,material,'GPU preview borrows a wrapped material');
 a.sculpt_layers.push({id:'S',enabled:true,strength:1,branches:{},operation:{type:'ROOT_SCALE',targets:['ROOT'],scale:[1,1,1.4]}});
 assert.equal(asset.updateSupportingBranches(f.settings,a,{beforeCommit:()=>preview.restore()}),true);
 assert.equal(mesh.material,material);assert.deepEqual(signature(asset),signature(f.build(true,a)));
});

test('ordinary edited trees without the sample-foliage recipe tag retain installed sample atlases',()=>{
 const f=fixture(2);f.settings.leaf_density=8;
 f.authoring.recipe.tags=f.authoring.recipe.tags.filter(t=>t!=='SAMPLE_FOLIAGE_FROM_LIBRARY');
 const asset=f.build(),leaves=[];asset.group.traverse(o=>{if(o.isMesh&&o.userData.category==='leaf')leaves.push(o);});
 assert.ok(leaves.length>0,'fixture contains visible installed leaves');
 for(const mesh of leaves)assert.ok(mesh.material.sampleLeafMaterial?.color===source.sample.authoring.leaf_material.color,'generic assembly must use the sample atlas, not the tree palette');
});

test('mixed sample flowers retain their atlas in compiled and ordinary trees',()=>{
 const flowerFile=new URL('../次枝资产/全植物次枝成品V1/红叶石楠/红叶石楠_短弯细梢_红嫩叶_成品V1.branchasset.json',import.meta.url);
 const flower=JSON.parse(fs.readFileSync(flowerFile,'utf8')).asset;
 const f=fixture(3);f.authoring.branch_library.push(flower);f.authoring.branch_instances[0].asset_id=flower.id;
 f.authoring.leaf_material=source.sample.authoring.leaf_material;
 f.authoring.tree_organs={...structuredClone(flower.sample.authoring.tree_organs),mode:'LEAVES'};
 for(const s of flower.sample.leaf_meshes){const geometry=deserializeGeometry(s.geometry);geometries.push(geometry);f.leaves.push({...s,geometry});}
 for(const ordinary of [false,true]){
  const a=structuredClone(f.authoring);if(ordinary){a.recipe.tags=a.recipe.tags.filter(t=>t!=='SAMPLE_FOLIAGE_FROM_LIBRARY');f.settings.leaf_density=8;}
  const asset=f.build(true,a),meshes=[];asset.group.traverse(o=>{if(o.isMesh&&o.userData.category==='tree_organ'&&flower.sample.authoring.tree_organs.units.some(u=>o.name.endsWith(u.name)))meshes.push(o);});
  assert.ok(meshes.length>0,'actual Photinia flowers are rendered');
  for(const mesh of meshes){assert.ok(mesh.material.sampleLeafMaterial?.color===flower.sample.authoring.leaf_material.color,`flower reads Photinia atlas, never host leaf atlas: ordinary=${ordinary}, name=${mesh.name}, atlas=${mesh.material.sampleLeafMaterial?.color_name}`);assert.notEqual(mesh.material,asset.materials.leaf);}
 }
});

test('skeleton editing skips complete samples and leaves while preserving document and restored geometry',()=>{
 const f=fixture(8),original=structuredClone(f.authoring),full=f.build(),before=signature(full);
 const preview=buildBranchAsset(f.settings,null,f.leaves,0,f.authoring,{skeletonOnly:true,instanced:true});assets.push(preview);
 assert.equal(preview.skeletonOnly,true);assert.equal(preview.masterBranches.length,1);
 assert.deepEqual(signature(preview).branches,before.branches.slice(0,1));
 assert.equal(preview.placements.length,0);assert.equal(preview.treeOrgans.length,0);assert.equal(preview.updateAssemblyTransforms,undefined);
 preview.group.traverse(o=>assert.ok(!o.isInstancedMesh));
 assert.deepEqual(f.authoring,original);assert.deepEqual(createProjectDocument(preview,f.leaves).authoring,original);
 assert.throws(()=>createPVESkeleton(preview,f.leaves),/返回整树预览/);
 assert.deepEqual(signature(f.build()),before);
 const changed=normalizeAuthoring(f.authoring),state=skeletonThicknessState();state.levels[0].scale=2;changed.workbench={...changed.workbench,skeleton_thickness:state};
 const edited=buildBranchAsset(f.settings,null,[],0,changed,{skeletonOnly:true});assets.push(edited);
 const restored=f.build(true,changed);
 assert.equal(edited.masterBranches[0].startRadius,restored.masterBranches[0].startRadius);
 assert.deepEqual(signature(restored).branches.slice(1),before.branches.slice(1));assert.deepEqual(signature(restored).leaves,before.leaves);
});

test('skeleton preview never reads sample meshes, even for detached and nested units',()=>{
 const f=fixture(2);f.authoring.branch_instances[0].parent='';f.authoring.branch_instances[1].parent='I0.'+source.shape.branches[0].id;
 const item={...source};Object.defineProperty(item,'sample',{enumerable:true,get(){throw Error('sample must stay suspended');}});
 const preview=buildBranchAsset(f.settings,null,[],0,{...f.authoring,branch_library:[item]},{skeletonOnly:true});assets.push(preview);
 assert.equal(preview.masterBranches.length,1);assert.equal(preview.placements.length,0);
});

test('skeleton curves change only carrier geometry and export radii, never completed units',()=>{
 const f=fixture(3),before=f.build(),old=signature(before),state=skeletonThicknessState();state.levels[0]={mode:'RADIUS_CURVE',scale:2,curve:[1,1,2,3,4]};
 const changed=normalizeAuthoring(f.authoring);changed.workbench={...changed.workbench,skeleton_thickness:state};
 assert.equal(before.updateAssemblyTransforms(f.settings,changed),false,'a skeleton edit must not take the matrix-only shortcut');
 const after=f.build(true,changed),data=signature(after),expanded=f.build(false,changed);
 assert.deepEqual(data.branches.slice(1),old.branches.slice(1));assert.deepEqual(data.leaves,old.leaves);assert.deepEqual(data.organs,old.organs);
 for(const t of [0,.25,.5,.75,1])assert.ok(Math.abs(branchRadiusAt(after.masterBranches[0],f.settings,t)/branchRadiusAt(before.masterBranches[0],f.settings,0)-2*state.levels[0].curve[t*4])<.001);
 const units=asset=>{const result=[];asset.group.traverse(o=>{if(o.isInstancedMesh)result.push({positions:Array.from(o.geometry.getAttribute('position').array),matrix:Array.from(o.instanceMatrix.array)});});return result;};
 assert.deepEqual(units(after),units(before));assert.deepEqual(data,signature(expanded));
 const pve=createPVESkeleton(after,f.leaves),oldPve=createPVESkeleton(before,f.leaves);
 assert.equal(validatePVESkeleton(pve).valid,true);assert.notDeepEqual(pve,oldPve);
 assert.deepEqual(signature(f.build(true,normalizeAuthoring(f.authoring))),old,'reset does not accumulate');
});

test('absolute base dimensions rebuild compiled carriers while preserving units and PVE agreement',()=>{
 const f=fixture(3),before=f.build(),changed=normalizeAuthoring(f.authoring);
 changed.workbench={skeleton_thickness:{levels:[{mode:'RADIUS_CURVE',scale:9,curve:[1,.8,.6,.4,.2],base:{mode:'UNIFORM',diameter_cm:8,variation:.15}}]}};
 assert.equal(before.updateAssemblyTransforms(f.settings,changed),false);
 const after=f.build(true,changed),expanded=f.build(false,changed);
 assert.deepEqual(signature(after).branches.slice(1),signature(before).branches.slice(1));assert.deepEqual(signature(after).leaves,signature(before).leaves);assert.deepEqual(signature(after).organs,signature(before).organs);
 const pve=createPVESkeleton(after,f.leaves);assert.equal(validatePVESkeleton(pve).valid,true);assert.deepEqual(pve,createPVESkeleton(expanded,f.leaves));
 assert.ok(Math.abs(branchRadiusAt(after.masterBranches[0],f.settings,0)-.04)<1e-12);assert.ok(Math.abs(branchRadiusAt(after.masterBranches[0],f.settings,1)-.008)<1e-12);
});

test('legacy graph path also protects all installed branches from skeleton rules',()=>{
 const f=fixture(2);f.authoring.topology.reparent={absent:'ROOT'};
 assert.equal(canCompileSamples(f.authoring),false);
 const before=f.build(),changed=normalizeAuthoring(f.authoring),state=skeletonThicknessState();state.levels.forEach(r=>{r.mode='RADIUS_CURVE';r.scale=2;r.curve=[1,2,3,4,5];});changed.workbench={skeleton_thickness:state};
 const after=f.build(true,changed),a=signature(after),b=signature(before);
 assert.deepEqual(a.branches.slice(1),b.branches.slice(1));assert.deepEqual(a.leaves,b.leaves);assert.deepEqual(a.organs,b.organs);
});

test('symmetry copies retain installed-unit protection even when their instanceId is cleared',()=>{
 const f=fixture(2);f.authoring.symmetry_groups=[{id:'MIRROR_UNITS',source:'ROOT',enabled:true,type:'MIRROR',axis:'Y',angle:0,count:2,seed:5,lengthVariation:0,angleVariation:0,bendVariation:0}];
 const before=f.build(),changed=normalizeAuthoring(f.authoring),state=skeletonThicknessState();state.levels.forEach(r=>{r.mode='RADIUS_CURVE';r.scale=3;});changed.workbench={skeleton_thickness:state};const after=f.build(true,changed);
 const units=asset=>asset.masterBranches.filter(b=>b.instanceId||b.symmetrySource?.startsWith('I')).map(b=>[b.stableId,b.startRadius,b.endRadius,b.radiusProfile]);
 assert.ok(before.masterBranches.some(b=>!b.instanceId&&b.symmetrySource?.startsWith('I')));
 assert.deepEqual(units(after),units(before));
});
function buffers(a){const set=new Set();a.group.traverse(o=>{if(o.geometry)set.add(o.geometry);});return [...set].reduce((sum,g)=>sum+Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0)+(g.index?.array.byteLength||0),0);}

test('GPU sample instances and expanded export have identical hierarchy, foliage, organs and bounds',()=>{
 const f=fixture(),gpu=f.build(),expanded=f.build(false);
 assert.ok(gpu.isInstancedAssembly);assert.equal(gpu.report.compiled_samples,1);
 assert.deepEqual(signature(gpu),signature(expanded));assert.equal(gpu.report.triangles,expanded.report.triangles);
 assert.deepEqual(createPVESkeleton(gpu,f.leaves),createPVESkeleton(expanded,f.leaves));
 assert.equal(validatePVESkeleton(createPVESkeleton(expanded,f.leaves)).valid,true);
 const a=new THREE.Box3().setFromObject(gpu.group),b=new THREE.Box3().setFromObject(expanded.group);
 assert.ok(a.min.distanceTo(b.min)<1e-5&&a.max.distanceTo(b.max)<1e-5);
 assert.ok(buffers(gpu)<buffers(expanded)/5,'geometry buffers are shared');
 assert.ok(gpu.report.objects<expanded.report.objects/3);
});

test('card scaling only updates matrices and retains every leaf and fruit at proportional size',()=>{
 const f=fixture(),gpu=f.build(),before=signature(gpu),geometryIds=[];
 assert.ok(gpu.treeOrgans.length>0,'real fixture includes flowers or fruit');
 gpu.group.traverse(o=>{if(o.geometry)geometryIds.push(o.geometry.uuid);});
 const changed=normalizeAuthoring(f.authoring);applyAssemblyScale(changed,{cards:{[source.id]:5}});
 assert.equal(gpu.updateAssemblyTransforms(f.settings,changed),true);
 assert.equal(gpu.placements.length,before.leaves.length);assert.equal(gpu.treeOrgans.length,before.organs.length);
 gpu.placements.forEach((p,n)=>assert.ok(Math.abs(p.scale/before.leaves[n][3]-5)<1e-10));
 gpu.treeOrgans.forEach((p,n)=>assert.ok(Math.abs(p.scale/before.organs[n][3]-5)<1e-10));
 const afterIds=[];gpu.group.traverse(o=>{if(o.geometry)afterIds.push(o.geometry.uuid);});assert.deepEqual(afterIds,geometryIds);
 assert.deepEqual(signature(gpu),signature(f.build(false,changed)));
 applyAssemblyScale(changed,{cards:{[source.id]:1}});assert.equal(gpu.updateAssemblyTransforms(f.settings,changed),true);assert.deepEqual(signature(gpu),before);
});

test('materializing for local editing produces writable geometry and valid global lookup references',()=>{
 const f=fixture(3),gpu=f.build(),before=signature(gpu);gpu.materialize();
 assert.equal(gpu.isInstancedAssembly,false);assert.deepEqual(signature(gpu),before);
 gpu.group.traverse(o=>{if(!o.isMesh)return;assert.ok(!o.isInstancedMesh);const uv=o.geometry.getAttribute('uv1');if(!uv)return;
  for(let n=0;n<uv.count;n++){const id=Math.floor(uv.getY(n)*gpu.lookupTexture.height)*gpu.lookupTexture.width+Math.floor(uv.getX(n)*gpu.lookupTexture.width);assert.ok(gpu.elements[id],`valid element ${id}`);}
 });
 assert.equal(gpu.updateAssemblyTransforms(f.settings,normalizeAuthoring(f.authoring)),false);
});

test('expanded complete samples merge into the existing single-mesh GLB export',()=>{
 const f=fixture(2),asset=f.build(false),output=createGlbExportScene(asset.group,{singleMesh:true});
 try{
  assert.equal(output.scene.children.length,1);const mesh=output.scene.children[0];assert.ok(mesh.isMesh);
  assert.equal(mesh.geometry.index.count/3,asset.report.triangles);
  assert.ok(mesh.geometry.hasAttribute('uv'));assert.ok(mesh.geometry.hasAttribute('_BRANCH_WIND'));
  assert.ok(!Object.keys(mesh.geometry.attributes).some(k=>k.startsWith('sample')));
 }finally{output.dispose();}
});

test('different installed thicknesses share one sample and agree with expanded vertex positions',()=>{
 const f=fixture(8);f.authoring.branch_instances.forEach((i,n)=>i.radius_scale=.5+n*.2);
 const gpu=f.build(),expanded=f.build(false);assert.equal(gpu.report.compiled_samples,1);
 assert.deepEqual(signature(gpu),signature(expanded));
 let batch;gpu.group.traverse(o=>{if(!batch&&o.isInstancedMesh&&o.geometry.hasAttribute('sampleCenter'))batch=o;});assert.ok(batch);
 const geometry=batch.geometry,position=geometry.getAttribute('position'),center=geometry.getAttribute('sampleCenter');
 const matrix=new THREE.Matrix4(),point=new THREE.Vector3();
 for(let n=0;n<8;n++){
  const stable='I'+n+'.'+source.shape.branches[0].id;let mesh;expanded.group.traverse(o=>{if(o.userData.stable_id===stable&&o.userData.category==='branch')mesh=o;});assert.ok(mesh);
  batch.getMatrixAt(n,matrix);const radius=geometry.getAttribute('sampleRadius').getX(n);
  for(let v=0;v<position.count;v++){
   point.fromBufferAttribute(position,v).sub(new THREE.Vector3().fromBufferAttribute(center,v)).multiplyScalar(radius).add(new THREE.Vector3().fromBufferAttribute(center,v)).applyMatrix4(matrix);
   assert.ok(point.distanceTo(new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),v))<1e-5);
  }
 }
});

test('restoring legacy 0.05 thickness recovers sample proportions without moving leaves, organs or axes',()=>{
 const f=fixture(2);f.authoring.branch_instances.forEach(i=>i.radius_scale=.05);
 const thin=f.build(),before=signature(thin);
 assert.equal(restoreSampleThickness(f.authoring),2);
 const restored=f.build(),after=signature(restored);
 assert.deepEqual(after.leaves,before.leaves);assert.deepEqual(after.organs,before.organs);
 for(let n=0;n<restored.masterBranches.length;n++){
  const b=restored.masterBranches[n],old=thin.masterBranches[n];
  assert.deepEqual(b.points,old.points);
  if(b.instanceId)assert.ok(Math.abs(b.startRadius/old.startRadius-20)<1e-8);
  else assert.equal(b.startRadius,old.startRadius);
 }
 assert.equal(restored.report.compiled_samples,1);
 assert.deepEqual(signature(restored),signature(f.build(false)));
 assert.equal(validatePVESkeleton(createPVESkeleton(restored,f.leaves)).valid,true);
});

test('local curve edits and leaf removal remain local and do not replace other samples',()=>{
 const f=fixture(3),original=f.build(),branch=original.masterBranches.find(b=>b.stableId==='I0.'+source.shape.branches[0].id);
 const points=branch.controlPoints.map(p=>p.toArray());points.at(-1)[2]+=.25;
 f.authoring.overrides[branch.stableId]={curve_knots:points,curve_samples:points,locked:true};
 const leaf=original.placements.find(p=>p.branchStableId.startsWith('I1.'));assert.ok(leaf);
 f.authoring.leaf_edits.removed.push(leaf.stableId);
 const edited=f.build();
 assert.ok(edited.masterBranches.find(b=>b.stableId===branch.stableId).points.at(-1).distanceTo(new THREE.Vector3(...points.at(-1)))<1e-5);
 assert.ok(!edited.placements.some(p=>p.stableId===leaf.stableId));
 assert.deepEqual(signature(edited).leaves.filter(p=>p[0].startsWith('I2.')),signature(original).leaves.filter(p=>p[0].startsWith('I2.')));
});

test('whole-tree manual leaves retain their original IDs and external source choices',()=>{
 const f=fixture(2);f.authoring.branch_library[0].sample.settings.collision_avoidance=false;f.leaves.push({...f.leaves[0],id:'EXTERNAL_LEAF'});
 f.authoring.leaf_edits.added.push({id:'MANUAL_CUSTOM',parent:'I0.'+source.shape.branches[0].id,t:.6,azimuth:50,scale:1,source:f.leaves.length-1});
 const asset=f.build(),leaf=asset.placements.find(p=>p.stableId==='MANUAL_CUSTOM');assert.ok(leaf);assert.equal(leaf.source,f.leaves.length-1);
 assert.ok(asset.elements.some(e=>e.id==='MANUAL_CUSTOM'));
 f.authoring.leaf_edits.removed.push('MANUAL_CUSTOM');assert.ok(!f.build().placements.some(p=>p.stableId==='MANUAL_CUSTOM'));
});

test('a detached sample keeps its foliage and a world-space exclusion mask remains effective',()=>{
 const f=fixture(3),original=f.build();f.authoring.branch_instances[0].shape=source.shape;f.authoring.branch_instances[0].linked=false;
 const detached=f.build();assert.equal(detached.placements.length,original.placements.length);
 f.authoring.foliage_masks=[{id:'ALL',mode:'EXCLUDE',shape:'SPHERE',center:[0,0,0],radius:100,size:[100,100,100],strength:1}];
 const masked=f.build();assert.equal(masked.placements.length,0);assert.equal(masked.treeOrgans.length,0);
});

test('a removed installation parent does not leave an orphan sample at the origin',()=>{
 const f=fixture(2);f.authoring.topology.suppressed.push('ROOT');const asset=f.build();
 assert.equal(asset.masterBranches.length,0);assert.equal(asset.placements.length,0);assert.equal(asset.treeOrgans.length,0);
});

test('cross-sample edits retain the established graph path instead of silently dropping edits',()=>{
 const f=fixture(2);assert.equal(canCompileSamples(f.authoring),true);
 f.authoring.topology.reparent['I0.'+source.shape.branches[0].id]='ROOT';assert.equal(canCompileSamples(f.authoring),false);
 f.authoring.topology.reparent={};f.authoring.branch_instances[0].junction={enabled:true};assert.equal(canCompileSamples(f.authoring),false);
});

test('all LODs keep the complete sample master leaf sources and placements',()=>{
 const f=fixture(2),master=f.build();
 const signature=a=>a.masterPlacements.map(p=>[p.stableId,p.source,p.position.toArray(),p.scale]);
 for(let lod=1;lod<4;lod++){
  const asset=buildBranchAsset(f.settings,null,f.leaves,lod,f.authoring,{instanced:true});assets.push(asset);
  assert.deepEqual(signature(asset),signature(master));
  assert.ok(asset.masterPlacements.every(p=>Number.isInteger(p.source)&&p.source>=0&&p.source<f.leaves.length));
  assert.equal(validatePVESkeleton(createPVESkeleton(asset,f.leaves)).valid,true);
 }
});

test('instanced branch picking returns the installed stable ID and all sample buffers are disposed',()=>{
 const f=fixture(1),gpu=f.build();gpu.group.updateMatrixWorld(true);
 const branch=gpu.masterBranches.find(b=>b.instanceId==='I0');
 const center=branch.points[Math.floor(branch.points.length/2)],direction=new THREE.Vector3(0,0,-1);
 const ray=new THREE.Raycaster(center.clone().add(new THREE.Vector3(0,0,2)),direction,0,4),meshes=[];
 gpu.group.traverse(o=>{if(o.isInstancedMesh&&o.userData.category==='branch')meshes.push(o);});
 const hits=ray.intersectObjects(meshes,false);assert.ok(hits.some(hit=>hit.object.userData.stable_id.startsWith('I0.')));
 let disposed=0;meshes.forEach(mesh=>mesh.addEventListener('dispose',()=>disposed++));disposeBranchAsset(gpu);assets.splice(assets.indexOf(gpu),1);
 assert.equal(disposed,meshes.length);
});

// Mount operations retain the complete unit orientation, including roll.
test('mount rigidly transports complete samples, nested units, foliage and PVE instance matrices',async()=>{
 const {makeMountOperation}=await import('../web/branch-mount.js');const {instanceMatrix}=await import('../web/branch-instance-edit.js');
 const f=fixture(3);f.authoring.branch_shape.branches[0].parent='TRUNK';f.authoring.branch_shape.branches[0].attach=.6;
 f.authoring.branch_shape.branches.unshift({...structuredClone(f.authoring.branch_shape.branches[0]),id:'TRUNK',parent:'',points:[[0,0,-2],[0,0,0],[.2,.1,2],[.2,.1,4]],knots:[[0,0,-2],[0,0,0],[.2,.1,2],[.2,.1,4]]});
 f.authoring.branch_instances[1].parent='I0.'+source.shape.branches[0].id;
 const before=f.build(),root=before.masterBranches.find(b=>b.stableId==='ROOT');
 const a=normalizeAuthoring(f.authoring),op=makeMountOperation(before.masterBranches,root,{attach:.2,azimuth:80,elevation:45},{azimuth:0,elevation:0},null);
 a.sculpt_layers.push({id:'MOUNT',name:'Mount',enabled:true,strength:1,operation:op,branches:{}});
 assert.equal(before.updateAssemblyTransforms(f.settings,a),false);
 const after=f.build(true,a),expanded=f.build(false,a),matrix=after.masterBranches.find(b=>b.stableId==='ROOT').mountMatrix;
 assert.ok(after.isInstancedAssembly);const near=(a,b)=>assert.ok(a.distanceTo(b)<1e-7);
 for(const old of before.masterBranches.filter(b=>b.stableId!=='TRUNK')){const b=after.masterBranches.find(v=>v.stableId===old.stableId);b.points.forEach((p,i)=>near(p,old.points[i].clone().applyMatrix4(matrix)));}
 for(const key of ['placements','treeOrgans'])for(let i=0;i<before[key].length;i++){near(after[key][i].position,before[key][i].position.clone().applyMatrix4(matrix));near(after[key][i].direction,before[key][i].direction.clone().transformDirection(matrix));assert.ok(Math.abs(after[key][i].scale-before[key][i].scale)<1e-9);}
 assert.deepEqual(signature(after),signature(expanded));
 for(const inst of a.branch_instances){const old=instanceMatrix(inst,source.shape,before.masterBranches,f.settings),now=instanceMatrix(inst,source.shape,after.masterBranches,f.settings);const want=matrix.clone().multiply(old);for(let k=0;k<16;k++)assert.ok(Math.abs(now.elements[k]-want.elements[k])<1e-7);}
 const pve=createPVESkeleton(after,f.leaves);assert.equal(validatePVESkeleton(pve).valid,true);
 const legacyBefore=buildBranchAsset(f.settings,null,f.leaves,0,f.authoring,{legacy:true}),legacyAfter=buildBranchAsset(f.settings,null,f.leaves,0,a,{legacy:true});assets.push(legacyBefore,legacyAfter);
 for(const key of ['placements','treeOrgans']){assert.equal(legacyBefore[key].length,legacyAfter[key].length);for(let i=0;i<legacyBefore[key].length;i++){near(legacyAfter[key][i].position,legacyBefore[key][i].position.clone().applyMatrix4(matrix));near(legacyAfter[key][i].direction,legacyBefore[key][i].direction.clone().transformDirection(matrix));}}
});

test('rigid preview rotates foliage through axial roll even when the carrier centerline is unchanged',async()=>{
 const {createSculptSnapshot,createMeshPreview}=await import('../web/tree-sculpt.js');
 const f=fixture(2),asset=f.build(),snapshot=createSculptSnapshot(asset.masterBranches,asset.authoring.overrides),preview=createMeshPreview(asset,snapshot);
 const records=[];asset.group.traverse(mesh=>{if(mesh.isMesh)records.push({mesh,positions:mesh.geometry.getAttribute('position').array.slice(),normals:mesh.geometry.getAttribute('normal')?.array.slice()});});
 const matrix=new THREE.Matrix4().makeRotationZ(Math.PI/2);preview.updateRigid(matrix,new Set(snapshot.keys()));
 let moved=0;for(const r of records){const p=r.mesh.geometry.getAttribute('position'),inverse=r.mesh.matrix.clone().invert();for(let i=0;i<p.count;i++){const old=new THREE.Vector3().fromArray(r.positions,i*3),expected=old.clone().applyMatrix4(r.mesh.matrix).applyMatrix4(matrix).applyMatrix4(inverse),actual=new THREE.Vector3().fromBufferAttribute(p,i);assert.ok(actual.distanceTo(expected)<1e-5);if(actual.distanceTo(old)>.001)moved++;}}
 assert.ok(moved>100);preview.restore();for(const r of records)assert.deepEqual(r.mesh.geometry.getAttribute('position').array,r.positions);
});
