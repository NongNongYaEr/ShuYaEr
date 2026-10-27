import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrunkFormPrototype, TRUNK_FORM_PROTOTYPE_PRESETS } from '../web/trunk-form-prototype.js';
import { createGlbExportScene } from '../web/glb-export.js';

const near = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function quality(model) {
  const g = model.geometry, p = g.getAttribute('position'), n = g.getAttribute('normal'),
    uv = g.getAttribute('uv'), t = g.getAttribute('tangent'), index = g.index;
  assert.ok(g.isBufferGeometry && index && index.count % 3 === 0);
  for (const attribute of [p, n, uv, t]) {
    assert.equal(attribute.count, p.count);
    assert.ok([...attribute.array].every(Number.isFinite));
  }
  for (let i = 0; i < p.count; i++) {
    const normal = new THREE.Vector3().fromBufferAttribute(n, i), tangent = new THREE.Vector3().fromBufferAttribute(t, i);
    near(normal.length(), 1, 2e-6); near(tangent.length(), 1, 3e-6); near(normal.dot(tangent), 0, 3e-6);
    assert.ok(t.getW(i) === 1 || t.getW(i) === -1);
    assert.ok(uv.getX(i) >= 0 && uv.getX(i) <= 1 && uv.getY(i) >= 0 && uv.getY(i) <= 1);
  }
  // UV seams and sharp-cap rims are independent indices but coincident vertices.
  // Weld exact Float32 positions before testing the actual closed surface.
  const welded = new Map(), ids = [];
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i)},${p.getY(i)},${p.getZ(i)}`;
    if (!welded.has(key)) welded.set(key, welded.size);
    ids.push(welded.get(key));
  }
  const edges = new Map(), adjacency = new Map(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let volume = 0;
  for (let i = 0; i < index.count; i += 3) {
    const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    assert.ok(triangle.every(id => id >= 0 && id < p.count));
    a.fromBufferAttribute(p, triangle[0]); b.fromBufferAttribute(p, triangle[1]); c.fromBufferAttribute(p, triangle[2]);
    const area = b.clone().sub(a).cross(c.clone().sub(a)).length();
    assert.ok(area > model.parameters.height * model.parameters.baseRadius * 1e-10, `degenerate face ${i / 3}`);
    volume += a.dot(b.clone().cross(c)) / 6;
    const v = triangle.map(id => ids[id]); assert.equal(new Set(v).size, 3);
    for (let j = 0; j < 3; j++) {
      const from = v[j], to = v[(j + 1) % 3], key = from < to ? `${from}:${to}` : `${to}:${from}`;
      const record = edges.get(key) || { count: 0, direction: 0 };
      record.count++; record.direction += from < to ? 1 : -1; edges.set(key, record);
      if (!adjacency.has(from)) adjacency.set(from, new Set()); adjacency.get(from).add(to);
      if (!adjacency.has(to)) adjacency.set(to, new Set()); adjacency.get(to).add(from);
    }
  }
  assert.ok(volume > 0, 'consistent outward winding');
  for (const e of edges.values()) assert.deepEqual(e, { count: 2, direction: 0 });
  assert.equal(welded.size - edges.size + index.count / 3, 2, 'one closed genus-zero shell');
  const reached = new Set([0]), queue = [0];
  for (let i = 0; i < queue.length; i++) for (const id of adjacency.get(queue[i]) || []) if (!reached.has(id)) { reached.add(id); queue.push(id); }
  assert.equal(reached.size, welded.size, 'buttresses must belong to the same connected skin');
  near(g.boundingBox.max.z - g.boundingBox.min.z, model.parameters.height, 1e-6);
  assert.ok(g.boundingSphere.radius > 0);
}

test('three trunk studies have a single closed surface, valid UVs/normals/tangents and outward caps', () => {
  for (const mode of Object.keys(TRUNK_FORM_PROTOTYPE_PRESETS)) {
    const model = createTrunkFormPrototype({ mode, radialSegments: 64, heightSegments: 48 });
    quality(model);
    const p = model.geometry.getAttribute('position'), n = model.parameters.radialSegments, stride = n + 1;
    for (let row = 0; row < model.axis.length; row++) {
      const first = row * stride, last = first + n;
      assert.deepEqual([p.getX(first), p.getY(first), p.getZ(first)], [p.getX(last), p.getY(last), p.getZ(last)]);
      near(model.axis[row].z, model.sections[row].t * model.parameters.height);
      assert.ok(model.sections[row].minimumRadius > 0);
    }
    model.geometry.dispose();
  }
});

test('deep longitudinal grooves change the silhouette rather than adding intersecting tubes', () => {
  const options = { baseRadius: .6, tipRadius: .6, grooveDepth: .78, rootFlare: 0, buttressStrength: 0,
    bulges: [], asymmetry: 0, roughness: 0, lean: [0, 0], twist: .2, seed: 18 };
  const model = createTrunkFormPrototype(options);
  for (const height of [.12, .42, .74]) {
    const radii = Array.from({ length: 512 }, (_, i) => model.sampleRadius(height, i / 512 * Math.PI * 2));
    assert.ok(Math.max(...radii) - Math.min(...radii) > .23, 'visible depth in actual mesh profile');
    assert.ok(Math.min(...radii) > .12 && Math.max(...radii) <= .6);
  }
  assert.equal(model.topology.starShaped, true);
  assert.equal(model.geometry.userData.trunkFormPrototype.topology, 'single_closed_star_section_skin');
  model.geometry.dispose();
});

test('an asymmetric buttress grows from the existing trunk skin and fades completely above its root height', () => {
  const options = { mode: 'BUTTRESS', height: 6, baseRadius: .5, tipRadius: .18, grooveDepth: 0,
    asymmetry: 0, roughness: 0, bulges: [], rootFlare: 0, buttressStrength: 2,
    buttresses: [{ angle: 0, width: .13, height: .3, strength: 1, curve: 0 }], lean: [0, 0] };
  const model = createTrunkFormPrototype(options), plain = createTrunkFormPrototype({ ...options, buttressStrength: 0 });
  const extra = height => model.sampleRadius(height, 0) - plain.sampleRadius(height, 0);
  near(extra(0), 1); assert.ok(extra(0) > extra(.08) && extra(.08) > extra(.2) && extra(.2) > 0);
  near(extra(.3), 0); near(extra(.7), 0); near(model.sampleRadius(0, Math.PI), .5);
  assert.ok(model.sampleRadius(0, 0) > model.sampleRadius(0, Math.PI) * 2);
  quality(model); model.geometry.dispose(); plain.geometry.dispose();
});

test('local burls stay asymmetric and height-local while seed and immutable source options are deterministic', () => {
  const options = freeze({ mode: 'REFINED', seed: 73, radialSegments: 48, heightSegments: 48,
    grooveDepth: 0, rootFlare: 0, buttressStrength: 0, roughness: 0, asymmetry: 0,
    bulgeStrength: .6, bulges: [{ height: .5, angle: .8, width: .25, heightWidth: .055, strength: 1 }], lean: [0, 0] });
  const model = createTrunkFormPrototype(options), same = createTrunkFormPrototype(options), plain = createTrunkFormPrototype({ ...options, bulgeStrength: 0 });
  assert.deepEqual(model.geometry.attributes.position.array, same.geometry.attributes.position.array);
  assert.deepEqual(model.geometry.index.array, same.geometry.index.array);
  near(model.sampleRadius(.5, .8) - plain.sampleRadius(.5, .8), .27);
  assert.ok(model.sampleRadius(.5, .8 + Math.PI) - plain.sampleRadius(.5, .8 + Math.PI) < 1e-8);
  assert.ok(model.sampleRadius(.9, .8) - plain.sampleRadius(.9, .8) < 1e-8);
  assert.equal(model.parameters.bulges[0].height, .5); assert.ok(Object.isFrozen(model.parameters));
  const seeded = createTrunkFormPrototype({ seed: 74, radialSegments: 24, heightSegments: 16 }), different = createTrunkFormPrototype({ seed: 75, radialSegments: 24, heightSegments: 16 });
  assert.notDeepEqual(seeded.geometry.attributes.position.array, different.geometry.attributes.position.array);
  [model, same, plain, seeded, different].forEach(value => value.geometry.dispose());
});

test('normalized parameters survive JSON roundtrip exactly for all three studies and slider reset', () => {
  for (const mode of Object.keys(TRUNK_FORM_PROTOTYPE_PRESETS)) {
    const original = createTrunkFormPrototype({ mode, seed: 17, height: 5.2, baseRadius: .42, tipRadius: .14,
      radialSegments: 48, heightSegments: 32, lean: [.035, -.018] });
    const options = freeze(JSON.parse(JSON.stringify(original.parameters)));
    const loaded = createTrunkFormPrototype(options);
    for (const [name, attribute] of Object.entries(original.geometry.attributes))
      assert.deepEqual(loaded.geometry.getAttribute(name).array, attribute.array, `${mode} ${name} roundtrip`);
    assert.deepEqual(loaded.geometry.index.array, original.geometry.index.array);
    assert.deepEqual(loaded.parameters, original.parameters);
    const changed = createTrunkFormPrototype({ ...options, grooveDepth: .1, ridgeCount: 3 });
    assert.deepEqual(changed.parameters.bulges, original.parameters.bulges, 'ridge count preserves burl locations');
    assert.deepEqual(changed.parameters.buttresses, original.parameters.buttresses, 'ridge count preserves buttress locations');
    assert.equal(changed.parameters.phase, original.parameters.phase);
    const reset = createTrunkFormPrototype(options);
    assert.deepEqual(reset.geometry.attributes.position.array, original.geometry.attributes.position.array, 'reset restores the initial mesh');
    [original, loaded, changed, reset].forEach(value => value.geometry.dispose());
  }
});

test('preview slider extremes keep the skin closed with finite, outward side normals', () => {
  for (const values of [
    { grooveDepth: 0, ridgeCount: 3, rootFlare: 0, buttressStrength: 0, bulgeStrength: 0 },
    { grooveDepth: .7, ridgeCount: 12, rootFlare: 2, buttressStrength: 2, bulgeStrength: .6 },
  ]) {
    const model = createTrunkFormPrototype({ ...values, seed: 17, height: 5.2, baseRadius: .42, tipRadius: .14,
      radialSegments: 128, heightSegments: 96 });
    quality(model);
    const g = model.geometry, n = g.getAttribute('normal'), stride = model.parameters.radialSegments + 1;
    for (let row = 0; row < model.axis.length; row++) for (let side = 0; side < stride; side++) {
      const theta = side / model.parameters.radialSegments * Math.PI * 2;
      assert.ok(n.getX(row * stride + side) * Math.cos(theta) + n.getY(row * stride + side) * Math.sin(theta) > 0,
        `inward side normal at ${row}:${side}`);
    }
    model.geometry.dispose();
  }
});

test('bounded resolution and strong legal settings do not make invalid or degenerate geometry', () => {
  const model = createTrunkFormPrototype({ height: 2, baseRadius: .3, tipRadius: .04,
    radialSegments: 12, heightSegments: 8, grooveDepth: .86, twist: Math.PI * 2,
    asymmetry: .3, rootFlare: 2, buttressStrength: 4, bulgeStrength: 1 });
  quality(model); model.geometry.dispose();
  assert.throws(() => createTrunkFormPrototype({ height: 0 }), /height must be positive/);
  assert.throws(() => createTrunkFormPrototype({ baseRadius: -1 }), /baseRadius must be positive/);
  assert.throws(() => createTrunkFormPrototype({ tipRadius: 0 }), /tipRadius must be positive/);
  assert.throws(() => createTrunkFormPrototype({ buttresses: {} }), /must be arrays/);
});

test('existing GLB scene conversion preserves complete trunk attributes and converts Z-up to glTF Y-up without mutating the prototype', () => {
  const model = createTrunkFormPrototype({ mode: 'BUTTRESS', radialSegments: 24, heightSegments: 16 });
  const sourcePositions = model.geometry.attributes.position.array.slice(), sourceNormals = model.geometry.attributes.normal.array.slice();
  const material = new THREE.MeshStandardMaterial({ color: '#6b4d32' }), mesh = new THREE.Mesh(model.geometry, material); mesh.name = '板根主干小样';
  let disposed = false; model.geometry.addEventListener('dispose', () => { disposed = true; });
  const exported = createGlbExportScene(mesh, { singleMesh: true });
  const geometry = exported.scene.children[0].geometry;
  for (const name of ['position', 'normal', 'uv', 'tangent']) assert.equal(geometry.getAttribute(name).count, model.geometry.getAttribute(name).count);
  geometry.computeBoundingBox(); near(geometry.boundingBox.max.y - geometry.boundingBox.min.y, model.parameters.height);
  assert.equal(geometry.index.count, model.geometry.index.count);
  assert.deepEqual(model.geometry.attributes.position.array, sourcePositions);
  assert.deepEqual(model.geometry.attributes.normal.array, sourceNormals);
  exported.dispose(); assert.equal(disposed, false);
  model.geometry.dispose(); material.dispose();
});
