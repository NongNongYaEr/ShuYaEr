import {test} from 'node:test';
import assert from 'node:assert/strict';
import {growthTargets,growthPositions,setGrowthRule,applyGrowthRules,growthEligibility} from '../web/assembly-growth.js';
import {recordGeneratedPlacements} from '../web/assembly-distribution.js';
const branches=[{id:1,stableId:'ROOT',parentId:null},{id:2,stableId:'A',parentId:1},{id:3,stableId:'B',parentId:2},{id:4,stableId:'C',parentId:1},{id:5,stableId:'I.R',parentId:2,instanceId:'I'}];
function fixture(){const a={branch_instances:Array.from({length:12},(_,n)=>({id:'I'+n,parent:n<8?'A':'B',asset_id:'sample',attach:.1+n*.05,linked:true,scale:1.7,angle:40,seed:n+1})),overrides:{},sculpt_layers:[],workbench:{},branch_library:[]};recordGeneratedPlacements(a,a.branch_instances.map(i=>i.id));return a;}
test('scope follows carrier hierarchy and excludes installed sample skeletons',()=>{
 assert.deepEqual(growthTargets(branches,'A','CURRENT'),['A']);assert.deepEqual(growthTargets(branches,'A','SUBTREE'),['A','B']);assert.deepEqual(growthTargets(branches,'A','TREE'),['ROOT','A','B','C']);
});
test('range changes actual placements, preserves geometry/scale/count, and repeats without drift',()=>{
 const a=fixture(),before=structuredClone(a.branch_instances);setGrowthRule(a,branches,['A'],{start:.4,end:.85,profile:'TIP'});
 assert(a.branch_instances.slice(0,8).every(i=>i.attach>.4&&i.attach<.85));assert.deepEqual(a.branch_instances.slice(8),before.slice(8));
 for(let n=0;n<8;n++){const {attach,frame,...actual}=a.branch_instances[n],{attach:old,...expected}=before[n];assert.deepEqual(actual,expected);}
 const saved=JSON.parse(JSON.stringify(a));assert.equal(applyGrowthRules(a,branches).moved.length,0);assert.deepEqual(a,saved);
 const extra={...before[0],id:'NEW',attach:.1};a.branch_instances.push(extra);recordGeneratedPlacements(a,['NEW']);applyGrowthRules(a,branches);assert(extra.attach>.4&&extra.attach<.85);
});
test('manual placement, sculpted sample, arrays and unknown old placement remain exact',()=>{
 const a=fixture();a.branch_instances[0].attach=.98;a.overrides['I1.R']={radius:2};a.sculpt_layers=[{branches:{'I2.R':{}}}];a.branch_instances[3].array_id='ARRAY';delete a.workbench.assembly_distribution.placements.I4;
 a.unit_editing={items:[{id:'leaf',parent:'I5.R'}]};const before=structuredClone(a.branch_instances.slice(0,6));
 assert.equal(growthEligibility(a,['A']).protectedCount,6);setGrowthRule(a,branches,['A'],{start:.5,end:.9});assert.deepEqual(a.branch_instances.slice(0,6),before);
});
test('density directions and edge taper change spacing within the range without losing units',()=>{
 const plain=growthPositions(20,{feather:0}),tip=growthPositions(20,{profile:'TIP',feather:0}),root=growthPositions(20,{profile:'ROOT',feather:0}),edge=growthPositions(20,{feather:.3});
 assert(tip.reduce((a,b)=>a+b,0)>plain.reduce((a,b)=>a+b,0));assert(root.reduce((a,b)=>a+b,0)<plain.reduce((a,b)=>a+b,0));assert(edge[0]>plain[0]);assert(edge.at(-1)<plain.at(-1));assert.equal(edge.length,20);
});
test('mixed ranges reject crossings without altering the other endpoint or any placements',()=>{
 const a=fixture();setGrowthRule(a,branches,['A'],{start:.7});const before=structuredClone(a);
 assert.throws(()=>setGrowthRule(a,branches,['A','B'],{end:.5}),/起点/);assert.deepEqual(a,before);
});
