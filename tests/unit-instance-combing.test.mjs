import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { buildBranchAsset, disposeBranchAsset, normalizeSettings, deserializeGeometry } from '../web/branch-kernel.js';
import { applyInstanceFamilyPlacement, evaluatedInstanceFrame } from '../web/branch-instance-operations.js';
import { resolvePveExportPlan } from '../web/pve-export-plan.js';
import { prepareUnitCombEntries, combUnitInstance, evaluateUnitInstanceCombing, advanceUnitCombEntries, unitCombOrientationState } from '../web/unit-instance-combing.js';
import { normalizeBranchShape } from '../web/branch-workbench-data.js';

const record = (id, parent, points) => ({ id, parent, attach: .5, points, length: 1, start_radius: .03, end_radius: .006 });
const shape = { branches: [record('R1', '', [[0, 0, 0], [1, 0, 0]]), record('B1', 'R1', [[.5, 0, 0], [.7, .4, .2]])] };
const fixture = (nested = true) => normalizeAuthoring({
  branch_shape: { branches: [record('ROOT', '', [[0, 0, 0], [0, 0, 2]])] },
  branch_library: [{ id: 'A', name: 'complete sample', revision: 3, shape }],
  branch_instances: [
    { id: 'I', asset_id: 'A', linked: true, pinned_revision: 3, parent: 'ROOT', attach: .4, scale: 1.2, radius_scale: 1.3, roll: 15, variation: .1, seed: 20,
      frame: { position: [0, 0, .8], direction: [1, 0, 0], parent_position: [0, 0, .8], parent_tangent: [0, 0, 1] } },
    ...(nested ? [{ id: 'N', asset_id: 'A', linked: true, pinned_revision: 3, parent: 'I.B1', attach: .7, scale: .5, variation: 0, seed: 21 }] : []),
    { id: 'O', asset_id: 'A', linked: true, pinned_revision: 3, parent: 'ROOT', attach: .9, scale: .8, variation: 0, seed: 22,
      frame: { position: [0, 0, 1.8], direction: [1, 0, 0], parent_position: [0, 0, 1.8], parent_tangent: [0, 0, 1] } },
  ], recipe: { tags: ['WHOLE_PLANT'] },
});
const settings = normalizeSettings({ leaf_density: 0, child_count: 0, wind_strength: 0 });
const project = point => ({ x: point.x * 100, y: point.y * 100, depth: point.z, clip: 0 });
const near = (a, b, message = '') => assert.ok(a.distanceTo(b) < 1e-7, `${message} distance ${a.distanceTo(b)}`);

test('complete-unit hit samples include internal twigs but display only the main axis', () => {
  const a = fixture(false), original = structuredClone(a), assets = [];
  try {
    const before = buildBranchAsset(settings, null, [], 0, a); assets.push(before);
    const prepare = sampleBranches => prepareUnitCombEntries({ authoring: a, branches: before.masterBranches, settings, selection: ['I'], sampleBranches });
    const rootOnly = prepare('ROOT'), complete = prepare('ALL'), twig = before.masterBranches.find(b => b.stableId === 'I.B1'), p = twig.points.at(-1);
    const options = { project, center: project(p), radius: 5, hardness: .5, depthMode: 'THROUGH', delta: new THREE.Vector3(0, 0, .12), worldRadius: .2 };
    assert.equal(evaluateUnitInstanceCombing(rootOnly, options).weights.get('I'), 0, 'the twig tip is outside the main-axis brush');
    const result = evaluateUnitInstanceCombing(complete, options);
    assert.deepEqual(result.updates.map(update => update.id), ['I']); assert.equal(result.weights.get('I'), 1);
    assert.equal(complete[0].sampleLines.length, 2); assert.equal(complete[0].displayLines.length, 1);
    assert.deepEqual(complete[0].sampleBranches.map(b => b.stableId), ['I.R1','I.B1']);
    const update = result.updates[0], advanced = advanceUnitCombEntries(complete, result.updates);
    near(advanced[0].frame.position, complete[0].frame.position, 'whole root remains fixed');
    for (let i = 0; i < complete[0].displayLines[0].length; i++) near(advanced[0].displayLines[0][i], complete[0].displayLines[0][i].clone().applyMatrix4(update.matrix));
    assert.deepEqual(a, original, 'hover and preview do not write internal twig geometry');
    applyInstanceFamilyPlacement(a, update.before, update.after, update.shape, before.masterBranches, settings);
    const after = buildBranchAsset(settings, null, [], 0, normalizeAuthoring(JSON.parse(JSON.stringify(a)))); assets.push(after);
    for (const branch of before.masterBranches) {
      const next = after.masterBranches.find(b => b.stableId === branch.stableId);
      branch.points.forEach((point, i) => near(next.points[i], branch.instanceId === 'I' ? point.clone().applyMatrix4(update.matrix) : point));
    }
    assert.deepEqual(a.branch_library, original.branch_library); assert.equal(a.branch_instances[0].asset_id, original.branch_instances[0].asset_id);
  } finally { assets.forEach(disposeBranchAsset); }
});

