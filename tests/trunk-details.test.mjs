import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TRUNK_DETAIL_TYPES, TRUNK_DETAIL_LIMIT, normalizeTrunkDetail, normalizeTrunkDetails,
  createTrunkDetail, createTrunkDetailSampler } from '../web/trunk-details.js';
import { TRUNK_DETAIL_PRESETS, TRUNK_DETAIL_COMBINATIONS, normalizeTrunkDetailPresetShape,
  applyTrunkDetailPreset, normalizeTrunkDetailPreset, createTrunkDetailPresetId } from '../web/trunk-detail-presets.js';
import { normalizeTrunkForm, normalizeTrunkForms, getBaseTrunkForm, createDirectTrunkForm } from '../web/trunk-form.js';
import { createSweptBranchGeometry, createTrunkFormPreviewGeometry, buildBranchAsset, disposeBranchAsset,
  normalizeSettings, DEFAULT_SETTINGS } from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';

const settings = normalizeSettings({ ...DEFAULT_SETTINGS, radial_segments: 9, leaf_density: 0,
  cross_section: 'CIRCLE', surface_roughness: 0, groove_depth: 0, knot_strength: 0,
  junction_collar: false, adaptive_tessellation: true, twist: 0, section_roll: 0 });
const branch = () => ({ id: 0, stableId: 'ROOT', parentId: -1, order: 0, length: 3,
  startRadius: .2, endRadius: .1, radiusProfile: { points: [[0, 1], [1, 1]], interpolation: 'LINEAR' },
  points: [[0, 0, 0], [.3, .05, 1], [.8, .1, 2], [1.3, .2, 3]].map(p => new THREE.Vector3(...p)),
  sections: [], phase: .2, windPhase: .4, windStiffness: 1, children: [] });
const buffers = geometry => Object.fromEntries(['position', 'normal', 'uv', 'color'].map(name => [name,
  Array.from(geometry.getAttribute(name).array)]).concat([['index', Array.from(geometry.index.array)]]));
const direct = details => normalizeTrunkForm({ geometry_version: 2, sections: [
  { id: 'S1', t: .2, radius: 1.2, oval: 1.15 }, { id: 'S2', t: .75, radius: 1.1, oval: .9, roll: 18 },
], details });

test('explicit layers normalize bounded parameters, path pressure and independent IDs', () => {
  const raw = [null, { type: 'UNKNOWN' }, { id: 'G', type: 'GROOVE', t: 3, angle: -20,
    strength: 4, width: 300, height: 0, seed: 1.3, branch: 'PRIVATE', path: [
      { t: -.1, angle: -350, pressure: 4 }, { t: 0, angle: 10, pressure: .3 },
      { t: .5, angle: 340, pressure: .8 }, null,
    ] }, { id: 'G', type: 'RIDGE' }, { id: 'K', type: 'KNOT', enabled: false }];
  const layers = normalizeTrunkDetails(raw);
  assert.equal(layers.length, 2); assert.equal(layers[0].t, 1); assert.equal(layers[0].angle, 340);
  assert.equal(layers[0].width, 180); assert.equal(layers[0].height, .001); assert.equal(layers[0].strength, 1);
  assert.deepEqual(layers[0].path, [{ t: 0, angle: 10, pressure: .3 }, { t: .5, angle: 340, pressure: .8 }]);
  assert.ok(!Object.hasOwn(layers[0], 'branch')); assert.equal(layers[1].enabled, false);
  assert.deepEqual(normalizeTrunkDetails(JSON.parse(JSON.stringify(layers))), layers);
  assert.equal(normalizeTrunkDetail({ type: 'OTHER' }), null);
  assert.equal(normalizeTrunkDetails(Array.from({ length: 300 }, (_, i) => ({ id: `D${i}`, type: 'FLARE' }))).length, TRUNK_DETAIL_LIMIT);
  const a = createTrunkDetail('KNOT'), b = createTrunkDetail('KNOT'); assert.notEqual(a.id, b.id);
});

