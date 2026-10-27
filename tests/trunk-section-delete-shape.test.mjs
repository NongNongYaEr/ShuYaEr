import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createDirectTrunkForm,createTrunkFormPreset,createDirectTrunkSectionProfileSampler,createDirectTrunkFormSampler,updateDirectTrunkSectionTangents,updateTrunkSectionJoinTangents,normalizeTrunkForm,trunkSectionEllipseRadius,sampleDirectTrunkSection,getBaseTrunkForm} from '../web/trunk-form.js';
import {createTrunkChildEditLayer,excludeRemovedTrunkChildren,reconnectRemovedTrunkChildren} from '../web/trunk-child-edit-layer.js';
import {removeTrunkSectionPoints,insertTrunkSectionPoint} from '../web/trunk-section-point-edit.js';
import {wholeTrunkSurfaceSampler,captureWholeTrunkContour,applyWholeTrunkContour} from '../web/trunk-whole-contour.js';
import {editTrunkSectionLayer,trunkSectionMainPoints,resetTrunkSectionLayer} from '../web/trunk-section-layers.js';
import {captureTrunkContour,pasteTrunkContour} from '../web/trunk-contour-transfer.js';
import {normalizeTrunkSectionPresetShape} from '../web/trunk-section-presets.js';
import {createTrunkFormPreviewGeometry,normalizeSettings,DEFAULT_SETTINGS} from '../web/branch-kernel.js';
const rad=a=>a*Math.PI/180,wrap=a=>(a%360+360)%360;
const fixture=()=>{
 const form=createDirectTrunkForm({...createTrunkFormPreset('BUTTRESS'),geometry_version:2,sections:[{id:'S',t:.331,radius:1.05,oval:1,roll:59.7,span:.18,
  profile:Array.from({length:11},(_,i)=>({id:'OLD_'+i,angle:i*360/11,radius:1+.2*Math.cos(i/11*Math.PI*6)}))}]});
 const section=form.sections[0],surfaceAt=wholeTrunkSurfaceSampler(form,section),profile=createTrunkChildEditLayer(section,{surfaceAt}).profile;
 section.profile=profile;section.profile_coarse=trunkSectionMainPoints(section);
 return {form,section,surfaceAt,profile};
};
const options=(section,surfaceAt)=>({exclusions:section.profile_exclusions,surfaceAt});
const sample=(section,surfaceAt)=>createDirectTrunkSectionProfileSampler(section.profile,options(section,surfaceAt));
function deleted(section,ids,surfaceAt){
 const before=section.profile,profile=removeTrunkSectionPoints(before,ids),next=editTrunkSectionLayer(section,profile);
 next.profile_exclusions=excludeRemovedTrunkChildren(section,before,profile);
 next.profile=updateTrunkSectionJoinTangents(profile,before,options(next,surfaceAt));return next;
}
function exact(a,b,surfaceAt){const x=sample(a,surfaceAt),y=sample(b,surfaceAt);for(let i=0;i<4096;i++)assert.ok(Math.abs(x(i*Math.PI/2048)-y(i*Math.PI/2048))<1e-10,`changed at ${i}`);}
function monotoneArc(section,surfaceAt,range){
 const f=sample(section,surfaceAt),start=f(rad(range.start))*surfaceAt(rad(range.start)),end=f(rad(range.end))*surfaceAt(rad(range.end));
 for(let i=0;i<=200;i++){const a=rad(range.start+wrap(range.end-range.start)*i/200),r=f(a)*surfaceAt(a);assert.ok(r>=Math.min(start,end)-1e-10&&r<=Math.max(start,end)+1e-10,`hidden fold ${r} outside ${start},${end}`);}
}

test('deleting a group removes the procedural fold from the final surface, not just its blue handles',()=>{
 const {section,surfaceAt,profile}=fixture(),before=structuredClone(section),ids=profile.filter(p=>p.angle>15&&p.angle<47).map(p=>p.id),next=deleted(section,ids,surfaceAt),range=next.profile_exclusions[0];
 const old=sample(section,surfaceAt),low=Math.min(old(rad(range.start))*surfaceAt(rad(range.start)),old(rad(range.end))*surfaceAt(rad(range.end)));
 assert.ok(Array.from({length:100},(_,i)=>{const a=rad(range.start+wrap(range.end-range.start)*i/100);return old(a)*surfaceAt(a);}).some(r=>r<low-.1),'fixture must reproduce a hidden procedural trough');
 monotoneArc(next,surfaceAt,range);assert.equal(next.profile.length,profile.length-ids.length);
 assert.deepEqual(next.profile_coarse,section.profile_coarse);assert.deepEqual(section,before);
 for(const p of next.profile){const q=profile.find(q=>q.id===p.id);assert.equal(p.angle,q.angle);assert.equal(p.radius,q.radius);}
 for(const a of [100,170,250,310])assert.equal(sample(next,surfaceAt)(rad(a)),old(rad(a)));
});

