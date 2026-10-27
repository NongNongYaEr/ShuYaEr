import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildBranchAsset, disposeBranchAsset, deserializeGeometry, DEFAULT_SETTINGS, normalizeSettings, createProjectDocument } from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { BARK_PRESETS, applyBarkMaterialAssignments } from '../web/bark-materials.js';
import { createGlbExportScene } from '../web/glb-export.js';

const folder = new URL('../次枝资产/全植物次枝成品V1/朴树/', import.meta.url);
const filename = fs.readdirSync(folder).find(n => n.includes('短弯细梢') && n.includes('混合') && n.endsWith('.branchasset.json'));
const source = JSON.parse(fs.readFileSync(new URL(filename,folder),'utf8')).asset;
const assets = [], geometries = [];
test.afterEach(() => { assets.splice(0).forEach(disposeBranchAsset); geometries.splice(0).forEach(g => g.dispose()); });
function fixture() {
  const leaves = source.sample.leaf_meshes.map(s => { const geometry = deserializeGeometry(s.geometry); geometries.push(geometry); return { ...s, geometry }; });
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, leaf_density:0, max_triangles:8000000, collision_avoidance:false });
  const authoring = normalizeAuthoring({ branch_shape:{branches:[{id:'ROOT',parent:'',points:[[0,0,0],[0,0,3]],length:3,start_radius:.3,end_radius:.25}]},
    branch_library:[source],branch_instances:[0,1].map(n=>({id:'I'+n,asset_id:source.id,linked:true,parent:'ROOT',attach:.3+n*.3,scale:.8,angle:60,azimuth:n*37,seed:42,variation:0})),
    recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY','REAL_TREE_LEAVES']},
    tree_organs:{...source.sample.authoring.tree_organs,mode:'LEAVES'} },42);
  const build = (a,instanced=true,legacy=false) => { const asset=buildBranchAsset(settings,null,leaves,0,a,{instanced,legacy}); assets.push(asset); return asset; };
  return {settings,authoring,leaves,build};
}
function barkMeshes(asset) { const meshes=[];asset.group.traverse(o=>{if(o.isMesh&&o.userData.category==='branch')meshes.push(o);});return meshes; }

test('carrier bark survives cold project reload, bypasses placement shortcut and never changes complete-unit prototypes',()=>{
  const f=fixture(), before=f.build(f.authoring), next=normalizeAuthoring(f.authoring);
  const sourceSnapshot=JSON.stringify(next.branch_library), placements=JSON.stringify(next.branch_instances);
  applyBarkMaterialAssignments(next,BARK_PRESETS[1],[],{all:true});
  assert.equal(before.updateAssemblyTransforms(f.settings,next),false,'material changes cannot be swallowed by matrix-only reuse');
  assert.equal(before.updateSupportingBranches(f.settings,next),false,'support updater must not retain stale material');
  const changed=f.build(next), document=createProjectDocument(changed,f.leaves,next), reloaded=f.build(normalizeAuthoring(JSON.parse(JSON.stringify(document)).authoring));
  for(const asset of [changed,reloaded]) {
    const meshes=barkMeshes(asset), carrier=meshes.find(m=>m.userData.stable_id==='ROOT');
    assert.equal(carrier.material.userData.bark_material.style,'OLD');
    assert.ok(carrier.material.map.isDataTexture&&carrier.material.normalMap&&carrier.material.roughnessMap);
    const unit=meshes.filter(m=>m!==carrier);
    assert.ok(unit.length>0);assert.ok(unit.every(m=>!m.material.userData.bark_material),'tree recipe excludes all complete-unit wood');
    assert.equal(asset.report.compiled_samples,1);assert.equal(asset.authoring.branch_instances.length,2);
  }
  assert.equal(JSON.stringify(next.branch_library),sourceSnapshot);assert.equal(JSON.stringify(next.branch_instances),placements);
  assert.deepEqual(changed.authoring.workbench.bark_materials,reloaded.authoring.workbench.bark_materials);
});