test('V1 remains exactly normalized without new fields; DIRECT layers survive save and BASE excludes them', () => {
  const old = normalizeTrunkForm({ preset: 'BUTTRESS' });
  assert.deepEqual(normalizeTrunkForm({ ...old, details: [{ type: 'KNOT' }] }), old);
  assert.ok(!Object.hasOwn(old, 'details'));
  assert.deepEqual(createDirectTrunkForm(old).legacy_form, old);
  const form = direct([{ id: 'D', type: 'KNOT', t: .44, angle: 10 }]);
  const recipe = { version: 2, branches: { ROOT: form, LEGACY: old } };
  assert.deepEqual(normalizeTrunkForms(JSON.parse(JSON.stringify(recipe))), recipe);
  assert.deepEqual(getBaseTrunkForm(form).details, []);
  assert.deepEqual(form.details, [{ ...normalizeTrunkDetail({ id: 'D', type: 'KNOT', t: .44, angle: 10 }) }]);
});

test('all six types produce deterministic local fields and add bounded overlaps once', () => {
  for (const type of TRUNK_DETAIL_TYPES) {
    const detail = normalizeTrunkDetail({ id: type, type, t: .5, angle: 0, seed: 13 });
    const a = createTrunkDetailSampler([detail]), b = createTrunkDetailSampler(JSON.parse(JSON.stringify([detail])));
    const values = [];
    for (let i = 0; i <= 60; i++) for (let j = 0; j < 72; j++) {
      const t = i / 60, angle = j * Math.PI / 36, value = a(t, angle); values.push(value);
      assert.equal(value, b(t, angle)); assert.ok(Number.isFinite(value) && value >= .12 && value <= 4);
      assert.ok(Math.abs(value - a(t, angle + Math.PI * 2)) < 1e-13, 'angle seam is continuous');
    }
    assert.ok(values.some(value => Math.abs(value - 1) > .01), `${type} has visible geometry`);
    assert.equal(a(.5, Math.PI), 1); assert.equal(a(0, 0), 1); assert.equal(a(1, 0), 1);
    assert.equal(createTrunkDetailSampler([{ ...detail, enabled: false }])(.5, 0), 1);
    assert.equal(createTrunkDetailSampler([{ ...detail, strength: 0 }])(.5, 0), 1);
  }
  const layers = ['A', 'B'].map(id => ({ id, type: 'RIDGE', strength: .3, t: .5, angle: 0 }));
  assert.equal(createTrunkDetailSampler(layers)(.5, 0), 1.6);
  assert.equal(createTrunkDetailSampler(Array.from({ length: 128 }, (_, i) =>
    ({ id: `G${i}`, type: 'GROOVE', strength: 1, t: .5, angle: 0 })))(.5, 0), .12);
  assert.equal(createTrunkDetailSampler([])(NaN, 0), 1);
});

test('a path across the angle seam produces one continuous pressured region without endpoint spikes', () => {
  const detail = normalizeTrunkDetail({ type: 'RIDGE', strength: .4, height: .12, width: 30,
    path: [{ t: .2, angle: 350, pressure: 0 }, { t: .5, angle: 0, pressure: .5 }, { t: .8, angle: 10, pressure: 1 }] });
  const sample = createTrunkDetailSampler([detail]);
  assert.equal(sample(.2, 350 * Math.PI / 180), 1);
  assert.ok(Math.abs(sample(.5, 0) - 1.2) < 1e-12); assert.ok(Math.abs(sample(.8, Math.PI / 18) - 1.4) < 1e-12);
  assert.equal(sample(.5, Math.PI), 1);
  // Pressure has a real directional gradient along the slanted path; opposite
  // infinitesimal angles need continuity, rather than identical pressure.
  assert.ok(Math.abs(sample(.5, 1e-7) - sample(.5, -1e-7)) < 1e-6);
  for (const t of [.2, .5, .8]) assert.ok(Math.abs(sample(t - 1e-7, 0) - sample(t + 1e-7, 0)) < 1e-5);
});

test('moving or placing a seeded layer keeps its own pattern rather than resampling the trunk position', () => {
  for (const type of TRUNK_DETAIL_TYPES) {
    const raw = { type, t: .4, angle: 20, seed: 9, height: .2, width: 60 };
    const before = createTrunkDetailSampler([raw]), after = createTrunkDetailSampler([{ ...raw, t: .55, angle: 70 }]);
    for (let ti = 0; ti <= 12; ti++) for (let ai = 0; ai <= 24; ai++) {
      const t = .29 + ti * .02, a = (-20 + ai * 4) * Math.PI / 180;
      assert.ok(Math.abs(before(t, a) - after(t + .15, a + 50 * Math.PI / 180)) < 1e-12, type);
    }
  }
});

