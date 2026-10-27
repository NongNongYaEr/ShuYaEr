import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBranchAsset,disposeBranchAsset} from '../web/branch-kernel.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {captureBranchDuplicate,bakeDuplicateUnits} from '../web/branch-duplicate.js';
import {captureBranchShape} from '../web/branch-workbench-data.js';
import {captureUnit} from '../web/unit-authoring.js';
import {createPVESkeleton,validatePVESkeleton} from '../web/pve-skeleton-export.js';
import {makeMountOperation,evaluateBranchMount} from '../web/branch-mount.js';
import fs from 'node:fs';
import {deserializeGeometry,normalizeSettings} from '../web/branch-kernel.js';
const shape=(id,parent,points)=>({id,parent,points,attach:.5,length:2,start_radius:.03,end_radius:.009});
const settings={leaf_density:3,child_count:0,branch_levels:4,wind_strength:0};
const fixture=()=>normalizeAuthoring({branch_shape:{branches:[shape('R','',[[0,0,0],[0,0,1],[0,0,2],[0,0,3]]),shape('A','R',[[0,0,1.5],[.7,0,1.7],[1.2,0,2],[2,0,2]]),shape('C','A',[[1,0,1.8],[1.3,0,2.4],[1.5,0,2.8]]),shape('B','R',[[0,0,1.5],[-1,0,1.5],[-1.5,0,2]])]}});
const layer=operation=>({id:crypto.randomUUID(),name:'test',enabled:true,strength:1,operation,branches:{}});
const geometry=b=>b.points.map(p=>p.toArray());
test('independent duplicate keeps subtree, radii and exact foliage; move, edit, suppress, serialize',()=>{
 const a=fixture(),base=buildBranchAsset(settings,null,null,0,a),assets=[base];
 const op=captureBranchDuplicate(base,new Set(['A','C']),'COPY');assert.equal(op.targets.length,1);assert.equal(op.records.length,2);
 a.sculpt_layers.push(layer(op));let copied=buildBranchAsset(settings,null,null,0,a);assets.push(copied);
 for(const id of ['R','A','B','C'])assert.deepEqual(geometry(copied.masterBranches.find(b=>b.stableId===id)),geometry(base.masterBranches.find(b=>b.stableId===id)));
 for(const [i,id]of ['A','C'].entries()){const source=base.masterBranches.find(b=>b.stableId===id),copy=copied.masterBranches.find(b=>b.stableId==='COPY_'+i);assert.deepEqual(geometry(copy),geometry(source));assert.equal(copy.startRadius,source.startRadius);const originals=base.masterPlacements.filter(p=>p.branchStableId===id),units=copied.masterPlacements.filter(p=>p.branchStableId===copy.stableId);assert.equal(units.length,originals.length);for(let n=0;n<units.length;n++){assert.ok(units[n].position.distanceTo(originals[n].position)<1e-7);assert.equal(units[n].scale,originals[n].scale);}}
 const mount=makeMountOperation(copied.masterBranches,copied.masterBranches.find(b=>b.stableId==='COPY_0'),{target_parent:'B',attach:.6,azimuth:0,elevation:0},{azimuth:0,elevation:0});a.sculpt_layers.push(layer(mount));
 const moved=buildBranchAsset(settings,null,null,0,a);assets.push(moved);const root=moved.masterBranches.find(b=>b.stableId==='COPY_0'),parent=moved.masterBranches.find(b=>b.stableId==='B');assert.equal(root.parentId,parent.id);assert.ok(parent.children.includes(root.id));
 assert.deepEqual(geometry(moved.masterBranches.find(b=>b.stableId==='A')),geometry(base.masterBranches.find(b=>b.stableId==='A')));
 const illegal=makeMountOperation(moved.masterBranches,root,{target_parent:'COPY_1',attach:.4,azimuth:0,elevation:0},{azimuth:0,elevation:0});assert.equal(evaluateBranchMount(moved.masterBranches,illegal),moved.masterBranches);
 const reload=buildBranchAsset(settings,null,null,0,normalizeAuthoring(JSON.parse(JSON.stringify(a))));assets.push(reload);assert.deepEqual(reload.masterBranches.map(geometry),moved.masterBranches.map(geometry));
 a.topology.suppressed.push('COPY_0');const removed=buildBranchAsset(settings,null,null,0,a);assets.push(removed);assert.ok(!removed.masterBranches.some(b=>b.stableId.startsWith('COPY')));
 assets.forEach(disposeBranchAsset);
});
test('copied leaf remains individually editable and survives baking into a workbench sample',()=>{
 const a=fixture(),s={...settings,leaf_density:30},assets=[],build=()=>{const b=buildBranchAsset(s,null,null,0,a,{resolveSources:true});assets.push(b);return b;};
 try{
  const base=build();a.sculpt_layers.push(layer(captureBranchDuplicate(base,new Set(['A']),'EDIT')));const duplicated=build(),p=duplicated.placements.find(p=>p.branchStableId.startsWith('EDIT'));assert.ok(p);
  const branch=duplicated.masterBranches.find(b=>b.stableId===p.branchStableId),record=captureUnit(p,branch,[{id:'DEFAULT'}],'LEAF',true);record.scale*=1.7;a.unit_editing.items.push(record);
  const edited=build(),leaf=edited.placements.find(q=>q.stableId===p.stableId);assert.ok(Math.abs(leaf.scale-record.scale)<1e-10);
  const shape=captureBranchShape(edited.masterBranches,'R',true).shape;bakeDuplicateUnits(edited,a,shape,[{id:'DEFAULT'}]);a.branch_shape=shape;a.sculpt_layers=[];
  const baked=build(),copy=baked.placements.find(q=>q.stableId===p.stableId);assert.ok(copy);assert.equal(copy.scale,leaf.scale);assert.equal(baked.placements.filter(p=>p.branchStableId.startsWith('EDIT')).length,edited.placements.filter(p=>p.branchStableId.startsWith('EDIT')).length);
 }finally{assets.forEach(disposeBranchAsset);}
});
test('copying a support keeps installed real leaf/flower samples and material indices',()=>{
 const folder=new URL('../次枝资产/全植物次枝成品V1/朴树/',import.meta.url),name=fs.readdirSync(folder).find(n=>n.includes('短弯细梢')&&n.includes('混合')&&n.endsWith('.branchasset.json'));
 const unit=JSON.parse(fs.readFileSync(new URL(name,folder))).asset,geometries=[],assets=[];
 try{
  const sources=unit.sample.leaf_meshes.map(s=>{const geometry=deserializeGeometry(s.geometry);geometries.push(geometry);return {...s,geometry};});
  const a=normalizeAuthoring({branch_shape:{branches:[shape('ROOT','',[[0,0,0],[0,0,2]])]},branch_library:[unit],branch_instances:[{id:'I',parent:'ROOT',asset_id:unit.id,linked:true,attach:.5,scale:1,variation:0}],recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']},tree_organs:unit.sample.authoring.tree_organs});
  const s=normalizeSettings({...unit.sample.settings,leaf_density:0,max_triangles:8000000}),build=()=>{const b=buildBranchAsset(s,null,sources,0,a,{instanced:true,resolveSources:true});assets.push(b);return b;};
  const original=build(),operation=captureBranchDuplicate(original,new Set(['ROOT']),'REAL');assert.ok(original.placements.length);assert.ok(original.treeOrgans.length);
  a.sculpt_layers.push(layer(operation));const copied=build();
  const skeletonBefore=buildBranchAsset(s,null,sources,0,{...a,sculpt_layers:[]},{skeletonOnly:true});assets.push(skeletonBefore);
  const skeletonAfter=buildBranchAsset(s,null,sources,0,a,{skeletonOnly:true});assets.push(skeletonAfter);
  assert.equal(skeletonAfter.masterBranches.length,skeletonBefore.masterBranches.length*2,'skeleton view must not expose copied installed twigs');
  assert.ok(skeletonAfter.masterBranches.every(b=>!b.unitOwner&&!b.instanceId));
  assert.ok(!validatePVESkeleton(createPVESkeleton(copied)).errors?.length);
  for(const key of ['placements','treeOrgans']){
   const copies=copied[key].filter(p=>p.branchStableId.startsWith('REAL'));assert.equal(copies.length,original[key].length,key);
   for(const old of original[key]){assert.ok(copies.some(p=>p.position.distanceTo(old.position)<1e-6&&p.direction.distanceTo(old.direction)<1e-6&&Math.abs(p.scale-old.scale)<1e-8&&p.source===old.source),key+' exact placement '+old.stableId);}
   const retained=copied[key].filter(p=>!p.branchStableId.startsWith('REAL'));assert.equal(retained.length,original[key].length,key+' originals');
   for(const old of original[key])assert.ok(retained.some(p=>p.stableId===old.stableId&&p.position.distanceTo(old.position)<1e-6),key+' unchanged');
  }
 }finally{assets.forEach(disposeBranchAsset);geometries.forEach(g=>g.dispose());}
});
