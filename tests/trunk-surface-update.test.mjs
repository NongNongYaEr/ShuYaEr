import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildBranchAsset,disposeBranchAsset,normalizeSettings,LOD_PROFILES} from '../web/branch-kernel.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {createDirectTrunkForm} from '../web/trunk-form.js';
import {BARK_PRESETS,applyBarkMaterialAssignments} from '../web/bark-materials.js';
import {computeTrunkGeometry} from '../web/trunk-geometry-compute.js';
import {prepareBackgroundTrunks} from '../web/trunk-background-geometry.js';
import {updateTrunkSurfaceResources} from '../web/trunk-surface-update.js';

const snapshot=(settings,authoring)=>({settings,authoring,leaf_sources:[]});
const meshes=a=>{const out=[];a.group.traverse(o=>{if(o.isMesh)out.push(o);});return out;};
const client={run:async job=>({geometry:computeTrunkGeometry(job)})};
function compare(asset,cold){const actual=meshes(asset),expected=meshes(cold);assert.equal(actual.length,expected.length);
  for(let n=0;n<actual.length;n++){const a=actual[n],b=expected[n];assert.equal(a.name,b.name);for(const key of Object.keys(b.geometry.attributes))assert.deepEqual(a.geometry.attributes[key].array,b.geometry.attributes[key].array,a.name+' '+key);assert.deepEqual(a.geometry.index.array,b.geometry.index.array);assert.deepEqual(a.geometry.userData.radiusRings,b.geometry.userData.radiusRings);assert.deepEqual(a.instanceMatrix?.array,b.instanceMatrix?.array);assert.deepEqual(a.material.map?.repeat,b.material.map?.repeat);}
  for(const key of ['vertices','triangles','invalid_vertices','degenerate_faces','missing_normals','missing_tangents','material_slots','ok'])assert.deepEqual(asset.report[key],cold.report[key],key);
}
test('atomic surface replacement matches a cold build across LODs and undo while retaining every object and unaffected mesh',async()=>{
  for(const lod of [0,1,2,3]){const settings=normalizeSettings({leaf_density:0,preview_lod:lod,junction_collar:true}),a=normalizeAuthoring({branch_shape:{branches:[{id:'ROOT',parent:'',points:[[0,0,0],[.3,.1,1],[.2,-.2,3]],length:3.2,start_radius:.4,end_radius:.2},{id:'SIDE',parent:'ROOT',attach:.5,points:[[0,0,1.5],[1,0,2]],length:1.2,start_radius:.1,end_radius:.03}]}});a.workbench||={};a.workbench.trunk_forms={version:1,branches:{ROOT:createDirectTrunkForm()}};applyBarkMaterialAssignments(a,BARK_PRESETS[1],[],{all:true});
    const asset=buildBranchAsset(settings,null,[],lod,a),original=meshes(asset),next=structuredClone(a);next.workbench.trunk_forms.branches.ROOT.sections=[{id:'A',t:.15,radius:1.7,oval:1.4,roll:45,span:.2}];let previous=a;
    try{for(const authored of [next,a]){const cache=await prepareBackgroundTrunks(client,asset,snapshot(settings,previous),snapshot(settings,authored),LOD_PROFILES[lod]),cold=buildBranchAsset(settings,null,[],lod,authored);let committed=0;try{assert.equal(updateTrunkSurfaceResources(asset,snapshot(settings,previous),snapshot(settings,authored),cache,{beforeCommit:()=>committed++}),true);assert.equal(cache.size,0);assert.equal(committed,1);assert.deepEqual(meshes(asset),original);compare(asset,cold);previous=authored;}finally{disposeBranchAsset(cold);}}
    }finally{disposeBranchAsset(asset);}
  }
});
test('real complete assemblies retain source geometry and instance matrices through a surface edit and a later placement update',async()=>{
  const input=new URL('../assets/tree-template-library/template-c75273b48abc49fbbfa602525f57c083.branch.json',import.meta.url),doc=JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,'')),settings=normalizeSettings(doc.settings),a=normalizeAuthoring(doc.authoring);a.workbench||={};a.workbench.trunk_forms={version:1,branches:{CAMPHOR_TRUNK:createDirectTrunkForm()}};
  const asset=buildBranchAsset(settings,null,[],0,a,{instanced:true}),before=meshes(asset).map(o=>({o,g:o.geometry,m:o.instanceMatrix,values:o.instanceMatrix?.array.slice()})),next=structuredClone(a);next.workbench.trunk_forms.branches.CAMPHOR_TRUNK.sections=[{id:'X',t:.3,radius:1.4,oval:1.2,roll:23,span:.2}];
  try{const cache=await prepareBackgroundTrunks(client,asset,snapshot(settings,a),snapshot(settings,next),LOD_PROFILES[0]);assert.equal(updateTrunkSurfaceResources(asset,snapshot(settings,a),snapshot(settings,next),cache),true);assert.equal(cache.size,0);
    for(const {o,g,m,values}of before){if(o.userData.stable_id!=='CAMPHOR_TRUNK')assert.equal(o.geometry,g);if(m){assert.equal(o.instanceMatrix,m);assert.deepEqual(o.instanceMatrix.array,values);}}
    const moved=structuredClone(next);moved.branch_instances[0].roll+=4;assert.equal(asset.updateAssemblyTransforms(settings,moved),true);assert.deepEqual(asset.masterBranches.find(b=>b.stableId==='CAMPHOR_TRUNK').trunkForm,next.workbench.trunk_forms.branches.CAMPHOR_TRUNK);
    const cold=buildBranchAsset(settings,null,[],0,moved,{instanced:true});try{compare(asset,cold);}finally{disposeBranchAsset(cold);}
  }finally{disposeBranchAsset(asset);}
});
