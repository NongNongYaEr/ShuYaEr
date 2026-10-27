import test from 'node:test';
import assert from 'node:assert/strict';
import { unitBranchIndex, resolveUnitEditScope, mixedUnitPlacementParents } from '../web/unit-branch-boundary.js';

test('mixed baked and registry families block only their unsafe ancestors, retaining complete independent children',()=>{
  const branches=[{id:0,stableId:'ROOT',parentId:-1},
    {id:1,stableId:'A.R1',parentId:0,instanceId:'A'},
    {id:2,stableId:'B.R1',parentId:1,instanceId:'B'},
    {id:3,stableId:'COPY.R1',parentId:2,unitOwner:'COPY'},
    {id:4,stableId:'LEGACY.R1',parentId:0,unitOwner:'LEGACY'},
    {id:5,stableId:'REAL.R1',parentId:4,instanceId:'REAL'},
    {id:6,stableId:'OTHER.R1',parentId:0,instanceId:'OTHER'}];
  const instances=[{id:'A',parent:'ROOT'},{id:'B',parent:'A.R1'},
    {id:'COPY',parent:'',legacyPlacement:true},{id:'LEGACY',parent:'',legacyPlacement:true},
    {id:'REAL',parent:'LEGACY.R1'},{id:'OTHER',parent:'ROOT'}];
  const index=unitBranchIndex(branches,instances);
  assert.deepEqual([...mixedUnitPlacementParents(index)].sort(),['A','B','LEGACY']);
  assert.equal(mixedUnitPlacementParents(index).has('COPY'),false);
  assert.equal(mixedUnitPlacementParents(index).has('REAL'),false);
  assert.equal(mixedUnitPlacementParents(index).has('OTHER'),false);
});

test('TREE separates whole-unit selection from internal editing, including legacy manual descendants',()=>{
  const a={id:'A'},b={id:'B'},branches=[
    {id:0,stableId:'ROOT',parentId:-1},
    {id:1,stableId:'A.R1',parentId:0,instanceId:'A'},
    {id:2,stableId:'A.R1.1',parentId:1,instanceId:'A'},
    {id:3,stableId:'HAND',parentId:2},
    {id:4,stableId:'HAND.1',parentId:3},
    {id:5,stableId:'B.R1',parentId:2,instanceId:'B'},
    {id:6,stableId:'B.R1.1',parentId:5,unitOwner:'B'},
    {id:7,stableId:'SKELETON',parentId:0},
  ];
  const {owners,roots}=unitBranchIndex(branches,[a,b]);
  assert.equal(owners.has('ROOT'),false);assert.equal(owners.has('SKELETON'),false);
  for(const id of ['A.R1','A.R1.1','HAND','HAND.1'])assert.equal(owners.get(id),a);
  for(const id of ['B.R1','B.R1.1'])assert.equal(owners.get(id),b);
  assert.deepEqual([...roots],[['A','A.R1'],['B','B.R1']]);
});

test('unit boundary does not depend on tree runtime ordering and does not mutate saved contents',()=>{
  const instances=[{id:'UNIT',asset_id:'SOURCE',pinned_revision:3}],branches=[
    {id:7,stableId:'HAND.1',parentId:6},
    {id:6,stableId:'HAND',parentId:5},
    {id:5,stableId:'UNIT.R1',parentId:0,instanceId:'UNIT'},
    {id:0,stableId:'ROOT',parentId:-1},
  ],before=structuredClone({branches,instances});
  const {owners,roots}=unitBranchIndex(branches,instances);
  assert.equal(owners.get('HAND.1').id,'UNIT');assert.equal(roots.get('UNIT'),'UNIT.R1');
  assert.deepEqual({branches,instances},before);
});

test('old baked snapshot unit aliases remain protected without authoring instance records',()=>{
  const branches=[{id:0,stableId:'ROOT',parentId:-1},{id:1,stableId:'SNAP.R1',parentId:0,unitOwner:'SNAP'},
    {id:2,stableId:'SNAP.R1.1',parentId:1,unitOwner:'SNAP'},{id:3,stableId:'OLD_HAND',parentId:2}];
  const {owners,roots}=unitBranchIndex(branches,[]);
  assert.equal(owners.get('SNAP.R1').legacyEmbedded,true);assert.equal(owners.get('OLD_HAND').id,'SNAP');
  assert.equal(roots.get('SNAP'),'SNAP.R1');assert.equal(owners.has('ROOT'),false);
});

