import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewLocalBranchField as preview} from '../web/local-branch-edit.js';

test('local relative previews use the starting values and preserve unrelated mixed properties', () => {
  const before={overrides:{A:{length:2,leaf_density:3,rotation:[10,20,30]},B:{length:4,leaf_density:5,hidden:true}}};
  const next=structuredClone(before);
  preview(next,before,['A','B'],'localLeaves',2,true);
  preview(next,before,['A','B'],'localLeaves',3,true);
  assert.deepEqual(next.overrides,{A:{...before.overrides.A,leaf_density:9},B:{...before.overrides.B,leaf_density:15}});
  preview(next,before,['A','B'],'localLeaves',1,true);
  assert.deepEqual(next,before);
});
test('single vector component and absolute mixed edits retain the other components', () => {
  const before={overrides:{A:{rotation:[10,20,30],radius:2},B:{rotation:[40,50,60]}}},next=structuredClone(before);
  preview(next,before,['A','B'],'localRotZ',15,true);
  assert.deepEqual(next.overrides.A.rotation,[10,20,45]);
  assert.deepEqual(next.overrides.B.rotation,[40,50,75]);
  preview(next,before,['A','B'],'localRadius',3,false);
  assert.deepEqual(next.overrides,{A:{...before.overrides.A,radius:3},B:{...before.overrides.B,radius:3}});
});
test('returning an unedited branch to default leaves no empty override', () => {
  const before={overrides:{}},next=structuredClone(before);
  preview(next,before,['A'],'localLength',2,false);
  preview(next,before,['A'],'localLength',1,false);
  assert.deepEqual(next,before);
});
