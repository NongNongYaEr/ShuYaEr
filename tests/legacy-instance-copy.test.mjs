import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { buildBranchAsset, disposeBranchAsset, deserializeGeometry, normalizeSettings } from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { cloneBranchInstances, moveInstanceToCarrier, rotateInstance, applyInstanceFamilyPlacement } from '../web/branch-instance-operations.js';

const directory = new URL('../assets/branch-asset-library/', import.meta.url);
function realSample(species) {
  const metaFile = fs.readdirSync(directory).find(name => {
    if (!name.endsWith('.meta.json')) return false;
    const m = JSON.parse(fs.readFileSync(new URL(name, directory), 'utf8'));
    return m.name.includes(species) && m.name.includes('短弯') && m.name.includes('混合');
  });
  const raw = JSON.parse(fs.readFileSync(new URL(metaFile.replace('.meta.json', '.branchasset.json'), directory), 'utf8'));
  return raw.asset || raw;
}
const camphor = realSample('香樟'), photinia = realSample('红叶石楠');
const out = path.resolve('.runtime/legacy-instance-copy');
fs.mkdirSync(out, { recursive: true });
const report = { samples: [camphor.name, photinia.name], cases: [] };
test.after(() => fs.writeFileSync(path.join(out, '验收.json'), JSON.stringify(report, null, 2)));
const rounded = n => Math.abs(n) < 1e-10 ? 0 : +n.toFixed(9);
const vector = v => v?.toArray().map(rounded) || null;
function unit(p, id, sources, organs, kind) {
  return { id, parent: p.branchStableId, source: (kind === 'treeOrgans' ? organs : sources)[p.source]?.id, position: vector(p.position), direction: vector(p.direction), normal: vector(p.normal), scale: rounded(p.scale), twist: rounded(p.twist || 0), t: rounded(p.branchT), phase: rounded(p.phase), random: rounded(p.random) };
}
function runCopy(legacy) {
  const assets = [], geometries = [];
  try {
    const sources = [...new Map([camphor, photinia].flatMap(a => a.sample.leaf_meshes).map(s => [s.id, s])).values()].map(s => {
      const geometry = deserializeGeometry(s.geometry); geometries.push(geometry); return { ...s, geometry };
    });
    const settings = normalizeSettings({ ...camphor.sample.settings, leaf_density: 0, max_leaves: 2000, max_triangles: 8000000, wind_strength: 0 });
    const authoring = normalizeAuthoring({
      branch_shape: { branches: [{ id: 'ROOT', points: [[0, 0, 0], [0, 0, 3]], length: 3, start_radius: .12, end_radius: .05 },
        { id: 'OTHER', parent: 'ROOT', attach: .35, points: [[0, 0, 1.05], [1.4, .2, 1.8], [2, .4, 3]], length: 3.2, start_radius: .09, end_radius: .03 }] },
      branch_library: [camphor, photinia],
      branch_instances: [
        { id: 'OUTER', parent: 'ROOT', asset_id: camphor.id, linked: true, pinned_revision: camphor.revision, attach: .5, scale: 1, angle: 63, azimuth: 17, roll: 12, variation: 0, seed: 29 },
        { id: 'NESTED', parent: 'OUTER.' + camphor.shape.branches[0].id, asset_id: photinia.id, linked: true, pinned_revision: photinia.revision, attach: .7, scale: .8, angle: 47, azimuth: 21, roll: -9, variation: 0, seed: 33 }
      ],
      tree_organs: photinia.sample.authoring.tree_organs,
      leaf_material: camphor.sample.authoring.leaf_material,
      recipe: { tags: ['SAMPLE_FOLIAGE_FROM_LIBRARY', 'FOLIAGE_ON_INSTANCES_ONLY', 'REAL_TREE_LEAVES'] }
    }, 42);
    const build = a => { const built = buildBranchAsset(settings, null, sources, 0, a, { legacy, instanced: true, resolveSources: true }); assets.push(built); return built; };
    const before = build(authoring);
    assert.equal(!!before.isInstancedAssembly, !legacy);
    assert(before.placements.length > 0 && before.treeOrgans.length > 0);
    const originalRecords = structuredClone(authoring.branch_instances);
    const result = cloneBranchInstances(authoring, [authoring.branch_instances[0]], record => 'COPY_' + record.id, before.masterBranches);
    assert.deepEqual(authoring.branch_instances.slice(0, 2), originalRecords);
    assert.equal(result.copies.length, 2);
    assert.equal(result.copies[0].seed, originalRecords[0].seed);
    assert.equal(result.copies[1].parent, 'COPY_OUTER.' + camphor.shape.branches[0].id);
    assert.equal(authoring.branch_library.length, 2, 'copy must not clone private atlas/whole sample per instance');
    const cold = build(normalizeAuthoring(JSON.parse(JSON.stringify(authoring))));
    for (const b of before.masterBranches.filter(b => b.instanceId)) {
      const copy = cold.masterBranches.find(v => v.stableId === result.mapId(b.stableId));
      assert(copy, b.stableId + ' copy branch');
      assert.deepEqual(copy.points.map(vector), b.points.map(vector), b.stableId + ' exact wood pose');
    }
    const entry = { legacy, compiled: !!cold.isInstancedAssembly, differences: [], counts: {}, originalsPreserved: true };
    report.cases.push(entry);
    for (const key of ['placements', 'treeOrgans']) {
      const previous = before[key].filter(p => p.branchStableId.startsWith('OUTER.') || p.branchStableId.startsWith('NESTED.'));
      const copies = cold[key].filter(p => p.branchStableId.startsWith('COPY_OUTER.') || p.branchStableId.startsWith('COPY_NESTED.'));
      entry.counts[key] = { before: previous.length, copies: copies.length };
      for (const p of previous) {
        const retained = cold[key].find(v => v.stableId === p.stableId);
        assert.deepEqual(unit(retained, p.stableId, sources, authoring.tree_organs.units, key), unit(p, p.stableId, sources, authoring.tree_organs.units, key), key + ' original remains unchanged');
        const id = result.mapId(p.stableId), copy = copies.find(v => v.stableId === id);
        const expected = { ...unit(p, id, sources, authoring.tree_organs.units, key), parent: result.mapId(p.branchStableId) };
        const actual = copy ? unit(copy, id, sources, authoring.tree_organs.units, key) : null;
        if (JSON.stringify(expected) !== JSON.stringify(actual)) entry.differences.push({ kind: key, expected, actual });
      }
      if (copies.length !== previous.length) entry.differences.push({ kind: key, counts: entry.counts[key] });
    }
    entry.passed = entry.differences.length === 0;
    assert.equal(entry.differences.length, 0, 'Shift+D must preserve all automatic unit positions/sources/pose; first difference: ' + JSON.stringify(entry.differences[0] || null));
    assert.equal(new Set(cold.placements.map(p => p.stableId)).size, cold.placements.length);
    assert.equal(new Set(cold.treeOrgans.map(p => p.stableId)).size, cold.treeOrgans.length);
    const secondCopy = cloneBranchInstances(authoring, [authoring.branch_instances.find(i => i.id === 'COPY_OUTER')], record => 'COPY_SECOND_' + record.id, cold.masterBranches);
    assert.equal(secondCopy.copies.find(i => i.id === 'COPY_SECOND_COPY_OUTER').unit_seed_owner, 'OUTER');
    assert.equal(secondCopy.copies.find(i => i.id === 'COPY_SECOND_COPY_NESTED').unit_seed_owner, 'NESTED');
    const repeated = build(normalizeAuthoring(JSON.parse(JSON.stringify(authoring))));
    for (const key of ['placements', 'treeOrgans']) for (const p of cold[key].filter(p => p.branchStableId.startsWith('COPY_'))) {
      const next = repeated[key].find(v => v.stableId === secondCopy.mapId(p.stableId));
      assert(next, 'copy of copy has a separate actual unit identity');
      assert.deepEqual(unit(next, next.stableId, sources, authoring.tree_organs.units, key), { ...unit(p, next.stableId, sources, authoring.tree_organs.units, key), parent: secondCopy.mapId(p.branchStableId) }, 'copy of copy keeps original random identity across cold reload');
    }
    entry.copyOfCopy = true;
    const originalUnits = key => before[key].map(p => unit(p, p.stableId, sources, authoring.tree_organs.units, key));
    const expectOriginals = asset => {
      for (const key of ['placements', 'treeOrgans']) assert.deepEqual(asset[key].filter(p => !p.branchStableId.startsWith('COPY_')).map(p => unit(p, p.stableId, sources, authoring.tree_organs.units, key)), originalUnits(key), 'editing duplicate keeps original ' + key);
      assert.deepEqual(authoring.branch_instances.slice(0, 2), originalRecords, 'editing duplicate never changes original instance records');
    };
    const old = structuredClone(authoring.branch_instances.find(i => i.id === 'COPY_OUTER'));
    const host = cold.masterBranches.find(b => b.stableId === 'OTHER'), prior = cold.masterBranches.find(b => b.stableId === old.parent);
    const target = moveInstanceToCarrier(old, host, prior, settings, .62, camphor.shape);
    applyInstanceFamilyPlacement(authoring, old, target, camphor.shape, cold.masterBranches, settings);
    const moved = build(normalizeAuthoring(JSON.parse(JSON.stringify(authoring))));
    expectOriginals(moved);
    assert.equal(authoring.branch_instances.find(i => i.id === 'COPY_OUTER').parent, 'OTHER');
    assert(moved.placements.some(p => p.stableId.startsWith('COPY_OUTER.') && p.position.distanceTo(cold.placements.find(v => v.stableId === p.stableId).position) > .1));
    const rotateBefore = structuredClone(authoring.branch_instances.find(i => i.id === 'COPY_OUTER'));
    const rotatedRecord = rotateInstance(rotateBefore, moved.masterBranches.find(b => b.stableId === 'OTHER'), settings, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .4), camphor.shape);
    applyInstanceFamilyPlacement(authoring, rotateBefore, rotatedRecord, camphor.shape, moved.masterBranches, settings);
    const rotated = build(normalizeAuthoring(JSON.parse(JSON.stringify(authoring))));
    expectOriginals(rotated);
    for (const key of ['placements', 'treeOrgans']) assert.deepEqual(rotated[key].filter(p => p.branchStableId.startsWith('COPY_SECOND_')).map(p => unit(p, p.stableId, sources, authoring.tree_organs.units, key)), repeated[key].filter(p => p.branchStableId.startsWith('COPY_SECOND_')).map(p => unit(p, p.stableId, sources, authoring.tree_organs.units, key)), 'moving first duplicate leaves a second duplicate with the same random owner independent');
    const removed = rotated.placements.find(p => p.stableId.startsWith('COPY_OUTER.'));
    authoring.leaf_edits.removed.push(removed.stableId);
    const edited = build(normalizeAuthoring(JSON.parse(JSON.stringify(authoring))));
    assert(!edited.placements.some(p => p.stableId === removed.stableId));
    expectOriginals(edited);
    entry.independentEditing = { idsUnique: true, movedToOther: true, rotated: true, deletedCopyLeaf: removed.stableId, originalsPreserved: true };
  } finally {
    assets.forEach(disposeBranchAsset);
    geometries.forEach(g => g.dispose());
  }
}

test('real camphor complete sample clone retains identical leaf and nested Photinia flower pose in compiled path', () => runCopy(false));
test('real camphor complete sample clone retains identical leaf and nested Photinia flower pose in legacy path and cold reload', () => runCopy(true));
