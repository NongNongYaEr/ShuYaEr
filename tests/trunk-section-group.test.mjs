import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {selectTrunkSections,transformTrunkSectionGroup,removeTrunkSections} from '../web/trunk-section-group.js';
import {createDirectTrunkForm,createTrunkSectionProfile} from '../web/trunk-form.js';
import {createTrunkFormPreviewGeometry,normalizeSettings,DEFAULT_SETTINGS} from '../web/branch-kernel.js';

const sections=()=>[{id:'A',t:.2,roll:170,radius:.8},{id:'B',t:.5,roll:-40,radius:1.2},{id:'C',t:.8,roll:-175,radius:2}];
const apply=(source,result)=>source.map(s=>({...s,...result.updates.find(u=>u.id===s.id)}));

test('single and multiple circle deletion retain untouched circle records and choose a surviving context',()=>{
 const s=sections(),before=structuredClone(s),single=removeTrunkSections(s,['B'],'B');assert.deepEqual(single.removed,['B']);assert.deepEqual(single.sections,[s[0],s[2]]);assert.equal(single.nextId,'C');assert.equal(single.sections[0],s[0]);assert.equal(single.sections[1],s[2]);
 const multiple=removeTrunkSections(s,['A','C','A','STALE'],'C');assert.deepEqual(multiple.removed,['A','C']);assert.deepEqual(multiple.sections,[s[1]]);assert.equal(multiple.nextId,'B');assert.deepEqual(s,before);
});

test('circle deletion never expands an empty or stale selection; removing the last circle leaves no implicit one',()=>{
 const s=sections();for(const ids of [[],['STALE']]){const r=removeTrunkSections(s,ids,'B');assert.deepEqual(r.removed,[]);assert.deepEqual(r.sections,s);assert.equal(r.nextId,'B');}
 assert.deepEqual(removeTrunkSections(s,s.map(s=>s.id),'B'),{sections:[],removed:['A','B','C'],nextId:''});assert.deepEqual(removeTrunkSections([],[],'B'),{sections:[],removed:[],nextId:''});
});

