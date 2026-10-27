import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSectionOverlayLine, hitSectionPolyline } from '../web/trunk-section-overlay.js';

const project = point => ({ x: point[0], y: point[1], z: point[2] ?? 0, w: point[3] ?? 1 });
const square = [[20, 20], [120, 20], [120, 120], [20, 120]];

test('screen picking hits between sparse ring handles but never fills the ring interior', () => {
  assert.equal(hitSectionPolyline(square, { clientX: 70, clientY: 27 }, project), 7);
  assert.equal(hitSectionPolyline(square, { x: 70, y: 70 }, project), null);
  assert.equal(hitSectionPolyline(square, { x: 70, y: 31 }, project), null);
  assert.equal(hitSectionPolyline(square, { x: 70, y: 30 }, project), 10);
});

test('ring closure and an open line have different hit targets', () => {
  assert.equal(hitSectionPolyline(square, { x: 22, y: 70 }, project), 2);
  assert.equal(hitSectionPolyline(square, { x: 22, y: 70 }, project, { loop: false }), null);
});

test('nearest screen distance distinguishes close parallel section outlines', () => {
  const near = [[0, 0], [100, 0]], far = [[0, 18], [100, 18]], pointer = { x: 50, y: 8 };
  assert.equal(hitSectionPolyline(near, pointer, project, { loop: false }), 8);
  assert.equal(hitSectionPolyline(far, pointer, project, { loop: false }), 10);
  assert.equal(hitSectionPolyline(far, pointer, project, { loop: false, radius: 8 }), null);
});

test('picking rejects near/far clipped, behind-camera and invalid projected segments', () => {
  for (const invalid of [null, { x: 0, y: 0, z: -1.1, w: 1 }, { x: 0, y: 0, z: 1.1, w: 1 },
    { x: 0, y: 0, z: 0, w: -1 }, { x: 0, y: 0, z: 0, w: 0 }, { x: NaN, y: 0 }, { x: 0, y: Infinity }]) {
    assert.equal(hitSectionPolyline([[0, 0], [100, 0]], { x: 50, y: 0 }, point => point[0] === 0 ? invalid : project(point), { loop: false }), null);
  }
  assert.equal(hitSectionPolyline([], { x: 0, y: 0 }, project), null);
  assert.equal(hitSectionPolyline(square, { x: NaN, y: 0 }, project), null);
  assert.equal(hitSectionPolyline(square, { x: 20, y: 20 }, project, { radius: -1 }), null);
});

test('screen picking handles repeated points and endpoint circles without mutating its inputs', () => {
  const points = [[0, 0], [0, 0], [100, 0]], before = JSON.stringify(points);
  assert.equal(hitSectionPolyline(points, { x: -6, y: 8 }, project, { loop: false }), 10);
  assert.equal(hitSectionPolyline(points, { x: -6, y: 9 }, project, { loop: false }), null);
  assert.equal(JSON.stringify(points), before);
});

test('overlay stores local cloned geometry and provides two CSS-width triangle layers', () => {
  const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 1, 0)];
  const line = createSectionOverlayLine(points, 0xffd65a, { loop: true, width: 3, haloWidth: 5 });
  assert.equal(line.children.length, 2); assert.equal(line.userData.loop, true);
  assert.equal(line.children[0].material.uniforms.lineWidth.value, 5);
  assert.equal(line.children[1].material.uniforms.lineWidth.value, 3);
  assert.equal(line.children[0].geometry.attributes.position.count, 18);
  assert.equal(line.children[0].geometry, line.children[1].geometry);
  for (const child of line.children) {
    assert.equal(child.material.depthTest, false); assert.equal(child.material.depthWrite, false);
    assert.equal(child.material.toneMapped, false); assert.equal(child.frustumCulled, false);
    assert.equal(child.renderOrder, child === line.children[0] ? 120 : 121);
    const hits = []; child.raycast({}, hits); assert.deepEqual(hits, []);
  }
  points[0].x = 999; assert.equal(line.userData.polyline[0].x, 0);
});

test('HiDPI and inset viewports retain the same CSS-pixel width and viewport origin', () => {
  const line = createSectionOverlayLine([[0, 0, 0], [1, 1, 1]], 0xffffff);
  for (const ratio of [1, 1.25, 2, 3]) {
    const renderer = { getPixelRatio: () => ratio, getRenderTarget: () => null,
      getCurrentViewport: target => target.set(40 * ratio, 30 * ratio, 960 * ratio, 720 * ratio) };
    for (const child of line.children) {
      child.onBeforeRender(renderer);
      assert.deepEqual(child.material.uniforms.viewportSize.value.toArray(), [960, 720]);
      assert.deepEqual(child.material.uniforms.viewportOrigin.value.toArray(), [40, 30]);
      assert.equal(child.material.uniforms.pixelRatio.value, ratio);
    }
  }
});

test('render targets use target pixels and the fallback renderer size uses logical CSS size', () => {
  const line = createSectionOverlayLine([[0, 0, 0], [1, 1, 1]], 0xffffff), child = line.children[0];
  child.onBeforeRender({ getPixelRatio: () => 2, getRenderTarget: () => ({}),
    getCurrentViewport: target => target.set(10, 20, 512, 256) });
  assert.equal(child.material.uniforms.pixelRatio.value, 1);
  assert.deepEqual(child.material.uniforms.viewportSize.value.toArray(), [512, 256]);
  assert.deepEqual(child.material.uniforms.viewportOrigin.value.toArray(), [10, 20]);
  child.onBeforeRender({ getPixelRatio: () => 2, getSize: target => target.set(800, 600) });
  assert.deepEqual(child.material.uniforms.viewportSize.value.toArray(), [800, 600]);
  assert.deepEqual(child.material.uniforms.viewportOrigin.value.toArray(), [0, 0]);
});

test('invalid or fully degenerate polylines create no renderable overlay', () => {
  for (const points of [null, [], [[0, 0, 0]], [[0, 0, NaN], [1, 0, 0]], [[0, 0, 0], [0, 0, 0]]]) {
    assert.equal(createSectionOverlayLine(points, 0xffffff).children.length, 0);
  }
});
