import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { screenPointOnSection, interpolateSectionRing, projectSectionPosition, sectionPlanePoint, sectionPlaneCoordinates,
  signedAngleDelta, sectionPointerAngle, profilePointerRadius } from '../web/trunk-section-interaction.js';

const rect = { left: 80, top: 45, width: 960, height: 720 };
const identity = new THREE.Matrix4();
const camera = () => {
  const result = new THREE.PerspectiveCamera(50, rect.width / rect.height, .1, 100);
  result.position.set(0, 0, 10); result.lookAt(0, 0, 0); result.updateMatrixWorld();
  return result;
};
const ring = () => ({ t: .5, center: [0, 0, 0], tangent: [0, 0, 1], x: [1, 0, 0], y: [0, 1, 0],
  rolledX: [1, 0, 0], rolledY: [0, 1, 0], localRadius: 1, ovalX: 1, ovalY: 1 });
const radians = degrees => degrees * Math.PI / 180;
const assertNear = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance,
  `expected ${actual} ≈ ${expected}`);

const interpolationFixture = () => {
  const a = { ...ring(), t: .2, offset: 0, count: 4, roll: 0, angleOffset: .1 };
  const b = { ...ring(), t: .8, offset: 4, count: 4, center: [.4, .8, 2], localRadius: 2, ovalX: 1.4, ovalY: 1 / 1.4,
    tangent: [0, -1, 0], x: [1, 0, 0], y: [0, 0, 1], rolledX: [1, 0, 0], rolledY: [0, 0, 1], roll: 0, angleOffset: .7 };
  const points = [a, b].flatMap(r => Array.from({ length: r.count }, (_, i) => new THREE.Vector3(...r.center)
    .addScaledVector(new THREE.Vector3(...r.x), Math.cos(i * Math.PI / 2) * r.localRadius * r.ovalX)
    .addScaledVector(new THREE.Vector3(...r.y), Math.sin(i * Math.PI / 2) * r.localRadius * r.ovalY).toArray()));
  return { rings: [a, b], positions: new THREE.Float32BufferAttribute(points.flat(), 3) };
};

test('interpolated section center and outline stay continuous on the actual rendered skin', () => {
  const { rings, positions } = interpolationFixture(), result = interpolateSectionRing(rings, .5, positions);
  assertNear(result.t, .5); result.center.forEach((value, i) => assertNear(value, [.2, .4, 1][i])); assert.equal(result.count, 4);
  assertNear(result.localRadius, 1.5); assertNear(result.angleOffset, .4); assertNear(result.ovalX, 1.2);
  for (let i = 0; i < 4; i++) {
    const actual = new THREE.Vector3().fromBufferAttribute(positions, i).lerp(new THREE.Vector3().fromBufferAttribute(positions, i + 4), .5);
    assertNear(result.points[i].distanceTo(actual), 0);
  }
  for (const key of ['tangent', 'x', 'y', 'rolledX', 'rolledY']) assertNear(new THREE.Vector3(...result[key]).length(), 1);
  assertNear(new THREE.Vector3(...result.x).dot(new THREE.Vector3(...result.y)), 0);
  assertNear(new THREE.Vector3(...result.rolledX).dot(new THREE.Vector3(...result.tangent)), 0);
});

test('interpolated endpoint frames and skin match actual endpoints without aliasing the source', () => {
  const { rings, positions } = interpolationFixture(), before = JSON.stringify(rings), skin = Array.from(positions.array);
  for (const [t, index] of [[0, 0], [.2, 0], [.8, 1], [1, 1]]) {
    const result = interpolateSectionRing(rings, t, positions);
    for (const key of ['t', 'center', 'tangent', 'x', 'y', 'rolledX', 'rolledY', 'localRadius', 'ovalX', 'ovalY', 'roll', 'angleOffset']) assert.deepEqual(result[key], rings[index][key]);
    assertNear(result.points[0].distanceTo(new THREE.Vector3().fromBufferAttribute(positions, rings[index].offset)), 0);
    result.center[0] = 999; result.points[0].x = 999;
  }
  assert.equal(JSON.stringify(rings), before); assert.deepEqual(Array.from(positions.array), skin);
});

