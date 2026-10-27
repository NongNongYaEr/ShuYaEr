import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBranchAsset, disposeBranchAsset } from '../web/branch-kernel.js';
import { createTreeSpeciesDocument } from '../web/tree-species-library.js';
import { createPVESkeleton, validatePVESkeleton } from '../web/pve-skeleton-export.js';

test('final master graph exports deterministic, connected positions and actual branch radii', () => {
  const document = createTreeSpeciesDocument('CAMPHOR', 'MAIN', 12037);
  const asset = buildBranchAsset(document.settings, null, null, 0, document.authoring);
  try {
    const first = createPVESkeleton(asset);
    const second = createPVESkeleton(asset);
    assert.deepEqual(first, second);
    assert.equal(first.coordinate_system.up, 'Z');
    assert.equal(first.coordinate_system.unit, 'meter');
    assert.equal(first.branches.length, asset.masterBranches.length);
    assert.ok(first.branches.length > 1);
    assert.ok(first.branches.some((branch) => branch.parent_id));
    assert.ok(first.branches.every((branch) => branch.points.every((point) => point.radius_m > 0)));
    assert.equal(validatePVESkeleton(first).valid, true);
  } finally { disposeBranchAsset(asset); }
});

test('invalid topology and undersized parent connections are reported', () => {
  const skeleton = {
    format: 'BranchForgePVESkeleton', version: 1,
    coordinate_system: { handedness: 'right', up: 'Z', unit: 'meter' },
    branches: [
      { id: 'trunk', parent_id: null, points: [{ t: 0, position_m: [0, 0, 0], radius_m: .01 }, { t: 1, position_m: [0, 0, 1], radius_m: .01 }] },
      { id: 'lateral', parent_id: 'trunk', parent_t: .5, points: [{ t: 0, position_m: [0, 0, .5], radius_m: .04 }, { t: 1, position_m: [1, 0, .5], radius_m: .01 }] },
    ],
  };
  const report = validatePVESkeleton(skeleton);
  assert.equal(report.valid, true);
  assert.equal(report.thin_parent_connections, 1);
  assert.ok(report.min_parent_to_child_radius_ratio < 1);
  skeleton.branches[0].parent_id = 'lateral';
  skeleton.branches[0].parent_t = .5;
  assert.equal(validatePVESkeleton(skeleton).valid, false);
});

test('V2 preserves deterministic leaf placements and rejects broken source references', () => {
  const document = createTreeSpeciesDocument('CAMPHOR', 'TIP', 12037);
  const asset = buildBranchAsset(document.settings, null, null, 0, document.authoring);
  try {
    const skeleton = createPVESkeleton(asset);
    assert.equal(skeleton.version, 2);
    assert.equal(skeleton.foliage.length, asset.masterPlacements.length);
    assert.ok(skeleton.foliage.length > 0);
    assert.deepEqual(skeleton.foliage[0].position_m, asset.masterPlacements[0].position.toArray());
    assert.equal(skeleton.foliage[0].branch_id, asset.masterPlacements[0].branchStableId);
    assert.equal(validatePVESkeleton(skeleton).foliage_count, skeleton.foliage.length);
    skeleton.foliage[0].source_index = 10;
    assert.equal(validatePVESkeleton(skeleton).valid, false);
  } finally { disposeBranchAsset(asset); }
});
