import test from 'node:test';
import assert from 'node:assert/strict';
import {insertTrunkSectionPoint,insertTrunkSectionPointAfter,removeTrunkSectionPoint} from '../web/trunk-section-point-edit.js';
import {createDirectTrunkSectionProfileSampler,normalizeTrunkForm,createDirectTrunkForm,createTrunkSectionProfile} from '../web/trunk-form.js';
import {wholeTrunkContourKnots} from '../web/trunk-whole-contour.js';
test('inserted periodic control samples the existing curve and preserves every old point and identity',()=>{
 const p=[{id:'A',angle:10,radius:.8},{id:'B',angle:120,radius:1.2},{id:'C',angle:240,radius:.9},{id:'D',angle:350,radius:.95}],before=structuredClone(p),next=insertTrunkSectionPointAfter(p,'D','NEW');
 assert.equal(next.length,5);const inserted=next.find(p=>p.id==='NEW');assert.equal(inserted.angle,0);assert.ok(Math.abs(inserted.radius-createDirectTrunkSectionProfileSampler(p)(0))<1e-12);for(const old of p){const {tangent,...value}=next.find(p=>p.id===old.id);assert.deepEqual(value,old);assert.ok(Number.isFinite(tangent));}const actual=createDirectTrunkSectionProfileSampler(next),expected=createDirectTrunkSectionProfileSampler(p);for(let i=0;i<4096;i++)assert.ok(Math.abs(actual(i*Math.PI/2048)-expected(i*Math.PI/2048))<1e-11);assert.deepEqual(p,before);
});
test('point insertion respects the circular neighbour gap and direct/legacy point budgets',()=>{
 const p=createTrunkSectionProfile(8);for(const angle of [0,.1,359.9])assert.equal(insertTrunkSectionPoint(p,angle,'NEW'),null);assert.equal(insertTrunkSectionPoint(p,NaN,'NEW'),null);assert.equal(insertTrunkSectionPoint(p,30,p[0].id),null);assert.equal(insertTrunkSectionPointAfter(p,'missing','NEW'),null);
 assert.equal(insertTrunkSectionPoint(wholeTrunkContourKnots({},128),1,'NEW'),null);assert.equal(insertTrunkSectionPoint(createTrunkSectionProfile(32),1,'NEW',{direct:false}),null);assert.equal(insertTrunkSectionPoint(p,20,'NEW',{direct:false}).length,9);
});
test('point deletion affects one explicit identity and cannot open the final triangle or delete an unknown point',()=>{
 const p=createTrunkSectionProfile(4),before=structuredClone(p),next=removeTrunkSectionPoint(p,p[1].id);assert.equal(next.length,3);assert.deepEqual(next,[p[0],p[2],p[3]]);assert.equal(removeTrunkSectionPoint(next,next[0].id),null);assert.equal(removeTrunkSectionPoint(p,'missing'),null);assert.deepEqual(p,before);
});
test('reduced direct contours persist with exact surviving knots and no implicit dense refill in the authoring contract',()=>{
 const f=createDirectTrunkForm(),profile=wholeTrunkContourKnots({},64);f.sections=[{id:'S',t:.4,radius:1,oval:1,roll:0,span:.2,profile:removeTrunkSectionPoint(profile,profile[5].id)}];const saved=normalizeTrunkForm(f),cold=normalizeTrunkForm(JSON.parse(JSON.stringify(saved)));assert.equal(cold.sections[0].profile.length,63);assert.deepEqual(cold,saved);assert.ok(!cold.sections[0].profile.some(p=>p.id===profile[5].id));
});
