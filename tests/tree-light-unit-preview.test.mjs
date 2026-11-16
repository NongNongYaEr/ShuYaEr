import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../web/vendor/three.module.min.js';
import { createGpuMeshPreview } from '../web/gpu-edit-preview.js';
import { createSelectionCopyPreview } from '../web/selection-copy-preview.js';
import { packLightTrack } from '../web/tree-light-data.js';
import { buildTreeLightGroup } from '../web/tree-light-mesh.js';
import { createCpuMeshPreview, lineTangent, sampleLine } from '../web/tree-sculpt.js';

function fixture(t) {
  const trunk = { id: 0, stableId: 'ROOT', parentId: -1, points: [new THREE.Vector3(), new THREE.Vector3(0, 0, 2)] };
  const unit = { id: 1, stableId: 'ADDED.MAIN', parentId: trunk.id,
    points: [new THREE.Vector3(0, 0, 1), new THREE.Vector3(2, 0, 1)] };
  const record = {
    kind: 'procedural', ground: 0, params: { radius: .002, color: '#ffcc77', intensity: 1 },
    tracks: [{ guide: trunk.stableId, turns: 1, points: packLightTrack(new Float32Array([
      1, 0, 0, 1, 0, 0,
      0, 1, .1, 0, 1, 0,
      -1, 0, .2, -1, 0, 0,
      0, -1, .3, 0, -1, 0,
      1, 0, .4, 1, 0, 0,
    ])) }],
  };
  const group = new THREE.Group();
  const lightGroup = buildTreeLightGroup(record, null, [trunk, unit]);
  const light = lightGroup.children[0];
  const wood = new THREE.Mesh(new THREE.BoxGeometry(.01, .01, .01), new THREE.MeshStandardMaterial());
  wood.userData = { category: 'branch', stable_id: unit.stableId };
  const lookupUv = new Float32Array(wood.geometry.attributes.position.count * 2);
  for (let i = 0; i < lookupUv.length; i += 2) {
    lookupUv[i] = 1.5 / 4;
    lookupUv[i + 1] = .5 / 4;
  }
  wood.geometry.setAttribute('uv1', new THREE.BufferAttribute(lookupUv, 2));
  group.add(lightGroup, wood);
  // The selected unit occupies the middle two columns of this lookup atlas.
  // The spiral's flow UV runs through those columns but belongs to ROOT.
  const elements = Array.from({ length: 16 }, (_, i) => ({
    type: 'BRANCH', id: i % 4 === 1 || i % 4 === 2 ? unit.stableId : trunk.stableId,
  }));
  const asset = { group, authoring: { tree_lights: record }, elements, lookupTexture: { width: 4, height: 4 } };
  const snapshot = new Map([[trunk.id, trunk], [unit.id, unit]]);
  const translation = new THREE.Matrix4().makeTranslation(2, 0, 0);
  t.after(() => {
    group.traverse(object => {
      if (!object.isMesh) return;
      object.geometry.dispose();
      object.material.dispose();
    });
  });
  return { asset, snapshot, light, wood, trunk, unit, translation };
}

function capture(mesh) {
  return {
    position: mesh.geometry.attributes.position.array.slice(),
    normal: mesh.geometry.attributes.normal.array.slice(),
    uv: mesh.geometry.attributes.uv.array.slice(),
    uv1: mesh.geometry.attributes.uv1.array.slice(),
    indices: mesh.geometry.index.array.slice(),
  };
}

test('moving an unrelated complete unit in GPU preview leaves the light strip and both UV sets intact', t => {
  const { asset, snapshot, light, wood, unit, translation } = fixture(t);
  const initial = capture(light);
  const unitX = wood.geometry.attributes.position.getX(0);
  const preview = createGpuMeshPreview(asset, snapshot, {
    sampleLine, lineTangent, targets: new Set([unit.stableId]), rigid: true,
  });
  assert.ok(preview);
  try {
    preview.updateTransforms(new Map([[unit.id, { matrix: translation }]]));
    assert.ok(Math.abs(preview.vertex(wood, 0).x - unitX - 2) < 1e-6);
    assert.equal(light.__branchForgeNativeEdit, undefined);
    for (let i = 0; i < initial.position.length / 3; i++) {
      const position = preview.vertex(light, i) ?? new THREE.Vector3().fromBufferAttribute(light.geometry.attributes.position, i);
      assert.deepEqual(position.toArray(), Array.from(initial.position.subarray(i * 3, i * 3 + 3)));
    }
    assert.deepEqual(capture(light), initial);
  } finally { preview.restore(); }
  assert.deepEqual(capture(light), initial);
});

