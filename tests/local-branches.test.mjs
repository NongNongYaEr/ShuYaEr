import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { buildBranchAsset, disposeBranchAsset } from '../web/branch-kernel.js';
import { planLocalBranches } from '../web/local-branch-data.js';
import { planBranchStroke } from '../web/branch-stroke-data.js';
import { makeMountRotationOperation } from '../web/branch-mount.js';
import { sampleLine } from '../web/tree-sculpt.js';
import { createPVESkeleton, validatePVESkeleton } from '../web/pve-skeleton-export.js';

const settings = { leaf_density: 0, child_count: 0, branch_levels: 4, wind_strength: 0 };
const fixture = () => normalizeAuthoring({ branch_shape: { branches: [
  { id: 'R', parent: '', points: [[0,0,0],[0,0,1],[0,0,2],[.2,0,3]], length: 3, start_radius: .12, end_radius: .05 },
  { id: 'A', parent: 'R', attach: .6, points: [[0,0,1.8],[.5,0,2],[1,0,2.3],[1.7,0,2.4]], length: 2, start_radius: .045, end_radius: .01 },
  { id: 'B', parent: 'R', attach: .3, points: [[0,0,.9],[-.5,0,1.1],[-1,0,1.3]], length: 1, start_radius: .025, end_radius: .005 },
] } });
const build = a => buildBranchAsset(settings, null, [], 0, a, { skeletonOnly: true });
const points = b => b.points.map(p => p.toArray());
const snapshot = a => Object.fromEntries(a.masterBranches.map(b => [b.stableId, points(b)]));

test('local branching is stable, bounded to its root, hierarchical and survives reload', () => {
  const a = fixture(), base = build(a), originals = snapshot(base);
  const p = planLocalBranches(a, base.masterBranches, 'A', { count: 4, levels: 2, seed: 42 }, 'LOCAL_TEST');
  assert.equal(p.stats.total, 12); assert.equal(a.manual_branches.length, 0);
  const built = build(p.authoring), snap = snapshot(built);
  for (const id of Object.keys(originals)) assert.deepEqual(snap[id], originals[id]);
  assert.equal(built.masterBranches.length, 15);
  for (const b of built.masterBranches.filter(b => b.localBundle)) {
    const parent = built.masterBranches.find(p => p.id === b.parentId);
    assert.ok(b.points[0].distanceTo(sampleLine(parent.points, b.parentT)) < 1e-9);
    assert.ok(b.startRadius < parent.startRadius); assert.ok(b.endRadius < b.startRadius);
    assert.equal(b.unitOwner, '');
  }
  const more = planLocalBranches(p.authoring, built.masterBranches, 'A', { ...p.config, count: 5 }, 'IGNORED'), grown = build(more.authoring);
  for (const id of Object.keys(snap)) assert.deepEqual(snapshot(grown)[id], snap[id], 'unchanged existing ' + id);
  const less = planLocalBranches(more.authoring, grown.masterBranches, 'A', { ...p.config, count: 2 }, 'IGNORED');
  assert.equal(less.stats.total, 4); assert.equal(less.authoring.local_branch_groups.length, 1);
  const restored = build(normalizeAuthoring(JSON.parse(JSON.stringify(p.authoring)))); assert.deepEqual(snapshot(restored), snap);
  const normalized = normalizeAuthoring(p.authoring);
  assert.deepEqual(planLocalBranches(normalized, built.masterBranches, 'A', p.config, 'IGNORED').authoring, normalized, 'unchanged config must be a no-op');
  const full = buildBranchAsset(settings, null, [], 0, p.authoring), skeleton = createPVESkeleton(full);
  assert.equal(validatePVESkeleton(skeleton).valid, true);
  assert.equal(skeleton.branches.length, 15); assert.equal(skeleton.coordinate_system.unit, 'meter'); assert.equal(skeleton.coordinate_system.up, 'Z');
  for (const b of full.masterBranches) { const exported = skeleton.branches.find(v => v.id === b.stableId); assert.equal(exported.parent_id, full.masterBranches.find(v => v.id === b.parentId)?.stableId ?? null); assert.deepEqual(exported.points[0].position_m,b.points[0].toArray()); }
  const zero = planLocalBranches(p.authoring, built.masterBranches, 'A', { ...p.config, count: 0 }, 'IGNORED'), cleared = build(zero.authoring);
  assert.deepEqual(snapshot(cleared), originals);
  [base,built,grown,restored,cleared,full].forEach(disposeBranchAsset);
});

