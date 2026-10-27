import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTrunkRoots,editTrunkRootGroup,rootFieldValue,rootAngleDelta,trunkSelectionContext} from '../web/trunk-root-edit.js';
const roots=[{id:'A',angle:359,length:2,height:.3,width:30,strength:1},{id:'B',angle:80,length:5.8,height:.9,width:85,strength:.8},{id:'C',angle:190,length:1,height:.2,width:10,strength:1}];
test('root selection uses real IDs, explicit add/subtract and a genuine empty set',()=>{
 assert.deepEqual(selectTrunkRoots(roots,['A'],['B','INVALID','B'],'ADD'),['A','B']);
 assert.deepEqual(selectTrunkRoots(roots,['A'],['A'],'SUBTRACT'),[]);
 assert.deepEqual(selectTrunkRoots(roots,['A','B'],['C']),['C']);
});
test('a group length edit uses one common bounded increment and never changes unselected recipes',()=>{
 const before=structuredClone(roots),result=editTrunkRootGroup(roots,['A','B'],'length',1);
 assert.equal(result.limited,true);assert.ok(Math.abs(result.delta-.2)<1e-9);assert.ok(Math.abs(result.updates[0].length-2.2)<1e-9);assert.equal(result.updates[1].length,6);
 assert.deepEqual(result.updates.map(p=>p.id),['A','B']);assert.deepEqual(roots,before);
});
test('angle wraps at the seam while selected roots retain relative direction and metadata',()=>{
 const result=editTrunkRootGroup(roots,['A','B'],'angle',rootAngleDelta(359,1));assert.deepEqual(result.updates,[{id:'A',angle:1},{id:'B',angle:82}]);assert.equal(rootAngleDelta(1,359),-2);
 assert.deepEqual(editTrunkRootGroup(roots,['A'],'angle',360).updates,[{id:'A',angle:359}]);
});
test('height fields are displayed as along-branch percent, not world height, and batch limits are shared',()=>{
 assert.equal(rootFieldValue(roots[0],'height'),30);const result=editTrunkRootGroup(roots,['A','B'],'height',50);assert.ok(Math.abs(result.delta-10)<1e-9);assert.ok(Math.abs(result.updates[0].height-.4)<1e-9);assert.equal(result.updates[1].height,1);
 const width=editTrunkRootGroup(roots,['A','B'],'width',20);assert.equal(width.delta,5);assert.deepEqual(width.updates,[{id:'A',width:35},{id:'B',width:90}]);
});
test('empty, stale or invalid root edits cannot fall back to every root',()=>{
 for(const ids of [[],['missing']])assert.deepEqual(editTrunkRootGroup(roots,ids,'length',1).updates,[]);
 for(const value of [NaN,Infinity])assert.deepEqual(editTrunkRootGroup(roots,['A'],'angle',value).updates,[]);
 assert.deepEqual(editTrunkRootGroup(roots,['A'],'unsupported',2).updates,[]);
});
test('a zero increment keeps exact authored values rather than re-rounding each member',()=>{
 for(const field of ['angle','length','width','height']){const result=editTrunkRootGroup(roots,['A','B'],field,0);for(const p of result.updates)assert.equal(p[field],roots.find(r=>r.id===p.id)[field]);}
});
test('shared selection context distinguishes actual root, ring and point scopes and their pivots',()=>{
 const root=trunkSelectionContext({region:'ROOT',roots:{selectedIds:['A','B'],mode:'height'}});assert.equal(root.count,2);assert.match(root.constraint,/沿干/);assert.match(root.transformReason,/挂接.*尚未独立/);
 const ring=trunkSelectionContext({selectionScope:'RING',selectedSectionIds:['S','T'],sections:[{id:'S'}],section:{id:'S'}});assert.equal(ring.count,2);assert.match(ring.pivot,/各自圈中心/);
 const point=trunkSelectionContext({contourScope:'FINAL',points:{selectedCount:3}});assert.equal(point.count,3);assert.match(point.influence,/只动选点/);assert.match(point.pivot,/选点中心/);
 assert.match(trunkSelectionContext({points:{selectedCount:1}}).pivot,/截面中心/);
 assert.match(trunkSelectionContext({points:{selectedCount:0}}).transformReason,/不会隐式操作整枝/);
});
test('an explicit base flare field has its own scope even with no selected buttress',()=>{
 const base=trunkSelectionContext({region:'ROOT',roots:{selectedIds:[],field:'root_flare'}});assert.equal(base.kind,'ROOT_BASE');assert.equal(base.label,'根盘 · 整体展开');assert.match(base.influence,/板根与截面参数保持/);
});
