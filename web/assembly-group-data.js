import { copy, resolveInstanceShape, normalizeBranchInstances } from './branch-workbench-data.js';
import { normalizeBranchArrays, generateArrayInstances, reconcileArrayInstances, arrayPlacement, arrayPlacementChanged } from './branch-array-data.js';
import { protectedAssemblyInstances } from './assembly-distribution.js';
import { assemblyBranchLimit } from './local-assembly-data.js';
import { skeletonBranches } from './skeleton-thickness.js';
import { deleteBranchInstances } from './branch-instance-operations.js';

export const ASSEMBLY_INSTANCE_LIMIT = 1600;
const canonical = (group, branches, library) => {
  group = normalizeBranchArrays([group])[0];
  if (!group) return [];
  const asset = library.find(item => item.id === group?.asset_id), parent = branches.find(branch => branch.stableId === group?.parent);
  return asset && parent ? generateArrayInstances(group, asset.shape, parent, library, { includeRemoved: true }) : [];
};

// Adopt old numeric IDs without changing any references into an installed unit.
// Each station/spoke subsequently owns the same ID even if ringCount changes.
export function stabilizeAssemblyGroup(raw, previous = raw, branches = [], library = []) {
  const group = normalizeBranchArrays([raw])[0];
  if (!group) throw Error('结构枝组配置无效');
  const old = canonical(previous, branches, library);
  const copies = previous?.arrangement === 'PAIR' ? 2 : previous?.arrangement === 'RING' ? previous.ringCount : 1;
  for (const record of old) {
    const station = record.array_station ?? Math.floor(record.array_index / copies), spoke = record.array_spoke ?? record.array_index % copies;
    const slot = `${station}:${spoke}`;
    group.member_ids[slot] ||= record.id;
    group.member_indices[slot] ??= previous?.member_indices?.[slot] ?? (previous?.identity_version === 2 ? station * 8 + spoke : record.array_index);
  }
  group.identity_version = 2;
  return group;
}

export function structureGroupState(authoring, rawGroup, branches, library = authoring.branch_library) {
  const group = normalizeBranchArrays([rawGroup])[0];
  const records = authoring.branch_instances.filter(instance => instance.array_id === group.id);
  const automatic = new Map(canonical(group, branches, library).map(record => [record.id, record]));
  const edited = protectedAssemblyInstances(authoring), locked = new Set(group.locked);
  const states = new Map();
  for (const record of records) {
    const baseline = group.placement_baselines[record.id] || automatic.get(record.id);
    states.set(record.id, record.assembly_locked || locked.has(record.id) ? 'LOCKED'
      : record.assembly_refined || record.assembly_manual || edited.has(record.id) || arrayPlacementChanged(record, baseline) ? 'MANUAL' : 'AUTO');
  }
  return { group, records, states, total: records.length,
    automatic: records.filter(record => states.get(record.id) === 'AUTO'),
    manual: records.filter(record => states.get(record.id) === 'MANUAL'),
    locked: records.filter(record => states.get(record.id) === 'LOCKED'),
    removed: group.removed.length };
}

export function structureGroupCarrier(branches, selected = '') {
  const carriers = skeletonBranches(branches).filter(branch => !branch.symmetryGroup);
  return carriers.find(branch => branch.stableId === selected) || carriers.find(branch => branch.parentId < 0) || carriers[0];
}

