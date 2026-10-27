import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createBranchOutlineBatch} from '../web/branch-outline-batch.js';
const points=values=>values.map(p=>new THREE.Vector3(...p));
const drawn=batch=>Array.from(batch.object.geometry.attributes.position.array.slice(0,batch.object.geometry.drawRange.count*3));
test('outline batching preserves exact per-branch segments without joining independent branches or altering source vectors',()=>{
  const material=new THREE.LineBasicMaterial(),batch=createBranchOutlineBatch(material),a=points([[0,0,0],[1,0,0],[2,1,0]]),b=points([[10,0,0],[10,0,1]]),original=a.map(p=>p.toArray());try{assert.equal(batch.update([{id:'A',points:a},{id:'B',points:b}]),true);assert.equal(batch.object.isLineSegments,true);assert.deepEqual(drawn(batch),[0,0,0,1,0,0,1,0,0,2,1,0,10,0,0,10,0,1]);assert.deepEqual(a.map(p=>p.toArray()),original);assert.deepEqual(batch.object.userData.branch_ranges,[{id:'A',offset:0,count:4},{id:'B',offset:4,count:2}]);assert.equal(batch.object.raycast({},[]),undefined);}finally{batch.dispose();material.dispose();}
});
test('unchanged selection retains buffers; transform and point edits update only affected ranges and selection changes keep valid bounds',()=>{
  const material=new THREE.LineBasicMaterial(),batch=createBranchOutlineBatch(material),a=points([[0,0,0],[1,0,0]]),b=points([[0,0,1],[0,0,2]]),matrix=new THREE.Matrix4().makeTranslation(2,3,4);try{batch.update([{id:'A',points:a},{id:'B',points:b}]);const geometry=batch.object.geometry,version=geometry.attributes.position.version;assert.equal(batch.update([{id:'A',points:a},{id:'B',points:b}]),false);assert.equal(geometry.attributes.position.version,version);batch.update([{id:'A',points:a},{id:'B',points:b,matrix}]);assert.equal(batch.object.geometry,geometry);assert.deepEqual(geometry.attributes.position.updateRanges,[{start:6,count:6}]);assert.deepEqual(drawn(batch).slice(6),[2,3,5,2,3,6]);matrix.makeTranslation(4,5,6);assert.equal(batch.update([{id:'A',points:a},{id:'B',points:b,matrix}]),true);batch.update([{id:'B',points:b}]);assert.deepEqual(drawn(batch),[0,0,1,0,0,2]);batch.update([]);assert.equal(batch.object.visible,false);assert.equal(geometry.drawRange.count,0);assert.deepEqual(batch.object.userData.branch_ranges,[]);}finally{batch.dispose();material.dispose();}
});
