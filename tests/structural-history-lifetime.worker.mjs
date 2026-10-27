import assert from 'node:assert/strict';
import {buildBranchAsset,disposeBranchAsset,normalizeSettings,createStructuralSweepJobs} from '../web/branch-kernel.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {prepareBackgroundSkeleton,rememberPreparedSkeleton} from '../web/skeleton-background-geometry.js';
import {computeTrunkGeometry} from '../web/trunk-geometry-compute.js';

assert.equal(typeof global.gc,'function');
const settings=normalizeSettings({seed:61,leaf_density:0,main_segments:8,radial_segments:5}),a=normalizeAuthoring({branch_shape:{branches:[{id:'HOST',parent:'',points:[[0,0,0],[.1,0,1],[0,0,2]],length:2,start_radius:.2,end_radius:.05}]},sculpt_layers:[{id:'SAVED',enabled:true,strength:1,branches:{'U0.WOOD':{parent:'HOST',deltas:[[0,0,0],[0,.1,0]],root_offset:[0,0,0]}}}]},61),snapshot=authoring=>({settings,authoring,leaf_sources:[]});
let workerCalls=0;const client={run:async job=>{workerCalls++;return {geometry:{version:2,branches:createStructuralSweepJobs(job.settings,job.authoring,job.lodIndex,job.options).map(input=>({id:input.id,geometry:computeTrunkGeometry(input)}))}};}};
let first=await prepareBackgroundSkeleton(client,null,null,snapshot(a),{reuseUnchanged:true}),old=buildBranchAsset(settings,null,[],0,a,{branchGeometries:first});rememberPreparedSkeleton(old,first);first=null;
const refs=[new WeakRef(old),new WeakRef(old.group),new WeakRef(old.authoring)],next=normalizeAuthoring(a);next.sculpt_layers[0].branches['U0.WOOD'].deltas[1][0]+=.1;
let prepared=await prepareBackgroundSkeleton(client,old,snapshot(a),snapshot(next),{reuseUnchanged:true}),uncommitted=await prepareBackgroundSkeleton(client,old,snapshot(a),snapshot(next),{reuseUnchanged:true});
const live=buildBranchAsset(settings,null,[],0,next,{branchGeometries:prepared});rememberPreparedSkeleton(live,prepared);prepared=null;disposeBranchAsset(old);old=null;
try{
 let collected=false;for(let n=0;n<30;n++){await new Promise(r=>setTimeout(r,0));global.gc();await new Promise(r=>setTimeout(r,0));if(refs.every(ref=>!ref.deref())){collected=true;break;}}
 assert(collected,'raw result reuse must not own the retired model, scene or normalized authoring');
 const again=await prepareBackgroundSkeleton(client,live,snapshot(next),snapshot(next),{reuseUnchanged:true});try{assert.equal(workerCalls,1);for(const map of [uncommitted,again])assert([...map.values()].every(g=>g.attributes.position.count>0));assert(live.masterBranches.length>0);}finally{for(const g of again.values())g.dispose();}
 console.log(JSON.stringify({passed:true,retiredOwnerSceneAndAuthoringCollected:true,currentAndUncommittedCopiesUsable:true,workerCalls}));
}finally{disposeBranchAsset(live);for(const g of uncommitted.values())g.dispose();uncommitted=null;}
