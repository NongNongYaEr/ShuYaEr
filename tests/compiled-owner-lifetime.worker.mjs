import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildBranchAsset,buildBranchAssetAsync,disposeBranchAsset,deserializeGeometry,normalizeSettings} from '../web/branch-kernel.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {compiledSamples,compiledSampleCacheStats,compiledSampleHistoryStats} from '../web/compiled-sample-cache.js';

assert.equal(typeof global.gc,'function','the owner lifetime worker needs --expose-gc');
const folder=new URL('../次枝资产/全植物次枝成品V1/朴树/',import.meta.url),name=fs.readdirSync(folder).find(n=>n.includes('短弯细梢')&&n.includes('混合')&&n.endsWith('.branchasset.json')),source=JSON.parse(fs.readFileSync(new URL(name,folder))).asset;
const leaves=source.sample.leaf_meshes.map(s=>({...s,geometry:deserializeGeometry(s.geometry)})),settings=normalizeSettings({seed:42,wind_strength:0,leaf_density:0,petiole_length:0,collision_avoidance:false,max_triangles:8000000}),authoring=normalizeAuthoring({branch_shape:{branches:[{id:'HOST',parent:'',points:[[0,0,0],[0,0,3]],length:3,start_radius:.2,end_radius:.1}]},branch_library:[source],branch_instances:[0,1,2].map(n=>({id:'U'+n,parent:'HOST',attach:.2+n*.2,asset_id:source.id,linked:true,angle:60,azimuth:n*90,scale:.5,seed:42,variation:0})),recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']}},42);
for(const id of ['U0','U1','U2'])authoring.overrides[id+'.'+source.shape.branches[0].id]={leaf_density:1};
if(process.argv[2].startsWith('historical')){
 const initial=buildBranchAsset(settings,null,leaves,0,authoring,{instanced:true}),byId=new Map(initial.masterBranches.map(b=>[b.id,b]));
 authoring.sculpt_layers=[{id:'RETAINED',name:'Historical',enabled:true,strength:1,branches:Object.fromEntries(initial.masterBranches.filter(b=>b.instanceId).map(b=>[b.stableId,{parent:byId.get(b.parentId)?.stableId||'',deltas:b.points.map((_,n)=>[0,n*.002,0]),knot_deltas:b.controlPoints.map((_,n)=>[0,n*.002,0]),root_offset:[0,0,0]}]))}];disposeBranchAsset(initial);
}
let old=buildBranchAsset(settings,null,leaves,0,authoring,{instanced:true}),live=null;
const retired={owner:new WeakRef(old),group:new WeakRef(old.group),authoring:new WeakRef(old.authoring)},next=normalizeAuthoring(authoring);next.overrides['U0.'+source.shape.branches[0].id].leaf_density=.25;
let cache=null,historyCache=null,cancelled=false;
try{
 if(process.argv[2].endsWith('cancel')){
   let abort=false;await assert.rejects(buildBranchAssetAsync(settings,null,leaves,0,next,{instanced:true,reuseSamplesFrom:old},{budgetMs:0,shouldAbort:()=>abort,yieldControl:()=>new Promise(r=>setTimeout(r,0)),onSlice:({stage})=>{if(stage==='unit-prototypes')abort=true;}}),error=>error.name==='AbortError');cancelled=true;
   assert([...compiledSamples(old).records.values()].every(p=>p.refs===1),'cancel must return borrowed prototypes to their original owner');
 }else{
   live=buildBranchAsset(settings,null,leaves,0,next,{instanced:true,reuseSamplesFrom:old});cache=compiledSampleCacheStats(live);assert.equal(cache.built,1);assert.equal(cache.reused,2);
   historyCache=compiledSampleHistoryStats(live);if(process.argv[2]==='historical')assert.deepEqual(historyCache,{scoped:true,reusedOwners:2,evaluatedOwners:1});
 }
 disposeBranchAsset(old);old=null;
 let collected=false;
 for(let n=0;n<30;n++){
   await new Promise(r=>setTimeout(r,0));global.gc();await new Promise(r=>setTimeout(r,0));
   if(Object.values(retired).every(ref=>!ref.deref())){collected=true;break;}
 }
 assert(collected,'a completed/cancelled replacement must not retain the retired full owner, scene or authoring root');
 if(live){assert(live.masterBranches.length>3);assert([...compiledSamples(live).records.values()].every(p=>p.refs===1&&p.meshes.every(mesh=>mesh.geometry.attributes.position.count>0)),'retiring the owner must keep the exact shared models usable');}
 console.log(JSON.stringify({passed:true,cancelled,retiredOwnerSceneAndAuthoringCollected:true,liveSharedModelsUsable:Boolean(live),cache,historyCache}));
}finally{if(old)disposeBranchAsset(old);if(live)disposeBranchAsset(live);leaves.forEach(s=>s.geometry.dispose());}