test('moving an unrelated complete unit in CPU preview keeps light vertices and flow UV exact', t => {
  const { asset, snapshot, light, wood, unit, translation } = fixture(t);
  const initial = capture(light);
  const unitX = wood.geometry.attributes.position.getX(0);
  const preview = createCpuMeshPreview(asset, snapshot);
  try {
    preview.updateRigid(translation, new Set([unit.id]));
    assert.ok(Math.abs(wood.geometry.attributes.position.getX(0) - unitX - 2) < 1e-6);
    assert.deepEqual(capture(light), initial);
  } finally { preview.restore(); }
  assert.deepEqual(capture(light), initial);
  assert.equal(wood.geometry.attributes.position.getX(0), unitX);
});

test('the light strip follows its actual trunk as a whole in both GPU and CPU previews', t => {
  const { asset, snapshot, light, trunk, translation } = fixture(t);
  const initial = capture(light);
  const checkPosition = (index, vertex) => {
    const expected = new THREE.Vector3().fromArray(initial.position, index * 3).applyMatrix4(translation);
    assert.ok(vertex && vertex.distanceTo(expected) < 1e-6, `light vertex ${index} follows ROOT`);
  };
  const gpu = createGpuMeshPreview(asset, snapshot, {
    sampleLine, lineTangent, targets: new Set([trunk.stableId]), rigid: true,
  });
  assert.ok(gpu);
  try {
    gpu.updateTransforms(new Map([[trunk.id, { matrix: translation }]]));
    for (let i = 0; i < initial.position.length / 3; i++) checkPosition(i, gpu.vertex(light, i));
    assert.deepEqual(capture(light), initial);
  } finally { gpu.restore(); }

  const cpu = createCpuMeshPreview(asset, snapshot);
  try {
    cpu.updateRigid(translation, new Set([trunk.id]));
    for (let i = 0; i < initial.position.length / 3; i++) {
      checkPosition(i, new THREE.Vector3().fromBufferAttribute(light.geometry.attributes.position, i));
    }
    assert.deepEqual(light.geometry.attributes.uv1.array, initial.uv1);
  } finally { cpu.restore(); }
  assert.deepEqual(capture(light), initial);
});

test('an imported light strip resolves its saved guide through the mounted trunk', t => {
  const { asset, snapshot, light, trunk, translation } = fixture(t);
  const record = asset.authoring.tree_lights;
  asset.authoring = {
    tree_lights: { ...record, kind: undefined, mount: 'SCULPT', asset: 'SOURCE', revision: 1 },
    imported_trunks: { mounts: [{ id: 'SCULPT', asset_id: 'SOURCE', revision: 1, guide_map: { GUIDE: trunk.stableId } }] },
  };
  light.userData.treeLightStrip.guide = 'GUIDE';
  const initial = capture(light);
  const preview = createCpuMeshPreview(asset, snapshot);
  try {
    preview.updateRigid(translation, new Set([trunk.id]));
    const positions = light.geometry.attributes.position;
    for (let i = 0; i < initial.position.length / 3; i++) {
      const expected = new THREE.Vector3().fromArray(initial.position, i * 3).applyMatrix4(translation);
      assert.ok(new THREE.Vector3().fromBufferAttribute(positions, i).distanceTo(expected) < 1e-6);
    }
    assert.deepEqual(light.geometry.attributes.uv1.array, initial.uv1);
  } finally { preview.restore(); }
  assert.deepEqual(capture(light), initial);
});

test('duplicating the selected unit never copies triangles from a trunk light strip', t => {
  const { asset, light, wood, unit, translation } = fixture(t);
  const initial = capture(light);
  const copy = createSelectionCopyPreview(asset, element => element?.id === unit.stableId);
  try {
    assert.equal(copy.group.children.length, 1);
    const [mesh] = copy.group.children;
    assert.equal(mesh.material, wood.material);
    assert.equal(mesh.geometry.index.count, wood.geometry.index.count);
    copy.update(translation);
    assert.deepEqual(capture(light), initial);
  } finally { copy.restore(); }
  assert.deepEqual(capture(light), initial);
});
