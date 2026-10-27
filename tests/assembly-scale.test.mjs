import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAssemblyScale, assemblyScaleState, assemblyCardScale, sampleThicknessAdjustments, restoreSampleThickness } from '../web/assembly-scale.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { assignAssemblyInstances, resizeAssemblyInstances } from '../web/branch-assembly.js';
import { cloneBranchInstances } from '../web/branch-instance-operations.js';
import { buildUnitAssemblySelection } from '../web/unit-assembly-selection.js';

const fixture = () => normalizeAuthoring({ branch_instances: [
  { id:'A1', asset_id:'A', linked:true, scale:1.4, shootRole:'MATURE' },
  { id:'A2', asset_id:'A', linked:true, scale:.3, shootRole:'MATURE' },
  { id:'B1', asset_id:'B', linked:true, scale:.8, shootRole:'MIXED' },
  { id:'COPY', asset_id:'A', linked:false, scale:.5 },
] });
const scales = a => a.branch_instances.map(i => i.scale);

test('restoring sample thickness is scoped, preserves size and edits, and survives reload', () => {
  const a=fixture();a.branch_library=[{id:'A',sample:{}},{id:'B',sample:{}}];
  a.branch_instances.forEach((i,n)=>i.radius_scale=[.05,.4,1.25,.7][n]);
  a.branch_instances.push({id:'RAW',asset_id:'RAW',radius_scale:.2,scale:1});
  a.overrides={'A1.B1':{radius:2}};
  applyAssemblyScale(a,{overall:2,cards:{A:3}});
  const before=structuredClone(a);
  assert.equal(sampleThicknessAdjustments(a).length,4);
  assert.equal(restoreSampleThickness(a,'A'),2);
  assert.deepEqual(a.branch_instances.map(i=>i.radius_scale),[1,1,1.25,.7,.2]);
  assert.deepEqual(scales(a),scales(before));
  assert.deepEqual(a.overrides,before.overrides);
  assert.deepEqual(a.workbench,before.workbench);
  assert.equal(restoreSampleThickness(a,'A'),0);
  assert.equal(restoreSampleThickness(a),2);
  const loaded=normalizeAuthoring(JSON.parse(JSON.stringify(a)));
  assert.deepEqual(loaded.branch_instances.map(i=>i.radius_scale),[1,1,1,1,.2]);
  assert.deepEqual(scales(loaded),scales(before));
});

test('old assemblies default to one; card and global factors compose without accumulation', () => {
  const a=fixture(), original=scales(a);
  assert.equal(assemblyScaleState(a.workbench).overall,1);
  applyAssemblyScale(a,{cards:{A:5}});
  assert.deepEqual(scales(a),[7,1.5,.8,.5]);
  applyAssemblyScale(a,{overall:2});
  assert.deepEqual(scales(a),[14,3,1.6,1]);
  applyAssemblyScale(a,{cards:{A:2}});
  assert.deepEqual(scales(a),[5.6,1.2,1.6,1]);
  applyAssemblyScale(a,{overall:1,cards:{A:1}});
  assert.deepEqual(scales(a),original);
});

test('resolved scales above five and baselines survive JSON save and repeated normalization', () => {
  let a=fixture(); applyAssemblyScale(a,{overall:2,cards:{A:5}});
  for(let i=0;i<3;i++) a=normalizeAuthoring(JSON.parse(JSON.stringify(a)));
  assert.equal(a.branch_instances[0].scale,14);
  applyAssemblyScale(a,{overall:1,cards:{A:1}});
  assert.deepEqual(scales(a),scales(fixture()));
});

