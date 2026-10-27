import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { keyboardTransformDelta } from '../web/keyboard-transform.js';
import { curveShortcutAction } from '../web/v4-tools.js';

const camera = new THREE.PerspectiveCamera(50, 1, .01, 100);
camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
const modelRoot = new THREE.Group(); modelRoot.updateMatrixWorld();
const base = { camera, modelRoot, center: new THREE.Vector3(), bounds: { left: 0, top: 0, width: 800, height: 800 }, start: { x: 500, y: 400 }, pointer: { x: 550, y: 350 } };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test('GRS axes and numeric values use world directions, meters and degrees', () => {
  const root = new THREE.Group(); root.rotation.z = Math.PI / 2; root.updateMatrixWorld();
  const result = keyboardTransformDelta({ ...base, modelRoot: root, mode: 'translate', axis: 'X', numeric: '-.2' });
  const world = result.translation.clone().transformDirection(root.matrixWorld).multiplyScalar(result.translation.length());
  close(world.x, -.2); close(world.y, 0);
  const rotation = keyboardTransformDelta({ ...base, mode: 'rotate', axis: 'Y', numeric: '90' }).rotation;
  const direction = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
  close(direction.x, 0); close(direction.z, -1);
});
test('leaf units scale uniformly, branches can constrain scale; mouse preview is repeatable', () => {
  assert.deepEqual(keyboardTransformDelta({ ...base, mode: 'scale', numeric: '2', axis: 'X', uniform: true }).scale.toArray(), [2, 2, 2]);
  assert.deepEqual(keyboardTransformDelta({ ...base, mode: 'scale', numeric: '2', axis: 'X' }).scale.toArray(), [2, 1, 1]);
  assert.deepEqual(keyboardTransformDelta({ ...base, mode: 'scale', numeric: '100', scaleRange: [.05, 20] }).scale.toArray(), [20, 20, 20]);
  for (const mode of ['translate', 'rotate', 'scale']) {
    const a = keyboardTransformDelta({ ...base, mode }), b = keyboardTransformDelta({ ...base, mode });
    assert.deepEqual(a, b); assert.ok(Number.isFinite(a.amount));
  }
  const depth = keyboardTransformDelta({ ...base, mode: 'translate', axis: 'Z' });
  assert.ok(depth.translation.z > 0); close(depth.translation.x, 0);
});
test('plain S no longer triggers destructive curve smoothing; Shift+S keeps it available', () => {
  assert.equal(curveShortcutAction({ code: 'KeyS' }), null);
  assert.equal(curveShortcutAction({ code: 'KeyS', shiftKey: true }), 'SMOOTH');
  assert.equal(curveShortcutAction({ code: 'KeyS', ctrlKey: true }), null);
});
