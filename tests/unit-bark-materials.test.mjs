import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as k from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { captureBranchDuplicate } from '../web/branch-duplicate.js';

const source = JSON.parse(fs.readFileSync(new URL('../次枝资产/全植物次枝成品V1/香樟/香樟_紧凑侧枝_深绿_成品V1.branchasset.json', import.meta.url), 'utf8')).asset;
function fixture() {
  const sources = source.sample.leaf_meshes.map(s => ({ ...s, geometry: k.deserializeGeometry(s.geometry) }));
  const authoring = normalizeAuthoring({
    branch_shape: { branches: [{ id: 'ROOT', parent: '', points: [[0, 0, 0], [0, 0, 3]], length: 3, start_radius: .12, end_radius: .05 }] },
    branch_library: [source], branch_instances: ['ONE', 'TWO'].map((id, n) => ({ id, asset_id: source.id, linked: true,
      pinned_revision: source.revision, parent: 'ROOT', attach: .3 + n * .4, scale: 1, variation: 0 })),
    leaf_material: source.sample.authoring.leaf_material,
    recipe: { tags: ['SAMPLE_FOLIAGE_FROM_LIBRARY', 'FOLIAGE_ON_INSTANCES_ONLY'] },
  });
  const settings = k.normalizeSettings({ ...source.sample.settings, leaf_density: 0, max_triangles: 8000000 });
  return { sources, authoring, settings };
}
const wood = asset => {
  const result = [];
  asset.group.traverse(mesh => { if (mesh.isMesh && ['branch', 'junction'].includes(mesh.userData.category)) result.push(mesh); });
  return result;
};
const geometrySignature = asset => ({
  branches: asset.masterBranches.map(b => [b.stableId, b.parentId, b.points.map(p => p.toArray()), b.startRadius, b.endRadius]),
  leaves: asset.masterPlacements.map(p => [p.stableId, p.source, p.position.toArray(), p.scale]),
  organs: asset.treeOrgans.map(p => [p.stableId, p.source, p.position.toArray(), p.scale]),
  triangles: asset.report.triangles,
});

for (const mode of ['compiled', 'instanced', 'legacy']) test(`TREE wood color changes only ROOT, real complete units keep source wood: ${mode}`, () => {
  const f = fixture(), assets = [], expected = k.createBranchMaterials(f.settings);
  try {
    for (const color of ['#ff0000', '#0000ff']) {
      const asset = k.buildBranchAsset({ ...f.settings, bark_color: color }, null, f.sources, 0, f.authoring,
        { legacy: mode === 'legacy', instanced: mode === 'instanced' });
      assets.push(asset);
      const meshes = wood(asset), root = meshes.find(m => m.userData.stable_id === 'ROOT');
      const units = meshes.filter(m => m !== root);
      assert.equal(root.material.color.getHexString(), color.slice(1));
      assert.ok(units.length > 0);
      for (const mesh of units) {
        assert.notEqual(mesh.material, root.material, 'unit never borrows structural palette');
        assert.equal(mesh.material.name, 'M_Bark', 'PVE material role remains compatible');
        assert.equal(mesh.material.color.getHexString(), expected.bark.color.getHexString());
        assert.equal(mesh.material.roughness, expected.bark.roughness);
        assert.equal(mesh.material.bumpScale, expected.bark.bumpScale);
        assert.equal(Boolean(mesh.material.map), Boolean(expected.bark.map));
      }
      if (asset.materialize) {
        asset.materialize();
        for (const mesh of wood(asset).filter(m => m.userData.stable_id?.startsWith('ONE.'))) {
          assert.equal(mesh.material.color.getHexString(), expected.bark.color.getHexString());
        }
      }
      const reloaded = k.buildBranchAsset({ ...f.settings, bark_color: color }, null, f.sources, 0,
        normalizeAuthoring(JSON.parse(JSON.stringify(f.authoring))), { legacy: mode === 'legacy', instanced: mode === 'instanced' });
      assets.push(reloaded);
      assert.deepEqual(geometrySignature(asset), geometrySignature(reloaded), 'cold rebuild preserves all complete contents');
    }
    assert.deepEqual(geometrySignature(assets[0]), geometrySignature(assets[2]), 'bark change does not alter wood/leaf/org layout');
  } finally {
    assets.forEach(k.disposeBranchAsset); k.disposeMaterials(expected); f.sources.forEach(s => s.geometry.dispose());
  }
});

