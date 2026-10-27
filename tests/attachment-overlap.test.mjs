import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { attachmentOverlapRatio } from '../web/attachment-overlap.js';

const placement = (id, x, y=0, z=0, direction=[1,0,0]) => ({stableId:id,position:new THREE.Vector3(x,y,z),direction:new THREE.Vector3(...direction)});
// Independent all-pairs oracle: no spatial buckets or cell boundaries.
function reference(items, spacing) {
  const size=Math.max(.004,spacing), cluster=p=>String(p.stableId||'').replace(/:C\d+$/,''), node=c=>c.includes(':UNIT:')?c.replace(/:\d+$/,''):'';
  return items.length<2?0:items.filter((p,n)=>items.slice(0,n).some(q=>cluster(q)!==cluster(p)
    && !(node(cluster(p))&&node(cluster(q))===node(cluster(p))&&q.direction.dot(p.direction)<.94)
    && q.position.distanceToSquared(p.position)<size*size)).length/items.length;
}
test('overlap preserves strict spacing, negative cell boundaries, cluster and unit direction exceptions',()=>{
  const items=[placement('a',-.005),placement('b',.005),placement('c',.0049),placement('c:C1',.0049),
    placement('leaf:UNIT:1',1),placement('leaf:UNIT:2',1,0,0,[0,1,0]),placement('other',1),placement('far',2)];
  for(const spacing of [0,.004,.01,.1])assert.equal(attachmentOverlapRatio(items,spacing),reference(items,spacing));
  assert.equal(attachmentOverlapRatio([placement('a',0),placement('b',.01)],.01),0);
  assert.equal(attachmentOverlapRatio([],0),0);
});
test('spatial overlap matches all-pairs checks through repeated deformations and dense clusters',()=>{
  let seed=1037;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const items=Array.from({length:800},(_,n)=>placement(n%9===0?`leaf:UNIT:${n%4}`:`L${n}:C0`,(random()-.5)*.2,(random()-.5)*.2,(random()-.5)*.2,n%2?[1,0,0]:[0,1,0]));
  for(let stroke=0;stroke<4;stroke++){
    for(const spacing of [.004,.01,.05])assert.equal(attachmentOverlapRatio(items,spacing),reference(items,spacing));
    items.filter((_,n)=>n%3===0).forEach(p=>p.position.applyAxisAngle(new THREE.Vector3(0,0,1),.31));
  }
});
