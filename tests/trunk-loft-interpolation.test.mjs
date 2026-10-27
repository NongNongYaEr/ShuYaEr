import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {normalizeTrunkForm,createDirectTrunkForm,createDirectTrunkFormSampler,createTrunkSectionProfile,sampleDirectTrunkSection,trunkSectionEllipseRadius} from '../web/trunk-form.js';
import {createTrunkFormPreviewGeometry,createSweptBranchGeometry,normalizeSettings,DEFAULT_SETTINGS} from '../web/branch-kernel.js';
import {insertTrunkSectionPointAfter} from '../web/trunk-section-point-edit.js';
import {trunkLoftValue} from '../web/trunk-loft-interpolation.js';
const settings=normalizeSettings({...DEFAULT_SETTINGS,leaf_density:0,twist:22}),rad=a=>a*Math.PI/180;
const branch=()=>({id:0,stableId:'ROOT',parentId:-1,order:0,length:8,startRadius:.4,endRadius:.2,
 points:[[0,0,0],[.2,0,1],[.8,.1,2],[1.1,.1,5],[1.2,.2,8]].map(p=>new THREE.Vector3(...p)),sections:[],children:[],phase:.2,windPhase:.4,windStiffness:1});
const form=()=>createDirectTrunkForm({geometry_version:2,sections:[
 {id:'A',t:.227378,radius:1.5,oval:1.2,roll:170,profile:createTrunkSectionProfile(12).map((p,i)=>({...p,radius:1+.3*Math.cos(i*Math.PI/2)}))},
 {id:'B',t:.331068,radius:.8,oval:.9,roll:-170,profile:createTrunkSectionProfile(12)},
 {id:'C',t:.62473,radius:1.2,oval:1.1,roll:-140,profile:createTrunkSectionProfile(12)}],
 mesh:{version:1,radial_segments:128,segment_length:.04,detail_samples:12,adaptive_details:true}});
const smooth=f=>({...f,loft_interpolation:'SMOOTH'});

test('old recipes keep linear interpolation and only direct forms accept explicit smooth loft',()=>{
 const f=form(),before=structuredClone(f),linear=createDirectTrunkFormSampler(f),unknown=normalizeTrunkForm({...f,loft_interpolation:'other'});
 assert.ok(!('loft_interpolation' in f));assert.deepEqual(unknown,f);assert.deepEqual(f,before);
 assert.equal(normalizeTrunkForm({...smooth(f),geometry_version:undefined}).loft_interpolation,undefined);
 assert.equal(normalizeTrunkForm(smooth(f)).loft_interpolation,'SMOOTH');
 assert.equal(linear.sectionAt((f.sections[0].t+f.sections[1].t)/2).radius,(1.5+.8)/2);
});

test('monotone loft is C1 across nonuniform authored circles and does not overshoot',()=>{
 const keys=[{t:0,y:1},{t:.227378,y:2.3},{t:.331068,y:.9},{t:.62473,y:1.4},{t:1,y:1}],read=k=>k.y;
 for(let i=0;i<keys.length-1;i++)for(let j=0;j<=100;j++){const y=trunkLoftValue(keys,i,j/100,read);assert.ok(y>=Math.min(keys[i].y,keys[i+1].y)-1e-12&&y<=Math.max(keys[i].y,keys[i+1].y)+1e-12);}
 const f=createDirectTrunkFormSampler(smooth(form())),h=1e-7;
 for(const s of form().sections)for(let i=0;i<72;i++){
  const a=rad(i*5),at=f.radialAt(s.t,a),left=(at-f.radialAt(s.t-h,a))/h,right=(f.radialAt(s.t+h,a)-at)/h;assert.ok(Math.abs(left-right)<.001,`${s.id} slope split ${left},${right}`);
 }
});

test('smooth mode preserves every authored cross section, duplicates use last precedence, and roll stays unwrapped',()=>{
 const source=form(),linear=createDirectTrunkFormSampler(source),f=createDirectTrunkFormSampler(smooth(source));
 for(const s of source.sections)for(let i=0;i<360;i++)assert.ok(Math.abs(f.radialAt(s.t,rad(i))-linear.radialAt(s.t,rad(i)))<1e-12);
 for(const s of source.sections){assert.equal(f.sectionAt(s.t).radius,s.radius);assert.equal(f.sectionAt(s.t).oval,s.oval);}
 assert.ok(f.sectionAt(.28).roll>=170&&f.sectionAt(.28).roll<=190);
 const dupe=normalizeTrunkForm({...smooth(source),sections:[...source.sections,{...source.sections[0],id:'LAST',radius:2}]});assert.equal(createDirectTrunkFormSampler(dupe).sectionAt(source.sections[0].t).radius,2);
});

