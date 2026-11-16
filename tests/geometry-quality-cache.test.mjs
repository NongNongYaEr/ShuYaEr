import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { analyzeGroup, DEFAULT_SETTINGS, disposeBranchAsset, repairExportAssetGeometry } from '../web/branch-kernel.js';
import { isZeroAreaTriangle } from '../web/triangle-area.js';

test('exact triangle area handles rounding around collinearity without dropping thin faces',()=>{
  const x = 3 * 2 ** -42;
  assert(isZeroAreaTriangle(x,2049*x,0,1,2049,0,.5,1024.5,0));
  assert(!isZeroAreaTriangle(x,2049*x,0,1,2049,0,.5,1024.5 + 2 ** -42,0));
  assert(!isZeroAreaTriangle(0,0,0,1e-200,0,0,0,1e-200,0));
});

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

test('export copy removes only exact zero-area faces and keeps groups and per-vertex skin/UV data',()=>{
  const group=new THREE.Group(),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,0,1e-15,0],3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,.25],2));
  geometry.setAttribute('uv1',new THREE.Float32BufferAttribute([0,0,0,.25,.5,.25,.5,1],2));
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([1,0,0,0,1,0,0,0,2,0,0,0,2,0,0,0],4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],4));
  geometry.setIndex([0,0,1,0,1,2,0,1,3]);
  geometry.addGroup(0,6,0);geometry.addGroup(6,3,1);geometry.setDrawRange(3,6);
  const slots=[new THREE.MeshBasicMaterial(),new THREE.MeshBasicMaterial()];
  const mesh=new THREE.Mesh(geometry,slots),preview=new THREE.Mesh(geometry,slots);
  mesh.userData.trunk_source_vertices=[4,8,9,12];
  group.add(mesh);
  const asset={group,settings:DEFAULT_SETTINGS,geometryQualityCache:new WeakMap(),compiledSampleGeometries:new Set([geometry])};
  asset.report=analyzeGroup(group,asset.settings,asset.geometryQualityCache);
  assert.equal(asset.report.degenerate_faces,1);
  const repair=repairExportAssetGeometry(asset),copy=mesh.geometry;
  assert.deepEqual(repair,{removedFaces:1,remainingFaces:0});
  assert.equal(repairExportAssetGeometry(asset),repair);
  assert.equal(asset.report.triangles,2);
  assert.equal(preview.geometry,geometry);
  assert.deepEqual([...geometry.index.array],[0,0,1,0,1,2,0,1,3]);
  assert.deepEqual([...copy.index.array],[0,1,2,0,1,3]);
  assert.deepEqual(copy.groups,[{start:0,count:3,materialIndex:0},{start:3,count:3,materialIndex:1}]);
  assert.deepEqual(copy.drawRange,{start:0,count:6});
  for(const name of Object.keys(geometry.attributes))assert.deepEqual(copy.attributes[name].array,geometry.attributes[name].array);
  assert.deepEqual(mesh.userData.trunk_source_vertices,[4,8,9,12]);
  assert.equal(mesh.material,slots);
  disposeBranchAsset(asset);
  assert.equal(mesh.geometry,geometry);
  geometry.dispose();slots.forEach(material=>material.dispose());
});

test('unindexed cleanup preserves vertex rows and rejects a mesh without a surviving face',()=>{
  const group=new THREE.Group(),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,1,0,2,2,0,0,0,0,1,0,0,0,1,0],3));
  const invalid=new THREE.BufferGeometry();
  invalid.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,1,0,2,2,0],3));
  const material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(geometry,material),bad=new THREE.Mesh(invalid,material);
  group.add(mesh,bad);
  const asset={group,settings:DEFAULT_SETTINGS,report:analyzeGroup(group,DEFAULT_SETTINGS)};
  assert.deepEqual(repairExportAssetGeometry(asset),{removedFaces:1,remainingFaces:1});
  assert.equal(asset.report.ok,false);
  assert.deepEqual([...mesh.geometry.index.array],[3,4,5]);
  assert.equal(mesh.geometry.attributes.position.count,6);
  assert.equal(geometry.index,null);
  assert.equal(bad.geometry,invalid);
  assert(isZeroAreaTriangle(0,0,0,1,1,0,2,2,0));
  disposeBranchAsset(asset);material.dispose();
});
