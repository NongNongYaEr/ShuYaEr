import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildBranchAsset,disposeBranchAsset,deserializeGeometry,normalizeSettings} from '../web/branch-kernel.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {captureCompleteInstanceDraft,captureCompleteDraftShape,freezeCompleteDraftUnits} from '../web/complete-instance-draft.js';
import {copy,normalizeBranchLibrary} from '../web/branch-workbench-data.js';
import {instanceMatrix} from '../web/branch-instance-edit.js';
import {resetBranchInstanceEdits} from '../web/branch-instance-operations.js';
import {captureUnit} from '../web/unit-authoring.js';
import {normalizeJunction} from '../web/branch-shaping.js';

const materialEqual=(a,b)=>a&&b&&['color','normal','cutoff','roughness'].every(k=>a[k]===b[k]);
const privatePayload=doc=>({settings:doc.settings,leaf_meshes:doc.leaf_meshes,authoring:{...doc.authoring,branch_library:[],workbench:{}}});
function assertAtlasOnce(json,material,label){
 for(const key of ['color','normal'])if(material[key]){const first=json.indexOf(material[key]);assert.ok(first>=0,label+' '+key+' present');assert.equal(json.indexOf(material[key],first+material[key].length),-1,label+' '+key+' stored once');}
}

test('real complete sample draft preserves effective leaf/flower poses, material, instance connector and local save/reload',()=>{
 const folder=new URL('../次枝资产/全植物次枝成品V1/朴树/',import.meta.url),name=fs.readdirSync(folder).find(n=>n.includes('短弯细梢')&&n.includes('混合')&&n.endsWith('.branchasset.json'));
 const item=JSON.parse(fs.readFileSync(new URL(name,folder))).asset,sources=item.sample.leaf_meshes.map(s=>({...s,geometry:deserializeGeometry(s.geometry)})),assets=[];
 try{
  const authoring=normalizeAuthoring({branch_shape:{branches:[{id:'ROOT',parent:'',points:[[0,0,0],[0,0,3]],start_radius:.1,end_radius:.03,length:3}]},branch_library:[item],branch_instances:[{id:'I',parent:'ROOT',asset_id:item.id,linked:true,attach:.45,angle:62,azimuth:37,roll:21,scale:1.4,radius_scale:1.3}],recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']},tree_organs:item.sample.authoring.tree_organs});
  const settings=normalizeSettings({...item.sample.settings,leaf_density:0,max_triangles:8000000}),build=(s,a)=>{const b=buildBranchAsset(s,null,sources,0,a,{instanced:true,resolveSources:true});assets.push(b);return b;};
  const tree=build(settings,authoring),instance=authoring.branch_instances[0],doc=captureCompleteInstanceDraft(tree,instance,{settings,authoring,leaf_meshes:item.sample.leaf_meshes},sources);
  assert.ok(doc.authoring.unit_editing.items.some(v=>v.kind==='ORGAN'));assert.ok(doc.authoring.unit_editing.items.some(v=>v.kind==='LEAF'));
  assert.equal(Object.keys(doc.authoring.sample_materials).length,0,'same-plant sample needs no foreign palette');
  assert.ok(doc.leaf_meshes.every(s=>!s.sampleLeafMaterial&&!s.sampleLeafMaterialId));
  assert.ok(doc.authoring.tree_organs.units.every(s=>!s.sampleLeafMaterial&&s.sampleLeafMaterialId==='BASE'),'organ texture priority uses a small base reference');
  const compactJson=JSON.stringify(privatePayload(doc));assertAtlasOnce(compactJson,doc.authoring.leaf_material,'same-plant base atlas');
  assert.ok(compactJson.length<JSON.stringify(item.sample).length*1.2+512000,'same-plant private payload stays close to source sample size');
  const draft=build(doc.settings,doc.authoring),matrix=instanceMatrix(instance,item.shape,tree.masterBranches,settings);
  for(const [key,kind]of [['masterPlacements','LEAF'],['treeOrgans','ORGAN']]){
   const originals=tree[key].filter(p=>p.branchStableId.startsWith('I.'));assert.equal(draft[key].length,originals.length,kind+' count');
   for(const p of draft[key]){const old=originals.find(o=>o.stableId==='I.'+p.stableId);assert.ok(old,p.stableId);assert.ok(p.position.clone().applyMatrix4(matrix).distanceTo(old.position)<1e-6,kind+' position');assert.ok(Math.abs(p.scale*1.4-old.scale)<1e-6,kind+' size');}
  }
  assert.deepEqual(doc.authoring.leaf_material,normalizeAuthoring(item.sample.authoring).leaf_material);
  const shape=captureCompleteDraftShape(draft,doc.authoring),sample=copy(doc.authoring);
  freezeCompleteDraftUnits(draft,sample,shape,sources);
  const reload=build(doc.settings,normalizeAuthoring(JSON.parse(JSON.stringify(sample))));
  assert.equal(reload.masterPlacements.length,draft.masterPlacements.length);assert.equal(reload.treeOrgans.length,draft.treeOrgans.length);
  for(const p of reload.masterPlacements)assert.ok(draft.masterPlacements.find(o=>o.stableId===p.stableId).position.distanceTo(p.position)<1e-6);
  const updated=normalizeAuthoring({...copy(authoring),branch_library:[{...copy(item),id:'LOCAL_TEST',revision:1,shape,sample:{settings:doc.settings,authoring:sample,leaf_meshes:doc.leaf_meshes}}],branch_instances:[{...instance,asset_id:'LOCAL_TEST',pinned_revision:1,shape,assembly_manual:true,assembly_refined:true}]});
  const back=build(settings,updated);
  assert.equal(back.masterPlacements.length,tree.masterPlacements.length,'full local sample reinserted into tree retains leaves');
  assert.equal(back.treeOrgans.length,tree.treeOrgans.length,'full local sample reinserted into tree retains flowers');
  for(const b of back.masterBranches){const old=tree.masterBranches.find(o=>o.stableId===b.stableId);assert.equal(b.points.length,old.points.length);b.points.forEach((p,n)=>assert.ok(p.distanceTo(old.points[n])<1e-6,'wood pose'));assert.ok(Math.abs(b.startRadius-old.startRadius)<1e-8,'radius multiplier applied once');assert.ok(Math.abs(b.endRadius-old.endRadius)<1e-8,'tip radius multiplier applied once');}
 }finally{assets.forEach(disposeBranchAsset);sources.forEach(s=>s.geometry.dispose());}
});

test('complete draft absorbs real nested and manual branches plus arbitrary-ID units exactly once, with source atlases and clean edits',()=>{
 const load=(plant,name)=>JSON.parse(fs.readFileSync(new URL(`../次枝资产/全植物次枝成品V1/${plant}/${name}.branchasset.json`,import.meta.url))).asset;
 const outer=load('香樟','香樟_短弯细梢_混合_成品V1'),nested=load('红叶石楠','红叶石楠_短弯细梢_混合_成品V1');
 const rawSources=[...new Map([outer,nested].flatMap(a=>a.sample.leaf_meshes).map(s=>[s.id,s])).values()],organs=[...new Map([outer,nested].flatMap(a=>a.sample.authoring.tree_organs.units).map(s=>[s.id,s])).values()];
 const sources=rawSources.map(s=>({...s,geometry:deserializeGeometry(s.geometry)})),assets=[],settings=normalizeSettings({...outer.sample.settings,leaf_density:0,max_triangles:8e6});
 const authoring=normalizeAuthoring({branch_shape:{branches:[{id:'ROOT',points:[[0,0,0],[0,0,4]],length:4,start_radius:.1,end_radius:.03}]},branch_library:[outer,nested],branch_instances:[
  {id:'I',parent:'ROOT',asset_id:outer.id,linked:true,attach:.45,angle:62,azimuth:37,roll:21,scale:1.4,radius_scale:1.3},
  {id:'SIBLING',parent:'ROOT',asset_id:outer.id,linked:true,attach:.2,angle:65,azimuth:180,scale:1},
  {id:'NESTED',parent:'I.'+outer.shape.branches[0].id,asset_id:nested.id,linked:true,attach:.7,angle:47,azimuth:16,roll:-13,scale:.6}],
  manual_branches:[{id:'MANUAL',parent:'I.'+outer.shape.branches[0].id,attach:.4,length:.5,radius:.015,angle:75}],tree_organs:{units:organs,amount:0},
  recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']}});
 const build=(a,s=settings,src=sources)=>{const b=buildBranchAsset(s,null,src,0,a,{instanced:true,resolveSources:true});assets.push(b);return b;};
 try{
  let tree=build(authoring);
  const p=tree.masterPlacements.find(p=>p.branchStableId.startsWith('I.')),branch=tree.masterBranches.find(b=>b.stableId===p.branchStableId);
  authoring.leaf_edits.added.push({id:'ARBITRARY_GLOBAL_LEAF',parent:'MANUAL',t:.5,source:0,scale:.1,angle:20,rotation:[0,0,0],offset:[0,0,0]});
  authoring.unit_editing.items.push({...captureUnit(p,branch,sources,'LEAF',true),id:'ARBITRARY_EDIT',parent:'MANUAL'});
  authoring.unit_editing.removed.push('ARBITRARY_EDIT');
  authoring.unit_editing.rules.push({id:'MIXED_OLD_RULE',kind:'LEAF',targets:['MANUAL','ROOT'],amount:0});
  tree=build(normalizeAuthoring(authoring));
  const doc=captureCompleteInstanceDraft(tree,authoring.branch_instances[0],{settings,authoring,leaf_meshes:rawSources},sources),source=doc.authoring.workbench.source;
  const localSources=doc.leaf_meshes.map(s=>({...s,geometry:deserializeGeometry(s.geometry)}));
  sources.push(...localSources);
  const draft=build(doc.authoring,doc.settings,localSources),matrix=instanceMatrix(authoring.branch_instances[0],outer.shape,tree.masterBranches,settings);
  assert.equal(draft.masterBranches.length,source.ids.length,'all descendants survive, carrier and sibling stay outside');
  assert.equal(draft.masterPlacements.length,tree.masterPlacements.filter(p=>source.ids.includes(p.branchStableId)).length,'nested + manual real leaves preserved');
  assert.equal(draft.treeOrgans.length,tree.treeOrgans.filter(p=>source.ids.includes(p.branchStableId)).length,'nested real flowers preserved');
  assert.deepEqual(source.absorbed_instance_ids,['NESTED']);assert.ok(source.absorbed_branch_ids.includes('MANUAL'));assert.ok(source.absorbed_unit_ids.includes('ARBITRARY_GLOBAL_LEAF'));
  for(const b of tree.masterBranches.filter(b=>source.ids.includes(b.stableId))){
   const saved=draft.masterBranches.find(v=>v.stableId===source.branch_id_map[b.stableId]);assert.ok(saved,b.stableId);
   saved.points.forEach((p,n)=>assert.ok(p.clone().applyMatrix4(matrix).distanceTo(b.points[n])<1e-6,b.stableId+' wood pose'));
  }
  for(const [key,kind]of [['masterPlacements','LEAF'],['treeOrgans','ORGAN']])for(const p of tree[key].filter(p=>source.ids.includes(p.branchStableId))){
   const saved=draft[key].find(v=>v.stableId===source.unit_id_map[p.stableId]);assert.ok(saved,p.stableId);
   assert.ok(saved.position.clone().applyMatrix4(matrix).distanceTo(p.position)<1e-6,kind+' pose');assert.ok(Math.abs(saved.scale*1.4-p.scale)<1e-6,kind+' size');
  }
  assert.equal(Object.keys(doc.authoring.sample_materials).length,1,'all foreign meshes share one atlas entry');
  for(const src of doc.leaf_meshes.filter(s=>nested.sample.leaf_meshes.some(v=>v.id===s.id)))assert.ok(materialEqual(doc.authoring.sample_materials[src.sampleLeafMaterialId],nested.sample.authoring.leaf_material),'nested leaf atlas reference');
  for(const src of doc.authoring.tree_organs.units.filter(s=>nested.sample.authoring.tree_organs.units.some(v=>v.id===s.id)))assert.ok(materialEqual(doc.authoring.sample_materials[src.sampleLeafMaterialId],nested.sample.authoring.leaf_material),'nested organ atlas reference');
  assert.ok([...doc.leaf_meshes,...doc.authoring.tree_organs.units].every(s=>!s.sampleLeafMaterial),'geometry does not inline repeated PNGs');
  const compactJson=JSON.stringify(privatePayload(doc));assertAtlasOnce(compactJson,doc.authoring.leaf_material,'mixed base');assertAtlasOnce(compactJson,nested.sample.authoring.leaf_material,'mixed foreign');
  assert.ok(compactJson.length<(JSON.stringify(outer.sample).length+JSON.stringify(nested.sample).length)*1.2+512000,'mixed private payload stores one PNG pair per plant');
  const shape=captureCompleteDraftShape(draft,doc.authoring),sample={settings:doc.settings,authoring:copy(doc.authoring),leaf_meshes:doc.leaf_meshes};
  freezeCompleteDraftUnits(draft,sample.authoring,shape,localSources);
  sample.authoring.branch_library=[];sample.authoring.workbench={};
  const standalone=build(normalizeAuthoring(JSON.parse(JSON.stringify(sample.authoring))),sample.settings,localSources);
  assert.equal(standalone.masterPlacements.length,draft.masterPlacements.length);assert.equal(standalone.treeOrgans.length,draft.treeOrgans.length);
  const atlasColors=new Set();standalone.group.traverse(m=>{if(m.isMesh)for(const mat of [m.material].flat())if(mat.sampleLeafMaterial?.color)atlasColors.add(mat.sampleLeafMaterial.color);});
  assert.ok(atlasColors.has(nested.sample.authoring.leaf_material.color),'standalone private sample resolves its foreign atlas with no external library');
  const backAuthoring=copy(authoring);backAuthoring.workbench={...backAuthoring.workbench,sample_layout:source.sample_layout};resetBranchInstanceEdits(backAuthoring,['I',...source.absorbed_instance_ids,...source.absorbed_branch_ids]);
  backAuthoring.branch_instances=backAuthoring.branch_instances.filter(i=>!source.absorbed_instance_ids.includes(i.id));
  backAuthoring.branch_library=normalizeBranchLibrary([...backAuthoring.branch_library,{...copy(outer),id:'LOCAL_NESTED_TEST',revision:1,shape,sample,versions:[],organ_mode:sample.authoring.tree_organs.mode,organ_source_ids:sample.authoring.tree_organs.units.map(u=>u.id),organ_amount:sample.authoring.tree_organs.amount,organ_max_count:sample.authoring.tree_organs.max_count,organ_scale:1,organ_terminal_only:false}]);
  Object.assign(backAuthoring.branch_instances[0],{asset_id:'LOCAL_NESTED_TEST',shape,pinned_revision:1,assembly_manual:true,assembly_refined:true});
  const backSources=[...new Map([...sources.slice(0,rawSources.length),...localSources].map(s=>[s.id,s])).values()];
  const back=build(normalizeAuthoring(JSON.parse(JSON.stringify(backAuthoring))),settings,backSources);
  assert.equal(back.masterBranches.length,tree.masterBranches.length);assert.equal(back.masterPlacements.length,tree.masterPlacements.length);assert.equal(back.treeOrgans.length,tree.treeOrgans.length);
  assert.equal(back.authoring.manual_branches.length,0);assert.equal(back.authoring.unit_editing.items.length,0);assert.equal(back.authoring.unit_editing.removed.length,0);
  assert.deepEqual(back.authoring.unit_editing.rules[0].targets,['ROOT'],'mixed rule retains external carrier target');
  for(const b of tree.masterBranches){const id=source.branch_id_map[b.stableId]?'I.'+source.branch_id_map[b.stableId]:b.stableId,after=back.masterBranches.find(v=>v.stableId===id);assert.ok(after,b.stableId);after.points.forEach((p,n)=>assert.ok(p.distanceTo(b.points[n])<1e-6,'full reload wood pose'));assert.ok(Math.abs(after.startRadius-b.startRadius)<1e-8,b.stableId+' root radius scale applied once '+b.startRadius+' -> '+after.startRadius);assert.ok(Math.abs(after.endRadius-b.endRadius)<1e-8,b.stableId+' child tip radius scale applied once '+b.endRadius+' -> '+after.endRadius);}
  for(const p of tree.masterPlacements){const id=source.unit_id_map[p.stableId]?'I.'+source.unit_id_map[p.stableId]:p.stableId,after=back.masterPlacements.find(v=>v.stableId===id);assert.ok(after,p.stableId);assert.ok(after.position.distanceTo(p.position)<1e-6,p.stableId+' full reload leaf pose, including unedited sibling: '+JSON.stringify({before:p.position.toArray(),after:after.position.toArray(),offset:sample.authoring.unit_editing.items.find(v=>v.id===source.unit_id_map[p.stableId])?.offset}));assert.ok(Math.abs(after.scale-p.scale)<1e-6,'full reload leaf size');assert.equal(backSources[after.source]?.id,sources[p.source]?.id,p.stableId+' exact leaf source');}
  for(const p of tree.treeOrgans){const id=source.unit_id_map[p.stableId]?'I.'+source.unit_id_map[p.stableId]:p.stableId,after=back.treeOrgans.find(v=>v.stableId===id);assert.ok(after,p.stableId);assert.ok(after.position.distanceTo(p.position)<1e-6,'full reload organ pose');assert.ok(Math.abs(after.scale-p.scale)<1e-6,'full reload organ size');}
 }finally{assets.forEach(disposeBranchAsset);sources.forEach(s=>s.geometry.dispose());}
});

test('frozen blended junction is not blended again when its draft returns',()=>{
 const folder=new URL('../次枝资产/全植物次枝成品V1/香樟/',import.meta.url),name=fs.readdirSync(folder).find(n=>n.includes('短弯细梢')&&n.includes('混合')&&n.endsWith('.branchasset.json'));
 const item=JSON.parse(fs.readFileSync(new URL(name,folder))).asset,sources=item.sample.leaf_meshes.map(s=>({...s,geometry:deserializeGeometry(s.geometry)})),assets=[];
 try{
  const authoring=normalizeAuthoring({branch_shape:{branches:[{id:'ROOT',points:[[0,0,0],[0,0,4]],length:4,start_radius:.1,end_radius:.03}]},branch_library:[item],branch_instances:[{id:'I',parent:'ROOT',asset_id:item.id,linked:true,attach:.45,angle:65,azimuth:27,roll:17,scale:1.4,radius_scale:1.3,junction:normalizeJunction({enabled:true,length:.5,align:.8})}],recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']}});
  const settings=normalizeSettings({...item.sample.settings,leaf_density:0,max_triangles:8e6}),build=(a,s=settings)=>{const b=buildBranchAsset(s,null,sources,0,a,{instanced:true,resolveSources:true});assets.push(b);return b;};
  const tree=build(authoring),doc=captureCompleteInstanceDraft(tree,authoring.branch_instances[0],{settings,authoring,leaf_meshes:item.sample.leaf_meshes},sources),draft=build(doc.authoring,doc.settings),shape=captureCompleteDraftShape(draft,doc.authoring);
  const sample={settings:doc.settings,authoring:copy(doc.authoring),leaf_meshes:doc.leaf_meshes};freezeCompleteDraftUnits(draft,sample.authoring,shape,sources);
  const next=copy(authoring);next.branch_library.push({...copy(item),id:'LOCAL_JUNCTION',revision:1,shape,sample,versions:[]});Object.assign(next.branch_instances[0],{asset_id:'LOCAL_JUNCTION',shape,pinned_revision:1});next.branch_instances[0].junction.align=0;
  const back=build(normalizeAuthoring(next));
  for(const b of back.masterBranches){const old=tree.masterBranches.find(v=>v.stableId===b.stableId);assert.equal(b.points.length,old.points.length);b.points.forEach((p,n)=>assert.ok(p.distanceTo(old.points[n])<1e-6,'junction baked once'));}
 }finally{assets.forEach(disposeBranchAsset);sources.forEach(s=>s.geometry.dispose());}
});

test('freezing newly generated draft foliage resolves its real render source before saving',()=>{
 const folder=new URL('../次枝资产/全植物次枝成品V1/香樟/',import.meta.url),name=fs.readdirSync(folder).find(n=>n.includes('短弯细梢')&&n.includes('混合')&&n.endsWith('.branchasset.json'));
 const item=JSON.parse(fs.readFileSync(new URL(name,folder))).asset,sources=item.sample.leaf_meshes.map(s=>({...s,geometry:deserializeGeometry(s.geometry)})),assets=[];
 try{
  const settings=normalizeSettings({...item.sample.settings,leaf_density:4,max_triangles:8e6}),authoring=normalizeAuthoring({...copy(item.sample.authoring),branch_shape:item.shape,branch_instances:[],branch_library:[],unit_editing:{items:[],rules:[],removed:[]}});
  const draft=buildBranchAsset(settings,null,sources,0,authoring,{instanced:true});assets.push(draft);
  assert.ok(draft.masterPlacements.some(p=>p.source<0),'ordinary viewport leaves choose sources in render pass');
  const frozen=copy(authoring),shape=captureCompleteDraftShape(draft,authoring);freezeCompleteDraftUnits(draft,frozen,shape,sources);
  assert.ok(frozen.unit_editing.items.filter(v=>v.kind==='LEAF').every(v=>v.source_id&&v.source>=0));
  const reload=buildBranchAsset(settings,null,sources,0,normalizeAuthoring(JSON.parse(JSON.stringify(frozen))),{instanced:true});assets.push(reload);
  assert.equal(reload.masterPlacements.length,draft.masterPlacements.length);
  for(const p of draft.masterPlacements)assert.ok(reload.masterPlacements.find(v=>v.stableId===p.stableId).position.distanceTo(p.position)<1e-6);
 }finally{assets.forEach(disposeBranchAsset);sources.forEach(s=>s.geometry.dispose());}
});

test('nested owners using one geometry ID with two atlases receive separate private source IDs',()=>{
 const load=(plant,name)=>JSON.parse(fs.readFileSync(new URL(`../次枝资产/全植物次枝成品V1/${plant}/${name}.branchasset.json`,import.meta.url))).asset;
 const outer=load('香樟','香樟_短弯细梢_混合_成品V1'),otherTexture=load('红叶石楠','红叶石楠_短弯细梢_混合_成品V1').sample.authoring.leaf_material;
 const nested={...copy(outer),id:'SAME_SOURCE_OTHER_ATLAS',sample:{...copy(outer.sample),authoring:{...copy(outer.sample.authoring),leaf_material:otherTexture}}};
 const sources=outer.sample.leaf_meshes.map(s=>({...s,geometry:deserializeGeometry(s.geometry)})),assets=[];
 try{
  const settings=normalizeSettings({...outer.sample.settings,leaf_density:0,max_triangles:8e6}),authoring=normalizeAuthoring({branch_shape:{branches:[{id:'ROOT',points:[[0,0,0],[0,0,4]],length:4,start_radius:.1,end_radius:.03}]},branch_library:[outer,nested],branch_instances:[{id:'I',parent:'ROOT',asset_id:outer.id,linked:true,attach:.4,scale:1.4},{id:'N',parent:'I.'+outer.shape.branches[0].id,asset_id:nested.id,linked:true,attach:.7,scale:.6}],recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']}});
  const tree=buildBranchAsset(settings,null,sources,0,authoring,{instanced:true,resolveSources:true});assets.push(tree);
  const doc=captureCompleteInstanceDraft(tree,authoring.branch_instances[0],{settings,authoring,leaf_meshes:outer.sample.leaf_meshes},sources);
  const changed=doc.leaf_meshes.filter(s=>s.local_source_id);assert.ok(changed.length>0);assert.ok(changed.every(s=>doc.authoring.sample_materials[s.sampleLeafMaterialId].color===otherTexture.color));
  for(const p of tree.masterPlacements.filter(p=>p.branchStableId.startsWith('N.'))){const local=doc.authoring.unit_editing.items.find(v=>v.id===doc.authoring.workbench.source.unit_id_map[p.stableId]);assert.ok(changed.some(s=>s.id===local.source_id));}
  const localSources=doc.leaf_meshes.map(s=>({...s,geometry:deserializeGeometry(s.geometry)}));sources.push(...localSources);
  const draft=buildBranchAsset(doc.settings,null,localSources,0,doc.authoring,{instanced:true});assets.push(draft);assert.equal(draft.masterPlacements.length,tree.masterPlacements.length);
 }finally{assets.forEach(disposeBranchAsset);sources.forEach(s=>s.geometry.dispose());}
});

test('base organ atlas reference retains explicit texture priority over a solid flower color',()=>{
 const folder=new URL('../次枝资产/全植物次枝成品V1/红叶石楠/',import.meta.url),name=fs.readdirSync(folder).find(n=>n.includes('短弯细梢')&&n.includes('混合')&&n.endsWith('.branchasset.json'));
 const item=JSON.parse(fs.readFileSync(new URL(name,folder))).asset,base=item.sample.authoring.leaf_material,assets=[],geometries=[];
 item.sample.authoring.tree_organs.color='#aa2244';item.sample.authoring.tree_organs.units.forEach(s=>s.sampleLeafMaterial=copy(base));
 const rawSources=item.sample.leaf_meshes,sources=rawSources.map(s=>{const geometry=deserializeGeometry(s.geometry);geometries.push(geometry);return {...s,geometry};});
 try{
  const settings=normalizeSettings({...item.sample.settings,leaf_density:0,max_triangles:8e6}),authoring=normalizeAuthoring({branch_shape:{branches:[{id:'ROOT',points:[[0,0,0],[0,0,3]],length:3,start_radius:.1,end_radius:.03}]},leaf_material:base,branch_library:[item],branch_instances:[{id:'I',parent:'ROOT',asset_id:item.id,linked:true,attach:.5,scale:1.1}],tree_organs:item.sample.authoring.tree_organs,recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']}});
  const tree=buildBranchAsset(settings,null,sources,0,authoring,{instanced:true,resolveSources:true});assets.push(tree);
  assert.ok(tree.treeOrgans.length>0);const doc=captureCompleteInstanceDraft(tree,authoring.branch_instances[0],{settings,authoring,leaf_meshes:rawSources},sources);
  assert.ok(doc.authoring.tree_organs.units.every(u=>u.sampleLeafMaterialId==='BASE'&&!u.sampleLeafMaterial));assert.equal(Object.keys(doc.authoring.sample_materials).length,0);
  const standalone=JSON.parse(JSON.stringify(privatePayload(doc))),localSources=standalone.leaf_meshes.map(s=>{const geometry=deserializeGeometry(s.geometry);geometries.push(geometry);return {...s,geometry};});
  const reloaded=buildBranchAsset(standalone.settings,null,localSources,0,normalizeAuthoring(standalone.authoring));assets.push(reloaded);
  let textured=0;reloaded.group.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.category==='tree_organ')for(const mat of [mesh.material].flat()){assert.ok(materialEqual(mat.sampleLeafMaterial,base),'BASE organ resolves atlas after standalone reload');assert.equal(mat.color.getHexString(),'ffffff','explicit texture bypasses solid flower color');textured++;}});assert.ok(textured>0);
 }finally{assets.forEach(disposeBranchAsset);geometries.forEach(g=>g.dispose());}
});
