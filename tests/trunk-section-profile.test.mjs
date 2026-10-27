import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrunkSectionProfile, normalizeTrunkSectionProfile, normalizeTrunkForm,
  sampleTrunkSectionProfile, trunkFormProfileScaleAt, createTrunkFormProfileSampler } from '../web/trunk-form.js';
import { createSweptBranchGeometry, createTrunkFormPreviewGeometry, buildBranchAsset,
  disposeBranchAsset, normalizeSettings, DEFAULT_SETTINGS } from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';

const TAU = Math.PI * 2;
const settings = normalizeSettings({ ...DEFAULT_SETTINGS, radial_segments: 9, leaf_density: 0,
  cross_section: 'CIRCLE', surface_roughness: 0, groove_depth: 0, knot_strength: 0,
  twist: 0, section_roll: 0, junction_collar: false, adaptive_tessellation: true });
const branch = () => ({ id: 0, stableId: 'ROOT', parentId: -1, order: 0, length: 3,
  startRadius: .2, endRadius: .1, radiusProfile: { points: [[0, 1], [1, 1]], interpolation: 'LINEAR' },
  points: [[0, 0, 0], [.35, 0, 1], [1, .1, 2], [1.5, .4, 3]].map(p => new THREE.Vector3(...p)),
  sections: [], phase: .2, windPhase: .4, windStiffness: 1, children: [] });
const contour = () => createTrunkSectionProfile(8).map((point, index) => ({ ...point,
  radius: [2.4, 1.5, .6, 1.2, .8, .45, 1.3, 1.8][index] }));
const formFor = (section = {}) => normalizeTrunkForm({ groove_depth: 0, root_flare: 0, asymmetry: 0,
  sections: [{ id: 'SECTION_1', t: .5, span: .2, profile: contour(), ...section }] });
const buffers = geometry => Object.fromEntries(['position', 'normal', 'uv', 'color'].map(name => [name,
  Array.from(geometry.getAttribute(name).array)]).concat([['index', Array.from(geometry.index.array)]]));
const atRing = (geometry, ring, side) => new THREE.Vector3()
  .fromBufferAttribute(geometry.getAttribute('position'), ring.offset + side).sub(new THREE.Vector3(...ring.center));

test('section profiles normalize bounded polar knots without adding fields to old recipes', () => {
  const raw = [{ id: 'a', angle: 360, radius: .01 }, { id: 'b', angle: -90, radius: 10 },
    { id: 'c', angle: 90, radius: 2 }, { id: 'd', angle: 0, radius: 3 }, { id: 'c', angle: 180, radius: 1 }];
  assert.deepEqual(normalizeTrunkSectionProfile(raw), [
    { id: 'a', angle: 0, radius: .15 }, { id: 'c', angle: 90, radius: 2 }, { id: 'b', angle: 270, radius: 4 },
  ]);
  assert.equal(normalizeTrunkSectionProfile([]), null);
  assert.equal(normalizeTrunkSectionProfile(raw.slice(0, 2)), null);
  const profile = normalizeTrunkSectionProfile(contour());
  assert.deepEqual(normalizeTrunkSectionProfile(JSON.parse(JSON.stringify(profile))), profile);
  assert.equal(createTrunkSectionProfile(2).length, 3); assert.equal(createTrunkSectionProfile(50).length, 32);
  const old = normalizeTrunkForm({ sections: [{ id: 'OLD', t: .5 }] });
  assert.equal(Object.hasOwn(old.sections[0], 'profile'), false);
  const invalid = normalizeTrunkForm({ sections: [{ id: 'OLD', profile: raw.slice(0, 2) }] });
  assert.equal(Object.hasOwn(invalid.sections[0], 'profile'), false);
});

