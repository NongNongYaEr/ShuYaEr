import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrunkFormPreset, normalizeTrunkForm, normalizeTrunkForms, trunkFormForBranch,
  trunkFormSectionAt, trunkFormRadialScale } from '../web/trunk-form.js';
import { buildBranchAsset, disposeBranchAsset, normalizeSettings, DEFAULT_SETTINGS,
  createSweptBranchGeometry, createTrunkFormPreviewGeometry } from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';

const settings = normalizeSettings({ ...DEFAULT_SETTINGS, radial_segments: 9, leaf_density: 0,
  cross_section: 'CIRCLE', surface_roughness: 0, groove_depth: 0, knot_strength: 0,
  junction_collar: false, adaptive_tessellation: true });
const branch = () => ({ id: 0, stableId: 'ROOT', parentId: -1, order: 0, length: 3,
  startRadius: .2, endRadius: .1, radiusProfile: { points: [[0, 1], [1, 1]], interpolation: 'LINEAR' },
  points: [[0, 0, 0], [.35, 0, 1], [1, .1, 2], [1.5, .4, 3]].map(p => new THREE.Vector3(...p)),
  sections: [], phase: .2, windPhase: .4, windStiffness: 1, children: [] });
const buffers = geometry => Object.fromEntries(['position', 'normal', 'uv', 'color'].map(name => [name,
  Array.from(geometry.getAttribute(name).array)]).concat([['index', Array.from(geometry.index.array)]]));
const meshFor = (asset, id) => {
  let result; asset.group.traverse(mesh => { if (mesh.userData.category === 'branch' && mesh.userData.stable_id === id) result = mesh; });
  return result;
};

test('recipes normalize deterministically, keep independent IDs and reject unsupported schemas', () => {
  const raw = { version: 1, branches: { ROOT: { preset: 'BUTTRESS', groove_depth: Infinity,
    groove_count: 30, height_start: .8, height_end: .2, sections: [{ id: 'RING_A', t: .4 }, { id: 'RING_A', t: .7 }],
    buttresses: [{ id: 'ROOT_A', angle: -30, length: 40, width: 1 }, { id: 'ROOT_B', angle: 45 }] } } };
  const form = normalizeTrunkForms(raw);
  assert.equal(form.branches.ROOT.groove_depth, .34); assert.equal(form.branches.ROOT.groove_count, 16);
  assert.equal(form.branches.ROOT.height_start, .2); assert.equal(form.branches.ROOT.height_end, .8);
  assert.equal(form.branches.ROOT.sections.length, 1);
  assert.equal(form.branches.ROOT.buttresses[0].angle, 330); assert.equal(form.branches.ROOT.buttresses[0].length, 6);
  assert.equal(form.branches.ROOT.buttresses[0].width, 4);
  assert.deepEqual(normalizeTrunkForms(JSON.parse(JSON.stringify(form))), form);
  assert.deepEqual(normalizeTrunkForms({ version: 2, branches: raw.branches }), { ...form, version: 2 });
  assert.deepEqual(normalizeTrunkForms({ version: 3, branches: raw.branches }), { version: 1, branches: {} });
  const preset = createTrunkFormPreset('BUTTRESS'); assert.equal(preset.buttresses.length, 4);
  assert.deepEqual(createTrunkFormPreset('BUTTRESS'), preset);
  const authoring = { workbench: { trunk_forms: form } };
  assert.deepEqual(trunkFormForBranch(authoring, 'ROOT'), form.branches.ROOT);
  form.branches.ROOT.enabled = false; assert.equal(trunkFormForBranch(authoring, 'ROOT'), null);
  assert.equal(trunkFormForBranch(authoring, 'MISSING'), null);
  assert.equal(normalizeTrunkForm(null), null);
});

