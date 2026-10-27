import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUnitAssemblySelection, createUnitAssemblyIndex, matchUnitAssemblyRoots, mergeUnitAssemblySelection } from '../web/unit-assembly-selection.js';

const instance = (id, asset_id = 'CAMPHOR', shootRole = 'MATURE', extra = {}) =>
  ({ id, asset_id, shootRole, linked: true, parent: 'ROOT', pinned_revision: 1, ...extra });

function branchesFor(instances) {
  const branches = [{ id: 0, stableId: 'ROOT', parentId: -1 }];
  for (const record of instances) {
    const parent = branches.find(branch => branch.stableId === record.parent);
    const id = branches.length;
    branches.push({ id, stableId: record.id + '.R1', parentId: parent?.id ?? 0, instanceId: record.id });
    branches.push({ id: id + 1, stableId: record.id + '.R2', parentId: id, instanceId: record.id });
  }
  return branches;
}

function fixture() {
  const instances = [instance('INNER1'), instance('INNER2', 'CAMPHOR', 'MATURE', { assembly_manual: true }),
    instance('MID', 'CAMPHOR', 'MIXED', { pinned_revision: 2 }), instance('TIP', 'CAMPHOR', 'YOUNG'),
    instance('FLOWER', 'PHOTINIA', 'YOUNG'), instance('INDEPENDENT', 'CAMPHOR', 'ANY'),
    instance('OLD_EMBEDDED', 'CAMPHOR', 'MATURE', { linked: false, pinned_revision: 1 }),
    instance('ANONYMOUS', '', 'ANY', { linked: false })];
  return { instances, branches: branchesFor(instances), library: [
    { id: 'CAMPHOR', name: '香樟单元枝', revision: 3, thumbnail: 'camphor' },
    { id: 'PHOTINIA', name: '石楠开花单元枝', revision: 1 },
  ] };
}
test('a reusable ownership index still derives current partial selection, locks, visibility and rebuilt families',()=>{
 const f=fixture(),index=createUnitAssemblyIndex(f.instances,f.branches);
 const summarize=m=>({summary:m.summary,zones:m.zones,extra:m.extra,selected:[...m.selectedRoots],eligible:[...m.eligibleIds],blocked:[...m.blockedIds]});
 for(const selection of [[],['INNER1.R2'],['MID.R1','TIP.R2'],['ROOT']]){
  const options={...f,selection,isUnitMode:true,isVisible:id=>!id.startsWith('TIP')};
  assert.deepEqual(summarize(buildUnitAssemblySelection({...options,index})),summarize(buildUnitAssemblySelection(options)));
 }
 f.instances[0].assembly_locked=true;
 const options={...f,selection:['INNER1.R1','INNER2.R2'],isUnitMode:true};
 assert.deepEqual(summarize(buildUnitAssemblySelection({...options,index})),summarize(buildUnitAssemblySelection(options)));
 const replacement={...f,instances:f.instances.filter(i=>i.id!=='INNER1')};replacement.branches=branchesFor(replacement.instances);
 const rebuilt=createUnitAssemblyIndex(replacement.instances,replacement.branches),model=buildUnitAssemblySelection({...replacement,index:rebuilt,selection:['INNER1.R1'],isUnitMode:true});
 assert.equal(model.selectedRoots.length,0);assert.equal(rebuilt.ownerOf('INNER1.R1'),null);
});

test('cards partition actual records by saved zone and source, with old embedded and unclassified instances accounted once', () => {
  const input = fixture(), before = JSON.stringify(input);
  const model = buildUnitAssemblySelection({ ...input, selection: new Set(['INNER1.R2']) });
  const inner = model.zones.MATURE.cards[0], tip = model.zones.YOUNG.cards.find(card => card.asset_id === 'CAMPHOR');
  assert.equal(model.summary.total, 8);
  assert.equal(Object.values(model.zones).reduce((n, zone) => n + zone.total, model.extra.total), 8);
  assert.equal(model.extra.total, 3, 'linked:false remains independent despite its saved shootRole');
  assert.equal(inner.total, 2); assert.equal(inner.selected, 1); assert.equal(inner.state, 'PARTIAL');
  assert.equal(inner.manual, 1); assert.equal(inner.eligible, 1, 'manual protection is not a manipulation lock');
  assert.equal(tip.total, 1); assert.equal(tip.selected, 0); assert.notEqual(inner.key, tip.key);
  assert.deepEqual(inner.revisions, [1]); assert.deepEqual(model.zones.MIXED.cards[0].revisions, [2]);
  assert.equal(model.extra.cards.find(card => card.instances.some(i => i.id === 'OLD_EMBEDDED')).embedded, 1);
  assert.equal(model.extra.cards.find(card => card.instances[0].id === 'ANONYMOUS').name, '旧内嵌单元枝');
  assert.match(model.summary.text, /内部 · 香樟单元枝 · 已选 1 支/);
  assert.equal(JSON.stringify(input), before, 'derivation must never change source or instance records');
});