test('opposite sampled frames interpolate through a finite orthonormal frame instead of collapsing', () => {
  const { rings, positions } = interpolationFixture();
  rings[1] = { ...rings[1], tangent: [0, 0, 1], x: [-1, 0, 0], y: [0, -1, 0], rolledX: [-1, 0, 0], rolledY: [0, -1, 0] };
  const result = interpolateSectionRing(rings, .5, positions);
  for (const key of ['tangent', 'x', 'y', 'rolledX', 'rolledY']) {
    assert.ok(result[key].every(Number.isFinite)); assertNear(new THREE.Vector3(...result[key]).length(), 1);
  }
  assertNear(new THREE.Vector3(...result.x).cross(new THREE.Vector3(...result.y)).dot(new THREE.Vector3(...result.tangent)), 1);
});

test('section interpolation rejects unsorted rings, incompatible counts and invalid skin buffers', () => {
  const { rings, positions } = interpolationFixture();
  assert.equal(interpolateSectionRing([...rings].reverse(), .5, positions), null);
  assert.equal(interpolateSectionRing([rings[0], { ...rings[1], t: rings[0].t }], .5, positions), null);
  assert.equal(interpolateSectionRing([rings[0], { ...rings[1], count: 3 }], .5, positions), null);
  assert.equal(interpolateSectionRing([rings[0], { ...rings[1], offset: 5 }], .5, positions), null);
  assert.equal(interpolateSectionRing(rings, .5, null), null);
  positions.setX(3, NaN); assert.equal(interpolateSectionRing(rings, .5, positions), null);
});

test('curved section slide follows continuous evaluated segments without snapping to sampled rings', () => {
  const cam = camera(), rings = [
    { t: 0, center: [-2, -2, 0] }, { t: .25, center: [-1.5, 0, 0] },
    { t: .6, center: [0, 1.7, 0] }, { t: 1, center: [2, 2, 0] },
  ];
  const expected = .393, alpha = (expected - .25) / (.6 - .25);
  const local = new THREE.Vector3(...rings[1].center).lerp(new THREE.Vector3(...rings[2].center), alpha);
  const pointer = screenPointOnSection(local, cam, identity, rect);
  const result = projectSectionPosition(rings, pointer, cam, identity, rect);
  assertNear(result.t, expected); assertNear(result.distance, 0);
  assertNear(result.point.distanceTo(local), 0); assert.equal(result.index, 1);
  assert.ok(!rings.some(r => r.t === result.t));
});

test('perspective section slide converts screen interpolation back to the correct local t', () => {
  const cam = camera(), matrix = new THREE.Matrix4().compose(new THREE.Vector3(.1, -.2, .3),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(.1, .2, .1)), new THREE.Vector3(1.2, .8, 1.1));
  const rings = [{ t: .1, center: [-1, -.4, -2] }, { t: .9, center: [1, 1, 3] }];
  const alpha = .3, point = new THREE.Vector3(...rings[0].center).lerp(new THREE.Vector3(...rings[1].center), alpha);
  const pointer = screenPointOnSection(point, cam, matrix, rect);
  const result = projectSectionPosition(rings, pointer, cam, matrix, rect);
  assertNear(result.t, .1 + .8 * alpha); assertNear(result.alpha, alpha);
  assertNear(result.point.distanceTo(point), 0);
});

test('local t search stays on the chosen curve at a projected crossing', () => {
  const cam = camera(), rings = [
    { t: 0, center: [-2, -2, 0] }, { t: .35, center: [2, 2, 0] },
    { t: .65, center: [-2, 2, 0] }, { t: 1, center: [2, -2, 0] },
  ];
  const pointer = screenPointOnSection(new THREE.Vector3(0, 0, 0), cam, identity, rect);
  const first = projectSectionPosition(rings, pointer, cam, identity, rect, { nearT: .17, searchWindow: .1 });
  const later = projectSectionPosition(rings, pointer, cam, identity, rect, { nearT: .82, searchWindow: .1 });
  assertNear(first.t, .175); assertNear(later.t, .825); assert.equal(first.index, 0); assert.equal(later.index, 2);
});

