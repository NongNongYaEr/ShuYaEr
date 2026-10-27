import { unitBranchIndex, mixedUnitPlacementParents } from './unit-branch-boundary.js';

const ZONES = [
  { role: 'MATURE', label: '内部' },
  { role: 'MIXED', label: '中间' },
  { role: 'YOUNG', label: '末端' },
];
const zoneRoles = new Set(ZONES.map(zone => zone.role));
const values = value => value == null ? [] : typeof value === 'string' ? [value] : [...value];

// Use the actual instance identity, never its random-seed alias or source ID.
// The longest existing prefix wins for older records without an owner flag.
function prefixOwner(id, byInstance) {
  if (typeof id !== 'string') return null;
  let candidate = id;
  while (candidate) {
    if (byInstance.has(candidate)) return byInstance.get(candidate);
    const dot = candidate.lastIndexOf('.');
    if (dot < 0) break;
    candidate = candidate.slice(0, dot);
  }
  return null;
}

export function createUnitAssemblyIndex(instances, branches) {
  const byInstance = new Map();
  for (const instance of instances) if (instance?.id && !byInstance.has(instance.id)) byInstance.set(instance.id, instance);
  const byBranch = new Map(branches.filter(branch => branch?.stableId).map(branch => [branch.stableId, branch]));
  const inferred = branches.map(branch => {
    if (branch.instanceId || branch.unitOwner) return branch;
    const owner = prefixOwner(branch.stableId, byInstance);
    return owner ? { ...branch, instanceId: owner.id } : branch;
  });
  const boundary = unitBranchIndex(inferred, [...byInstance.values()]);
  const owners = new Map([...boundary.owners].filter(([, instance]) => byInstance.has(instance.id)));
  const roots = new Map([...boundary.roots].filter(([id, root]) => byInstance.has(id) && byBranch.has(root)));
  const ownedBranches = new Map(), parents = new Map(), children = new Map();
  for (const branch of branches) {
    const owner = owners.get(branch.stableId);
    if (!owner) continue;
    if (!ownedBranches.has(owner.id)) ownedBranches.set(owner.id, []);
    ownedBranches.get(owner.id).push(branch);
  }
  const ownerOf = id => byInstance.get(id) || owners.get(id) || prefixOwner(id, byInstance);
  const byRuntime = new Map(branches.map(branch => [branch.id, branch]));
  for (const instance of byInstance.values()) {
    const root = byBranch.get(roots.get(instance.id));
    // Virtual copies have no source-local mount parent. Their actual runtime
    // root still supplies family attachment and locked-child protection.
    const runtimeParent = byRuntime.get(root?.parentId);
    const parent = ownerOf(instance.parent || instance.legacyParent || runtimeParent?.stableId);
    if (!parent || parent.id === instance.id) continue;
    parents.set(instance.id, parent.id);
    if (!children.has(parent.id)) children.set(parent.id, []);
    children.get(parent.id).push(instance.id);
  }
  return { byInstance, byBranch, owners, roots, ownedBranches, parents, children, ownerOf, boundary };
}

function aggregate(role, label) {
  return { role, label, instances: [], cards: [], total: 0, selected: 0, locked: 0, blocked: 0, eligible: 0,
    manual: 0, roots: [], selectedRoots: [], state: 'NONE' };
}

function selectionState(selected, total) {
  return selected === 0 ? 'NONE' : selected === total ? 'ALL' : 'PARTIAL';
}

function familyMembers(roots, children) {
  const result = new Set(), queue = [...roots];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor];
    if (result.has(id)) continue;
    result.add(id); queue.push(...(children.get(id) || []));
  }
  return result;
}

function outermost(ids, parents) {
  return new Set([...ids].filter(id => {
    const seen = new Set([id]); let parent = parents.get(id);
    while (parent && !seen.has(parent)) {
      if (ids.has(parent)) return false;
      seen.add(parent); parent = parents.get(parent);
    }
    return true;
  }));
}

/**
 * Derive all assembly UI from actual instance records and the current root
 * selection. Isolation only filters eligible tool targets; it never reduces
 * installed or explicitly selected counts. ALL scope is not a selection.
 *
 * isVisible receives (stableId, instance). isLocked receives (instance,
 * parentBranch, ownedBranches), matching the complete-unit comb planner.
 */