test('wood, leaf, fruit and legacy manual descendant hits canonicalize to complete actual instances without seed alias ownership', () => {
  const input = fixture(); input.instances[0].unit_seed_owner = 'ORIGINAL';
  input.branches.push({ id: 50, stableId: 'OLD_MANUAL', parentId: 2 }, { id: 51, stableId: 'OLD_MANUAL_CHILD', parentId: 50 });
  const model = buildUnitAssemblySelection({ ...input, selection: ['INNER1.R2', 'INNER1.LEAF_2', 'INNER1.FRUIT_3', 'OLD_MANUAL_CHILD', 'ORIGINAL.R1', 'ROOT', 'MISSING.R1'] });
  assert.deepEqual([...model.selectedIds], ['INNER1']);
  assert.deepEqual(model.selectedRoots, ['INNER1.R1']); assert.equal(model.summary.selected, 1);
  const legacy = input.branches.map(({ instanceId, ...branch }) => branch);
  assert.deepEqual(buildUnitAssemblySelection({ ...input, branches: legacy, selection: ['OLD_MANUAL'] }).selectedRoots, ['INNER1.R1'], 'old prefix roots must still propagate ownership to hand-added children');
});

test('card matching stays zone-local; explicit same-source action crosses zones; modifier selection is precise and immutable', () => {
  const model = buildUnitAssemblySelection(fixture());
  const target = matchUnitAssemblyRoots(model, { role: 'MATURE', assetId: 'CAMPHOR' });
  assert.deepEqual(target, ['INNER1.R1', 'INNER2.R1']);
  assert.deepEqual(matchUnitAssemblyRoots(model, { role: 'YOUNG' }), ['TIP.R1', 'FLOWER.R1']);
  assert.deepEqual(matchUnitAssemblyRoots(model, { role: 'MATURE', assetId: 'CAMPHOR', allSame: true }), ['INNER1.R1', 'INNER2.R1', 'MID.R1', 'TIP.R1', 'INDEPENDENT.R1', 'OLD_EMBEDDED.R1']);
  assert.deepEqual(matchUnitAssemblyRoots(model, { extra: true, assetId: 'CAMPHOR' }), ['INDEPENDENT.R1', 'OLD_EMBEDDED.R1']);
  assert.deepEqual(matchUnitAssemblyRoots(model, { role: 'UNKNOWN' }), []);
  const current = new Set(['INNER1.R1', 'TIP.R1']);
  assert.deepEqual([...mergeUnitAssemblySelection(current, target)], target, 'plain click replaces');
  const partial = mergeUnitAssemblySelection(current, target, { ctrl: true });
  assert.deepEqual([...partial], ['INNER1.R1', 'TIP.R1', 'INNER2.R1'], 'Ctrl fills partial membership');
  assert.deepEqual([...mergeUnitAssemblySelection(partial, target, { ctrl: true })], ['TIP.R1'], 'Ctrl removes full membership only');
  assert.deepEqual([...mergeUnitAssemblySelection(current, target, { shift: true })], [...partial]);
  assert.deepEqual([...current], ['INNER1.R1', 'TIP.R1']);
  assert.deepEqual([...mergeUnitAssemblySelection(current, [], { ctrl: true })], [...current]);
  assert.equal(mergeUnitAssemblySelection(current, []).size, 0);
});

