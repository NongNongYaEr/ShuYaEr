import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { normalizeBranchArrays, generateArrayInstances, arrayPlacement } from '../web/branch-array-data.js';
import { planAssemblyGroup, structureGroupState, removeStructureMember, deleteStructureGroup, detachStructureGroup } from '../web/assembly-group-data.js';

const shape = { branches: [{ id: 'R1', parent: '', points: [[0,0,0],[1,0,0]], length: 1, start_radius: .025, end_radius: .005 }] };
const library = [{ id: 'PINE', name: '完整松树侧枝', revision: 1, shape }, { id: 'OTHER', name: '另一支', revision: 1, shape }];
const branches = [
  { id: 0, stableId: 'TRUNK', parentId: -1, order: 0, points: [new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,10)], children: [] },
  { id: 1, stableId: 'SIDE', parentId: 0, order: 1, points: [new THREE.Vector3(0,0,5), new THREE.Vector3(3,0,5)], children: [] },
];
function fixture({ legacy = false, count = 4, ringCount = 3 } = {}) {
  const a = normalizeAuthoring({ branch_library: library });
  const group = normalizeBranchArrays([{ id: 'GROUP', name: '松树下层', parent: 'TRUNK', asset_id: 'PINE', arrangement: 'RING', count, ringCount, identity_version: legacy ? 1 : 2, scale: 1, seed: 311 }])[0];
  a.branch_arrays = [group]; a.branch_instances = generateArrayInstances(group, a.branch_library[0].shape, branches[0], a.branch_library);
  return normalizeAuthoring(a);
}
const groupOf = a => a.branch_arrays[0];
const plan = (a, patch = {}, options = {}) => planAssemblyGroup(a, branches, { ...groupOf(a), ...patch }, a.branch_library, options);

test('adopting a legacy numeric group preserves every mount and stable child prefix, then changing ring size retains station identity', () => {
  const a = fixture({ legacy: true }), original = structuredClone(a.branch_instances);
  const adopted = plan(a).authoring;
  assert.deepEqual(adopted.branch_instances, original);
  const expanded = plan(adopted, { ringCount: 5 }).authoring;
  for (const old of original) {
    const next = expanded.branch_instances.find(i => i.id === old.id);
    assert(next, old.id); assert.equal(next.array_station, old.array_station); assert.equal(next.array_spoke, old.array_spoke);
    assert.equal(next.scale, old.scale); assert.equal(next.seed, old.seed);
  }
  assert.equal(new Set(expanded.branch_instances.map(i => i.id)).size, expanded.branch_instances.length);
});

test('moving, sculpting and locking members keeps their complete mounts and content through reroll, scope change and fewer layers', () => {
  const a = plan(fixture()).authoring;
  const moved = a.branch_instances[0], sculpted = a.branch_instances[1], locked = a.branch_instances.at(-1);
  Object.assign(moved, { parent: 'SIDE', attach: .77, scale: 1.6, assembly_manual: true, frame: { position:[1,2,3],direction:[0,1,0],parent_tangent:[1,0,0],parent_position:[0,0,5] } });
  a.overrides[sculpted.id + '.R1'] = { radius: 1.3 }; locked.assembly_locked = true;
  const originals = [moved, sculpted, locked].map(i => structuredClone(i));
  const next = plan(a, { seed: 888, parent: 'SIDE', count: 1, scale: .4, asset_id: 'OTHER' }).authoring;
  originals.forEach(original => assert.deepEqual(next.branch_instances.find(i => i.id === original.id), original));
  assert(next.branch_instances.some(i => !originals.some(o => o.id === i.id) && i.asset_id === 'OTHER'));
  const state = structureGroupState(next, groupOf(next), branches, next.branch_library);
  assert.equal(state.locked.length, 1); assert.equal(state.manual.length, 2);
});

test('individual deletion stays empty after shrinking, expanding, JSON reload and reroll; explicit fill alone creates it again', () => {
  let a = plan(fixture()).authoring; const id = a.branch_instances[4].id;
  // Old Delete callers only removed an instance; group editing records that gap.
  a.branch_instances = a.branch_instances.filter(i => i.id !== id);
  a = plan(a, { count: 1 }).authoring;
  assert(groupOf(a).removed.includes(id));
  a = normalizeAuthoring(JSON.parse(JSON.stringify(a)));
  a = plan(a, { count: 8, seed: 600 }).authoring;
  assert(!a.branch_instances.some(i => i.id === id));
  const kept = structuredClone(a.branch_instances);
  a = plan(a, { removed: [] }, { fillMissing: true }).authoring;
  assert(a.branch_instances.some(i => i.id === id));
  assert.equal(groupOf(a).removed.length, 0);
  kept.forEach(i => assert.deepEqual(a.branch_instances.find(n => n.id === i.id), i));
});

