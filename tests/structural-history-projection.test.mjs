import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBranchAsset,disposeBranchAsset,normalizeSettings,createStructuralSweepJobs} from '../web/branch-kernel.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {prepareBackgroundSkeleton,rememberPreparedSkeleton} from '../web/skeleton-background-geometry.js';
import {computeTrunkGeometry} from '../web/trunk-geometry-compute.js';
import {captureBranchDuplicate} from '../web/branch-duplicate.js';

const settings=normalizeSettings({seed:47,leaf_density:0,petiole_length:0,branch_levels:3,main_segments:8,radial_segments:5,wind_strength:0});
const shape=(id,parent='',z=0)=>({id,parent,attach:.6,points:[[0,0,z],[.1,0,z+.5],[0,0,z+1]],length:1,start_radius:.12,end_radius:.03});
const record=parent=>({parent,root_offset:[0,0,0],deltas:[[0,0,0],[.03,0,0],[.02,0,0]],knot_deltas:[[0,0,0],[.03,0,0],[.02,0,0]]});
const fixture=()=>normalizeAuthoring({branch_shape:{branches:[shape('HOST'),shape('__proto__','HOST',.6)]},sculpt_layers:[{id:'SAVED',enabled:true,strength:.7,branches:Object.fromEntries([['HOST',record('')],['__proto__',record('HOST')],['U0.WOOD',record('HOST')]])}]},settings.seed);
const snapshot=a=>({settings,authoring:a,leaf_sources:[]});
// The original worker envelope, before excluding unreachable historical records.
function originalJob(a){const {bark_materials,...workbench}=a.workbench||{};return {settings,authoring:{...a,workbench,branch_library:[],branch_instances:[],leaf_material:undefined,sample_materials:undefined,tree_organs:{...a.tree_organs,units:[]},sculpt_layers:a.sculpt_layers.map(l=>l.operation?.type==='DUPLICATE'?{...l,operation:{...l.operation,records:l.operation.records.filter(r=>!r.owner)}}:l)},lodIndex:0,options:{continuousBark:Boolean(a.branch_library.length||Object.keys(a.workbench?.trunk_forms?.branches||{}).length),hadInstances:false}};}
const compute=job=>({geometry:{version:2,branches:createStructuralSweepJobs(job.settings,job.authoring,job.lodIndex,job.options).map(input=>({id:input.id,geometry:computeTrunkGeometry(input)}))}});
function exactMeshes(a,b){const meshes=x=>{const list=[];x.group.traverse(o=>{if(o.isMesh)list.push(o);});return list;},x=meshes(a),y=meshes(b);assert.equal(x.length,y.length);for(let n=0;n<x.length;n++){assert.deepEqual(Object.keys(x[n].geometry.attributes),Object.keys(y[n].geometry.attributes));for(const [key,v]of Object.entries(y[n].geometry.attributes))assert.deepEqual(x[n].geometry.attributes[key].array,v.array,key);assert.deepEqual(x[n].geometry.index?.array,y[n].geometry.index?.array);}}

test('changing an unreachable saved unit record does not queue an identical captured skeleton',async()=>{
 const a=fixture(),next=structuredClone(a);next.sculpt_layers[0].branches['U0.WOOD'].deltas[1][0]+=.8;
 assert.deepEqual(compute(originalJob(a)),compute(originalJob(next)),'independent original full worker outputs are identical');
 const asset=buildBranchAsset(settings,null,[],0,a);let calls=0;
 try{const map=await prepareBackgroundSkeleton({run:async job=>{calls++;return compute(job);}},asset,snapshot(a),snapshot(next));for(const g of map?.values()||[])g.dispose();assert.equal(calls,0,'unit-only history must not rebuild identical structural sweeps');assert.equal(map,null);}
 finally{disposeBranchAsset(asset);}
});

