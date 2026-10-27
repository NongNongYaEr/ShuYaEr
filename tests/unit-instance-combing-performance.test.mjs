import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { normalizeSettings } from '../web/branch-kernel.js';
import { normalizeBranchShape } from '../web/branch-workbench-data.js';
import { evaluatedInstanceFrame, rotateInstance, instanceTransformMatrix } from '../web/branch-instance-operations.js';
import { prepareUnitCombEntries, combUnitInstance, evaluateUnitInstanceCombing, advanceUnitCombEntries, unitCombEffectState } from '../web/unit-instance-combing.js';
import { brushFalloff } from '../web/tree-sculpt.js';

const clamp = THREE.MathUtils.clamp;
const vector = value => value?.isVector3 ? value : new THREE.Vector3(...(Array.isArray(value) ? value : [0, 0, 0]));
const near = (a, b, label = '') => assert.ok(Math.abs(a - b) < 2e-8, `${label}: ${a} / ${b}`);
const vectorNear = (a, b, label = '') => assert.ok(a.distanceTo(b) < 2e-8, `${label}: ${a.distanceTo(b)}`);
const matrixNear = (a, b, label = '') => a.elements.forEach((value, index) => near(value, b.elements[index], label));
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

// A small curved/rolled carrier and complete normal/legacy units exercise the
// placement path without rendering meshes or loading a dense production asset.
function fixture() {
  const shape = normalizeBranchShape({ connector: { position: [.13, -.07, .03], direction: [1, 0, 0], hang_direction: [0, 0, -1] }, branches: [
    { id: 'R1', parent: '', points: [[.13, -.07, .03], [.7, .02, .09], [1.2, .1, .17]], length: 1.1, start_radius: .03, end_radius: .006 },
    { id: 'B1', parent: 'R1', attach: .4, points: [[.55, -.03, .07], [.7, .55, .23]], length: .6, start_radius: .012, end_radius: .003 },
  ] });
  const a = normalizeAuthoring({ branch_library: [{ id: 'SOURCE', revision: 4, shape }], branch_instances: [
    { id: 'P', asset_id: 'SOURCE', linked: true, pinned_revision: 4, parent: 'ROOT', attach: .25, scale: 1.2, radius_scale: 1.3, variation: .1, seed: 97, roll: 19,
      frame: { position: [0, 0, .75], direction: [1, .1, .15], parent_position: [0, 0, .75], parent_tangent: [0, 0, 1] } },
    { id: 'N', asset_id: 'SOURCE', linked: true, pinned_revision: 4, parent: 'P.B1', attach: .7, scale: .4, roll: 11, variation: 0 },
    { id: 'O', asset_id: 'SOURCE', linked: true, pinned_revision: 4, parent: 'ROOT', attach: .75, scale: .85, radius_scale: .9, variation: .08, seed: 5, roll: -17,
      frame: { position: [0, 0, 2.25], direction: [1, -.1, -.2], parent_position: [0, 0, 2.25], parent_tangent: [0, 0, 1] } },
  ] });
  const legacy = { id: 'COPY_SOURCE', legacyPlacement: true, kind: 'LEGACY_UNIT', asset_id: 'SOURCE', linked: false,
    pinned_revision: 4, parent: '', legacyParent: 'ROOT', attach: .5, scale: 1, radius_scale: 1, roll: -13, seed: 1, variation: 0,
    frame: { position: [2, .2, 1.5], direction: [1, .3, -.1], parent_position: null, parent_tangent: [0, 0, 1] }, shape: structuredClone(shape) };
  a.branch_instances.push(legacy);
  const mount = new THREE.Matrix4().compose(new THREE.Vector3(.2, -.1, .4),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(.21, -.13, .17)), new THREE.Vector3(1.1, 1.1, 1.1));
  const parentPoints = [[0, 0, 0], [.05, .02, .8], [.14, -.02, 1.5], [.07, .1, 2.3], [0, .05, 3]];
  const branches = [{ id: 0, stableId: 'ROOT', parentId: -1, points: parentPoints.map(p => new THREE.Vector3(...p).applyMatrix4(mount)), mountMatrix: mount }];
  const settings = normalizeSettings({ leaf_density: 0, child_count: 0, wind_strength: 0 });
  for (const instance of a.branch_instances) {
    const frame = evaluatedInstanceFrame(instance, shape, branches, settings), local = new Map();
    for (const record of shape.branches) {
      const id = branches.length, stableId = instance.id + '.' + record.id;
      const carrier = branches.find(b => b.stableId === instance.parent);
      branches.push({ id, stableId, parentId: local.get(record.parent) ?? carrier?.id ?? 0,
        instanceId: instance.legacyPlacement ? '' : instance.id, unitOwner: instance.legacyPlacement ? instance.id : '',
        points: record.points.map(p => new THREE.Vector3(...p).applyMatrix4(frame.matrix)) });
      local.set(record.id, id);
    }
  }
  const placements = a.branch_instances.map((instance, index) => ({ branchStableId: instance.id + '.B1', sourceInstanceId: instance.id,
    position: branches.find(b => b.stableId === instance.id + '.B1').points.at(-1).clone().add(new THREE.Vector3(.05, .1, -.07 * index)) }));
  return { a, shape, branches, settings, placements };
}

