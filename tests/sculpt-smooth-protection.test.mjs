import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSculptSnapshot, advanceSculptSnapshot, deformTree} from '../web/tree-sculpt.js';

test('repeated smoothing with length preservation cannot displace a full-mask or pinned control point', () => {
  const points = [[0,0,0],[.5,0,.7],[1,0,.5],[1.5,0,1.2],[2,0,1],[2.5,0,1.5]].map(p => new THREE.Vector3(...p));
  const branches = [{id:0,stableId:'A',parentId:-1,points,controlPoints:points,startRadius:.04},
    {id:1,stableId:'B',parentId:-1,points:points.map(p=>p.clone().add(new THREE.Vector3(0,2,0))),controlPoints:points.map(p=>p.clone().add(new THREE.Vector3(0,2,0))),startRadius:.04}];
  const initial = createSculptSnapshot(branches,{A:{pinned_points:[4],sculpt_mask:[0,0,1,0,0,0]}});
  let working=initial;
  for (let n=0;n<12;n++) {
    const weights = new Map([[0,[0,1,0,1,0,0]]]);
    const updated=deformTree(working,weights,new THREE.Vector3(),'SMOOTH_BRUSH',{strength:.4,preserveLength:1});
    working=advanceSculptSnapshot(working,updated);
    for (const i of [0,2,4,5]) assert.deepEqual(working.get(0).controlPoints[i],initial.get(0).controlPoints[i]);
    assert.equal(working.get(1),initial.get(1),'unselected sibling remains unchanged');
  }
  assert.notDeepEqual(working.get(0).controlPoints[1],initial.get(0).controlPoints[1],'free segment actually smooths');
});