test('individual and combination presets are source independent, centered, idempotent and append with fresh IDs', () => {
  assert.equal(TRUNK_DETAIL_PRESETS.length, 12); assert.ok(TRUNK_DETAIL_COMBINATIONS.length >= 3);
  for (const preset of [...TRUNK_DETAIL_PRESETS, ...TRUNK_DETAIL_COMBINATIONS]) {
    const normalized = normalizeTrunkDetailPresetShape(preset.shape);
    assert.deepEqual(normalizeTrunkDetailPresetShape(normalized), normalized);
    let count = 0;
    const applied = applyTrunkDetailPreset(normalized, { t: .35, angle: 270, height: .6, width: 180,
      idFactory: () => `DEST_${++count}` });
    assert.equal(applied.length, normalized.details.length); assert.ok(applied.every(detail => detail.id.startsWith('DEST_')));
    assert.ok(applied.every(detail => !Object.hasOwn(detail, 'branch')));
    assert.notDeepEqual(applyTrunkDetailPreset(normalized), applyTrunkDetailPreset(normalized));
  }
  const source = [{ id: 'SOURCE', type: 'KNOT', t: .9, angle: 310, height: .2, width: 50, branch_id: 'ROOT', path: [] }];
  const shape = normalizeTrunkDetailPresetShape({ details: source });
  assert.equal(shape.details[0].t, .5); assert.equal(shape.details[0].angle, 0); assert.equal(shape.details[0].height, .2);
  const restored = applyTrunkDetailPreset(shape, { t: .2, angle: 80, idFactory: () => 'NEW' })[0];
  assert.equal(restored.t, .2); assert.equal(restored.angle, 80); assert.equal(restored.height, .2);
  const record = normalizeTrunkDetailPreset({ id: createTrunkDetailPresetId(), name: '苹果树疤结', shape }, { now: 2 });
  assert.deepEqual(normalizeTrunkDetailPreset(record), record);
  assert.throws(() => normalizeTrunkDetailPresetShape({ details: [] }));
  assert.throws(() => normalizeTrunkDetailPreset({ id: '../escape', name: 'x', shape }));
});

test('layer meshes remain closed, finite and scoped to the skin; BASE preserves the contour and source recipe', () => {
  const b = branch(), form = direct(TRUNK_DETAIL_TYPES.map((type, index) => ({ id: type, type,
    t: .3 + index * .07, angle: index * 38, width: 66, height: .22, seed: index + 3 })));
  const original = JSON.stringify(form), points = b.points.map(point => point.toArray());
  const final = createTrunkFormPreviewGeometry(b, settings, form);
  const base = createTrunkFormPreviewGeometry(b, settings, form, 0, { view: 'BASE' });
  const without = createTrunkFormPreviewGeometry(b, settings, { ...form, details: [] });
  try {
    assert.notDeepEqual(buffers(final), buffers(base)); assert.deepEqual(buffers(base), buffers(without));
    assert.ok(final.userData.radiusRings.length >= 129); assert.equal(final.userData.radiusRings[0].count, 96);
    for (const ring of base.userData.radiusRings) {
      const other = final.userData.radiusRings.find(other => Math.abs(other.t - ring.t) < 1e-12);
      for (const name of ['center', 'x', 'y', 'rolledX', 'rolledY'])
        assert.ok(other[name].every((value, index) => Math.abs(value - ring[name][index]) < 1e-12));
    }
    const p = final.getAttribute('position'), edges = new Map();
    assert.ok(Array.from(p.array).every(Number.isFinite)); assert.ok(Array.from(final.getAttribute('normal').array).every(Number.isFinite));
    // A material UV seam has distinct indices at coincident wall positions.
    const welded=new Map(),ids=Array.from({length:p.count},(_,i)=>{const key=[p.getX(i),p.getY(i),p.getZ(i)].join(',');if(!welded.has(key))welded.set(key,welded.size);return welded.get(key);});
    const add = (a, c) => { const key = [ids[a], ids[c]].sort((x, y) => x - y).join(':'); edges.set(key, (edges.get(key) || 0) + 1); };
    for (let i = 0; i < final.index.count; i += 3) {
      const [a, c, d] = [0, 1, 2].map(offset => final.index.getX(i + offset)); add(a, c); add(c, d); add(d, a);
      const x = new THREE.Vector3().fromBufferAttribute(p, a), y = new THREE.Vector3().fromBufferAttribute(p, c), z = new THREE.Vector3().fromBufferAttribute(p, d);
      assert.ok(y.sub(x).cross(z.sub(x)).lengthSq() > 1e-16);
    }
    assert.ok([...edges.values()].every(count => count === 2));
    for (const ring of final.userData.radiusRings) {
      const centre = new THREE.Vector3(...ring.center), tangent = new THREE.Vector3(...ring.tangent);
      for (let side = 0; side < ring.count; side++) {
        const offset = new THREE.Vector3().fromBufferAttribute(p, ring.offset + side).sub(centre);
        assert.ok(Math.abs(offset.dot(tangent)) < 3e-7); assert.ok(offset.length() > 0);
      }
    }
  } finally { final.dispose(); base.dispose(); without.dispose(); }
  assert.equal(JSON.stringify(form), original); assert.deepEqual(b.points.map(point => point.toArray()), points);
});