test('detaching a hand branch then filling its slot never reuses its globally live ID', () => {
  const a = plan(fixture()).authoring, detached = a.branch_instances[0];
  groupOf(a).removed.push(detached.id); detached.array_id = ''; detached.assembly_manual = true;
  const original = structuredClone(detached);
  const result = plan(a, { removed: [] }, { fillMissing: true }).authoring;
  assert.deepEqual(result.branch_instances.find(i => i.id === detached.id), original);
  assert.equal(new Set(result.branch_instances.map(i => i.id)).size, result.branch_instances.length);
  assert(result.branch_instances.some(i => i.array_id === 'GROUP' && i.array_station === 0 && i.array_spoke === 0 && i.id !== detached.id));
});

test('ordinary reroll leaves refined members exactly intact and explicit restore resets only selected mounts', () => {
  const a = plan(fixture()).authoring, changed = a.branch_instances[0];
  changed.assembly_refined = true; changed.azimuth = 80; changed.frame = { position:[1,2,3],direction:[0,1,0],parent_tangent:[1,0,0],parent_position:null };
  const original = structuredClone(changed), untouched = structuredClone(a.branch_instances.slice(1));
  const rolled = plan(a, { seed: 999 }).authoring;
  assert.deepEqual(rolled.branch_instances.find(i => i.id === changed.id), original);
  const restored = plan(a, {}, { forceAutomatic: [changed.id] }).authoring;
  const expected = generateArrayInstances(groupOf(restored), restored.branch_library[0].shape, branches[0], restored.branch_library).find(i => i.id === changed.id);
  assert.deepEqual(arrayPlacement(restored.branch_instances.find(i => i.id === changed.id)), arrayPlacement(expected));
  assert(!restored.branch_instances.find(i => i.id === changed.id).assembly_refined);
  untouched.forEach(i => assert.deepEqual(restored.branch_instances.find(n => n.id === i.id), i));
});

test('structure groups use the same 1600 instance and recipe-specific wood budgets as leaf-fill assembly', () => {
  const a = fixture({ count: 32, ringCount: 8 });
  const result = plan(a); assert.equal(result.records.length, 256);
  const others = Array.from({length: 1500}, (_,n) => ({...a.branch_instances[0],id:'OTHER_' + n,array_id:''}));
  a.branch_instances.push(...others); assert.throws(() => plan(a), /1600/);
  const dense = fixture({ count: 32, ringCount: 8 });
  dense.branch_library[0].shape.branches = Array.from({length: 30}, (_,n) => ({...shape.branches[0],id:'B'+n,parent:n?'B0':''}));
  assert.throws(() => plan(dense), /2200/);
  dense.recipe.tags.push('DENSE_AUTHORED_SAMPLE_ASSEMBLY');
  assert.equal(plan(dense).woodLimit, 11000);
});

test('new complete groups retain sample registry organs and individual removal remembers the empty member', () => {
  const a = normalizeAuthoring({branch_library:library});
  a.branch_library[0].sample = {authoring:{tree_organs:{units:[{id:'CONE'}]}}};
  const result = planAssemblyGroup(a, branches, {id:'NEW',parent:'TRUNK',asset_id:'PINE',identity_version:2,count:2}, a.branch_library);
  assert(result.authoring.recipe.tags.includes('SAMPLE_FOLIAGE_FROM_LIBRARY')); assert.equal(result.authoring.tree_organs.units[0].id, 'CONE');
  removeStructureMember(result.authoring, 'NEW', result.records[0].id);
  assert(result.authoring.branch_arrays[0].removed.includes(result.records[0].id));
  assert.equal(result.authoring.branch_instances.length, 1);
});

test('source version ownership stays independent of automatic placement and survives explicit placement restore', () => {
  const a = plan(fixture()).authoring, versioned = a.branch_instances[0];
  versioned.linked = false; versioned.pinned_revision = 7; versioned.shape.branches[0].length = 2;
  assert.equal(structureGroupState(a, groupOf(a), branches).states.get(versioned.id), 'AUTO');
  const updated = plan(a, { scale: 1.5 }).authoring.branch_instances.find(i => i.id === versioned.id);
  assert.notEqual(updated.scale, versioned.scale); assert.equal(updated.pinned_revision, 7); assert.equal(updated.linked, false); assert.deepEqual(updated.shape, versioned.shape);
  versioned.assembly_manual = true; versioned.assembly_refined = true; versioned.parent = 'SIDE';
  const restored = plan(a, {}, {forceAutomatic:[versioned.id]}).authoring.branch_instances.find(i => i.id === versioned.id);
  assert.equal(restored.parent, 'TRUNK'); assert.equal(restored.pinned_revision, 7); assert.equal(restored.linked, false); assert.deepEqual(restored.shape, versioned.shape);
  assert(!restored.assembly_manual); assert(!restored.assembly_refined);
});

