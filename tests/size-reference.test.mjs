import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { normalizeReferencePreferences, referenceDefaults, formatDistance, referenceGridStep, referenceAssetBounds, branchMeasuredLength, createHumanSilhouette } from '../web/size-reference-data.js';

test('workspace defaults and persisted display values remain physical and bounded', () => {
  assert.equal(referenceDefaults('TREE').human, true); assert.equal(referenceDefaults('BRANCH').ruler, true);
  assert.equal(referenceDefaults('BRANCH').human, false);
  const p = normalizeReferencePreferences({humanHeight:999,rulerLength:3,side:'x',grid:false,gap:-8},'BRANCH');
  assert.equal(p.humanHeight,3); assert.equal(p.rulerLength,.2); assert.equal(p.side,'RIGHT'); assert.equal(p.gap,0); assert.equal(p.grid,false);
  assert.deepEqual(normalizeReferencePreferences(JSON.parse(JSON.stringify(referenceDefaults('TREE'))),'TREE'),referenceDefaults('TREE'));
  assert.equal(formatDistance(.2),'20 cm'); assert.equal(formatDistance(1.75),'1.75 m'); assert.equal(formatDistance(.004),'4 mm'); assert.equal(formatDistance(0),'0 cm');
});

test('real bounds include transformed instanced units and ignore outer preview wind and unrelated reference objects', () => {
  const scene = new THREE.Group(), model = new THREE.Group(), asset = new THREE.Group(); scene.add(model); model.add(asset);
  model.rotation.set(.2,.3,.1); model.position.set(10,20,30);
  const geometry = new THREE.BoxGeometry(2,1,4), material = new THREE.MeshBasicMaterial(), mesh = new THREE.InstancedMesh(geometry,material,2);
  mesh.setMatrixAt(0,new THREE.Matrix4()); mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(4,0,0)); asset.add(mesh);
  const helper = new THREE.Mesh(new THREE.BoxGeometry(100,100,100),material); scene.add(helper);
  const bounds = referenceAssetBounds(asset), s = bounds.getSize(new THREE.Vector3());
  assert.ok(s.distanceTo(new THREE.Vector3(6,1,4))<1e-6); assert.ok(Math.abs(bounds.min.x+1)<1e-6);
  const again = referenceAssetBounds(asset); assert.ok(again.min.distanceTo(bounds.min)<1e-8); assert.equal(mesh.isInstancedMesh,true);
  geometry.dispose(); helper.geometry.dispose(); material.dispose();
});

test('human geometry is normalized to exact foot-to-head height and branch path length differs from span', () => {
  const g = createHumanSilhouette(); g.computeBoundingBox();
  assert.ok(Math.abs(g.boundingBox.min.z)<1e-6); assert.ok(Math.abs(g.boundingBox.max.z-1)<1e-6);
  assert.ok(g.index.count/3<200); g.dispose();
  const branch={points:[new THREE.Vector3(0,0,0),new THREE.Vector3(1,0,0),new THREE.Vector3(1,0,1)]};
  assert.equal(branchMeasuredLength(branch),2); assert.ok(branchMeasuredLength(branch)>branch.points[0].distanceTo(branch.points[2]));
});

test('metric grid adapts to zoom using legible decimal steps and supports orthographic scale', () => {
  const p = new THREE.PerspectiveCamera(38,1,.01,100);
  assert.ok(referenceGridStep(p,10,800)>referenceGridStep(p,.5,800));
  const o = new THREE.OrthographicCamera(-1,1,1,-1,.01,100), first=referenceGridStep(o,10,800); o.zoom=10;
  assert.ok(referenceGridStep(o,10,800)<first);
  assert.ok(Number.isFinite(referenceGridStep(p,0,0)));
});
