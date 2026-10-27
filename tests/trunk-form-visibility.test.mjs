import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { withFinalTrunkFormVisibility } from '../web/trunk-form-controls.js';

test('final thumbnail visibility restores only overlay-hidden committed carriers and preserves its return value', () => {
  const carrier = new THREE.Mesh(), unrelated = new THREE.Mesh();
  carrier.visible = false; unrelated.visible = false;
  const saved = { view: 'BASE', authoring: { sections: [{ t: .5 }] }, history: 3 };
  const before = structuredClone(saved), result = {};
  assert.equal(withFinalTrunkFormVisibility([{ mesh: carrier, visible: true }, null], () => {
    assert.equal(carrier.visible, true);
    assert.equal(unrelated.visible, false);
    assert.deepEqual(saved, before);
    return result;
  }), result);
  assert.equal(carrier.visible, false);
  assert.equal(unrelated.visible, false);
  assert.deepEqual(saved, before);
});

test('final thumbnail visibility never forces a user-hidden carrier visible', () => {
  const carrier = new THREE.Mesh(); carrier.visible = false;
  withFinalTrunkFormVisibility([{ mesh: carrier, visible: false }], () => assert.equal(carrier.visible, false));
  assert.equal(carrier.visible, false);
});

test('render exceptions restore the exact visibility present before the callback', () => {
  const carrier = new THREE.Mesh(), other = new THREE.Mesh();
  carrier.visible = false; other.visible = true;
  const failure = new Error('thumbnail render failed');
  assert.throws(() => withFinalTrunkFormVisibility([{ mesh: carrier, visible: true }, { mesh: other, visible: false }], () => {
    assert.equal(carrier.visible, true); assert.equal(other.visible, false);
    throw failure;
  }), error => error === failure);
  assert.equal(carrier.visible, false); assert.equal(other.visible, true);
});

test('nested synchronous thumbnail rendering and duplicate carrier entries restore each enclosing visibility', () => {
  const carrier = new THREE.Mesh(); carrier.visible = false;
  const entry = { mesh: carrier, visible: true };
  withFinalTrunkFormVisibility([entry, entry], () => {
    assert.equal(carrier.visible, true);
    withFinalTrunkFormVisibility([entry], () => assert.equal(carrier.visible, true));
    assert.equal(carrier.visible, true);
  });
  assert.equal(carrier.visible, false);
});