test('leaf and fruit attachment samples select only their whole owning instance and remain transient', () => {
  const a = fixture(false), asset = buildBranchAsset(settings, null, [], 0, a), original = structuredClone(a);
  try {
    const position = new THREE.Vector3(.3,2,.9), placements = [
      { stableId: 'I.FRUIT', branchStableId: 'I.B1', sourceInstanceId: 'O', position },
      { stableId: 'SKELETON.LEAF', branchStableId: 'ROOT', position },
      { stableId: 'GHOST.FRUIT', sourceInstanceId: 'MISSING', position },
      { stableId: 'O.BAD', branchStableId: 'O.R1', position: [0,Infinity,0] },
    ];
    const prepare = sampleBranches => prepareUnitCombEntries({ authoring: a, branches: asset.masterBranches, settings, scope: 'ALL', placements, sampleBranches });
    const rootOnly = prepare('ROOT'), complete = prepare('ALL');
    const options = { project, center: project(position), radius: 5, depthMode: 'THROUGH', delta: new THREE.Vector3(0,.15,0), worldRadius: .2 };
    assert.equal(evaluateUnitInstanceCombing(rootOnly, options).updates.length, 0, 'ROOT remains compatible and does not append organ samples');
    const result = evaluateUnitInstanceCombing(complete, options);
    assert.deepEqual(result.updates.map(update => update.id), ['I'], 'the actual parent branch owner wins over a stale sourceInstanceId');
    assert.equal(result.weights.get('O'), 0); assert.equal(complete.find(entry => entry.id === 'I').sampleLines.length, 3);
    const pointSample = complete[0].sampleLines.at(-1); near(pointSample[0], position); near(pointSample[1], position);
    const advanced = advanceUnitCombEntries(complete, result.updates), update = result.updates[0];
    near(advanced[0].sampleLines.at(-1)[0], position.clone().applyMatrix4(update.matrix));
    near(advanced[0].frame.position, complete[0].frame.position);
    assert.equal(advanced[0].displayLines.length, 1); assert.equal(advanced[0].instance.scale, complete[0].instance.scale);
    assert.deepEqual(a, original); near(position, new THREE.Vector3(.3,2,.9), 'source placement remains unchanged');
    assert.equal(update.after.asset_id, update.before.asset_id); assert.equal(update.after.pinned_revision, update.before.pinned_revision);
  } finally { disposeBranchAsset(asset); }
});

