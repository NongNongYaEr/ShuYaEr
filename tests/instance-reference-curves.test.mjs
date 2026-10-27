import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildBranchAsset,buildBranchReferenceCurves,disposeBranchAsset,normalizeSettings} from '../web/branch-kernel.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {copy} from '../web/branch-workbench-data.js';
import {createInstancePlacementContext,applyInstancePlacement,rotateInstance,cloneBranchInstances} from '../web/branch-instance-operations.js';
import {createAuthoringDraft} from '../web/authoring-draft.js';

const folder=new URL('../次枝资产/全植物次枝成品V1/朴树/',import.meta.url),name=fs.readdirSync(folder).find(n=>n.includes('短弯细梢')&&n.includes('混合')&&n.endsWith('.branchasset.json')),source=JSON.parse(fs.readFileSync(new URL(name,folder),'utf8')).asset;
const assets=[];test.afterEach(()=>assets.splice(0).forEach(disposeBranchAsset));
function fixture(){
 const settings=normalizeSettings({seed:42,leaf_density:0,petiole_length:0,collision_avoidance:false,wind_strength:0,max_triangles:8000000});
 const a=normalizeAuthoring({branch_shape:{branches:[{id:'HOST',parent:'',points:[[0,0,0],[0,0,2],[.1,0,4]],length:4,start_radius:.2,end_radius:.1}]},branch_library:[source],branch_instances:[0,1,2].map(n=>({id:'U'+n,parent:'HOST',attach:.25+n*.22,asset_id:source.id,linked:true,scale:.6,angle:60,azimuth:n*100,seed:42,variation:0})),recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']}},42);
 const original=buildBranchAsset(settings,null,[],0,a,{instanced:true});assets.push(original);const byId=new Map(original.masterBranches.map(b=>[b.id,b])),branches={};
 for(const b of original.masterBranches.filter(b=>b.instanceId==='U0'||b.instanceId==='U1')){
   a.overrides[b.stableId]={locked:true,curve_knots:b.controlPoints.map(p=>p.toArray()),curve_samples:b.points.map(p=>p.toArray())};
   branches[b.stableId]={parent:byId.get(b.parentId)?.stableId||'',deltas:b.points.map((_,n)=>[0,n*.002,n*.001]),knot_deltas:b.controlPoints.map((_,n)=>[0,n*.002,n*.001]),root_offset:[0,0,0]};
 }
 a.sculpt_layers=[{id:'OLD_LOCAL',name:'Historical unit edits',enabled:true,strength:.7,branches}];
 const asset=buildBranchAsset(settings,null,[],0,a,{instanced:true});assets.push(asset);return {settings,a,asset};
}
// Independent oracle: the former full model construction, with only this
// owner's layer data excluded. It deliberately still generates all meshes.
function oldBase(a,owner,settings){const baseline=copy(a);for(const l of baseline.sculpt_layers)for(const id of Object.keys(l.branches))if(id.startsWith(owner+'.'))delete l.branches[id];baseline.sculpt_layers=baseline.sculpt_layers.filter(l=>{if(!l.operation)return true;l.operation.targets=l.operation.targets.filter(id=>!id.startsWith(owner+'.'));return l.operation.targets.length;});const asset=buildBranchAsset({...settings,leaf_density:0},null,[],0,baseline);assets.push(asset);return asset.masterBranches;}
function applyOracle(a,before,after,shape,branches,settings,base){const context=createInstancePlacementContext(a,branches,settings);context.referenceFor=null;context.reframeScopes=null;applyInstancePlacement(a,before,after,shape,branches,settings,base,context);}
const signature=(branches,owner)=>{const byId=new Map(branches.map(b=>[b.id,b.stableId]));return branches.filter(b=>b.instanceId===owner).map(b=>({id:b.stableId,parent:byId.get(b.parentId),t:b.parentT,points:b.points.map(v=>v.toArray()),times:b.points.axisTimes,knots:b.controlPoints.map(v=>v.toArray()),length:b.length,r0:b.startRadius,r1:b.endRadius}));};

test('geometry-free owner projection agrees exactly with the former complete-model reference',()=>{
 const {a,asset,settings}=fixture(),baseline=copy(a);for(const id of Object.keys(baseline.sculpt_layers[0].branches))if(id.startsWith('U0.'))delete baseline.sculpt_layers[0].branches[id];
 const expected=oldBase(a,'U0',settings),next=buildBranchReferenceCurves(settings,baseline,{owners:new Set(['U0'])});assert.deepEqual(signature(next,'U0'),signature(expected,'U0'));assert(!next.some(b=>b.instanceId==='U1'));
 assert.deepEqual(a.branch_library,asset.authoring.branch_library);
});

test('independent historical placement batch evaluates its shared reference once and matches the former saved document',()=>{
 const {a,asset,settings}=fixture(),next=copy(a),oracle=copy(a),context=createInstancePlacementContext(next,asset.masterBranches,settings),parent=asset.masterBranches.find(b=>b.stableId==='HOST');
 for(const [owner,angle]of [['U0',.23],['U1',-.19]]){
   const before=copy(next.branch_instances.find(i=>i.id===owner)),after=rotateInstance(before,parent,settings,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),angle),source.shape);after.scale*=1.1;
   const expected=oldBase(oracle,owner,settings);applyOracle(oracle,copy(before),copy(after),source.shape,asset.masterBranches,settings,expected);
   const setAttribute=THREE.BufferGeometry.prototype.setAttribute;THREE.BufferGeometry.prototype.setAttribute=function(){throw Error('placement reference must not generate or decode geometry');};
   try{applyInstancePlacement(next,before,after,source.shape,asset.masterBranches,settings,null,context);}finally{THREE.BufferGeometry.prototype.setAttribute=setAttribute;}
 }
 assert.equal(context.stats.referenceBuilds,1);assert.equal(context.stats.referenceProjections,2);assert.deepEqual(next,oracle);assert.equal(context.stats.legacyReframes,2);
});

