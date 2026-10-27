import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDirectTrunkForm, isDirectTrunkForm, normalizeTrunkForm, normalizeTrunkForms,
  createTrunkSectionProfile, normalizeDirectTrunkSectionProfile, createDirectTrunkFormSampler,
  sampleDirectTrunkSection, trunkFormSectionAt, trunkSectionEllipseRadius, getBaseTrunkForm,
  createTrunkFormPreset, trunkFormForBranch } from '../web/trunk-form.js';
import { createSweptBranchGeometry, createTrunkFormPreviewGeometry, normalizeSettings, DEFAULT_SETTINGS } from '../web/branch-kernel.js';

const profile = () => createTrunkSectionProfile(8).map((p,i)=>({...p,radius:[1.3,.85,1.05,1.4,.72,1.15,.91,1.2][i]}));
const direct = () => createDirectTrunkForm({ groove_depth: 0, root_flare: 0, asymmetry: 0, sections: [
  { id: 'A', t: .2, radius: 1.4, oval: 1.2, roll: 170, profile: profile() },
  { id: 'B', t: .8, radius: .8, oval: .78, roll: -170, profile: profile().map(p=>({...p,angle:(p.angle+13)%360,radius:1/p.radius})) },
] });
const branch = () => ({ id: 0, stableId: 'ROOT', parentId: -1, order: 0, length: 3,
  startRadius: .2, endRadius: .1, radiusProfile: { points: [[0,1],[1,1]], interpolation:'LINEAR' },
  points: [[0,0,0],[.35,0,1],[1,.1,2],[1.5,.4,3]].map(p=>new THREE.Vector3(...p)),
  sections: [], phase: .2, windPhase: .4, windStiffness: 1, children: [] });
const settings = normalizeSettings({...DEFAULT_SETTINGS,radial_segments:9,leaf_density:0,
  cross_section:'CIRCLE',surface_roughness:0,groove_depth:0,knot_strength:0,lobe_strength:0,
  junction_collar:false,adaptive_tessellation:true,twist:0,section_roll:0});
const buffers = g => Object.fromEntries(Object.entries(g.attributes).map(([key,attr])=>[key,Array.from(attr.array)])
  .concat([['index',Array.from(g.index.array)]]));

test('DIRECT is explicit, preserves one V1 snapshot, and mixed documents retain untouched V1 fields',()=>{
  const legacy=createTrunkFormPreset('BUTTRESS'), before=JSON.stringify(legacy), form=createDirectTrunkForm(legacy);
  assert.equal(isDirectTrunkForm(legacy),false);assert.equal(isDirectTrunkForm(form),true);
  assert.deepEqual(form.legacy_form,legacy);assert.deepEqual(form.sections,legacy.sections);
  assert.equal(form.legacy_form.geometry_version,undefined);assert.equal(form.legacy_form.legacy_form,undefined);
  assert.equal(JSON.stringify(legacy),before);assert.deepEqual(createDirectTrunkForm(form),form);
  const recipe=normalizeTrunkForms({version:1,branches:{OLD:legacy,NEW:form}});
  assert.equal(recipe.version,2);assert.deepEqual(recipe.branches.OLD,legacy);
  assert.deepEqual(trunkFormForBranch({workbench:{trunk_forms:recipe}},'NEW'),form);
  assert.deepEqual(normalizeTrunkForms(JSON.parse(JSON.stringify(recipe))),recipe);
  const empty=createDirectTrunkForm();assert.equal(empty.groove_depth,0);assert.equal(empty.root_flare,0);assert.equal(empty.asymmetry,0);
  assert.equal(normalizeTrunkForm({geometry_version:3}),null,'unknown evaluator versions cannot silently become V1');
  assert.ok(Number.isFinite(createDirectTrunkFormSampler({geometry_version:2,sections:[{t:NaN,radius:Infinity}]}).radialAt(NaN,NaN)));
});

test('complete key contours loft once; implicit endpoints connect to the original carrier',()=>{
  const form=createDirectTrunkForm({sections:[{id:'A',t:.25,radius:2},{id:'B',t:.75,radius:2}]});
  const sampler=createDirectTrunkFormSampler(form);
  assert.equal(sampler.radialAt(.5,0),2,'equal overlapping keys do not multiply into radius4');
  assert.equal(sampler.radialAt(0,0),1);assert.equal(sampler.radialAt(1,0),1);
  assert.equal(sampler.radialAt(.125,0),1.5);
  const endpoint=createDirectTrunkForm({sections:[{id:'E',t:0,radius:2}]});
  assert.equal(createDirectTrunkFormSampler(endpoint).radialAt(0,0),2,'authored endpoint wins');
  const ordinary=direct(), sample=createDirectTrunkFormSampler(ordinary);
  const onlyA=createDirectTrunkFormSampler(createDirectTrunkForm({sections:[{...ordinary.sections[0],t:0}]}));
  const onlyB=createDirectTrunkFormSampler(createDirectTrunkForm({sections:[{...ordinary.sections[1],t:0}]}));
  for(let i=0;i<180;i++){const angle=i*Math.PI/90;assert.ok(Math.abs(sample.radialAt(.5,angle)
    -(onlyA.radialAt(0,angle)+onlyB.radialAt(0,angle))/2)<1e-12);}
});

