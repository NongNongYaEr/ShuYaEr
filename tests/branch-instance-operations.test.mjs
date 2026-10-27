import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../web/vendor/three.module.min.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { buildBranchAsset, disposeBranchAsset, normalizeSettings, deserializeGeometry } from '../web/branch-kernel.js';
import { branchInstanceOwner, selectedInstanceRoots, cloneBranchInstances, deleteBranchInstances, resetBranchInstanceEdits, moveInstanceToCarrier, rotateInstance, instanceTransformMatrix, applyInstancePlacement, applyInstanceFamilyPlacement, evaluatedInstanceFrame } from '../web/branch-instance-operations.js';
import {instanceMatrix} from '../web/branch-instance-edit.js';
import {normalizeBranchArrays,generateArrayInstances} from '../web/branch-array-data.js';
import {planAssemblyGroup} from '../web/assembly-group-data.js';
import fs from 'node:fs';

const record=(id,parent,points)=>({id,parent,attach:.5,points,length:1,start_radius:.03,end_radius:.006});
const shape={branches:[record('R1','',[[0,0,0],[1,0,0]]),record('B1','R1',[[.5,0,0],[.7,.4,.2]])]};
const fixture=()=>normalizeAuthoring({branch_shape:{branches:[record('ROOT','',[[0,0,0],[0,0,2]]),record('HOST','ROOT',[[0,0,1],[0,1,1.5]])]},branch_library:[{id:'A',name:'sample',revision:3,shape}],branch_instances:[{id:'I',asset_id:'A',linked:true,pinned_revision:3,parent:'ROOT',attach:.4,seed:20,scale:1,variation:0,array_id:'GROUP'},{id:'N',asset_id:'A',linked:true,pinned_revision:3,parent:'I.B1',attach:.7,seed:21,scale:.5,variation:0}],recipe:{tags:['WHOLE_PLANT']}});
test('instance copy remaps nested mounts and every local edit, while keeping sources, revisions and originals',()=>{
 const a=fixture();a.overrides['I.B1']={locked:true,curve_knots:[[0,0,1],[1,0,1]],curve_parent_frame:{parent:'I.R1',tangent:[1,0,0]}};
 a.sculpt_layers=[{id:'L',enabled:true,strength:1,branches:{'I.B1':{deltas:[[0,0,0],[0,0,.1]]},'HOST':{deltas:[]}},operation:{type:'POSE',targets:['I.B1','HOST'],offset:[0,0,.2]}}];
 a.unit_editing.items=[{id:'I.B1:UNIT:4',parent:'I.B1',kind:'LEAF',source_id:'LEAF_A',scale:.2,base_scale:.2,offset:[0,0,.1]}];a.unit_editing.removed=['I.R1:UNIT:gone'];
 a.leaf_edits.added=[{id:'CUSTOM_LEAF',parent:'I.B1',source:2,t:.3,scale:.1}];a.topology.suppressed=['I.B1'];
 const original=structuredClone(a),roots=selectedInstanceRoots(a,new Set(['I.B1','N.R1']));assert.equal(roots.length,1);assert.equal(roots[0].id,'I');
 let n=0;const result=cloneBranchInstances(a,roots,i=>i.id==='I'?'COPY_I':i.id==='N'?'COPY_N':'COPY_'+n++);
 assert.equal(a.branch_instances.length,4);assert.equal(result.roots[0].id,'COPY_I');
 assert.equal(a.branch_instances.find(i=>i.id==='COPY_N').parent,'COPY_I.B1');assert.equal(result.roots[0].asset_id,'A');assert.equal(result.roots[0].pinned_revision,3);assert.equal(result.roots[0].array_id,'GROUP');assert.ok(result.roots[0].assembly_manual);
 assert.deepEqual(a.branch_instances.slice(0,2),original.branch_instances);assert.deepEqual(a.overrides['I.B1'],original.overrides['I.B1']);
 assert.equal(a.overrides['COPY_I.B1'].curve_parent_frame.parent,'COPY_I.R1');assert.deepEqual(a.sculpt_layers[1].operation.targets,['COPY_I.B1']);assert.ok(!a.sculpt_layers[1].branches.HOST);
 assert.equal(a.unit_editing.items[1].parent,'COPY_I.B1');assert.equal(a.unit_editing.items[1].source_id,'LEAF_A');assert.ok(a.unit_editing.items[1].duplicate);assert.equal(a.leaf_edits.added[1].parent,'COPY_I.B1');assert.notEqual(a.leaf_edits.added[1].id,'CUSTOM_LEAF');
 assert.ok(a.topology.suppressed.includes('COPY_I.B1'));const reloaded=normalizeAuthoring(JSON.parse(JSON.stringify(a)));assert.equal(reloaded.branch_instances.length,4);assert.equal(reloaded.unit_editing.items[1].parent,'COPY_I.B1');
 deleteBranchInstances(a,result.roots);assert.deepEqual(a.branch_instances,original.branch_instances);assert.equal(a.unit_editing.items.length,1);assert.equal(a.overrides['COPY_I.B1'],undefined);assert.equal(a.workbench.assembly_voids.length,0);
});
test('cross-carrier placement transports pose and local curves; rigid rotation and uniform size remain exact',()=>{
 const a=fixture();a.branch_instances=a.branch_instances.slice(0,1);const s=normalizeSettings({leaf_density:0,wind_strength:0,child_count:0}),assets=[];
 try{const b=buildBranchAsset(s,null,[],0,a);assets.push(b);const i=a.branch_instances[0],oldParent=b.masterBranches.find(b=>b.stableId==='ROOT'),host=b.masterBranches.find(b=>b.stableId==='HOST');
 const target=moveInstanceToCarrier(i,host,oldParent,s,.7),matrix=instanceTransformMatrix(i,target,a.branch_library[0].shape,b.masterBranches,s),original=b.masterBranches.filter(b=>b.instanceId==='I');
 applyInstancePlacement(a,structuredClone(i),target,a.branch_library[0].shape,b.masterBranches,s);const moved=buildBranchAsset(s,null,[],0,a);assets.push(moved);
 for(const branch of original){const after=moved.masterBranches.find(b=>b.stableId===branch.stableId);for(let n=0;n<branch.points.length;n++)assert.ok(branch.points[n].clone().applyMatrix4(matrix).distanceTo(after.points[n])<1e-7);}
 const before=structuredClone(a.branch_instances[0]),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.45),rotated=rotateInstance(before,host,s,q),m=instanceTransformMatrix(before,rotated,a.branch_library[0].shape,moved.masterBranches,s);
 const p=new THREE.Vector3(.5,.2,1),center=host.points[0].clone().lerp(host.points.at(-1),.7);assert.ok(p.clone().sub(center).applyQuaternion(q).add(center).distanceTo(p.clone().applyMatrix4(m))<1e-7);
 }finally{assets.forEach(disposeBranchAsset);}
});
test('complete real sample copy keeps all actual leaf and flower placements, materials and GPU instances',()=>{
 const folder=new URL('../次枝资产/全植物次枝成品V1/朴树/',import.meta.url),name=fs.readdirSync(folder).find(n=>n.includes('短弯细梢')&&n.includes('混合')&&n.endsWith('.branchasset.json')),asset=JSON.parse(fs.readFileSync(new URL(name,folder))).asset;
 const geometries=[],assets=[];
 try{const sources=asset.sample.leaf_meshes.map(s=>{const geometry=deserializeGeometry(s.geometry);geometries.push(geometry);return {...s,geometry};});
 const a=normalizeAuthoring({branch_shape:{branches:[record('ROOT','',[[0,0,0],[0,0,3]])]},branch_library:[asset],branch_instances:[{id:'I',parent:'ROOT',asset_id:asset.id,linked:true,pinned_revision:asset.revision,attach:.5,scale:1,variation:0,seed:2}],recipe:{tags:['WHOLE_PLANT','SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']},tree_organs:asset.sample.authoring.tree_organs});
 const s=normalizeSettings({...asset.sample.settings,leaf_density:0,max_triangles:8000000}),before=buildBranchAsset(s,null,sources,0,a,{instanced:true,resolveSources:true});assets.push(before);assert.ok(before.placements.length&&before.treeOrgans.length);assert.ok(before.isInstancedAssembly);
 cloneBranchInstances(a,[a.branch_instances[0]],()=> 'COPY');const copied=buildBranchAsset(s,null,sources,0,a,{instanced:true,resolveSources:true});assets.push(copied);assert.ok(copied.isInstancedAssembly);
 for(const key of ['placements','treeOrgans']){const originalUnits=before[key].filter(p=>p.branchStableId.startsWith('I.')),units=copied[key].filter(p=>p.branchStableId.startsWith('COPY.'));assert.equal(units.length,originalUnits.length);for(const old of originalUnits){const same=units.find(p=>p.stableId==='COPY'+old.stableId.slice(1));assert.ok(same);assert.ok(same.position.distanceTo(old.position)<1e-7);assert.equal(same.source,old.source);assert.equal(same.scale,old.scale);}}
 assert.equal(branchInstanceOwner(a,copied.placements[0].stableId,copied).id,'I');
 }finally{assets.forEach(disposeBranchAsset);geometries.forEach(g=>g.dispose());}
});
test('transitive instance selection and hand-added attachment copies preserve IDs, local curves and cleanup',()=>{
 const a=fixture();a.branch_instances.push({...a.branch_instances[1],id:'GRANDCHILD',parent:'N.B1'});
 a.manual_branches=[{id:'CUSTOM',parent:'I.B1',attach:.4},{id:'CUSTOM_TIP',parent:'CUSTOM',attach:.7}];
 a.overrides.CUSTOM={curve_knots:[[1,0,0],[1,.2,.2]],curve_parent_frame:{parent:'I.B1',tangent:[1,0,0]}};a.overrides.CUSTOM_TIP={radius:2};
 a.unit_editing.items=[{id:'EXTRA',parent:'CUSTOM_TIP',source_id:'LEAF',kind:'LEAF',offset:[0,0,0],scale:1,base_scale:1}];
 const roots=selectedInstanceRoots(a,new Set(['I.B1','GRANDCHILD.R1']));assert.deepEqual(roots.map(i=>i.id),['I']);
 const result=cloneBranchInstances(a,roots,i=>'COPY_'+i.id);assert.equal(a.branch_instances.find(i=>i.id==='COPY_GRANDCHILD').parent,'COPY_N.B1');
 assert.equal(a.manual_branches.find(i=>i.id==='COPY_CUSTOM_TIP').parent,'COPY_CUSTOM');assert.equal(a.overrides.COPY_CUSTOM_TIP.radius,2);assert.equal(a.unit_editing.items[1].parent,'COPY_CUSTOM_TIP');
 deleteBranchInstances(a,result.roots);assert.ok(!a.manual_branches.some(b=>b.id.startsWith('COPY_')));assert.ok(!a.overrides.COPY_CUSTOM_TIP);assert.equal(a.unit_editing.items.length,1);
});
test('nested whole-instance scale and rotation commit the exact family shape shown in the preview',()=>{
 const a=fixture(),s=normalizeSettings({leaf_density:0,child_count:0,wind_strength:0}),assets=[];
 try{const before=buildBranchAsset(s,null,[],0,a);assets.push(before);const i=a.branch_instances[0],parent=before.masterBranches.find(b=>b.stableId===i.parent);
 let after=rotateInstance(i,parent,s,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,1).normalize(),.6),a.branch_library[0].shape);after.scale*=1.5;
 const matrix=instanceTransformMatrix(i,after,a.branch_library[0].shape,before.masterBranches,s);applyInstanceFamilyPlacement(a,structuredClone(i),after,a.branch_library[0].shape,before.masterBranches,s);
 const reloaded=buildBranchAsset(s,null,[],0,normalizeAuthoring(JSON.parse(JSON.stringify(a))));assets.push(reloaded);
 for(const b of before.masterBranches.filter(b=>b.instanceId)){const next=reloaded.masterBranches.find(n=>n.stableId===b.stableId);assert.ok(next);for(let n=0;n<b.points.length;n++)assert.ok(b.points[n].clone().applyMatrix4(matrix).distanceTo(next.points[n])<1e-7,b.stableId+' point');assert.ok(Math.abs(next.startRadius-b.startRadius*1.5)<1e-7);}
 }finally{assets.forEach(disposeBranchAsset);}
});
test('a copied local curve retains its sculpted pose after moving to a different carrier and reload',()=>{
 const a=fixture();a.branch_instances=a.branch_instances.slice(0,1);const s=normalizeSettings({leaf_density:0,child_count:0,wind_strength:0}),assets=[];
 try{const base=buildBranchAsset(s,null,[],0,a);assets.push(base);const root=base.masterBranches.find(b=>b.stableId==='I.R1'),knots=root.controlPoints.map(p=>p.toArray());knots.at(-1)[2]+=.25;a.overrides['I.R1']={locked:true,curve_knots:knots,curve_samples:knots};
 const edited=buildBranchAsset(s,null,[],0,a);assets.push(edited);const old=a.branch_instances[0],host=edited.masterBranches.find(b=>b.stableId==='HOST'),parent=edited.masterBranches.find(b=>b.stableId==='ROOT');
 const cloned=cloneBranchInstances(a,[old],()=> 'COPY',edited.masterBranches),copy=cloned.roots[0],after=moveInstanceToCarrier(copy,host,parent,s,.6,a.branch_library[0].shape),matrix=instanceTransformMatrix(old,{...after,id:old.id},a.branch_library[0].shape,edited.masterBranches,s),copiedBranches=edited.masterBranches.filter(b=>b.instanceId==='I').map((b,n)=>({...b,id:100+n,stableId:cloned.mapId(b.stableId),instanceId:'COPY',unitOwner:'COPY',parentId:b.parentId===root.id?100:b.parentId,children:[]}));
 applyInstanceFamilyPlacement(a,structuredClone(copy),after,a.branch_library[0].shape,[...edited.masterBranches,...copiedBranches],s);const moved=buildBranchAsset(s,null,[],0,normalizeAuthoring(JSON.parse(JSON.stringify(a))));assets.push(moved);
 for(const b of edited.masterBranches.filter(b=>b.instanceId==='I')){const next=moved.masterBranches.find(v=>v.stableId===cloned.mapId(b.stableId));for(let n=0;n<b.points.length;n++)assert.ok(b.points[n].clone().applyMatrix4(matrix).distanceTo(next.points[n])<1e-6,b.stableId);}
 }finally{assets.forEach(disposeBranchAsset);}
});
test('sculpted carrier mount frames preserve world rotation, size, roll and connector during transfer',()=>{
 const a=fixture(),i={...a.branch_instances[0],scale:1.2,variation:.12,roll:123},shape={...a.branch_library[0].shape,connector:{position:[.1,.2,-.1],direction:new THREE.Vector3(.4,.8,.2).normalize().toArray()}},s=normalizeSettings({});
 const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),.8),mount=new THREE.Matrix4().compose(new THREE.Vector3(2,-1,.5),q,new THREE.Vector3(2,2,2)),targetMount=new THREE.Matrix4().compose(new THREE.Vector3(-1,2,1),q,new THREE.Vector3(.7,.7,.7));
 const parent={stableId:'ROOT',points:[new THREE.Vector3(),new THREE.Vector3(0,0,3)].map(p=>p.applyMatrix4(mount)),mountMatrix:mount},host={stableId:'HOST',points:[new THREE.Vector3(),new THREE.Vector3(0,1,2)].map(p=>p.applyMatrix4(targetMount)),mountMatrix:targetMount},branches=[parent,host];
 const old=evaluatedInstanceFrame(i,shape,branches,s),rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.4),rotated=rotateInstance(i,parent,s,rotation,shape),matrix=instanceTransformMatrix(i,rotated,shape,branches,s),p=new THREE.Vector3(.8,1,2);
 assert.ok(p.clone().sub(old.position).applyQuaternion(rotation).add(old.position).distanceTo(p.clone().applyMatrix4(matrix))<1e-7);
 const moved=moveInstanceToCarrier(i,host,parent,s,.3,shape),actual=evaluatedInstanceFrame(moved,shape,branches,s);assert.ok(actual.position.distanceTo(host.points[0].clone().lerp(host.points[1],.3))<1e-7);
 assert.ok(Math.abs(new THREE.Vector3().setFromMatrixScale(instanceMatrix(moved,shape,branches,s)).x-new THREE.Vector3().setFromMatrixScale(old.matrix).x)<1e-7);
});
test('deleting array family members records only group slots, clears locks and refill cannot revive old edits',()=>{
 const a=fixture();a.branch_instances=[];const s=normalizeSettings({leaf_density:0,child_count:0}),asset=buildBranchAsset(s,null,[],0,a);
 try{const group=normalizeBranchArrays([{id:'GROUP',parent:'ROOT',asset_id:'A',count:3,arrangement:'ALTERNATE',variation:0}])[0],parent=asset.masterBranches.find(b=>b.stableId==='ROOT');a.branch_arrays=[group];a.branch_instances=generateArrayInstances(group,a.branch_library[0].shape,parent,a.branch_library);const member=a.branch_instances[1];group.locked=[member.id,a.branch_instances[0].id];
 a.branch_arrays.push(normalizeBranchArrays([{id:'NESTED',parent:member.id+'.B1',asset_id:'A',count:1}])[0]);a.branch_instances.push({...member,id:'NESTED_0',array_id:'NESTED',parent:member.id+'.B1'});a.branch_arrays[1].locked=['NESTED_0'];
 a.overrides[member.id+'.R1']={radius:3,locked:true};a.unit_editing.items=[{id:'OLD_CUSTOM_UNIT',parent:member.id+'.R1',kind:'LEAF'}];a.unit_editing.removed=[member.id+'.R1:LEAF:0','OLD_CUSTOM_UNIT'];a.sculpt_layers=[{branches:{[member.id+'.B1']:{deltas:[[0,0,1]]}},operation:{type:'POSE',targets:[member.id+'.B1'],offset:[0,0,1]}}];
 assert.equal(deleteBranchInstances(a,[member]),2);assert.deepEqual(group.removed,[member.id]);assert.deepEqual(a.branch_arrays[1].removed,['NESTED_0']);assert.ok(!group.locked.includes(member.id));assert.deepEqual(a.branch_arrays[1].locked,[]);assert.deepEqual(a.workbench.assembly_voids,[]);
 const unchanged=planAssemblyGroup(a,asset.masterBranches,group);assert.ok(!unchanged.records.some(i=>i.id===member.id));const refill=planAssemblyGroup(a,asset.masterBranches,group,a.branch_library,{fillMissing:true});assert.ok(refill.records.some(i=>i.id===member.id));assert.ok(!refill.authoring.overrides[member.id+'.R1']);assert.equal(refill.authoring.unit_editing.items.length,0);assert.deepEqual(refill.authoring.unit_editing.removed,[]);assert.equal(refill.authoring.sculpt_layers.length,0);
 const ordinary={...refill.records[0],id:'FREE',array_id:''};a.branch_instances.push(ordinary);deleteBranchInstances(a,[ordinary]);assert.equal(a.workbench.assembly_voids.at(-1).parents[0],'ROOT');
 }finally{disposeBranchAsset(asset);}
});
test('explicit automatic restore clears member wood and units including custom children but preserves other members and sources',()=>{
 const a=fixture(),instance=structuredClone(a.branch_instances[0]),library=structuredClone(a.branch_library);a.branch_instances[0].assembly_manual=true;a.branch_instances[0].assembly_refined=true;a.branch_instances[0].frame={position:[1,2,3],direction:[1,0,0],parent_position:[0,0,0],parent_tangent:[0,0,1]};const beforeInstance=structuredClone(a.branch_instances[0]);
 a.manual_branches=[{id:'LOCAL',parent:'I.R1'},{id:'LOCAL_CHILD',parent:'LOCAL'},{id:'KEEP',parent:'N.R1'}];a.overrides={'I.R1':{radius:3,locked:true},LOCAL:{curve_knots:[[0,0,0],[1,2,3]]},LOCAL_CHILD:{radius:2},'N.R1':{locked:true},HOST:{length:2}};
 a.sculpt_layers=[{id:'MIX',branches:{'I.B1':{deltas:[]},LOCAL:{deltas:[]},HOST:{deltas:[[0,1,0]]}},operation:{type:'POSE',targets:['I.B1','HOST'],offset:[1,0,0]}},{id:'DUP',branches:{},operation:{type:'DUPLICATE',targets:['LOCAL_COPY','FAR_COPY'],records:[{id:'LOCAL_COPY',parent:'I.B1',root:true},{id:'LOCAL_COPY_CHILD',parent:'LOCAL_COPY',root:false},{id:'FAR_COPY',parent:'ROOT',root:true}]}}];
 a.topology={suppressed:['I.R1','LOCAL_CHILD','N.R1'],reparent:{'I.B1':'HOST',LOCAL_CHILD:'I.R1','N.B1':'ROOT'}};
 a.leaf_edits={added:[{id:'CUSTOM_LEAF',parent:'LOCAL_CHILD'},{id:'KEEP_LEAF',parent:'N.R1'}],removed:['I.R1:gone','CUSTOM_LEAF','LOCAL_CHILD:LEAF:0','KEEP_LEAF']};
 a.unit_editing={items:[{id:'LOCAL_UNIT',parent:'I.R1'},{id:'COPY_UNIT',parent:'LOCAL_COPY_CHILD'},{id:'KEEP_UNIT',parent:'N.R1'}],removed:['I.R1:UNIT:0','LOCAL_UNIT','COPY_UNIT','KEEP_UNIT'],rules:[{id:'GLOBAL',targets:[]},{id:'MIXED',targets:['I.R1','N.R1']},{id:'LOCAL_ONLY',targets:['LOCAL_CHILD']}]};a.workbench={assembly_scale:{records:{I:{scale:2},N:{scale:3}}},assembly_distribution:{placements:{I:'old',N:'keep'}}};
 const result=resetBranchInstanceEdits(a,['I']);assert.equal(result.members,1);assert.deepEqual(a.branch_instances[0],beforeInstance);assert.deepEqual(a.branch_instances[1],fixture().branch_instances[1]);assert.deepEqual(a.branch_library,library);
 assert.deepEqual(Object.keys(a.overrides).sort(),['HOST','N.R1']);assert.deepEqual(a.manual_branches.map(b=>b.id),['KEEP']);assert.deepEqual(a.sculpt_layers[0].operation.targets,['HOST']);assert.deepEqual(a.sculpt_layers[1].operation.records.map(b=>b.id),['FAR_COPY']);assert.deepEqual(a.sculpt_layers[1].operation.targets,['FAR_COPY']);
 assert.deepEqual(a.unit_editing.items.map(v=>v.id),['KEEP_UNIT']);assert.deepEqual(a.unit_editing.removed,['KEEP_UNIT']);assert.deepEqual(a.unit_editing.rules.map(r=>[r.id,r.targets]),[['GLOBAL',[]],['MIXED',['N.R1']]]);assert.deepEqual(a.leaf_edits.added.map(v=>v.id),['KEEP_LEAF']);assert.deepEqual(a.leaf_edits.removed,['KEEP_LEAF']);assert.deepEqual(a.topology.suppressed,['N.R1']);assert.deepEqual(a.topology.reparent,{'N.B1':'ROOT'});assert.ok(!a.workbench.assembly_scale.records.I);assert.equal(a.workbench.assembly_distribution.placements.N,'keep');
});