test('cold saved DIRECT builds and interactive FINAL previews agree at all LODs', () => {
  const b = branch(), form = direct(TRUNK_DETAIL_COMBINATIONS[0].shape.details);
  const source = normalizeAuthoring({ branch_shape: { branches: [{ id: 'ROOT', parent: '', points: b.points.map(p => p.toArray()),
    knots: b.points.map(p => p.toArray()), length: 3, start_radius: .2, end_radius: .1 }] },
    workbench: { trunk_forms: { version: 2, branches: { ROOT: form } } } });
  const saved = JSON.stringify(source), reloaded = normalizeAuthoring(JSON.parse(saved));
  assert.deepEqual(reloaded.workbench.trunk_forms, source.workbench.trunk_forms);
  for (let lod = 0; lod < 4; lod++) {
    const asset = buildBranchAsset(settings, null, [], lod, reloaded), root = asset.masterBranches.find(b => b.stableId === 'ROOT');
    let mesh; asset.group.traverse(object => { if (object.userData.category === 'branch' && object.userData.stable_id === 'ROOT') mesh = object; });
    const preview = createTrunkFormPreviewGeometry(root, asset.settings, root.trunkForm, lod);
    try { assert.deepEqual(buffers(preview), buffers(mesh.geometry)); }
    finally { preview.dispose(); disposeBranchAsset(asset); }
  }
  assert.equal(JSON.stringify(source), saved);
});

test('logical detail angle follows global twist and section roll without moving its painted coordinate', () => {
  const b = branch(); b.points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 3)];
  b.sections = [{ t: 0, radius: 1, oval: 1, roll: 28 }, { t: 1, radius: 1, oval: 1, roll: 28 }];
  const form = normalizeTrunkForm({ geometry_version: 2, details: [{ id: 'D', type: 'RIDGE', t: .5,
    angle: 0, strength: .3, width: 24, height: .2 }] });
  const twistSettings = { ...settings, twist: 90, section_roll: 10 };
  const a = createSweptBranchGeometry({ ...b, trunkForm: form }, 9, twistSettings);
  const base = createSweptBranchGeometry({ ...b, trunkForm: { ...form, details: [] } }, 9, twistSettings);
  try {
    const ring = a.userData.radiusRings.find(ring => ring.t === .5), plain = base.userData.radiusRings.find(ring => ring.t === .5);
    const centre = new THREE.Vector3(...ring.center), point = new THREE.Vector3().fromBufferAttribute(a.getAttribute('position'), ring.offset).sub(centre);
    const reference = new THREE.Vector3().fromBufferAttribute(base.getAttribute('position'), plain.offset).sub(centre);
    assert.ok(Math.abs(point.length() / reference.length() - 1.3) < 1e-6);
    const angle = ring.angleOffset, direction = new THREE.Vector3(...ring.rolledX).multiplyScalar(Math.cos(angle))
      .addScaledVector(new THREE.Vector3(...ring.rolledY), Math.sin(angle)).normalize();
    assert.ok(point.normalize().distanceTo(direction) < 1e-6);
  } finally { a.dispose(); base.dispose(); }
});
