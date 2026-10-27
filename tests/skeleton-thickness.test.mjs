import test from 'node:test';
import assert from 'node:assert/strict';
import { applySkeletonThickness, skeletonThicknessState, skeletonBranches, skeletonThicknessView, proposedSkeletonBase } from '../web/skeleton-thickness.js';
import { branchRadiusAt } from '../web/branch-shaping.js';
import { captureBranchShape } from '../web/branch-workbench-data.js';
import { createPVESkeleton, validatePVESkeleton } from '../web/pve-skeleton-export.js';
import { profileValue } from '../web/generator-data.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { compileGenerationPlan } from '../web/v4-tools.js';
import { buildBranchAsset, disposeBranchAsset, normalizeSettings, DEFAULT_SETTINGS } from '../web/branch-kernel.js';

const bone=(id,parentId,order,instanceId='')=>({id,parentId,order,instanceId,startRadius:.02,endRadius:.001,radiusProfile:{points:[[0,1],[.3,.7],[1,1]],interpolation:'SMOOTH'},points:[[0,0,0],[1,0,0]]});

test('absolute base diameter removes inherited 100-fold differences and bounds length variation',()=>{
 const settings=normalizeSettings(DEFAULT_SETTINGS),original=[.001,.01,.1].map((r,i)=>({...bone(i,-1,2),length:i+1,startRadius:r}));
 const workbench={skeleton_thickness:{levels:[null,null,{mode:'RADIUS_CURVE',scale:8,source:{scale:5,curve:[2,2,2,2,2]},curve:[1,.8,.6,.4,.2],base:{mode:'UNIFORM',diameter_cm:4,variation:.2}}]}};
 const branches=structuredClone(original);applySkeletonThickness(branches,workbench,settings);
 branches.forEach((b,i)=>{assert.ok(Math.abs(branchRadiusAt(b,settings,0)*200-[3.2,4,4.8][i])<1e-10);assert.ok(Math.abs(branchRadiusAt(b,settings,1)/branchRadiusAt(b,settings,0)-.2)<1e-10);});
 workbench.skeleton_thickness.levels[2].base.variation=0;const uniform=structuredClone(original);applySkeletonThickness(uniform,workbench,settings);uniform.forEach(b=>assert.equal(branchRadiusAt(b,settings,0),.02));
});

test('length groups have independent bounded sizes, exact threshold, stable rebuilds and unit exclusion',()=>{
 const settings=normalizeSettings(DEFAULT_SETTINGS),original=[.5,1,2,4].map((length,id)=>({...bone(id,-1,2),length}));original.push({...bone(4,0,2,'UNIT'),length:99});
 const rule={mode:'RADIUS_CURVE',scale:1,curve:[1,1,1,1,1],base:{mode:'LENGTH_GROUPS',split_length:2,short:{diameter_cm:2,variation:.1},long:{diameter_cm:8,variation:.25}}};
 const workbench={skeleton_thickness:{levels:[null,null,rule]}},a=structuredClone(original),b=structuredClone(original).reverse();applySkeletonThickness(a,workbench,settings);applySkeletonThickness(b,workbench,settings);
 a.slice(0,4).forEach((branch,i)=>{assert.ok(Math.abs(branchRadiusAt(branch,settings,0)*200-[1.8,2.2,6,10][i])<1e-10);assert.deepEqual(branch,b.find(p=>p.id===branch.id));});assert.deepEqual(a[4],original[4]);
 const normalized=skeletonThicknessState(workbench),saved=normalizeAuthoring(JSON.parse(JSON.stringify({workbench:{skeleton_thickness:normalized}})));
 assert.deepEqual(skeletonThicknessState(saved.workbench),normalized);
 const rebuilt=structuredClone(original);applySkeletonThickness(rebuilt,saved.workbench,settings);assert.deepEqual(rebuilt,a);
});