test('ALL scope and isolation affect eligible targets without inventing selections or reducing installed card counts', () => {
  const input = fixture(), isVisible = id => id.startsWith('TIP.') || id.startsWith('FLOWER.');
  const model = buildUnitAssemblySelection({ ...input, selection: ['INNER1.R1'], scope: 'ALL', isVisible });
  assert.equal(model.summary.total, 8); assert.equal(model.summary.selected, 1);
  assert.equal(model.summary.eligible, 2); assert.equal(model.summary.explicitEditable, 0);
  assert.deepEqual(model.eligibleRoots, ['TIP.R1', 'FLOWER.R1']);
  assert.equal(model.zones.MATURE.cards[0].selected, 1); assert.equal(model.zones.MATURE.cards[0].eligible, 0);
  assert.match(model.summary.text, /已选 1 支.*全树范围可调整 2 支/);
  const empty = buildUnitAssemblySelection({ ...input, scope: 'ALL', isVisible });
  assert.equal(empty.summary.selected, 0); assert.equal(empty.zones.YOUNG.state, 'NONE');
  assert.equal(empty.summary.editable, 2); assert.match(empty.summary.text, /未选择.*全树范围/);
  const cleared = buildUnitAssemblySelection({ ...input, selection: [], scope: 'SELECTED', isVisible });
  assert.equal(cleared.summary.editable, 0); assert.equal(cleared.eligibleRoots.length, 0);
});

test('explicit and array child locks block ancestor movement, while ordinary manual instances remain editable', () => {
  const instances = [instance('P'), instance('CHILD', 'PHOTINIA', 'YOUNG', { parent: 'P.R2', array_id: 'G' }),
    instance('GRANDCHILD', 'CAMPHOR', 'ANY', { parent: 'CHILD.R1' }), instance('MANUAL', 'CAMPHOR', 'MATURE', { assembly_manual: true })];
  const model = buildUnitAssemblySelection({ instances, branches: branchesFor(instances), selection: ['P.R1', 'MANUAL.R1'], arrays: [{ id: 'G', locked: ['CHILD'] }] });
  assert.deepEqual([...model.lockedIds], ['CHILD']); assert.deepEqual([...model.blockedIds], ['CHILD', 'P']);
  assert.equal(model.summary.selected, 2); assert.equal(model.summary.selectedLocked, 0); assert.equal(model.summary.selectedBlocked, 1);
  assert.deepEqual(model.eligibleRoots, ['MANUAL.R1']); assert.equal(model.summary.linkedChildren, 0);
  const selectedChild = buildUnitAssemblySelection({ instances, branches: branchesFor(instances), selection: ['CHILD.R1'], isLocked: i => i.id === 'GRANDCHILD' });
  assert.equal(selectedChild.summary.editable, 0); assert.equal(selectedChild.summary.selectedBlocked, 1);
  assert.equal(selectedChild.summary.selected, 1, 'locked families remain explicitly selectable and counted');
});

test('nested complete units are counted separately but first filter then deduplicate actual manipulation roots and followers', () => {
  const instances = [instance('P'), instance('CHILD', 'PHOTINIA', 'YOUNG', { parent: 'P.R2' }),
    instance('GRANDCHILD', 'CAMPHOR', 'ANY', { parent: 'CHILD.R1' })];
  const input = { instances, branches: branchesFor(instances), selection: ['P.R1', 'CHILD.R2', 'GRANDCHILD.R1'] };
  const model = buildUnitAssemblySelection(input);
  assert.equal(model.summary.total, 3); assert.equal(model.summary.selected, 3);
  assert.deepEqual(model.directRoots, ['P.R1']); assert.deepEqual(model.eligibleRoots, ['P.R1']);
  assert.equal(model.summary.editable, 1); assert.equal(model.summary.linkedChildren, 2);
  assert.deepEqual([...model.linkedChildIds], ['CHILD', 'GRANDCHILD']);
  assert.equal(model.zones.YOUNG.cards[0].selected, 1); assert.equal(model.zones.YOUNG.cards[0].eligible, 0);
  const filtered = buildUnitAssemblySelection({ ...input, isVisible: id => !id.startsWith('P.') });
  assert.deepEqual(filtered.eligibleRoots, ['CHILD.R1'], 'an invisible ancestor cannot discard an independently eligible child');
  assert.equal(filtered.summary.linkedChildren, 1); assert.equal(filtered.summary.selected, 3);
});

