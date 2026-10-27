import test from 'node:test';
import assert from 'node:assert/strict';
import {createDirectTrunkForm,createDirectTrunkFormSampler} from '../web/trunk-form.js';
import {TRUNK_RANGE_DEFAULTS,trunkSectionRange,applyTrunkSectionRange} from '../web/trunk-section-range.js';

const selection={startId:'A',endId:'E'},options={...TRUNK_RANGE_DEFAULTS,radiusPercent:20,twist:10};
const make=()=>createDirectTrunkForm({sections:[.1,.3,.5,.7,.9].map((t,i)=>({id:'ABCDE'[i],t,radius:1,oval:1.3,roll:12,span:.18,profile:[{id:'p1',angle:0,radius:1.3,tangent:.1},{id:'p2',angle:130,radius:.7},{id:'p3',angle:240,radius:1.1}],profile_coarse:[{id:'m1',angle:0,radius:1},{id:'m2',angle:120,radius:1},{id:'m3',angle:240,radius:1}]}))});
test('a range needs two explicit, existing, correctly ordered endpoints; no empty fallback edits the whole branch',()=>{
  for(const pick of [{},{startId:'A'}, {startId:'MISSING',endId:'E'},{startId:'E',endId:'A'},{startId:'A',endId:'A'}]){const result=applyTrunkSectionRange(make(),pick,options);assert.equal(result.valid,false);assert.equal(result.form,null);assert.deepEqual(result.changed,[]);}
});
test('default endpoint locks and smooth falloff derive one explicit collection of affected identities',()=>{
  const range=trunkSectionRange(make().sections,selection,options);assert.equal(range.valid,true);assert.deepEqual(range.members,['A','B','C','D','E']);assert.deepEqual(range.affected,['B','C','D']);
  const weights=Object.fromEntries(range.weights.map(w=>[w.id,w.weight]));assert.equal(weights.A,0);assert.equal(weights.E,0);assert.equal(weights.C,1);assert.ok(Math.abs(weights.B-.5)<1e-12);assert.ok(Math.abs(weights.D-.5)<1e-12);
});
test('uniform influence scales only existing radius and roll values and preserves source, point identities and all independent recipes',()=>{
  const form=make();form.details=[{id:'KEEP_DETAIL',kind:'KNOT',strength:.2}];form.extraFixture={keep:true};form.sections[2].profile_exclusions=[{start:1,end:2}];const before=structuredClone(form);
  const result=applyTrunkSectionRange(form,selection,{...options,falloff:'UNIFORM'});assert.deepEqual(form,before);assert.deepEqual(result.changed,['B','C','D']);
  for(let i=0;i<form.sections.length;i++){const old=form.sections[i],next=result.form.sections[i];if(i===0||i===4)assert.deepEqual(next,old);else assert.deepEqual(next,{...old,radius:1.2,roll:22});}
  assert.deepEqual(result.form.details,form.details);assert.deepEqual(result.form.extraFixture,form.extraFixture);
});
test('the same gesture snapshot produces the same preview and lowering a value does not compound prior previews',()=>{
  const form=make(),large=applyTrunkSectionRange(form,selection,{...options,radiusPercent:80}),small=applyTrunkSectionRange(form,selection,{...options,radiusPercent:10});
  assert.equal(large.form.sections[2].radius,1.8);assert.equal(small.form.sections[2].radius,1.1);assert.deepEqual(small,applyTrunkSectionRange(form,selection,{...options,radiusPercent:10}));assert.equal(form.sections[2].radius,1);
});
test('strength applies to both radius and twist; zero strength and zero delta are exact no-ops',()=>{
  const form=make(),half=applyTrunkSectionRange(form,selection,{...options,strength:50});assert.equal(half.form.sections[2].radius,1.1);assert.equal(half.form.sections[2].roll,17);
  for(const patch of [{strength:0},{radiusPercent:0,twist:0}]){const result=applyTrunkSectionRange(form,selection,{...options,...patch});assert.deepEqual(result.form,form);assert.deepEqual(result.changed,[]);}
});
test('unlocking an endpoint makes it editable and adjusts the soft boundary on the remaining locked side',()=>{
  const form=make(),root=applyTrunkSectionRange(form,selection,{...options,lockRoot:false});assert.equal(root.form.sections[0].radius,1.2);assert.deepEqual(root.form.sections[4],form.sections[4]);
  const both=applyTrunkSectionRange(form,selection,{...options,lockRoot:false,lockTip:false});assert.deepEqual(both.changed,['A','B','C','D','E']);assert.ok(both.form.sections.every(s=>s.radius===1.2));
});
test('locked endpoint edits preserve interpolation outside the range without changing the established sampler',()=>{
  const form=make(),a=createDirectTrunkFormSampler(form),result=applyTrunkSectionRange(form,{startId:'B',endId:'D'},options),b=createDirectTrunkFormSampler(result.form);
  for(const t of [0,.05,.1,.2,.29,.3,.7,.71,.8,.9,.95,1])for(let i=0;i<32;i++)assert.equal(a.radialAt(t,i*Math.PI/16),b.radialAt(t,i*Math.PI/16));
  assert.notEqual(a.radialAt(.5,0),b.radialAt(.5,0));
});
test('coincident author keys remain intact; only the last effective identity at a position can change',()=>{
  const form=make();form.sections.splice(3,0,{...structuredClone(form.sections[2]),id:'C_LAST',t:.5+5e-11});
  const result=applyTrunkSectionRange(form,selection,{...options,falloff:'UNIFORM'});assert.deepEqual(result.shadowed,['C']);assert.deepEqual(result.form.sections.find(s=>s.id==='C'),form.sections.find(s=>s.id==='C'));assert.ok(result.changed.includes('C_LAST'));assert.equal(result.changed.includes('C'),false);
});
test('a two-key range with both endpoints locked explicitly has no editable key',()=>{
  const result=applyTrunkSectionRange(make(),{startId:'A',endId:'B'},options);assert.equal(result.valid,true);assert.deepEqual(result.affected,[]);assert.deepEqual(result.changed,[]);
});
test('radius and roll limits are reported and never silently exceed the existing serialization bounds',()=>{
  const form=make();form.sections[2].radius=2.9;form.sections[2].roll=175;
  const result=applyTrunkSectionRange(form,selection,{...options,radiusPercent:100,twist:20});assert.equal(result.form.sections[2].radius,3);assert.equal(result.form.sections[2].roll,180);assert.deepEqual(result.limited,['C']);
});
test('capture warnings invalidate only when their own section is changed',()=>{
  const form=make();for(const s of form.sections)s.contour_capture={relative_error:.04};
  const result=applyTrunkSectionRange(form,selection,options);assert.deepEqual(result.form.sections[0].contour_capture,form.sections[0].contour_capture);assert.equal('contour_capture' in result.form.sections[2],false);
});
test('invalid percentages, angles and falloff never yield a partial authoring result',()=>{
  for(const patch of [{strength:101},{strength:-1},{radiusPercent:101},{radiusPercent:-81},{twist:91},{twist:NaN},{falloff:'UNKNOWN'}]){const result=applyTrunkSectionRange(make(),selection,{...options,...patch});assert.equal(result.valid,false);assert.equal(result.form,null);}
});