test('new instances inherit factors; changing cards uses the original instance baseline', () => {
  const a=fixture(); applyAssemblyScale(a,{overall:2,cards:{A:5,B:3}});
  a.branch_instances.push({id:'NEW',asset_id:'A',linked:true,scale:.4});
  applyAssemblyScale(a); assert.equal(a.branch_instances.at(-1).scale,4);
  const slots={MATURE:['B'],MIXED:['B'],YOUNG:[]};
  a.branch_instances=assignAssemblyInstances(a.branch_instances,slots,[{id:'B',revision:2,shape:{}}],['MATURE']);
  applyAssemblyScale(a); assert.ok(Math.abs(a.branch_instances[0].scale-8.4)<1e-12);
  applyAssemblyScale(a); assert.ok(Math.abs(a.branch_instances[0].scale-8.4)<1e-12);
});

test('quantity increase and reduction retain factors and discard stale baselines', () => {
  const a=fixture(), slots={MATURE:['A'],MIXED:['B'],YOUNG:[]};
  const library=['A','B'].map(id=>({id,revision:1,shape:{branches:[{start_radius:.01}]}}));
  const branches=[{stableId:'ROOT',order:0,points:[[0,0,0],[0,0,1]]},{stableId:'LIMB',order:1,length:1,endRadius:.01,points:[[0,0,1],[1,0,2]]}];
  applyAssemblyScale(a,{overall:2,cards:{A:5}});
  a.branch_instances=resizeAssemblyInstances(a.branch_instances,slots,library,6,branches,100,6);
  const added=a.branch_instances.slice(4).map(i=>({...i})); applyAssemblyScale(a);
  for(const i of added) assert.equal(a.branch_instances.find(n=>n.id===i.id).scale,i.scale*2*(i.asset_id==='A'?5:1));
  a.branch_instances=resizeAssemblyInstances(a.branch_instances,slots,library,1,branches,100,9); applyAssemblyScale(a);
  assert.equal(Object.keys(a.workbench.assembly_scale.records).length,2);
});

test('local size changes become the new baseline and invalid input makes no partial change', () => {
  const a=fixture(); applyAssemblyScale(a,{cards:{A:5}});
  a.branch_instances[0].scale=10; applyAssemblyScale(a,{cards:{A:1}});
  assert.equal(a.branch_instances[0].scale,2);
  const before=JSON.stringify(a);
  for(const overall of [0,-1,NaN,Infinity,11]) assert.throws(()=>applyAssemblyScale(a,{overall}));
  assert.equal(JSON.stringify(a),before);
});

const zoneFixture = () => normalizeAuthoring({branch_instances:[
  {id:'INNER',asset_id:'A',linked:true,shootRole:'MATURE',scale:1.4,radius_scale:1.3},
  {id:'MIDDLE',asset_id:'A',linked:true,shootRole:'MIXED',scale:.3},
  {id:'TIP',asset_id:'A',linked:true,shootRole:'YOUNG',scale:.8},
  {id:'MANUAL',asset_id:'A',linked:true,assembly_manual:true,scale:.6},
  {id:'EMBEDDED',asset_id:'A',linked:false,shootRole:'MATURE',scale:.5},
  {id:'OTHER',asset_id:'B',linked:true,shootRole:'MATURE',scale:.9},
]});
const scaleById = a => Object.fromEntries(a.branch_instances.map(instance => [instance.id,instance.scale]));
const near = (actual, expected) => assert.ok(Math.abs(actual-expected)<1e-12,`${actual} ≈ ${expected}`);

test('same source in three zones has independent card factors, overriding legacy global cards', () => {
  const a=zoneFixture();applyAssemblyScale(a,{overall:2,cards:{A:3,B:2}});
  const before=structuredClone(a),changed=[];
  applyAssemblyScale(a,{zoneCards:{MATURE:{A:4}}},(old,next)=>changed.push([old.id,next.scale]));
  assert.deepEqual(changed.map(([id])=>id),['INNER']);near(scaleById(a).INNER,11.2);
  for(const id of ['MIDDLE','TIP','MANUAL','EMBEDDED','OTHER'])assert.equal(scaleById(a)[id],scaleById(before)[id]);
  assert.equal(assemblyCardScale(a.workbench,'MATURE','A'),4);
  assert.equal(assemblyCardScale(a.workbench,'MIXED','A'),3);
  assert.equal(assemblyCardScale(a.workbench,'YOUNG','A'),3);
  assert.equal(assemblyCardScale(a.workbench,'MATURE','B'),2);
  assert.equal(a.branch_instances[0].radius_scale,1.3,'a complete size change does not add a radial-only edit');
  applyAssemblyScale(a,{zoneCards:{YOUNG:{A:.5},MATURE:{B:1.25}}});
  near(scaleById(a).TIP,.8);near(scaleById(a).OTHER,2.25);near(scaleById(a).INNER,11.2);
  assert.deepEqual(a.workbench.assembly_scale.zoneCards,{MATURE:{A:4,B:1.25},YOUNG:{A:.5}},'partial patches retain other source and zone overrides');
  const settled=JSON.stringify(a);applyAssemblyScale(a);assert.equal(JSON.stringify(a),settled,'reapplying factors is idempotent');
});

