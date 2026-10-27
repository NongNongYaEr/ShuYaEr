import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {buildBranchAsset,disposeBranchAsset} from '../web/branch-kernel.js';
import {createPVESkeleton,validatePVESkeleton} from '../web/pve-skeleton-export.js';
import {applySculptLayers} from '../web/generator-geometry.js';
import {requiresRetainedLayers} from '../web/sculpt-layer-window.js';

test('150 mixed retained layers survive normalization and save/reload in exact order',()=>{
 const source={branch_shape:{branches:[{id:'ROOT',points:[[0,0,0],[0,0,1],[0,0,2],[0,0,3],[0,0,4]],knots:[[0,0,0],[0,0,1],[0,0,2],[0,0,3],[0,0,4]],length:4,start_radius:.05,end_radius:.01}]},sculpt_layers:Array.from({length:150},(_,i)=>({id:'L'+i,name:'编辑'+i,enabled:i%9!==0,strength:i%7===0?.5:1,branches:{},operation:i%3===0?{type:'ROOT_SCALE',targets:['ROOT'],scale:[1.001,1.001,1.001]}:i%3===1?{type:'POINT_ROTATE',root:'ROOT',point:2,rotation:[0,Math.sin(.001),0,Math.cos(.001)]}:{type:'RADIUS',targets:['ROOT'],point:2,factor:1.005}}))};
 const a=normalizeAuthoring(source),loaded=normalizeAuthoring(JSON.parse(JSON.stringify(a)));
 assert.equal(a.sculpt_layers.length,150);assert.deepEqual(loaded.sculpt_layers,a.sculpt_layers);
 assert.deepEqual(a.sculpt_layers.map(l=>l.id),source.sculpt_layers.map(l=>l.id));assert.ok(requiresRetainedLayers(a.sculpt_layers));
 const settings={leaf_density:0,child_count:0},base=buildBranchAsset(settings,null,[],0,normalizeAuthoring({...source,sculpt_layers:[]}));
 const full=buildBranchAsset(settings,null,[],0,loaded),truncated=buildBranchAsset(settings,null,[],0,normalizeAuthoring({...source,sculpt_layers:source.sculpt_layers.slice(0,24)}));
 try{
  applySculptLayers(base.masterBranches,a.sculpt_layers,a.overrides);
  assert.deepEqual(full.masterBranches[0].points,base.masterBranches[0].points);
  assert.deepEqual(full.masterBranches[0].radiusEdits,base.masterBranches[0].radiusEdits);
  assert.notDeepEqual(full.masterBranches[0].points,truncated.masterBranches[0].points);
  const pve=createPVESkeleton(full);assert.ok(validatePVESkeleton(pve).valid);
  assert.notDeepEqual(pve,createPVESkeleton(truncated));
 }finally{[base,full,truncated].forEach(disposeBranchAsset);}
});
