import test from 'node:test';
import assert from 'node:assert/strict';
import {captureTrunkContour,pasteTrunkContour} from '../web/trunk-contour-transfer.js';
import {trunkSectionMainPoints} from '../web/trunk-section-layers.js';
import {createTrunkSectionProfile,createDirectTrunkSectionProfileSampler} from '../web/trunk-form.js';
const ring=(id,n=64)=>({id,t:.34,radius:1.2,oval:.82,roll:27,span:.21,profile:Array.from({length:n},(_,i)=>({id:id+i,angle:i*360/n,radius:1+.1*Math.cos(i*360/n*Math.PI/180*13)}))});
const shape=r=>r.map(({angle,radius})=>({angle,radius}));
test('main-only reuse retains destination fine identities and relative fine displacement, and every ring dimension',()=>{
 const src=ring('SRC'),dst=ring('DST',96),before=structuredClone(dst);src.profile_coarse=createTrunkSectionProfile(7).map((p,i)=>({...p,radius:.8+i*.03}));
 const copied=captureTrunkContour(src),next=pasteTrunkContour(dst,copied),oldMain=createDirectTrunkSectionProfileSampler(trunkSectionMainPoints(dst)),newMain=createDirectTrunkSectionProfileSampler(next.profile_coarse);
 assert.equal(next.profile_coarse.length,7);assert.deepEqual(next.profile.map(p=>p.id),dst.profile.map(p=>p.id));
 for(let i=0;i<96;i++){const p=dst.profile[i],q=next.profile[i];assert.equal(q.angle,p.angle);assert.ok(Math.abs(q.radius/newMain(q.angle*Math.PI/180)-p.radius/oldMain(p.angle*Math.PI/180))<1e-10);}
 for(const k of ['id','t','radius','oval','roll','span'])assert.deepEqual(next[k],dst[k]);assert.deepEqual(dst,before);
});
test('complete main and fine reuse copies exact shape with new identities without capturing surface recipes or source placement',()=>{
 const src=ring('SRC',128),dst=ring('DST',64);src.profile_coarse=createTrunkSectionProfile(12);const old=structuredClone(src),copied=captureTrunkContour(src,{main:false}),next=pasteTrunkContour(dst,copied,{idFor:(kind,i)=>'TARGET_'+kind+'_'+i});
 assert.deepEqual(shape(next.profile),shape(src.profile));assert.deepEqual(shape(next.profile_coarse),shape(src.profile_coarse));assert.ok(next.profile.every(p=>p.id.startsWith('TARGET_CHILD_')));assert.deepEqual(src,old);
 assert.deepEqual(Object.keys(copied).sort(),['direct','fine','main','scope']);assert.equal(next.t,dst.t);copied.fine[0].radius=2;assert.deepEqual(src,old);
});
test('legacy reuse retains destination metadata and recipe versions are never implicitly converted',()=>{
 const src={...ring('SRC'),profile:createTrunkSectionProfile(8)},dst={...ring('DST'),t:.6};const recipe=captureTrunkContour(src,{direct:false});assert.equal(pasteTrunkContour(dst,recipe),null);assert.equal(pasteTrunkContour(dst,captureTrunkContour(src),{direct:false}),null);
 const next=pasteTrunkContour(dst,recipe,{direct:false});assert.deepEqual(shape(next.profile),shape(src.profile));assert.equal(next.t,.6);assert.equal(next.roll,dst.roll);
});
test('invalid or incompatible contours and unsafe rebases fail without mutating the target',()=>{
 const dst=ring('DST'),before=structuredClone(dst);for(const x of [null,{}, {direct:true,scope:'BASE',main:[]},{direct:true,scope:'FINAL',main:createTrunkSectionProfile(8)}, {direct:true,scope:'BAD',main:createTrunkSectionProfile(8)}])assert.equal(pasteTrunkContour(dst,x),null);
 assert.deepEqual(dst,before);
 const src=ring('SRC');src.profile_coarse=createTrunkSectionProfile(10).map(p=>({...p,radius:64}));dst.profile=dst.profile.map(p=>({...p,radius:64}));dst.profile_coarse=createTrunkSectionProfile(10).map(p=>({...p,radius:.001}));const unsafeBefore=structuredClone(dst);assert.equal(pasteTrunkContour(dst,captureTrunkContour(src)),null);assert.deepEqual(dst,unsafeBefore);
});