test('an unsaved root reference is protected without preventing deletion of selected saved circles',()=>{
 const s=sections(),r=removeTrunkSections(s,['A','B'],'A',{protectedIds:['A']});assert.deepEqual(r.removed,['B']);assert.deepEqual(r.sections,[s[0],s[2]]);assert.equal(r.nextId,'A');assert.deepEqual(removeTrunkSections(s,['A'],'A',{protectedIds:['A']}).removed,[]);
});
test('normal ring selection replaces; Shift adds; Ctrl subtracts without implicit neighbours',()=>{
 const s=sections();assert.deepEqual(selectTrunkSections(s,['A','B'],['C']),['C']);
 assert.deepEqual(selectTrunkSections(s,['A'],['C','UNKNOWN'],'ADD'),['A','C']);
 assert.deepEqual(selectTrunkSections(s,['A','C'],['A'],'SUBTRACT'),['C']);
 assert.deepEqual(selectTrunkSections(s,['MISSING'],[],'ADD'),[]);
 assert.deepEqual(selectTrunkSections(s,[],['B'],'SUBTRACT'),[]);
});
test('single rotation changes only the chosen angle and leaves input immutable',()=>{
 const s=sections(),before=structuredClone(s),r=transformTrunkSectionGroup(s,['B'],'TWIST',25);
 assert.deepEqual(r.updates,[{id:'B',roll:-15}]);assert.deepEqual(s,before);
 assert.deepEqual(apply(s,r).filter(p=>p.id!=='B'),before.filter(p=>p.id!=='B'));
});
test('multiple rings rotate by the same delta about their own centres across the angle seam',()=>{
 const s=sections(),r=transformTrunkSectionGroup(s,['A','C'],'TWIST',25);
 assert.deepEqual(r.updates,[{id:'A',roll:-165},{id:'C',roll:-150}]);
 assert.equal(apply(s,r)[1].roll,-40);assert.equal(r.limited,false);
 assert.deepEqual(transformTrunkSectionGroup(s,['A'],'TWIST',720).updates,[{id:'A',roll:170}]);
 for(const roll of [-180,180])for(const value of [-720,-360,360,720])assert.deepEqual(transformTrunkSectionGroup([{id:'EDGE',roll}],['EDGE'],'TWIST',value).updates,[{id:'EDGE',roll}]);
});
test('group axial movement clamps the common delta and preserves spacing',()=>{
 const s=sections(),r=transformTrunkSectionGroup(s,['A','C'],'SLIDE',.5),next=apply(s,r);
 assert.ok(Math.abs(r.value-.2)<1e-12);assert.equal(r.limited,true);
 assert.ok(Math.abs(next[2].t-next[0].t-.6)<1e-12);assert.equal(next[1].t,.5);
 assert.equal(transformTrunkSectionGroup(s,['A','C'],'SLIDE',-.5).value,-.2);
});
test('group radius scaling preserves ratios and respects every selected ring limit',()=>{
 const s=sections(),r=transformTrunkSectionGroup(s,['A','C'],'RADIUS',2),next=apply(s,r);
 assert.equal(r.value,1.5);assert.equal(r.limited,true);assert.ok(Math.abs(next[2].radius/next[0].radius-2.5)<1e-12);
 assert.equal(next[1].radius,1.2);assert.equal(transformTrunkSectionGroup(s,['A','C'],'RADIUS',0).value,.25);
});
test('empty, stale and invalid gestures never target the full branch',()=>{
 const s=sections();for(const ids of [[],['MISSING']])for(const action of ['TWIST','SLIDE','RADIUS'])assert.deepEqual(transformTrunkSectionGroup(s,ids,action,1).updates,[]);
 assert.deepEqual(transformTrunkSectionGroup(s,['A'],'TWIST',NaN).updates,[]);
 assert.deepEqual(transformTrunkSectionGroup(s,['A'],'UNKNOWN',10).updates,[]);
 for(const [action,value] of [['TWIST',0],['SLIDE',0],['RADIUS',1]])assert.deepEqual(apply(s,transformTrunkSectionGroup(s,['A','C'],action,value)),s);
});
test('unselected authored circle vertices and frames stay fixed for linear and smooth lofts',()=>{
 const settings=normalizeSettings({...DEFAULT_SETTINGS,leaf_density:0,twist:18}),b={id:0,stableId:'ROOT',parentId:-1,order:0,length:8,startRadius:.4,endRadius:.2,points:[[0,0,0],[.2,0,1],[.8,.1,2],[1.1,.1,5],[1.2,.2,8]].map(p=>new THREE.Vector3(...p)),sections:[],children:[],phase:.2,windPhase:.4,windStiffness:1};
 for(const loft of [undefined,'SMOOTH'])for(const ids of [['B'],['A','C']]){
  const form=createDirectTrunkForm({geometry_version:2,...(loft?{loft_interpolation:loft}:{}),sections:sections().map(s=>({...s,oval:1.2,profile:createTrunkSectionProfile(10).map((p,i)=>({...p,radius:1+.25*Math.cos(i*1.8)}))}))}),next={...form,sections:apply(form.sections,transformTrunkSectionGroup(form.sections,ids,'TWIST',25))};
  const before=createTrunkFormPreviewGeometry(b,settings,form,0),after=createTrunkFormPreviewGeometry(b,settings,next,0);
  try{for(const s of form.sections.filter(s=>!ids.includes(s.id))){
   const a=before.userData.radiusRings.find(r=>Math.abs(r.t-s.t)<1e-10),c=after.userData.radiusRings.find(r=>Math.abs(r.t-s.t)<1e-10);assert.ok(a&&c);assert.equal(a.count,c.count);
   for(const key of ['center','x','y','rolledX','rolledY'])for(let i=0;i<3;i++)assert.ok(Math.abs(a[key][i]-c[key][i])<1e-8,key);
   for(let i=0;i<a.count;i++)for(let j=0;j<3;j++)assert.ok(Math.abs(before.attributes.position.array[(a.offset+i)*3+j]-after.attributes.position.array[(c.offset+i)*3+j])<1e-6,'unselected vertex');
  }}finally{before.dispose();after.dispose();}
 }
});