test('local rings smoothly fade to neutral; one buttress changes only its own angular and height neighbourhood', () => {
  const form = normalizeTrunkForm({ groove_depth: 0, root_flare: 0, asymmetry: 0,
    sections: [{ id: 'S', t: .5, span: .15, radius: 2, oval: 1.5, roll: 30 }] });
  assert.deepEqual(trunkFormSectionAt(form, .5), { radius: 2, oval: 1.5, roll: 30 });
  assert.deepEqual(trunkFormSectionAt(form, .1), { radius: 1, oval: 1, roll: 0 });
  const edge = trunkFormSectionAt(form, .35).radius, near = trunkFormSectionAt(form, .350001).radius;
  assert.ok(Math.abs(edge - near) < 1e-8, 'local window joins with zero slope');
  const roots = normalizeTrunkForm({ ...form, sections: [], buttresses: [
    { id: 'A', angle: 0, length: 3, height: .3, width: 10 },
    { id: 'B', angle: 180, length: 2, height: .3, width: 10 },
  ] });
  const changed = normalizeTrunkForm({ ...roots, buttresses: roots.buttresses.map(r => r.id === 'A' ? { ...r, length: 4 } : r) });
  assert.equal(trunkFormRadialScale(changed, .5, 0), 1, 'root edit never reaches above its height');
  assert.ok(trunkFormRadialScale(changed, 0, 0) - trunkFormRadialScale(roots, 0, 0) > .99);
  assert.ok(Math.abs(trunkFormRadialScale(changed, 0, Math.PI) - trunkFormRadialScale(roots, 0, Math.PI)) < 1e-9);
  const ranged = normalizeTrunkForm({ groove_depth: .5, height_start: .3, height_end: .7, root_flare: 0, asymmetry: 0 });
  assert.equal(trunkFormRadialScale(ranged, .1, 0), 1); assert.equal(trunkFormRadialScale(ranged, .9, 0), 1);
  assert.equal(trunkFormRadialScale(ranged, .3, 0), 1); assert.equal(trunkFormRadialScale(ranged, .7, 0), 1);
  assert.ok(trunkFormRadialScale(ranged, .5, 0) < .6);
});

test('absent and disabled recipes preserve every original geometry buffer exactly', () => {
  const b = branch(), a = createSweptBranchGeometry(b, 9, settings);
  const disabled = createSweptBranchGeometry({ ...b, trunkForm: { ...createTrunkFormPreset('BUTTRESS'), enabled: false } }, 9, settings);
  try { assert.deepEqual(buffers(disabled), buffers(a)); assert.equal(a.userData.radiusRings[0].count, 9); }
  finally { a.dispose(); disabled.dispose(); }
});

test('curved sweeps remain closed and follow actual local frames with finite normals', () => {
  const b = branch(), before = b.points.map(p => p.toArray());
  const geometry = createSweptBranchGeometry({ ...b, trunkForm: createTrunkFormPreset('BUTTRESS') }, 9, settings);
  try {
    assert.deepEqual(b.points.map(p => p.toArray()), before);
    const position = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    assert.ok(geometry.userData.radiusRings.length >= 65); assert.equal(geometry.userData.radiusRings[0].count, 64);
    assert.ok(Array.from(position.array).every(Number.isFinite)); assert.ok(Array.from(normals.array).every(Number.isFinite));
    const edges = new Map(); const add = (a, c) => { const key = [a, c].sort((x, y) => x - y).join(':'); edges.set(key, (edges.get(key) || 0) + 1); };
    for (let n = 0; n < geometry.index.count; n += 3) {
      const [a, c, d] = [0, 1, 2].map(i => geometry.index.getX(n + i)); add(a, c); add(c, d); add(d, a);
      const p = new THREE.Vector3().fromBufferAttribute(position, a), q = new THREE.Vector3().fromBufferAttribute(position, c), r = new THREE.Vector3().fromBufferAttribute(position, d);
      assert.ok(q.sub(p).cross(r.sub(p)).lengthSq() > 1e-16, 'no zero-area skin triangle');
    }
    assert.ok([...edges.values()].every(count => count === 2), 'closed manifold including both caps');
    for (const ring of geometry.userData.radiusRings) {
      const tangent = new THREE.Vector3(...ring.tangent), center = new THREE.Vector3(...ring.center);
      assert.ok(Math.abs(tangent.length() - 1) < 1e-12);
      for (let index = ring.offset; index < ring.offset + ring.count; index++) {
        const delta = new THREE.Vector3().fromBufferAttribute(position, index).sub(center);
        assert.ok(Math.abs(delta.dot(tangent)) < 3e-7, 'skin stays in the curve-local section plane');
      }
    }
  } finally { geometry.dispose(); }
});

test('moving local sections and changing root/groove controls preserve sweep topology', () => {
  const b = branch(), first = createTrunkFormPreset('BUTTRESS');
  const second = normalizeTrunkForm({ ...first, groove_count: 16, sections: [{ id: 'S', t: .371, radius: 2, oval: 1.2, roll: 60 }],
    buttresses: first.buttresses.slice(0, 1).map(r => ({ ...r, angle: 31, height: .48, length: 4 })) });
  const a = createSweptBranchGeometry({ ...b, trunkForm: first }, 9, settings), c = createSweptBranchGeometry({ ...b, trunkForm: second }, 9, settings);
  try {
    assert.equal(a.getAttribute('position').count, c.getAttribute('position').count);
    assert.deepEqual(Array.from(a.index.array), Array.from(c.index.array));
    assert.deepEqual(a.userData.radiusRings.map(({t,center,offset,count,tangent,x,y})=>({t,center,offset,count,tangent,x,y})),
      c.userData.radiusRings.map(({t,center,offset,count,tangent,x,y})=>({t,center,offset,count,tangent,x,y})));
    assert.notDeepEqual(Array.from(a.getAttribute('position').array), Array.from(c.getAttribute('position').array));
  } finally { a.dispose(); c.dispose(); }
});