// Independent pre-optimization segment evaluator. Keep the exact 3D lerp and
// perspective projection, rather than comparing to a screen interpolation.
function slowWeights(entries, options) {
  const { project, radius = 160, hardness = .2, worldRadius = 1 } = options;
  const raw = options.center || {}, center = Array.isArray(raw) ? { x: raw[0], y: raw[1] } : { ...raw };
  center.depth ??= options.depth; center.world = vector(center.world || center.center3d || options.center3d);
  const mode = options.depthMode || options.scope || 'SURFACE', depthRadius = options.depthRadius ?? (options.depthRange ?? 1.5) / 2;
  const result = new Map();
  for (const entry of entries) {
    let weight = 0;
    for (const line of entry.sampleLines || [entry.samples]) {
      for (let n = 1; n < line.length; n++) {
        const a = line[n - 1], b = line[n]; let t;
        if (mode === 'SPHERE') {
          const edge = b.clone().sub(a); t = clamp(center.world.clone().sub(a).dot(edge) / Math.max(1e-12, edge.lengthSq()), 0, 1);
        } else {
          const pa = project(a), pb = project(b);
          if (pa.visible === false || pb.visible === false || pa.clip < -1 || pa.clip > 1 || pb.clip < -1 || pb.clip > 1) continue;
          const dx = pb.x - pa.x, dy = pb.y - pa.y;
          t = clamp(((center.x - pa.x) * dx + (center.y - pa.y) * dy) / Math.max(1e-12, dx * dx + dy * dy), 0, 1);
        }
        const point = a.clone().lerp(b, t), p = project(point);
        if (p.visible === false || p.clip < -1 || p.clip > 1) continue;
        const distance = mode === 'SPHERE' ? point.distanceTo(center.world) / Math.max(1e-6, worldRadius) * radius : Math.hypot(p.x - center.x, p.y - center.y);
        const depth = mode === 'SURFACE' && Number.isFinite(center.depth) ? brushFalloff(Math.abs(p.depth - center.depth), depthRadius, .75) : 1;
        weight = Math.max(weight, brushFalloff(distance, radius, clamp(hardness, 0, 1)) * depth);
        if (weight >= 1) break;
      }
      if (weight >= 1) break;
    }
    if (weight > 0 && unitCombEffectState(entry, options).skipReason) weight = 0;
    result.set(entry.id, weight);
  }
  return result;
}