export function planAssemblyGroup(authoring, branches, rawGroup, library = authoring.branch_library, options = {}) {
  const next = copy(authoring), previous = authoring.branch_arrays.find(group => group.id === rawGroup.id);
  if (!previous && authoring.branch_arrays.length >= 16) throw Error('结构枝组最多 16 组');
  if (!library.some(asset => asset.id === rawGroup.asset_id)) throw Error('请先为结构枝组选一款当前工程中的单元枝');
  const parent = branches.find(branch => branch.stableId === rawGroup.parent);
  if (!parent) throw Error('结构枝组的母枝已不存在，请重新选择承重枝干');
  if (parent.symmetryGroup || parent.instanceId || parent.unitOwner) throw Error('结构枝组请挂到主干或承重骨架上；单元枝内部请进入枝条工作台编辑');
  const group = stabilizeAssemblyGroup(rawGroup, previous || { ...rawGroup, identity_version: 2 }, branches, library);
  const before = previous ? canonical(previous, branches, library) : [];
  const current = authoring.branch_instances.filter(instance => instance.array_id === group.id);
  const state = previous ? structureGroupState(authoring, previous, branches, library) : null;
  // An old individual deletion becomes a persistent empty slot when its group
  // is next edited; changing count/ringCount must not silently fill it again.
  const live = new Set(current.map(instance => instance.id));
  const absent = before.filter(instance => !live.has(instance.id)).map(instance => instance.id);
  group.removed = options.fillMissing ? [] : [...new Set([...group.removed, ...absent])];
  const rest = authoring.branch_instances.filter(instance => instance.array_id !== group.id), foreignIds = new Set(rest.map(instance => instance.id));
  // Detaching a member keeps its original ID outside this group. Filling the
  // old slot creates a new identity so that the hand-placed branch stays valid.
  for (const [slot, id] of Object.entries(group.member_ids)) if (foreignIds.has(id) && !group.removed.includes(id)) {
    let serial = 1, replacement;
    do { replacement = `${group.id}_S${slot.split(':')[0]}_P${slot.split(':')[1]}_R${serial++}`; } while (foreignIds.has(replacement) || current.some(instance => instance.id === replacement));
    group.member_ids[slot] = replacement;
  }
  const desired = generateArrayInstances(group, library.find(asset => asset.id === group.asset_id).shape, parent, library, { includeRemoved: true });
  const protectedIds = new Set([...(state?.manual || []).map(instance => instance.id), ...(state?.locked || []).filter(instance => instance.assembly_locked || group.locked.includes(instance.id)).map(instance => instance.id)]);
  for (const id of options.forceAutomatic || []) protectedIds.delete(id);
  const records = normalizeBranchInstances(reconcileArrayInstances(desired, before, current, group.locked, {
    groupId: group.id, baselines: previous?.placement_baselines, protected: protectedIds, removed: group.removed,
    forceAutomatic: options.forceAutomatic, fillMissing: options.fillMissing,
  }));
  if (rest.length + records.length > ASSEMBLY_INSTANCE_LIMIT) throw Error(`装配总量最多 ${ASSEMBLY_INSTANCE_LIMIT} 支，请减少结构枝的层数或每层支数`);
  const oldIds = new Set(current.map(instance => instance.id));
  const baseCost = branches.filter(branch => !oldIds.has(branch.instanceId)).length;
  const cost = records.reduce((sum, instance) => {
    const original = current.find(record => record.id === instance.id);
    const actual = original && protectedIds.has(instance.id) ? branches.filter(branch => branch.instanceId === instance.id).length : 0;
    return sum + (actual || resolveInstanceShape(instance, library)?.branches?.length || 0);
  }, 0);
  const limit = assemblyBranchLimit(authoring);
  if (baseCost + cost > limit) throw Error(`这些单元枝包含 ${cost} 段木质枝；整树将达到 ${baseCost + cost} / ${limit} 段，请减少层数或使用更简单的样本`);
  const desiredById = new Map(desired.map(instance => [instance.id, instance]));
  group.placement_baselines = { ...(previous?.placement_baselines || {}) };
  for (const instance of records) {
    const generated = desiredById.get(instance.id);
    if (generated && !protectedIds.has(instance.id)) group.placement_baselines[instance.id] = arrayPlacement(generated);
    else if (!group.placement_baselines[instance.id]) {
      const baseline = before.find(record => record.id === instance.id);
      if (baseline) group.placement_baselines[instance.id] = arrayPlacement(baseline);
    }
  }
  for (const instance of desired) {
    const slot = `${instance.array_station}:${instance.array_spoke}`;
    group.member_ids[slot] ||= instance.id;
    group.member_indices[slot] ??= instance.array_station * 8 + instance.array_spoke;
  }
  next.branch_arrays = previous ? next.branch_arrays.map(record => record.id === group.id ? group : record) : [...next.branch_arrays, group];
  next.branch_instances = [...rest, ...records];
  const completeAssets = [...new Set(records.map(instance => instance.asset_id))].map(id => library.find(asset => asset.id === id)).filter(asset => asset?.sample);
  if (completeAssets.length) {
    next.recipe = { ...next.recipe, tags: [...new Set([...(next.recipe?.tags || []), 'SAMPLE_FOLIAGE_FROM_LIBRARY'])] };
    const organs = new Map((next.tree_organs?.units || []).map(unit => [unit.id, unit]));
    for (const asset of completeAssets) for (const unit of asset.sample.authoring?.tree_organs?.units || []) organs.set(unit.id, copy(unit));
    next.tree_organs = { ...next.tree_organs, units: [...organs.values()] };
  }
  const recordIds = new Set(records.map(instance => instance.id));
  return { authoring: next, group, records, removed: current.filter(instance => !recordIds.has(instance.id)).map(instance => instance.id),
    added: records.filter(instance => !live.has(instance.id)).map(instance => instance.id),
    protectedCount: records.filter(instance => protectedIds.has(instance.id)).length,
    expected: desired.filter(instance => !group.removed.includes(instance.id)).length, woodCost: baseCost + cost, woodLimit: limit };
}

export function removeStructureMember(authoring, groupId, memberId) {
  const group = authoring.branch_arrays.find(record => record.id === groupId), instance = authoring.branch_instances.find(record => record.id === memberId && record.array_id === groupId);
  if (!group || !instance) throw Error('该枝条已不在结构枝组中');
  group.removed = [...new Set([...(group.removed || []), memberId])];
  group.locked = (group.locked || []).filter(id => id !== memberId);
  deleteBranchInstances(authoring, [instance]);
}

export function deleteStructureGroup(authoring, groupId) {
  const members = authoring.branch_instances.filter(instance => instance.array_id === groupId);
  deleteBranchInstances(authoring, members);
  authoring.branch_arrays = authoring.branch_arrays.filter(group => group.id !== groupId);
}

export function detachStructureGroup(authoring, groupId) {
  for (const instance of authoring.branch_instances) if (instance.array_id === groupId) {
    instance.array_id = ''; instance.assembly_manual = true; instance.assembly_refined = true;
  }
  authoring.branch_arrays = authoring.branch_arrays.filter(group => group.id !== groupId);
}