test('nested roots, nonlocal space operations and later layers retain individual reference evaluation',()=>{
 for(const mode of ['nested','space','later','independent-children']){const {a,asset,settings}=fixture();
   if(mode==='nested')a.branch_instances[1].parent='U0.'+source.shape.branches[0].id;
   if(mode==='space')a.sculpt_layers.unshift({id:'SPACE',enabled:true,strength:1,branches:{},operation:{type:'SPACE',targets:['HOST'],spacingEnabled:true}});
   if(mode==='later')a.sculpt_layers.push({id:'AFTER',enabled:true,strength:1,branches:{HOST:{parent:'',deltas:[[0,0,0],[0,0,0]]}}});
   if(mode==='independent-children')a.curve_editor.affect_children=false;
   assert.equal(createInstancePlacementContext(a,asset.masterBranches,settings).referenceFor,null,mode);
 }
});

test('a repeated owner uses its current authoring reference instead of the first placement snapshot',()=>{
 const {a,asset,settings}=fixture(),next=copy(a),oracle=copy(a),context=createInstancePlacementContext(next,asset.masterBranches,settings),parent=asset.masterBranches.find(b=>b.stableId==='HOST');
 for(const angle of [.2,.37]){const before=copy(next.branch_instances[0]),after=rotateInstance(before,parent,settings,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),angle),source.shape);const expected=oldBase(oracle,'U0',settings);applyOracle(oracle,copy(before),copy(after),source.shape,asset.masterBranches,settings,expected);applyInstancePlacement(next,before,after,source.shape,asset.masterBranches,settings,null,context);}
 assert.deepEqual(next,oracle);assert.equal(context.stats.referenceProjections,1);
});

test('empty structural operation layers do not change the shared historical baseline',()=>{
 const {a,asset,settings}=fixture();a.sculpt_layers.unshift({id:'EMPTY_OP',enabled:true,strength:1,branches:{},operation:{type:'POINT_ROTATE',targets:[],center:[0,0,0],axis:[0,0,1],angle:.1}});
 const next=copy(a),oracle=copy(a),context=createInstancePlacementContext(next,asset.masterBranches,settings),before=copy(next.branch_instances[0]),after={...before,scale:before.scale*.9};
 applyOracle(oracle,copy(before),copy(after),source.shape,asset.masterBranches,settings,oldBase(oracle,before.id,settings));applyInstancePlacement(next,before,after,source.shape,asset.masterBranches,settings,null,context);
 assert.deepEqual(next,oracle);assert.equal(context.stats.referenceBuilds,1);assert(context.reframeScopes.get('U0').entries.length>0);
});