test('slide local bounds and pointer distance reject unintended distant or hidden picks', () => {
  const cam = camera(), rings = [{ t: 0, center: [0, -2, 0] }, { t: 1, center: [0, 2, 0] }];
  const pointer = screenPointOnSection(new THREE.Vector3(0, 1.6, 0), cam, identity, rect);
  assertNear(projectSectionPosition(rings, pointer, cam, identity, rect, { nearT: .5, searchWindow: .09 }).t, .59);
  assert.equal(projectSectionPosition(rings, { x: -1000, y: -1000 }, cam, identity, rect, { maxScreenDistance: 5 }), null);
  assert.equal(projectSectionPosition([{ t: 0, center: [0, 0, 11] }, { t: 1, center: [0, 1, 12] }], pointer, cam, identity, rect), null);
  assert.equal(projectSectionPosition(rings, pointer, cam, identity, rect, { minT: .8, maxT: .2 }), null);
});

test('plane intersection respects a rolled section and nonuniform carrier world transform', () => {
  const cam = camera(), r = ring();
  r.rolledX = [0, 1, 0]; r.rolledY = [-1, 0, 0]; r.localRadius = 2; r.ovalX = 2; r.ovalY = .5;
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(.5, .4, 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(.1, .3, .2)), new THREE.Vector3(1.2, .6, 1.8));
  const local = new THREE.Vector3(-.7, 2.4, 0), pointer = screenPointOnSection(local, cam, matrix, rect);
  const intersected = sectionPlanePoint(r, pointer, cam, matrix, rect);
  assertNear(intersected.distanceTo(local), 0);
  const coordinates = sectionPlaneCoordinates(r, intersected); assertNear(coordinates.x, .6); assertNear(coordinates.y, .7);
});

test('twist uses radians and accumulates the shortest delta across the angular seam', () => {
  assertNear(signedAngleDelta(radians(179), radians(-179)), radians(2));
  assertNear(signedAngleDelta(radians(-179), radians(179)), radians(-2));
  assertNear(signedAngleDelta(radians(350), radians(10)), radians(20));
  assert.equal(signedAngleDelta(NaN, 2), 0);
  const cam = camera(), r = ring(), at = degree => screenPointOnSection(new THREE.Vector3(Math.cos(radians(degree)), Math.sin(radians(degree)), 0), cam, identity, rect);
  const first = sectionPointerAngle(r, at(179), cam, identity, rect), second = sectionPointerAngle(r, at(-179), cam, identity, rect, { mode: first.mode });
  assert.equal(first.mode, 'plane'); assertNear(signedAngleDelta(first.angle, second.angle), radians(2));
});

test('grazing section planes return null and twist falls back to a finite screen ring', () => {
  const cam = camera(), r = ring(); r.x = r.rolledX = [0, 1, 0]; r.y = r.rolledY = [0, 0, 1]; r.tangent = [1, 0, 0];
  const center = screenPointOnSection(new THREE.Vector3(0, 0, 0), cam, identity, rect), pointer = { x: center.x + 60, y: center.y - 60 };
  assert.equal(sectionPlanePoint(r, pointer, cam, identity, rect), null);
  assert.equal(profilePointerRadius(r, pointer, cam, identity, rect), null);
  const angle = sectionPointerAngle(r, pointer, cam, identity, rect);
  assert.equal(angle.mode, 'screen'); assertNear(angle.angle, Math.PI / 4);
  assert.equal(sectionPointerAngle(r, pointer, cam, identity, rect, { mode: 'plane' }), null);
  assert.equal(sectionPointerAngle(r, center, cam, identity, rect, { mode: 'screen' }), null);
  cam.position.x = .005; cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  assert.equal(sectionPlanePoint(r, pointer, cam, identity, rect), null, 'near edge-on still does not intersect a distant plane');
});