test('mode switches, deletion, replacement, undo and real data reload recompute every count without sticky card focus', () => {
  const input = fixture(), selection = new Set(['INNER1.R2', 'TIP.R1']);
  const before = buildUnitAssemblySelection({ ...input, selection });
  const inactive = buildUnitAssemblySelection({ ...input, selection, isUnitMode: false, scope: 'ALL' });
  assert.equal(inactive.summary.total, 8); assert.equal(inactive.summary.selected, 0); assert.equal(inactive.summary.editable, 0);
  assert.ok(Object.values(inactive.zones).every(zone => zone.selected === 0));
  const changed = structuredClone(input); changed.instances = changed.instances.filter(i => i.id !== 'INNER1');
  changed.instances.find(i => i.id === 'TIP').asset_id = 'PHOTINIA';
  changed.branches = branchesFor(changed.instances);
  const after = buildUnitAssemblySelection({ ...changed, selection });
  assert.equal(after.summary.total, 7); assert.equal(after.summary.selected, 1);
  assert.equal(after.zones.MATURE.cards[0].selected, 0); assert.equal(after.zones.YOUNG.cards.length, 1);
  assert.equal(after.zones.YOUNG.cards[0].total, 2); assert.equal(after.zones.YOUNG.cards[0].state, 'PARTIAL');
  const restored = buildUnitAssemblySelection({ ...JSON.parse(JSON.stringify(input)), selection });
  assert.deepEqual(restored.summary, before.summary); assert.deepEqual(restored.selectedRoots, before.selectedRoots);
  const rebuild = buildUnitAssemblySelection({ ...input, branches: input.branches.filter(b => !b.stableId.startsWith('TIP.')), selection });
  assert.equal(rebuild.summary.total, 7, 'unrendered saved records are not installed models'); assert.equal(rebuild.summary.unresolved,1); assert.equal(rebuild.summary.selected, 1);
  assert.equal(matchUnitAssemblyRoots(rebuild, { role: 'YOUNG', assetId: 'CAMPHOR' }).length, 0, 'missing runtime roots never receive fabricated stable IDs');
});

test('ambiguous prefix IDs, invalid cycles and non-authoring synthetic owners do not create duplicate units or unbounded traversal', () => {
  const instances = [instance('I'), instance('I.COPY', 'CAMPHOR', 'YOUNG')], branches = branchesFor(instances);
  branches.push({ id: 40, stableId: 'LOST.R1', parentId: 0, instanceId: 'LOST' });
  const model = buildUnitAssemblySelection({ instances, branches, selection: ['I.COPY.FRUIT', 'LOST.R1'] });
  assert.equal(model.summary.total, 2); assert.deepEqual([...model.selectedIds], ['I.COPY']);
  assert.deepEqual(model.selectedRoots, ['I.COPY.R1']);
  instances[0].parent = 'I.COPY.R1'; instances[1].parent = 'I.R1'; instances[1].assembly_locked = true;
  const cycle = buildUnitAssemblySelection({ instances, branches, selection: ['I.R1', 'I.COPY.R1'] });
  assert.equal(cycle.summary.selected, 2); assert.equal(cycle.summary.editable, 0); assert.equal(cycle.blockedIds.size, 2);
});

test('unnamed embedded card matching uses its actual member IDs instead of selecting all missing-source models', () => {
  const instances = [instance('FIRST', '', 'ANY', { linked: false }), instance('SECOND', '', 'ANY', { linked: false })];
  const model = buildUnitAssemblySelection({ instances, branches: branchesFor(instances) });
  assert.equal(model.extra.cards.length, 2);
  const first = model.extra.cards[0];
  assert.deepEqual(matchUnitAssemblyRoots(model, { extra: true, assetId: first.asset_id, instanceIds: first.instances.map(i => i.id) }), ['FIRST.R1']);
  assert.deepEqual(matchUnitAssemblyRoots(model, { extra: true, assetId: '', instanceIds: [] }), [], 'an explicit empty card must not fall back to the whole extra bucket');
  assert.deepEqual(matchUnitAssemblyRoots(model, { extra: true, instanceIds: ['NO_LONGER_INSTALLED'] }), []);
  assert.deepEqual(matchUnitAssemblyRoots(model, { allSame: true }), [], 'missing source identity cannot mean all sources');
});