test('enabled-form bark roughness stays longitudinally smooth and independent of axial subdivision', () => {
  const straight = branch(); straight.points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 3)];
  const form = normalizeTrunkForm({ groove_depth: 0, root_flare: 0, asymmetry: 0 });
  const roughSettings = { ...settings, surface_roughness: .15 };
  const a = createSweptBranchGeometry({ ...straight, trunkForm: form }, 9, roughSettings);
  const b = createSweptBranchGeometry({ ...straight, trunkForm: form,
    points: Array.from({length:18},(_,i)=>new THREE.Vector3(0,0,3*i/17)) }, 9, roughSettings);
  try {
    const pa=a.getAttribute('position'),pb=b.getAttribute('position');
    let previous=null;
    for(const ring of a.userData.radiusRings){
      const center=new THREE.Vector3(...ring.center),actual=new THREE.Vector3().fromBufferAttribute(pa,ring.offset).distanceTo(center)/ring.localRadius;
      if(previous)assert.ok(Math.abs(actual-previous.value)<.02,'fine rings do not create high-frequency transverse folds');
      previous={value:actual,t:ring.t};
      const other=b.userData.radiusRings.find(r=>Math.abs(r.t-ring.t)<1e-10);
      for(let side=0;side<ring.count;side++)assert.ok(new THREE.Vector3().fromBufferAttribute(pa,ring.offset+side)
        .distanceTo(new THREE.Vector3().fromBufferAttribute(pb,other.offset+side))<1e-7,'same t has the same skin');
    }
  }finally{a.dispose();b.dispose();}
});

test('rolled ring frame and oval metrics correspond to the actual visible skin', () => {
  const b=branch();b.sections=[{t:0,radius:1,oval:1.4,roll:35},{t:1,radius:1,oval:1.4,roll:35}];
  const form=normalizeTrunkForm({groove_depth:0,root_flare:0,asymmetry:0,
    sections:[{id:'S',t:.5,radius:1.2,oval:1.25,roll:25}]});
  const geometry=createSweptBranchGeometry({...b,trunkForm:form},64,{...settings,twist:0});
  try{
    const ring=geometry.userData.radiusRings.find(r=>r.t===.5),p=geometry.getAttribute('position');
    const center=new THREE.Vector3(...ring.center),x=new THREE.Vector3(...ring.rolledX),y=new THREE.Vector3(...ring.rolledY);
    assert.ok(Math.abs(ring.ovalX-1.75)<1e-12);
    const point0=new THREE.Vector3().fromBufferAttribute(p,ring.offset).sub(center);
    const point90=new THREE.Vector3().fromBufferAttribute(p,ring.offset+16).sub(center);
    assert.ok(Math.abs(point0.dot(x)-ring.localRadius*ring.ovalX)<1e-7);
    assert.ok(Math.abs(point90.dot(y)-ring.localRadius*ring.ovalY)<1e-7);
  }finally{geometry.dispose();}
});

test('UI preview and cold editor geometry match at each LOD without mutating authoring', () => {
  const points = branch().points.map(p => p.toArray());
  const authoring = normalizeAuthoring({ branch_shape: { branches: [{ id: 'ROOT', parent: '', points,
    knots: points, length: 3, start_radius: .2, end_radius: .1 }] },
    workbench: { trunk_forms: { version: 1, branches: { ROOT: createTrunkFormPreset('BUTTRESS') } } } });
  const saved = JSON.stringify(authoring);
  for (let lod = 0; lod < 4; lod++) {
    const asset = buildBranchAsset(settings, null, [], lod, authoring);
    const root = asset.masterBranches.find(b => b.stableId === 'ROOT');
    const preview = createTrunkFormPreviewGeometry(root, asset.settings, root.trunkForm, lod);
    try { assert.deepEqual(buffers(preview), buffers(meshFor(asset, 'ROOT').geometry)); }
    finally { preview.dispose(); disposeBranchAsset(asset); }
  }
  assert.equal(JSON.stringify(authoring), saved);
});