test('profile point radius removes oval, roll, base radius and supplied bark/root scale exactly', () => {
  const cam = camera(), r = ring(); r.rolledX = [0, 1, 0]; r.rolledY = [-1, 0, 0];
  r.localRadius = 2; r.ovalX = 1.7; r.ovalY = 1 / 1.7;
  const angle = radians(40), desired = .9, baseScale = 1.4;
  const local = new THREE.Vector3(...r.rolledX).multiplyScalar(r.localRadius * r.ovalX * Math.cos(angle) * desired * baseScale)
    .addScaledVector(new THREE.Vector3(...r.rolledY), r.localRadius * r.ovalY * Math.sin(angle) * desired * baseScale);
  const pointer = screenPointOnSection(local, cam, identity, rect);
  assertNear(profilePointerRadius(r, pointer, cam, identity, rect, { angle, baseScale }), desired);
  assertNear(profilePointerRadius(r, pointer, cam, identity, rect, { angle, baseScale, max: .7 }), .7);
  assert.equal(profilePointerRadius(r, pointer, cam, identity, rect, { baseScale: 0 }), null);
});

test('orthographic cameras use the same slide, contour and twist coordinate convention', () => {
  const cam = new THREE.OrthographicCamera(-4, 4, 3, -3, .1, 100); cam.position.set(0, 0, 10); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  const pointer = screenPointOnSection(new THREE.Vector3(.3, .4, 0), cam, identity, rect);
  const r = ring(), local = sectionPlanePoint(r, pointer, cam, identity, rect);
  assertNear(local.x, .3); assertNear(local.y, .4); assertNear(local.z, 0);
  assertNear(sectionPointerAngle(r, pointer, cam, identity, rect).angle, Math.atan2(.4, .3));
  const rings = [{ t: 0, center: [-1, 0, 0] }, { t: 1, center: [1, 0, 0] }];
  assertNear(projectSectionPosition(rings, pointer, cam, identity, rect).t, .65);
});

test('interaction helpers leave source rings, matrices, camera and pointer unchanged', () => {
  const cam = camera(), r = ring(), rings = [{ ...r, t: 0, center: [-1, 0, 0] }, { ...r, t: 1, center: [1, 0, 0] }];
  const pointer = { x: 600, y: 350 }, before = JSON.stringify({ r, rings, pointer,
    matrix: identity.elements, camera: [cam.matrixWorld.elements, cam.matrixWorldInverse.elements, cam.projectionMatrix.elements] });
  projectSectionPosition(rings, pointer, cam, identity, rect); sectionPlanePoint(r, pointer, cam, identity, rect);
  sectionPointerAngle(r, pointer, cam, identity, rect); profilePointerRadius(r, pointer, cam, identity, rect);
  assert.equal(JSON.stringify({ r, rings, pointer, matrix: identity.elements,
    camera: [cam.matrixWorld.elements, cam.matrixWorldInverse.elements, cam.projectionMatrix.elements] }), before);
});

test('invalid and degenerate input returns finite sentinels without changing source data', () => {
  const cam = camera(), pointer = { x: 600, y: 350 }, r = ring(), singular = new THREE.Matrix4().makeScale(0, 1, 1);
  assert.equal(screenPointOnSection(new THREE.Vector3(), cam, singular, rect), null);
  assert.equal(sectionPlanePoint(r, pointer, cam, singular, rect), null);
  assert.equal(sectionPlaneCoordinates({ ...r, localRadius: 0 }, new THREE.Vector3()), null);
  assert.equal(sectionPlanePoint({ ...r, rolledY: r.rolledX }, pointer, cam, identity, rect), null);
  assert.equal(projectSectionPosition([], pointer, cam, identity, rect), null);
  assert.equal(projectSectionPosition([{ t: .4, center: [0, 0, 0] }], { x: NaN, y: 0 }, cam, identity, rect), null);
  const flat = [{ t: .2, center: [0, 0, 0] }, { t: .8, center: [0, 0, 0] }];
  const result = projectSectionPosition(flat, pointer, cam, identity, rect, { nearT: .6 });
  assertNear(result.t, .6); assert.ok(Number.isFinite(result.distance));
});
