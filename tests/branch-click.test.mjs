import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { buildBranchAsset, disposeBranchAsset } from '../web/branch-kernel.js';
import { planClickedBranch } from '../web/branch-click-tool.js';
import { sampleLine } from '../web/tree-sculpt.js';

test('click adds at the hit parameter, creates configured children and preserves other bones and saved geometry',()=>{
 const settings={leaf_density:0,child_count:0,branch_levels:4,wind_strength:0};
 const a=normalizeAuthoring({branch_shape:{branches:[{id:'ROOT',parent:'',points:[[0,0,0],[0,0,1],[0,0,2]],length:2,start_radius:.1,end_radius:.05}]}});
 const build=a=>buildBranchAsset(settings,null,[],0,a,{skeletonOnly:true}),base=build(a),root=base.masterBranches[0];
 const opts={length:.45,angle:45,azimuth:0,radius:.55,taper:.2,children:{count:3,levels:2,seed:12}};
 const p=planClickedBranch(a,settings,base.masterBranches,{branch:'ROOT',attach:.6,point:[.1,0,1.2]},opts,'CLICK_ROOT','LOCAL_CLICK'),added=build(p.authoring);
 assert.equal(p.stats.total,9);assert.equal(added.masterBranches.length,11);assert.equal(a.manual_branches.length,0);
 const b=added.masterBranches.find(b=>b.stableId==='CLICK_ROOT');assert.ok(b.points[0].distanceTo(sampleLine(root.points,.6))<1e-8);assert.ok(b.points.at(-1).x>b.points[0].x);
 assert.deepEqual(added.masterBranches[0].points,root.points);
 const loaded=build(normalizeAuthoring(JSON.parse(JSON.stringify(p.authoring))));assert.deepEqual(loaded.masterBranches.map(b=>b.points),added.masterBranches.map(b=>b.points));
 const p2=planClickedBranch(p.authoring,settings,added.masterBranches,{branch:'ROOT',attach:.3,point:[-.1,0,.6]},{...opts,children:null},'SECOND','LOCAL_SECOND'),again=build(p2.authoring);
 assert.equal(again.masterBranches.length,12);for(const old of added.masterBranches)assert.deepEqual(again.masterBranches.find(b=>b.stableId===old.stableId).points,old.points);
 assert.throws(()=>planClickedBranch(a,settings,[{...root,unitOwner:'UNIT'}],{branch:'ROOT',attach:.6,point:[0,0,1]},opts,'BAD','LOCAL_BAD'),/单元枝/);
 [base,added,loaded,again].forEach(disposeBranchAsset);
});
