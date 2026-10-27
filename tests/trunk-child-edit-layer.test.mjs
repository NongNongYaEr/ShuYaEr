import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrunkChildEditLayer,excludeRemovedTrunkChildren} from '../web/trunk-child-edit-layer.js';
import {createDirectTrunkSectionProfileSampler,normalizeTrunkForm,updateDirectTrunkSectionTangents,refineDirectTrunkSectionProfile,createDirectTrunkForm,createTrunkFormPreset,sampleTrunkSectionProfile} from '../web/trunk-form.js';
import {wholeTrunkSurfaceSampler} from '../web/trunk-whole-contour.js';
import {trunkFoldFeatures} from '../web/trunk-fold-points.js';
import {captureTrunkContour,pasteTrunkContour} from '../web/trunk-contour-transfer.js';
import {editTrunkSectionLayer,trunkSectionMainPoints} from '../web/trunk-section-layers.js';
import {insertTrunkSectionPointAfter} from '../web/trunk-section-point-edit.js';
import {normalizeTrunkSectionPresetShape} from '../web/trunk-section-presets.js';
const TAU=Math.PI*2,distance=(a,b)=>Math.abs((a-b+540)%360-180);
const section=()=>({id:'S',t:.331,radius:1.05,oval:1,roll:59.7,span:.18,profile:Array.from({length:11},(_,i)=>({id:'OLD_'+i,angle:i*360/11,radius:1+.3*Math.cos(i/11*TAU*3)}))});
const surfaceAt=a=>1-.34*Math.max(0,Math.cos(a*11))**2;
const exact=(a,b)=>{const x=createDirectTrunkSectionProfileSampler(a),y=createDirectTrunkSectionProfileSampler(b);for(let i=0;i<4096;i++)assert.ok(Math.abs(x(i*TAU/4096)-y(i*TAU/4096))<1e-11,`shape changed at ${i}`);};