test('explicitly removing a legacy group-only lock releases automatic placement and ring layer offset remains editable', () => {
  const a = plan(fixture({legacy:true})).authoring, id = a.branch_instances[3].id;
  groupOf(a).locked.push(id); const before = a.branch_instances.find(i => i.id === id);
  const kept = plan(a, {scale:2}).authoring.branch_instances.find(i => i.id === id); assert.deepEqual(kept,before);
  const unlocked = plan(a, {locked:[], scale:2, layerOffset:40}).authoring.branch_instances.find(i => i.id === id);
  assert.notEqual(unlocked.scale, before.scale); assert.equal(unlocked.azimuth - before.azimuth, 15);
});

test('deleting a refined member clears its local descendants and unit edits before explicitly filling a fresh slot', () => {
  const a = plan(fixture()).authoring, record = a.branch_instances[0], prefix = record.id + '.R1';
  record.assembly_refined = true;
  a.overrides[prefix] = {curve_knots:[[0,0,0],[2,0,0]],radius:1.5};
  a.sculpt_layers.push({id:'LOCAL',branches:{[prefix]:{deltas:[[0,1,0]]}}});
  a.manual_branches.push({id:'HAND',parent:prefix});
  a.unit_editing.items.push({id:record.id+'.LEAF_COPY',parent:prefix,source:'LEAF'});
  a.unit_editing.removed.push(record.id+'.LEAF_1');
  removeStructureMember(a,'GROUP',record.id);
  assert(!a.overrides[prefix]); assert(!a.sculpt_layers.some(layer=>layer.branches[prefix]));
  assert(!a.manual_branches.some(branch=>branch.id==='HAND')); assert(!a.unit_editing.items.some(unit=>unit.parent===prefix)); assert(!a.unit_editing.removed.includes(record.id+'.LEAF_1'));
  const restored = plan(a, {removed:[]}, {fillMissing:true}).authoring;
  assert(restored.branch_instances.some(i=>i.id===record.id)); assert.equal(structureGroupState(restored,groupOf(restored),branches).states.get(record.id),'AUTO');
});

test('near the maximum seed, normalization cannot misclassify automatic members or change their stable variation on reload', () => {
  let a = plan(fixture(), {seed:2147483646}).authoring;
  assert.equal(structureGroupState(a,groupOf(a),branches).automatic.length,a.branch_instances.length);
  a = plan(a,{count:6,ringCount:5}).authoring;
  const old=structuredClone(a.branch_instances);
  a=normalizeAuthoring(JSON.parse(JSON.stringify(a)));
  assert.deepEqual(plan(a).authoring.branch_instances,old);
  assert.equal(structureGroupState(a,groupOf(a),branches).manual.length,0);
});

test('deleting a group clears installed descendants and local edits while detaching keeps complete source content under manual protection', () => {
  const a = plan(fixture()).authoring, first=a.branch_instances[0], prefix=first.id+'.R1';
  a.branch_instances.push({...a.branch_instances[0],id:'NESTED',array_id:'',parent:prefix,assembly_manual:true});
  a.manual_branches.push({id:'LOCAL',parent:prefix});a.overrides.LOCAL={radius:1.3};
  a.unit_editing.items.push({id:'LOCAL_LEAF',parent:'LOCAL',source:'SOURCE'});
  const before=structuredClone(a), detached=structuredClone(a);detachStructureGroup(detached,'GROUP');
  assert.equal(detached.branch_arrays.length,0);assert.equal(detached.branch_instances.length,before.branch_instances.length);
  for(const old of before.branch_instances.filter(i=>i.array_id==='GROUP')) assert.deepEqual(detached.branch_instances.find(i=>i.id===old.id),{...old,array_id:'',assembly_manual:true,assembly_refined:true});
  assert.deepEqual(detached.overrides,before.overrides);assert.deepEqual(detached.unit_editing,before.unit_editing);
  deleteStructureGroup(a,'GROUP');assert.equal(a.branch_arrays.length,0);assert.equal(a.branch_instances.length,0);assert.equal(a.manual_branches.length,0);assert(!a.overrides.LOCAL);assert.equal(a.unit_editing.items.length,0);
});