test('unit comb rotates around each real connector with exact size and thickness; every nested point follows rigidly after reload', () => {
  const a = fixture(), assets = [], original = structuredClone(a);
  try {
    const before = buildBranchAsset(settings, null, [], 0, a); assets.push(before);
    const entries = prepareUnitCombEntries({ authoring: a, branches: before.masterBranches, settings, selection: ['I.B1', 'N.R1'] });
    assert.deepEqual(entries.map(entry => entry.id), ['I'], 'selected parent and nested child only rotate once');
    assert.deepEqual(entries[0].familyIds, ['I', 'N']); assert.equal(entries[0].rootId, 'I.R1');
    const update = combUnitInstance(entries[0], { delta: new THREE.Vector3(0, .2, 0), strength: .65, worldRadius: 1 });
    assert.ok(update); assert.ok(Math.abs(update.matrix.determinant() - 1) < 1e-10);
    assert.equal(update.after.parent, update.before.parent); assert.equal(update.after.attach, update.before.attach);
    assert.equal(update.after.scale, update.before.scale); assert.equal(update.after.radius_scale, update.before.radius_scale);
    assert.equal(update.after.asset_id, update.before.asset_id); assert.equal(update.after.pinned_revision, update.before.pinned_revision);
    near(evaluatedInstanceFrame(update.after, update.shape, before.masterBranches, settings).position, entries[0].frame.position, 'connector stays at the mount');
    assert.deepEqual(a, original, 'pure brush preview does not mutate authoring');
    applyInstanceFamilyPlacement(a, update.before, update.after, update.shape, before.masterBranches, settings);
    const reloaded = buildBranchAsset(settings, null, [], 0, normalizeAuthoring(JSON.parse(JSON.stringify(a)))); assets.push(reloaded);
    for (const branch of before.masterBranches) {
      const next = reloaded.masterBranches.find(candidate => candidate.stableId === branch.stableId);
      const moved = ['I', 'N'].includes(branch.instanceId);
      for (let index = 0; index < branch.points.length; index++) near(next.points[index], moved ? branch.points[index].clone().applyMatrix4(update.matrix) : branch.points[index], branch.stableId);
      assert.ok(Math.abs(next.startRadius - branch.startRadius) < 1e-9); assert.ok(Math.abs(next.endRadius - branch.endRadius) < 1e-9);
    }
    assert.deepEqual(a.branch_library, original.branch_library); assert.equal(a.sculpt_layers.length, 0);
  } finally { assets.forEach(disposeBranchAsset); }
});

test('screen brush hits sparse segment interiors, uses hardness falloff, and separates surface, through and sphere depth', () => {
  const a = fixture(false), asset = buildBranchAsset(settings, null, [], 0, a);
  try {
    const entries = prepareUnitCombEntries({ authoring: a, branches: asset.masterBranches, settings, scope: 'ALL' });
    const options = { project, center: { x: 50, y: 0, depth: .8, world: new THREE.Vector3(.5, 0, .8) }, radius: 20,
      hardness: .2, strength: .7, worldRadius: .2, delta: new THREE.Vector3(0, .04, 0), depthRange: .4 };
    const surface = evaluateUnitInstanceCombing(entries, { ...options, scope: 'SURFACE' });
    assert.ok(surface.weights.get('I') > .99); assert.equal(surface.weights.get('O'), 0); assert.deepEqual(surface.updates.map(update => update.id), ['I']);
    const through = evaluateUnitInstanceCombing(entries, { ...options, scope: 'THROUGH' });
    assert.ok(through.weights.get('I') > .99); assert.ok(through.weights.get('O') > .99); assert.equal(through.updates.length, 2);
    const sphere = evaluateUnitInstanceCombing(entries, { ...options, scope: 'SPHERE' });
    assert.ok(sphere.weights.get('I') > .99); assert.equal(sphere.weights.get('O'), 0);
    const soft = evaluateUnitInstanceCombing(entries, { ...options, center: { x: 50, y: 16 }, scope: 'THROUGH' });
    assert.ok(soft.weights.get('I') > 0 && soft.weights.get('I') < .3);
    const hard = evaluateUnitInstanceCombing(entries, { ...options, center: { x: 50, y: 16 }, hardness: .9, scope: 'THROUGH' });
    assert.equal(hard.weights.get('I'), 1);
    const outside = evaluateUnitInstanceCombing(entries, { ...options, center: [50, 25], scope: 'THROUGH' });
    assert.equal(outside.updates.length, 0);
    const behind = evaluateUnitInstanceCombing(entries, { ...options, scope: 'THROUGH', project: point => ({ ...project(point), clip: 2 }) });
    assert.equal(behind.updates.length, 0);
  } finally { disposeBranchAsset(asset); }
});

