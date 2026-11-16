import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BASE_BRANCH_GUIDE, baseBranchAnchorFrame, baseBranchShape, normalizeBaseBranchAssembly } from '../web/base-branch-assembly.js';
import { createBaseBranchSurfaceProjector } from '../web/base-branch-surface-edit.js';
import { buildBranchAsset, createProjectDocument, disposeBranchAsset } from '../web/branch-kernel.js';

const fixture = new URL('../示例工程/基础枝组装/弯枝与叶花果_组装单元枝.branch.json', import.meta.url);

test('whole base-branch scale preserves anchors and scales wood, guide and all attached meshes after reload', () => {
  const document = JSON.parse(readFileSync(fixture, 'utf8'));
  const assembly = normalizeBaseBranchAssembly(document.authoring.base_branch_assembly);
  const scaled = normalizeBaseBranchAssembly({ ...assembly, scale: 2 });
  assert.equal(assembly.scale, undefined);
  assert.equal(scaled.base, assembly.base);
  assert.deepEqual(scaled.guide, assembly.guide);
  assert.deepEqual(scaled.placements, assembly.placements);

  const anchor = assembly.placements[0];
  const frame = baseBranchAnchorFrame(assembly, anchor);
  const largerFrame = baseBranchAnchorFrame(scaled, anchor);
  assert.ok(largerFrame.position.distanceTo(frame.position.clone().multiplyScalar(2)) < 1e-9);
  assert.ok(Math.abs(largerFrame.t - frame.t) < 1e-9);
  createBaseBranchSurfaceProjector(assembly);
  const nearest = createBaseBranchSurfaceProjector(scaled).nearest(largerFrame.position, { maxDistance: 1e-5 });
  assert.ok(nearest);
  assert.ok(baseBranchAnchorFrame(scaled, nearest).position.distanceTo(largerFrame.position) < 1e-8);

  const authoring = { ...document.authoring, base_branch_assembly: scaled, branch_shape: baseBranchShape(scaled) };
  const sourceAsset = buildBranchAsset(document.settings, null, null, 0, document.authoring);
  const scaledAsset = buildBranchAsset(document.settings, null, null, 0, authoring);
  const saved = JSON.parse(JSON.stringify(createProjectDocument(scaledAsset, [], authoring)));
  const reloadedAsset = buildBranchAsset(saved.settings, null, null, 0, saved.authoring);
  try {
    assert.equal(reloadedAsset.authoring.base_branch_assembly.scale, 2);
    const guide = asset => asset.masterBranches.find(branch => branch.stableId === BASE_BRANCH_GUIDE);
    assert.ok(Math.abs(guide(reloadedAsset).length - guide(sourceAsset).length * 2) < 1e-8);
    assert.deepEqual(guide(reloadedAsset).points[0].toArray(), guide(sourceAsset).points[0].toArray());

    const meshes = asset => {
      const byId = new Map();
      asset.group.traverse(object => {
        if (object.userData.base_branch_mesh || object.userData.base_branch_unit_id) {
          byId.set(object.userData.base_branch_unit_id || object.userData.stable_id, object.geometry.attributes.position.array);
        }
      });
      return byId;
    };
    const original = meshes(sourceAsset), reloaded = meshes(reloadedAsset);
    assert.equal(original.size, assembly.placements.length + 1);
    assert.deepEqual([...reloaded.keys()], [...original.keys()]);
    for (const [id, positions] of original) {
      const actual = reloaded.get(id);
      assert.equal(actual.length, positions.length);
      assert.ok(actual.every((coordinate, i) => Math.abs(coordinate - positions[i] * 2) < 1e-6), id);
    }
  } finally {
    disposeBranchAsset(sourceAsset);
    disposeBranchAsset(scaledAsset);
    disposeBranchAsset(reloadedAsset);
  }
});
