import test from 'node:test';
import assert from 'node:assert/strict';
import { findAssemblyGaps } from '../web/assembly-coverage.js';
import { redistributeAssembly, recordGeneratedPlacements } from '../web/assembly-distribution.js';
import { seedAssemblyInstances, resizeAssemblyInstances } from '../web/branch-assembly.js';
const bone=(id,parentId,order,x,z,length=1,extra={})=>({id,stableId:'B'+id,parentId,order,length,points:[[x,0,z],[x,0,z+length]],...extra});
const shape={connector:{position:[0,0,0]},branches:[{points:[[0,0,0],[1,0,0]],start_radius:.02,end_radius:.01}]};
const library=['A','B','C'].map(id=>({id,revision:1,sample:{},shape})),slots={MATURE:['A'],MIXED:['B'],YOUNG:['C']};
const branches=()=>[bone(0,-1,0,0,0,4),bone(1,0,1,-2,1),...Array.from({length:8},(_,n)=>bone(n+2,0,3,n+1,3+n/10))];
const state=()=>({branch_library:library,branch_instances:Array.from({length:30},(_,n)=>({id:'I'+n,parent:'B1',attach:.1+n*.02,asset_id:['A','B','C'][n%3],linked:true,shape,shootRole:['MATURE','MIXED','YOUNG'][n%3],scale:.5+n/30,radius_scale:1.3,angle:35,azimuth:n*7,roll:0,variation:0,seed:n+1})),overrides:{},sculpt_layers:[],manual_branches:[],topology:{},workbench:{}});

test('initial generation prioritizes all terminal levels and keeps calibrated full-unit size',()=>{
 const bs=branches();bs.push(bone(20,1,3,20,5,1,{instanceId:'UNIT'}),bone(21,20,3,21,5));
 const seeded=seedAssemblyInstances(bs,slots,library,8);assert.equal(seeded.length,8);assert.ok(seeded.every(i=>!['B0','B1','B20','B21'].includes(i.parent)));assert.ok(seeded.every(i=>i.scale===1&&i.attach===.82));
});
test('normal regeneration fixes gaps at fixed count and class quotas, then stabilizes',()=>{
 const a=state(),bs=branches(),before=structuredClone(a.branch_instances);recordGeneratedPlacements(a,before.map(i=>i.id));
 const r=redistributeAssembly(a,bs,slots);assert.equal(r.moved.length,8);assert.equal(a.branch_instances.length,before.length);assert.equal(findAssemblyGaps(bs,a.branch_instances).length,0);
 for(let n=0;n<before.length;n++){for(const key of ['id','asset_id','scale','radius_scale','shape','shootRole'])assert.deepEqual(a.branch_instances[n][key],before[n][key]);}
 assert.ok(a.branch_instances.some(i=>i.parent==='B1'));const saved=JSON.parse(JSON.stringify(a));assert.equal(redistributeAssembly(saved,bs,slots).moved.length,0);
});
test('manual placements, local edits, arrays, copies and unknown provenance are protected',()=>{
 const a=state(),bs=branches();recordGeneratedPlacements(a,a.branch_instances.map(i=>i.id));
 a.branch_instances[0].angle+=5;a.overrides['I1.BRANCH']={radius:2};a.branch_instances[2].array_id='GROUP';a.branch_instances[3].linked=false;
 a.manual_branches=[{parent:'I4.BRANCH'}];a.leaf_edits={added:[{parent:'I5.BRANCH'}],removed:[]};
 delete a.workbench.assembly_distribution.placements.I6;const originals=a.branch_instances.slice(0,7).map(i=>structuredClone(i));
 const r=redistributeAssembly(a,bs,slots);assert.equal(r.moved.length,8);assert.deepEqual(a.branch_instances.slice(0,7),originals);
 const unknown=state();assert.equal(redistributeAssembly(unknown,bs,slots).moved.length,0);
});
test('insufficient movable instances keep count and do not strip another carrier',()=>{
 const a=state();a.branch_instances=a.branch_instances.slice(0,1);recordGeneratedPlacements(a,['I0']);const r=redistributeAssembly(a,branches(),slots);assert.equal(r.moved.length,0);assert.equal(r.unfilled,8);assert.equal(a.branch_instances.length,1);
});
test('quantity increase uses empty tips before repeating occupied carriers',()=>{
 const a=state(),bs=branches(),single={MATURE:['A'],MIXED:[],YOUNG:[]};a.branch_instances=a.branch_instances.filter(i=>i.asset_id==='A');
 const next=resizeAssemblyInstances(a.branch_instances,single,library,a.branch_instances.length+3,bs,1000,50);assert.equal(next.length,a.branch_instances.length+3);assert.ok(next.slice(-3).every(i=>i.parent!=='B1'&&i.scale===1&&i.attach===.82));
});
