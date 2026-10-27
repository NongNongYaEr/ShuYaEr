import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTrunkSectionPoints,trunkSectionPointWeights,pullTrunkSectionPoints} from '../web/trunk-section-point-group.js';
import {removeTrunkSectionPoints} from '../web/trunk-section-point-edit.js';
import {wholeTrunkContourKnots} from '../web/trunk-whole-contour.js';
import {createDirectTrunkForm,normalizeTrunkForm} from '../web/trunk-form.js';

test('point selection uses actual IDs and preserves no stale or duplicate objects across add/subtract/replace',()=>{
 const p=wholeTrunkContourKnots({},64),before=structuredClone(p),a=p[0].id,b=p[63].id;
 assert.deepEqual(selectTrunkSectionPoints(p,[a,'missing'],[b,b,'hover'],'ADD'),[a,b]);
 assert.deepEqual(selectTrunkSectionPoints(p,[a,b],[a],'SUBTRACT'),[b]);
 assert.deepEqual(selectTrunkSectionPoints(p,[a,b],[]),[]);assert.deepEqual(p,before);
});
test('group radial pulls give every selected surface the same physical increment without altering angles or distant points',()=>{
 const p=wholeTrunkContourKnots({},64),ids=[p[0].id,p[1].id,p[63].id],before=structuredClone(p),surface=a=>2+.7*Math.cos(a*3);
 const next=pullTrunkSectionPoints(p,ids,{delta:.24,radiusAt:surface});
 for(let i=0;i<p.length;i++){assert.equal(next[i].angle,p[i].angle);assert.equal(next[i].id,p[i].id);if(ids.includes(p[i].id))assert.ok(Math.abs((next[i].radius/p[i].radius-1)*surface(p[i].angle*Math.PI/180)-.24)<1e-12);else assert.deepEqual(next[i],p[i]);}
 assert.deepEqual(p,before);
});
test('soft group influence wraps the closed seam and overlapping selected regions never double the displacement',()=>{
 const p=wholeTrunkContourKnots({},64),ids=[p[0].id,p[1].id],weights=trunkSectionPointWeights(p,ids,{smooth:true,reach:18});
 assert.equal(weights[0],1);assert.equal(weights[1],1);assert.ok(weights[63]>0);assert.equal(weights[32],0);assert.ok(weights.every(w=>w>=0&&w<=1));
 const next=pullTrunkSectionPoints(p,ids,{delta:.1,radiusAt:()=>2,smooth:true,reach:18});
 assert.equal(next[0].radius,1.05);assert.equal(next[1].radius,1.05);for(let i=0;i<p.length;i++)assert.ok(Math.abs(next[i].radius-(1+.05*weights[i]))<1e-12);
});
test('group clamps are per point and empty, zero, invalid or unrelated selections cannot author a contour',()=>{
 const p=wholeTrunkContourKnots({},64),ids=[p[0].id,p[1].id];
 const next=pullTrunkSectionPoints(p,ids,{delta:-2,radiusAt:a=>a===0?1:10});assert.equal(next[0].radius,.001);assert.equal(next[1].radius,.8);assert.deepEqual(next[2],p[2]);
 for(const options of [{delta:0,radiusAt:()=>1},{delta:NaN,radiusAt:()=>1},{delta:1,radiusAt:()=>NaN}])assert.deepEqual(pullTrunkSectionPoints(p,ids,options),p);
 assert.deepEqual(pullTrunkSectionPoints(p,[],{delta:1,radiusAt:()=>1,smooth:true}),p);
 assert.deepEqual(pullTrunkSectionPoints(p,['hover'],{delta:1,radiusAt:()=>1}),p);
 const legacy=pullTrunkSectionPoints(p,ids,{delta:999,radiusAt:()=>1,min:.15,max:4});assert.equal(legacy[0].radius,4);
});
test('batch deletion is atomic and retains the last closed triangle, all survivor IDs and exact values',()=>{
 const p=wholeTrunkContourKnots({},64),before=structuredClone(p),ids=p.slice(0,61).map(p=>p.id),next=removeTrunkSectionPoints(p,ids);
 assert.deepEqual(next,p.slice(61));assert.equal(removeTrunkSectionPoints(p,p.slice(0,62).map(p=>p.id)),null);
 assert.equal(removeTrunkSectionPoints(p,[p[0].id,'unknown']),null);assert.equal(removeTrunkSectionPoints(p,[]),null);
 assert.equal(removeTrunkSectionPoints(p,[p[0].id,p[0].id]).length,63);assert.deepEqual(p,before);
});
test('group edits serialize as the existing normalized contour with no selection, group or UE/PVE schema additions',()=>{
 const form=createDirectTrunkForm(),p=wholeTrunkContourKnots({},128);form.sections=[{id:'S',t:.5,radius:1,oval:1,roll:0,span:.18,profile:pullTrunkSectionPoints(p,[p[0].id,p[127].id],{delta:.2,radiusAt:()=>2})}];
 const saved=normalizeTrunkForm(form),cold=normalizeTrunkForm(JSON.parse(JSON.stringify(saved)));assert.deepEqual(cold,saved);assert.equal(cold.sections[0].profile.length,128);
 for(const point of cold.sections[0].profile)assert.deepEqual(Object.keys(point).sort(),['angle','id','radius']);assert.equal(cold.sections[0].profile[0].radius,1.1);assert.equal(cold.sections[0].profile[127].radius,1.1);
});
