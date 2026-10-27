import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { resolveBranchEditScope, cutHasProtectedChildren } from '../web/branch-edit-scope.js';
import { createSculptSnapshot, regionWeights, deformTree } from '../web/tree-sculpt.js';

const branch = (id, parentId, z, extra = {}) => {
  const points = [0, 1, 2, 3].map(x => new THREE.Vector3(x, 0, z));
  return { id, stableId: 'B' + id, parentId, parentT: .5, points, controlPoints: points, order: 1, startRadius: .01, length: 3, ...extra };
};
const fixture = () => [branch(0,-1,0),branch(1,0,1),branch(2,1,2),branch(3,0,1),branch(4,2,2,{instanceId:'I'}),branch(5,4,3)];
test('selection scope expands only selected subtrees and excludes complete-unit internals', () => {
  const bs=fixture(), selected=new Set(['B1']);
  assert.deepEqual([...resolveBranchEditScope(bs,selected,'SELECTED',{protectUnits:true})],['B1','B2']);
  assert.deepEqual([...resolveBranchEditScope(bs,selected,'DIRECT')],['B1']);
  assert.equal(resolveBranchEditScope(bs,new Set(),'SELECTED').size,0);
  assert.equal(resolveBranchEditScope(bs,new Set(),'ALL',{protectUnits:true}).size,4);
  assert.deepEqual([...resolveBranchEditScope(bs,selected,'SELECTED',{protectUnits:true,editable:id=>id!=='B2'})],['B1']);
});
test('large sculpt brush leaves overlapping unselected sibling unchanged; children follow rigidly in direct mode', () => {
  const bs=fixture(),snapshot=createSculptSnapshot(bs),targets=resolveBranchEditScope(bs,new Set(['B1']),'DIRECT');
  const weights=regionWeights(snapshot,p=>({x:p.x,y:0,clip:0,depth:0}),[1,0],{radius:100,hardness:1,scope:'SCREEN',selectedOnly:true,selectedIds:targets});
  const updated=deformTree(snapshot,weights,new THREE.Vector3(0,1,0),'GRAB',{strength:1,preserveLength:0});
  assert.notDeepEqual(updated.get(1).points,snapshot.get(1).points);
  assert.equal(updated.get(3),snapshot.get(3));
  assert.equal(updated.get(0),snapshot.get(0));
  for(const id of [2,4,5]){
    const a=snapshot.get(id).controlPoints,b=updated.get(id).controlPoints;
    for(let i=1;i<a.length;i++) assert.ok(Math.abs(a[0].distanceTo(a[i])-b[0].distanceTo(b[i]))<1e-9);
  }
});
test('direct cut refuses removal of unselected children; subtree cut can remove its selected descendants', () => {
  const bs=fixture(),b=bs[1];
  bs[2].points[0].set(1.5,0,1);
  assert.ok(cutHasProtectedChildren(bs,b,.4,new Set(['B1'])));
  assert.ok(!cutHasProtectedChildren(bs,b,.7,new Set(['B1'])));
  assert.ok(!cutHasProtectedChildren(bs,b,.4,new Set(['B1','B2'])));
  assert.ok(cutHasProtectedChildren(bs,b,0,new Set(['B1'])));
});
