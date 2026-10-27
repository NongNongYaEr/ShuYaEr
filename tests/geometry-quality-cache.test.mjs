import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { analyzeGroup, DEFAULT_SETTINGS } from '../web/branch-kernel.js';

test('shared sample quality cache rechecks changed buffers, indices and current mesh attributes/materials',()=>{
  const cache=new WeakMap(),group=new THREE.Group(),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));geometry.setIndex([0,1,2]);
  for(const [key,size]of [['uv',2],['normal',3],['tangent',4],['color',4]])geometry.setAttribute(key,new THREE.Float32BufferAttribute(new Float32Array(3*size),size));
  const material=new THREE.MeshBasicMaterial();material.name='sample';group.add(new THREE.Mesh(geometry,material),new THREE.InstancedMesh(geometry,material,7));
  const check=()=>{const result=analyzeGroup(group,DEFAULT_SETTINGS,cache);assert.deepEqual(result,analyzeGroup(group,DEFAULT_SETTINGS));return result;};
  assert.equal(check().vertices,24);const saved=cache.get(geometry);check();assert.equal(cache.get(geometry),saved);
  const positions=geometry.getAttribute('position');positions.setXYZ(2,2,0,0);positions.needsUpdate=true;assert.equal(check().degenerate_faces,2);assert.notEqual(cache.get(geometry),saved);
  positions.setXYZ(2,NaN,0,0);positions.needsUpdate=true;assert.equal(check().invalid_vertices,2);
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));assert.equal(check().invalid_vertices,0);
  geometry.index.setX(2,1);geometry.index.needsUpdate=true;assert.equal(check().degenerate_faces,2);
  geometry.setIndex([0,1,2]);assert.equal(check().degenerate_faces,0);
  geometry.deleteAttribute('normal');assert.equal(check().missing_normals,2);
  const other=new THREE.MeshBasicMaterial();other.name='other';group.children[0].material=other;assert.equal(check().material_slots,2);
});
