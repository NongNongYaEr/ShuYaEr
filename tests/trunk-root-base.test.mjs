import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTrunkRootBase,trunkRootBaseSection,omitUnchangedTrunkRootBase} from '../web/trunk-root-base.js';
import {createTrunkFormPreset,createDirectTrunkForm,createDirectTrunkFormSampler,createTrunkFormProfileSampler,trunkFormSectionAt} from '../web/trunk-form.js';

test('preparing root controls leaves the source untouched and reuses the last existing base circle',()=>{
 const input=createDirectTrunkForm(createTrunkFormPreset('BUTTRESS')),before=structuredClone(input),first=prepareTrunkRootBase(input);
 assert.deepEqual(input,before);assert.equal(first.created,true);assert.equal(first.section.t,0);assert.equal(first.section.profile.length,10);
 const second=prepareTrunkRootBase(first.form);assert.equal(second.created,false);assert.equal(second.section.id,first.section.id);assert.deepEqual(second.form,first.form);
});
test('neutral base insertion preserves both legacy section corrections and direct linear/smooth radial surfaces',()=>{
 for(const kind of ['legacy','direct','smooth']){
  let form=createTrunkFormPreset('BUTTRESS');if(kind!=='legacy')form=createDirectTrunkForm(form);if(kind==='smooth')form.loft_interpolation='SMOOTH';
  const prepared=prepareTrunkRootBase(form);assert.equal(prepared.form.geometry_version,form.geometry_version);assert.deepEqual(prepared.form.buttresses,form.buttresses);
  const before=kind==='legacy'?createTrunkFormProfileSampler(form):createDirectTrunkFormSampler(form),after=kind==='legacy'?createTrunkFormProfileSampler(prepared.form):createDirectTrunkFormSampler(prepared.form);
  for(let i=0;i<=70;i++)for(let a=0;a<80;a++){const t=i/70,angle=a*Math.PI/40;assert.ok(Math.abs((kind==='legacy'?before(t,angle):before.radialAt(t,angle))-(kind==='legacy'?after(t,angle):after.radialAt(t,angle)))<1e-10);if(kind==='legacy')assert.deepEqual(trunkFormSectionAt(prepared.form,t),trunkFormSectionAt(form,t));}
 }
});
test('an unchanged temporary base is omitted from unrelated commits while an actual point or topology edit persists',()=>{
 const source=createTrunkFormPreset('BUTTRESS'),prepared=prepareTrunkRootBase(source),temporary=structuredClone(prepared.section);
 assert.deepEqual(omitUnchangedTrunkRootBase(prepared.form,temporary),source);
 const mesh={...prepared.form,mesh:{preset:'PREVIEW'}},stripped=omitUnchangedTrunkRootBase(mesh,temporary);assert.deepEqual(stripped.sections,source.sections);assert.deepEqual(stripped.mesh,mesh.mesh);
 const edited=structuredClone(prepared.form);trunkRootBaseSection(edited).profile[0].radius=1.04;assert.equal(omitUnchangedTrunkRootBase(edited,temporary).sections.length,source.sections.length+1);
});
test('root base identity avoids collisions, honors the circle limit and does not merge authored overlapping keys',()=>{
 const source=createTrunkFormPreset('BUTTRESS');source.sections=[{id:'ROOT_BASE_SECTION',t:.4,radius:1,oval:1,roll:0,span:.15}];assert.notEqual(prepareTrunkRootBase(source).section.id,'ROOT_BASE_SECTION');
 const full={...source,sections:Array.from({length:24},(_,i)=>({...source.sections[0],id:'S'+i,t:(i+1)/25}))};assert.throws(()=>prepareTrunkRootBase(full),/24/);
 const overlapping={...source,sections:[{...source.sections[0],id:'BASE_A',t:0},{...source.sections[0],id:'BASE_B',t:0},...source.sections]};const result=prepareTrunkRootBase(overlapping);assert.equal(result.section.id,'BASE_B');assert.equal(result.form.sections.length,overlapping.sections.length);
});
