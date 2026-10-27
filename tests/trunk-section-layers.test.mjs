import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createDirectTrunkForm,normalizeTrunkForm,createTrunkSectionProfile,createDirectTrunkSectionProfileSampler,sampleDirectTrunkSection} from '../web/trunk-form.js';
import {trunkSectionMainPoints,trunkSectionChildPoints,rebaseTrunkSectionChildren,editTrunkSectionLayer,resetTrunkSectionLayer} from '../web/trunk-section-layers.js';
import {insertTrunkSectionPointAfter,removeTrunkSectionPoints} from '../web/trunk-section-point-edit.js';
import {normalizeTrunkSectionPresetShape} from '../web/trunk-section-presets.js';
import {captureWholeTrunkContour,applyWholeTrunkContour,wholeTrunkSurfaceSampler} from '../web/trunk-whole-contour.js';
import {createTrunkFormPreviewGeometry,normalizeSettings,DEFAULT_SETTINGS} from '../web/branch-kernel.js';

const rad=a=>a*Math.PI/180;
const fixture=()=>({id:'RING',t:.34,radius:1.13,oval:.83,roll:21,span:.2,
  profile:Array.from({length:64},(_,i)=>({id:'CHILD_'+i,angle:i*360/64,radius:1+.15*Math.cos(rad(i*360/64)*3)+.06*Math.cos(rad(i*360/64)*13)}))});

test('opening both layers is read-only and sparse old authoring points remain intact',()=>{
  const section=fixture(),before=structuredClone(section);
  assert.equal(trunkSectionMainPoints(section).length,10);assert.equal(trunkSectionChildPoints(section).length,64);
  assert.deepEqual(section,before);assert.equal(section.profile_coarse,undefined);
  const old={...section,profile:section.profile.slice(0,8)};assert.deepEqual(trunkSectionChildPoints(old),old.profile);
  assert.equal(trunkSectionChildPoints({}).length,64);
});

test('fine editing keeps a separate main set and both point identities persist',()=>{
  const section=fixture(),main=trunkSectionMainPoints(section),next=section.profile.map((p,i)=>({...p,radius:p.radius+(i===5?.13:0)}));
  const edited=editTrunkSectionLayer(section,next);
  assert.deepEqual(edited.profile_coarse,main);assert.deepEqual(edited.profile,next);
  const again=editTrunkSectionLayer(edited,edited.profile.map((p,i)=>({...p,radius:p.radius+(i===6?.03:0)})));
  assert.deepEqual(again.profile_coarse,main);assert.deepEqual(section,fixture());
});

test('a main radial edit retains the fine displacement, count and identities',()=>{
  const section=fixture(),main=trunkSectionMainPoints(section),changed=main.map((p,i)=>({...p,radius:p.radius*(i===3?1.2:1)}));
  const edited=editTrunkSectionLayer(section,changed,{main:true}),beforeSample=createDirectTrunkSectionProfileSampler(main),afterSample=createDirectTrunkSectionProfileSampler(changed);
  assert.equal(edited.profile.length,64);assert.deepEqual(edited.profile.map(p=>p.id),section.profile.map(p=>p.id));
  for(let i=0;i<64;i++)assert.ok(Math.abs(edited.profile[i].radius/afterSample(rad(edited.profile[i].angle))-section.profile[i].radius/beforeSample(rad(section.profile[i].angle)))<1e-10);
  for(const k of ['t','radius','oval','roll','span'])assert.equal(edited[k],section[k]);
});

test('main rotation across the seam carries fine points and compensates existing grooves',()=>{
  const section=fixture(),main=trunkSectionMainPoints(section),changed=main.map(p=>({...p,angle:(p.angle+30)%360,radius:p.radius*1.1})),surfaceAt=a=>.85+.13*Math.cos(a*9);
  const result=rebaseTrunkSectionChildren(section.profile,main,changed,{surfaceAt}),byId=new Map(result.map(p=>[p.id,p]));
  assert.equal(result.length,64);
  for(const p of section.profile){const q=byId.get(p.id);assert.ok(Math.abs(q.angle-(p.angle+30)%360)<1e-8);assert.ok(Math.abs(q.radius*surfaceAt(rad(q.angle))-p.radius*surfaceAt(rad(p.angle))*1.1)<1e-10);}
});

test('main insert and removal retain the complete child set and closed shape',()=>{
  const section=fixture(),main=trunkSectionMainPoints(section),inserted=insertTrunkSectionPointAfter(main,main[2].id,'NEW_MAIN');
  const added=editTrunkSectionLayer(section,inserted,{main:true});assert.equal(added.profile_coarse.length,11);assert.equal(added.profile.length,64);
  assert.deepEqual(added.profile.map(p=>[p.id,p.angle]),section.profile.map(p=>[p.id,p.angle]));
  const removed=editTrunkSectionLayer(added,removeTrunkSectionPoints(added.profile_coarse,[main[1].id,main[3].id]),{main:true});
  assert.equal(removed.profile_coarse.length,9);assert.equal(removed.profile.length,64);assert.ok(removed.profile.every(p=>p.radius>0));
});