test('child preparation exposes folds and dense editing handles without authoring or changing the original curve',()=>{
 const s=section(),before=structuredClone(s),layer=createTrunkChildEditLayer(s,{surfaceAt});assert.equal(layer.profile.length,64);assert.equal(layer.unmatched,0);assert.deepEqual(s,before);exact(s.profile,layer.profile);
 for(const p of s.profile){const q=layer.profile.find(q=>q.id===p.id);assert.ok(distance(q.angle,p.angle)<1e-10);assert.equal(q.radius,p.radius);}
 for(const f of trunkFoldFeatures(a=>createDirectTrunkSectionProfileSampler(layer.profile)(a)*surfaceAt(a)))assert.ok(layer.profile.some(p=>distance(p.angle,f.angle)<=.5));
});
test('Hermite subdivision preserves seam intervals and subsequent density changes exactly',()=>{
 const s=section(),p=createTrunkChildEditLayer(s,{surfaceAt}).profile,next=createTrunkChildEditLayer({...s,profile:p},{surfaceAt,count:128,densify:true}).profile;
 assert.equal(next.length,128);exact(s.profile,next);assert.deepEqual(refineDirectTrunkSectionProfile(p),p);
});
test('fine edits keep other point positions and preserve curve segments outside the local neighbourhood',()=>{
 const p=createTrunkChildEditLayer(section(),{surfaceAt}).profile,i=17,next=p.map((q,j)=>j===i?{...q,radius:q.radius+.05}:q),edited=updateDirectTrunkSectionTangents(next,p);
 for(let j=0;j<p.length;j++)if(j!==i){assert.equal(edited[j].angle,p[j].angle);assert.equal(edited[j].radius,p[j].radius);}
 const a=createDirectTrunkSectionProfileSampler(p),b=createDirectTrunkSectionProfileSampler(edited);
 for(let j=0;j<p.length;j++)if(Math.abs(j-i)>2){const angle=(p[j].angle+(p[(j+1)%p.length].angle-p[j].angle+360)%360/2)*Math.PI/180;assert.ok(Math.abs(a(angle)-b(angle))<1e-11);}
 exact(edited,createTrunkChildEditLayer({...section(),profile:edited},{surfaceAt,count:96,densify:true}).profile);
});
test('deleted children are not resurrected by preparation, layer switching or document reload',()=>{
 const s=section(),p=createTrunkChildEditLayer(s,{surfaceAt}).profile,deleted=p.filter((_,i)=>i>=17&&i<=22),next=p.filter(q=>!deleted.some(p=>p.id===q.id));
 s.profile=next;s.profile_exclusions=excludeRemovedTrunkChildren(s,p,next);const form=normalizeTrunkForm({geometry_version:2,enabled:true,sections:[s]}),cold=normalizeTrunkForm(JSON.parse(JSON.stringify(form))).sections[0];
 assert.deepEqual(cold.profile,next);assert.deepEqual(cold.profile_exclusions,s.profile_exclusions);
 const layer=createTrunkChildEditLayer(cold,{surfaceAt,count:128,densify:true});for(const d of deleted)assert.ok(!layer.profile.some(p=>distance(p.angle,d.angle)<1e-5));
});
test('final contour copy retains shape slopes and deleted arcs, while main movement carries the fine layer',()=>{
 const s=section();s.profile=createTrunkChildEditLayer(s,{surfaceAt}).profile;s.profile_exclusions=[{start:310,end:20}];
 const shape=captureTrunkContour(s,{main:false}),pasted=pasteTrunkContour({...s,t:.6},shape);assert.deepEqual(pasted.profile_exclusions,s.profile_exclusions);exact(s.profile,pasted.profile);
 const main=trunkSectionMainPoints(s),next=main.map((p,i)=>i===2?{...p,radius:p.radius+.05}:p),rebased=editTrunkSectionLayer(s,next,{main:true,surfaceAt});
 assert.equal(rebased.profile.length,s.profile.length);assert.ok(rebased.profile.every(p=>Number.isFinite(p.tangent)));assert.deepEqual(rebased.profile.map(p=>p.id),s.profile.map(p=>p.id));
 exact(rebased.profile,createTrunkChildEditLayer(rebased,{surfaceAt}).profile);
 const rotated=editTrunkSectionLayer(s,main.map((p,i)=>i===2?{...p,angle:p.angle+2,radius:p.radius+.05}:p),{main:true,surfaceAt});
 exact(rotated.profile,createTrunkChildEditLayer(rotated,{surfaceAt}).profile);
});
test('legacy curves ignore subdivision metadata and a full child budget never evicts hand authored controls',()=>{
 const p=section().profile;for(let i=0;i<360;i++)assert.equal(sampleTrunkSectionProfile(p,i*Math.PI/180),sampleTrunkSectionProfile(p.map(p=>({...p,tangent:10000})),i*Math.PI/180));
 const s={...section(),profile:Array.from({length:128},(_,i)=>({id:'KEEP_'+i,angle:i*360/128,radius:1}))},layer=createTrunkChildEditLayer(s,{surfaceAt});assert.equal(layer.profile.length,128);assert.deepEqual(layer.profile.map(p=>p.id),s.profile.map(p=>p.id));exact(s.profile,layer.profile);
});
test('the asymmetric buttress contour gets directly editable corners without fitting error',()=>{
 const s=section(),form=createDirectTrunkForm({...createTrunkFormPreset('BUTTRESS'),geometry_version:2,sections:[s]}),effect=wholeTrunkSurfaceSampler(form,s),layer=createTrunkChildEditLayer(s,{surfaceAt:effect});assert.equal(layer.unmatched,0);exact(s.profile,layer.profile);
});

test('adding a main control preserves the fine skin and its slopes exactly and preset reuse retains both layers',()=>{
 const s=section();s.profile=createTrunkChildEditLayer(s,{surfaceAt}).profile;s.profile_exclusions=[{start:300,end:20}];
 const main=trunkSectionMainPoints(s),next=insertTrunkSectionPointAfter(main,main[3].id,'ADDED_MAIN'),edited=editTrunkSectionLayer(s,next,{main:true,surfaceAt});
 assert.equal(edited.profile_coarse.length,11);assert.deepEqual(edited.profile,s.profile);exact(main,edited.profile_coarse);
 const shape=normalizeTrunkSectionPresetShape({...edited,geometry_version:2});assert.deepEqual(shape.profile_exclusions,s.profile_exclusions);exact(shape.profile_coarse,next);exact(shape.profile,s.profile);
});

test('selected display-only child anchors survive a whole-ring slide without authoring or changing its curve',()=>{
 const s=section(),before=structuredClone(s),layer=createTrunkChildEditLayer(s,{surfaceAt}),point=layer.profile.find(p=>p.id.startsWith('FOLD_')),moved={...s,t:.42};assert.ok(point);
 const shifted=a=>surfaceAt(a+.04),next=createTrunkChildEditLayer(moved,{surfaceAt:shifted,anchors:[{id:point.id,angle:point.angle}]});
 assert.ok(next.profile.some(p=>p.id===point.id&&p.angle===point.angle));assert.ok(next.profile.length<=128);exact(moved.profile,next.profile);assert.deepEqual(s,before);assert.equal(moved.profile.length,s.profile.length);
});