test('deletion refreshes local inherited tangents and supports multiple disjoint arcs including the circular seam',()=>{
 const {section,surfaceAt,profile}=fixture(),ids=profile.filter(p=>p.angle>345||p.angle<12||p.angle>180&&p.angle<208).map(p=>p.id),next=deleted(section,ids,surfaceAt);
 assert.ok(next.profile_exclusions.some(r=>r.start>r.end));assert.equal(next.profile_exclusions.length,2);
 for(const range of next.profile_exclusions)monotoneArc(next,surfaceAt,range);
 assert.ok(next.profile.every(p=>Number.isFinite(p.tangent)&&Number.isFinite(p.join_tangent)));
 assert.ok(next.profile.some(p=>p.tangent!==profile.find(q=>q.id===p.id).tangent));
 const twice=deleted(next,next.profile.filter(p=>p.angle>12&&p.angle<18).map(p=>p.id),surfaceAt);
 for(const range of twice.profile_exclusions)monotoneArc(twice,surfaceAt,range);
});

test('manual insertion and optional density keep a reconnected surface exactly and do not refill deleted spans',()=>{
 const {section,surfaceAt,profile}=fixture(),next=deleted(section,profile.filter(p=>p.angle>15&&p.angle<47).map(p=>p.id),surfaceAt),range=next.profile_exclusions[0],angle=wrap(range.start+wrap(range.end-range.start)*.43);
 const inserted={...next,profile:insertTrunkSectionPoint(next.profile,angle,'ADDED',options(next,surfaceAt))};exact(next,inserted,surfaceAt);
 const prepared=createTrunkChildEditLayer(next,{surfaceAt,count:128,densify:true});exact(next,{...next,profile:prepared.profile},surfaceAt);
 assert.ok(!prepared.profile.some(p=>wrap(p.angle-range.start)>1e-5&&wrap(p.angle-range.start)<wrap(range.end-range.start)-1e-5));
 assert.equal(updateTrunkSectionJoinTangents(inserted.profile,next.profile,options(next,surfaceAt)),inserted.profile);
});

test('moving a remaining joined control is precise and transports the deleted interval with its endpoints',()=>{
 const {section,surfaceAt,profile}=fixture(),next=deleted(section,profile.filter(p=>p.angle>15&&p.angle<47).map(p=>p.id),surfaceAt),p=next.profile.find(p=>p.angle===next.profile_exclusions[0].start);
 let moved=editTrunkSectionLayer(next,updateDirectTrunkSectionTangents(next.profile.map(q=>q.id===p.id?{...q,angle:q.angle+1,radius:q.radius+.05}:q),next.profile));
 moved.profile=updateTrunkSectionJoinTangents(moved.profile,next.profile,options(moved,surfaceAt));
 assert.equal(moved.profile_exclusions[0].start,p.angle+1);assert.equal(moved.profile_exclusions[0].join,'SMOOTH');
 for(const q of moved.profile)if(q.id!==p.id){assert.equal(q.angle,next.profile.find(p=>p.id===q.id).angle);assert.equal(q.radius,next.profile.find(p=>p.id===q.id).radius);}
 monotoneArc(moved,surfaceAt,moved.profile_exclusions[0]);
 const range=moved.profile_exclusions[0],angle=wrap(range.start+wrap(range.end-range.start)*.5),inserted={...moved,profile:insertTrunkSectionPoint(moved.profile,angle,'MOVED_ADD',options(moved,surfaceAt))};exact(moved,inserted,surfaceAt);
});

test('old deleted spans stay unchanged on load and can be explicitly reconnected once',()=>{
 const {section,surfaceAt,profile}=fixture(),removed=profile.filter(p=>p.angle>15&&p.angle<47),old={...section,profile:profile.filter(p=>!removed.includes(p))};
 old.profile_exclusions=excludeRemovedTrunkChildren(section,profile,old.profile).map(({join,...r})=>r);
 const cold=normalizeTrunkForm(createDirectTrunkForm({geometry_version:2,sections:[old]})).sections[0];exact(old,cold,surfaceAt);
 const repaired=reconnectRemovedTrunkChildren(cold,{surfaceAt});assert.ok(repaired);monotoneArc(repaired,surfaceAt,repaired.profile_exclusions[0]);
 assert.equal(reconnectRemovedTrunkChildren(repaired,{surfaceAt}),null);assert.deepEqual(cold.profile,old.profile);assert.deepEqual(repaired.profile_coarse,old.profile_coarse);
});

test('save, section duplicate, shape clipboard and raw presets retain the actual joined curve',()=>{
 const {form,section,surfaceAt,profile}=fixture(),next=deleted(section,profile.filter(p=>p.angle>15&&p.angle<47).map(p=>p.id),surfaceAt);form.sections=[next];
 const cold=normalizeTrunkForm(JSON.parse(JSON.stringify(form))).sections[0];assert.deepEqual(cold,next);exact(next,cold,surfaceAt);
 exact(next,sampleDirectTrunkSection(form,next.t),surfaceAt);
 exact(next,pasteTrunkContour(next,captureTrunkContour(next,{main:false})),surfaceAt);
 exact(next,normalizeTrunkSectionPresetShape({...next,geometry_version:2}),surfaceAt);
});