test('explicit instance/array locks protect whole families, while old frozen curve locks remain eligible', () => {
  const a = fixture(), asset = buildBranchAsset(settings, null, [], 0, a);
  try {
    a.overrides['I.R1'] = { locked: true, curve_knots: [[0, 0, .8], [1, 0, .8]] };
    let entries = prepareUnitCombEntries({ authoring: a, branches: asset.masterBranches, settings, scope: 'ALL' });
    assert.deepEqual(entries.map(entry => entry.id), ['I', 'O'], 'curve freezing is distinct from whole-instance locking');
    a.branch_instances.find(instance => instance.id === 'N').assembly_locked = true;
    entries = prepareUnitCombEntries({ authoring: a, branches: asset.masterBranches, settings, scope: 'ALL' });
    assert.deepEqual(entries.map(entry => entry.id), ['O'], 'locked child cannot be moved indirectly with its parent');
    a.branch_arrays = [{ id: 'GROUP', locked: ['O'] }]; a.branch_instances.find(instance => instance.id === 'O').array_id = 'GROUP';
    assert.equal(prepareUnitCombEntries({ authoring: a, branches: asset.masterBranches, settings, scope: 'ALL' }).length, 0);
    delete a.branch_instances.find(instance => instance.id === 'N').assembly_locked;
    assert.equal(prepareUnitCombEntries({ authoring: a, branches: asset.masterBranches, settings, scope: 'ALL',
      isLocked: (instance, carrier) => carrier.stableId === 'ROOT' }).length, 1, 'explicit source carrier protection permits independent nested child only');
    assert.equal(prepareUnitCombEntries({ authoring: a, branches: asset.masterBranches, settings, selection: ['ROOT'] }).length, 0, 'selecting skeleton does not implicitly select its installed models');
  } finally { disposeBranchAsset(asset); }
});

test('continuous dabs accumulate the current rigid pose without resetting the start pose or modifying snapshots', () => {
  const a = fixture(false), asset = buildBranchAsset(settings, null, [], 0, a);
  try {
    const original = prepareUnitCombEntries({ authoring: a, branches: asset.masterBranches, settings, selection: ['I'] });
    let entries = original, accumulated = new THREE.Matrix4();
    const delta = new THREE.Vector3(0, .015, 0);
    for (let index = 0; index < 16; index++) {
      const update = combUnitInstance(entries[0], { delta, strength: .65, worldRadius: .8 }); assert.ok(update);
      accumulated.premultiply(update.matrix); entries = advanceUnitCombEntries(entries, [update]);
    }
    assert.ok(entries[0].frame.direction.y > .25); assert.equal(original[0].frame.direction.y, 0);
    near(entries[0].frame.position, original[0].frame.position); assert.equal(entries[0].instance.scale, original[0].instance.scale);
    for (let index = 0; index < original[0].samples.length; index++) near(entries[0].samples[index], original[0].samples[index].clone().applyMatrix4(accumulated));
    const persisted = evaluatedInstanceFrame(entries[0].instance, entries[0].shape, asset.masterBranches, settings);
    near(persisted.direction, entries[0].frame.direction); near(persisted.position, entries[0].frame.position);
    for (const options of [{ delta: new THREE.Vector3() }, { delta, strength: 0 }, { delta, weight: 0 }]) assert.equal(combUnitInstance(entries[0], options), null);
  } finally { disposeBranchAsset(asset); }
});

