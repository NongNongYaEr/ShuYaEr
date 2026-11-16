import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from '../web/vendor/three.module.min.js';
import { baseBranchGeometry } from '../web/base-branch-assembly.js';
import { nearestAxis, sampleAxis, withAxisTimes } from '../web/branch-axis.js';
import { BASE_BRANCH_SHAPING_OPTIONS, baseBranchShapingAnalysisInput, createBaseBranchShaping } from '../web/base-branch-shaping.js';
import { normalizePlantBaseBranch } from '../web/plant-unit-data.js';
import { identifyTrunkSkeleton } from '../web/trunk-auto-skeleton.js';

const suite = JSON.parse(fs.readFileSync(new URL('../assets/plant-unit-library/5ea361caa1bafd3eecae12733d39f80793519b9a5b9399a8f62e8434199df61a.plantunits.json',import.meta.url),'utf8'));
const specimen = number => normalizePlantBaseBranch(suite.base_branches.find(base => base.name === `基础枝 ${number}`));
const vector = point => new THREE.Vector3(...point);
const close = (a,b,tolerance = 1e-7) => {
  assert.equal(a.length,b.length);
  assert.ok(a.every((value,i) => Math.abs(value - b[i]) < tolerance));
};

function restParameter(before,after,t) {
  const times = [0], points = before.map(vector);
  for (let i = 1; i < points.length; i++) times.push(times.at(-1) + points[i].distanceTo(points[i - 1]));
  return sampleAxis(withAxisTimes(after.map(vector),times.map(value => value / times.at(-1))),t).toArray();
}

test('the actual platanus base 11 has an exact rest preview and bakes a moved tip with the original UVs and faces', () => {
  const base = specimen(11);
  const {guides:candidates} = identifyTrunkSkeleton(baseBranchShapingAnalysisInput(base),BASE_BRANCH_SHAPING_OPTIONS);
  const draft = createBaseBranchShaping(base,{candidates}), [main] = draft.guides;
  assert.ok(main.points.length > 2);
  const source = baseBranchGeometry({base}), rest = draft.preview(draft.guides);
  const tip = main.points.length - 1;
  const posed = draft.movePoints(draft.guides,[{guide:main.id,index:0},{guide:main.id,index:1},{guide:main.id,index:tip}],[0,.035,.025]);
  assert.deepEqual(posed[0].points.slice(0,2),main.points.slice(0,2));
  close(posed[0].points[tip],vector(main.points[tip]).add(new THREE.Vector3(0,.035,.025)).toArray());
  const live = draft.preview(posed);
  const variant = normalizePlantBaseBranch(draft.bake(posed,{id:'TEST_VARIANT',name:'弯梢试样'}));
  const reloaded = normalizePlantBaseBranch(JSON.parse(JSON.stringify(variant)));
  const reopened = createBaseBranchShaping(reloaded,{candidates:[]});
  const finished = reopened.preview(reopened.guides);
  try {
    for (const attribute of ['position','normal','uv']) assert.deepEqual(rest.attributes[attribute].array,source.attributes[attribute].array);
    assert.deepEqual(rest.index.array,source.index.array);
    assert.notDeepEqual(live.attributes.position.array,source.attributes.position.array);
    assert.deepEqual(live.attributes.uv.array,source.attributes.uv.array);
    assert.deepEqual(live.index.array,source.index.array);
    assert.deepEqual(reloaded.geometry.index,base.geometry.index);
    assert.deepEqual(reloaded.geometry.uv,base.geometry.uv);
    assert.equal(reloaded.variant_from.base_id,base.id);
    assert.ok(reloaded.geometry.normal.every(Number.isFinite));
    close(finished.attributes.position.array,live.attributes.position.array,2e-7);
    close(reopened.guides[0].points[tip],posed[0].points[tip]);
    for (let i = 0; i < source.attributes.position.count; i++) {
      if (source.attributes.position.getX(i) < .005) {
        close(Array.from(live.attributes.position.array.slice(i * 3,i * 3 + 3)),Array.from(source.attributes.position.array.slice(i * 3,i * 3 + 3)));
      }
    }
  } finally { for (const geometry of [source,rest,live,finished]) geometry.dispose(); }
});