test('missing owner flags resolve the longest real ID prefix without conflating copied seed owners',()=>{
  const original={id:'I'},copy={id:'I.COPY',unit_seed_owner:'I'},nested={id:'I.COPY.NESTED',parent:'I.COPY.R1',unit_seed_owner:'I'};
  const branches=[
    {id:0,stableId:'ROOT',parentId:-1},
    {id:1,stableId:'I.R1',parentId:0},
    {id:2,stableId:'I.COPY.R1',parentId:0},
    {id:3,stableId:'I.COPY.NESTED.R1',parentId:2},
    {id:4,stableId:'I.COPY.NESTED.R1.1',parentId:3},
    {id:5,stableId:'HAND',parentId:4},
    {id:6,stableId:'I_OTHER.R1',parentId:0},
  ];
  const index=unitBranchIndex(branches,[original,copy,nested]);
  assert.equal(index.owners.get('I.R1'),original);
  assert.equal(index.owners.get('I.COPY.R1'),copy);
  assert.equal(index.owners.get('I.COPY.NESTED.R1.1'),nested);
  assert.equal(index.owners.get('HAND'),nested);
  assert.equal(index.owners.has('I_OTHER.R1'),false);
  assert.equal(index.ownerOf('I.COPY.NESTED.R1.1'),nested);
  assert.deepEqual(index.ownedBranches.get(nested.id).map(branch=>branch.stableId),['I.COPY.NESTED.R1','I.COPY.NESTED.R1.1','HAND']);
  assert.equal(index.parents.get(nested.id),copy.id);
  assert.deepEqual(index.children.get(copy.id),[nested.id]);
});

test('real owner flags outrank stale aliases and source or seed fields do not establish ownership',()=>{
  const copy={id:'COPY',unit_seed_owner:'SOURCE'},source={id:'SOURCE'},branches=[
    {id:0,stableId:'ROOT',parentId:-1},
    {id:1,stableId:'SOURCE.R1',parentId:0,instanceId:'STALE',unitOwner:'COPY'},
    {id:2,stableId:'NO_PREFIX',parentId:0,sourceInstanceId:'SOURCE',unit_seed_owner:'COPY'},
    {id:3,stableId:'COPY.OLD',parentId:0,unitOwner:'OLD_SNAPSHOT'},
  ];
  const index=unitBranchIndex(branches,[copy,source]);
  assert.equal(index.owners.get('SOURCE.R1'),copy);
  assert.equal(index.owners.has('NO_PREFIX'),false);
  assert.equal(index.owners.get('COPY.OLD').legacyEmbedded,true);
  assert.equal(index.byInstance.has('OLD_SNAPSHOT'),false);
  assert.equal(index.ownerOf('OLD_SNAPSHOT'),index.owners.get('COPY.OLD'));
  assert.equal(index.roots.get('COPY'),'SOURCE.R1');
});

const scopeFixture=()=>{
  const instances=[{id:'A',parent:'ROOT'},{id:'N',parent:'HAND'},{id:'D',parent:'N.R1.1'},{id:'B',parent:'ROOT'}];
  const branches=[
    {id:0,stableId:'ROOT',parentId:-1},
    {id:1,stableId:'A.R1',parentId:0},
    {id:2,stableId:'A.R1.1',parentId:1},
    {id:3,stableId:'HAND',parentId:2},
    {id:4,stableId:'N.R1',parentId:3},
    {id:5,stableId:'N.R1.1',parentId:4},
    {id:6,stableId:'D.R1',parentId:5},
    {id:7,stableId:'B.R1',parentId:0,instanceId:'B',symmetryGroup:'OLD_MIRROR'},
    {id:8,stableId:'B.R1.1',parentId:7,unitOwner:'B'},
    {id:9,stableId:'BAKED.R1',parentId:0,unitOwner:'BAKED'},
    {id:10,stableId:'BAKED.R1.1',parentId:9},
  ];
  return {instances,branches};
};

test('complete-unit DIRECT selects only explicit owners while SELECTED expands nested unit families',()=>{
  const {instances,branches}=scopeFixture();
  assert.deepEqual([...resolveUnitEditScope(branches,instances,['A.R1.1','HAND'],'DIRECT')],['A.R1']);
  assert.deepEqual([...resolveUnitEditScope(branches,instances,['HAND'],'SELECTED')],['A.R1','N.R1','D.R1']);
  assert.deepEqual([...resolveUnitEditScope(branches,instances,['N.R1.1'],'SELECTED')],['N.R1','D.R1']);
  assert.deepEqual([...resolveUnitEditScope(branches,instances,['A','N'],'DIRECT')],['A.R1','N.R1']);
  assert.equal(resolveUnitEditScope(branches,instances,['ROOT'],'SELECTED').size,0);
  assert.equal(resolveUnitEditScope(branches,instances,[],'SELECTED').size,0);
});