test('periodic contour interpolation is smooth, positive and bounded by each angular interval', () => {
  const profile = normalizeTrunkSectionProfile([
    { id: 'a', angle: 11, radius: .15 }, { id: 'b', angle: 29, radius: 4 },
    { id: 'c', angle: 173, radius: 2.7 }, { id: 'd', angle: 292, radius: .8 },
  ]);
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i], b = profile[(i + 1) % profile.length], width = (b.angle - a.angle + 360) % 360;
    for (let step = 0; step <= 100; step++) {
      const angle = (a.angle + width * step / 100) * Math.PI / 180;
      const value = sampleTrunkSectionProfile(profile, angle);
      assert.ok(value >= Math.min(a.radius, b.radius) && value <= Math.max(a.radius, b.radius));
      assert.ok(Math.abs(value - sampleTrunkSectionProfile(profile, angle + TAU)) < 1e-12);
    }
    const angle = a.angle * Math.PI / 180, e = 1e-5, center = sampleTrunkSectionProfile(profile, angle);
    assert.ok(Math.abs(center - a.radius) < 1e-12, 'curve passes through the control knot');
    const left = (center - sampleTrunkSectionProfile(profile, angle - e)) / e;
    const right = (sampleTrunkSectionProfile(profile, angle + e) - center) / e;
    assert.ok(Math.abs(left - right) < .005, 'first derivatives agree across each periodic knot');
  }
  assert.equal(sampleTrunkSectionProfile(null, .3), 1);
  assert.equal(sampleTrunkSectionProfile(profile, Infinity), 1);
});

test('local profile fades independently of trunk groove range and sliding follows only the local window', () => {
  const form = normalizeTrunkForm({ ...formFor({ t: .25, span: .1 }), height_start: .65, height_end: .9 });
  assert.equal(trunkFormProfileScaleAt(form, .25, 0), 2.4);
  assert.equal(trunkFormProfileScaleAt(form, .1, 0), 1);
  assert.equal(trunkFormProfileScaleAt(form, .75, 0), 1);
  assert.ok(Math.abs(trunkFormProfileScaleAt(form, .3500001, 0) - 1) < 1e-12);
  assert.ok(Math.abs(trunkFormProfileScaleAt(form, .3499999, 0) - 1) < 1e-10);
  const moved = normalizeTrunkForm({ ...form, sections: form.sections.map(section => ({ ...section, t: .75 })) });
  assert.equal(trunkFormProfileScaleAt(moved, .25, 0), 1);
  assert.equal(trunkFormProfileScaleAt(moved, .75, 0), 2.4);
  const sample = createTrunkFormProfileSampler(form);
  for (let i = 0; i < 40; i++) assert.equal(sample(i / 39, i / 7), trunkFormProfileScaleAt(form, i / 39, i / 7));
  assert.equal(trunkFormProfileScaleAt({ ...form, enabled: false }, .25, 0), 1);
});

test('neutral profile leaves every enabled-form geometry buffer exactly unchanged', () => {
  const b = branch(), without = formFor(); delete without.sections[0].profile;
  const neutral = normalizeTrunkForm({ ...without, sections: [{ ...without.sections[0], profile: createTrunkSectionProfile() }] });
  const a = createSweptBranchGeometry({ ...b, trunkForm: without }, 9, settings);
  const c = createSweptBranchGeometry({ ...b, trunkForm: neutral }, 9, settings);
  try { assert.deepEqual(buffers(a), buffers(c)); }
  finally { a.dispose(); c.dispose(); }
});