// The previous canonical helpers form a correctness oracle for the optimized
// cached frame path, including nonidentity carrier frames and source pivots.
function slowComb(entry, options) {
  const motion = vector(options.delta), influence = clamp(Number(options.weight ?? 1) || 0, 0, 1), force = clamp(Number(options.strength ?? .65) || 0, 0, 1);
  if (!motion.toArray().every(Number.isFinite) || motion.lengthSq() < 1e-16 || influence <= 0 || force <= 0) return null;
  const state = unitCombEffectState(entry, options); if (state.skipReason) return null;
  const before = structuredClone(entry.instance); let after, rotation, stroke;
  if (state.effect === 'TURN') {
    const target = state.targetRotation || new THREE.Quaternion().setFromUnitVectors(entry.frame.direction.clone().normalize(), motion.clone().normalize());
    rotation = new THREE.Quaternion().slerp(target, Math.min(.25, motion.length() / Math.max(.01, Number(options.worldRadius) || 1) * force * 2) * influence);
    if (Math.abs(rotation.w) > 1 - 1e-14) return null;
    after = rotateInstance(before, entry.parent, entry.settings, rotation, entry.shape); after.scale = before.scale; after.radius_scale = before.radius_scale;
  } else {
    const initial = entry.stroke?.effect === state.effect ? entry.stroke : { effect: state.effect, progress: 0, instance: structuredClone(entry.instance),
      targetRotation: state.targetRotation?.clone(), targetScaleRatio: state.targetScaleRatio };
    const progress = Math.min(1, initial.progress + motion.length() / Math.max(.01, Number(options.worldRadius) || 1) * force * influence * 2);
    const total = new THREE.Quaternion().slerp(initial.targetRotation || new THREE.Quaternion(), progress);
    after = state.effect === 'SCALE' ? structuredClone(initial.instance) : rotateInstance(initial.instance, entry.parent, entry.settings, total, entry.shape);
    after.scale = state.effect === 'SCALE' ? initial.instance.scale * (1 + (initial.targetScaleRatio - 1) * progress) : initial.instance.scale;
    after.radius_scale = initial.instance.radius_scale; stroke = { ...initial, progress };
  }
  const matrix = instanceTransformMatrix(before, after, entry.shape, entry.branches, entry.settings);
  if (state.effect !== 'TURN' && matrix.elements.every((v, n) => Math.abs(v - new THREE.Matrix4().elements[n]) < 1e-13)) return null;
  return { id: entry.id, before, after, matrix, shape: entry.shape, familyIds: entry.familyIds, ...(stroke ? { stroke } : {}) };
}
function slowAdvance(entries, updates) {
  const byId = new Map(updates.map(update => [update.id, update]));
  return entries.map(entry => {
    const update = byId.get(entry.id); if (!update) return entry;
    const sampleLines = entry.sampleLines.map(line => line.map(p => p.clone().applyMatrix4(update.matrix)));
    const displayLines = entry.displayLines === entry.sampleLines ? sampleLines : entry.displayLines?.map(line => line.map(p => p.clone().applyMatrix4(update.matrix)));
    return { ...entry, instance: structuredClone(update.after), sampleLines, samples: sampleLines.flat(), displayLines,
      ...(update.stroke ? { stroke: update.stroke } : {}), longAxis: entry.longAxis?.clone().transformDirection(update.matrix),
      frame: { position: entry.frame.position.clone().applyMatrix4(update.matrix), direction: entry.frame.direction.clone().transformDirection(update.matrix), matrix: update.matrix.clone().multiply(entry.frame.matrix) } };
  });
}
function projectors() {
  const camera = new THREE.PerspectiveCamera(57, 1.6, .05, 100);
  camera.position.set(7, -9, 6); camera.up.set(0, 0, 1); camera.lookAt(1, 0, 1.5); camera.updateMatrixWorld();
  const clip = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
  return [p => ({ x: p.x * 100, y: p.y * 100, depth: p.z, clip: 0, visible: true }), p => {
    const q = p.clone().applyMatrix4(clip), v = p.clone().applyMatrix4(camera.matrixWorldInverse);
    return { x: (q.x * .5 + .5) * 800, y: (.5 - q.y * .5) * 500, depth: -v.z, clip: q.z, visible: -v.z > 0 };
  }];
}
const effects = [
  { orientation: 'DRAG' }, { orientation: 'DOWN', downDirection: new THREE.Vector3(0, 0, -1) },
  { orientation: 'ROLL', downDirection: new THREE.Vector3(0, 0, -1) },
  { effect: 'ALIGN', sampleDirection: new THREE.Vector3(-.2, .7, .4).normalize() },
  { effect: 'SPREAD', centerPoint: new THREE.Vector3(0, -2, 1), angleLimitDegrees: 25 },
  { effect: 'SCALE', sizeLimitPercent: 20 }, { effect: 'JITTER', seed: 73, angleLimitDegrees: 25 },
];

