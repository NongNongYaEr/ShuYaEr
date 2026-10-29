import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {prepareUnitDensity,createDensityLedger,touchDensity,planDensityThinning,densityQuota,densityGroupQuotas,nextDensityTemplate,commitDensityUnits} from '../web/unit-density-data.js';
import {applyAssemblyScale} from '../web/assembly-scale.js';
const shape={branches:[{id:'WOOD',points:[[0,0,0],[1,0,0]],start_radius:.01,end_radius:.002}]};
const fixture=(count=20)=>{const authoring=normalizeAuthoring({branch_library:[{id:'SOURCE',revision:2,shape,sample:{settings:{},authoring:{},leaf_meshes:[]},versions:[{revision:1,shape,sample:{settings:{},authoring:{},leaf_meshes:[]}}]}],branch_instances:Array.from({length:count},(_,n)=>({id:'I'+String(n).padStart(2,'0'),asset_id:'SOURCE',linked:true,pinned_revision:n<14?2:1,parent:'ROOT',attach:(n+1)/(count+1),shootRole:'MIXED',scale:1,assembly_manual:true}))}),branches=authoring.branch_instances.map((i,n)=>({id:i.id+'.WOOD',stableId:i.id+'.WOOD',instanceId:i.id,points:[new T.Vector3(0,0,n===1?.01:n),new T.Vector3(1,0,n)],parentId:'ROOT'}));return {authoring,branches};};
test('empty density selection remains empty; explicit visible scope and whole-instance selection resolve independently of palette',()=>{
 const f=fixture();assert.equal(prepareUnitDensity(f).entries.length,0);
 assert.equal(prepareUnitDensity({...f,scope:'VISIBLE'}).entries.length,20);
 assert.deepEqual(prepareUnitDensity({...f,selected:['I03.WOOD']}).entries.map(e=>e.id),['I03']);
});
test('manual units participate, true locks and refined protection are explicit and missing pinned versions never upgrade',()=>{
 const f=fixture();f.authoring.branch_instances[0].assembly_locked=true;f.authoring.branch_instances[1].assembly_refined=true;f.authoring.branch_instances[2].pinned_revision=99;
 let p=prepareUnitDensity({...f,scope:'VISIBLE'});assert(p.entries[0].reason);assert(p.entries[1].reason);assert(p.entries[2].growReason);assert(!p.entries[2].reason);assert(!p.entries[3].reason);assert.equal(p.entries[19].item.revision,1);
 p=prepareUnitDensity({...f,scope:'VISIBLE',protectRefined:false});assert(!p.entries[1].reason);assert(p.entries[0].reason);
});
test('one pen thins four of twenty, independent of event count or repeated passes, and preserves the last unit',()=>{
 const f=fixture(),p=prepareUnitDensity({...f,scope:'VISIBLE'}),s=createDensityLedger(p,.2);touchDensity(s,p.entries);const expected=[...planDensityThinning(s)];assert.equal(expected.length,4);assert(expected.includes('I00')||expected.includes('I01'));
 for(let n=0;n<100;n++)touchDensity(s,p.entries);assert.deepEqual([...planDensityThinning(s)],expected);
 assert.equal(densityQuota(1,.8,true),0);assert.equal(densityQuota(2,.8,true),1);assert.equal(densityQuota(20,.2,true),4);
});
test('per-carrier zones remain represented and protected instances never consume thinning quota',()=>{
 const f=fixture(8);for(let n=4;n<8;n++){f.authoring.branch_instances[n].parent='OTHER';f.authoring.branch_instances[n].shootRole='YOUNG';}f.authoring.branch_instances[0].assembly_locked=true;
 const p=prepareUnitDensity({...f,scope:'VISIBLE'}),s=createDensityLedger(p,.8);touchDensity(s,p.entries);const removed=planDensityThinning(s);assert(!removed.has('I00'));assert.equal(removed.size,5);assert(f.authoring.branch_instances.some(i=>i.parent==='OTHER'&&!removed.has(i.id)));
});
test('densification proportions preserve actual historical versions instead of choosing a palette material',()=>{
 const f=fixture(),p=prepareUnitDensity({...f,scope:'VISIBLE'}),added=[];
 for(let n=0;n<10;n++){const e=nextDensityTemplate(p.entries,added);added.push({instance:e.instance});}
 assert.equal(added.filter(r=>r.instance.pinned_revision===2).length,7);assert.equal(added.filter(r=>r.instance.pinned_revision===1).length,3);
});
test('a broad brush uses one total percentage across many carriers instead of rounding every carrier up to one addition',()=>{
 const f=fixture();f.authoring.branch_instances.forEach((i,n)=>{i.parent='ROOT'+n;});const p=prepareUnitDensity({...f,scope:'VISIBLE'}),s=createDensityLedger(p,.2);touchDensity(s,p.entries);assert.equal([...densityGroupQuotas(s,true).values()].reduce((n,v)=>n+v,0),4);assert.equal([...densityGroupQuotas(s,false).values()].reduce((n,v)=>n+v,0),0);
});
test('commit keeps already-resolved scales, source bytes and old transforms; future global scale does not double new units',()=>{
 const f=fixture(3),a=f.authoring;applyAssemblyScale(a,{overall:2});const before=JSON.stringify(a.branch_instances),library=JSON.stringify(a.branch_library),source=a.branch_instances[0];
 commitDensityUnits(a,[{instance:{...source,id:'NEW',assembly_manual:true}}],new Set());assert.equal(a.branch_instances.at(-1).scale,2);assert.equal(JSON.stringify(a.branch_instances.slice(0,3)),before);assert.equal(JSON.stringify(a.branch_library),library);
 applyAssemblyScale(a);assert(a.branch_instances.every(i=>i.scale===2));applyAssemblyScale(a,{overall:3});assert(a.branch_instances.every(i=>i.scale===3));
 const cold=normalizeAuthoring(JSON.parse(JSON.stringify(a)));assert.deepEqual(cold.branch_instances.map(i=>[i.id,i.scale,i.pinned_revision]),a.branch_instances.map(i=>[i.id,i.scale,i.pinned_revision]));
});
test('nested or hidden children never get orphaned or deleted outside the pen; locked descendants protect ancestors',()=>{
 const f=fixture(3);f.authoring.branch_instances[1].parent='I00.WOOD';f.branches[1].parentId='I00.WOOD';
 let p=prepareUnitDensity({...f,scope:'VISIBLE'}),s=createDensityLedger(p,.8);touchDensity(s,[p.entries[0],p.entries[2]]);assert(!planDensityThinning(s).has('I00'));
 f.authoring.branch_instances[1].assembly_locked=true;p=prepareUnitDensity({...f,scope:'VISIBLE'});assert(p.entries[0].reason);
 p=prepareUnitDensity({...f,scope:'VISIBLE',isVisible:id=>id!=='I01.WOOD'});assert(!p.entries.find(e=>e.id==='I01'));assert(p.entries[0].reason);
});
test('density removal follows existing array/void cleanup and leaves fixed reusable models untouched',()=>{
 const f=fixture(4),a=f.authoring,library=JSON.stringify(a.branch_library);a.overrides['I00.WOOD']={radius:2};commitDensityUnits(a,[],new Set(['I00']));assert.equal(a.branch_instances.length,3);assert(!a.overrides['I00.WOOD']);assert.equal(JSON.stringify(a.branch_library),library);
 assert.throws(()=>commitDensityUnits(a,[{instance:{...a.branch_instances[0],id:'BAD',pinned_revision:99}}],new Set()),/固定素材版本/);
});
