import test from 'node:test';
import assert from 'node:assert/strict';
import { createPVEWholeTree } from '../web/pve-whole-tree.js';
import { validatePVESkeleton } from '../web/pve-skeleton-export.js';

const recipe = {
  name: 'Camphor mature', seed: 31027, height_m: 13.2,
  crown_radius_m: 5.8, clear_trunk_m: 3.1,
  base_radius_m: 0.39, primary_count: 10,
};

test('mature tree recipe produces a deterministic whole plant at tree scale', () => {
  const tree = createPVEWholeTree(recipe);
  assert.deepEqual(tree, createPVEWholeTree(recipe));
  assert.equal(tree.kind, 'whole_plant');
  assert.equal(tree.branches.length, 101);
  const points = tree.branches.flatMap((branch) => branch.points.map((point) => point.position_m));
  assert.equal(Math.max(...points.map((point) => point[2])), recipe.height_m);
  assert.ok(Math.max(...points.map((point) => point[0])) - Math.min(...points.map((point) => point[0])) > 10);
  const report = validatePVESkeleton(tree);
  assert.equal(report.root_count, 1);
  assert.equal(report.thin_parent_connections, 0);
  assert.equal(report.displaced_connections, 0);
  assert.equal(report.valid, true);
});

test('invalid whole tree proportions fail before writing JSON', () => {
  assert.throws(() => createPVEWholeTree({ ...recipe, clear_trunk_m: 12 }), /无效/);
  assert.throws(() => createPVEWholeTree({ ...recipe, primary_count: 0 }), /无效/);
});

test('shorter central leader remains connected while the crown reaches above it', () => {
  const tree = createPVEWholeTree({ ...recipe, trunk_height_fraction: 0.78 });
  const trunkTop = tree.branches[0].points.at(-1).position_m[2];
  const crownTop = Math.max(...tree.branches.flatMap((branch) => branch.points.map((point) => point.position_m[2])));
  assert.equal(crownTop, recipe.height_m);
  assert.ok(trunkTop < crownTop - 2);
  assert.equal(validatePVESkeleton(tree).thin_parent_connections, 0);
});