test('cached placement math matches canonical DRAG/DOWN/ROLL/ALIGN/SPREAD/SCALE/JITTER in orthographic and perspective surface/through/sphere strokes', () => {
  const f = fixture(), original = JSON.stringify(f.a);
  for (const project of projectors()) for (const depthMode of ['SURFACE', 'THROUGH', 'SPHERE']) for (const effect of effects) {
    const prepare = () => prepareUnitCombEntries({ authoring: f.a, branches: f.branches, settings: f.settings, scope: 'ALL', sampleBranches: 'ALL', placements: f.placements });
    let fast = prepare(), slow = prepare(); assert.deepEqual(fast.map(e => e.id), ['P', 'O', 'COPY_SOURCE']);
    for (let n = 0; n < 12; n++) {
      const world = fast[0].sampleLines[0][1].clone().lerp(fast[0].sampleLines[0][2], .3), projected = project(world);
      const options = { ...effect, project, depthMode, center: { x: projected.x + 7, y: projected.y - 3, depth: projected.depth, world },
        radius: 110, worldRadius: 1.2, hardness: .31, strength: .73, depthRange: 2.3, delta: new THREE.Vector3(.018, .034, -.021) };
      const expectedWeights = slowWeights(slow, options), expectedUpdates = [];
      for (const entry of slow) { const update = slowComb(entry, { ...options, weight: expectedWeights.get(entry.id) }); if (update) expectedUpdates.push(update); }
      const actual = evaluateUnitInstanceCombing(fast, options), label = `${effect.effect || effect.orientation}/${depthMode}/${n}`;
      for (const [id, weight] of expectedWeights) near(actual.weights.get(id), weight, label + ' weight ' + id);
      assert.deepEqual(actual.updates.map(u => u.id), expectedUpdates.map(u => u.id), label + ' affected complete instances');
      actual.updates.forEach((update, index) => {
        const expected = expectedUpdates[index]; matrixNear(update.matrix, expected.matrix, label + ' whole-family matrix');
        assert.equal(update.after.scale, expected.after.scale); assert.equal(update.after.radius_scale, expected.after.radius_scale);
        near(update.after.roll, expected.after.roll, label + ' saved roll');
        for (const field of ['position', 'direction', 'parent_position', 'parent_tangent']) if (expected.after.frame[field]) update.after.frame[field].forEach((v, j) => near(v, expected.after.frame[field][j], label + ' saved ' + field));
        assert.equal(update.after.asset_id, expected.after.asset_id); assert.equal(update.after.pinned_revision, expected.after.pinned_revision);
        for (const id of update.familyIds) assert.equal(actual.matrices.get(id), update.matrix);
      });
      fast = advanceUnitCombEntries(fast, actual.updates); slow = slowAdvance(slow, expectedUpdates);
      for (let index = 0; index < fast.length; index++) {
        vectorNear(fast[index].frame.position, slow[index].frame.position, label + ' pivot');
        vectorNear(fast[index].longAxis, slow[index].longAxis, label + ' long axis');
        fast[index].samples.forEach((point, i) => vectorNear(point, slow[index].samples[i], label + ' complete hit geometry'));
      }
    }
  }
  assert.equal(JSON.stringify(f.a), original, 'all modes leave source models and authoring intact');
});