test('individual graph-only fallback preserves coupled space and earlier unit sculpt history',()=>{
 for(const mode of ['space','earlier']){
   const {a,asset,settings}=fixture();
   if(mode==='space')a.sculpt_layers.unshift({id:'SPACE',enabled:true,strength:1,branches:{},operation:{type:'SPACE',targets:['HOST'],spacingEnabled:true}});
   else a.sculpt_layers.push({id:'LATER_HOST',enabled:true,strength:1,branches:{HOST:{parent:'',deltas:[[0,0,0],[.01,0,0],[.02,0,0]]}}});
   const next=copy(a),oracle=copy(a),context=createInstancePlacementContext(next,asset.masterBranches,settings),before=copy(next.branch_instances[0]),after={...before,scale:before.scale*1.1};
   assert.equal(context.referenceFor,null);applyOracle(oracle,copy(before),copy(after),source.shape,asset.masterBranches,settings,oldBase(oracle,before.id,settings));applyInstancePlacement(next,before,after,source.shape,asset.masterBranches,settings,null,context);assert.deepEqual(next,oracle,mode);
 }
});

test('an explicit independent owner scope preserves the former reference and excludes unrelated runtime units',()=>{
 const {a,asset,settings}=fixture(),context=createInstancePlacementContext(a,asset.masterBranches,settings,{owners:['U0']}),reference=context.referenceFor('U0');
 assert.deepEqual(signature(reference,'U0'),signature(oldBase(a,'U0',settings),'U0'));assert(!reference.some(b=>b.instanceId==='U1'||b.instanceId==='U2'));assert.equal(context.referenceFor('U1'),null);
});

test('scoped historical placement reads the current draft without finalizing or changing the saved result',()=>{
 const {a,asset,settings}=fixture(),draft=createAuthoringDraft(a),next=draft.value,oracle=copy(a),context=createInstancePlacementContext(next,asset.masterBranches,settings,{owners:['U0','U1']}),parent=asset.masterBranches.find(b=>b.stableId==='HOST');
 for(const owner of ['U0','U1']){const before=copy(next.branch_instances.find(i=>i.id===owner)),after=rotateInstance(before,parent,settings,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),.23),source.shape);after.scale*=1.08;applyOracle(oracle,copy(before),copy(after),source.shape,asset.masterBranches,settings,oldBase(oracle,owner,settings));applyInstancePlacement(next,before,after,source.shape,asset.masterBranches,settings,null,context);}
 next.recipe.notes='after-reference-read';oracle.recipe.notes='after-reference-read';assert.deepEqual(draft.finish(),oracle);assert.notDeepEqual(a,oracle);assert.equal(a.recipe.notes||'','');assert.equal(context.stats.referenceBuilds,1);assert.equal(context.stats.referenceProjections,2);
});

test('an owner outside the declared reference scope evaluates its current individual context',()=>{
 const {a,asset,settings}=fixture(),next=copy(a),oracle=copy(a),context=createInstancePlacementContext(next,asset.masterBranches,settings,{owners:['U0']}),parent=asset.masterBranches.find(b=>b.stableId==='HOST');
 for(const owner of ['U0','U1']){const before=copy(next.branch_instances.find(i=>i.id===owner)),after=rotateInstance(before,parent,settings,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.17),source.shape);applyOracle(oracle,copy(before),copy(after),source.shape,asset.masterBranches,settings,oldBase(oracle,owner,settings));applyInstancePlacement(next,before,after,source.shape,asset.masterBranches,settings,null,context);}
 assert.deepEqual(next,oracle);assert.equal(context.stats.referenceProjections,1);
});