test('source bark is reused by whole units in both compiled and legacy paths, independently of carrier palette',()=>{
  const f=fixture(), next=normalizeAuthoring(f.authoring), sample=next.branch_library[0].sample;
  applyBarkMaterialAssignments(sample.authoring,BARK_PRESETS[3],[],{all:true});
  applyBarkMaterialAssignments(next,BARK_PRESETS[2],[],{all:true});
  for(const legacy of [false,true]) {
    const asset=f.build(next,!legacy,legacy), meshes=barkMeshes(asset);
    const carrier=meshes.find(m=>m.userData.stable_id==='ROOT');assert.equal(carrier.material.userData.bark_material.style,'VERTICAL');
    const unit=meshes.filter(m=>m!==carrier);assert.ok(unit.length);assert.ok(unit.every(m=>m.material.userData.bark_material.style==='PALE'));
    const distinct=new Set(unit.map(m=>m.material));assert.ok(distinct.size<=sample.authoring.branch_shape.branches.length+1,'same source has shared palettes');
  }
});

test('GLB export retains actual bark textures and transforms while removing duplicated recipe extras only from export clones',()=>{
  const f=fixture();applyBarkMaterialAssignments(f.authoring,BARK_PRESETS[4],['ROOT']);const asset=f.build(f.authoring,false);
  const material=barkMeshes(asset).find(m=>m.userData.stable_id==='ROOT').material, recipe=structuredClone(material.userData.bark_material);
  const exported=createGlbExportScene(asset.group,{singleMesh:true});
  try {
    const mesh=exported.scene.children[0], copy=mesh.material.find(m=>m.userData.bark_key);
    assert.notEqual(copy,material);assert.equal(copy.userData.bark_material,undefined);
    assert.equal(copy.map,material.map);assert.equal(copy.normalMap,material.normalMap);assert.equal(copy.roughnessMap,material.roughnessMap);
    assert.deepEqual(copy.map.repeat,material.map.repeat);assert.deepEqual(material.userData.bark_material,recipe);
  }finally{exported.dispose();}
  assert.deepEqual(material.userData.bark_material,recipe,'export never strips editable project recipe');
});

test('successive carrier edits reuse unchanged bark GPU palettes, dispose unused temporary textures, and update physical repeats with thickness',()=>{
  // Choose a tile narrow enough for both radii to cross an integer seam repeat.
  const f=fixture();applyBarkMaterialAssignments(f.authoring,{...BARK_PRESETS[1],scale_u_m:.65},['ROOT']);const asset=f.build(f.authoring);
  const original=barkMeshes(asset).find(m=>m.userData.stable_id==='ROOT').material, maps=[original.map,original.normalMap,original.roughnessMap];
  let disposed=0;maps.forEach(texture=>texture.addEventListener('dispose',()=>disposed++));
  for(let step=0;step<3;step++) {
    const next=normalizeAuthoring(asset.authoring);
    next.overrides.ROOT={...next.overrides.ROOT,curve_knots:[[0,0,0],[.1*(step+1),0,3]]};
    assert.equal(asset.updateSupportingBranches(f.settings,next),true);
    assert.equal(barkMeshes(asset).find(m=>m.userData.stable_id==='ROOT').material,original,'shape-only edits retain uploaded PBR textures');
    assert.deepEqual(asset.unitBarkMaterials,[original]);
  }
  assert.equal(disposed,0,'retained palette was not disposed');
  const next=normalizeAuthoring(asset.authoring);next.branch_shape.branches[0].start_radius=.45;
  assert.equal(asset.updateSupportingBranches(f.settings,next),true);
  const fresh=barkMeshes(asset).find(m=>m.userData.stable_id==='ROOT').material;
  assert.notEqual(fresh,original);assert.ok(fresh.map.repeat.x>maps[0].repeat.x);assert.equal(disposed,3,'old unused maps disposed once');
  assert.deepEqual(asset.unitBarkMaterials,[fresh]);
});
