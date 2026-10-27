import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { pveGlbMatrix, pveBranchConnector } from '../web/pve-export.js';
import { createGlbExportScene } from '../web/glb-export.js';
import { createTreeSpeciesDocument, TREE_SPECIES } from '../web/tree-species-library.js';

const near = (a, b) => a.forEach((value, i) => assert.ok(Math.abs(value - b[i]) < 1e-6, `${a} != ${b}`));
test('all species and three branch styles map attachment root and growth into UE PVE coordinates', () => {
  for (const species of Object.keys(TREE_SPECIES)) for (const style of ['MAIN', 'SIDE', 'TIP']) {
    const doc = createTreeSpeciesDocument(species, style);
    const connector = pveBranchConnector(doc.authoring);
    if(doc.authoring.recipe.tags.includes('WHOLE_PLANT')) {assert.equal(connector,null);continue;}
    const matrix = pveGlbMatrix(connector);
    near(new THREE.Vector3(...connector.position).applyMatrix4(matrix).toArray(), [0, 0, 0]);
    const direction = new THREE.Vector3(...connector.direction).transformDirection(matrix);
    // UE's GLTF ConvertVec3 swaps Y/Z: file +Y must become UE +Z.
    near([direction.x, direction.z, direction.y], [0, 0, 1]);
    assert.ok(Math.abs(matrix.determinant() - 1) < 1e-9, 'no mirroring or scale change');
  }
});
test('vertical and downward connectors have finite orientation; malformed connectors fail explicitly', () => {
  for (const direction of [[0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
    const m = pveGlbMatrix({ position: [3, 2, 1], direction });
    near(new THREE.Vector3(...direction).transformDirection(m).toArray(), [0, 1, 0]);
    assert.ok(m.elements.every(Number.isFinite));
  }
  assert.throws(() => pveGlbMatrix({ position: [0, 0, 0], direction: [0, 0, 0] }));
  assert.throws(() => pveGlbMatrix({ position: [NaN, 0, 0], direction: [1, 0, 0] }));
});
test('export bakes nested transforms and normals into one multi-material mesh without modifying authoring geometry', () => {
  const root = new THREE.Group(), nested = new THREE.Group();
  nested.position.set(5, 6, 7); root.add(nested);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(Array(12).fill(0.5), 4));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  geometry.setIndex([0, 1, 2]);
  const bark = new THREE.MeshStandardMaterial(), leaf = new THREE.MeshStandardMaterial();
  nested.add(new THREE.Mesh(geometry, bark), new THREE.Mesh(geometry, leaf));
  const hidden = new THREE.Group(); hidden.visible = false; hidden.add(new THREE.Mesh(geometry, bark)); root.add(hidden);
  const before = Array.from(geometry.attributes.position.array);
  const prepared = createGlbExportScene(root, { connector: { position: [5, 6, 7], direction: [1, 0, 0] } });
  try {
    assert.equal(prepared.scene.children.length, 1);
    const mesh = prepared.scene.children[0];
    assert.ok(mesh.matrix.equals(new THREE.Matrix4()));
    assert.deepEqual(mesh.material, [bark, leaf]);
    assert.equal(mesh.geometry.groups.length, 2);
    near(Array.from(mesh.geometry.attributes.position.array.slice(0, 9)), [0, 0, 0, 0, 1, 0, -1, 0, 0]);
    near(Array.from(mesh.geometry.attributes.normal.array.slice(0, 3)), [0, 0, 1]);
    assert.ok(mesh.geometry.attributes._BRANCH_WIND); assert.equal(mesh.geometry.attributes.color, undefined);
    assert.deepEqual(Array.from(geometry.attributes.position.array), before);
    assert.ok(geometry.attributes.color); assert.equal(geometry.attributes._BRANCH_WIND, undefined);
  } finally { prepared.dispose(); geometry.dispose(); bark.dispose(); leaf.dispose(); }
});
test('whole trees and surface vegetation do not receive a branch attachment transform', () => {
  const authoring = createTreeSpeciesDocument('CAMPHOR').authoring;
  assert.equal(pveBranchConnector({ ...authoring, vine: {} }), null);
  assert.equal(pveBranchConnector({ ...authoring, surface_growth: { enabled: true } }), null);
  assert.equal(pveBranchConnector({}), null);
});