test('the actual forked base 13 moves one fork independently and carries downstream child paths at the same attachment stations', () => {
  const base = specimen(13), draft = createBaseBranchShaping(base);
  const [main,fork] = draft.guides;
  const sibling = draft.guides.find(guide => guide.parent === main.id && guide.id !== fork.id);
  const child = draft.guides.find(guide => guide.parent === fork.id);
  assert.ok(sibling && child);
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.19);
  const posed = draft.rotateAfter(draft.guides,{guide:fork.id,index:0},turn);
  const guides = new Map(posed.map(guide => [guide.id,guide]));
  assert.deepEqual(guides.get(main.id).points,main.points);
  assert.deepEqual(guides.get(sibling.id).points,sibling.points);
  assert.deepEqual(guides.get(fork.id).points[0],fork.points[0]);
  assert.notDeepEqual(guides.get(fork.id).points.at(-1),fork.points.at(-1));
  assert.notDeepEqual(guides.get(child.id).points[0],child.points[0]);
  close(guides.get(child.id).points[0],restParameter(fork.points,guides.get(fork.id).points,child.attach));
  const preview = draft.preview(posed), source = draft.preview(draft.guides);
  try {
    assert.notDeepEqual(preview.attributes.position.array,source.attributes.position.array);
    const moved = preview.attributes.position.array.filter((value,i) => Math.abs(value - source.attributes.position.array[i]) > 1e-6);
    assert.ok(moved.length > 30 && moved.length < preview.attributes.position.array.length);
    const variant = draft.bake(posed,{id:'TEST_FORK',name:'分叉试样'});
    assert.equal(variant.shape_guides.length,draft.guides.length);
    assert.deepEqual(variant.geometry.index,base.geometry.index);
    assert.deepEqual(variant.geometry.uv,base.geometry.uv);
  } finally { preview.dispose(); source.dispose(); }
});

test('the default platanus 11 tip supports local thickness and rotates around its preceding point', () => {
  const base = specimen(11), draft = createBaseBranchShaping(base), [main] = draft.guides;
  const index = main.points.length - 1, tip = {guide:main.id,index};
  const selection = [tip,tip];
  assert.equal(draft.canScaleThickness(main.id,index),true);
  assert.equal(draft.scaleThickness(draft.guides,selection,1),draft.guides);
  const thicker = draft.scaleThickness(draft.guides,selection,1.8);
  assert.equal(draft.isRest(thicker),false);
  assert.equal(thicker[0].points,main.points);
  assert.equal(thicker[1],draft.guides[1]);
  assert.deepEqual(thicker[0].radialFactors,[...main.points.slice(1).map(() => 1),1.8]);
  assert.equal(draft.isRest(draft.scaleThickness(thicker,[tip],1 / 1.8)),true);
  const pivot = draft.rotationPivot(main.id,index);
  assert.equal(pivot,index - 1);
  assert.equal(draft.rotationPivot(main.id,0),null);
  assert.equal(draft.rotationPivot(main.id,index + 1),null);
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),.17);
  const rotated = draft.rotateAfter(thicker,tip,turn);
  assert.deepEqual(rotated[0].points.slice(0,index),main.points.slice(0,index));
  close(rotated[0].points[index],vector(main.points[index]).sub(vector(main.points[pivot])).applyQuaternion(turn).add(vector(main.points[pivot])).toArray());
  assert.equal(rotated[0].radialFactors,thicker[0].radialFactors);
  const source = draft.preview(draft.guides), preview = draft.preview(thicker);
  const baked = draft.bake(thicker,{id:'TEST_THICK_TIP',name:'粗枝梢试样'});
  const reopened = createBaseBranchShaping(normalizePlantBaseBranch(baked));
  const saved = reopened.preview(reopened.guides);
  try {
    const a = source.attributes.position, b = preview.attributes.position;
    const points = main.points.map(vector), pivotPoint = points[pivot], tipPoint = points[index];
    const axis = tipPoint.clone().sub(pivotPoint).normalize();
    let affected = 0, root = 0;
    for (let i = 0; i < a.count; i++) {
      const before = new THREE.Vector3().fromBufferAttribute(a,i), after = new THREE.Vector3().fromBufferAttribute(b,i);
      if (before.x < .005) { root++; close(before.toArray(),after.toArray()); }
      if (before.distanceTo(after) <= 1e-6) continue;
      affected++;
      assert.ok(Math.abs(after.clone().sub(before).dot(axis)) < 1e-7);
      const distance = p => p.clone().sub(pivotPoint).cross(axis).length();
      assert.ok(distance(after) > distance(before));
    }
    assert.ok(root > 0 && affected > 15 && affected < a.count / 3);
    assert.deepEqual(preview.attributes.uv.array,source.attributes.uv.array);
    assert.deepEqual(preview.index.array,source.index.array);
    assert.equal(baked.shape_guides[0].end_radius,main.end_radius * 1.8);
    assert.equal(baked.shape_guides[0].start_radius,main.start_radius);
    assert.equal(baked.shape_guides[0].radialFactors,undefined);
    close(saved.attributes.position.array,preview.attributes.position.array,2e-7);
    close(saved.attributes.normal.array,preview.attributes.normal.array,2e-7);
  } finally { for (const geometry of [source,preview,saved]) geometry.dispose(); }
});

