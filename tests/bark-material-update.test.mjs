import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBranchAsset,disposeBranchAsset,normalizeSettings} from '../web/branch-kernel.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {BARK_PRESETS,applyBarkMaterialAssignments,removeBarkMaterialAssignments} from '../web/bark-materials.js';
import {updateBarkMaterialResources} from '../web/bark-material-update.js';

const snapshot=(settings,authoring)=>({settings,authoring,leaf_sources:[]});
test('material hot updates and removals match cold materials while retaining every geometry and releasing obsolete palettes',()=>{
  const settings=normalizeSettings({leaf_density:0,junction_collar:true}),a=normalizeAuthoring({branch_shape:{branches:[{id:'ROOT',parent:'',points:[[0,0,0],[0,0,3]],length:3,start_radius:.3,end_radius:.2},{id:'SIDE',parent:'ROOT',attach:.5,points:[[0,0,1.5],[1,0,2]],length:1.2,start_radius:.1,end_radius:.04}]}});
  const asset=buildBranchAsset(settings,null,[],0,a),meshes=[];asset.group.traverse(o=>{if(o.isMesh)meshes.push({o,g:o.geometry,m:o.material});});let previous=snapshot(settings,a),disposed=0;
  try{for(const recipe of [BARK_PRESETS[1],BARK_PRESETS[3],null]){
    const next=structuredClone(previous.authoring);if(recipe)applyBarkMaterialAssignments(next,recipe,[],{all:true});else removeBarkMaterialAssignments(next,[],{all:true});
    const cold=buildBranchAsset(settings,null,[],0,next);try{
      assert.equal(updateBarkMaterialResources(asset,previous,snapshot(settings,next)),true);const expected=[];cold.group.traverse(o=>{if(o.isMesh)expected.push(o);});
      for(let i=0;i<meshes.length;i++){assert.equal(meshes[i].o.geometry,meshes[i].g);assert.deepEqual(meshes[i].o.material.userData.bark_material,expected[i].material.userData.bark_material);if(recipe){assert.deepEqual(meshes[i].o.material.map.repeat,expected[i].material.map.repeat);assert.deepEqual(meshes[i].o.material.normalScale,expected[i].material.normalScale);}}
      for(const m of asset.unitBarkMaterials)m.addEventListener('dispose',()=>disposed++);previous=snapshot(settings,next);
    }finally{disposeBranchAsset(cold);}
  }assert.ok(disposed>0);}finally{disposeBranchAsset(asset);}
});
test('source, placement, settings and geometry changes reject hot updates without touching the displayed scene',()=>{
  const settings=normalizeSettings({leaf_density:0}),a=normalizeAuthoring({}),asset=buildBranchAsset(settings,null,[],0,a),before=snapshot(settings,a),objects=[];asset.group.traverse(o=>{if(o.isMesh)objects.push([o,o.geometry,o.material]);});
  try{for(const mutate of [n=>n.settings.seed++,n=>n.authoring.overrides.ROOT={offset:[1,0,0]},n=>n.authoring.branch_instances.push({id:'new'}),n=>n.authoring.workbench.other=true,n=>n.leaf_sources.push({id:'new'})]){
    const next=structuredClone(before);applyBarkMaterialAssignments(next.authoring,BARK_PRESETS[1],[],{all:true});mutate(next);let called=false;assert.equal(updateBarkMaterialResources(asset,before,next,{beforeCommit:()=>called=true}),false);assert.equal(called,false);for(const [o,g,m]of objects){assert.equal(o.geometry,g);assert.equal(o.material,m);}
  }}finally{disposeBranchAsset(asset);}
});