test('a copied historical unit keeps the full-model reference when placed with a scoped transaction',()=>{
 const {a,asset,settings}=fixture(),next=copy(a),cloned=cloneBranchInstances(next,[next.branch_instances[0]],()=> 'COPY',asset.masterBranches),oracle=copy(next),copied=asset.masterBranches.filter(b=>b.instanceId==='U0'),first=Math.max(...asset.masterBranches.map(b=>b.id))+1,ids=new Map(copied.map((b,n)=>[b.id,first+n]));
 const branches=asset.masterBranches.concat(copied.map(b=>({...b,id:ids.get(b.id),stableId:cloned.mapId(b.stableId),instanceId:cloned.mapId(b.instanceId),unitOwner:cloned.mapId(b.unitOwner),parentId:ids.get(b.parentId)??b.parentId,children:b.children.map(id=>ids.get(id)??id)}))),context=createInstancePlacementContext(next,branches,settings,{owners:['COPY']}),before=copy(next.branch_instances.find(i=>i.id==='COPY')),parent=branches.find(b=>b.stableId==='HOST'),after=rotateInstance(before,parent,settings,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.25),source.shape);
 applyOracle(oracle,copy(before),copy(after),source.shape,branches,settings,oldBase(oracle,'COPY',settings));applyInstancePlacement(next,before,after,source.shape,branches,settings,null,context);assert.deepEqual(next,oracle);
 // Copying adds a later history layer. Preserve the individual full context
 // rather than treating the earlier source-unit layer as independent.
 assert.equal(context.referenceFor,null);assert.equal(context.stats.referenceProjections,0);assert.equal(context.stats.legacyReframes,1);assert.deepEqual(next.branch_library,a.branch_library);
});

test('an unselected pinned unit still vetoes a structural ancestor operation in a scoped reference',()=>{
 const {a,asset,settings}=fixture();a.branch_instances[0].attach=.8;const pinned=asset.masterBranches.find(b=>b.instanceId==='U2');a.overrides[pinned.stableId]={pinned_points:[0]};
 a.sculpt_layers.unshift({id:'ROTATE_HOST',enabled:true,strength:1,branches:{},operation:{type:'POINT_ROTATE',targets:['HOST'],root:'HOST',point:1,rotation:[0,0,Math.sin(.3),Math.cos(.3)]}});
 const context=createInstancePlacementContext(a,asset.masterBranches,settings,{owners:['U0']}),reference=context.referenceFor('U0');assert.deepEqual(signature(reference,'U0'),signature(oldBase(a,'U0',settings),'U0'));
});
test('a structural carrier mounted to an unselected unit remains in a selected owner reference',()=>{
 const {a,settings}=fixture();a.branch_shape.branches.push({id:'SUPPORT',parent:'HOST',attach:.65,points:[[.1,0,2.6],[.4,0,3.2]],knots:[[.1,0,2.6],[.4,0,3.2]],length:.7,start_radius:.03,end_radius:.005});a.branch_instances[0].parent='SUPPORT';const local=Object.entries(a.sculpt_layers[0].branches).find(([id,r])=>id.startsWith('U0.')&&r.parent==='HOST');local[1].parent='SUPPORT';a.sculpt_layers.unshift({id:'CROSS',name:'Cross carrier',enabled:true,strength:1,branches:{},operation:{type:'MOUNT',targets:['SUPPORT'],root:'SUPPORT',parent:'HOST',target_parent:'U1.'+source.shape.branches[0].id,attach:.8,rotation:[0,0,0,1],parent_tangent:[0,0,1]}});
 const asset=buildBranchAsset(settings,null,[],0,a,{instanced:true});assets.push(asset);const context=createInstancePlacementContext(a,asset.masterBranches,settings,{owners:['U0']}),oracle=copy(a),before=copy(a.branch_instances.find(i=>i.id==='U0')),parent=asset.masterBranches.find(b=>b.stableId===before.parent),after=rotateInstance(before,parent,settings,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),.23),source.shape);after.scale*=1.04;
 applyOracle(oracle,copy(before),copy(after),source.shape,asset.masterBranches,settings,oldBase(oracle,'U0',settings));applyInstancePlacement(a,before,after,source.shape,asset.masterBranches,settings,null,context);assert.deepEqual(a,oracle);assert.equal(context.referenceFor,null);
});