test('legacy projects preserve their resolved sizes and zone overrides survive repeated JSON reloads', () => {
  let a=zoneFixture();applyAssemblyScale(a,{overall:2,cards:{A:3}});
  delete a.workbench.assembly_scale.zoneCards;
  const legacyScales=scaleById(a);a=normalizeAuthoring(JSON.parse(JSON.stringify(a)));
  assert.deepEqual(assemblyScaleState(a.workbench).zoneCards,{});
  for(const role of ['MATURE','MIXED','YOUNG','ANY'])assert.equal(assemblyCardScale(a.workbench,role,'A'),3);
  applyAssemblyScale(a);assert.deepEqual(scaleById(a),legacyScales,'old stored scale is not multiplied again');
  applyAssemblyScale(a,{zoneCards:{MATURE:{A:4},MIXED:{A:1.2},ANY:{A:.7}}});
  const resolved=scaleById(a),savedFactors=structuredClone(a.workbench.assembly_scale);
  for(let n=0;n<3;n++){a=normalizeAuthoring(JSON.parse(JSON.stringify(a)));applyAssemblyScale(a);}
  assert.deepEqual(scaleById(a),resolved);assert.deepEqual(a.workbench.assembly_scale,savedFactors);
  assert.equal(assemblyCardScale(a.workbench,'EXTRA','A'),.7,'the extra linked card uses the unpartitioned ANY zone');
  assert.equal(assemblyCardScale(a.workbench,'MATURE','MISSING'),1);
  applyAssemblyScale(a,{overall:1,cards:{A:1},zoneCards:{MATURE:{A:1},MIXED:{A:1},ANY:{A:1}}});
  assert.deepEqual(scaleById(a),scaleById(zoneFixture()));
});

test('overall and zone changes skip explicit and array locks, then resume their saved baselines when unlocked', () => {
  const a=zoneFixture();applyAssemblyScale(a,{overall:2,zoneCards:{MATURE:{A:3},MIXED:{A:3}}});
  const inner=a.branch_instances.find(i=>i.id==='INNER'),middle=a.branch_instances.find(i=>i.id==='MIDDLE');
  inner.assembly_locked=true;middle.array_id='GROUP';a.branch_arrays=[{id:'GROUP',locked:['MIDDLE']}];
  const protectedRecords=structuredClone({inner,middle,records:a.workbench.assembly_scale.records});
  applyAssemblyScale(a,{overall:3,zoneCards:{MATURE:{A:4},MIXED:{A:4}}});
  assert.deepEqual(a.branch_instances.find(i=>i.id==='INNER'),protectedRecords.inner);
  assert.deepEqual(a.branch_instances.find(i=>i.id==='MIDDLE'),protectedRecords.middle);
  for(const id of ['INNER','MIDDLE'])assert.deepEqual(a.workbench.assembly_scale.records[id],protectedRecords.records[id]);
  delete a.branch_instances.find(i=>i.id==='INNER').assembly_locked;a.branch_arrays[0].locked=[];
  applyAssemblyScale(a);near(scaleById(a).INNER,16.8);near(scaleById(a).MIDDLE,3.6);
  const unblocked=JSON.stringify(a);applyAssemblyScale(a);assert.equal(JSON.stringify(a),unblocked);
  a.branch_instances.push({id:'NEW_LOCK',asset_id:'A',linked:true,shootRole:'MATURE',assembly_locked:true,scale:.4});
  applyAssemblyScale(a);assert.equal(scaleById(a).NEW_LOCK,.4);assert.ok(!a.workbench.assembly_scale.records.NEW_LOCK);
  delete a.branch_instances.at(-1).assembly_locked;applyAssemblyScale(a);near(scaleById(a).NEW_LOCK,4.8);
});

