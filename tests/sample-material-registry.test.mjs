import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {buildBranchAsset,createProjectDocument,deserializeGeometry,disposeBranchAsset,normalizeSettings} from '../web/branch-kernel.js';
import {importSampleMaterials,remapSampleMaterial,resolveSampleMaterial} from '../web/sample-materials.js';

const sampleFor=species=>{const folder=new URL('../次枝资产/全植物次枝成品V1/'+species+'/',import.meta.url),file=fs.readdirSync(folder).find(n=>n.includes('短弯细梢')&&n.includes('混合')&&n.endsWith('.branchasset.json'));return JSON.parse(fs.readFileSync(new URL(file,folder))).asset;};

test('sample atlas imports remap conflicting references, retain explicit priority and serialize references without expanded PNGs',()=>{
  const cam=sampleFor('香樟'),photo=sampleFor('红叶石楠'),base=cam.sample.authoring.leaf_material,red=photo.sample.authoring.leaf_material;
  const foreign={...photo.sample,authoring:{...photo.sample.authoring,sample_materials:{MAT_COLLISION:red}},leaf_meshes:[{...photo.sample.leaf_meshes[0],sampleLeafMaterialId:'MAT_COLLISION'},{...photo.sample.leaf_meshes[1],sampleLeafMaterialId:'BASE'}]};
  const a=normalizeAuthoring({leaf_material:base,sample_materials:{MAT_COLLISION:base},branch_shape:{branches:[{id:'ROOT',points:[[0,0,0],[0,0,2]],start_radius:.1,end_radius:.02}]},unit_editing:{items:foreign.leaf_meshes.map((s,i)=>({id:'L'+i,parent:'ROOT',kind:'LEAF',source_id:s.id,t:.3+i*.3,scale:.1}))}});
  const imported=importSampleMaterials(a,foreign);assert.ok(imported.changed);assert.notEqual(imported.references.MAT_COLLISION,'MAT_COLLISION');assert.notEqual(imported.references.BASE,'BASE');
  assert.deepEqual(a.sample_materials.MAT_COLLISION,base,'old atlas is not overwritten');
  const raw=foreign.leaf_meshes.map(s=>remapSampleMaterial(s,imported.references));for(const source of raw)assert.deepEqual(resolveSampleMaterial(source,a),red);
  assert.deepEqual(resolveSampleMaterial({sampleLeafMaterial:base,sampleLeafMaterialId:raw[0].sampleLeafMaterialId},a),base,'old explicit material keeps priority');
  assert.deepEqual(resolveSampleMaterial({sampleLeafMaterialId:'BASE'},a,foreign),red,'BASE is scoped to the source sample');
  const sources=raw.map(s=>({...s,geometry:deserializeGeometry(s.geometry)})),assets=[];
  try{
    const settings=normalizeSettings({...cam.sample.settings,leaf_density:0,max_triangles:8e6}),asset=buildBranchAsset(settings,null,sources,0,a);assets.push(asset);
    const resolvedSources=sources.map(s=>({...s,sampleLeafMaterial:resolveSampleMaterial(s,a)}));
    const saved=JSON.parse(JSON.stringify(createProjectDocument(asset,resolvedSources,a)));
    assert.ok(saved.leaf_meshes.every(s=>s.sampleLeafMaterialId&&!s.sampleLeafMaterial),'resolved runtime PNGs do not re-enter saved source rows');
    assert.equal(saved.authoring.sample_materials.MAT_COLLISION.color,base.color);
    assert.ok(JSON.stringify(saved.leaf_meshes).length<JSON.stringify(red).length,'source references are smaller than one foreign atlas');
    const reloaded=saved.leaf_meshes.map(s=>({...s,geometry:deserializeGeometry(s.geometry)}));
    try{const again=buildBranchAsset(saved.settings,null,reloaded,0,normalizeAuthoring(saved.authoring));assets.push(again);assert.equal(again.masterPlacements.length,2);const textures=[];again.group.traverse(o=>{if(o.userData.category==='leaf')textures.push(o.material.sampleLeafMaterial?.color);});assert.ok(textures.length&&textures.every(v=>v===red.color));}finally{reloaded.forEach(s=>s.geometry.dispose());}
  }finally{assets.forEach(disposeBranchAsset);sources.forEach(s=>s.geometry.dispose());}
});

test('a saved instance-seeded layout retains legacy foliage while shared samples still use one reusable prototype',()=>{
  const item=sampleFor('香樟'),sources=item.sample.leaf_meshes.map(s=>({...s,geometry:deserializeGeometry(s.geometry)})),assets=[];
  const settings=normalizeSettings({...item.sample.settings,max_triangles:8e6}),raw={branch_shape:{branches:[{id:'ROOT',points:[[0,0,0],[0,0,4]],start_radius:.15,end_radius:.03}]},branch_library:[item],branch_instances:Array.from({length:12},(_,i)=>({id:'BRANCH_'+i,parent:'ROOT',asset_id:item.id,linked:true,attach:.1+i*.06,angle:55,azimuth:i*137.5,scale:.6})),recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']}};
  const build=a=>{const asset=buildBranchAsset(settings,null,sources,0,a,{instanced:true,resolveSources:true});assets.push(asset);return asset;};
  try{
    const shared=build(normalizeAuthoring(raw));assert.equal(shared.report.compiled_samples,1);assert.ok(shared.isInstancedAssembly);
    const seeded=build(normalizeAuthoring({...raw,workbench:{sample_layout:'INSTANCE_SEEDED',source:{sample_layout:'INSTANCE_SEEDED',ids:['old']}}}));assert.ok(!seeded.isInstancedAssembly);
    const saved=JSON.parse(JSON.stringify(createProjectDocument(seeded,sources,seeded.authoring))),reloaded=build(normalizeAuthoring(saved.authoring));
    assert.equal(reloaded.authoring.workbench.sample_layout,'INSTANCE_SEEDED');assert.equal(reloaded.authoring.workbench.source.sample_layout,'INSTANCE_SEEDED');assert.ok(!reloaded.isInstancedAssembly);
    const pose=b=>b.masterPlacements.map(p=>[p.stableId,p.position.toArray(),p.direction.toArray(),p.scale,p.source]);assert.deepEqual(pose(reloaded),pose(seeded),'cold save/reload does not reseed untouched branches');
  }finally{assets.forEach(disposeBranchAsset);sources.forEach(s=>s.geometry.dispose());}
});