test('same-t keys keep independent records and last key precedence, roll crosses the seam smoothly',()=>{
  const form=direct();assert.ok(Math.abs(trunkFormSectionAt(form,.5).roll-180)<1e-10);
  const copy=normalizeTrunkForm({...form,sections:[...form.sections,{...form.sections[0],id:'COPY',radius:2}]});
  assert.equal(copy.sections.length,3);assert.equal(createDirectTrunkFormSampler(copy).sectionAt(.2).radius,2);
  const capture=sampleDirectTrunkSection(form,.5), inserted=normalizeTrunkForm({...form,sections:[...form.sections,{id:'MID',t:.5,...capture}]});
  for(let i=0;i<100;i++)assert.ok(Math.abs(trunkFormSectionAt(form,i/99).roll-trunkFormSectionAt(inserted,i/99).roll)<1e-10);
});

test('capture keeps existing knots, leaves neutral circles simple, and explicitly reports difficult contours',()=>{
  const form=direct(), sample=sampleDirectTrunkSection(form,.2);
  assert.deepEqual(sample.profile,form.sections[0].profile);sample.profile[0].radius=3;
  assert.notEqual(form.sections[0].profile[0].radius,3);
  const empty=sampleDirectTrunkSection(createDirectTrunkForm(),.371);
  assert.deepEqual(empty,{radius:1,oval:1,roll:0});
  const ordinary=sampleDirectTrunkSection(form,.46);
  assert.ok([8,12,16,24,32].includes(ordinary.profile.length));
  assert.ok(ordinary.contour_capture.relative_error<=.005);assert.equal(ordinary.capture_error,undefined);
  const extreme=createDirectTrunkForm({sections:[{id:'A',t:.2,radius:3,oval:4,profile:profile()},
    {id:'B',t:.8,radius:.2,oval:.25,profile:profile()}]});
  const difficult=sampleDirectTrunkSection(extreme,.46);
  assert.equal(difficult.profile.length,32);assert.equal(difficult.capture_error.code,'CONTOUR_APPROXIMATION');
  assert.ok(difficult.capture_error.relative_error>.01);
  assert.equal(normalizeDirectTrunkSectionProfile([{angle:0,radius:10},{angle:120,radius:.01},{angle:240,radius:2}])[0].radius,10);
});

test('an exact recapture does not inherit a historical approximation warning or mutate its saved source',()=>{
  const form=direct();form.sections[0].contour_capture={version:1,points:8,relative_error:.045};
  const before=JSON.stringify(form), captured=sampleDirectTrunkSection(form,form.sections[0].t);
  assert.deepEqual(captured.profile,form.sections[0].profile);
  assert.deepEqual(captured.contour_capture,{version:1,points:8,relative_error:0});
  assert.equal(captured.capture_error,undefined);assert.equal(JSON.stringify(form),before);
  const copy=normalizeTrunkForm({...form,sections:[...form.sections,{id:'EXACT_COPY',t:form.sections[0].t,...captured}]}),
    original=createDirectTrunkFormSampler(form),recaptured=createDirectTrunkFormSampler(copy);
  for(let i=0;i<720;i++)assert.equal(recaptured.radialAt(.2,i*Math.PI/360),original.radialAt(.2,i*Math.PI/360));
  assert.equal(copy.sections.find(s=>s.id==='A').contour_capture.relative_error,.045);
});

test('capture preserves the complete radial contour across both adjacent intervals, reload and repeated insertion stay bounded',()=>{
  const form=direct(), captured=sampleDirectTrunkSection(form,.46);
  let inserted=normalizeTrunkForm({...form,sections:[...form.sections,{id:'MID',t:.46,...captured}]});
  const before=createDirectTrunkFormSampler(form), after=createDirectTrunkFormSampler(inserted);
  let worst=0;
  for(let ti=0;ti<=80;ti++)for(let ai=0;ai<720;ai++){
    const t=ti/80,angle=ai*Math.PI/360,expected=before.radialAt(t,angle);
    worst=Math.max(worst,Math.abs(after.radialAt(t,angle)-expected)/expected);
  }
  assert.ok(worst<=.0051,`radial error ${worst}`);
  inserted=normalizeTrunkForm(JSON.parse(JSON.stringify(inserted)));
  for(let i=0;i<8;i++){const t=.25+i*.045;inserted=normalizeTrunkForm({...inserted,sections:[...inserted.sections,{id:`MORE_${i}`,t,...sampleDirectTrunkSection(inserted,t)}]});}
  assert.ok(JSON.stringify(inserted).length<35000);assert.equal(JSON.stringify(inserted).includes('contour_source'),false);
});