test('new, manually resized and replacement units use their own zone factors without accumulating size', () => {
  const a=zoneFixture();applyAssemblyScale(a,{overall:2,cards:{A:3,B:2},zoneCards:{MATURE:{A:4,B:1.5},YOUNG:{A:.5}}});
  a.branch_instances.find(i=>i.id==='INNER').scale=16;
  a.branch_instances.push({id:'ADDED_INNER',asset_id:'A',linked:true,shootRole:'MATURE',scale:.25,assembly_manual:true},
    {id:'ADDED_TIP',asset_id:'A',linked:true,shootRole:'YOUNG',scale:.25});
  applyAssemblyScale(a,{zoneCards:{MATURE:{A:2}}});
  near(scaleById(a).INNER,8);near(scaleById(a).ADDED_INNER,1);near(scaleById(a).ADDED_TIP,.25);
  const slots={MATURE:['B'],MIXED:['A'],YOUNG:['A']};
  a.branch_instances=assignAssemblyInstances(a.branch_instances,slots,[{id:'A',revision:1,shape:{}},{id:'B',revision:2,shape:{}}],['MATURE']);
  applyAssemblyScale(a);near(scaleById(a).INNER,6);near(scaleById(a).ADDED_INNER,.75);
  assert.equal(a.branch_instances.find(i=>i.id==='INNER').pinned_revision,2);
  const afterReplacement=JSON.stringify(a);applyAssemblyScale(a);assert.equal(JSON.stringify(a),afterReplacement);
  a.branch_instances.find(i=>i.id==='INNER').shootRole='YOUNG';
  applyAssemblyScale(a);near(scaleById(a).INNER,8,'replacement source falls back to its legacy factor in the new zone');
  const afterMove=JSON.stringify(a);applyAssemblyScale(a);assert.equal(JSON.stringify(a),afterMove);
});

test('a factor change in another zone preserves the exact locally edited scale without a spurious change callback', () => {
  const a=zoneFixture();applyAssemblyScale(a,{overall:2,zoneCards:{MATURE:{A:3},YOUNG:{A:2}}});
  a.branch_instances.find(i=>i.id==='INNER').scale=20.12;
  const changed=[];applyAssemblyScale(a,{zoneCards:{YOUNG:{A:3}}},old=>changed.push(old.id));
  assert.equal(scaleById(a).INNER,20.12);assert.deepEqual(changed,['TIP']);
  const committed=JSON.stringify(a);applyAssemblyScale(a);assert.equal(JSON.stringify(a),committed);
});

test('ANY previews use their own card value and invalid zone factors leave all instances and baselines untouched', () => {
  const a=zoneFixture();applyAssemblyScale(a,{overall:1.4,cards:{A:1.25},zoneCards:{MATURE:{A:5},ANY:{A:.8}}});
  const previewScale=.6*(assemblyScaleState(a.workbench).overall*assemblyCardScale(a.workbench,'ANY','A'));
  assert.equal(previewScale,scaleById(a).MANUAL,'unpartitioned installation preview matches committed complete instance');
  const before=JSON.stringify(a);let changeCount=0;
  for(const value of [0,-1,NaN,Infinity,11])assert.throws(()=>applyAssemblyScale(a,{zoneCards:{MATURE:{A:2},YOUNG:{A:value}}},()=>changeCount++));
  assert.equal(JSON.stringify(a),before);assert.equal(changeCount,0,'all factors are validated before any preview callback');
  a.branch_instances.find(i=>i.id==='TIP').scale=500;
  const oversized=JSON.stringify(a);assert.throws(()=>applyAssemblyScale(a,{overall:10,zoneCards:{YOUNG:{A:10}}}),/支持范围/);
  assert.equal(JSON.stringify(a),oversized);
});

