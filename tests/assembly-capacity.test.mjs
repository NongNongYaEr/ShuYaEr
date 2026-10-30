import test from 'node:test';
import assert from 'node:assert/strict';
import {assemblyBranchLimit,COMPLETE_ASSEMBLY_BRANCH_LIMIT} from '../web/assembly-budget.js';
import {assemblyCountCapacity,resizeAssemblyInstances} from '../web/branch-assembly.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {normalizeSettings,buildBranchReferenceCurves} from '../web/branch-kernel.js';

const shape=n=>({branches:Array.from({length:n},(_,i)=>({id:'R'+i,parent:i?'R0':'',attach:i?.5:0,points:i?[[.1,i*.02,0],[.3,i*.02,.05]]:[[0,0,0],[.4,0,0]],length:i?.21:.4,start_radius:.01,end_radius:.001}))});
const asset=(id,n)=>({id,name:id,revision:1,shape:shape(n)});
const settings=normalizeSettings({leaf_density:0,child_count:0,wind_strength:0});
function fixture(count=97){
 const a=normalizeAuthoring({recipe:{tags:['WHOLE_PLANT']},branch_shape:{branches:[{id:'C',parent:'',points:[[0,0,0],[0,0,2]],length:2,start_radius:.1,end_radius:.05},{id:'B',parent:'C',attach:.6,points:[[0,0,1.2],[1.5,0,2]],length:1.7,start_radius:.04,end_radius:.01}]},branch_library:[asset('A',21)],branch_instances:Array.from({length:count},(_,n)=>({id:'I'+n,parent:'B',asset_id:'A',linked:true,shootRole:n%10<4?'MATURE':n%10<9?'MIXED':'YOUNG',attach:.2+(n%7)*.1,angle:65,azimuth:n*137.5,scale:1,roll:n%20,assembly_manual:n<35,assembly_refined:n<35})),workbench:{assembly_slots:{MATURE:['A'],MIXED:['A'],YOUNG:['A']}}});return a;
}
test('ordinary complete-unit assemblies share the dense graph limit without a template-only flag',()=>{
 assert.equal(assemblyBranchLimit({recipe:{tags:[]},branch_instances:[]}),2200);
 assert.equal(assemblyBranchLimit({recipe:{tags:['DENSE_AUTHORED_CROWN']},branch_instances:[]}),3200);
 assert.equal(assemblyBranchLimit(fixture()),COMPLETE_ASSEMBLY_BRANCH_LIMIT);
 assert.equal(assemblyBranchLimit({recipe:{tags:[]},branch_instances:[]},{hadInstances:true}),11000);
 assert.equal(assemblyBranchLimit({recipe:{tags:['DENSE_AUTHORED_SAMPLE_ASSEMBLY']},branch_instances:[]}),11000);
});
test('97 complete models can grow beyond the old 104 ceiling without changing a previous placement',()=>{
 const a=fixture(),before=structuredClone(a),branches=buildBranchReferenceCurves(settings,a),limit=assemblyBranchLimit(a);
 assert.equal(branches.length,97*21+2);const cap=assemblyCountCapacity(a.branch_instances,a.workbench.assembly_slots,a.branch_library,limit,branches.length);assert.equal(cap.maximum,523);
 const instances=resizeAssemblyInstances(a.branch_instances,a.workbench.assembly_slots,a.branch_library,150,branches,limit,branches.length,a);
 assert.equal(instances.length,150);assert.deepEqual(instances.slice(0,97),before.branch_instances);assert.deepEqual(a,before,'planning is read-only');
 const rebuilt=buildBranchReferenceCurves(settings,{...a,branch_instances:instances});assert.equal(rebuilt.length,150*21+2);
 for(const i of instances)assert.equal(rebuilt.filter(b=>b.instanceId===i.id).length,21,'every complete model has all its branches');
});
test('capacity reserves unmanaged branches and matches actual alternating source costs exactly',()=>{
 const a=fixture(4);a.branch_library=[asset('A',3),asset('B',7)];a.workbench.assembly_slots={MATURE:['A','B'],MIXED:['A','B'],YOUNG:[]};
 a.branch_instances=a.branch_instances.map((i,n)=>({...i,shootRole:n<2?'MATURE':'MIXED'}));a.branch_instances.push({...a.branch_instances[0],id:'U',linked:false});
 const branches=buildBranchReferenceCurves(settings,a),slots=a.workbench.assembly_slots,cap=assemblyCountCapacity(a.branch_instances,slots,a.branch_library,80,branches.length);
 const accepted=resizeAssemblyInstances(a.branch_instances,slots,a.branch_library,cap.maximum,branches,80,branches.length,a);assert.equal(accepted.length,cap.maximum+1);
 const added=accepted.slice(a.branch_instances.length),cost=added.reduce((n,i)=>n+a.branch_library.find(s=>s.id===i.asset_id).shape.branches.length,0);assert(branches.length+cost<=80);
 assert.throws(()=>resizeAssemblyInstances(a.branch_instances,slots,a.branch_library,cap.maximum+1,branches,80,branches.length,a),new RegExp('上限 '+cap.maximum));
 assert.deepEqual(accepted.find(i=>i.id==='U'),a.branch_instances.at(-1));
});
test('over-capacity apply is atomic and reports requested, available and existing counts',()=>{
 const a=fixture(),before=structuredClone(a),branches=buildBranchReferenceCurves(settings,a);assert.throws(()=>resizeAssemblyInstances(a.branch_instances,a.workbench.assembly_slots,a.branch_library,524,branches,11000,branches.length,a),/目标 524 支.*上限 523 支.*当前 97 支保持不变/);assert.deepEqual(a,before);
});
test('empty slots stay explicit and protected old models cannot be removed by a lower target',()=>{
 const a=fixture(4),branches=buildBranchReferenceCurves(settings,a),slots=a.workbench.assembly_slots;
 assert.equal(assemblyCountCapacity(a.branch_instances,{MATURE:[],MIXED:[],YOUNG:[]},a.branch_library,11000,branches.length).maximum,0);
 assert.throws(()=>resizeAssemblyInstances(a.branch_instances,slots,a.branch_library,1,branches,11000,branches.length,a),/锁定或已编辑/);
});
