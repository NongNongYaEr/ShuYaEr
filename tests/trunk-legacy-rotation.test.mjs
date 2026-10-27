import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {normalizeTrunkForm,createDirectTrunkForm,createTrunkSectionProfile,trunkFormSectionAt} from '../web/trunk-form.js';
import {createTrunkFormPreviewGeometry,normalizeSettings,DEFAULT_SETTINGS} from '../web/branch-kernel.js';
import {createLegacyRotationOffsetSampler} from '../web/trunk-legacy-rotation.js';
import {interpolateSectionRing} from '../web/trunk-section-interaction.js';
import {transformTrunkSectionGroup} from '../web/trunk-section-group.js';

const settings=normalizeSettings({...DEFAULT_SETTINGS,leaf_density:0,twist:22}),
 branch=()=>({id:0,stableId:'ROOT',parentId:-1,order:0,length:8,startRadius:.4,endRadius:.2,points:[[0,0,0],[.2,0,1],[.8,.1,2],[1.1,.1,5],[1.2,.2,8]].map(p=>new THREE.Vector3(...p)),sections:[],children:[],phase:.2,windPhase:.4,windStiffness:1}),
 form=()=>normalizeTrunkForm({preset:'BUTTRESS',sections:[{id:'ROOT',t:.2730200559,radius:1.2,roll:57.625885,span:.18},{id:'MID',t:.4625840375,radius:1.1,roll:61.15415,span:.18},{id:'LOWER',t:.7027781683840117,radius:1.3,roll:-21.902,span:.18},{id:'UPPER',t:.7317016601804546,radius:1,roll:49.2502,span:.18}].map(s=>({...s,profile:createTrunkSectionProfile(8).map((p,i)=>({...p,radius:1+.25*Math.cos(i*1.6)}))}))}),
 edit=(f,ids,angle)=>({...f,sections:f.sections.map(s=>({...s,...transformTrunkSectionGroup(f.sections,ids,'TWIST',angle,{localRoll:true}).updates.find(p=>p.id===s.id)}))}),
 circle=(g,t)=>interpolateSectionRing(g.userData.radiusRings,t,g.attributes.position),
 close=(a,b,tolerance=2e-6)=>{assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<tolerance,`${i}: ${a[i]} / ${b[i]}`);};