test('density additions inherit each zone independently and reduction drops only removed records', () => {
  const a=zoneFixture(),slots={MATURE:['A'],MIXED:['A'],YOUNG:['A']};
  const library=[{id:'A',revision:1,shape:{branches:[{start_radius:.01}]}}];
  const branches=[{stableId:'ROOT',order:0,points:[[0,0,0],[0,0,1]]},
    ...Array.from({length:6},(_,n)=>({stableId:'LIMB_'+n,order:1,length:1,endRadius:.01,
      points:[[0,0,1],[(n+1)*.2,0,1.5]]}))];
  applyAssemblyScale(a,{overall:1.5,zoneCards:{MATURE:{A:2},MIXED:{A:3},YOUNG:{A:4}}});
  a.branch_instances=resizeAssemblyInstances(a.branch_instances,slots,library,8,branches,100,12);
  const added=a.branch_instances.filter(i=>i.id.startsWith('ASSEMBLY_DENSITY')).map(i=>({...i}));
  assert.deepEqual([...new Set(added.map(i=>i.shootRole))].sort(),['MATURE','MIXED','YOUNG']);
  applyAssemblyScale(a);
  for(const item of added)near(scaleById(a)[item.id],item.scale*(1.5*assemblyCardScale(a.workbench,item.shootRole,'A')));
  const resolved=scaleById(a);applyAssemblyScale(a);assert.deepEqual(scaleById(a),resolved);
  a.branch_instances=resizeAssemblyInstances(a.branch_instances,slots,library,3,branches,100,16);applyAssemblyScale(a);
  assert.deepEqual(Object.keys(a.workbench.assembly_scale.records).sort(),a.branch_instances.map(i=>i.id).sort());
  for(const instance of a.branch_instances)assert.equal(instance.scale,resolved[instance.id],'survivors retain the resolved size');
});

test('complete copies carry their zone baseline and never reapply the source factor on the next edit', () => {
  const a=zoneFixture();applyAssemblyScale(a,{overall:2,zoneCards:{MATURE:{A:4},YOUNG:{A:.5}}});
  const original=a.branch_instances.find(i=>i.id==='INNER'),scale=original.scale;
  const {copies}=cloneBranchInstances(a,[original],i=>'COPY_'+i.id);
  assert.equal(copies.length,1);assert.equal(copies[0].scale,scale);
  assert.deepEqual(a.workbench.assembly_scale.records.COPY_INNER,a.workbench.assembly_scale.records.INNER);
  applyAssemblyScale(a);assert.equal(scaleById(a).COPY_INNER,scale);
  const copy=a.branch_instances.find(i=>i.id==='COPY_INNER');copy.shootRole='YOUNG';
  applyAssemblyScale(a);near(scaleById(a).COPY_INNER,1.4);assert.equal(scaleById(a).INNER,scale);
  applyAssemblyScale(a);near(scaleById(a).COPY_INNER,1.4);
});