test('smooth key capture stays editable, exact copies preserve knots, and cold normalization keeps the mode',()=>{
 const f=smooth(form()),before=structuredClone(f),key=f.sections[1],exact=sampleDirectTrunkSection(f,key.t),added={id:'NEW',t:.45,...sampleDirectTrunkSection(f,.45)},next=normalizeTrunkForm({...f,sections:[...f.sections,added]});
 assert.deepEqual(exact.profile,key.profile);assert.deepEqual(f,before);assert.equal(next.loft_interpolation,'SMOOTH');assert.deepEqual(normalizeTrunkForm(JSON.parse(JSON.stringify(next))),next);
 const sample=createDirectTrunkFormSampler(next);for(const p of added.profile||[]){const a=rad(p.angle);assert.ok(Math.abs(sample.radialAt(added.t,a)-added.radius*trunkSectionEllipseRadius(added.oval,a)*p.radius)<1e-11);}
});

test('direct transported tangents use source direction bisectors rather than tessellation ring spacing',()=>{
 const b=branch(),f=form(),g=createSweptBranchGeometry({...b,trunkForm:f},64,settings),ring=g.userData.radiusRings.find(r=>Math.abs(r.t-.5)<1e-12),p=b.points[2],expected=p.clone().sub(b.points[1]).normalize().add(b.points[3].clone().sub(p).normalize()).normalize();
 assert.ok(ring);assert.ok(new THREE.Vector3(...ring.tangent).distanceTo(expected)<1e-12);
 const center=b.points[2];assert.ok(new THREE.Vector3(...ring.center).distanceTo(center)<1e-12);g.dispose();
});

test('adding a horizontal main/child control keeps the smooth loft unchanged at every height',()=>{
 const f=smooth(form()),next=structuredClone(f),s=next.sections[0];s.profile=insertTrunkSectionPointAfter(s.profile,s.profile[2].id,'ADDED');const before=createDirectTrunkFormSampler(f),after=createDirectTrunkFormSampler(next);
 for(let ti=0;ti<=20;ti++)for(let ai=0;ai<360;ai++)assert.ok(Math.abs(before.radialAt(ti/20,rad(ai))-after.radialAt(ti/20,rad(ai)))<1e-10);
});

test('smooth loft removes the strong normal break at a control circle without moving its vertices',()=>{
 const b=branch();b.points=b.points.map((p,i)=>new THREE.Vector3(0,0,i*2));const a=createTrunkFormPreviewGeometry(b,{...settings,twist:0},form()),c=createTrunkFormPreviewGeometry(b,{...settings,twist:0},smooth(form()));
 const jump=(g,t)=>{const r=g.userData.radiusRings,i=r.findIndex(s=>Math.abs(s.t-t)<1e-12),n=g.attributes.normal;let sum=0;for(let k=0;k<r[i].count;k++)sum+=new THREE.Vector3().fromBufferAttribute(n,r[i-1].offset+k).angleTo(new THREE.Vector3().fromBufferAttribute(n,r[i+1].offset+k));return sum/r[i].count;};
 for(const s of form().sections.slice(0,2))assert.ok(jump(c,s.t)<jump(a,s.t)*.35);
 for(const s of form().sections){const ar=a.userData.radiusRings.find(r=>Math.abs(r.t-s.t)<1e-12),cr=c.userData.radiusRings.find(r=>Math.abs(r.t-s.t)<1e-12);assert.deepEqual(a.attributes.position.array.slice(ar.offset*3,(ar.offset+ar.count)*3),c.attributes.position.array.slice(cr.offset*3,(cr.offset+cr.count)*3));}
 a.dispose();c.dispose();
});

test('smooth drag preview and cold final share exact centres, frames and skin within the vertex budget',()=>{
 const b=branch(),f=smooth(form()),before=JSON.stringify(f),live=createTrunkFormPreviewGeometry(b,settings,f,0,{vertexLimit:48000}),final=createTrunkFormPreviewGeometry(b,settings,JSON.parse(before));let shared=0;
 assert.ok(live.attributes.position.count<=48000);
 for(const a of live.userData.radiusRings){const c=final.userData.radiusRings.find(r=>Math.abs(r.t-a.t)<1e-12);if(!c)continue;assert.deepEqual(a.center,c.center);assert.deepEqual(a.tangent,c.tangent);assert.deepEqual(live.attributes.position.array.slice(a.offset*3,(a.offset+a.count)*3),final.attributes.position.array.slice(c.offset*3,(c.offset+c.count)*3));shared++;}
 assert.ok(shared>=65);assert.equal(JSON.stringify(f),before);live.dispose();final.dispose();
});
