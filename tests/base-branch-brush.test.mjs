import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { baseBranchBrushEntry } from '../web/base-branch-brush.js';
import { advanceUnitCombEntries, combUnitInstance } from '../web/unit-instance-combing.js';

const anchor = {
  position: new THREE.Vector3(.6, -.1, .3),
  normal: new THREE.Vector3(.1, .9, .4).normalize(),
  tangent: new THREE.Vector3(1, 0, 0),
};
const unit = { size_m: .12, geometry: { position: [0, 0, 0, -.5, .65, .05, .5, .65, .05, 0, 1, 0] } };
const placement = { id: 'LEAF_1', unit_id: 'LEAF', face: 3, barycentric: [.3, .3, .4], scale: 1.2, roll: 42 };
const motion = new THREE.Vector3(0, 0, .5);

test('base-branch comb advances a rolled leaf around its attached pivot', () => {
  const entry = baseBranchBrushEntry({}, unit, placement, anchor);
  assert.ok(entry.sampleLines.length > 2);
  const update = combUnitInstance(entry, { delta: motion, worldRadius: .6 });
  assert.ok(update?.after.rotation);
  assert.equal(update.after.scale, placement.scale);
  assert.equal(update.after.roll, placement.roll);
  assert.equal(update.after.face, placement.face);
  assert.deepEqual(update.after.barycentric, placement.barycentric);
  assert.ok(anchor.position.clone().applyMatrix4(update.matrix).distanceTo(anchor.position) < 1e-10);
  const [working] = advanceUnitCombEntries([entry], [update]);
  assert.ok(working.frame.direction.dot(motion) > entry.frame.direction.dot(motion));
  assert.ok(working.evaluatePlacement(update.after).direction.distanceTo(working.frame.direction) < 1e-10);
  assert.equal(placement.rotation, undefined);
});

test('base-branch size brush clamps to attachment scale limits', () => {
  for (const [scale, sizeMode, limit] of [[7.8, 'GROW', 8], [.053, 'SHRINK', .05]]) {
    const entry = baseBranchBrushEntry({}, unit, { ...placement, scale }, anchor);
    const update = combUnitInstance(entry, { delta: motion, worldRadius: .05, effect: 'SCALE', sizeMode, sizeLimitPercent: 80 });
    assert.ok(Math.abs(update.after.scale - limit) < 1e-12);
    assert.ok(update.after.rotation === undefined);
    assert.ok(anchor.position.clone().applyMatrix4(update.matrix).distanceTo(anchor.position) < 1e-10);
  }
});

test('base-branch twist rolls around the existing stem axis in either direction', () => {
  const entry = baseBranchBrushEntry({}, unit, placement, anchor);
  for (const signedTwist of [.2, -.2]) {
    const update = combUnitInstance(entry, { delta: motion, orientation: 'TWIST', signedTwist });
    const after = entry.evaluatePlacement(update.after);
    assert.ok(after.position.distanceTo(entry.frame.position) < 1e-10);
    assert.ok(after.direction.distanceTo(entry.frame.direction) < 1e-10);
    assert.equal(update.after.scale, placement.scale);
    assert.ok(Math.abs(update.rotation.angleTo(new THREE.Quaternion()) - Math.PI * Math.abs(signedTwist) * .65) < 1e-10);
  }
});