test('prepared and advanced entries never search the full branch graph during a dab and retain immutable legacy model references', () => {
  const f = fixture(), original = JSON.stringify(f.a), legacy = f.a.branch_instances.at(-1);
  let payloadReads = 0;
  Object.defineProperty(legacy.shape, 'largeSavedPayload', { enumerable: true, configurable: true, get() { payloadReads++; return new Array(10000).fill([1, 2, 3]); } });
  // Freeze all real source arrays as well; a source must remain read-only even
  // while independent placement/frame records change throughout a pen.
  for (const record of legacy.shape.branches) freeze(record); freeze(legacy.shape.connector);
  const entries = prepareUnitCombEntries({ authoring: f.a, branches: f.branches, settings: f.settings, scope: 'ALL', sampleBranches: 'ALL' });
  assert.equal(payloadReads, 0, 'prepare does not traverse the saved model payload');
  const graphFind = f.branches.find; f.branches.find = () => { throw new Error('dab searched the whole runtime graph'); };
  try {
    for (const effect of effects) {
      let working = entries;
      for (let n = 0; n < 8; n++) {
        const updates = working.map(entry => combUnitInstance(entry, { ...effect, delta: new THREE.Vector3(0, .03, -.01), worldRadius: 1, strength: 1 })).filter(Boolean);
        for (const update of updates.filter(u => u.id === legacy.id)) {
          assert.equal(update.before.shape, legacy.shape); assert.equal(update.after.shape, legacy.shape); assert.equal(update.shape, legacy.shape);
          assert.notEqual(update.before.frame, legacy.frame); assert.notEqual(update.after.frame, legacy.frame);
        }
        const next = advanceUnitCombEntries(working, updates);
        assert.equal(next.find(e => e.id === legacy.id).instance.shape, legacy.shape);
        working = next;
      }
    }
    assert.equal(payloadReads, 0, 'no dab or advance traverses/copies the source model');
    assert.equal(advanceUnitCombEntries(entries, []), entries, 'unaffected samples keep the exact cached preview pool');
  } finally { f.branches.find = graphFind; delete legacy.shape.largeSavedPayload; }
  assert.equal(JSON.stringify(f.a), original);
});

test('distant segment broad phase reduces projections while exact perspective weights, clipped endpoints and point anchors stay unchanged', () => {
  const f = fixture(), entries = prepareUnitCombEntries({ authoring: f.a, branches: f.branches, settings: f.settings, scope: 'ALL', sampleBranches: 'ALL', placements: f.placements });
  for (const baseProject of projectors()) for (const depthMode of ['SURFACE', 'THROUGH', 'SPHERE']) {
    let calls = 0; const project = point => { calls++; return baseProject(point); };
    const options = { project, depthMode, center: { x: 100000, y: 100000, depth: 3, world: new THREE.Vector3(10000, 10000, 10000) },
      radius: 80, worldRadius: 1, delta: new THREE.Vector3() };
    const expected = slowWeights(entries, options), slowCalls = calls; calls = 0;
    const result = evaluateUnitInstanceCombing(entries, options), fastCalls = calls;
    assert.deepEqual(result.weights, expected); assert.equal(result.updates.length, 0);
    assert.ok(fastCalls < slowCalls, `${depthMode}: fewer projections ${fastCalls}/${slowCalls}`);
    for (const mask of [point => ({ ...baseProject(point), visible: false }), point => ({ ...baseProject(point), clip: 2 })]) {
      const actual = evaluateUnitInstanceCombing(entries, { ...options, project: mask });
      assert.deepEqual(actual.weights, slowWeights(entries, { ...options, project: mask }));
    }
    const anchor = f.placements[0].position, p = baseProject(anchor), anchored = { ...options, project: baseProject, center: { ...p, world: anchor }, radius: 20, worldRadius: .03 };
    assert.deepEqual(evaluateUnitInstanceCombing(entries, anchored).weights, slowWeights(entries, anchored), 'whole-model organ anchors keep their exact degenerate segment hit');
  }
});