export function buildUnitAssemblySelection({ instances = [], branches = [], library = [], selection = [], targetSelection, includeUnresolved = false,
  isVisible, isUnitMode = true, scope = 'SELECTED', arrays = [], isLocked, index: preparedIndex } = {}) {
  const index = preparedIndex || createUnitAssemblyIndex(instances, branches);
  const records = [...index.byInstance.values()].filter(i => includeUnresolved || index.roots.has(i.id));
  const assets = new Map(library.map(asset => [asset.id, asset]));
  const selectedIds = new Set(), legacyIds = new Set();
  const boundary = index.boundary;
  if (isUnitMode) for (const id of values(selection)) {
    const owner = index.ownerOf(id);
    // An invalid selection after a rebuild cannot create a synthetic root.
    if (owner && index.roots.has(owner.id)) selectedIds.add(owner.id);
    else {
      const legacy = boundary.owners.get(id);
      if (legacy?.legacyEmbedded && boundary.roots.has(legacy.id)) legacyIds.add(legacy.id);
    }
  }
  // The tool may explicitly expand its selected scope to descendants, or use
  // DIRECT scope. This does not mark those derived targets as selected cards.
  const targetIds = targetSelection === undefined ? selectedIds : new Set();
  if (isUnitMode && targetSelection !== undefined) for (const id of values(targetSelection)) {
    const owner = index.ownerOf(id);
    if (owner && index.roots.has(owner.id)) targetIds.add(owner.id);
  }
  const arrayLocks = new Map(arrays.map(group => [group.id, new Set(group.locked || [])]));
  const lockedIds = new Set(), visibleIds = new Set();
  for (const instance of records) {
    if (instance.assembly_locked || arrayLocks.get(instance.array_id)?.has(instance.id)
      || isLocked?.(instance, index.byBranch.get(instance.parent), index.ownedBranches.get(instance.id) || [])) lockedIds.add(instance.id);
    const root = index.roots.get(instance.id);
    if (root && (!isVisible || isVisible(root, instance)
      || (index.ownedBranches.get(instance.id) || []).some(branch => branch.stableId !== root && isVisible(branch.stableId, instance)))) visibleIds.add(instance.id);
  }
  // An explicitly locked child also prevents indirect movement by its parent.
  // Walk the reverse family graph once rather than scanning every family.
  const blockedIds = new Set(lockedIds), lockQueue = [...lockedIds];
  for (let cursor = 0; cursor < lockQueue.length; cursor++) {
    const parent = index.parents.get(lockQueue[cursor]);
    if (parent && !blockedIds.has(parent)) { blockedIds.add(parent); lockQueue.push(parent); }
  }
  const allScope = scope === 'ALL' || scope === 'TREE';
  const mixedIds = mixedUnitPlacementParents(index);
  const candidates = new Set(records.filter(instance => isUnitMode && (allScope || targetIds.has(instance.id))
    && visibleIds.has(instance.id) && !blockedIds.has(instance.id) && !mixedIds.has(instance.id)).map(instance => instance.id));
  const eligibleIds = outermost(candidates, index.parents);
  const directIds = outermost(new Set([...selectedIds].filter(id => visibleIds.has(id) && !blockedIds.has(id) && !mixedIds.has(id))), index.parents);
  const familyIds = familyMembers(eligibleIds, index.children);
  const linkedChildIds = new Set([...familyIds].filter(id => !eligibleIds.has(id)));
  const zones = Object.fromEntries(ZONES.map(zone => [zone.role, aggregate(zone.role, zone.label)]));
  const extra = aggregate('EXTRA', '独立或未分区'), legacy = aggregate('LEGACY', '兼容旧副本');
  const cardMaps = new Map([...Object.values(zones), extra, legacy].map(zone => [zone, new Map()]));
  const buckets = new Map();
  for (const instance of records) {
    const zone = instance.legacyPlacement ? legacy : instance.linked && zoneRoles.has(instance.shootRole) ? zones[instance.shootRole] : extra;
    buckets.set(instance.id, zone);
    const asset = assets.get(instance.asset_id), assetId = instance.asset_id || '';
    // Unnamed embedded models have no shared source identity. Keep them apart.
    const key = JSON.stringify([zone.role, instance.legacyPlacement ? `legacy:${instance.id}` : assetId || `embedded:${instance.id}`]);
    const cards = cardMaps.get(zone);
    if (!cards.has(key)) cards.set(key, { key, role: zone.role, asset_id: assetId,
      name: asset?.name || instance.name || (assetId ? `旧单元枝 · ${assetId}` : '旧内嵌单元枝'),
      thumbnail: asset?.thumbnail || '', legacyPlacement:!!instance.legacyPlacement, instances: [], total: 0, selected: 0, locked: 0, blocked: 0,
      eligible: 0, manual: 0, roots: [], selectedRoots: [], revisions: [], linked: 0, embedded: 0, state: 'NONE' });
    const card = cards.get(key), root = index.roots.get(instance.id);
    const revision = instance.pinned_revision || (instance.linked ? asset?.revision : 0) || 0;
    if (!card.revisions.includes(revision)) card.revisions.push(revision);
    card[instance.linked ? 'linked' : 'embedded']++;
    for (const row of [zone, card]) {
      row.instances.push(instance); row.total++;
      if (root) row.roots.push(root);
      if (selectedIds.has(instance.id)) { row.selected++; row.selectedRoots.push(root); }
      if (lockedIds.has(instance.id)) row.locked++;
      if (blockedIds.has(instance.id)) row.blocked++;
      if (eligibleIds.has(instance.id)) row.eligible++;
      if (instance.assembly_manual || instance.assembly_refined) row.manual++;
    }
  }
  for (const zone of [...Object.values(zones), extra, legacy]) {
    zone.cards = [...cardMaps.get(zone).values()];
    zone.state = selectionState(zone.selected, zone.total);
    for (const card of zone.cards) { card.state = selectionState(card.selected, card.total); card.revisions.sort((a, b) => a - b); }
  }
  const selectedInstances = records.filter(instance => selectedIds.has(instance.id));
  const compatibleSelected = new Set(selectedInstances.filter(instance=>instance.legacyPlacement).map(instance=>instance.id));
  const selectedZones = [...new Set(selectedInstances.map(instance => buckets.get(instance.id)))];
  const assetIds = [...new Set(selectedInstances.map(instance => instance.asset_id || `embedded:${instance.id}`))];
  const assetNames = [...new Set(selectedInstances.map(instance => assets.get(instance.asset_id)?.name
    || instance.name || (instance.asset_id ? `旧单元枝 · ${instance.asset_id}` : '旧内嵌单元枝')))];
  const zoneNames = selectedZones.map(zone => zone.label);
  const selectedLocked = [...selectedIds].filter(id => lockedIds.has(id)).length;
  const selectedBlocked = [...selectedIds].filter(id => blockedIds.has(id)).length;
  const selectedMixed = [...selectedIds].filter(id => mixedIds.has(id)).length;
  const hiddenSelected = [...selectedIds].filter(id => !visibleIds.has(id)).length;
  const selectedCount = selectedIds.size + legacyIds.size;
  const legacySelected=compatibleSelected.size+legacyIds.size;
  let text = selectedCount === 0 ? '未选择单元枝' : legacySelected
    ? compatibleSelected.size ? `已选 ${selectedCount} 支 · 兼容旧副本 ${compatibleSelected.size} 支${legacyIds.size?` · 未识别旧副本 ${legacyIds.size} 支`:''}`
      : `已选 ${selectedCount} 支 · 旧副本 ${legacyIds.size} 支`
    : selectedZones.length === 1 && assetIds.length === 1
    ? `${zoneNames[0]} · ${assetNames[0]} · 已选 ${selectedIds.size} 支`
    : `已选 ${selectedIds.size} 支 · ${selectedZones.length} 个分区 · ${assetIds.length} 款素材`;
  if (allScope && isUnitMode) text += ` · 全树范围可调整 ${eligibleIds.size} 支`;
  if (selectedMixed) text += ` · 含旧新混挂子件 ${selectedMixed} 支，需分别调整`;
  if (selectedLocked) text += ` · 锁定 ${selectedLocked} 支`;
  if (selectedBlocked > selectedLocked) text += ` · 家族锁定阻止 ${selectedBlocked - selectedLocked} 支`;
  if (hiddenSelected) text += ` · 隐藏 ${hiddenSelected} 支`;
  text += ` · 直接调整 ${eligibleIds.size} 支 · 连带 ${linkedChildIds.size} 支`;
  let reason = '';
  if (!eligibleIds.size && isUnitMode) reason = selectedMixed || allScope && mixedIds.size
    ? '含旧新混挂子件，需分别调整；请独立选择其中的子件，避免整体调整丢失已保存的子件姿态和尺寸。'
    : legacyIds.size
    ? '旧复制副本没有完整单元实例记录，保持原造型；请在主枝干模式调整其承重枝，或从素材库安装新的完整单元枝。'
    : selectedBlocked || allScope && blockedIds.size ? '所选单元枝已锁定，或包含锁定子件；解锁后才可整体调整。'
      : hiddenSelected ? '所选单元枝被隔离隐藏，请先显示全部。'
        : selectedCount ? '当前作用范围排除了所选单元枝，请检查选区范围。'
          : '先框选树上的单元枝，或点右侧卡片；空选区不会自动刷全树。';
  const rootsFor = ids => [...ids].map(id => index.roots.get(id)).filter(Boolean);
  const summary = { total: records.length, unresolved: index.byInstance.size-records.length, selected: selectedCount, actualSelected: selectedIds.size-compatibleSelected.size,
    legacy: legacySelected, legacySelected:compatibleSelected.size, unsupportedLegacy:legacyIds.size,
    hiddenSelected, reason, editable: eligibleIds.size,
    eligible: eligibleIds.size, linkedChildren: linkedChildIds.size, locked: lockedIds.size,
    selectedLocked, selectedBlocked, selectedMixed,
    explicitEditable: directIds.size, zoneNames, assetIds, assetNames, text,
    scope: allScope ? 'ALL' : 'SELECTED', isUnitMode: !!isUnitMode };
  summary.legacyEditable=[...eligibleIds].filter(id=>index.byInstance.get(id)?.legacyPlacement).length;
  return { instances:records, zones, extra, legacy, summary, index, selectedIds, selectedRoots: rootsFor(selectedIds),
    directIds, directRoots: rootsFor(directIds), eligibleIds, eligibleRoots: rootsFor(eligibleIds),
    linkedChildIds, lockedIds, blockedIds, mixedIds, visibleIds, legacyIds };
}

