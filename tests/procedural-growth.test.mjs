import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildBranchAsset,disposeBranchAsset} from '../web/branch-kernel.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {setProceduralGrowthRule,proceduralGrowthEligibility} from '../web/procedural-growth.js';
import {sampleLine} from '../web/tree-sculpt.js';
import {compileGenerationPlan} from '../web/v4-tools.js';
const settings={child_count:6,branch_levels:3,wind_strength:0};
const snapshot=a=>a.masterBranches.map(b=>({id:b.stableId,t:b.parentT,points:b.points.map(p=>p.toArray())}));
test('default procedural tree really moves child roots past 63%, preserves parent and branch lengths, and rebuilds identically',()=>{
 const a=normalizeAuthoring(),before=buildBranchAsset(settings,null,null,0,a),parent=before.masterBranches.find(b=>b.stableId==='R1.1');assert(parent);
 assert(proceduralGrowthEligibility(a,before.masterBranches,['R1.1']).editable.length>0);setProceduralGrowthRule(a,['R1.1'],{start:.63,end:1});
 assert.equal(compileGenerationPlan({settings,authoring:normalizeAuthoring()},{settings,authoring:a}).scope,'TOPOLOGY');
 const after=buildBranchAsset(settings,null,null,0,a),p=after.masterBranches.find(b=>b.stableId==='R1.1');assert.deepEqual(p.points,parent.points);
 assert.equal(after.masterBranches.length,before.masterBranches.length);
 const children=after.masterBranches.filter(b=>b.parentId===p.id);assert(children.every(b=>b.parentT>.63));
 for(const b of after.masterBranches){const old=before.masterBranches.find(v=>v.stableId===b.stableId);assert.equal(b.startRadius,old.startRadius);assert.equal(b.length,old.length);for(let i=1;i<b.points.length;i++)assert(Math.abs(b.points[i].distanceTo(b.points[i-1])-old.points[i].distanceTo(old.points[i-1]))<1e-9);}
 for(const child of children)assert(child.points[0].distanceTo(sampleLine(p.points,child.parentT))<1e-9);
 const reload=buildBranchAsset(settings,null,null,0,JSON.parse(JSON.stringify(a)));assert.deepEqual(snapshot(reload),snapshot(after));[before,after,reload].forEach(disposeBranchAsset);
});
test('edited child bundle stays fixed; untouched siblings move; unavailable terminal branch reports zero',()=>{
 const a=normalizeAuthoring({overrides:{'R1.1.1':{radius:1.5}}}),before=buildBranchAsset(settings,null,null,0,a);
 const stats=proceduralGrowthEligibility(a,before.masterBranches,['R1.1']);assert.equal(stats.protectedCount,1);assert.equal(proceduralGrowthEligibility(a,before.masterBranches,['R1.1.1']).editable.length,0);
 setProceduralGrowthRule(a,['R1.1'],{start:.8,end:.98});const after=buildBranchAsset(settings,null,null,0,a);
 assert.deepEqual(after.masterBranches.find(b=>b.stableId==='R1.1.1').points,before.masterBranches.find(b=>b.stableId==='R1.1.1').points);
 assert(after.masterBranches.find(b=>b.stableId==='R1.1.2').parentT>.8);[before,after].forEach(disposeBranchAsset);
});