test('locked nested units freeze every ancestor during card and overall changes, retaining reloadable baselines', () => {
  let a=normalizeAuthoring({branch_instances:[
    {id:'OUTER',asset_id:'A',linked:true,shootRole:'MATURE',parent:'ROOT',scale:1.2,assembly_manual:true},
    {id:'OUTER.NEST',asset_id:'A',linked:true,shootRole:'MIXED',parent:'OUTER.B2',scale:.7},
    {id:'LOCK',asset_id:'B',linked:true,shootRole:'YOUNG',parent:'OUTER.NEST.B3',scale:.4},
    {id:'FREE',asset_id:'A',linked:true,shootRole:'MATURE',parent:'ROOT',scale:.6,assembly_manual:true},
    {id:'SIBLING',asset_id:'B',linked:true,shootRole:'YOUNG',parent:'OUTER.NEST.B2',scale:.5},
  ]});
  applyAssemblyScale(a,{overall:2,zoneCards:{MATURE:{A:3},MIXED:{A:2},YOUNG:{B:1.5}}});
  a.branch_instances.find(i=>i.id==='LOCK').array_id='GROUP';
  a.branch_arrays=[{id:'GROUP',locked:['LOCK']}];
  const frozen=structuredClone(a),changed=[];
  applyAssemblyScale(a,{zoneCards:{MATURE:{A:4},MIXED:{A:3}}},old=>changed.push(old.id));
  assert.deepEqual(changed,['FREE'],'a manual placement is editable; locked descendants protect both source-zone ancestors');
  applyAssemblyScale(a,{overall:3},old=>changed.push(old.id));
  assert.deepEqual(changed,['FREE','FREE','SIBLING'],'a free sibling may resize without moving its protected parent');
  for(const id of ['OUTER','OUTER.NEST','LOCK']){
    assert.deepEqual(a.branch_instances.find(i=>i.id===id),frozen.branch_instances.find(i=>i.id===id));
    assert.deepEqual(a.workbench.assembly_scale.records[id],frozen.workbench.assembly_scale.records[id]);
  }
  near(scaleById(a).FREE,7.2);near(scaleById(a).SIBLING,2.25);
  const resolved=scaleById(a),records=structuredClone(a.workbench.assembly_scale.records);
  for(let n=0;n<3;n++){a=normalizeAuthoring(JSON.parse(JSON.stringify(a)));applyAssemblyScale(a);}
  assert.deepEqual(scaleById(a),resolved);assert.deepEqual(a.workbench.assembly_scale.records,records);
  a.branch_arrays[0].locked=[];applyAssemblyScale(a);
  near(scaleById(a).OUTER,14.4);near(scaleById(a)['OUTER.NEST'],6.3);near(scaleById(a).LOCK,1.8);
  const settled=JSON.stringify(a);applyAssemblyScale(a);assert.equal(JSON.stringify(a),settled);
  applyAssemblyScale(a,{overall:1,zoneCards:{MATURE:{A:1},MIXED:{A:1},YOUNG:{B:1}}});
  for(const [id,scale] of Object.entries({OUTER:1.2,'OUTER.NEST':.7,LOCK:.4,FREE:.6,SIBLING:.5}))near(scaleById(a)[id],scale);
});

test('family locks use the longest actual instance identity, not source or seed aliases, and do not lock free descendants', () => {
  const a=normalizeAuthoring({branch_instances:[
    {id:'I',asset_id:'SAME',parent:'ROOT',scale:1},
    {id:'I.COPY',asset_id:'SAME',parent:'ROOT',scale:2},
    {id:'CHILD',asset_id:'SAME',parent:'I.COPY.B1',scale:.5,assembly_locked:true,unit_seed_owner:'I'},
    {id:'LOCK_PARENT',asset_id:'SAME',parent:'ROOT',scale:1.5,assembly_locked:true},
    {id:'FREE_CHILD',asset_id:'SAME',parent:'LOCK_PARENT.B2',scale:.25,assembly_manual:true},
  ]});
  a.overrides={'I.B1':{locked:true}};
  const changed=[];applyAssemblyScale(a,{overall:2},old=>changed.push(old.id));
  assert.deepEqual(scaleById(a),{I:2,'I.COPY':2,CHILD:.5,LOCK_PARENT:1.5,FREE_CHILD:.5});
  assert.deepEqual(changed,['I','FREE_CHILD']);
  assert.deepEqual(Object.keys(a.workbench.assembly_scale.records),['I','FREE_CHILD'],'untracked protected originals stay untracked');
});