test('scope exclusion protects the entire owner, nested units and indirect movement through its ancestors',()=>{
  const {instances,branches}=scopeFixture();
  assert.deepEqual([...resolveUnitEditScope(branches,instances,['A'],'SELECTED',{excluded:new Set(['N.R1.1'])})],[], 'a parent cannot carry the subtracted child');
  assert.deepEqual([...resolveUnitEditScope(branches,instances,[],'ALL',{excluded:new Set(['HAND'])})],['B.R1']);
  assert.deepEqual([...resolveUnitEditScope(branches,instances,['D'],'DIRECT',{excluded:new Set(['N'])})],[]);
  assert.deepEqual([...resolveUnitEditScope(branches,instances,[],'ALL',{excluded:new Set(['ROOT'])})],['A.R1','N.R1','D.R1','B.R1']);
});

test('scope visibility accepts any owned member and does not apply skeleton symmetry filtering',()=>{
  const {instances,branches}=scopeFixture(),visible=new Set(['A.R1.1','B.R1.1']);
  assert.deepEqual([...resolveUnitEditScope(branches,instances,[],'ALL',{isVisible:id=>visible.has(id)})],['A.R1','B.R1']);
  assert.deepEqual([...resolveUnitEditScope(branches,instances,['B.R1'],'DIRECT',{isVisible:id=>id==='B.R1.1'})],['B.R1']);
  assert.equal(resolveUnitEditScope(branches,instances,['A'],'DIRECT',{isVisible:()=>false}).size,0);
});

test('legacy embedded snapshot aliases stay protected but never become actual scope targets',()=>{
  const {instances,branches}=scopeFixture(),before=structuredClone({instances,branches});
  const index=unitBranchIndex(branches,instances);
  assert.equal(index.owners.get('BAKED.R1.1').legacyEmbedded,true);
  assert.equal(index.byInstance.size,4);
  assert.equal(index.legacyByInstance.size,1);
  assert.equal(resolveUnitEditScope(branches,instances,['BAKED.R1.1'],'SELECTED',{index}).size,0);
  assert.deepEqual([...resolveUnitEditScope(branches,instances,[],'ALL',{index})],['A.R1','N.R1','D.R1','B.R1']);
  assert.deepEqual({instances,branches},before);
});

test('mount ownership and runtime fallback retain nested scopes in shuffled and cyclic saved graphs',()=>{
  const {instances,branches}=scopeFixture();
  instances.find(instance=>instance.id==='N').parent='MISSING_MOUNT';
  const reversed=[...branches].reverse(),index=unitBranchIndex(reversed,instances);
  assert.equal(index.parents.get('N'),'A');
  assert.deepEqual(new Set(resolveUnitEditScope(reversed,instances,['A'],'SELECTED',{index})),new Set(['A.R1','N.R1','D.R1']));
  const cyclic=[{id:'A',parent:'N.R1'},{id:'N',parent:'A.R1'}];
  const cyclicBranches=[{id:1,stableId:'A.R1',parentId:2},{id:2,stableId:'N.R1',parentId:1}];
  assert.deepEqual(new Set(resolveUnitEditScope(cyclicBranches,cyclic,['A'],'SELECTED')),new Set(['A.R1','N.R1']));
});

test('saved mount graph crosses an absent runtime intermediate and stable-ID runtime parenting still protects hand descendants',()=>{
  const instances=[{id:'A',parent:'ROOT'},{id:'HIDDEN',parent:'A.R1'},{id:'D',parent:'HIDDEN.R1'}];
  const branches=[{id:0,stableId:'ROOT',parentId:-1},{id:1,stableId:'A.R1',parentId:0},
    {id:2,stableId:'HAND',parentId:'A.R1'},{id:3,stableId:'D.R1',parentId:0}];
  const index=unitBranchIndex(branches,instances);
  assert.equal(index.owners.get('HAND').id,'A');
  assert.equal(index.parents.get('HIDDEN'),'A');
  assert.equal(index.parents.get('D'),'HIDDEN');
  assert.deepEqual([...resolveUnitEditScope(branches,instances,['A'],'SELECTED',{index})],['A.R1','D.R1']);
  assert.deepEqual([...resolveUnitEditScope(branches,instances,['A'],'SELECTED',{index,excluded:new Set(['HIDDEN'])})],[]);
});