test('projected worker histories preserve own __proto__, manual branches, duplicate IDs and exact original sweeps',async()=>{
 const a=fixture();a.manual_branches=normalizeAuthoring({manual_branches:[{id:'MANUAL',parent:'HOST',attach:.8,length:.5,radius:.04}]}).manual_branches;
 const source=buildBranchAsset(settings,null,[],0,a);const op=captureBranchDuplicate(source,new Set(['MANUAL']),'COPY');disposeBranchAsset(source);
 a.sculpt_layers.unshift({id:'COPY',enabled:true,strength:1,branches:{},operation:op});a.sculpt_layers.at(-1).branches[op.records[0].id]=record('HOST');
 const before=structuredClone(a);let submitted;const map=await prepareBackgroundSkeleton({run:async job=>{submitted=job;return compute(job);}},null,null,snapshot(a));
 try{assert.deepEqual(compute(submitted),compute(originalJob(a)));assert.equal(Object.hasOwn(submitted.authoring.sculpt_layers.at(-1).branches,'U0.WOOD'),false);assert(Object.hasOwn(submitted.authoring.sculpt_layers.at(-1).branches,'__proto__'));assert(Object.hasOwn(submitted.authoring.sculpt_layers.at(-1).branches,op.records[0].id));assert.deepEqual(submitted.authoring.sculpt_layers[0].operation,op);assert.deepEqual(a,before,'editable history remains complete');
  const withPrepared=buildBranchAsset(settings,null,[],0,a,{branchGeometries:map}),cold=buildBranchAsset(settings,null,[],0,a);try{exactMeshes(withPrepared,cold);}finally{disposeBranchAsset(withPrepared);disposeBranchAsset(cold);}
 }finally{for(const g of map.values())g.dispose();}
});

test('a previously hidden captured branch becoming visible still requests its structural geometry',async()=>{
 const a=fixture();a.overrides=Object.fromEntries([['__proto__',{hidden:true}]]);const next=structuredClone(a);next.overrides.__proto__={hidden:false};const asset=buildBranchAsset(settings,null,[],0,a);let submitted;
 try{assert(!asset.masterBranches.some(b=>b.stableId==='__proto__'));const map=await prepareBackgroundSkeleton({run:async job=>{submitted=job;return compute(job);}},asset,snapshot(a),snapshot(next));try{assert(submitted,'absence from the old visible support set is not proof that its override is irrelevant');assert(map.has('__proto__'));assert.deepEqual(compute(submitted),compute(originalJob(next)));}finally{for(const g of map?.values()||[])g.dispose();}}
 finally{disposeBranchAsset(asset);}
});

test('enabled generator groups retain full historical context for dynamically created structural IDs',async()=>{
 const a=fixture();a.generator_groups=normalizeAuthoring({generator_groups:[{id:'EXTRA',enabled:true,order:1,parent_group:'ANY',count:2}]}).generator_groups;
 a.sculpt_layers[0].branches['HOST.G_EXTRA.1']=record('HOST');const next=structuredClone(a);next.sculpt_layers[0].branches['HOST.G_EXTRA.1'].deltas[1][0]+=.2;const asset=buildBranchAsset(settings,null,[],0,a);let submitted;
 try{const map=await prepareBackgroundSkeleton({run:async job=>{submitted=job;return compute(job);}},asset,snapshot(a),snapshot(next));try{assert(submitted);assert(Object.hasOwn(submitted.authoring.sculpt_layers[0].branches,'U0.WOOD'),'unproven graph IDs keep the full original history');assert.deepEqual(compute(submitted),compute(originalJob(next)));}finally{for(const g of map?.values()||[])g.dispose();}}
 finally{disposeBranchAsset(asset);}
});

test('changes to a copied branch history absent from the original visible support set are not skipped',async()=>{
 const a=fixture(),first=buildBranchAsset(settings,null,[],0,a),op=captureBranchDuplicate(first,new Set(['HOST']),'COPY');disposeBranchAsset(first);a.sculpt_layers.unshift({id:'COPY',enabled:true,strength:1,operation:op,branches:{}});a.sculpt_layers.at(-1).branches[op.records[0].id]=record('');
 const next=structuredClone(a);next.sculpt_layers.at(-1).branches[op.records[0].id].deltas[1][0]+=.4;const asset=buildBranchAsset(settings,null,[],0,a);let submitted;
 try{assert(asset.masterBranches.find(b=>b.stableId===op.records[0].id).copySnapshot);const map=await prepareBackgroundSkeleton({run:async job=>{submitted=job;return compute(job);}},asset,snapshot(a),snapshot(next));try{assert(submitted,'copied structural history must participate even though old support filtering excludes copies');assert.deepEqual(compute(submitted),compute(originalJob(next)));}finally{for(const g of map?.values()||[])g.dispose();}}
 finally{disposeBranchAsset(asset);}
});