test('thickening a side fork of the actual platanus 13 stays near the selected fork', () => {
  const base = specimen(13), draft = createBaseBranchShaping(base), [main,fork] = draft.guides;
  const index = 2, point = {guide:fork.id,index};
  const thicker = draft.scaleThickness(draft.guides,[point],1.5);
  assert.equal(thicker[0],main);
  assert.equal(thicker[1].points,fork.points);
  assert.ok(thicker.slice(2).every((guide,i) => guide === draft.guides[i + 2]));
  const source = draft.preview(draft.guides), preview = draft.preview(thicker);
  try {
    const a = source.attributes.position, b = preview.attributes.position;
    const paths = draft.guides.map(guide => guide.points.map(vector));
    let affected = 0;
    for (let i = 0; i < a.count; i++) {
      const before = new THREE.Vector3().fromBufferAttribute(a,i), after = new THREE.Vector3().fromBufferAttribute(b,i);
      if (before.distanceTo(after) <= 1e-6) continue;
      affected++;
      const nearest = paths.map(path => sampleAxis(path,nearestAxis(path,before)).distanceToSquared(before));
      const guide = draft.guides[nearest.indexOf(Math.min(...nearest))];
      assert.ok(guide === fork || guide.parent === fork.id, 'only the chosen fork and grafts move');
    }
    assert.ok(affected > 30 && affected < a.count / 3);
    const baked = draft.bake(thicker,{id:'TEST_THICK_FORK',name:'粗分叉试样'});
    assert.deepEqual(baked.geometry.index,base.geometry.index);
    assert.deepEqual(baked.geometry.uv,base.geometry.uv);
    const child = baked.shape_guides.find(guide => guide.parent === fork.id && guide.attach > .4);
    assert.ok(child.start_radius > draft.guides.find(guide => guide.id === child.id).start_radius);
  } finally { preview.dispose(); source.dispose(); }
});

