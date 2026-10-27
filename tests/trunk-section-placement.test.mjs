import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { sectionPositionFromSurfaceHit } from '../web/trunk-section-placement.js';

const near = (actual, expected, tolerance = 1e-7) => assert.ok(actual !== null && Math.abs(actual - expected) < tolerance,
  `${actual} should be near ${expected}`);

function fixture() {
  // Two vertically overlapping skin bands, separated in depth. Their centers
  // share screen coordinates from the front, but the hit face identifies t.
  const rings = [
    { t: 0, center: [0, -1, 0], offset: 0, count: 4 },
    { t: .25, center: [0, 1, 0], offset: 4, count: 4 },
    { t: .75, center: [0, -1, -5], offset: 8, count: 4 },
    { t: 1, center: [0, 1, -5], offset: 12, count: 4 },
  ];
  const positions = rings.flatMap(({ center: [x, y, z] }) => [
    [x - .5, y, z + .2], [x + .5, y, z + .2], [x + .5, y, z - .2], [x - .5, y, z - .2],
  ]).flat();
  positions.push(0, -1, 0, 0, 1, -5); // End-cap center vertices are not ring vertices.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mesh = new THREE.Mesh(geometry); mesh.updateMatrixWorld();
  return { rings, mesh };
}

function hitAt(mesh, indices, weights = [.25, .25, .5]) {
  const positions = mesh.geometry.getAttribute('position'), point = new THREE.Vector3();
  indices.forEach((index, i) => point.addScaledVector(new THREE.Vector3().fromBufferAttribute(positions, index), weights[i]));
  point.applyMatrix4(mesh.matrixWorld);
  return { object: mesh, point, face: { a: indices[0], b: indices[1], c: indices[2] } };
}

test('surface face chooses the correct depth at overlapping camera-space centerlines', () => {
  const { rings, mesh } = fixture();
  const front = hitAt(mesh, [0, 1, 5]), back = hitAt(mesh, [8, 9, 13]);
  near(front.point.x, back.point.x); near(front.point.y, back.point.y);
  near(sectionPositionFromSurfaceHit(rings, front, mesh), .125);
  near(sectionPositionFromSurfaceHit(rings, back, mesh), .875);
});

test('surface t is continuous within both triangles of an evaluated skin band', () => {
  const { rings, mesh } = fixture();
  for (const alpha of [.01, .17, .43, .71, .99]) {
    near(sectionPositionFromSurfaceHit(rings, hitAt(mesh, [0, 1, 5], [(1 - alpha) * .4, (1 - alpha) * .6, alpha]), mesh), alpha * .25);
    near(sectionPositionFromSurfaceHit(rings, hitAt(mesh, [0, 5, 4], [1 - alpha, alpha * .7, alpha * .3]), mesh), alpha * .25);
  }
});

test('world rotation, translation and nonuniform scale preserve surface placement without mutation', () => {
  const { rings, mesh } = fixture();
  mesh.position.set(12, -3, 7); mesh.rotation.set(.47, -.68, .19); mesh.scale.set(2.5, .7, 1.3); mesh.updateMatrixWorld();
  const hit = hitAt(mesh, [8, 13, 12], [.37, .38, .25]);
  const before = { rings: JSON.stringify(rings), point: hit.point.toArray(), matrix: mesh.matrixWorld.toArray(),
    positions: Array.from(mesh.geometry.getAttribute('position').array) };
  near(sectionPositionFromSurfaceHit(rings, hit, mesh), .75 + .25 * .63);
  assert.equal(JSON.stringify(rings), before.rings); assert.deepEqual(hit.point.toArray(), before.point);
  assert.deepEqual(mesh.matrixWorld.toArray(), before.matrix);
  assert.deepEqual(Array.from(mesh.geometry.getAttribute('position').array), before.positions);
});

test('end caps use the actual 3D centerline endpoint rather than a skin-band midpoint', () => {
  const { rings, mesh } = fixture();
  near(sectionPositionFromSurfaceHit(rings, hitAt(mesh, [16, 0, 1]), mesh), 0);
  near(sectionPositionFromSurfaceHit(rings, hitAt(mesh, [17, 12, 13]), mesh), 1);
});

test('without a face, placement projects in 3D and supports long and single-ring carriers', () => {
  const { rings, mesh } = fixture();
  near(sectionPositionFromSurfaceHit(rings, { point: new THREE.Vector3(0, .2, -5) }, mesh), .9);
  const many = Array.from({ length: 300 }, (_, i) => ({ t: i / 299, center: [0, i, 0] }));
  near(sectionPositionFromSurfaceHit(many, { point: new THREE.Vector3(0, 127.25, 0) }, mesh), 127.25 / 299);
  near(sectionPositionFromSurfaceHit([{ t: .72, center: [1, 2, 3] }], { point: new THREE.Vector3(1, 2, 3) }, mesh), .72);
  near(sectionPositionFromSurfaceHit([{ t: -1, center: [0, 0, 0] }, { t: 2, center: [0, 1, 0] }], { point: new THREE.Vector3(0, -1, 0) }, mesh), 0);
});

test('extra non-ring surfaces fall back to their nearest actual 3D centerline', () => {
  const { rings, mesh } = fixture(), positions = mesh.geometry.getAttribute('position');
  const expanded = [...positions.array, -.5, .3, -5, .5, .3, -5, 0, .6, -5];
  mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(expanded, 3));
  const hit = hitAt(mesh, [18, 19, 20], [.25, .25, .5]);
  near(sectionPositionFromSurfaceHit(rings, hit, mesh), .75 + .25 * .725);
});

test('invalid rings, matrices, vertices, face indices and non-hit points are rejected', () => {
  const { rings, mesh } = fixture(), hit = hitAt(mesh, [0, 1, 5]);
  for (const invalid of [[], null, [...rings].reverse(), [rings[0], { ...rings[1], t: 0 }],
    [{ ...rings[0], center: [NaN, 0, 0] }], [{ ...rings[0], t: Infinity }]]) {
    assert.equal(sectionPositionFromSurfaceHit(invalid, hit, mesh), null);
  }
  assert.equal(sectionPositionFromSurfaceHit(rings, { ...hit, object: new THREE.Mesh() }, mesh), null);
  assert.equal(sectionPositionFromSurfaceHit(rings, { ...hit, point: new THREE.Vector3(NaN, 0, 0) }, mesh), null);
  assert.equal(sectionPositionFromSurfaceHit(rings, { ...hit, face: { a: 0, b: 1, c: 500 } }, mesh), null);
  assert.equal(sectionPositionFromSurfaceHit(rings, { ...hit, face: { a: 0, b: 0, c: 5 } }, mesh), null);
  assert.equal(sectionPositionFromSurfaceHit(rings, { ...hit, point: hit.point.clone().add(new THREE.Vector3(0, 0, 1)) }, mesh), null);
  assert.equal(sectionPositionFromSurfaceHit(rings, { ...hit, point: new THREE.Vector3(20, 20, .2) }, mesh), null);
  mesh.geometry.getAttribute('position').setX(0, NaN);
  assert.equal(sectionPositionFromSurfaceHit(rings, hit, mesh), null);
  mesh.scale.x = 0; mesh.updateMatrixWorld();
  assert.equal(sectionPositionFromSurfaceHit(rings, hit, mesh), null);
});