test('advance never reads older flat samples, lazily caches the new transformed array and preserves enumerable metadata and setters', () => {
  const f = fixture(), [entry] = prepareUnitCombEntries({ authoring: f.a, branches: f.branches, settings: f.settings, selection: ['P'], sampleBranches: 'ALL' });
  const metadata = Symbol('external-preview-metadata'), value = { owner: 'external-consumer' };
  entry[metadata] = value; entry.unrecognizedMetadata = value;
  Object.defineProperty(entry, '__proto__', { enumerable: true, configurable: true, writable: true, value });
  Object.defineProperty(entry, 'hiddenMetadata', { enumerable: false, value: 'not copied by object spread' });
  Object.defineProperty(entry, 'samples', { enumerable: true, configurable: true, get() { throw new Error('advance evaluated previous flat samples'); } });
  const brush = { delta: new THREE.Vector3(0, .09, -.02), worldRadius: 1, strength: 1 };
  const update = combUnitInstance(entry, brush), [next] = advanceUnitCombEntries([entry], [update]);
  assert.equal(next[metadata], value); assert.equal(next.unrecognizedMetadata, value);
  assert.equal(next.__proto__, value); assert.equal(Object.getPrototypeOf(next), Object.prototype);
  assert.ok(!Object.hasOwn(next, 'hiddenMetadata'));
  const descriptor = Object.getOwnPropertyDescriptor(next, 'samples');
  assert.equal(descriptor.enumerable, true); assert.equal(descriptor.configurable, true); assert.equal(typeof descriptor.get, 'function');
  let flattenCalls = 0, originalFlat = next.sampleLines.flat;
  next.sampleLines.flat = function(...args) { flattenCalls++; return originalFlat.apply(this, args); };
  const initial = next.samples;
  assert.equal(flattenCalls, 1); assert.equal(next.samples, initial); assert.equal(flattenCalls, 1, 'the getter caches its array identity');
  assert.equal(initial.length, entry.sampleLines.reduce((n, line) => n + line.length, 0));
  const expected = entry.sampleLines.flat().map(p => p.clone().applyMatrix4(update.matrix));
  initial.forEach((point, index) => vectorNear(point, expected[index]));
  const replacement = [new THREE.Vector3(99, 99, 99)]; next.samples = replacement;
  assert.equal(next.samples, replacement); next.samples = undefined; assert.equal(next.samples, undefined, 'setting undefined remains an ordinary assignment');
  const nextUpdate = combUnitInstance(next, brush), [last] = advanceUnitCombEntries([next], [nextUpdate]);
  assert.equal(flattenCalls, 1, 'advancing a lazy entry does not read or flatten the previous array');
  assert.notEqual(last.samples, initial); assert.notEqual(last.samples, replacement);
  last.samples.forEach((point, index) => vectorNear(point, initial[index].clone().applyMatrix4(nextUpdate.matrix)));
  assert.equal(flattenCalls, 1); assert.equal(last[metadata], value);
  entry.sampleLines.flat().forEach((point, index) => vectorNear(point, expected[index].clone().applyMatrix4(update.matrix.clone().invert()), 'original sample snapshot stays unchanged'));
});

test('ephemeral brush lerp projections opt out of endpoint caching without changing projector compatibility', () => {
  const f = fixture(), [entry] = prepareUnitCombEntries({ authoring: f.a, branches: f.branches, settings: f.settings, selection: ['P'] });
  const base = projectors()[1], world = entry.sampleLines[0][0].clone().lerp(entry.sampleLines[0][1], .4), center = { ...base(world), world };
  let endpointCalls = 0, temporaryCalls = 0;
  const project = (point, cache = true) => { if (cache) endpointCalls++; else temporaryCalls++; return base(point); };
  const options = { project, center, radius: 80, worldRadius: .8, scope: 'THROUGH', delta: new THREE.Vector3() };
  const result = evaluateUnitInstanceCombing([entry], options);
  assert.ok(endpointCalls >= 2); assert.ok(temporaryCalls >= 1);
  assert.deepEqual(result.weights, slowWeights([entry], { ...options, project: base }), 'a one-argument projector continues to produce the same weights');
});