test('nonzero source connector and a sculpted scaled mount preserve the exact root and current world scale', () => {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), .8);
  const mount = new THREE.Matrix4().compose(new THREE.Vector3(2, -1, .5), q, new THREE.Vector3(2, 2, 2));
  const parent = { stableId: 'ROOT', points: [new THREE.Vector3(), new THREE.Vector3(0, 0, 3)].map(point => point.applyMatrix4(mount)), mountMatrix: mount };
  const instance = { ...fixture(false).branch_instances[0], frame: null, roll: 123 };
  const source = { ...fixture(false).branch_library[0].shape, connector: { position: [.1, .2, -.1], direction: new THREE.Vector3(.4, .8, .2).normalize().toArray() } };
  const frame = evaluatedInstanceFrame(instance, source, [parent], settings);
  const entry = { id: instance.id, instance, shape: source, parent, settings, branches: [parent], frame, familyIds: [instance.id] };
  const update = combUnitInstance(entry, { delta: new THREE.Vector3(.03, -.05, .02), strength: 1, worldRadius: .2 });
  const next = evaluatedInstanceFrame(update.after, source, [parent], settings);
  near(next.position, frame.position); near(next.direction, frame.direction.clone().applyQuaternion(update.rotation));
  near(new THREE.Vector3().setFromMatrixScale(next.matrix), new THREE.Vector3().setFromMatrixScale(frame.matrix));
  assert.equal(update.after.scale, instance.scale); assert.equal(update.after.radius_scale, instance.radius_scale);
});