test('edited, deleted and externally attached local branches retain their dependent tree when count shrinks', () => {
  const a = fixture(), base = build(a), p = planLocalBranches(a, base.masterBranches, 'A', { count: 4, levels: 2 }, 'LOCAL_TEST');
  p.authoring = normalizeAuthoring(p.authoring);
  p.authoring.overrides.LOCAL_TEST_1_1 = { radius: 1.4, pinned_points: [1] };
  p.authoring.topology.suppressed.push('LOCAL_TEST_2');
  p.authoring.manual_branches.push({ id: 'HAND', parent: 'LOCAL_TEST_3', attach: .5, length: .2, radius: .003, angle: 40, azimuth: 0 });
  const before = build(p.authoring), changed = planLocalBranches(p.authoring, before.masterBranches, 'A', { ...p.config, count: 0, length: .8, seed: 912 }, 'IGNORED'), after = build(changed.authoring);
  assert.equal(changed.stats.protected, 9); assert.equal(changed.stats.removed, 3);
  for (const b of before.masterBranches.filter(b => !b.stableId.startsWith('LOCAL_TEST_4'))) assert.deepEqual(snapshot(after)[b.stableId], points(b), b.stableId);
  assert.ok(!after.masterBranches.some(b => b.stableId === 'LOCAL_TEST_2'));
  const back = planLocalBranches(changed.authoring, after.masterBranches, 'A', { ...p.config, count: 4 }, 'IGNORED'), again = build(back.authoring);
  assert.ok(!again.masterBranches.some(b => b.stableId === 'LOCAL_TEST_2'), 'deleted branch must not resurrect');
  [base,before,after,again].forEach(disposeBranchAsset);
});

test('drawn fork generates connected children; later root rotation is rigid and local edits do not affect existing bones', () => {
  const a = fixture(), base = build(a), branch = base.masterBranches.find(b => b.stableId === 'A'), anchor = sampleLine(branch.points, .65);
  const raw = [anchor, anchor.clone().add(new THREE.Vector3(.2,-.2,.15)), anchor.clone().add(new THREE.Vector3(.5,-.5,.3)), anchor.clone().add(new THREE.Vector3(.8,-.6,.4))];
  const stroke = planBranchStroke(a, settings, base.masterBranches, 'A', raw, { mode:'FORK', attach:.65, radius:.5, taper:.15, smooth:.5, align:.5, length:0 }, 'DRAWN');
  const drawn = build(stroke.authoring), plan = planLocalBranches(stroke.authoring, drawn.masterBranches, 'DRAWN', { count:4 }, 'LOCAL_DRAWN'), built = build(plan.authoring);
  for (const b of built.masterBranches.filter(b => b.localBundle)) { const parent = built.masterBranches.find(p => p.id === b.parentId); assert.ok(b.points[0].distanceTo(sampleLine(parent.points,b.parentT)) < 1e-7); }
  const root = built.masterBranches.find(b => b.stableId === 'DRAWN'), rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,.4,-.3));
  plan.authoring.sculpt_layers = [...plan.authoring.sculpt_layers, { id:'TURN', name:'rotation', enabled:true, strength:1, branches:{}, operation:makeMountRotationOperation(built.masterBranches,root,rotation,{azimuth:0,elevation:0}) }];
  const turned = build(plan.authoring);
  for (const b of built.masterBranches) { const changed = turned.masterBranches.find(v => v.stableId === b.stableId); b.points.forEach((p,i) => {
    const want = b.stableId === 'DRAWN' || b.localBundle ? p.clone().sub(root.points[0]).applyQuaternion(rotation).add(root.points[0]) : p;
    assert.ok(want.distanceTo(changed.points[i]) < 1e-7);
  }); }
  assert.throws(() => planLocalBranches(a, [{...branch,unitOwner:'SAMPLE'}], 'A', {}, 'LOCAL'), /单元枝/);
  const bad = plan.authoring.manual_branches.map(b => ({...b,parent:'missing'}));
  const orphan = build({...plan.authoring,manual_branches:bad}); assert.ok(!orphan.masterBranches.some(b=>b.localBundle));
  [base,drawn,built,turned,orphan].forEach(disposeBranchAsset);
});