test('optional in-place strokes match immutable math for all seven effects without moving prepared geometry or sharing independent working sequences', () => {
  const f = fixture(), authoringBefore = JSON.stringify(f.a);
  const prepared = prepareUnitCombEntries({ authoring: f.a, branches: f.branches, settings: f.settings, scope: 'ALL', sampleBranches: 'ALL', placements: f.placements });
  const metadata = Symbol('stroke-metadata'), external = { source: 'unchanged' };
  for (const entry of prepared) {
    entry[metadata] = external; entry.futureMetadata = external;
    freeze(entry.sampleLines); freeze(entry.displayLines);
  }
  const geometryBefore = prepared.map(entry => entry.sampleLines.map(line => line.map(point => point.toArray())));
  const instanceBefore = prepared.map(entry => structuredClone(entry.instance));
  const project = projectors()[1];
  for (const effect of effects) {
    // Both sequences start from the same prepared cache. A canceled sequence
    // must never establish a mutable mark on that reusable initial cache.
    let mutable = prepared, immutable = prepared, independent = prepared;
    const workspace = new WeakSet(), independentWorkspace = new WeakSet();
    const firstPoints = new Map(), displayPoints = new Map();
    for (let n = 0; n < 18; n++) {
      const world = immutable[0].sampleLines[0][0].clone().lerp(immutable[0].sampleLines[0][1], .4);
      const options = { ...effect, project, center: { ...project(world), world }, radius: 500, worldRadius: 2,
        scope: 'THROUGH', hardness: .6, strength: .8, delta: new THREE.Vector3(.018, .036, -.02) };
      const expected = evaluateUnitInstanceCombing(immutable, options), actual = evaluateUnitInstanceCombing(mutable, options);
      assert.deepEqual(actual.updates.map(update => update.id), expected.updates.map(update => update.id));
      actual.updates.forEach((update, index) => matrixNear(update.matrix, expected.updates[index].matrix, effect.effect || effect.orientation));
      immutable = advanceUnitCombEntries(immutable, expected.updates);
      mutable = advanceUnitCombEntries(mutable, actual.updates, { inPlace: true, workspace });
      if (n === 0) {
        for (const entry of mutable) if (actual.updates.some(update => update.id === entry.id)) {
          const source = prepared.find(original => original.id === entry.id);
          assert.notEqual(entry, source); assert.notEqual(entry.sampleLines, source.sampleLines);
          assert.notEqual(entry.sampleLines[0][0], source.sampleLines[0][0]);
          firstPoints.set(entry.id, entry.sampleLines[0][0]); displayPoints.set(entry.id, entry.displayLines[0][0]);
        }
        const another = evaluateUnitInstanceCombing(independent, options);
        independent = advanceUnitCombEntries(independent, another.updates, { inPlace: true, workspace: independentWorkspace });
        for (const entry of independent) if (firstPoints.has(entry.id)) assert.notEqual(entry.sampleLines[0][0], firstPoints.get(entry.id));
      }
      for (let index = 0; index < mutable.length; index++) {
        const entry = mutable[index], expectedEntry = immutable[index];
        assert.equal(entry[metadata], external); assert.equal(entry.futureMetadata, external);
        vectorNear(entry.frame.position, expectedEntry.frame.position); vectorNear(entry.longAxis, expectedEntry.longAxis);
        assert.equal(entry.instance.scale, expectedEntry.instance.scale); assert.equal(entry.instance.radius_scale, expectedEntry.instance.radius_scale);
        entry.samples.forEach((point, j) => vectorNear(point, expectedEntry.samples[j], 'unchanged 6px geometry samples'));
        entry.displayLines.flat().forEach((point, j) => vectorNear(point, expectedEntry.displayLines.flat()[j], 'display axis'));
        if (firstPoints.has(entry.id)) {
          assert.equal(entry.sampleLines[0][0], firstPoints.get(entry.id), 'later dabs reuse stroke-local vectors');
          assert.equal(entry.displayLines[0][0], displayPoints.get(entry.id));
        }
      }
      assert.deepEqual(prepared.map(entry => entry.sampleLines.map(line => line.map(point => point.toArray()))), geometryBefore);
      assert.deepEqual(prepared.map(entry => entry.instance), instanceBefore);
      if (n > 0) {
        const unchanged = independent.map(entry => entry.samples.map(point => point.toArray()));
        const target = independent[0], testUpdate = combUnitInstance(target, { ...effect, delta: new THREE.Vector3(0, .01, 0) });
        if (testUpdate) {
          const detached = advanceUnitCombEntries(independent, [testUpdate]);
          assert.notEqual(detached[0].sampleLines[0][0], target.sampleLines[0][0], 'default API detaches a previously mutable entry');
          assert.deepEqual(independent.map(entry => entry.samples.map(point => point.toArray())), unchanged, 'immutable calls do not change a working stroke');
        }
      }
    }
    // Discard mutable (Esc/cancel) and begin a fresh pen from prepared again.
    assert.ok(prepared.every(entry => !entry.stroke));
    const brush = { ...effect, delta: new THREE.Vector3(0, .05, -.01), strength: 1 };
    const canceledRestart = advanceUnitCombEntries(prepared, prepared.map(entry => combUnitInstance(entry, brush)).filter(Boolean), { inPlace: true });
    const normalRestart = advanceUnitCombEntries(prepared, prepared.map(entry => combUnitInstance(entry, brush)).filter(Boolean));
    canceledRestart.forEach((entry, index) => {
      entry.samples.forEach((point, j) => vectorNear(point, normalRestart[index].samples[j], 'canceled cache must not carry previous geometry'));
      assert.equal(entry.instance.scale, normalRestart[index].instance.scale);
    });
  }
  assert.equal(JSON.stringify(f.a), authoringBefore, 'authoring, source models and canceled pens remain untouched');
  const rootOnly = prepareUnitCombEntries({ authoring: f.a, branches: f.branches, settings: f.settings, selection: ['P'] });
  let rootWorking = rootOnly; const rootWorkspace = new WeakSet();
  for (let n = 0; n < 3; n++) {
    const before = rootWorking[0].sampleLines[0][1].clone();
    const update = combUnitInstance(rootWorking[0], { delta: new THREE.Vector3(0, .04, 0), strength: 1 });
    rootWorking = advanceUnitCombEntries(rootWorking, [update], { inPlace: true, workspace: rootWorkspace });
    assert.equal(rootWorking[0].displayLines, rootWorking[0].sampleLines, 'ROOT display and hit geometry preserve their shared array');
    vectorNear(rootWorking[0].sampleLines[0][1], before.applyMatrix4(update.matrix), 'shared ROOT lines are transformed exactly once');
  }
});