test('summary states real selected locks, direct targets and family followers without displaying unrelated or zero locks', () => {
  const instances = [instance('P'), instance('CHILD', 'PHOTINIA', 'YOUNG', { parent: 'P.R2', assembly_locked: true }),
    instance('FREE'), instance('FOLLOWER', 'CAMPHOR', 'ANY', { parent: 'FREE.R1' })];
  const input = { instances, branches: branchesFor(instances) };
  const model = buildUnitAssemblySelection({ ...input, selection: ['P.R1', 'CHILD.R1', 'FREE.R1'] });
  assert.equal(model.summary.selectedLocked, 1); assert.equal(model.summary.selectedBlocked, 2);
  assert.match(model.summary.text, /锁定 1 支/); assert.match(model.summary.text, /家族锁定阻止 1 支/);
  assert.match(model.summary.text, /直接调整 1 支 · 连带 1 支/);
  const free = buildUnitAssemblySelection({ ...input, selection: ['FREE.R1'] });
  assert.doesNotMatch(free.summary.text, /锁定/); assert.match(free.summary.text, /直接调整 1 支 · 连带 1 支/);
});

test('explicit brush target expansion and DIRECT scope preserve selection/card counts and align eligible families with tool filtering', () => {
  const instances = [instance('P'), instance('CHILD', 'PHOTINIA', 'YOUNG', { parent: 'P.R2' }),
    instance('LOCKED_CHILD', 'CAMPHOR', 'ANY', { parent: 'P.R1', assembly_locked: true })];
  const input = { instances, branches: branchesFor(instances), selection: ['P.R1'] };
  const direct = buildUnitAssemblySelection(input);
  assert.equal(direct.summary.selected, 1); assert.equal(direct.summary.editable, 0, 'DIRECT cannot move the parent through a locked child');
  const expanded = buildUnitAssemblySelection({ ...input, targetSelection: ['P.R1', 'CHILD.R1', 'LOCKED_CHILD.R1'] });
  assert.equal(expanded.summary.selected, 1); assert.equal(expanded.zones.YOUNG.cards[0].selected, 0);
  assert.equal(expanded.zones.YOUNG.cards[0].eligible, 1); assert.deepEqual(expanded.eligibleRoots, ['CHILD.R1']);
  assert.equal(expanded.summary.editable, 1); assert.equal(expanded.summary.explicitEditable, 0);
  assert.match(expanded.summary.text, /家族锁定阻止 1 支.*直接调整 1 支 · 连带 0 支/);
  const cleared = buildUnitAssemblySelection({ ...input, targetSelection: [] });
  assert.equal(cleared.summary.selected, 1); assert.equal(cleared.summary.editable, 0);
  const all = buildUnitAssemblySelection({ ...input, scope: 'ALL', targetSelection: [] });
  assert.equal(all.summary.selected, 1); assert.deepEqual(all.eligibleRoots, ['CHILD.R1'], 'ALL targets are independent of the selected-tool expansion');
});

test('old snapshot roots explain a four-selected zero-editable state without inventing real assembly records',()=>{
  const branches=[{id:0,stableId:'ROOT',parentId:-1},...Array.from({length:4},(_,n)=>({id:n+1,stableId:`COPY_${n}.R1`,parentId:0,unitOwner:`COPY_${n}`}))];
  const before=structuredClone(branches),model=buildUnitAssemblySelection({branches,instances:[],selection:branches.slice(1).map(b=>b.stableId)});
  assert.equal(model.summary.selected,4);assert.equal(model.summary.actualSelected,0);assert.equal(model.summary.legacy,4);
  assert.equal(model.summary.editable,0);assert.equal(model.summary.total,0);
  assert.match(model.summary.text,/已选 4 支 · 旧副本 4 支/);assert.match(model.summary.reason,/没有完整单元实例记录/);
  assert.equal(model.selectedIds.size,0);assert.deepEqual(branches,before,'selection does not rebuild or replace old geometry');
});

test('locked and hidden selection failures have distinct useful explanations',()=>{
  const instances=[instance('LOCKED','CAMPHOR','MATURE',{assembly_locked:true}),instance('HIDDEN')],branches=branchesFor(instances);
  const locked=buildUnitAssemblySelection({instances,branches,selection:['LOCKED.R1']});
  assert.equal(locked.summary.selected,1);assert.equal(locked.summary.legacy,0);assert.match(locked.summary.reason,/锁定/);
  const hidden=buildUnitAssemblySelection({instances,branches,selection:['HIDDEN.R1'],isVisible:()=>false});
  assert.equal(hidden.summary.hiddenSelected,1);assert.equal(hidden.summary.editable,0);assert.match(hidden.summary.reason,/显示全部/);
});