test('full-ring capture bakes the joined curve once and preserves destination effect recipes',()=>{
 const {form,section,surfaceAt,profile}=fixture(),next=deleted(section,profile.filter(p=>p.angle>15&&p.angle<47).map(p=>p.id),surfaceAt);form.sections=[next];
 const before=structuredClone(form),captured=captureWholeTrunkContour(form,next);assert.ok(captured.relative_error<.01);
 assert.ok(captured.shape.profile_exclusions.every(r=>!r.join));const applied=applyWholeTrunkContour(form,next,captured.shape),a=sample(next,surfaceAt),b=createDirectTrunkSectionProfileSampler(applied.profile);
 for(let i=0;i<4096;i++){const angle=i*Math.PI/2048;assert.ok(Math.abs(a(angle)-b(angle))/a(angle)<.01);}
 assert.deepEqual(form,before);
});

test('actual bent-branch geometry resolves joins with carrier oval, section ellipse, twist and details in the same frame',()=>{
 const {form,section,profile}=fixture(),settings=normalizeSettings({...DEFAULT_SETTINGS,leaf_density:0,cross_section:'OVAL',oval_ratio:1.2,twist:23,section_roll:11}),carrierOval=.9;
 form.details=[{id:'LOCAL_GROOVE',type:'GROOVE',t:.331,angle:18,width:10,height:.18,strength:.25,seed:3}];
 section.oval=.83;const effect=wholeTrunkSurfaceSampler(form,section,settings),surfaceAt=a=>effect(a)*trunkSectionEllipseRadius(section.oval,a)*trunkSectionEllipseRadius(settings.oval_ratio*carrierOval,a),next=deleted(section,profile.filter(p=>p.angle>15&&p.angle<47).map(p=>p.id),surfaceAt);form.sections=[next];
 const branch={id:0,stableId:'ROOT',parentId:-1,order:0,length:4,startRadius:.3,endRadius:.1,points:[[0,0,0],[.1,0,1],[.4,.1,3],[.5,.2,4]].map(p=>new THREE.Vector3(...p)),sections:[{t:0,radius:1,oval:carrierOval,roll:0},{t:1,radius:1,oval:carrierOval,roll:0}],phase:.2,children:[]};
 const geometry=createTrunkFormPreviewGeometry(branch,settings,form,0),ring=geometry.userData.radiusRings.find(r=>Math.abs(r.t-next.t)<1e-10);assert.ok(ring);
 const sampler=createDirectTrunkFormSampler(form,{settings,carrierSurfaceAt:(t,a)=>trunkSectionEllipseRadius(settings.oval_ratio*carrierOval,a)}),f=sample(next,surfaceAt),range=next.profile_exclusions[0];
 for(let i=0;i<=200;i++){const angle=rad(range.start+wrap(range.end-range.start)*i/200),actual=sampler.radialAt(next.t,angle)*effect(angle)*trunkSectionEllipseRadius(settings.oval_ratio*carrierOval,angle),expected=next.radius*f(angle)*surfaceAt(angle);assert.ok(Math.abs(actual-expected)<1e-10);}
 const positions=geometry.attributes.position;let samples=0;
 for(let i=0;i<ring.count;i++){
  const angle=(ring.sampleAngles?.[i]??i/ring.count*Math.PI*2)+ring.angleOffset,position=new THREE.Vector3().fromBufferAttribute(positions,ring.offset+i),actual=position.distanceTo(new THREE.Vector3(...ring.center)),expected=ring.localRadius*f(angle)*surfaceAt(angle);
  assert.ok(Math.abs(actual-expected)<1e-6,`actual vertex differs at ${i}: ${actual},${expected}`);samples++;
 }
 assert.ok(samples>=64);assert.ok([...positions.array].every(Number.isFinite));assert.ok(geometry.index.count>0);geometry.dispose();
});

test('base-only inspection and explicit fine reset leave the saved joined contour untouched',()=>{
 const {form,section,surfaceAt,profile}=fixture(),next=deleted(section,profile.filter(p=>p.angle>15&&p.angle<47).map(p=>p.id),surfaceAt);form.sections=[next];const before=structuredClone(form),base=getBaseTrunkForm(form),f=createDirectTrunkFormSampler(base),expected=createDirectTrunkSectionProfileSampler(next.profile);
 assert.ok(base.sections[0].profile_exclusions.every(r=>!r.join));for(let i=0;i<360;i++)assert.ok(Math.abs(f.radialAt(next.t,rad(i))/next.radius-expected(rad(i)))<1e-12);
 const reset=resetTrunkSectionLayer(next);assert.ok(reset.profile_exclusions.every(r=>!r.join));assert.ok(reset.profile.every(p=>!('join_tangent' in p)));assert.deepEqual(reset.profile_coarse,next.profile_coarse);
 assert.deepEqual(form,before);
});
