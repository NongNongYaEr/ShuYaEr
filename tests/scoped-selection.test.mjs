import test from 'node:test';
import assert from 'node:assert/strict';
import { combineScopedSelection } from '../web/scoped-selection.js';
import { resolveBranchEditScope } from '../web/branch-edit-scope.js';
const bs=[{id:0,stableId:'A',parentId:-1},{id:1,stableId:'A1',parentId:0},{id:2,stableId:'A2',parentId:1},{id:3,stableId:'B',parentId:-1}];
test('subtracting a child under a selected parent actually removes it and descendants from scope',()=>{
 const r=combineScopedSelection(bs,new Set(['A']),new Set(['A1']),'SUBTRACT',true);
 assert.deepEqual([...r.ids],['A']);assert.deepEqual([...r.excluded],['A1','A2']);
 assert.deepEqual([...resolveBranchEditScope(bs,r.ids,'SELECTED',{excluded:r.excluded})],['A']);
 const added=combineScopedSelection(bs,r.ids,new Set(['A1']),'ADD',true,r.excluded);
 assert.equal(added.excluded.size,0);assert.deepEqual([...resolveBranchEditScope(bs,added.ids,'SELECTED',{excluded:added.excluded})],['A','A1','A2']);
});
test('add retains previous roots, subtract removes explicit roots, replace clears old exclusions',()=>{
 const r=combineScopedSelection(bs,new Set(['A']),new Set(['B']),'ADD',true);
 assert.deepEqual([...r.ids],['A','B']);
 const sub=combineScopedSelection(bs,r.ids,new Set(['A']),'SUBTRACT',true);assert.deepEqual([...sub.ids],['B']);assert.equal(sub.excluded.size,0);
 const replaced=combineScopedSelection(bs,r.ids,new Set(['A1']),'REPLACE',true,new Set(['A1']));assert.deepEqual([...replaced.ids],['A1']);assert.equal(replaced.excluded.size,0);
});
test('direct-only subtraction does not implicitly remove selected children',()=>{
 const r=combineScopedSelection(bs,new Set(['A','A1']),new Set(['A']),'SUBTRACT',false);
 assert.deepEqual([...r.ids],['A1']);assert.equal(r.excluded.size,0);
});