test('saved legacy manual and duplicate attachment chains protect their actual owner after reparenting and reload', () => {
  const points=[[0,0,0],[1,0,0]];
  let a=normalizeAuthoring({branch_instances:[
    {id:'OWNER',asset_id:'A',parent:'ROOT',scale:1.25},
    {id:'OLD_OWNER',asset_id:'A',parent:'ROOT',scale:.75},
    {id:'LOCK',asset_id:'B',parent:'OLD_DUP_CHILD',scale:.4,assembly_locked:true},
    {id:'CYCLE_CHILD',asset_id:'B',parent:'LOOP_A',scale:.2,assembly_locked:true},
  ],manual_branches:[{id:'OLD_MANUAL',parent:'OLD_OWNER.B1'},{id:'LOOP_A',parent:'LOOP_B'},{id:'LOOP_B',parent:'LOOP_A'}],
  topology:{reparent:{OLD_MANUAL:'OWNER.B2'}},
  sculpt_layers:[{id:'DUP',operation:{type:'DUPLICATE',records:[
    {id:'OLD_DUP_ROOT',parent:'OLD_MANUAL',root:true,points,controlPoints:points},
    {id:'OLD_DUP_CHILD',parent:'OLD_DUP_ROOT',points,controlPoints:points},
  ]}}]});
  const saved=structuredClone(a);applyAssemblyScale(a,{overall:2});
  assert.deepEqual(scaleById(a),{OWNER:1.25,OLD_OWNER:1.5,LOCK:.4,CYCLE_CHILD:.2});
  assert.deepEqual(a.manual_branches,saved.manual_branches);assert.deepEqual(a.sculpt_layers,saved.sculpt_layers);
  assert.deepEqual(a.topology,saved.topology,'size control preserves every legacy shape and attachment record');
  a=normalizeAuthoring(JSON.parse(JSON.stringify(a)));const changed=[];
  applyAssemblyScale(a,{overall:3},old=>changed.push(old.id));
  assert.deepEqual(changed,['OLD_OWNER']);assert.deepEqual(scaleById(a),{OWNER:1.25,OLD_OWNER:2.25,LOCK:.4,CYCLE_CHILD:.2});
});

test('runtime blocked IDs protect legacy compiled ownership without adding fake records or changing installed dimensions on load', () => {
  let a=normalizeAuthoring({branch_instances:[
    {id:'OWNER',asset_id:'A',parent:'ROOT',scale:1.2,assembly_manual:true},
    {id:'LOCK',asset_id:'B',parent:'COMPILED_PROXY',scale:.4,assembly_locked:true},
    {id:'FREE',asset_id:'A',parent:'ROOT',scale:.8,assembly_manual:true},
  ]});
  const branches=[{id:0,stableId:'ROOT',parentId:-1},
    {id:1,stableId:'COMPILED_ROOT',parentId:0,instanceId:'OWNER'},
    {id:2,stableId:'COMPILED_PROXY',parentId:1},
    {id:3,stableId:'LOCK.B1',parentId:2,instanceId:'LOCK'},
    {id:4,stableId:'FREE.B1',parentId:0,instanceId:'FREE'}];
  const model=buildUnitAssemblySelection({instances:a.branch_instances,branches});
  assert.deepEqual([...model.blockedIds].sort(),['LOCK','OWNER']);
  const blockedIds=new Set([...model.blockedIds,'DELETED']),changed=[];
  const original=scaleById(a);a=normalizeAuthoring(JSON.parse(JSON.stringify(a)));
  assert.deepEqual(scaleById(a),original,'loading never applies factors or repairs old dimensions');
  applyAssemblyScale(a,{overall:2},old=>changed.push(old.id),{blockedIds});
  assert.deepEqual(changed,['FREE']);assert.deepEqual(scaleById(a),{OWNER:1.2,LOCK:.4,FREE:1.6});
  assert.deepEqual(Object.keys(a.workbench.assembly_scale.records),['FREE']);
  const settled=JSON.stringify(a);applyAssemblyScale(a,{},()=>assert.fail('no repeated size callback'),{blockedIds});
  assert.equal(JSON.stringify(a),settled);
});
