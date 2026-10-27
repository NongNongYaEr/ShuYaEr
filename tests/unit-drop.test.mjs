import { normalizeAuthoring } from '../web/authoring-state.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { addDroppedUnit, droppedUnitSource } from '../web/unit-drop-data.js';
import { plantPackFromDocument } from '../web/plant-unit-data.js';
import { buildBranchAsset, disposeBranchAsset, deserializeGeometry, createProjectDocument } from '../web/branch-kernel.js';
import { buildFoliageUnitSources } from '../web/foliage-unit.js';
import { authorUnits, normalizeUnitEditing } from '../web/unit-authoring.js';
import { createPVESkeleton, validatePVESkeleton } from '../web/pve-skeleton-export.js';

const folder = new URL('../次枝资产/全植物次枝成品V1/朴树/', import.meta.url);
const name = fs.readdirSync(folder).find(n => n.includes('短弯细梢') && n.includes('混合') && n.endsWith('.branchasset.json'));
const original = JSON.parse(fs.readFileSync(new URL(name, folder))).asset.sample;
original.authoring = normalizeAuthoring(original.authoring, original.settings.seed);
const pack = JSON.parse(fs.readFileSync(new URL('../assets/plant-unit-library/72cd5df4bbab69f06987de870eb23b0d79c02f001903392b06ee2bcd1bbe1375.plantunits.json', import.meta.url)));
const signature = a => [...a.placements, ...a.treeOrgans].map(p => [p.stableId, p.branchStableId, p.source, p.scale, p.position.toArray(), p.direction.toArray()]);
function build(doc) {
  const sources = doc.leaf_meshes.map(s => ({ ...s, geometry: deserializeGeometry(s.geometry) }));
  const asset = buildBranchAsset(doc.settings, null, sources, 0, doc.authoring, { resolveSources: true });
  return { asset, save: () => createProjectDocument(asset, sources, doc.authoring), dispose() { disposeBranchAsset(asset); sources.forEach(s => s.geometry.dispose()); } };
}

test('dragged real leaf and unused fruit retain calibration, source IDs, UVs and all existing placements through reload', () => {
  const doc = structuredClone(original), before = build(doc), baseline = signature(before.asset), b = before.asset.masterBranches[0];
  const initialSources = structuredClone(doc.leaf_meshes), leaf = pack.units.find(u => u.role === 'LEAF'), fruit = pack.units.find(u => u.role === 'FRUIT');
  addDroppedUnit(doc, pack, leaf, b, b.points[1], 'UNIT_leaf');
  doc.authoring.tree_organs.max_count = before.asset.treeOrgans.length + 2;
  const fruitRecord = addDroppedUnit(doc, pack, fruit, b, b.points[2], 'UNIT_fruit');
  addDroppedUnit(doc, pack, fruit, b, b.points[3], 'UNIT_fruit2');
  assert.deepEqual(doc.leaf_meshes, initialSources);
  assert.equal(doc.authoring.tree_organs.units.length, original.authoring.tree_organs.units.length + 1);
  assert.equal(doc.authoring.tree_organs.mode, original.authoring.tree_organs.mode);
  assert.deepEqual(doc.authoring.tree_organs.units.at(-1).geometry.uv, fruit.geometry.uv);
  assert.ok(doc.authoring.tree_organs.units.at(-1).manual_only);
  assert.ok(Math.abs(fruitRecord.scale - fruit.size_m) < 1e-6);
  const after = build(doc), saved = after.save(), reloaded = build(saved);
  try {
    assert.deepEqual(signature(after.asset).filter(p => !p[0].startsWith('UNIT_')), baseline);
    assert.equal(after.asset.placements.length + after.asset.treeOrgans.length, baseline.length + 3);
    assert.deepEqual(signature(reloaded.asset), signature(after.asset));
    assert.equal(saved.authoring.tree_organs.units.at(-1).manual_only, true);
  } finally { before.dispose(); after.dispose(); reloaded.dispose(); }
});

test('new leaf source is explicit-only, compensates aspect once, and survives project and card recovery', () => {
  const doc = structuredClone(original); doc.settings.leaf_aspect = .6;
  const before = build(doc), b = before.asset.masterBranches[0], baseline = signature(before.asset);
  const leaf = { ...pack.units[0], id: 'NEW', size_m: .17 }, isolated = { ...pack, id: 'drop_test' };
  const v = addDroppedUnit(doc, isolated, leaf, b, b.points[2], 'UNIT_new');
  const source = doc.leaf_meshes.at(-1);
  assert.ok(source.manual_only); assert.deepEqual(source.geometry.uv, leaf.geometry.uv);
  assert.ok(Math.abs(v.scale - .1) < 1e-8);
  const after = build(doc), saved = after.save(), reloaded = build(saved);
  try {
    assert.deepEqual(signature(after.asset).filter(p => p[0] !== v.id), baseline);
    assert.deepEqual(signature(after.asset), signature(reloaded.asset));
    assert.equal(saved.leaf_meshes.at(-1).manual_only, true);
    const restoredCard = plantPackFromDocument(saved).units.find(u => u.name === leaf.name && u.id.includes('NEW'));
    assert.equal(restoredCard.size_m, .17);
    assert.ok(restoredCard.geometry.position.every((v, i) => Math.abs(v - leaf.geometry.position[i]) < 1e-6), 'card geometry recovers physical aspect after reload');
  } finally { before.dispose(); after.dispose(); reloaded.dispose(); }
});

