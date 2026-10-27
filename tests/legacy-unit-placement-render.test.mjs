import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { buildBranchAsset, disposeBranchAsset, deserializeGeometry, normalizeSettings } from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { captureBranchDuplicate } from '../web/branch-duplicate.js';
import { legacyUnitBranches, legacyUnitInstances, makeLegacyUnitPlacement } from '../web/legacy-unit-placement.js';
import { unitBranchIndex } from '../web/unit-branch-boundary.js';
import { createSculptSnapshot, sampleLine, lineTangent } from '../web/tree-sculpt.js';
import { createGpuMeshPreview } from '../web/gpu-edit-preview.js';
import { followProtectedUnits, protectedUnitBranches } from '../web/shape-unit-follow.js';

const source = JSON.parse(fs.readFileSync(new URL('../次枝资产/全植物次枝成品V1/红叶石楠/红叶石楠_短弯细梢_红嫩叶_成品V1.branchasset.json', import.meta.url), 'utf8')).asset;

function fixture() {
  const leaves = source.sample.leaf_meshes.map(unit => ({ ...unit, geometry: deserializeGeometry(unit.geometry) }));
  const settings = normalizeSettings({ seed: 42, leaf_density: 0, petiole_length: 0, wind_strength: 0, collision_avoidance: false });
  const authoring = normalizeAuthoring({
    branch_shape: { branches: [{ id: 'ROOT', parent: '', points: [[0,0,0],[0,0,1],[.2,0,2],[.1,0,3]], start_radius: .13, end_radius: .04 }] },
    branch_library: [source],
    branch_instances: [0,1].map(index => ({ id: 'I'+index, asset_id: source.id, parent: 'ROOT', linked: true, attach: .35+index*.4,
      scale: .5+index*.2, radius_scale: 1, angle: 60, azimuth: index*77, variation: 0, seed: 42 })),
    recipe: { tags: ['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY'] },
    tree_organs: { ...source.sample.authoring.tree_organs, mode: 'LEAVES' },
  }, 42);
  const assets = [], previews = [];
  const build = (doc, instanced = false, lod = 0) => {
    const asset = buildBranchAsset(settings, null, leaves, lod, doc, { instanced }); assets.push(asset); return asset;
  };
  const original = build(authoring), root = unitBranchIndex(original.masterBranches, authoring.branch_instances).roots.get('I0');
  const duplicate = captureBranchDuplicate(original, new Set([root]), 'COLLAR_COPY', leaves);
  authoring.sculpt_layers.push({ id: 'OLD_COPY', name: '旧完整件', enabled: true, strength: 1, operation: duplicate, branches: {} });
  return { authoring, settings, build, previews, close() {
    previews.forEach(preview => preview.restore()); assets.forEach(disposeBranchAsset); leaves.forEach(unit => unit.geometry.dispose());
  } };
}