// Criteria describe membership, not hover, camera focus, isolation or brush hits.
// allSame deliberately crosses zones (including independent instances), whereas
// the default role + assetId card action stays in its own saved zone.
export function matchUnitAssemblyRoots(model, { role, assetId, extra = false, allSame = false, instanceIds } = {}) {
  const sourceId = typeof allSame === 'string' ? allSame : assetId;
  if (allSame && !sourceId) return [];
  const memberIds = instanceIds === undefined ? null : new Set(values(instanceIds));
  const rows = allSame ? [...Object.values(model.zones), model.extra]
    : role === 'LEGACY' ? (model.legacy ? [model.legacy] : [])
    : extra || role === 'EXTRA' ? [model.extra]
      : role ? (model.zones[role] ? [model.zones[role]] : []) : [...Object.values(model.zones), model.extra, ...(model.legacy?[model.legacy]:[])];
  const result = [];
  for (const row of rows) for (const instance of row.instances) {
    if (memberIds && !memberIds.has(instance.id)) continue;
    if (sourceId !== undefined && instance.asset_id !== sourceId) continue;
    const root = model.index.roots.get(instance.id);
    if (root) result.push(root);
  }
  return [...new Set(result)];
}

/** Plain click replaces; Shift adds; Ctrl fills a partial card or removes a full
 * card. Never mutate either set, and never interpret an empty target as ALL. */
export function mergeUnitAssemblySelection(current, target, { shift = false, ctrl = false } = {}) {
  const previous = new Set(values(current)), next = new Set(values(target));
  if (!shift && !ctrl) return next;
  if (ctrl && next.size && [...next].every(id => previous.has(id))) {
    for (const id of next) previous.delete(id);
  } else for (const id of next) previous.add(id);
  return previous;
}