test('curved profile skin is closed and changing shape keeps topology and centerline frames stable', () => {
  const b = branch(), before = b.points.map(p => p.toArray()), form = formFor();
  const changed = normalizeTrunkForm({ ...form, sections: [{ ...form.sections[0], t: .61,
    profile: contour().map((point, i) => ({ ...point, angle: point.angle + i, radius: .15 + i / 3 })) }] });
  const a = createSweptBranchGeometry({ ...b, trunkForm: form }, 9, settings);
  const c = createSweptBranchGeometry({ ...b, trunkForm: changed }, 9, settings);
  try {
    assert.deepEqual(before, b.points.map(p => p.toArray()));
    assert.deepEqual(Array.from(a.index.array), Array.from(c.index.array));
    assert.deepEqual(a.userData.radiusRings, c.userData.radiusRings);
    assert.notDeepEqual(Array.from(a.getAttribute('position').array), Array.from(c.getAttribute('position').array));
    const edgeCounts = new Map();
    for (let i = 0; i < c.index.count; i += 3) {
      const ids = [0, 1, 2].map(j => c.index.getX(i + j));
      const p = ids.map(id => new THREE.Vector3().fromBufferAttribute(c.getAttribute('position'), id));
      assert.ok(p[1].sub(p[0]).cross(p[2].sub(p[0])).lengthSq() > 1e-16);
      for (let j = 0; j < 3; j++) {
        const key = [ids[j], ids[(j + 1) % 3]].sort((x, y) => x - y).join(':');
        edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
      }
    }
    assert.ok([...edgeCounts.values()].every(count => count === 2));
    assert.ok(Array.from(c.getAttribute('normal').array).every(Number.isFinite));
  } finally { a.dispose(); c.dispose(); }
});

test('profile twist rotates the whole contour in the transported section plane and reports exact ring frame', () => {
  const b = branch(), base = formFor({ t: .5, span: .3 });
  const rotated = normalizeTrunkForm({ ...base, sections: [{ ...base.sections[0], roll: 90 }] });
  const a = createSweptBranchGeometry({ ...b, trunkForm: base }, 9, settings);
  const c = createSweptBranchGeometry({ ...b, trunkForm: rotated }, 9, settings);
  try {
    const ringA = a.userData.radiusRings.find(ring => ring.t === .5);
    const ringC = c.userData.radiusRings.find(ring => ring.t === .5);
    assert.ok(Math.abs(ringC.roll - Math.PI / 2) < 1e-12); assert.equal(ringC.angleOffset, 0);
    const tangent = new THREE.Vector3(...ringA.tangent), x = new THREE.Vector3(...ringA.x);
    for (let side = 0; side < ringA.count; side++) {
      const delta = atRing(a, ringA, side).applyAxisAngle(tangent, Math.PI / 2);
      assert.ok(delta.distanceTo(atRing(c, ringC, side)) < 3e-7, 'twist rotates points together, without swapping or reflowing knots');
    }
    assert.ok(Math.abs(atRing(a, ringA, 0).dot(x) / ringA.localRadius - 2.4) < 1e-6);
  } finally { a.dispose(); c.dispose(); }
});

test('profile preview matches cold generation and actual normalized save/reload at every LOD', () => {
  const points = branch().points.map(p => p.toArray());
  const authoring = normalizeAuthoring({ branch_shape: { branches: [{ id: 'ROOT', parent: '', points,
    knots: points, length: 3, start_radius: .2, end_radius: .1 }] },
    workbench: { trunk_forms: { version: 1, branches: { ROOT: formFor({ roll: 37, oval: 1.3 }) } } } });
  const saved = JSON.stringify(authoring), restored = normalizeAuthoring(JSON.parse(saved));
  for (let lod = 0; lod < 4; lod++) {
    const asset = buildBranchAsset(settings, null, [], lod, authoring);
    const cold = buildBranchAsset(settings, null, [], lod, restored);
    const root = asset.masterBranches.find(b => b.stableId === 'ROOT');
    const preview = createTrunkFormPreviewGeometry(root, asset.settings, root.trunkForm, lod);
    const meshFor = value => {
      let mesh; value.group.traverse(object => { if (object.userData.category === 'branch' && object.userData.stable_id === 'ROOT') mesh = object; });
      return mesh;
    };
    try {
      assert.deepEqual(buffers(preview), buffers(meshFor(asset).geometry));
      assert.deepEqual(buffers(meshFor(cold).geometry), buffers(meshFor(asset).geometry));
    } finally { preview.dispose(); disposeBranchAsset(asset); disposeBranchAsset(cold); }
  }
  assert.equal(JSON.stringify(authoring), saved);
});