test('child insert and group removal never replace or reduce main controls',()=>{
  const section=editTrunkSectionLayer(fixture(),fixture().profile),coarse=structuredClone(section.profile_coarse);
  const added=editTrunkSectionLayer(section,insertTrunkSectionPointAfter(section.profile,section.profile[3].id,'NEW_CHILD'));
  assert.equal(added.profile.length,65);assert.deepEqual(added.profile_coarse,coarse);
  const removed=editTrunkSectionLayer(added,removeTrunkSectionPoints(added.profile,['NEW_CHILD',added.profile[6].id]));
  assert.equal(removed.profile.length,63);assert.deepEqual(removed.profile_coarse,coarse);
});

test('layer resets preserve counts and the independent other-layer shape',()=>{
  const section=editTrunkSectionLayer(fixture(),fixture().profile),fineReset=resetTrunkSectionLayer(section),mainReset=resetTrunkSectionLayer(section,{main:true});
  assert.deepEqual(fineReset.profile_coarse,section.profile_coarse);assert.equal(fineReset.profile.length,64);
  const sample=createDirectTrunkSectionProfileSampler(section.profile_coarse);for(const p of fineReset.profile)assert.equal(p.radius,sample(rad(p.angle)));
  assert.equal(mainReset.profile.length,64);assert.ok(mainReset.profile_coarse.every(p=>p.radius===1));
});

test('normalization, JSON reload, exact capture and presets retain both layers; V1 ignores the metadata',()=>{
  const section=editTrunkSectionLayer(fixture(),fixture().profile),form=createDirectTrunkForm({geometry_version:2,sections:[section]}),reloaded=normalizeTrunkForm(JSON.parse(JSON.stringify(form)));
  assert.deepEqual(reloaded.sections[0],form.sections[0]);assert.deepEqual(sampleDirectTrunkSection(form,section.t).profile_coarse,section.profile_coarse);
  assert.deepEqual(normalizeTrunkSectionPresetShape({geometry_version:2,...section}).profile_coarse,section.profile_coarse);
  assert.equal(normalizeTrunkForm({sections:[section]}).sections[0].profile_coarse,undefined);
  assert.equal(createDirectTrunkForm({geometry_version:2,sections:[fixture()]}).sections[0].profile_coarse,undefined);
});

test('whole-shape capture and reuse compensate parent controls for destination surface effects',()=>{
  const section=editTrunkSectionLayer(fixture(),fixture().profile),form=createDirectTrunkForm({geometry_version:2,sections:[section],groove_depth:.18,groove_count:8}),captured=captureWholeTrunkContour(form,form.sections[0]);
  const destination=createDirectTrunkForm({...form,groove_depth:.23,groove_count:7}),applied=applyWholeTrunkContour(destination,destination.sections[0],captured.shape),a=wholeTrunkSurfaceSampler(form,form.sections[0]),b=wholeTrunkSurfaceSampler(destination,destination.sections[0]);
  assert.equal(applied.profile_coarse.length,10);
  for(let i=0;i<10;i++){const p=section.profile_coarse[i],q=applied.profile_coarse[i];assert.equal(q.id,p.id);assert.ok(Math.abs(q.radius*b(rad(q.angle))-p.radius*a(rad(p.angle)))<1e-10);}
});

test('limits reject point loss and coupled child overflow instead of silently clipping a layer',()=>{
  const section=fixture(),main=trunkSectionMainPoints(section);
  assert.equal(editTrunkSectionLayer(section,Array.from({length:33},(_,i)=>({id:'M'+i,angle:i*360/33,radius:1})),{main:true}),null);
  const almostLimit={...section,profile:section.profile.map(p=>({...p,radius:63}))};
  assert.equal(rebaseTrunkSectionChildren(almostLimit.profile,main,main.map(p=>({...p,radius:p.radius*2}))),null);
  assert.deepEqual(editTrunkSectionLayer(section,main,{main:true}).profile,section.profile);
});

test('resolved child profile remains the sole geometry contract for authoring and export',()=>{
  const section=editTrunkSectionLayer(fixture(),fixture().profile),rich=createDirectTrunkForm({geometry_version:2,sections:[section],groove_depth:.21,groove_count:9}),flat=structuredClone(rich);delete flat.sections[0].profile_coarse;
  const branch={id:0,stableId:'ROOT',parentId:-1,order:0,length:4,startRadius:.3,endRadius:.1,points:[[0,0,0],[.1,0,1],[.4,.1,3],[.5,.2,4]].map(p=>new THREE.Vector3(...p)),sections:[],phase:.2,children:[]},settings=normalizeSettings({...DEFAULT_SETTINGS,leaf_density:0});
  const a=createTrunkFormPreviewGeometry(branch,settings,rich,0),b=createTrunkFormPreviewGeometry(branch,settings,flat,0);
  try{assert.deepEqual(Object.keys(a.attributes),Object.keys(b.attributes));for(const k of Object.keys(a.attributes))assert.deepEqual(a.attributes[k].array,b.attributes[k].array);assert.deepEqual(a.index.array,b.index.array);}finally{a.dispose();b.dispose();}
});
