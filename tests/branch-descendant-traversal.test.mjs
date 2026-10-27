import test from 'node:test';
import assert from 'node:assert/strict';
import {descendants,selectionRoots} from '../web/branch-selection.js';
test('descendant traversal handles reverse topology, cycles, overlapping roots and empty selection without expanding the scope',()=>{
 const branches=Array.from({length:80},(_,id)=>({id,stableId:'B'+id,parentId:id-1})).reverse();
 const selected=new Set(['B12','B30']),actual=descendants(branches,selected);
 assert.deepEqual([...actual].sort(),Array.from({length:68},(_,i)=>'B'+(12+i)).sort());assert.deepEqual([...selected],['B12','B30']);assert.deepEqual(selectionRoots(branches,actual).map(b=>b.stableId),['B12']);
 const cycle=[{id:1,stableId:'A',parentId:2},{id:2,stableId:'B',parentId:1},{id:3,stableId:'C',parentId:2}];assert.deepEqual([...descendants(cycle,new Set(['A']))].sort(),['A','B','C']);
 assert.equal(descendants(branches,new Set()).size,0);assert.deepEqual(selectionRoots(branches,new Set()),[]);assert.deepEqual([...descendants(branches,new Set(['ABSENT']))],['ABSENT']);
});
