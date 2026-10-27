import test from 'node:test';
import assert from 'node:assert/strict';
import { planBranchDeletion } from '../web/branch-delete.js';
import { curveShortcutAction } from '../web/v4-tools.js';

const branches=[
 {id:0,stableId:'R',parentId:-1,order:0},
 {id:1,stableId:'A',parentId:0,order:1},
 {id:2,stableId:'C',parentId:1,order:2},
 {id:3,stableId:'B',parentId:0,order:1},
 {id:4,stableId:'UNIT.root',parentId:2,order:3,unitOwner:'UNIT',instanceId:'UNIT'},
 {id:5,stableId:'UNIT.tip',parentId:4,order:3,unitOwner:'UNIT'},
];
test('delete resolves selected bundles once and protects roots, unit interiors and excluded descendants',()=>{
 const p=planBranchDeletion(branches,new Set(['A','C']));assert.deepEqual(p.roots,['A']);assert.deepEqual([...p.removed],['A','C','UNIT.root','UNIT.tip']);
 assert.deepEqual(planBranchDeletion(branches,new Set(['A','B'])).roots,['A','B']);
 assert.deepEqual(planBranchDeletion(branches,new Set(['R'])).roots,[]);
 assert.deepEqual(planBranchDeletion(branches,new Set(['UNIT.root'])).roots,[]);
 assert.deepEqual(planBranchDeletion(branches,new Set(['A']),new Set(['C'])).roots,[]);
 assert.deepEqual(planBranchDeletion(branches,new Set()).roots,[]);
 const partial=planBranchDeletion(branches,new Set(['A','B']),new Set(['C']));assert.deepEqual(partial.roots,['B']);assert.equal(partial.skipped.length,1);
});
test('Delete no longer removes curve points; Shift Delete still selects the pruning brush',()=>{
 assert.equal(curveShortcutAction({code:'Delete'}),null);
 assert.equal(curveShortcutAction({code:'Delete',shiftKey:true}),'TOGGLE_PRUNE_BRUSH');
});