test('unchanged complete worker jobs reuse independent raw geometry after the previous displayed asset is disposed',async()=>{
 const a=fixture(),next=structuredClone(a);next.sculpt_layers[0].branches['U0.WOOD'].deltas[1][0]+=.8;
 let calls=0;const client={run:async job=>{calls++;return compute(job);}},prepared=await prepareBackgroundSkeleton(client,null,null,snapshot(a),{reuseUnchanged:true}),asset=buildBranchAsset(settings,null,[],0,a,{branchGeometries:prepared});
 rememberPreparedSkeleton(asset,prepared);assert.equal(prepared.size,0);
 const map=await prepareBackgroundSkeleton(client,asset,snapshot(a),snapshot(next),{reuseUnchanged:true});assert.equal(calls,1,'same actual worker input reuses its immutable raw result');
 const old=[];asset.group.traverse(o=>{if(o.isMesh)old.push(o.geometry);});for(const geometry of map.values())for(const source of old){assert.notEqual(geometry,source);assert.notEqual(geometry.attributes.position.array.buffer,source.attributes.position.array.buffer);}
 disposeBranchAsset(asset);
 const actual=buildBranchAsset(settings,null,[],0,next,{branchGeometries:map}),cold=buildBranchAsset(settings,null,[],0,next);
 try{exactMeshes(actual,cold);rememberPreparedSkeleton(actual,map);assert.equal(map.size,0);}finally{disposeBranchAsset(actual);disposeBranchAsset(cold);for(const g of map.values())g.dispose();}
});

test('cached worker output validates wind and complete job fields beyond the old support-only comparison',async()=>{
 const a=fixture();let calls=0;const client={run:async job=>{calls++;return compute(job);}},prepared=await prepareBackgroundSkeleton(client,null,null,snapshot(a),{reuseUnchanged:true}),asset=buildBranchAsset(settings,null,[],0,a,{branchGeometries:prepared});rememberPreparedSkeleton(asset,prepared);
 const next=structuredClone(a);next.wind_profile.branch_stiffness+=.2;
 try{const map=await prepareBackgroundSkeleton(client,asset,snapshot(a),snapshot(next),{reuseUnchanged:true});try{assert.equal(calls,2,'the actual worker job changed even though the old geometric subset did not');const actual=buildBranchAsset(settings,null,[],0,next,{branchGeometries:map}),cold=buildBranchAsset(settings,null,[],0,next);try{exactMeshes(actual,cold);}finally{disposeBranchAsset(actual);disposeBranchAsset(cold);}}finally{for(const g of map.values())g.dispose();}}
 finally{disposeBranchAsset(asset);}
});

test('uncommitted or unrelated geometry maps cannot install or retain a stale skeleton result',async()=>{
 const a=fixture();let calls=0;const client={run:async job=>{calls++;return compute(job);}},asset=buildBranchAsset(settings,null,[],0,a);
 try{
  const unconsumed=await prepareBackgroundSkeleton(client,asset,snapshot(a),snapshot(a),{reuseUnchanged:true});rememberPreparedSkeleton(asset,unconsumed);for(const g of unconsumed.values())g.dispose();
  const prepared=await prepareBackgroundSkeleton(client,asset,snapshot(a),snapshot(a),{reuseUnchanged:true});assert.equal(calls,2,'a result not consumed by construction is not attached to an existing model');
  const built=buildBranchAsset(settings,null,[],0,a,{branchGeometries:prepared});try{rememberPreparedSkeleton(built,prepared);rememberPreparedSkeleton(built,new Map());const afterInvalidation=await prepareBackgroundSkeleton(client,built,snapshot(a),snapshot(a),{reuseUnchanged:true});try{assert.equal(calls,3,'a different in-place update invalidates the previous cached sweep output');}finally{for(const g of afterInvalidation.values())g.dispose();}}finally{disposeBranchAsset(built);for(const g of prepared.values())g.dispose();}
 }finally{disposeBranchAsset(asset);}
});