test('six actual camphor models remain six reusable PVE classes with all source wood, leaves, colors and materials intact after combing', () => {
  const names = ['紧凑侧枝_深绿', '紧凑侧枝_混合', '紧凑侧枝_嫩绿', '短弯细梢_深绿', '短弯细梢_混合', '短弯细梢_嫩绿'];
  const library = names.map(name => JSON.parse(fs.readFileSync(new URL(`../次枝资产/全植物次枝成品V1/香樟/香樟_${name}_成品V1.branchasset.json`, import.meta.url))).asset);
  const originalLibrary = JSON.stringify(library);
  const sources = [...new Map(library.flatMap(item => item.sample.leaf_meshes).map(source => [source.id, source])).values()];
  const meshes = sources.map(source => ({ ...source, geometry: deserializeGeometry(source.geometry) })), assets = [];
  const a = normalizeAuthoring({ branch_shape: { branches: [record('ROOT', '', [[0, 0, 0], [0, 0, 8]])] }, branch_library: library,
    branch_instances: library.map((item, index) => ({ id: 'UNIT_' + index, parent: 'ROOT', attach: .1 + index * .13, asset_id: item.id, linked: true,
      pinned_revision: item.revision, scale: 1, variation: 0 })), leaf_material: library[0].sample.authoring.leaf_material,
    recipe: { tags: ['SAMPLE_FOLIAGE_FROM_LIBRARY', 'FOLIAGE_ON_INSTANCES_ONLY'] } });
  const s = normalizeSettings({ ...library[0].sample.settings, leaf_density: 0, max_triangles: 8000000, preview_lod: 0 });
  try {
    const before = buildBranchAsset(s, null, meshes, 0, a); assets.push(before);
    const entries = prepareUnitCombEntries({ authoring: a, branches: before.masterBranches, settings: s, scope: 'ALL' }); assert.equal(entries.length, 6);
    const updates = entries.map(entry => combUnitInstance(entry, { delta: new THREE.Vector3(.01, .04, .02), strength: .7, worldRadius: .4 })).filter(Boolean);
    assert.equal(updates.length, 6);
    for (const update of updates) applyInstanceFamilyPlacement(a, update.before, update.after, update.shape, before.masterBranches, s);
    const after = buildBranchAsset(s, null, meshes, 0, normalizeAuthoring(JSON.parse(JSON.stringify(a)))); assets.push(after);
    const plan = resolvePveExportPlan(after, a); assert.equal(plan.units.length, 6); assert.ok(plan.units.every(unit => !unit.variantRequired));
    assert.equal(new Set(plan.units.map(unit => unit.sourceInstance.asset_id)).size, 6);
    assert.equal(after.report.triangles, before.report.triangles); assert.equal(after.masterPlacements.length, before.masterPlacements.length);
    assert.equal(after.treeOrgans.length, before.treeOrgans.length);
    const byId = new Map(updates.map(update => [update.id, update]));
    for (const placement of before.masterPlacements) {
      const id = placement.branchStableId.split('.')[0], update = byId.get(id), next = after.masterPlacements.find(unit => unit.stableId === placement.stableId);
      near(next.position, placement.position.clone().applyMatrix4(update.matrix), placement.stableId); assert.equal(next.source, placement.source);
      assert.ok(Math.abs(next.scale - placement.scale) < 1e-10, 'evaluated leaf size is preserved through floating-point rotation');
    }
    const materials = asset => { const records = new Map(); asset.group.traverse(mesh => {
      if (mesh.isMesh && mesh.userData.stable_id?.startsWith('UNIT_') && mesh.material?.color) records.set(mesh.userData.stable_id,
        [mesh.material.name, mesh.material.color.getHexString(), mesh.material.roughness, Boolean(mesh.material.map)]);
    }); return records; };
    assert.deepEqual(materials(after), materials(before), 'per-source palette and texture presence are unchanged');
    // Source calibration belongs to a reusable model version, never to an
    // individual fruit/leaf placement or private tree instance.
    a.branch_library.forEach(item => { item.shape.connector.hang_direction = [0, 0, 1]; });
    const calibratedLibrary = JSON.stringify(a.branch_library);
    let current = after;
    for (const orientation of ['DOWN', 'ROLL']) {
      const entries = prepareUnitCombEntries({ authoring:a, branches:current.masterBranches, settings:s, scope:'ALL' });
      const changes = entries.map(entry => combUnitInstance(entry, { orientation, delta:new THREE.Vector3(0,.015,0), strength:.7, worldRadius:.4 })).filter(Boolean);
      assert.equal(changes.length,6,orientation+' affects six complete models');
      for(const update of changes)applyInstanceFamilyPlacement(a,update.before,update.after,update.shape,current.masterBranches,s);
      const loaded=buildBranchAsset(s,null,meshes,0,normalizeAuthoring(JSON.parse(JSON.stringify(a))));assets.push(loaded);
      const exportPlan=resolvePveExportPlan(loaded,a);assert.equal(exportPlan.units.length,6);assert.ok(exportPlan.units.every(unit=>!unit.variantRequired),orientation+' preserves source reuse');
      assert.equal(loaded.report.triangles,before.report.triangles);assert.equal(loaded.masterPlacements.length,before.masterPlacements.length);assert.equal(loaded.treeOrgans.length,before.treeOrgans.length);
      assert.deepEqual(materials(loaded),materials(before));assert.equal(JSON.stringify(a.branch_library),calibratedLibrary,orientation+' never changes source calibration or contents');
      const matrices=new Map(changes.map(update=>[update.id,update.matrix])),placements=new Map(loaded.masterPlacements.map(placement=>[placement.stableId,placement]));
      for(const placement of current.masterPlacements){const next=placements.get(placement.stableId);near(next.position,placement.position.clone().applyMatrix4(matrices.get(placement.branchStableId.split('.')[0])),orientation+' whole leaf follow');assert.equal(next.source,placement.source);}
      current=loaded;
    }
    assert.equal(JSON.stringify(library), originalLibrary); assert.equal(a.sculpt_layers.length, 0); assert.deepEqual(a.overrides, {});
  } finally { assets.forEach(disposeBranchAsset); meshes.forEach(source => source.geometry.dispose()); }
});