function comparePreview(gpu, preview, rebuilt, label, placementMatrix) {
  const expected = new Map(); rebuilt.group.traverse(mesh => { if (mesh.isMesh) expected.set(mesh.name, mesh); });
  const categories = new Map(); let vertices = 0;
  gpu.group.traverse(mesh => {
    if (!mesh.isMesh) return;
    const target = expected.get(mesh.name);
    assert.ok(target, 'matching rebuilt mesh: '+mesh.name);
    assert.equal(target.isInstancedMesh, mesh.isInstancedMesh);
    if (mesh.isInstancedMesh) assert.equal(target.count, mesh.count);
    const descriptors = rebuilt.editPreviewBindings?.(target)?.instances;
    for (let instance = 0; instance < (mesh.isInstancedMesh ? mesh.count : 1); instance++) {
      const descriptor = descriptors?.[instance];
      const positions = target.geometry.getAttribute('position'), normals = target.geometry.getAttribute('normal');
      const center = target.geometry.getAttribute('sampleCenter'), tangent = target.geometry.getAttribute('sampleTangent');
      const instanceMatrix = new THREE.Matrix4(); if (target.isInstancedMesh) target.getMatrixAt(instance, instanceMatrix);
      const radius = descriptor?.radius ?? 1;
      assert.equal(positions.count, mesh.geometry.getAttribute('position').count, 'whole-model topology remains unchanged');
      for (let index = 0; index < positions.count; index++) {
        const actual = preview.vertex(mesh, index, instance).applyMatrix4(mesh.matrix);
        const wanted = new THREE.Vector3().fromBufferAttribute(positions, index);
        if (center) wanted.set(center.getX(index)+(wanted.x-center.getX(index))*radius,
          center.getY(index)+(wanted.y-center.getY(index))*radius, center.getZ(index)+(wanted.z-center.getZ(index))*radius);
        wanted.applyMatrix4(instanceMatrix).applyMatrix4(target.matrix);
        assert.ok(actual.distanceTo(wanted) < 8e-5, `${label} ${mesh.name}:${index} position differs by ${actual.distanceTo(wanted)}`);
        if (normals) {
          const actualNormal = preview.normal(mesh, index, instance).applyMatrix3(new THREE.Matrix3().getNormalMatrix(mesh.matrix)).normalize();
          const wantedNormal = new THREE.Vector3().fromBufferAttribute(normals, index);
          if (center && tangent) {
            const axis = new THREE.Vector3().fromBufferAttribute(tangent, index), along = axis.clone().multiplyScalar(wantedNormal.dot(axis));
            wantedNormal.sub(along).divideScalar(radius).add(along);
          }
          wantedNormal.applyMatrix3(new THREE.Matrix3().getNormalMatrix(instanceMatrix))
            .applyMatrix3(new THREE.Matrix3().getNormalMatrix(target.matrix)).normalize();
          assert.ok(actualNormal.distanceTo(wantedNormal) < .002, `${label} ${mesh.name}:${index} normal differs by ${actualNormal.distanceTo(wantedNormal)}`);
        }
        vertices++;
      }
      for (const name of ['uv','uv2']) {
        const originalUv = mesh.geometry.getAttribute(name), finalUv = target.geometry.getAttribute(name);
        if (!originalUv && !finalUv) continue;
        assert.ok(originalUv && finalUv, 'preserve material '+name);
        assert.equal(originalUv.count, finalUv.count); assert.equal(originalUv.itemSize, finalUv.itemSize);
        for (let index = 0; index < originalUv.array.length; index++) assert.ok(Math.abs(originalUv.array[index]-finalUv.array[index]) < 1e-7,
          `${label} ${mesh.name} ${name}:${index} material coordinates changed`);
      }
      if (mesh.userData.category==='branch' && mesh.userData.stable_id?.startsWith('COLLAR_COPY')) {
        const oldTangent=mesh.geometry.getAttribute('tangent'),newTangent=target.geometry.getAttribute('tangent');
        assert.ok(oldTangent && newTangent,'preserve woody normal-map tangent basis');
        for(let index=0;index<oldTangent.count;index++) {
          const wanted=new THREE.Vector3().fromBufferAttribute(oldTangent,index).transformDirection(mesh.matrix).transformDirection(placementMatrix);
          const actual=new THREE.Vector3().fromBufferAttribute(newTangent,index).transformDirection(target.matrix);
          assert.ok(actual.distanceTo(wanted)<.002,`${label} woody normal-map tangent changed`);
          assert.equal(oldTangent.getW(index),newTangent.getW(index));
        }
      }
      if (target.userData.stable_id?.startsWith('COLLAR_COPY') || target.name.includes('COLLAR_COPY')) {
        const category = target.userData.category; categories.set(category, (categories.get(category) || 0)+1);
      }
    }
  });
  assert.ok(vertices > 1000, 'compare actual source wood, leaf, flower and collar vertices at every LOD');
  assert.ok(categories.get('branch') >= 1, label+' renders copied wood at this LOD');
  assert.ok(categories.get('junction') >= 1, label+' renders copied collars at this LOD');
  return vertices;
}

test('old complete photinia wood, leaves, flowers and collars match GPU rigid preview after two strokes and a fresh JSON rebuild', () => {
  for (const instanced of [false, true]) for (const lod of [0,1,2]) {
    const f = fixture();
    try {
      let authoring = f.authoring;
      const savedSource = JSON.stringify(authoring.branch_library), construction = JSON.stringify(authoring.sculpt_layers[0].operation);
      for (const [stroke, axis, angle, scale] of [[0,new THREE.Vector3(0,0,1),.41,1.2],[1,new THREE.Vector3(1,0,0),-.27,.8]]) {
        const gpu = f.build(authoring, instanced, lod), virtual = legacyUnitInstances(authoring, gpu.masterBranches), unit = virtual[0];
        assert.ok(unit); const root = gpu.masterBranches.find(branch => branch.stableId === unit.legacyRootId), pivot = root.points[0];
        const quaternion = new THREE.Quaternion().setFromAxisAngle(axis, angle);
        const matrix = new THREE.Matrix4().compose(pivot, quaternion, new THREE.Vector3().setScalar(scale))
          .multiply(new THREE.Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z));
        const boundary = unitBranchIndex(legacyUnitBranches(authoring, gpu.masterBranches), [...authoring.branch_instances,...virtual]);
        const targets = new Set(boundary.ownedBranches.get(unit.id).map(branch => branch.stableId));
        assert.equal(targets.size, 3);
        const copied = gpu.masterBranches.filter(branch => targets.has(branch.stableId));
        assert.equal(copied.reduce((count,branch)=>count+(branch.copiedLeaves?.length||0),0),5);
        assert.equal(copied.reduce((count,branch)=>count+(branch.copiedOrgans?.length||0),0),2,'full flower records survive preview LOD culling');
        if (lod === 0) {
          assert.equal(gpu.masterPlacements.filter(placement => targets.has(placement.branchStableId)).length,5);
          assert.equal(gpu.treeOrgans.filter(placement => targets.has(placement.branchStableId)).length,2);
        }
        const snapshot = createSculptSnapshot(gpu.masterBranches, authoring.overrides);
        const preview = createGpuMeshPreview(gpu, snapshot, { sampleLine, lineTangent, targets, rigid: true });
        assert.ok(preview); f.previews.push(preview); assert.equal(preview.stats.mode, 'GPU');
        preview.update(snapshot, new Map(gpu.masterBranches.filter(branch => targets.has(branch.stableId)).map(branch => [branch.id,{matrix}])));
        const operation = makeLegacyUnitPlacement([{ id: unit.id, instance: unit, rootId: unit.legacyRootId, branches: gpu.masterBranches }],
          [{ id: unit.id, matrix }], { authoring, branches: gpu.masterBranches });
        assert.ok(operation); assert.ok(!JSON.stringify(operation).includes('collarQuaternion'), 'runtime frame does not alter saved operation schema');
        authoring = normalizeAuthoring(JSON.parse(JSON.stringify({ ...authoring, sculpt_layers: [...authoring.sculpt_layers,
          { id: 'PLACEMENT_'+stroke, name: '完整件调整', enabled: true, strength: 1, operation, branches: {} }] })));
        const rebuilt = f.build(authoring, instanced, lod); comparePreview(gpu, preview, rebuilt, `instanced=${instanced} LOD=${lod} stroke=${stroke}`,matrix);
        for (const branch of rebuilt.masterBranches) {
          if (!targets.has(branch.stableId)) { assert.equal(branch.collarQuaternion, undefined, 'ordinary source instances retain their existing collar path'); continue; }
          const old = gpu.masterBranches.find(candidate => candidate.stableId === branch.stableId);
          const parent = gpu.masterBranches.find(candidate => candidate.id === old.parentId);
          const baseline = old.collarQuaternion || new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), lineTangent(parent.points,.7));
          assert.ok(branch.collarQuaternion.angleTo(quaternion.clone().multiply(baseline)) < 1e-7, 'each subsequent stroke uses the previous collar frame');
        }
        assert.equal(JSON.stringify(authoring.branch_library), savedSource); assert.equal(JSON.stringify(authoring.sculpt_layers[0].operation), construction);
        preview.restore();
      }
    } finally { f.close(); }
  }
});

