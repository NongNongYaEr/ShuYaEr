import test from 'node:test';
import { createRuntimeTestDirectory } from './runtime-test-directory.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as THREE from 'three';
import * as kernel from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { applyBarkMaterialAssignments, BARK_PRESETS, DEFAULT_BARK_PRESET,ensureDefaultTreeBark,barkTextureFiles,createBarkSurfaceMaterial,generateBarkTextureMaps,barkBytesToBase64 } from '../web/bark-materials.js';
import {generateBarkCompanionMaps} from '../web/bark-map-generator.js';
import { createPveBarkExporter, snapshotPveBarkBinding } from '../scripts/pve-bark-materials.mjs';
import { validatePackage } from '../scripts/pve-package.mjs';
import { hashPveUnitGeometry, equalPveUnitGeometry } from '../scripts/pve-final-geometry.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const names = ['紧凑侧枝_深绿','紧凑侧枝_混合','紧凑侧枝_嫩绿','短弯细梢_深绿','短弯细梢_混合','短弯细梢_嫩绿'];
test('PVE real PNGs and physical bindings preserve six complete models; source workbench bark changes only its own complete version', { timeout: 180000 }, t => {
  const library = names.map(name => read(path.join('次枝资产/全植物次枝成品V1/香樟', `香樟_${name}_成品V1.branchasset.json`)).asset);
  const sources = [...new Map(library.flatMap(item => item.sample.leaf_meshes).map(item => [item.id, item])).values()];
  const authoring = normalizeAuthoring({ branch_shape: { branches: [
    { id:'ROOT',parent:'',points:[[0,0,0],[0,0,4],[.3,0,8]],length:8,start_radius:.15,end_radius:.08 },
    { id:'HOST',parent:'ROOT',attach:.5,points:[[0,0,4],[1,1,4.3],[3,1,5]],length:3,start_radius:.08,end_radius:.03 }] },
    branch_library:library,branch_instances:library.map((item,index) => ({ id:'I'+index,asset_id:item.id,linked:true,pinned_revision:item.revision,parent:'ROOT',attach:.1+index*.13,scale:1,variation:0,roll:index*17 })),
    leaf_material:library[0].sample.authoring.leaf_material,recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']} });
  const settings = kernel.normalizeSettings({ ...library[0].sample.settings,object_name:'树皮完整模型验收',leaf_density:0,max_triangles:8000000,preview_lod:0 });
  const folder = createRuntimeTestDirectory(t, 'pve-bark-');
  function run(name) {
    const file = path.join(folder,name+'.branch.json'), output = path.join(folder,name+'_PVE_Complete');
    fs.writeFileSync(file,JSON.stringify({format:'ProceduralBranchProject',version:4,settings,authoring,leaf_meshes:sources}));
    const result = spawnSync(process.execPath,['--experimental-loader','./tests/vendor-loader.mjs','./scripts/export-pve-complete-units.mjs','--tool','.','--project',file,'--out',output,'--geometry'],{encoding:'utf8',timeout:120000,maxBuffer:2000000,windowsHide:true});
    fs.writeFileSync(path.join(folder,name+'.log'),result.stdout+result.stderr);
    assert.equal(result.status,0,result.stderr || result.stdout);
    assert.equal(validatePackage(output,fs.readFileSync(file)).valid,true);
    return {file,output,manifest:read(path.join(output,'complete_units.manifest.json')),resolved:read(path.join(output,'whole.resolved.json')),skeleton:read(path.join(output,'whole.pve-skeleton.json'))};
  }
  const baseline = run('legacy');
  assert.equal(baseline.resolved.bark_materials,undefined);
  assert.ok(!fs.readdirSync(baseline.output).some(name => name.startsWith('bark-') || name.endsWith('.py')));
  ensureDefaultTreeBark(authoring);const libraryDefault=run('library_default');
  assert.equal(libraryDefault.resolved.bark_materials.length,1);
  for(const unit of libraryDefault.manifest.units)assert.equal(unit.glb_sha256,baseline.manifest.units.find(old=>old.id===unit.id).glb_sha256);
  const libraryMaps=libraryDefault.resolved.bark_materials[0].maps;
  for(const image of barkTextureFiles(DEFAULT_BARK_PRESET)){const map=libraryMaps[image.key];assert.equal(map.width,512);assert.equal(map.height,512);assert.deepEqual(fs.readFileSync(path.join(libraryDefault.output,map.file)),Buffer.from(image.bytes));}
  const paired=generateBarkCompanionMaps(generateBarkTextureMaps(DEFAULT_BARK_PRESET,512).color),generatedRecipe={...DEFAULT_BARK_PRESET,maps:Object.fromEntries(Object.entries(paired).map(([slot,m])=>[slot,{width:m.width,height:m.height,pixels:barkBytesToBase64(m.data),name:'生成 · '+slot}]))};
  applyBarkMaterialAssignments(authoring,generatedRecipe,[],{all:true});const generated=run('color_derived');
  for(const unit of generated.manifest.units)assert.equal(unit.glb_sha256,baseline.manifest.units.find(old=>old.id===unit.id).glb_sha256);
  for(const image of barkTextureFiles(generatedRecipe)){const map=generated.resolved.bark_materials[0].maps[image.key];assert.equal(map.width,512);assert.equal(map.height,512);assert.deepEqual(fs.readFileSync(path.join(generated.output,map.file)),Buffer.from(image.bytes));assert.equal(map.color_space,image.key==='color'?'srgb':'linear');}
  delete authoring.workbench.bark_materials;
  const sourceSnapshot = JSON.stringify(authoring.branch_library), instancesSnapshot = JSON.stringify(authoring.branch_instances);
  applyBarkMaterialAssignments(authoring,{...BARK_PRESETS[1],direction:'HORIZONTAL'},[],{all:true});
  const changed = run('carrier');
  assert.equal(JSON.stringify(authoring.branch_library),sourceSnapshot); assert.equal(JSON.stringify(authoring.branch_instances),instancesSnapshot);
  assert.equal(changed.manifest.units.length,6); assert.equal(changed.skeleton.complete_unit_assembly.leaf_instances,0); assert.equal(changed.skeleton.complete_unit_assembly.organ_instances,0);
  for (const unit of changed.manifest.units) { assert.equal(unit.glb_sha256,baseline.manifest.units.find(old => old.id === unit.id).glb_sha256); assert.equal(unit.bark_material_bindings,undefined); }
  assert.equal(changed.resolved.bark_materials.length,1);
  const carrierChunks = changed.resolved.chunks.filter(chunk => chunk.material_role === 'bark' && chunk.instance_index < 0);
  assert.ok(carrierChunks.length >= 2); assert.ok(carrierChunks.every(chunk => chunk.bark_material_binding));
  assert.ok(changed.resolved.chunks.filter(chunk => chunk.instance_index >= 0).every(chunk => !chunk.bark_material_binding), 'tree default does not override complete source wood');
  const repeats = carrierChunks.map(chunk => chunk.bark_material_binding.texture_transforms.color.repeat[0]);
  assert.ok(new Set(repeats).size >= 2,'physical repeats differ across carrier radius');
  for (const chunk of carrierChunks) {
    const t = chunk.bark_material_binding.texture_transforms.color;
    assert.equal(t.rotation,Math.PI/2); assert.deepEqual(t.center,[.5,.5]);
    const uv = new THREE.Vector2(.3,.67), expected = new THREE.Vector3(uv.x,uv.y,1).applyMatrix3(new THREE.Matrix3().fromArray(t.matrix));
    const texture = new THREE.Texture(); texture.repeat.fromArray(t.repeat); texture.offset.fromArray(t.offset); texture.center.fromArray(t.center); texture.rotation=t.rotation; texture.updateMatrix();
    const actual = new THREE.Vector3(.3,.67,1).applyMatrix3(texture.matrix); assert.ok(actual.distanceTo(expected)<1e-12); texture.dispose();
  }
  const ref = changed.resolved.bark_materials[0].maps.normal, pngPath = path.join(changed.output,ref.file), original = fs.readFileSync(pngPath);
  fs.appendFileSync(pngPath,'tampered'); assert.throws(() => validatePackage(changed.output,fs.readFileSync(changed.file)),/树皮 PNG 哈希/); fs.writeFileSync(pngPath,original);
  const dataPath = path.join(changed.output,'whole.resolved.json'), resolvedBytes = fs.readFileSync(dataPath), broken = structuredClone(changed.resolved);
  broken.chunks.find(chunk => chunk.bark_material_binding).bark_material_binding.texture_transforms.color.repeat[0] *= 2;
  fs.writeFileSync(dataPath,JSON.stringify(broken)); assert.throws(() => validatePackage(changed.output,fs.readFileSync(changed.file)),/铺贴矩阵与重复/); fs.writeFileSync(dataPath,resolvedBytes);
  assert.equal(validatePackage(changed.output,fs.readFileSync(changed.file)).valid,true);
  applyBarkMaterialAssignments(authoring.branch_library[0].sample.authoring,BARK_PRESETS[3],[],{all:true});
  const sourceChanged = run('source_version');
  assert.equal(sourceChanged.manifest.units.length,6);
  const edited = sourceChanged.manifest.units.find(unit => unit.id === library[0].id);
  assert.notEqual(edited.glb_sha256,baseline.manifest.units.find(unit => unit.id === edited.id).glb_sha256); assert.ok(edited.bark_material_bindings.length > 0);
  for (const unit of sourceChanged.manifest.units.filter(unit => unit.id !== edited.id)) assert.equal(unit.glb_sha256,baseline.manifest.units.find(old => old.id === unit.id).glb_sha256);
  assert.ok(sourceChanged.resolved.chunks.some(chunk => chunk.instance_index === 0 && chunk.bark_material_binding));
  assert.equal(sourceChanged.resolved.bark_material_setup.ue_material_application_verified,false);
  assert.ok(fs.readFileSync(path.join(sourceChanged.output,'树皮材质说明.txt'),'utf8').includes('未在本轮启动 UE 实际验证'));
  fs.writeFileSync(path.join(folder,'验收.json'),JSON.stringify({passed:true,source_classes:6,whole_units:6,legacy:baseline.manifest.units,carrier:changed.manifest.units,source_version:sourceChanged.manifest.units},null,2));
  console.log('真实树皮 PVE 包验收：'+folder);
});

test('historical complete variants retain bark transform and distinguish same-color recipes without changing legacy fingerprints', t => {
  const group = material => { const result = new THREE.Group(), geometry = new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3)); geometry.setIndex([0,1,2]); result.add(new THREE.Mesh(geometry,material)); return result; };
  const a = createBarkSurfaceMaterial({...BARK_PRESETS[0],seed:1}), b = createBarkSurfaceMaterial({...BARK_PRESETS[0],seed:2});
  a.userData.bark_pve_binding = snapshotPveBarkBinding(a); b.userData.bark_pve_binding = snapshotPveBarkBinding(b);
  for (const material of [a,b]) for (const slot of ['map','normalMap','roughnessMap']) { material[slot].dispose(); material[slot]=null; }
  const left=group(a),right=group(b);
  assert.notEqual(hashPveUnitGeometry(left),hashPveUnitGeometry(right)); assert.equal(equalPveUnitGeometry(left,right),false);
  const out=createRuntimeTestDirectory(t, 'pve-bark-variant-'),collector=createPveBarkExporter(out);
  collector.capture(left); assert.ok(a.userData.bark_pve_binding.material_id); assert.equal(collector.finish().materials.length,1);
  for (const value of [left,right]) value.traverse(mesh => {mesh.geometry?.dispose();mesh.material?.dispose();});
});
