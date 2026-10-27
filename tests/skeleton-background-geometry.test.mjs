import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildBranchAsset,disposeBranchAsset,normalizeSettings,createStructuralSweepJobs} from '../web/branch-kernel.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {controlCurveOperation,writeControlCurve} from '../web/branch-control-curve.js';
import {prepareBackgroundSkeleton} from '../web/skeleton-background-geometry.js';
import {computeTrunkGeometry} from '../web/trunk-geometry-compute.js';
const input=JSON.parse(fs.readFileSync(new URL('../assets/tree-template-library/template-c75273b48abc49fbbfa602525f57c083.branch.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const snap=(settings,authoring)=>({settings,authoring,leaf_sources:[]});
test('initial procedural skeleton and changed topology/LOD are fully prepared without an existing asset or source payload',async()=>{
 const a=normalizeAuthoring({}),first=normalizeSettings({seed:812,branch_levels:2,child_count:3,leaf_density:0,main_segments:8});
 const client={run:async job=>({geometry:{version:2,branches:createStructuralSweepJobs(job.settings,job.authoring,job.lodIndex,job.options).map(input=>({id:input.id,geometry:computeTrunkGeometry(input)}))}})};
 for(const settings of [first,normalizeSettings({...first,length:3.2,child_count:4,preview_lod:1})]){
  const map=await prepareBackgroundSkeleton(client,null,null,snap(settings,a)),actual=buildBranchAsset(settings,null,[],settings.preview_lod,a,{branchGeometries:map}),expected=buildBranchAsset(settings,null,[],settings.preview_lod,a);
  try{const meshes=asset=>{const result=[];asset.group.traverse(o=>{if(o.isMesh)result.push(o);});return result;},x=meshes(actual),y=meshes(expected);assert.equal(map.size,0);assert.equal(x.length,y.length);for(let i=0;i<x.length;i++){for(const [key,attribute]of Object.entries(y[i].geometry.attributes))assert.deepEqual(x[i].geometry.attributes[key].array,attribute.array);assert.deepEqual(x[i].geometry.index?.array,y[i].geometry.index?.array);}}
  finally{disposeBranchAsset(actual);disposeBranchAsset(expected);for(const g of map.values())g.dispose();}
 }
});
test('whole structural background sweeps reproduce control-curve edits and preserve complete-source geometry and instance transforms',async()=>{
 for(const [doc,skeletonOnly]of [[input,false],[input,true],[JSON.parse(fs.readFileSync(new URL('../.runtime/branch-control-curve/用户当前工程_只读副本.branch.json',import.meta.url),'utf8').replace(/^\\uFEFF/,'')),false]]){const settings=normalizeSettings(doc.settings),a=normalizeAuthoring(doc.authoring),asset=buildBranchAsset(settings,null,[],0,a,{instanced:true,skeletonOnly}),root=asset.masterBranches.find(b=>b.stableId==='CAMPHOR_PRIMARY_5'),next=structuredClone(a),knots=root.controlPoints.map(p=>p.clone());knots[2].x+=.35;writeControlCurve(next,controlCurveOperation(root,knots));const retained=[];asset.group.traverse(o=>{if(o.isInstancedMesh)retained.push([o,o.geometry]);});let received;
  const client={run:async job=>{received=job;return {geometry:{version:2,branches:createStructuralSweepJobs(job.settings,job.authoring,job.lodIndex,job.options).map(input=>({id:input.id,geometry:computeTrunkGeometry(input)}))}};}};
  const map=await prepareBackgroundSkeleton(client,asset,snap(settings,a),snap(settings,next));assert.ok(map?.size>0);assert.equal(received.authoring.branch_library.length,0);assert.equal(received.authoring.branch_instances.length,0);assert.equal(received.authoring.workbench?.bark_materials,undefined);
  const cold=buildBranchAsset(settings,null,[],0,next,{instanced:true,skeletonOnly});let actual;
  try{if(!skeletonOnly){const reused=asset.updateSupportingBranches(settings,next,{branchGeometries:map});actual=reused?asset:buildBranchAsset(settings,null,[],0,next,{instanced:true,branchGeometries:map});if(reused)for(const [o,g]of retained)assert.equal(o.geometry,g);}else actual=buildBranchAsset(settings,null,[],0,next,{instanced:true,skeletonOnly,branchGeometries:map});
   const meshes=x=>{const r=[];x.group.traverse(o=>{if(o.isMesh)r.push(o);});return r;},expected=meshes(cold),rendered=meshes(actual);assert.equal(rendered.length,expected.length);for(let n=0;n<rendered.length;n++){for(const [key,attr]of Object.entries(expected[n].geometry.attributes))assert.deepEqual(rendered[n].geometry.attributes[key].array,attr.array,key);assert.deepEqual(rendered[n].geometry.index?.array,expected[n].geometry.index?.array);assert.deepEqual(rendered[n].instanceMatrix?.array,expected[n].instanceMatrix?.array);}assert.equal(map.size,0);
  }finally{for(const g of map.values())g.dispose();disposeBranchAsset(cold);if(actual!==asset)disposeBranchAsset(actual);disposeBranchAsset(asset);}
 }
});