test('legacy overlapping weighted roll reproduces the reported unselected circle rotation',()=>{
 const f=form(),before=trunkFormSectionAt(f,f.sections[2].t).roll,raw=structuredClone(f);raw.sections[3].roll+=90;
 assert.ok(Math.abs(trunkFormSectionAt(raw,f.sections[2].t).roll-before)>75,'nearby old weighted influences really rotate together');
 const corrected=edit(f,['UPPER'],90);assert.equal(trunkFormSectionAt(corrected,f.sections[2].t).roll,before);
 assert.ok(Math.abs(trunkFormSectionAt(corrected,f.sections[3].t).roll-trunkFormSectionAt(f,f.sections[3].t).roll-90)<1e-10);
});
test('local correction bases stop at authored neighbours and original influence boundaries',()=>{
 const f=edit(form(),['UPPER'],90),sample=createLegacyRotationOffsetSampler(f.sections);
 for(const s of f.sections)assert.ok(Math.abs(sample(s.t)-(s.id==='UPPER'?90:0))<1e-10);
 assert.equal(sample(0),0);assert.equal(sample(1),0);assert.equal(sample(.6),0);
 const both=edit(form(),['LOWER','UPPER'],45),group=createLegacyRotationOffsetSampler(both.sections);
 for(let i=0;i<=20;i++)assert.ok(Math.abs(group(both.sections[2].t+(both.sections[3].t-both.sections[2].t)*i/20)-45)<1e-9);
});
test('legacy local gestures preserve original weighted rolls and do not wrap away full turns',()=>{
 const f=form(),source=structuredClone(f),group=transformTrunkSectionGroup(f.sections,['LOWER','UPPER'],'TWIST',360,{localRoll:true});
 assert.deepEqual(group.updates,[{id:'LOWER',roll_offset:360},{id:'UPPER',roll_offset:360}]);assert.deepEqual(f,source);
 assert.equal(transformTrunkSectionGroup([{id:'X',roll_offset:3590}],['X'],'TWIST',30,{localRoll:true}).value,10);
 assert.deepEqual(transformTrunkSectionGroup(f.sections,[],'TWIST',20,{localRoll:true}).updates,[]);
});
test('unselected visible V1 outlines stay fixed even when the original mesh omitted their exact heights',()=>{
 const f=form(),b=branch(),before=createTrunkFormPreviewGeometry(b,settings,f),after=createTrunkFormPreviewGeometry(b,settings,edit(f,['UPPER'],90));
 try{
  assert.ok(!before.userData.radiusRings.some(r=>r.t===f.sections[2].t),'regression requires the formerly interpolated cyan circle');
  for(const s of f.sections){const a=circle(before,s.t),c=circle(after,s.t);assert.ok(after.userData.radiusRings.some(r=>r.t===s.t));close(a.center,c.center);
   for(let i=0;i<a.count;i++){const expected=s.id==='UPPER'?a.points[i].clone().sub(new THREE.Vector3(...a.center)).applyAxisAngle(new THREE.Vector3(...a.tangent),Math.PI/2).add(new THREE.Vector3(...a.center)):a.points[i];close(expected.toArray(),c.points[i].toArray());}
  }
  for(const r of before.userData.radiusRings.filter(r=>r.t<f.sections[2].t||r.t>f.sections[3].t+f.sections[3].span)){const c=circle(after,r.t);for(let i=0;i<r.count;i++)close(new THREE.Vector3().fromBufferAttribute(before.attributes.position,r.offset+i).toArray(),c.points[i].toArray(),1e-10);}
  for(const attr of Object.values(after.attributes)){assert.equal(attr.count,after.attributes.position.count);assert.ok(attr.array.every(Number.isFinite));}
  assert.ok(after.index.array.every(i=>i<after.attributes.position.count));assert.equal(after.index.count,after.userData.radiusRings.length*after.userData.radiusRings[0].count*6);
 }finally{before.dispose();after.dispose();}
});
test('Shift-selected legacy circles rotate rigidly by one angle and the other visible circles remain fixed',()=>{
 const f=form(),b=branch(),before=createTrunkFormPreviewGeometry(b,settings,f),after=createTrunkFormPreviewGeometry(b,settings,edit(f,['MID','UPPER'],-63));
 try{for(const s of f.sections){const a=circle(before,s.t),c=circle(after,s.t),angle=['MID','UPPER'].includes(s.id)?-63*Math.PI/180:0;for(let i=0;i<a.count;i++){const expected=a.points[i].clone().sub(new THREE.Vector3(...a.center)).applyAxisAngle(new THREE.Vector3(...a.tangent),angle).add(new THREE.Vector3(...a.center));close(expected.toArray(),c.points[i].toArray());}}}finally{before.dispose();after.dispose();}
});
test('local rotation obeys the interactive vertex budget while retaining every authored circle',()=>{
 const f={...form(),mesh:{version:1,radial_segments:128,segment_length:.02,detail_samples:12,adaptive_details:true}},b=branch(),before=createTrunkFormPreviewGeometry(b,settings,f,0,{vertexLimit:8192}),after=createTrunkFormPreviewGeometry(b,settings,edit(f,['UPPER'],60),0,{vertexLimit:8192});
 try{assert.ok(after.attributes.position.count<=8192);for(const s of f.sections){assert.ok(after.userData.radiusRings.some(r=>r.t===s.t));if(s.id==='UPPER')continue;const a=circle(before,s.t),c=circle(after,s.t);for(let i=0;i<a.count;i++)close(a.points[i].toArray(),c.points[i].toArray());}}finally{before.dispose();after.dispose();}
});
test('a control virtually on an old mesh row does not create coincident transverse rows',()=>{
 const f=form();f.sections[3].t=.500000000001;const g=createTrunkFormPreviewGeometry(branch(),settings,edit(f,['UPPER'],60));
 try{const rows=g.userData.radiusRings;assert.ok(rows.some(r=>r.t===f.sections[3].t));for(let i=1;i<rows.length;i++)assert.ok(rows[i].t-rows[i-1].t>=1e-10);}finally{g.dispose();}
});
test('untouched V1 recipes keep their data; local rotation survives normalization, reload and explicit direct conversion',()=>{
 const f=form(),before=JSON.stringify(f);assert.equal(JSON.stringify(normalizeTrunkForm(f)),before);assert.ok(f.sections.every(s=>!('roll_offset'in s)));
 const changed=normalizeTrunkForm(edit(f,['UPPER'],70)),loaded=normalizeTrunkForm(JSON.parse(JSON.stringify(changed)));
 assert.deepEqual(loaded,changed);assert.deepEqual(loaded.sections.slice(0,3),f.sections.slice(0,3));assert.equal(loaded.sections[3].roll,f.sections[3].roll);assert.equal(loaded.sections[3].roll_offset,70);
 const direct=createDirectTrunkForm(changed);assert.deepEqual(direct.legacy_form,changed);assert.ok(direct.sections.every(s=>!('roll_offset'in s)));
 for(const s of direct.sections){const old=trunkFormSectionAt(changed,s.t).roll;assert.ok(Math.abs(Math.atan2(Math.sin((old-s.roll)*Math.PI/180),Math.cos((old-s.roll)*Math.PI/180)))<1e-10);}
 assert.equal(normalizeTrunkForm({...f,sections:[{...f.sections[0],roll_offset:Infinity}]}).sections[0].roll_offset,undefined);
 assert.equal(normalizeTrunkForm({...f,sections:[{...f.sections[0],roll_offset:0}]}).sections[0].roll_offset,undefined);
});
