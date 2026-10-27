import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {normalizeSettings,upgradeStructuralCurves,buildBranchAsset,disposeBranchAsset,createProjectDocument} from '../web/branch-kernel.js';
import {axisTimes} from '../web/branch-axis.js';
import {controlCurveAxis,controlCurveOperation,evaluateControlCurve} from '../web/branch-control-curve.js';
import {createPVESkeleton,validatePVESkeleton} from '../web/pve-skeleton-export.js';
import {createTrunkFormPreset} from '../web/trunk-form.js';
const settings=normalizeSettings({seed:42,leaf_density:0,wind_strength:0,collision_avoidance:false});
const shape={branches:[{id:'ROOT',parent:'',points:[[0,0,0],[.4,0,1],[1,0,1.3],[2,.2,1.3]],start_radius:.14,end_radius:.04},{id:'CHILD',parent:'ROOT',attach:.6,points:[[1,0,1],[1.3,.4,1.5],[1.3,.7,2]],start_radius:.04,end_radius:.005}]};
const assets=[];test.afterEach(()=>assets.splice(0).forEach(disposeBranchAsset));
const build=a=>{const b=buildBranchAsset(settings,null,[],0,a,{instanced:true});assets.push(b);return b;};
const graph=b=>b.masterBranches.map(b=>[b.stableId,b.parentId,b.points.map(p=>p.toArray()),axisTimes(b.points),b.controlPoints.map(p=>p.toArray())]);
test('old structural polylines become exactly the point-editor curves before any gesture; old history is an unchanged prefix',()=>{
 const a=normalizeAuthoring({branch_shape:shape,sculpt_layers:[{id:'OLD',enabled:true,strength:1,branches:{}}]}),before=JSON.stringify(a),r=upgradeStructuralCurves(settings,a),model=build(r.authoring);
 assert.equal(JSON.stringify(a),before);assert.deepEqual(r.upgraded,['ROOT','CHILD']);assert.deepEqual(r.authoring.sculpt_layers.slice(0,a.sculpt_layers.length),a.sculpt_layers);
 for(const b of model.masterBranches){assert(axisTimes(b.points));assert.deepEqual(b.points.map(p=>p.toArray()),controlCurveAxis(b.controlPoints).map(p=>p.toArray()));const after=evaluateControlCurve(model.masterBranches,controlCurveOperation(b,b.controlPoints));assert.deepEqual(after.find(c=>c.id===b.id).points.map(p=>p.toArray()),b.points.map(p=>p.toArray()));}
 const again=upgradeStructuralCurves(settings,r.authoring);assert.deepEqual(again.upgraded,[]);assert.deepEqual(again.authoring,r.authoring);assert.deepEqual(graph(build(again.authoring)),graph(model));
 const doc=createProjectDocument(model,[],r.authoring),cold=build(normalizeAuthoring(JSON.parse(JSON.stringify(doc)).authoring));assert.deepEqual(graph(cold),graph(model));assert.deepEqual(createPVESkeleton(cold,[]),createPVESkeleton(model,[]));assert(validatePVESkeleton(createPVESkeleton(cold,[])).valid);
});
test('fixed descendants veto the conversion rather than silently breaking their anchors',()=>{const a=normalizeAuthoring({branch_shape:shape,overrides:{CHILD:{pinned_points:[0]}}}),r=upgradeStructuralCurves(settings,a);assert(r.skipped.includes('ROOT'));assert(!r.upgraded.includes('ROOT'));assert.deepEqual(r.authoring.branch_shape,a.branch_shape);});
test('vine and source-only workbench data are not interpreted as assembled structural carriers',()=>{const a=normalizeAuthoring({});assert.deepEqual(upgradeStructuralCurves(settings,a).upgraded,[]);});
test('carriers with edited bark sections and buttress recipes also use the same curve while retaining their full surface authoring',()=>{
 const a=normalizeAuthoring({branch_shape:shape,workbench:{trunk_forms:{version:1,branches:{ROOT:createTrunkFormPreset('BUTTRESS')}}}}),r=upgradeStructuralCurves(settings,a),asset=build(r.authoring);assert.deepEqual(r.upgraded,['ROOT','CHILD']);assert.deepEqual(r.authoring.workbench.trunk_forms,a.workbench.trunk_forms);const b=asset.masterBranches.find(b=>b.stableId==='ROOT');assert(b.trunkForm);assert.deepEqual(b.points.map(p=>p.toArray()),controlCurveAxis(b.controlPoints).map(p=>p.toArray()));
});
