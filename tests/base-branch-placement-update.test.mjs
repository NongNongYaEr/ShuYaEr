import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {baseBranchShape,createBaseBranchAssembly} from '../web/base-branch-assembly.js';
import {buildBranchAsset,disposeBranchAsset,hierarchyTexturePayload} from '../web/branch-kernel.js';
import {nativeModelRevision} from '../web/native-model-changes.js';
import {nativePreviewPoseForObject} from '../web/native-preview-geometry.js';

const pack = JSON.parse(readFileSync(new URL('../assets/plant-unit-library/5ea361caa1bafd3eecae12733d39f80793519b9a5b9399a8f62e8434199df61a.plantunits.json',import.meta.url),'utf8'));
const source = JSON.parse(readFileSync(new URL('../示例工程/基础枝组装/弯枝与叶花果_组装单元枝.branch.json',import.meta.url),'utf8'));
const base = pack.base_branches.find(item => item.name === '基础枝 13');
const assembly = createBaseBranchAssembly({...pack,units:pack.units.map((unit,index) => index === 1 ? {...unit,role:'FRUIT'} : unit)},base.id);
const {settings} = source;
const input = normalizeAuthoring({...source.authoring,base_branch_assembly:assembly,branch_shape:baseBranchShape(assembly),leaf_material:assembly.material},settings.seed);
const placed = (id,face,unit = 0) => ({id,face,unit_id:assembly.units[unit].id,barycentric:[.2,.3,.5],roll:0,scale:1,automatic:false});
const edit = (authoring,placements) => normalizeAuthoring({...authoring,base_branch_assembly:{...authoring.base_branch_assembly,placements}},settings.seed,authoring);
const build = authoring => buildBranchAsset(settings,null,[],settings.preview_lod,authoring,{instanced:true});
const meshMap = asset => {
  const result = new Map();
  asset.group.traverse(mesh => {
    if (mesh.userData.base_branch_mesh) result.set('wood',mesh);
    else if (mesh.userData.base_branch_unit_id) result.set(mesh.userData.base_branch_unit_id,mesh);
  });
  return result;
};

function verifyColdParity(asset,authoring) {
  const cold = build(authoring);
  try {
    assert.deepEqual(asset.elements,cold.elements);
    assert.deepEqual(asset.placements,cold.placements);
    assert.deepEqual(asset.masterPlacements,cold.masterPlacements);
    assert.deepEqual(asset.treeOrgans,cold.treeOrgans);
    assert.deepEqual(asset.report,cold.report);
    assert.deepEqual(asset.lookupTexture,cold.lookupTexture);
    assert.deepEqual(hierarchyTexturePayload(asset),hierarchyTexturePayload(cold));
    const actual = meshMap(asset), expected = meshMap(cold);
    assert.deepEqual([...actual.keys()],[...expected.keys()]);
    for (const [id,mesh] of actual) {
      const other = expected.get(id);
      assert.deepEqual(mesh.geometry.index.array,other.geometry.index.array);
      for (const attribute of ['position','normal','color','tangent','uv','uv1','uv2']) {
        assert.deepEqual(mesh.geometry.attributes[attribute].array,other.geometry.attributes[attribute].array,id + ' ' + attribute);
      }
    }
  } finally { disposeBranchAsset(cold); }
}

test('real base 13 updates placed parts in place with cold-build metadata and lookup parity', () => {
  const asset = build(input), root = asset.group;
  const wood = meshMap(asset).get('wood'), atlas = wood.material, originalUv = wood.geometry.attributes.uv;
  const leaf = placed('leaf',0), fruit = placed('fruit',30,1), extra = placed('extra',60);
  const preview = new THREE.InstancedMesh(wood.geometry,atlas,32);
  root.add(preview);
  const before = nativeModelRevision(asset);
  const added = edit(input,[leaf,fruit,extra,placed('another',90)]);
  try {
    assert.equal(asset.updateBaseBranchPlacements(settings,added,{beforeCommit() {
      assert.equal(meshMap(asset).size,1);
      assert.equal(preview.parent,root);
      preview.removeFromParent();
      preview.dispose();
    }}),true);
    assert.equal(asset.group,root);
    assert.equal(meshMap(asset).get('wood'),wood);
    assert.equal(wood.material,atlas);
    assert.equal(wood.geometry.attributes.uv,originalUv);
    assert.ok(nativeModelRevision(asset) > before);
    verifyColdParity(asset,added);

    const meshes = meshMap(asset), leafMesh = meshes.get('leaf'), fruitMesh = meshes.get('fruit'), extraMesh = meshes.get('extra');
    const leafNative = nativePreviewPoseForObject(leafMesh);
    assert.ok(leafNative);
    const retainedLookup = leafMesh.geometry.attributes.uv1;
    let removed = false;
    extraMesh.geometry.addEventListener('dispose',() => { removed = true; });
    const next = edit(added,[fruit,{...leaf,face:120,roll:24,scale:1.5}]);
    assert.equal(asset.updateBaseBranchPlacements(settings,next),true);
    const moved = meshMap(asset);
    assert.equal(moved.get('wood'),wood);
    assert.equal(moved.get('fruit'),fruitMesh);
    assert.equal(moved.get('leaf'),leafMesh);
    assert.equal(leafMesh.material,atlas);
    const nextNative = nativePreviewPoseForObject(leafMesh);
    assert.equal(nextNative.geometry,leafNative.geometry);
    assert.notDeepEqual(nextNative.matrix.elements,leafNative.matrix.elements);
    const nativePositions = nextNative.geometry.attributes.position, baked = leafMesh.geometry.attributes.position;
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < baked.count; i++) {
      p.fromBufferAttribute(nativePositions,i).applyMatrix4(nextNative.matrix);
      assert.ok(p.distanceTo(q.fromBufferAttribute(baked,i)) < 1e-6);
    }
    assert.notEqual(moved.get('leaf').geometry.attributes.uv1,retainedLookup);
    assert.equal(removed,true);
    verifyColdParity(asset,next);
    assert.equal(asset.updateBaseBranchPlacements(settings,added),true);
    assert.equal(meshMap(asset).get('leaf'),leafMesh);
    assert.equal(nativePreviewPoseForObject(leafMesh).geometry,leafNative.geometry);
    verifyColdParity(asset,added);
    assert.equal(asset.updateBaseBranchPlacements(settings,input),true);
    assert.deepEqual([...meshMap(asset).keys()],['wood']);
    verifyColdParity(asset,input);
  } finally {
    if (preview.parent) { preview.removeFromParent(); preview.dispose(); }
    disposeBranchAsset(asset);
  }
});

test('base placement shortcut leaves the displayed asset untouched on a rejected update', () => {
  const asset = build(input), before = asset.authoring;
  const next = edit(input,[placed('leaf',0)]);
  let commits = 0;
  const options = {beforeCommit() { commits++; }};
  try {
    assert.equal(asset.updateBaseBranchPlacements({...settings,health:.4},next,options),false);
    assert.equal(asset.updateBaseBranchPlacements(settings,{...next,base_branch_assembly:{...next.base_branch_assembly,scale:2}},options),false);
    assert.equal(asset.updateBaseBranchPlacements(settings,{...next,quality:{...next.quality,max_attachment_overlap:.1}},options),false);
    assert.equal(commits,0);
    assert.equal(asset.authoring,before);
    assert.equal(asset.elements.length,1);
    assert.deepEqual([...meshMap(asset).keys()],['wood']);
  } finally { disposeBranchAsset(asset); }
});