for (const number of [11,13]) {
  test(`the platanus ${number} root thickness changes the cut and tapers away from the fixed collar`, () => {
    const base = specimen(number), draft = createBaseBranchShaping(base), [main,fork] = draft.guides;
    const root = {guide:main.id,index:0}, collar = {guide:main.id,index:1};
    assert.equal(draft.canEditPoint(main.id,0),false);
    assert.equal(draft.canEditPoint(main.id,1),false);
    assert.equal(draft.canRotateAfter(main.id,0),false);
    assert.equal(draft.canScaleThickness(main.id,0),true);
    assert.equal(draft.canScaleThickness(main.id,1),true);
    assert.equal(draft.canScaleThickness(fork.id,0),false);
    assert.equal(draft.scaleThickness(draft.guides,[root],1),draft.guides);
    const thicker = draft.scaleThickness(draft.guides,[root],1.75);
    assert.deepEqual(draft.scaleThickness(draft.guides,[collar],1.75),thicker);
    assert.deepEqual(draft.scaleThickness(draft.guides,[root,collar],1.75),thicker);
    assert.equal(thicker[0].points,main.points);
    assert.equal(thicker[1],fork);
    assert.deepEqual(thicker[0].radialFactors.slice(0,3),[1.75,1.75,1]);
    assert.equal(draft.isRest(draft.scaleThickness(thicker,[root],1 / 1.75)),true);
    const thin = draft.scaleThickness(draft.guides,[root],.5);
    const tip = {guide:main.id,index:main.points.length - 1};
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),.1);
    const rotated = draft.rotateAfter(thicker,tip,turn);
    const source = draft.preview(draft.guides), preview = draft.preview(thicker);
    const thinPreview = draft.preview(thin), rotatedPreview = draft.preview(rotated);
    const baked = draft.bake(rotated,{id:'TEST_THICK_ROOT',name:'粗枝根试样'});
    const reopened = createBaseBranchShaping(normalizePlantBaseBranch(baked));
    const saved = reopened.preview(reopened.guides);
    try {
      assert.deepEqual(rotated[0].points.slice(0,2),main.points.slice(0,2));
      assert.equal(baked.shape_guides[0].start_radius,main.start_radius * 1.75);
      assert.ok(Math.abs(reopened.guides[0].start_radius - main.start_radius * 1.75) < 1e-10);
      assert.deepEqual(baked.geometry.index,base.geometry.index);
      assert.deepEqual(baked.geometry.uv,base.geometry.uv);
      const start = vector(main.points[0]), axis = vector(main.points[1]).sub(start);
      const collarLength = axis.length();
      axis.normalize();
      const taperEnd = vector(main.points[2]).sub(start).dot(axis);
      const a = source.attributes.position, b = preview.attributes.position, c = thinPreview.attributes.position;
      let collarVertices = 0, taperVertices = 0, farVertices = 0;
      for (let i = 0; i < a.count; i++) {
        const before = new THREE.Vector3().fromBufferAttribute(a,i).sub(start);
        const after = new THREE.Vector3().fromBufferAttribute(b,i).sub(start);
        const along = before.dot(axis), radius = before.clone().cross(axis).length();
        assert.ok(Math.abs(after.dot(axis) - along) < 1e-7);
        if (radius < 1e-7) continue;
        const ratio = after.clone().cross(axis).length() / radius;
        if (along < collarLength - .001) {
          collarVertices++;
          assert.ok(Math.abs(ratio - 1.75) < 1e-6);
          const reduced = new THREE.Vector3().fromBufferAttribute(c,i).sub(start);
          assert.ok(Math.abs(reduced.cross(axis).length() / radius - .5) < 1e-6);
          close(after.toArray(),new THREE.Vector3().fromBufferAttribute(rotatedPreview.attributes.position,i).sub(start).toArray());
        } else if (along < taperEnd - .001 && ratio > 1.1 && ratio < 1.6) taperVertices++;
        else if (along > taperEnd + .03) {
          farVertices++;
          close(before.toArray(),after.toArray());
        }
      }
      assert.ok(collarVertices > 100 && taperVertices > 10 && farVertices > a.count / 2);
      close(saved.attributes.position.array,rotatedPreview.attributes.position.array,2e-7);
      close(saved.attributes.normal.array,rotatedPreview.attributes.normal.array,2e-7);
    } finally { for (const geometry of [source,preview,thinPreview,rotatedPreview,saved]) geometry.dispose(); }
  });
}
