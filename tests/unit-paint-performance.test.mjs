import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {buildBranchAsset,disposeBranchAsset,deserializeGeometry,normalizeSettings,DEFAULT_SETTINGS,createProjectDocument} from '../web/branch-kernel.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {sealCompiledSampleMaterials} from '../web/compiled-sample-cache.js';
import {createPVESkeleton} from '../web/pve-skeleton-export.js';
import {createUnitErasePreview} from '../web/unit-erase-preview.js';
import {createUnitEraseScreen,unitEraseHits} from '../web/unit-paint-erase.js';
const dir=new URL('../次枝资产/全植物次枝成品V1/香樟/',import.meta.url),name=fs.readdirSync(dir).find(n=>n.includes('紧凑侧枝')&&n.includes('深绿')&&n.endsWith('.branchasset.json')),source=JSON.parse(fs.readFileSync(new URL(name,dir))).asset;
const assets=[],geometries=[];test.afterEach(()=>{assets.splice(0).forEach(disposeBranchAsset);geometries.splice(0).forEach(g=>g.dispose());});
function fixture(){const leaves=source.sample.leaf_meshes.map(s=>{const geometry=deserializeGeometry(s.geometry);geometries.push(geometry);return {...s,geometry};}),settings=normalizeSettings({...DEFAULT_SETTINGS,leaf_density:0,max_leaves:0,wind_strength:0,max_triangles:8e6}),authoring=normalizeAuthoring({branch_shape:{branches:[{id:'ROOT',parent:'',points:[[0,0,0],[0,0,4]],length:4,start_radius:.1,end_radius:.05}]},branch_library:[source],branch_instances:[{id:'I0',asset_id:source.id,linked:true,pinned_revision:source.revision,parent:'ROOT',attach:.25,scale:1,angle:60,azimuth:0}],tree_organs:source.sample.authoring.tree_organs});
 const build=a=>{const v=buildBranchAsset(settings,null,leaves,0,a,{instanced:true});assets.push(v);sealCompiledSampleMaterials(v);return v;};return {authoring,settings,leaves,build};}
const rootMesh=a=>{let root;a.group.traverse(m=>{if(m.isMesh&&m.userData.stable_id==='ROOT')root=m;});assert(root);return root;};
const signature=a=>({branches:a.masterBranches.map(b=>[b.stableId,b.parentId,b.points.map(p=>p.toArray()),b.startRadius]),leaves:a.placements.map(p=>[p.stableId,p.source,p.position.toArray(),p.scale]),organs:a.treeOrgans.map(p=>[p.stableId,p.source,p.position.toArray(),p.scale])});
test('flat membership updates reuse support geometry and match cold geometry, source identity and PVE',()=>{
 const f=fixture(),live=f.build(f.authoring),root=rootMesh(live).geometry,next=normalizeAuthoring(f.authoring),sourceBefore=JSON.stringify(next.branch_library);
 for(let n=1;n<=5;n++)next.branch_instances.push({...next.branch_instances[0],id:'I'+n,attach:.3+n*.1,azimuth:n*29});
 let before=0;assert.equal(live.updateAssemblyMembers(f.settings,next,{beforeCommit:()=>before++}),true);assert.equal(before,1);assert.equal(rootMesh(live).geometry,root);assert.equal(JSON.stringify(live.authoring.branch_library),sourceBefore);
 const cold=f.build(next);assert.deepEqual(signature(live),signature(cold));assert.deepEqual(createPVESkeleton(live,f.leaves),createPVESkeleton(cold,f.leaves));
 const doc=createProjectDocument(live,f.leaves),reopened=f.build(normalizeAuthoring(JSON.parse(JSON.stringify(doc)).authoring));assert.deepEqual(signature(live),signature(reopened));
});
test('erased membership can reach zero and then refill without replacing support geometry',()=>{
 const f=fixture(),live=f.build(f.authoring),root=rootMesh(live).geometry,empty=normalizeAuthoring(f.authoring);empty.branch_instances=[];
 assert(live.updateAssemblyMembers(f.settings,empty));assert.equal(live.placements.length,0);assert.deepEqual(signature(live),signature(f.build(empty)));
 assert(live.updateAssemblyMembers(f.settings,f.authoring));assert.equal(rootMesh(live).geometry,root);assert.deepEqual(signature(live),signature(f.build(f.authoring)));
});
test('membership shortcut rejects changed sources, settings and nested parents before mutating anything',()=>{
 const f=fixture(),live=f.build(f.authoring),original=signature(live);
 for(const mutate of [a=>a.branch_library[0].name+=' changed',a=>a.branch_instances[1].parent='I0.'+source.shape.branches[0].id]){const next=normalizeAuthoring(f.authoring);next.branch_instances.push({...next.branch_instances[0],id:'I1'});mutate(next);assert.equal(live.updateAssemblyMembers(f.settings,next),false);assert.deepEqual(signature(live),original);}
 const next=normalizeAuthoring(f.authoring);next.branch_instances.push({...next.branch_instances[0],id:'I1'});assert.equal(live.updateAssemblyMembers({...f.settings,seed:45},next),false);assert.deepEqual(signature(live),original);
});
test('immediate erasing hides whole wood and foliage matrices and cancellation restores exact borrowed state',()=>{
 const f=fixture(),live=f.build(f.authoring),snapshot=JSON.stringify(live.authoring),records=[];live.group.traverse(m=>{const members=live.editPreviewBindings?.(m)?.instances;if(m.isInstancedMesh&&members?.length)records.push({m,values:m.instanceMatrix.array.slice()});});
 assert(records.length>1);const preview=createUnitErasePreview(live);preview.hide(new Set(['I0']));assert.equal(preview.count,1);assert(records.every(({m})=>m.instanceMatrix.array[0]===0));assert.equal(JSON.stringify(live.authoring),snapshot);
 preview.restore();for(const {m,values}of records)assert.deepEqual(m.instanceMatrix.array,values);assert.equal(JSON.stringify(live.authoring),snapshot);assert.equal(preview.count,0);
});
test('indexed erase queries match segment tests across clipped segments, points and different brush radii',()=>{
 const entries=Array.from({length:90},(_,n)=>({id:'I'+n,lines:[[new T.Vector3(n*13-400,n%7*25,0),new T.Vector3(n*13-385,n%7*25+50,(n%5-2))]]})),project=p=>({x:p.x,y:p.y,z:p.z}),index=createUnitEraseScreen(entries,project);
 for(let n=0;n<45;n++){const p=[n*23-450,n%9*22],radius=20+n%6*27;assert.deepEqual(index.query(p,radius).map(e=>e.id).sort(),unitEraseHits(entries,p,radius,project).map(e=>e.id).sort());}
});