test('protected skeleton following transports only an existing legacy collar frame without adding one to ordinary models', () => {
  const f = fixture();
  try {
    const initial=f.build(f.authoring),unit=legacyUnitInstances(f.authoring,initial.masterBranches)[0];
    const originalRoot=initial.masterBranches.find(branch=>branch.stableId===unit.legacyRootId),pivot=originalRoot.points[0];
    const priorMatrix=new THREE.Matrix4().compose(pivot,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),.41),new THREE.Vector3(1.2,1.2,1.2))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z));
    const priorOperation=makeLegacyUnitPlacement([{id:unit.id,instance:unit,rootId:unit.legacyRootId}],
      [{id:unit.id,matrix:priorMatrix}],{authoring:f.authoring,branches:initial.masterBranches});
    const doc=normalizeAuthoring(JSON.parse(JSON.stringify({...f.authoring,sculpt_layers:[...f.authoring.sculpt_layers,
      {id:'PRIOR_STROKE',name:'完整调整',enabled:true,strength:1,operation:priorOperation,branches:{}}]})));
    const asset = f.build(doc), parent = asset.masterBranches.find(branch => branch.stableId === 'ROOT');
    const root = asset.masterBranches.find(branch => branch.stableId === 'COLLAR_COPY_0');
    const baseline = root.collarQuaternion.clone(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), .3);
    const changed = { ...parent, points: parent.points.map(point => point.clone().applyQuaternion(q)),
      controlPoints: parent.controlPoints.map(point => point.clone().applyQuaternion(q)) };
    const protectedIds = protectedUnitBranches(asset.masterBranches), result = followProtectedUnits(asset.masterBranches, [changed], protectedIds);
    const moved = result.find(branch => branch.stableId === root.stableId);
    const follow = new THREE.Quaternion().setFromUnitVectors(lineTangent(parent.points, root.parentT), lineTangent(changed.points, root.parentT));
    assert.ok(moved.collarQuaternion.angleTo(follow.clone().multiply(baseline)) < 1e-7);
    assert.ok(root.collarQuaternion.angleTo(baseline) < 1e-7, 'runtime source frame remains immutable');
    assert.equal(moved.legacyRigidGeometry.baseline,root.legacyRigidGeometry.baseline,'parent following retains the first sweep/UV baseline');
    const parentMotion=moved.mountMatrix.clone().multiply(root.mountMatrix.clone().invert());
    const expected=parentMotion.multiply(root.legacyRigidGeometry.matrix);
    expected.elements.forEach((value,index)=>assert.ok(Math.abs(value-moved.legacyRigidGeometry.matrix.elements[index])<1e-8,'parent motion left-multiplies prior whole strokes'));
    moved.legacyRigidGeometry.baseline.points.forEach((point,index)=>assert.ok(point.clone().applyMatrix4(moved.legacyRigidGeometry.matrix).distanceTo(moved.points[index])<1e-8));
    assert.equal(result.find(branch => branch.instanceId === 'I1').collarQuaternion, undefined);
    assert.equal(result.find(branch => branch.instanceId === 'I1').legacyRigidGeometry, undefined);
  } finally { f.close(); }
});
