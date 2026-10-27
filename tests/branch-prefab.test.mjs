import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../web/vendor/three.module.min.js';
import fs from 'node:fs';
import {buildBranchAsset,disposeBranchAsset,deserializeGeometry,createProjectDocument} from '../web/branch-kernel.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {captureBranchPrefab,insertBranchPrefab,branchPrefabDocument,prefabPlacement} from '../web/branch-prefab-data.js';
import {resolvePveExportPlan} from '../web/pve-export-plan.js';
import {makeMountOperation} from '../web/branch-mount.js';
import {controlCurveOperation} from '../web/branch-control-curve.js';
import {captureSculptLayer} from '../web/generator-geometry.js';
import {captureBranchDuplicate} from '../web/branch-duplicate.js';
import {axisTimes} from '../web/branch-axis.js';
const branch=(id,parent,points,attach=.5)=>({id,parent,points,knots:points,attach,length:2,start_radius:.06,end_radius:.01});
const raw={branch_shape:{branches:[branch('ROOT','',[[0,0,0],[0,0,2],[0,0,5]]),branch('A','ROOT',[[0,0,2.5],[1,0,2.8],[2,0,3]]),branch('C','A',[[1,0,2.8],[1.2,.3,3.5]])]}};
const settings={child_count:0,branch_levels:4,leaf_density:0,wind_strength:0,preview_lod:0,max_triangles:10000000};
const doc=a=>({settings,authoring:a,leaf_meshes:[]});
const folder=new URL('../次枝资产/全植物次枝成品V1/朴树/',import.meta.url),name=fs.readdirSync(folder).find(n=>n.includes('短弯细梢')&&n.includes('混合')&&n.endsWith('.branchasset.json'));
const unit=JSON.parse(fs.readFileSync(new URL(name,folder))).asset;
const layer=operation=>({id:crypto.randomUUID(),name:'test',enabled:true,strength:1,operation,branches:{}});
const distances=branches=>branches.flatMap(b=>b.points.slice(1).map((p,i)=>p.distanceTo(b.points[i])));
test('package attribution does not split identical complete source models during prefab insertion',()=>{
 const a=normalizeAuthoring(raw),original=buildBranchAsset(settings,null,null,0,a);
 try{const p=captureBranchPrefab(original,doc(a),['A'],[],{id:'prefab-attribution',name:'共享模型'}),incoming=structuredClone(unit),current=structuredClone(unit);current.id='PACK_EXISTING';const one={id:'pack-one',version:'1.0.0',digest:'a'.repeat(64),author:'甲',license:'保留甲'},two={...one,id:'pack-two',author:'乙',license:'保留乙'};current.sample.package_origins=[one];incoming.sample.package_origins=[two];p.library=[incoming];a.branch_library=[current];const result=insertBranchPrefab(doc(a),p,{parent:'ROOT',attach:.5,matrix:new THREE.Matrix4(),token:'ATTRIBUTION'});assert.equal(result.document.authoring.branch_library.length,1);assert.equal(result.document.authoring.branch_library[0].id,'PACK_EXISTING');assert.equal(result.document.authoring.branch_library[0].sample.package_origins.length,2);assert.equal(current.sample.package_origins.length,1);
 }finally{disposeBranchAsset(original);}
});
test('prefab captures exactly a whole carrier family, installs independent editable skeletons and survives cold JSON',()=>{
 const a=normalizeAuthoring(raw),original=buildBranchAsset(settings,null,null,0,a),before=JSON.stringify(a),assets=[original];
 try{
  const p=captureBranchPrefab(original,doc(a),['A'],[],{id:'prefab-test',name:'横展大枝'});assert.equal(JSON.stringify(a),before);assert.equal(p.operation.records.length,2);assert.equal(p.counts.carriers,2);
  const target=original.masterBranches.find(b=>b.stableId==='ROOT'),matrix=prefabPlacement(p,target,.7,new THREE.Vector3(0,1,3.5));
  const first=insertBranchPrefab(doc(a),p,{parent:'ROOT',attach:.7,matrix,token:'FIRST'}),second=insertBranchPrefab(first.document,p,{parent:'ROOT',attach:.3,matrix:new THREE.Matrix4().makeRotationZ(1).premultiply(matrix),token:'SECOND'});
  const installed=buildBranchAsset(settings,null,null,0,normalizeAuthoring(second.document.authoring));assets.push(installed);
  assert.equal(installed.masterBranches.length,7);const copied=installed.masterBranches.filter(b=>b.stableId.startsWith('FIRST'));
  assert.ok(copied.every(b=>b.prefabCarrier&&!b.unitOwner&&!b.instanceId));
  distances(copied).forEach((d,i)=>assert.ok(Math.abs(d-distances(original.masterBranches.filter(b=>['A','C'].includes(b.stableId)))[i])<1e-9));
  const cold=buildBranchAsset(settings,null,null,0,normalizeAuthoring(JSON.parse(JSON.stringify(second.document.authoring))));assets.push(cold);assert.deepEqual(cold.masterBranches.map(b=>b.points.map(p=>p.toArray())),installed.masterBranches.map(b=>b.points.map(p=>p.toArray())));
  assert.throws(()=>captureBranchPrefab(original,doc(a),[],[]),/选中/);
 }finally{assets.forEach(disposeBranchAsset);}
});
test('nested shared models, uneven carrier samples and conflicting material assets remain independent across two installs',()=>{
 const a=normalizeAuthoring({...raw,branch_library:[unit],branch_instances:[{id:'I1',asset_id:unit.id,parent:'A',linked:true,attach:.6,seed:17},{id:'I2',asset_id:unit.id,parent:'I1.'+unit.shape.branches[0].id,linked:true,attach:.7,seed:20}],recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']}}),assets=[];
 const build=a=>{const b=buildBranchAsset({...unit.sample.settings,...settings},null,[],0,a,{instanced:true});assets.push(b);return b;};
 try{
  let original=build(a),root=original.masterBranches.find(b=>b.stableId==='A');a.sculpt_layers.push(layer(controlCurveOperation(root,[[0,0,2.5],[.1,.2,2.7],[2,0,3]])));original=build(a);
  const p=captureBranchPrefab(original,doc(a),['A'],[],{id:'nested-test',name:'嵌套预制'});assert.equal(p.copies.length,2);assert.ok(p.operation.records[0].sample_times?.length>3);
  const conflict=structuredClone(unit);conflict.shape.branches[0].start_radius*=2;const target=doc(normalizeAuthoring({...raw,branch_library:[conflict]}));
  const first=insertBranchPrefab(target,p,{token:'NEST1',parent:'ROOT'}),second=insertBranchPrefab(first.document,p,{token:'NEST2',parent:'ROOT'});assert.equal(second.document.authoring.branch_library.length,2);assert.equal(second.document.authoring.branch_library[0].shape.branches[0].start_radius,conflict.shape.branches[0].start_radius);assert.equal(first.copies[0].asset_id,second.copies[0].asset_id);assert.notEqual(first.copies[0].asset_id,conflict.id);
  const result=build(normalizeAuthoring(second.document.authoring));assert.equal(result.masterBranches.filter(b=>b.instanceId).length,original.masterBranches.filter(b=>b.instanceId).length*2);assert.equal(new Set(result.masterBranches.map(b=>b.id)).size,result.masterBranches.length);
  assert.deepEqual(axisTimes(result.masterBranches.find(b=>b.stableId===first.root).points),p.operation.records[0].sample_times);
 }finally{assets.forEach(disposeBranchAsset);}
});
test('historical complete-unit snapshots keep exact wood, real leaves, flowers and source geometry when saved as a prefab',()=>{
 const sources=unit.sample.leaf_meshes.map(s=>({...s,geometry:deserializeGeometry(s.geometry)})),assets=[];
 const a=normalizeAuthoring({...raw,branch_library:[unit],branch_instances:[{id:'I',asset_id:unit.id,parent:'A',attach:.6,scale:1,linked:true}],tree_organs:unit.sample.authoring.tree_organs,recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']}});
 const build=(a,s=sources)=>{const b=buildBranchAsset({...unit.sample.settings,...settings},null,s,0,a,{instanced:true});assets.push(b);return b;};
 try{
  const original=build(a);a.sculpt_layers.push(layer(captureBranchDuplicate(original,new Set(['A']),'OLD',sources)));const historical=build(a),document={settings,authoring:a,leaf_meshes:unit.sample.leaf_meshes.map(s=>({...s,sampleLeafMaterialId:'BASE'}))},p=captureBranchPrefab(historical,document,['OLD_0'],sources,{id:'old-test',name:'历史大枝'});
  assert.equal(p.copies.length,0);assert.equal(p.counts.units,1);assert.ok(p.operation.records.some(r=>r.owner));
  const root=historical.masterBranches.find(b=>b.stableId==='OLD_0'),local=new THREE.Matrix4().fromArray(p.operation.records[0].mountMatrix).multiply((root.mountMatrix||new THREE.Matrix4()).clone().invert()),installed=insertBranchPrefab(doc(normalizeAuthoring(raw)),p,{token:'OLD_AGAIN',parent:'ROOT',matrix:local.clone().invert()});
  const importedSources=installed.document.leaf_meshes.map(s=>({...s,geometry:deserializeGeometry(s.geometry)}));sources.push(...importedSources);const result=build(normalizeAuthoring(installed.document.authoring),importedSources);
  const saved=createProjectDocument(result,importedSources,installed.document.authoring);for(const s of saved.leaf_meshes){assert.ok(s.sampleLeafMaterial);assert.ok(!s.sampleLeafMaterialId,'foreign palette must not turn back into the target BASE palette on normal save');}
  for(const record of p.operation.records){const old=historical.masterBranches.find(b=>b.stableId===record.sourceBranchId),now=result.masterBranches.find(b=>b.stableId==='OLD_AGAIN_'+record.id);assert.equal(now.points.length,old.points.length);now.points.forEach((point,n)=>assert.ok(point.distanceTo(old.points[n])<1e-8));}
  for(const key of ['placements','treeOrgans']){const before=historical[key].filter(p=>p.branchStableId.startsWith('OLD_')),after=result[key].filter(p=>p.branchStableId.startsWith('OLD_AGAIN_'));assert.ok(before.length>0,key+' actual model fixture');assert.equal(after.length,before.length);for(const p of before)assert.ok(after.some(q=>q.position.distanceTo(p.position)<1e-7&&q.direction.distanceTo(p.direction)<1e-7&&Math.abs(p.scale-q.scale)<1e-10),key+' exact placement');}
 }finally{assets.forEach(disposeBranchAsset);sources.forEach(s=>s.geometry.dispose());}
});
test('imported explicit foliage retains its own shape and palette without redistributing the destination tree leaves',()=>{
 const assets=[],geometries=[],s={...settings,leaf_density:15,leaf_aspect:.2},a=normalizeAuthoring(raw),original=buildBranchAsset(s,null,[],0,a);assets.push(original);
 try{
  const p=captureBranchPrefab(original,{settings:s,authoring:a,leaf_meshes:[]},['A'],[],{id:'default-leaves',name:'内置阔叶预制'});assert.equal(p.leaf_meshes.length,1);assert.equal(p.leaf_meshes[0].manual_only,true);
  const targetSettings={...s,leaf_aspect:.8},before=buildBranchAsset(targetSettings,null,[],0,a);assets.push(before);
  const next=insertBranchPrefab({settings:targetSettings,authoring:a,leaf_meshes:[]},p,{token:'LEAVES',parent:'ROOT'}),sources=next.document.leaf_meshes.map(s=>{const geometry=deserializeGeometry(s.geometry);geometries.push(geometry);return {...s,geometry};}),result=buildBranchAsset(targetSettings,null,sources,0,normalizeAuthoring(next.document.authoring));assets.push(result);
  const oldLeaves=result.placements.filter(p=>!p.branchStableId.startsWith('LEAVES'));assert.equal(oldLeaves.length,before.placements.length);for(let i=0;i<oldLeaves.length;i++){assert.equal(oldLeaves[i].stableId,before.placements[i].stableId);assert.ok(oldLeaves[i].position.distanceTo(before.placements[i].position)<1e-8);assert.equal(oldLeaves[i].scale,before.placements[i].scale);}
  assert.equal(result.placements.filter(p=>p.branchStableId.startsWith('LEAVES')).length,original.placements.filter(p=>['A','C'].includes(p.branchStableId)).length);
  const saved=createProjectDocument(result,sources,next.document.authoring),coldSources=saved.leaf_meshes.map(s=>{const geometry=deserializeGeometry(s.geometry);geometries.push(geometry);return {...s,geometry};}),cold=buildBranchAsset(targetSettings,null,coldSources,0,normalizeAuthoring(JSON.parse(JSON.stringify(saved.authoring))));assets.push(cold);assert.equal(cold.placements.length,result.placements.length);assert.deepEqual(cold.placements.map(p=>p.position.toArray()),result.placements.map(p=>p.position.toArray()));
 }finally{assets.forEach(disposeBranchAsset);geometries.forEach(g=>g.dispose());}
});
test('complete source models stay shared, include actual foliage, follow carrier edits and retain unit boundaries after reload',()=>{
 const a=normalizeAuthoring({...raw,branch_library:[unit],branch_instances:[{id:'I',asset_id:unit.id,parent:'A',attach:.6,scale:1,linked:true,seed:17}],recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']}});
 const meshes=unit.sample.leaf_meshes.map(s=>({...s,geometry:deserializeGeometry(s.geometry)})),assets=[];
 const build=a=>{const b=buildBranchAsset({...unit.sample.settings,...settings},null,meshes,0,a,{instanced:true});assets.push(b);return b;};
 try{
  const original=build(a),source=JSON.stringify(unit),p=captureBranchPrefab(original,doc(a),['A'],meshes,{id:'prefab-unit',name:'带整枝组合'});
  assert.equal(p.copies.length,1);assert.equal(p.operation.records.length,2);assert.equal(p.library.length,1);assert.ok(!p.operation.records.some(r=>r.owner));
  const thumbnailDoc=branchPrefabDocument(p),preview=build(normalizeAuthoring(thumbnailDoc.authoring));assert.equal(preview.masterBranches.filter(b=>b.prefabCarrier).length,2);assert.ok(preview.placements.length,'full foliage present in thumbnail');
  let next=insertBranchPrefab(doc(a),p,{parent:'ROOT',attach:.7,matrix:prefabPlacement(p,original.masterBranches[0],.7,new THREE.Vector3(1,0,3.5)),token:'ONE'});
  const second=insertBranchPrefab(next.document,p,{parent:'ROOT',attach:.3,matrix:prefabPlacement(p,original.masterBranches[0],.3,new THREE.Vector3(0,1,1.5)),token:'TWO'});
  assert.equal(second.document.authoring.branch_library.length,1,'multiple installs reuse the original source');
  const authoring=normalizeAuthoring(second.document.authoring),installed=build(authoring);assert.equal(installed.placements.length,original.placements.length*3);
  const newUnit=resolvePveExportPlan(installed).units.find(u=>u.id==='ONE_PFB_U0');assert.ok(newUnit);assert.equal(newUnit.sourceAsset.id,unit.id);assert.equal(newUnit.variantRequired,false);
  const bones=installed.masterBranches,root=bones.find(b=>b.stableId===next.root),operation=makeMountOperation(bones,root,{target_parent:'ROOT',attach:.4,azimuth:27,elevation:14},{azimuth:0,elevation:0});authoring.sculpt_layers.push(layer(operation));
  const moved=build(authoring);assert.equal(moved.placements.length,installed.placements.length);const cold=build(normalizeAuthoring(JSON.parse(JSON.stringify(authoring))));assert.deepEqual(cold.masterBranches.map(b=>b.points.map(p=>p.toArray())),moved.masterBranches.map(b=>b.points.map(p=>p.toArray())));
  const carrier=moved.masterBranches.find(b=>b.stableId===next.root),knots=carrier.controlPoints.map(p=>p.toArray());knots[1][1]+=.4;authoring.sculpt_layers.push(layer(controlCurveOperation(carrier,knots)));
  const bent=build(authoring),unitBefore=moved.masterBranches.filter(b=>b.instanceId==='ONE_PFB_U0'),unitAfter=bent.masterBranches.filter(b=>b.instanceId==='ONE_PFB_U0');assert.equal(unitBefore.length,unitAfter.length);
  const lengths=distances(unitBefore);distances(unitAfter).forEach((d,i)=>assert.ok(Math.abs(d-lengths[i])<1e-8,'carrier deformation preserves whole-unit internal geometry'));
  // A subsequent complete-unit edit needs the raw history graph as well as
  // the optimized compiled graph. Deferred instances must exist before it.
  const editedUnit=unitAfter[0],editLayer={id:'UNIT_EDIT',name:'unit rigid edit',enabled:true,strength:1,branches:{}};
  captureSculptLayer(editLayer,bent.masterBranches,{[editedUnit.stableId]:{curve_knots:editedUnit.controlPoints.map(p=>p.clone().add(new THREE.Vector3(.1,.1,.1)).toArray()),curve_samples:editedUnit.points.map(p=>p.clone().add(new THREE.Vector3(.1,.1,.1)).toArray())}});authoring.sculpt_layers.push(editLayer);
  const later=build(authoring);assert.equal(later.masterBranches.filter(b=>b.instanceId==='ONE_PFB_U0').length,unitAfter.length);assert.ok(later.placements.length>=bent.placements.length*.9);
  assert.equal(JSON.stringify(unit),source);
  const internal=original.masterBranches.find(b=>b.instanceId==='I');assert.throws(()=>captureBranchPrefab(original,doc(a),[internal.stableId],meshes),/承重骨架/);
 }finally{assets.forEach(disposeBranchAsset);meshes.forEach(s=>s.geometry.dispose());}
});