test('base suggestions are read-only; source mode preserves previous exact radius-curve behavior',()=>{
 const settings=normalizeSettings(DEFAULT_SETTINGS),branches=[{...bone(0,-1,2),length:1},{...bone(1,-1,2),length:3}],original=structuredClone(branches);
 const rule={mode:'RADIUS_CURVE',scale:2,curve:[1,1,1,1,1]},wb={skeleton_thickness:{levels:[null,null,rule]}};
 const proposal=proposedSkeletonBase(branches,settings,wb,2);assert.equal(proposal.mode,'SOURCE');assert.deepEqual(branches,original);assert.equal(rule.base,undefined);
 const before=structuredClone(branches);applySkeletonThickness(before,wb,settings);rule.base={...proposal,diameter_cm:123};applySkeletonThickness(branches,wb,settings);assert.deepEqual(branches,before);
});
test('skeleton ownership excludes linked, detached, nested units and manual descendants at every level',()=>{
 const branches=[bone(0,-1,0),bone(1,0,1),bone(2,1,2,'UNIT'),bone(3,2,3),bone(4,0,0,'COPY'),bone(5,3,0,'NESTED')],before=structuredClone(branches);
 const state=skeletonThicknessState();state.levels.forEach(r=>{r.scale=3;r.curve=[1,2,3,4,5];});
 assert.deepEqual(skeletonBranches(branches).map(b=>b.id),[0,1]);applySkeletonThickness(branches,{skeleton_thickness:state});
 assert.deepEqual(branches.slice(2),before.slice(2));assert.notEqual(branches[1].startRadius,before[1].startRadius);
 assert.deepEqual(branches.map(b=>b.points),before.map(b=>b.points));
});
test('curve composes with authored profile, stays in existing profile limits and neutral preserves exact data',()=>{
 const b=bone(0,-1,2),before=structuredClone(b),state=skeletonThicknessState();
 applySkeletonThickness([b],{});assert.deepEqual(b,before);
 state.levels[2]={scale:2,curve:[1,1,2,4,8]};applySkeletonThickness([b],{skeleton_thickness:state});
 assert.ok(b.radiusProfile.points.length<=32);assert.ok(b.radiusProfile.points.every(p=>p[1]>=0&&p[1]<=3));
 for(let n=0;n<=100;n++){const t=n/100,want=before.startRadius*profileValue(before.radiusProfile,t)*2*profileValue(state.levels[2].curve,t),actual=b.startRadius*profileValue(b.radiusProfile,t);assert.ok(Math.abs(actual-want)/want<.005);}
 const saved=normalizeAuthoring(JSON.parse(JSON.stringify({workbench:{skeleton_thickness:state}})));assert.deepEqual(skeletonThicknessState(saved.workbench),state);
});

test('procedural skeleton edits trigger rebuilding without changing spawn results or accumulating',()=>{
 const settings=normalizeSettings({...DEFAULT_SETTINGS,leaf_density:0}),a=normalizeAuthoring(),next=normalizeAuthoring(a),state=skeletonThicknessState();state.levels[1].scale=2;
 next.workbench={skeleton_thickness:state};
 assert.equal(compileGenerationPlan({settings,authoring:a},{settings,authoring:next}).scope,'TOPOLOGY');
 const before=buildBranchAsset(settings,null,[],0,a),after=buildBranchAsset(settings,null,[],0,next);
 try{assert.deepEqual(after.masterBranches.map(b=>[b.stableId,b.points,b.length]),before.masterBranches.map(b=>[b.stableId,b.points,b.length]));
  for(let n=0;n<before.masterBranches.length;n++)assert.equal(after.masterBranches[n].startRadius,before.masterBranches[n].startRadius*(before.masterBranches[n].order===1?2:1));
 }finally{disposeBranchAsset(before);disposeBranchAsset(after);}
});

test('actual curve replaces taper, junction match/flare and section radius; flat 1 is uniform',()=>{
 const settings=normalizeSettings({...DEFAULT_SETTINGS,radius_bias:.7,junction_flare:1});
 for(const junction of [null,{enabled:true,match:true,length:.3,flare:2},{enabled:true,match:false,length:.3,flare:2}]){
  const b={...bone(1,0,2),length:1,parentRadius:.15,junction,sections:[{t:0,radius:2,oval:1.3,roll:10},{t:1,radius:.1,oval:1,roll:0}]},original=structuredClone(b),root=branchRadiusAt(b,settings,0);
  const rule={mode:'RADIUS_CURVE',scale:1,curve:[1,1,1,1,1]},state={levels:[null,null,rule]};
  applySkeletonThickness([b],{skeleton_thickness:state},settings);
  for(let i=0;i<=100;i++)assert.ok(Math.abs(branchRadiusAt(b,settings,i/100)-root)<1e-12);
  assert.deepEqual(b.sections,original.sections,'local source edits are retained for restoring');
  const tapered=structuredClone(original);rule.scale=2;rule.curve=[1,.8,.6,.4,.2];applySkeletonThickness([tapered],{skeleton_thickness:state},settings);
  for(let i=0;i<=100;i++)assert.ok(Math.abs(branchRadiusAt(tapered,settings,i/100)/root-2*(1-.8*i/100))<1e-12);
 }
});