test('legacy internal curve edits and copied unit snapshots retain source wood and complete contents', () => {
  const f = fixture(), assets = [], expected = k.createBranchMaterials(f.settings);
  try {
    const initial = k.buildBranchAsset(f.settings, null, f.sources, 0, f.authoring, { legacy: true }); assets.push(initial);
    const branch = initial.masterBranches.find(b => b.stableId === 'ONE.R1');
    const points = branch.points.map((p, n) => p.clone().add({ x: 0, y: n * .005, z: 0 }).toArray());
    f.authoring.overrides[branch.stableId] = { curve_knots: points, curve_samples: points, locked: true };
    const edited = k.buildBranchAsset(f.settings, null, f.sources, 0, f.authoring, { legacy: true }); assets.push(edited);
    assert.notDeepEqual(geometrySignature(edited).branches, geometrySignature(initial).branches);
    const operation = captureBranchDuplicate(edited, new Set([branch.stableId]), 'COPY', f.sources);
    f.authoring.sculpt_layers.push({ id: 'COPY', name: 'old snapshot', enabled: true, strength: 1, branches: {}, operation });
    for (const color of ['#ff0000', '#0000ff']) {
      const rebuilt = k.buildBranchAsset({ ...f.settings, bark_color: color }, null, f.sources, 0, f.authoring, { legacy: true }); assets.push(rebuilt);
      const copied = wood(rebuilt).filter(m => m.userData.stable_id?.startsWith('COPY_'));
      assert.equal(copied.length, operation.records.length);
      for (const mesh of copied) assert.equal(mesh.material.color.getHexString(), expected.bark.color.getHexString());
      assert.ok(rebuilt.masterPlacements.length > edited.masterPlacements.length, 'snapshot leaves survive');
    }
    assert.deepEqual(geometrySignature(assets[2]), geometrySignature(assets[3]));
  } finally {
    assets.forEach(k.disposeBranchAsset); k.disposeMaterials(expected); f.sources.forEach(s => s.geometry.dispose());
  }
});

for (const legacy of [false, true]) test(`unit palettes dispose once while borrowed skeleton palette and source leaf geometry survive: ${legacy ? 'legacy' : 'compiled'}`, () => {
  const f = fixture(), palette = k.createBranchMaterials(f.settings), events = new Map();
  const watch = object => { if (object && !events.has(object)) { events.set(object, 0); object.addEventListener('dispose', () => events.set(object, events.get(object) + 1)); } };
  Object.values(palette).forEach(watch); f.sources.forEach(s => watch(s.geometry));
  let asset;
  try {
    asset = k.buildBranchAsset(f.settings, palette, f.sources, 0, f.authoring, { legacy, instanced: !legacy });
    const owned = legacy ? asset.unitBarkMaterials : [...asset.compiledSampleMaterials];
    const textures = new Set();
    for (const material of owned) { watch(material); for (const key of ['map', 'normalMap', 'bumpMap']) if (material[key]) textures.add(material[key]); }
    textures.forEach(watch);
    k.disposeBranchAsset(asset); asset = null;
    for (const material of owned) assert.equal(events.get(material), 1, 'source material released exactly once');
    for (const texture of textures) assert.equal(events.get(texture), 1, 'owned source texture released exactly once');
    for (const material of Object.values(palette)) assert.equal(events.get(material), 0, 'external structural palette stays usable');
    for (const s of f.sources) assert.equal(events.get(s.geometry), 0, 'input leaf geometry remains caller owned');
    const rebuilt = k.buildBranchAsset(f.settings, palette, f.sources, 0, f.authoring, { legacy });
    k.disposeBranchAsset(rebuilt);
  } finally {
    k.disposeBranchAsset(asset); k.disposeMaterials(palette); f.sources.forEach(s => s.geometry.dispose());
  }
});