test('edited DIRECT knots describe the actual base contour, with no captured hidden source',()=>{
  const form=direct(), captured=sampleDirectTrunkSection(form,.46);
  const key={id:'MID',t:.46,...captured}, point=key.profile[4], target=point.radius*1.22;
  key.profile=key.profile.map(p=>p.id===point.id?{...p,radius:target}:p);
  const edited=normalizeTrunkForm({...form,sections:[...form.sections,key]});
  const angle=point.angle*Math.PI/180, actual=createDirectTrunkFormSampler(edited).radialAt(.46,angle);
  const expected=key.radius*trunkSectionEllipseRadius(key.oval,angle)*target;
  assert.ok(Math.abs(actual-expected)<1e-11,'dragged knot is exactly on the authored full BASE contour');
});

test('DIRECT meshes contain authored t exactly and insertion does not perturb transported frames or original rings',()=>{
  const form=direct(), captured=sampleDirectTrunkSection(form,.371), next=normalizeTrunkForm({...form,
    sections:[...form.sections,{id:'MID',t:.371,...captured}]});
  const a=createSweptBranchGeometry({...branch(),trunkForm:form},9,settings),b=createSweptBranchGeometry({...branch(),trunkForm:next},9,settings);
  try{
    assert.ok(b.userData.radiusRings.some(r=>r.t===.371));assert.ok(b.userData.radiusRings.some(r=>r.t===.2));
    const pa=a.getAttribute('position'),pb=b.getAttribute('position');
    for(const ring of a.userData.radiusRings){
      const other=b.userData.radiusRings.find(r=>r.t===ring.t);
      assert.deepEqual(other.tangent,ring.tangent);
      for(const field of ['rolledX','rolledY'])assert.ok(new THREE.Vector3(...other[field]).distanceTo(new THREE.Vector3(...ring[field]))<1e-12);
      assert.equal(other.polarAngles,true);assert.equal(other.geometryVersion,2);
      for(let i=0;i<ring.count;i++){
        const x=new THREE.Vector3().fromBufferAttribute(pa,ring.offset+i),y=new THREE.Vector3().fromBufferAttribute(pb,other.offset+i);
        const radius=x.distanceTo(new THREE.Vector3(...ring.center));
        assert.ok(x.distanceTo(y)/radius<.0052);
      }
    }
    assert.ok([...pb.array,...b.getAttribute('normal').array].every(Number.isFinite));
    const edges=new Map();for(let i=0;i<b.index.count;i+=3)for(let j=0;j<3;j++){
      const pair=[b.index.getX(i+j),b.index.getX(i+(j+1)%3)].sort((x,y)=>x-y).join(':');edges.set(pair,(edges.get(pair)||0)+1);
    }assert.ok([...edges.values()].every(n=>n===2),'closed manifold');
  }finally{a.dispose();b.dispose();}
});

test('DIRECT excludes hidden legacy globals, explicit details have BASE/FINAL previews, V1 BASE is temporary',()=>{
  const form=direct(), dirty={...settings,cross_section:'LOBED',surface_roughness:.25,lobe_strength:.35,groove_depth:.3,knot_strength:.3};
  const clean=createSweptBranchGeometry({...branch(),trunkForm:form},9,settings),global=createSweptBranchGeometry({...branch(),trunkForm:form},9,dirty);
  try{assert.deepEqual(buffers(global),buffers(clean));}finally{clean.dispose();global.dispose();}
  for(const recipe of [createTrunkFormPreset('BUTTRESS'),{...form,groove_depth:.32,root_flare:.45,asymmetry:.1,
    buttresses:[{id:'R',angle:35,length:2,height:.3,width:15,strength:1}]}]){
    const saved=JSON.stringify(recipe),source=branch(),points=source.points.map(p=>p.toArray());
    for(let lod=0;lod<4;lod++){
      const final=createTrunkFormPreviewGeometry(source,dirty,recipe,lod),base=createTrunkFormPreviewGeometry(source,dirty,recipe,lod,{view:'BASE'}),
        expected=createTrunkFormPreviewGeometry(source,{...dirty,surface_roughness:0,lobe_strength:0,groove_depth:0,knot_strength:0},getBaseTrunkForm(recipe),lod);
      try{assert.deepEqual(buffers(base),buffers(expected));assert.notDeepEqual(buffers(base),buffers(final));}
      finally{final.dispose();base.dispose();expected.dispose();}
    }
    assert.equal(JSON.stringify(recipe),saved);assert.deepEqual(source.points.map(p=>p.toArray()),points);
  }
});