test('source matching uses IDs and validated legacy indices, never names; installed whole units reject additions', () => {
  assert.equal(droppedUnitSource([{ id: 'A', name: 'same' }], { id: 'embedded:x' }, { id: 'leaf:0:A' }), 0);
  assert.equal(droppedUnitSource([{ id: 'B', name: 'same' }], { id: 'embedded:x' }, { id: 'leaf:0:A', name: 'same' }), -1);
  assert.throws(() => addDroppedUnit(structuredClone(original), pack, pack.units[0], { instanceId: 'installed' }, null, 'x'), /可编辑/);
});

test('procedural leaf rules and pinnate compilation exclude manual-only sources without disposing imported geometry', () => {
  const g = deserializeGeometry(pack.units[0].geometry), manual = deserializeGeometry(pack.units[1].geometry);
  let disposed = false; manual.addEventListener('dispose', () => { disposed = true; });
  const sources = [{ id: 'A', geometry: g }, { id: 'B', geometry: manual, manual_only: true, weight: 100 }];
  const derived = buildFoliageUnitSources(sources, {}, { mode: 'PINNATE' });
  assert.equal(derived.sources[1].geometry, manual); derived.dispose(); assert.equal(disposed, false);
  const b = { id: 0, stableId: 'R', order: 0, points: [new THREE.Vector3(), new THREE.Vector3(0, 0, 1)] };
  const rules = normalizeUnitEditing({ rules: [{ id: 'r', kind: 'LEAF', spacing: .1 }] });
  const ps = authorUnits([], [b], rules, 'LEAF', sources, .1);
  assert.ok(ps.length > 0); assert.ok(ps.every(p => p.source === 0));
  g.dispose(); manual.dispose();
});

test('new explicit sources and attachments survive complete-sample instancing and software PVE materialization', () => {
  const doc = structuredClone(original), initial = build(doc), branch = initial.asset.masterBranches[0];
  const custom = { ...pack.units[0], id: 'NEW_LEAF' };
  addDroppedUnit(doc, pack, custom, branch, branch.points[2], 'UNIT_added_leaf');
  doc.authoring.tree_organs.max_count += 1;
  addDroppedUnit(doc, pack, pack.units.find(u => u.role === 'FRUIT'), branch, branch.points[3], 'UNIT_added_fruit');
  initial.dispose();
  const unit = JSON.parse(fs.readFileSync(new URL(name, folder))).asset; unit.sample = doc;
  const tree = normalizeAuthoring({ branch_shape: { branches: [{ id: 'ROOT', points: [[0, 0, 0], [0, 0, 2]], length: 2, start_radius: .1, end_radius: .06 }] },
    branch_library: [unit], branch_instances: [{ id: 'I', parent: 'ROOT', asset_id: unit.id, linked: true, attach: .5, scale: 1, variation: 0 }],
    recipe: { tags: ['SAMPLE_FOLIAGE_FROM_LIBRARY', 'FOLIAGE_ON_INSTANCES_ONLY'] }, tree_organs: { ...doc.authoring.tree_organs, mode: 'LEAVES' } });
  const sources = doc.leaf_meshes.map(s => ({ ...s, geometry: deserializeGeometry(s.geometry) })), allocated = [];
  try {
    const buildTree = instanced => { const a = buildBranchAsset({ ...doc.settings, leaf_density: 0, max_triangles: 8000000 }, null, sources, 0, tree, { instanced, resolveSources: true }); allocated.push(a); return a; };
    const preview = buildTree(true), exported = buildTree(false);
    assert.ok(preview.placements.some(p => p.stableId === 'I.UNIT_added_leaf'));
    assert.ok(preview.treeOrgans.some(p => p.stableId === 'I.UNIT_added_fruit'));
    assert.deepEqual(signature(preview), signature(exported));
    assert.ok(!validatePVESkeleton(createPVESkeleton(exported)).errors?.length);
  } finally { allocated.forEach(disposeBranchAsset); sources.forEach(s => s.geometry.dispose()); }
});