test('workspace ownership isolates forks from an already advanced pool and safe default calls never reuse another pen', () => {
  const f = fixture(), prepared = prepareUnitCombEntries({ authoring: f.a, branches: f.branches, settings: f.settings, selection: ['P'], sampleBranches: 'ALL' });
  const paint = entries => entries.map(entry => combUnitInstance(entry, { delta: new THREE.Vector3(0, .07, -.01), strength: 1 })).filter(Boolean);
  const coordinates = entries => entries.map(entry => entry.sampleLines.map(line => line.map(point => point.toArray())));
  const preparedBefore = coordinates(prepared), firstWorkspace = new WeakSet(), forkWorkspace = new WeakSet();
  const marked = advanceUnitCombEntries(prepared, paint(prepared), { inPlace: true, workspace: firstWorkspace });
  const markedBefore = coordinates(marked);
  assert.ok(firstWorkspace.has(marked[0])); assert.ok(!firstWorkspace.has(prepared[0]));
  const fork = advanceUnitCombEntries(marked, paint(marked), { inPlace: true, workspace: forkWorkspace });
  assert.notEqual(fork[0], marked[0]); assert.notEqual(fork[0].sampleLines[0][0], marked[0].sampleLines[0][0]);
  assert.deepEqual(coordinates(marked), markedBefore, 'starting a new workspace cannot change the old pen');
  assert.ok(forkWorkspace.has(fork[0])); assert.ok(!forkWorkspace.has(marked[0]));
  const forkBefore = coordinates(fork);
  advanceUnitCombEntries(marked, paint(marked), { inPlace: true, workspace: firstWorkspace });
  assert.deepEqual(coordinates(fork), forkBefore, 'continuing the old pen cannot move the fork');
  const oldPenAfter = coordinates(marked), unowned = advanceUnitCombEntries(marked, paint(marked), { inPlace: true });
  assert.notEqual(unowned[0], marked[0]); assert.deepEqual(coordinates(marked), oldPenAfter, 'omitting workspace remains isolated');
  const unownedBefore = coordinates(unowned), anotherDefault = advanceUnitCombEntries(unowned, paint(unowned), { inPlace: true });
  assert.notEqual(anotherDefault[0], unowned[0]); assert.deepEqual(coordinates(unowned), unownedBefore, 'each omitted-workspace call copies anew');
  assert.deepEqual(coordinates(prepared), preparedBefore);
  const cancelRestart = advanceUnitCombEntries(prepared, paint(prepared), { inPlace: true, workspace: new WeakSet() });
  const expectedRestart = advanceUnitCombEntries(prepared, paint(prepared));
  assert.deepEqual(coordinates(cancelRestart), coordinates(expectedRestart), 'a fresh workspace after cancellation starts from the unchanged prepared pool');
});
