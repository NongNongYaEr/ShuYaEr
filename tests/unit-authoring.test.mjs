import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import fs from 'node:fs';
import { normalizeUnitEditing, normalizeUnitRule, authorUnits, captureUnit, resolveUnit, unitFrame, unitPoseQuaternion, inspectUnits } from '../web/unit-authoring.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { buildBranchAsset, disposeBranchAsset, deserializeGeometry, normalizeSettings, DEFAULT_SETTINGS, createProjectDocument } from '../web/branch-kernel.js';
import { createPVESkeleton, validatePVESkeleton } from '../web/pve-skeleton-export.js';
import { createTreeSpeciesDocument } from '../web/tree-species-library.js';
import { regenerateSpeciesStructure } from '../web/branch-species-controls.js';
const b={id:0,stableId:'R',order:0,points:[[0,0,0],[.2,0,.4],[.5,.2,1]].map(p=>new THREE.Vector3(...p)),startRadius:.025};
const leaves=[{id:'L1',weight:1},{id:'L2',weight:1}],organs=[{id:'F',size:.06,role:'FLOWER'}];
const signature=p=>[p.stableId,p.source,p.position.toArray(),p.direction.toArray(),p.normal?.toArray(),p.scale];
test('node rules are deterministic, scoped, and hand edits survive reseeding, density, removal and reload',()=>{
 const editing=normalizeUnitEditing({rules:[{id:'r',targets:['R'],spacing:.12,arrangement:'OPPOSITE'}]}),legacy=[];
 const first=authorUnits(legacy,[b],editing,'LEAF',leaves,.1);assert.ok(first.length>8);assert.deepEqual(first.map(signature),authorUnits(legacy,[b],editing,'LEAF',leaves,.1).map(signature));
 const p=first[2],record=captureUnit(p,b,leaves);record.offset=[.005,.004,0];record.scale*=1.4;editing.items.push(record);editing.removed.push(first[4].stableId);
 const expected=resolveUnit(record,b,leaves);editing.rules[0].seed=932;editing.rules[0].amount=.1;editing.rules[0].spacing=.08;
 const rebuilt=authorUnits([], [b],normalizeUnitEditing(JSON.parse(JSON.stringify(editing))),'LEAF',leaves,.1);
 assert.deepEqual(signature(rebuilt.find(v=>v.stableId===p.stableId)),signature(expected));assert.ok(!rebuilt.some(v=>v.stableId===first[4].stableId));
 assert.deepEqual(authorUnits([], [{...b,stableId:'other'}],editing,'LEAF',leaves,.1),[]);
 const none=authorUnits([],[],editing,'LEAF',leaves,.1);assert.equal(none.length,0);assert.match(inspectUnits([],[],editing,{LEAF:leaves,ORGAN:organs})[0].reason,/不存在/);
 const limited=authorUnits([],[b],editing,'LEAF',leaves,.1,1,1);assert.equal(limited.length,1);assert.equal(limited[0].stableId,record.id);assert.equal(limited.unitBudgetLimited,true);
});
test('opposite leaves share a valid node without disabling actual duplicate placement checks',()=>{
 const settings=normalizeSettings({...DEFAULT_SETTINGS,leaf_density:0,petiole_length:0,wind_strength:0}),a=normalizeAuthoring({branch_shape:{branches:[{id:'R',points:[[0,0,0],[0,0,1]],length:1,start_radius:.02,end_radius:.01}]},unit_editing:{rules:[{id:'pair',spacing:.15,arrangement:'OPPOSITE'}]}});
 const asset=buildBranchAsset(settings,null,null,0,a,{resolveSources:true});let duplicate;
 try{assert.ok(asset.placements.length>4);assert.equal(asset.report.attachment_overlap_ratio,0);
 const p=asset.placements[0],r=captureUnit(p,asset.masterBranches[0],[{id:'DEFAULT'}]);r.id='MANUAL_DUPLICATE';r.added=true;a.unit_editing.items.push(r);
 duplicate=buildBranchAsset(settings,null,null,0,a);assert.ok(duplicate.report.attachment_overlap_ratio>0,'a duplicated manual leaf at the same point is still detected');
 }finally{disposeBranchAsset(asset);if(duplicate)disposeBranchAsset(duplicate);}
});
test('attachment captures full orientation including twist, follows sculpted parent, and preserves scale',()=>{
 const p={stableId:'x',branchT:.6,position:unitFrame(b,.6).position,direction:new THREE.Vector3(.8,.1,.3).normalize(),normal:new THREE.Vector3(0,0,1),twist:.7,scale:.12,source:1};
 const r=captureUnit(p,b,leaves),restored=resolveUnit(r,b,leaves);assert.ok(unitPoseQuaternion(p).angleTo(unitPoseQuaternion(restored))<1e-6);
 const changed={...b,points:b.points.map(v=>v.clone().add(new THREE.Vector3(1,2,3)))};
 const moved=resolveUnit(r,changed,leaves);assert.ok(moved.position.distanceTo(p.position.clone().add(new THREE.Vector3(1,2,3)))<1e-9);assert.equal(moved.scale,p.scale);
 const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),1.7),matrix=new THREE.Matrix4().makeRotationFromQuaternion(q);
 const rotated={...b,points:b.points.map(v=>v.clone().applyMatrix4(matrix)),mountMatrix:matrix};const carried=resolveUnit(r,rotated,leaves);
 assert.ok(carried.position.distanceTo(p.position.clone().applyMatrix4(matrix))<1e-8);assert.ok(unitPoseQuaternion(carried).angleTo(q.clone().multiply(unitPoseQuaternion(p)))<1e-6,'full mount rotation including roll follows the branch');
 assert.equal(resolveUnit(r,b,[leaves[0]]),null,'missing referenced source never switches to a different mesh');
});
test('axillary organs share leaf lattice; zero source weights and zero density are respected',()=>{
 const e=normalizeUnitEditing({rules:[{id:'l',kind:'LEAF',spacing:.15},{id:'o',kind:'ORGAN',spacing:.08,habit:'AXILLARY'}]});
 const ls=authorUnits([],[b],e,'LEAF',leaves,.1),os=authorUnits([],[b],e,'ORGAN',organs,.06);assert.deepEqual(os.map(p=>p.branchT),ls.map(p=>p.branchT));
 e.rules[0].weights=leaves.map(s=>({id:s.id,weight:0}));assert.equal(authorUnits([],[b],e,'LEAF',leaves,.1).length,0);
 e.rules[1].density=[0,0,0,0,0];assert.equal(authorUnits([],[b],e,'ORGAN',organs,.06).length,0);
});
test('edited real sample survives project serialization, complete instanced assembly and PVE materialization',()=>{
 const productionFolder=new URL('../次枝资产/全植物次枝成品V1/朴树/',import.meta.url),folder=fs.existsSync(productionFolder)?productionFolder:new URL('../assets/branch-asset-library/',import.meta.url);
 const name=folder===productionFolder?fs.readdirSync(folder).find(n=>n.includes('短弯细梢')&&n.includes('混合')&&n.endsWith('.branchasset.json')):fs.readdirSync(folder).filter(n=>n.endsWith('.meta.json')).find(n=>JSON.parse(fs.readFileSync(new URL(n,folder),'utf8')).id==='FINISHED_CAMPHOR_TIP_MIXED_V1')?.replace('.meta.json','.branchasset.json');
 assert.ok(name,'The complete real sample must be included in the distribution');
 const stored=JSON.parse(fs.readFileSync(new URL(name,folder),'utf8')),unit=stored.asset||stored,allocated=[],geometries=[];
 try{
 const ss=unit.sample.leaf_meshes.map(s=>{const geometry=deserializeGeometry(s.geometry);geometries.push(geometry);return {...s,geometry};});
 const build=(s,a,instanced=false)=>{const result=buildBranchAsset(s,null,ss,0,a,{instanced,resolveSources:true});allocated.push(result);return result;};
 const a=normalizeAuthoring(unit.sample.authoring),s=normalizeSettings({...unit.sample.settings,petiole_length:0});const initial=build(s,a),p=initial.placements[0];
 const r=captureUnit(p,initial.masterBranches.find(b=>b.stableId===p.branchStableId),ss);r.scale*=1.5;r.offset[0]+=.004;a.unit_editing.items.push(r);
 const edited=build(s,a),doc=createProjectDocument(edited,ss,a),loaded=build(doc.settings,normalizeAuthoring(JSON.parse(JSON.stringify(doc.authoring))));
 assert.deepEqual(edited.placements.map(signature),loaded.placements.map(signature));
 unit.sample.authoring=a;unit.sample.settings=s;
 const tree=normalizeAuthoring({branch_shape:{branches:[{id:'ROOT',points:[[0,0,0],[0,0,2]],length:2,start_radius:.1,end_radius:.06}]},branch_library:[unit],branch_instances:[{id:'I',parent:'ROOT',asset_id:unit.id,linked:true,attach:.5,scale:1,variation:0}],recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']},tree_organs:{...a.tree_organs,mode:'LEAVES'}});
 const ts=normalizeSettings({...DEFAULT_SETTINGS,leaf_density:0,max_triangles:8000000}),preview=build(ts,tree,true),exported=build(ts,tree,false);
 const selected=preview.placements.find(p=>p.stableId==='I.'+r.id);assert.ok(selected);assert.ok(Math.abs(selected.scale-r.scale)<1e-8);assert.deepEqual(preview.placements.map(signature),exported.placements.map(signature));
 const pve=createPVESkeleton(exported);assert.ok(pve);assert.ok(!validatePVESkeleton(pve).errors?.length);
 }finally{allocated.forEach(disposeBranchAsset);geometries.forEach(g=>g.dispose());}
});
test('structural regeneration exposes branch profiles and keeps old manual units unbound instead of reusing labels',()=>{
 const d=createTreeSpeciesDocument('CELTIS','SIDE',42,{structure:{branch_count:4,shoot_count:2}});d.authoring.unit_editing=normalizeUnitEditing({items:[{id:'leaf',parent:'R1',source_id:'L1'}]});
 const next=regenerateSpeciesStructure(d,{structure:{branch_count:4,shoot_count:2,length_curve:[.4,.4,.4,.4,.4],angle_curve:[.5,.5,.5,.5,.5],tip_ratio:.4}});
 assert.equal(next.authoring.unit_editing.items[0].parent,'UNBOUND:R1');assert.equal(d.authoring.unit_editing.items[0].parent,'R1');assert.ok(next.authoring.branch_shape.branches[1].length<d.authoring.branch_shape.branches[1].length);
});