test('shared source lookup is cached but missing historical revisions keep distinct private fallback shapes', () => {
  const a = fixture(false); a.branch_instances[1].asset_id = 'A';
  const asset = buildBranchAsset(settings, null, [], 0, a);
  try {
    let calls = 0;
    let entries = prepareUnitCombEntries({ authoring: a, branches: asset.masterBranches, settings, scope: 'ALL',
      resolveShape: instance => { calls++; return a.branch_library[0].shape; } });
    assert.equal(calls, 1); assert.equal(entries[0].shape, entries[1].shape);
    a.branch_instances.forEach((instance, index) => { instance.pinned_revision = 2; instance.shape = structuredClone(a.branch_library[0].shape); instance.shape.branches[0].points.at(-1)[1] = index; });
    entries = prepareUnitCombEntries({ authoring: a, branches: asset.masterBranches, settings, scope: 'ALL' });
    assert.notEqual(entries[0].shape, entries[1].shape); assert.equal(entries[1].shape.branches[0].points.at(-1)[1], 1);
  } finally { disposeBranchAsset(asset); }
});

test('DOWN turns the complete unit long axis toward fixed gravity for either stroke direction, with immutable roots and family geometry', () => {
  const a = fixture(), asset = buildBranchAsset(settings, null, [], 0, a);
  try {
    const [entry] = prepareUnitCombEntries({ authoring: a, branches: asset.masterBranches, settings, selection: ['I'] });
    const down = new THREE.Vector3(0, 0, -1), before = structuredClone(a);
    const forward = combUnitInstance(entry, { orientation:'DOWN', downDirection:down, delta:new THREE.Vector3(0,.03,0), strength:.8, worldRadius:.5 });
    const backward = combUnitInstance(entry, { orientation:'DOWN', downDirection:down, delta:new THREE.Vector3(0,-.03,0), strength:.8, worldRadius:.5 });
    near(new THREE.Vector3().fromArray(forward.after.frame.direction), new THREE.Vector3().fromArray(backward.after.frame.direction), 'reverse stroke does not turn gravity upward');
    assert.ok(entry.longAxis.clone().transformDirection(forward.matrix).dot(down) > entry.longAxis.dot(down));
    let working = [entry];
    for (let index = 0; index < 40; index++) {
      const update=combUnitInstance(working[0],{orientation:'DOWN',downDirection:down,delta:new THREE.Vector3(.04,0,0),strength:.8,worldRadius:.5});
      if (update) working=advanceUnitCombEntries(working,[update]);
    }
    assert.ok(working[0].longAxis.dot(down) > .99);
    near(working[0].frame.position, entry.frame.position);assert.equal(working[0].instance.scale,entry.instance.scale);assert.equal(working[0].instance.radius_scale,entry.instance.radius_scale);
    assert.deepEqual(a,before,'continuous gravity preview never modifies original source or authoring');
    const rotated=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2),world=new THREE.Matrix4().makeRotationFromQuaternion(rotated);
    const localDown=down.clone().transformDirection(world.clone().invert());
    const state=unitCombOrientationState(entry,{orientation:'DOWN',downDirection:localDown});
    near(state.down.clone().transformDirection(world),down,'a rotated model container still uses world gravity');
  } finally {disposeBranchAsset(asset);}
});

