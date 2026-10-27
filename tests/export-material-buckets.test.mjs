import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { collectExportMaterialBuckets } from '../web/export-material-buckets.js';

test('same-name bark palettes keep carrier overrides, physical repeats and complete unit source slots separate', () => {
  const root = new THREE.Group(), geometry = new THREE.BoxGeometry();
  const source = new THREE.MeshStandardMaterial({ color: 0x786649 }); source.name = 'M_Bark';
  const carrier = source.clone(); carrier.map = new THREE.Texture(); carrier.map.repeat.set(2, 3);
  const current = carrier.clone(); current.map = carrier.map.clone(); current.map.repeat.set(7, 8);
  current.map.rotation = Math.PI / 2;
  root.add(new THREE.Mesh(geometry, current), new THREE.Mesh(geometry, carrier));
  const units = [new THREE.Mesh(geometry, source), new THREE.Mesh(geometry, source)]; root.add(...units);
  const buckets = collectExportMaterialBuckets(root);
  assert.equal(buckets.length, 3);
  assert.deepEqual(buckets.map(b => b.material), [current, carrier, source]);
  assert.deepEqual(buckets.map(b => b.name), ['M_Bark', 'M_Bark_2', 'M_Bark_3']);
  assert.deepEqual(buckets[2].meshes, units, 'repeated source instances still share their original material slot');
  assert.equal(buckets[0].material.map.repeat.x, 7); assert.equal(buckets[1].material.map.repeat.x, 2);
  assert.equal(buckets[2].material.map, null, 'carrier recipe never spills into source models during merge');
  assert.equal(source.name, 'M_Bark');
  geometry.dispose(); [source, carrier, current].forEach(m => m.dispose()); carrier.map.dispose(); current.map.dispose();
});

test('legacy single shared palette retains its mesh label and merges as before', () => {
  const root = new THREE.Group(), geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardMaterial(); material.name = 'M_Bark';
  root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  const buckets = collectExportMaterialBuckets(root);
  assert.equal(buckets.length, 1); assert.equal(buckets[0].name, 'M_Bark');
  assert.equal(buckets[0].meshes.length, 2); assert.equal(buckets[0].material, material);
  geometry.dispose(); material.dispose();
});
