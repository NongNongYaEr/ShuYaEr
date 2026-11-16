import test from 'node:test';
import { createRuntimeTestDirectory } from './runtime-test-directory.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as THREE from 'three';
import * as kernel from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { applyBarkMaterialAssignments, BARK_PRESETS, createBarkSurfaceMaterial } from '../web/bark-materials.js';
import { lightPoseKey, packLightTrack } from '../web/tree-light-data.js';
import { proceduralLightCarriers } from '../web/tree-light-carriers.js';
import { treeLightSurfaceInput } from '../web/v080-lights/surface-input.js';
import { trunkSurfaceIndex } from '../web/v080-lights/surface.js';
import { wrapImportedGuide } from '../web/v080-lights/wrap.js';
import { createPveBarkExporter, snapshotPveBarkBinding } from '../scripts/pve-bark-materials.mjs';
import { validatePackage } from '../scripts/pve-package.mjs';
import { hashPveUnitGeometry, equalPveUnitGeometry } from '../scripts/pve-final-geometry.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
test('PVE shares one 2K bark across carrier and reusable branches and preserves light binding', { timeout: 180000 }, t => {
  const unit = read(new URL('../assets/branch-asset-library/6c964da368bd799f7d84c6200c1d38bd607d65829affe754784888996d83079a.branchasset.json', import.meta.url));
  const second = { ...structuredClone(unit), id: 'ALT_BARK_SOURCE' };
  applyBarkMaterialAssignments(second.sample.authoring, BARK_PRESETS[3], [], { all: true });
  const library = [unit, second], sources = unit.sample.leaf_meshes;
  const authoring = normalizeAuthoring({
    branch_shape: { branches: [
      { id:'ROOT', parent:'', points:[[0,0,0],[0,0,4],[.3,0,8]], length:8, start_radius:.15, end_radius:.08 },
      { id:'HOST', parent:'ROOT', attach:.5, points:[[0,0,4],[1,1,4.3],[3,1,5]], length:3, start_radius:.08, end_radius:.03 },
    ] },
    branch_library: library,
    branch_instances: library.map((item, index) => ({ id:'I'+index, asset_id:item.id, linked:true,
      pinned_revision:item.revision, parent:'ROOT', attach:.1+index*.13, scale:1, variation:0, roll:index*17 })),
    leaf_material: unit.sample.authoring.leaf_material,
    recipe: { tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY'] },
  });
  applyBarkMaterialAssignments(authoring, { ...BARK_PRESETS[1], direction:'HORIZONTAL', scale_v_m:.5 }, [], { all:true });
  const settings = kernel.normalizeSettings({ ...unit.sample.settings, object_name:'共用树皮验收', leaf_density:0,
    max_triangles:8000000, preview_lod:0 });
  const leaves = sources.map(source => ({ ...source, geometry:kernel.deserializeGeometry(source.geometry) }));
  const tree = kernel.buildBranchAsset(settings, null, leaves, 0, authoring);
  try {
    tree.group.updateMatrixWorld(true, true);
    const { wood, branches } = proceduralLightCarriers(tree);
    const guides = branches.map(branch => ({ id:branch.stableId, branch }));
    const surface = treeLightSurfaceInput({ tree, wood, guides, ground:0 });
    const guide = surface.guides.find(guide => guide.id === 'ROOT');
    const params = { bottom:.4, top:1.2, pitch:.2, radius:.002, gap:.002, color:'#ffc777', intensity:1.5, scope:'main', direction:1 };
    const { tracks } = wrapImportedGuide(THREE, trunkSurfaceIndex(THREE, surface.mesh), guide,
      { ...params, from:0, to:1, range:[.402,1.198], phase:0, textureRepeat:.25, sections:[] });
    assert.ok(tracks.length, 'valid track projected onto actual carrier bark');
    authoring.tree_lights = { version:1, kind:'procedural', pose:lightPoseKey(surface.guides,0), ground:0, params, replaces:[],
      tracks:tracks.map(track => ({
        guide:guide.id, turns:(track.at(-1).station-track[0].station)/params.pitch,
        points:packLightTrack(Float32Array.from(track.flatMap(sample => [...sample.point, ...sample.radial]))),
      })),
    };
  } finally {
    kernel.disposeBranchAsset(tree);
    leaves.forEach(leaf => leaf.geometry.dispose());
  }
  const folder = createRuntimeTestDirectory(t, 'pve-bark-');
  const file = path.join(folder,'source.branch.json'), output = path.join(folder,'package');
  const source = Buffer.from(JSON.stringify({ format:'ProceduralBranchProject', version:4, settings, authoring, leaf_meshes:sources }));
  fs.writeFileSync(file, source);
  const result = spawnSync(process.execPath, [
    '--experimental-loader','./tests/vendor-loader.mjs','./scripts/export-pve-complete-units.mjs',
    '--tool','.','--project',file,'--out',output,'--geometry',
  ], { encoding:'utf8', timeout:120000, maxBuffer:2000000, windowsHide:true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(validatePackage(output, source).valid, true);
  assert.deepEqual(fs.readFileSync(file), source);

  const resolved = read(path.join(output,'whole.resolved.json'));
  const manifest = read(path.join(output,'complete_units.manifest.json'));
  const materials = resolved.imported_trunk_materials.materials;
  const shared = materials.find(material => material.tree_bark_role === 'shared');
  const light = materials.find(material => material.flow);
  assert.equal(materials.length, 2);
  assert.equal(shared.id, manifest.shared_tree_bark.material_id);
  assert.equal(manifest.units.length, 2);
  assert.ok(resolved.chunks.some(chunk => chunk.material_role === 'foliage'));
  assert.ok(resolved.chunks.some(chunk => chunk.material_role === 'light'
    && chunk.imported_trunk_material.material_id === light.id && chunk.light_uv && chunk.imported_trunk_skin));
  assert.equal(resolved.tree_light_uv.stride, 8);
  const wood = resolved.chunks.filter(chunk => chunk.material_role === 'bark');
  assert.ok(wood.some(chunk => chunk.instance_index === -1) && wood.some(chunk => chunk.instance_index >= 0));
  assert.ok(wood.every(chunk => chunk.imported_trunk_material.material_id === shared.id));
  const binary = fs.readFileSync(path.join(output, resolved.binary));
  const carrier = wood.find(chunk => chunk.host_branch_id === 'ROOT' && chunk.instance_index === -1);
  const u = Array.from({ length: carrier.vertex_count }, (_, index) => binary.readFloatLE(carrier.vertex_offset + index * 48 + 24));
  assert.ok(Math.max(...u) - Math.min(...u) > 1, 'horizontal physical repeat is baked into carrier UV0');
  const pngPath = path.join(output,shared.maps.normal.file), original = fs.readFileSync(pngPath);
  assert.equal(original.readUInt32BE(16), 2048);
  assert.equal(original.readUInt32BE(20), 2048);
  fs.appendFileSync(pngPath,'tampered');
  assert.throws(() => validatePackage(output,source), /实际材质贴图校验失败/);
  fs.writeFileSync(pngPath,original);
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
