import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {prepareUnitErase,unitEraseHits,commitErasedUnits} from '../web/unit-paint-erase.js';
import {normalizeAuthoring} from '../web/authoring-state.js';

const branch=(owner,x,parent=null)=>({id:owner+'.WOOD',stableId:owner+'.WOOD',instanceId:owner,parentId:parent,points:[new T.Vector3(x,0,0),new T.Vector3(x+10,0,0)]});
const fixture=()=>({authoring:normalizeAuthoring({branch_library:[{id:'SOURCE',revision:2,shape:{branches:[{id:'WOOD',points:[[0,0,0],[1,0,0]],start_radius:.01,end_radius:.001}]}}],branch_instances:[{id:'A',asset_id:'SOURCE',linked:true,parent:'ROOT',attach:.5},{id:'B',asset_id:'SOURCE',linked:true,parent:'A.WOOD',attach:.5},{id:'C',asset_id:'SOURCE',linked:true,parent:'ROOT',attach:.8}]}),branches:[branch('A',0),branch('B',30,'A.WOOD'),branch('C',60)]});
const project=p=>({x:p.x,y:p.y,z:0});
test('erase tests full woody segments and organ samples, resolving to the complete owning model',()=>{
 const f=fixture(),plan=prepareUnitErase({...f,placements:[{branchStableId:'B.WOOD',position:new T.Vector3(100,100,0)}]});
 assert.deepEqual(unitEraseHits(plan.entries,[5,0],1,project).map(e=>e.id),['A']);
 assert.deepEqual(unitEraseHits(plan.entries,[100,100],1,project).map(e=>e.id),['B']);
 assert.equal(unitEraseHits(plan.entries,[999,999],1,project).length,0);
 assert.equal(unitEraseHits(plan.entries,[5,0],1,p=>({...project(p),behind:true})).length,0);
 assert.equal(unitEraseHits(plan.entries,[5,0],1,p=>({...project(p),z:2})).length,0);
});
test('a hit child never promotes its parent; hitting the parent includes mounted children',()=>{
 const f=fixture(),plan=prepareUnitErase(f),before=JSON.stringify(f.authoring);
 assert.deepEqual([...plan.entries.find(e=>e.id==='A').family],['A','B']);
 assert.deepEqual([...plan.entries.find(e=>e.id==='B').family],['B']);
 assert.equal(JSON.stringify(f.authoring),before);
});
test('locked children and array locks protect the whole family and locked ancestors protect their descendants',()=>{
 const f=fixture();f.authoring.branch_instances[1].assembly_locked=true;
 let plan=prepareUnitErase(f);assert(plan.entries.find(e=>e.id==='A').reason);assert(plan.entries.find(e=>e.id==='B').reason);assert(!plan.entries.find(e=>e.id==='C').reason);
 f.authoring.branch_instances[1].assembly_locked=false;f.authoring.branch_instances[0].array_id='ARRAY';f.authoring.branch_arrays=[{id:'ARRAY',locked:['A']}];plan=prepareUnitErase(f);assert(plan.entries.find(e=>e.id==='A').reason);assert(plan.entries.find(e=>e.id==='B').reason);
});
test('hidden children protect parents; hidden units never become direct brush hits',()=>{
 const f=fixture(),plan=prepareUnitErase({...f,isVisible:id=>id!=='B.WOOD'});
 assert(plan.entries.find(e=>e.id==='A').reason);assert(!plan.entries.find(e=>e.id==='B'));
 assert(!plan.entries.find(e=>e.id==='C').reason);
});
test('hidden organ attachments cannot hit a partly isolated complete unit',()=>{
 const f=fixture();f.branches.push({...branch('C',200),id:'C.HIDDEN',stableId:'C.HIDDEN'});
 const plan=prepareUnitErase({...f,isVisible:id=>id!=='C.HIDDEN',placements:[{branchStableId:'C.HIDDEN',position:new T.Vector3(200,200,0)}]});
 assert.equal(unitEraseHits(plan.entries,[200,200],1,project).length,0);
 assert.deepEqual(unitEraseHits(plan.entries,[65,0],1,project).map(e=>e.id),['C']);
});
test('explicit carrier scope includes mounted descendants, while an empty carrier scope stays empty',()=>{
 const f=fixture();assert.deepEqual(prepareUnitErase({...f,carriers:new Set()}).entries,[]);
 assert.equal(prepareUnitErase({...f,carriers:new Set(['ROOT'])}).entries.length,3);
 assert.equal(prepareUnitErase({...f,carriers:new Set(['UNRELATED'])}).entries.length,0);
});
test('erase cleans local edits and array slots without deleting or changing the reusable source',()=>{
 const f=fixture(),a=f.authoring,before=JSON.stringify(a.branch_library);a.workbench={};a.branch_instances[2].array_id='ARRAY';a.branch_arrays=[{id:'ARRAY',removed:[],locked:[]}];
 a.overrides['A.WOOD']={radius:2};a.manual_branches.push({id:'MANUAL',parent:'B.WOOD'});a.leaf_edits.added.push({id:'FRUIT',parent:'MANUAL'});a.workbench.assembly_scale={records:{A:{scale:1},B:{scale:2},C:{scale:1}}};
 assert.equal(commitErasedUnits(a,new Set(['A','B'])),2);assert.deepEqual(a.branch_instances.map(i=>i.id),['C']);assert(!a.overrides['A.WOOD']);assert(!a.manual_branches.length);assert(!a.leaf_edits.added.length);assert(!a.workbench.assembly_scale.records.A);assert.equal(JSON.stringify(a.branch_library),before);
 assert.equal(commitErasedUnits(a,new Set(['C'])),1);assert.deepEqual(a.branch_arrays[0].removed,['C']);assert.equal(JSON.stringify(a.branch_library),before);
 assert.equal(commitErasedUnits(a,new Set()),0);
});
test('a mixed legacy child blocks parent deletion rather than leaving an orphan',()=>{
 const f=fixture();f.branches.push(branch('OLD_COPY',80,'A.WOOD'));const plan=prepareUnitErase(f);
 assert.match(plan.entries.find(e=>e.id==='A').reason,/旧复制/);
});