test('ROLL rotates the complete model around its long axis and preserved connector, aligning only its calibrated whole-model reference', () => {
  const a=fixture(),source=a.branch_library[0].shape;source.connector.hang_direction=[0,0,1];
  const asset=buildBranchAsset(settings,null,[],0,a);
  try {
    let entries=prepareUnitCombEntries({authoring:a,branches:asset.masterBranches,settings,selection:['I']});
    const original=entries[0],down=new THREE.Vector3(0,0,-1),before=structuredClone(a),matrices=[];
    for(let index=0;index<40;index++){
      const update=combUnitInstance(entries[0],{orientation:'ROLL',downDirection:down,delta:new THREE.Vector3(0,.04,0),strength:.8,worldRadius:.5});
      if(update){matrices.push(update.matrix);entries=advanceUnitCombEntries(entries,[update]);}
    }
    near(entries[0].longAxis,original.longAxis,'rolling never tilts the stem long axis');
    near(entries[0].frame.position,original.frame.position);near(entries[0].frame.direction,original.frame.direction);
    const reference=new THREE.Vector3(...source.connector.hang_direction).transformDirection(entries[0].frame.matrix);
    assert.ok(reference.dot(down)>.99);assert.equal(entries[0].instance.scale,original.instance.scale);assert.equal(entries[0].instance.radius_scale,original.instance.radius_scale);
    const cumulative=new THREE.Matrix4();matrices.forEach(matrix=>cumulative.premultiply(matrix));
    near(entries[0].samples.at(-1),original.samples.at(-1),'both root and long-axis tip remain fixed');
    applyInstanceFamilyPlacement(a,original.instance,entries[0].instance,original.shape,asset.masterBranches,settings);
    const loaded=buildBranchAsset(settings,null,[],0,normalizeAuthoring(JSON.parse(JSON.stringify(a))));
    try {
      for(const branch of asset.masterBranches.filter(branch=>['I','N'].includes(branch.instanceId))){const next=loaded.masterBranches.find(candidate=>candidate.stableId===branch.stableId);
        branch.points.forEach((point,index)=>near(next.points[index],point.clone().applyMatrix4(cumulative),branch.stableId+' whole-family roll'));
      }
      assert.deepEqual(a.branch_library,before.branch_library);assert.deepEqual(a.sculpt_layers,[]);
    } finally {disposeBranchAsset(loaded);}
  } finally {disposeBranchAsset(asset);}
});

test('ROLL reports missing, parallel and invalid references instead of guessing fruit axes or mutating a model', () => {
  const a=fixture(false),asset=buildBranchAsset(settings,null,[],0,a);
  try {
    const [entry]=prepareUnitCombEntries({authoring:a,branches:asset.masterBranches,settings,selection:['I']});
    const brush={orientation:'ROLL',delta:new THREE.Vector3(0,.1,0),center:[50,0],radius:25,scope:'THROUGH',project};
    let result=evaluateUnitInstanceCombing([entry],brush);assert.equal(result.updates.length,0);assert.equal(result.weights.get('I'),0);assert.equal(result.skipped.get('I'),'MISSING_REFERENCE');
    entry.shape={...entry.shape,connector:{...entry.shape.connector,hang_direction:[1,0,0]}};
    assert.equal(unitCombOrientationState(entry,{orientation:'ROLL'}).skipReason,'PARALLEL_REFERENCE');
    entry.shape={...entry.shape,connector:{...entry.shape.connector,hang_direction:[0,0,1]}};
    assert.equal(unitCombOrientationState(entry,{orientation:'ROLL',downDirection:entry.longAxis}).skipReason,'PARALLEL_GRAVITY');
    assert.equal(unitCombOrientationState(entry,{orientation:'DOWN',downDirection:new THREE.Vector3()}).skipReason,'INVALID_GRAVITY');
    assert.equal(combUnitInstance(entry,{orientation:'ROLL',downDirection:entry.longAxis,delta:new THREE.Vector3(0,.1,0)}),null);
  } finally {disposeBranchAsset(asset);}
  const old=normalizeBranchShape(shape);assert.ok(!Object.hasOwn(old.connector,'hang_direction'),'older sources do not gain fabricated metadata');
  for(const invalid of [[0,0,0],[NaN,0,1],[0,1],null])assert.ok(!Object.hasOwn(normalizeBranchShape({...shape,connector:{hang_direction:invalid}}).connector,'hang_direction'));
  const calibrated=normalizeBranchShape({...shape,connector:{hang_direction:[0,0,5]}});
  assert.deepEqual(calibrated.connector.hang_direction,[0,0,1]);assert.deepEqual(normalizeBranchShape(JSON.parse(JSON.stringify(calibrated))),calibrated,'calibration persists as source metadata');
});
