import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {sampleUnitPaintStroke,acceptsUnitPaintPoint,unitPaintOccupied,unitPaintRole,commitPaintedUnits} from '../web/unit-paint-data.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {resizeAssemblyInstances} from '../web/branch-assembly.js';
import {buildBranchAsset,disposeBranchAsset} from '../web/branch-kernel.js';
import {prepareUnitCombEntries,combUnitInstance,advanceUnitCombEntries} from '../web/unit-instance-combing.js';

test('paint samples depend on travelled distance rather than mouse event frequency',()=>{
 const walk=events=>{let p=[0,0],out=[];for(const e of events){const next=sampleUnitPaintStroke(p,e);out.push(...next.points);p=next.last;}return out;};
 assert.deepEqual(walk([[120,0]]),walk(Array.from({length:120},(_,n)=>[n+1,0])));
 assert.deepEqual(sampleUnitPaintStroke([12,2],[12,2]).points,[]);
 assert.deepEqual(sampleUnitPaintStroke(null,[20,20]).points,[[20,20]]);
});
test('paint spacing is in metres and includes both saved and current-pen anchors',()=>{
 const a={branch_instances:[{parent:'ROOT',attach:.5}]},branches=[{stableId:'ROOT',points:[new T.Vector3(),new T.Vector3(0,0,4)]}],occupied=unitPaintOccupied(a,branches);
 assert.equal(occupied[0].z,2);assert(!acceptsUnitPaintPoint(new T.Vector3(0,.2,2),occupied,.3));assert(acceptsUnitPaintPoint(new T.Vector3(0,.3,2),occupied,.3));
 occupied.push(new T.Vector3(0,0,3));assert(!acceptsUnitPaintPoint(new T.Vector3(0,0,3),occupied,.3));assert(!acceptsUnitPaintPoint(new T.Vector3(NaN,0,3),occupied,.3));
});
test('painted units retain source version and whole-unit boundaries and survive automatic density changes',()=>{
 const shape={branches:[{id:'WOOD',points:[[0,0,0],[1,0,0]],start_radius:.01,end_radius:.002}]},source={id:'SAMPLE',name:'完整单元枝',revision:2,shape,sample:{settings:{seed:42},authoring:{},leaf_meshes:[]}},a=normalizeAuthoring({branch_library:[source],workbench:{assembly_scale:{overall:1.5}}}),item=a.branch_library[0],before=JSON.stringify(item);
 const i={id:'PAINT_1',asset_id:item.id,linked:true,pinned_revision:2,parent:'ROOT',attach:.5,shootRole:'MIXED',scale:1,frame:{position:[0,0,2],direction:[1,0,0],parent_position:[0,0,2],parent_tangent:[0,0,1]}};
 commitPaintedUnits(a,item,[i]);assert.equal(a.branch_instances[0].scale,1.5);assert.equal(a.branch_instances[0].assembly_manual,true);assert.equal(a.branch_instances[0].pinned_revision,2);assert.deepEqual(a.workbench.assembly_slots.MIXED,['SAMPLE']);assert.equal(JSON.stringify(item),before);assert(!Object.hasOwn(a.branch_instances[0],'leaf_edits'));
 assert.throws(()=>resizeAssemblyInstances(a.branch_instances,a.workbench.assembly_slots,a.branch_library,0,[],2200,1,a));
 assert.deepEqual(normalizeAuthoring(JSON.parse(JSON.stringify(a))).branch_instances.map(i=>i.id),['PAINT_1']);
 assert.throws(()=>commitPaintedUnits(a,item,[i]),/身份已存在/);
});
test('paint roles can follow attachment position or an explicit saved zone',()=>{assert.equal(unitPaintRole(.2),'MATURE');assert.equal(unitPaintRole(.6),'MIXED');assert.equal(unitPaintRole(.9),'YOUNG');assert.equal(unitPaintRole(.2,'YOUNG'),'YOUNG');});
test('a size pen reverses continuously with Alt from one fixed baseline, stays capped and never moves its root',()=>{
 const wood={id:'WOOD',parent:'',points:[[0,0,0],[1,0,0]],start_radius:.01,end_radius:.002},a=normalizeAuthoring({branch_shape:{branches:[{...wood,id:'ROOT',points:[[0,0,0],[0,0,4]]}]},branch_library:[{id:'A',shape:{branches:[wood]}}],branch_instances:[{id:'I',asset_id:'A',linked:true,parent:'ROOT',attach:.5,scale:1}]}),asset=buildBranchAsset({leaf_density:0,max_leaves:0,wind_strength:0},null,[],0,a);
 try{let entries=prepareUnitCombEntries({authoring:a,branches:asset.masterBranches,settings:asset.settings,selection:['I']});const root=entries[0].frame.position.clone(),original=JSON.stringify(a);
 const step=(mode,distance)=>{const update=combUnitInstance(entries[0],{effect:'SCALE',sizeMode:mode,sizeLimitPercent:20,delta:new T.Vector3(distance,0,0),worldRadius:1,strength:1});if(update)entries=advanceUnitCombEntries(entries,[update]);assert(entries[0].frame.position.distanceTo(root)<1e-10);return entries[0].instance.scale;};
 const grown=step('GROW',.1);assert(grown>1);assert(step('SHRINK',.025)<grown);assert(Math.abs(step('SHRINK',.075)-1)<1e-10);assert.equal(step('GROW',100),1.2);assert.equal(step('SHRINK',100),.8);assert.equal(step('SHRINK',100),.8);assert.equal(JSON.stringify(a),original);
 }finally{disposeBranchAsset(asset);}
});