test('legacy projects show measured taper and mixed range without mutation; conversion preserves legacy root sizes',()=>{
 const settings=normalizeSettings(DEFAULT_SETTINGS),branches=[bone(0,-1,2),{...bone(1,-1,2),endRadius:.01}],before=structuredClone(branches);
 const legacy={levels:[null,null,{scale:2,curve:[2,1,1,1,1]}]};
 applySkeletonThickness(branches,{skeleton_thickness:legacy},settings);
 const original=structuredClone(branches),view=skeletonThicknessView(branches,settings,{skeleton_thickness:legacy},2);
 assert.equal(view.inherited,true);assert.equal(view.mixed,true);assert.equal(view.rule.curve[0],1);assert.ok(view.rule.curve[4]<1);assert.deepEqual(branches,original);
 view.rule.curve=[1,1,1,1,1];const state={levels:[null,null,view.rule]};
 applySkeletonThickness(before,{skeleton_thickness:state},settings);
 before.forEach((b,i)=>assert.ok(Math.abs(branchRadiusAt(b,settings,1)-branchRadiusAt(original[i],settings,0))<1e-12));
 const saved=normalizeAuthoring(JSON.parse(JSON.stringify({workbench:{skeleton_thickness:state}})));
 assert.deepEqual(skeletonThicknessState(saved.workbench),skeletonThicknessState({skeleton_thickness:state}));
});

test('actual radius curve survives shape extraction using established JSON fields',()=>{
 const settings=normalizeSettings({...DEFAULT_SETTINGS,leaf_density:0,junction_collar:false}),a=normalizeAuthoring();
 a.workbench={skeleton_thickness:{levels:Array.from({length:4},()=>({mode:'RADIUS_CURVE',scale:1,curve:[1,.8,.6,.4,.2]}))}};
 const asset=buildBranchAsset(settings,null,[],0,a);let replay;
 try{
  const captured=captureBranchShape(asset.masterBranches,asset.masterBranches[0].stableId,true);
  assert.ok(captured.shape.branches.every(b=>b.radius_profile.points.length<=32));
  replay=buildBranchAsset(settings,null,[],0,normalizeAuthoring({branch_shape:captured.shape}));
  for(const b of replay.masterBranches){const old=asset.masterBranches.find(p=>p.stableId===b.stableId);for(let i=0;i<=100;i++)assert.ok(Math.abs(branchRadiusAt(b,settings,i/100)/branchRadiusAt(old,settings,i/100)-1)<.002,'baked shape radius matches');}
 }finally{disposeBranchAsset(asset);if(replay)disposeBranchAsset(replay);}
});

test('two-point carrier meshes and PVE include interior radius-curve control points',()=>{
 const settings=normalizeSettings({...DEFAULT_SETTINGS,leaf_density:0,junction_collar:false,surface_roughness:0,groove_depth:0,knot_strength:0,cross_section:'ROUND'});
 const a=normalizeAuthoring({branch_shape:{branches:[{id:'ROOT',points:[[0,0,0],[0,0,2]],length:2,start_radius:.1,end_radius:.001}]},workbench:{skeleton_thickness:{levels:[{mode:'RADIUS_CURVE',scale:1,curve:[1,2,3,2,1]}]}}});
 const asset=buildBranchAsset(settings,null,[],0,a);
 try{const skeleton=createPVESkeleton(asset);assert.equal(validatePVESkeleton(skeleton).valid,true);
  assert.deepEqual(skeleton.branches[0].points.map(p=>p.t),[0,.25,.5,.75,1]);
  skeleton.branches[0].points.forEach((p,i)=>assert.ok(Math.abs(p.radius_m-[.1,.2,.3,.2,.1][i])<1e-12));
  let geometry;asset.group.traverse(o=>{if(o.userData.category==='branch'&&o.userData.stable_id==='ROOT')geometry=o.geometry;});assert.ok(geometry);
  const p=geometry.getAttribute('position');let widest=0,middle=false;
  for(let n=0;n<p.count;n++){const r=Math.hypot(p.getX(n),p.getY(n));widest=Math.max(widest,r);if(Math.abs(p.getZ(n)-1)<1e-6&&Math.abs(r-.3)<1e-6)middle=true;}
  assert.ok(middle);assert.ok(Math.abs(widest-.3)<1e-6);
  const captured=captureBranchShape(asset.masterBranches,'ROOT');
  const replay=buildBranchAsset(settings,null,[],0,normalizeAuthoring({branch_shape:captured.shape}));
  try{const points=createPVESkeleton(replay).branches[0].points;assert.ok(points.some(p=>p.t===.5&&Math.abs(p.radius_m-.3)<1e-12));}finally{disposeBranchAsset(replay);}
 }finally{disposeBranchAsset(asset);}
});
