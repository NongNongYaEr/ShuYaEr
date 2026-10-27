import { skeletonBranches } from './skeleton-thickness.js';
import { findAssemblyGaps } from './assembly-coverage.js';
import { protectedAssemblyInstances, isAutomaticPlacement, isPreservedAssemblyGap } from './assembly-distribution.js';

export const ASSEMBLY_ZONES = [
  { role: 'MATURE', label: '偏内部 · 深绿' },
  { role: 'MIXED', label: '中间 · 混合' },
  { role: 'YOUNG', label: '末端 · 嫩绿' },
];

export function normalizeAssemblySlots(raw, library = []) {
  const valid = new Set(library.map((asset) => asset.id));
  return Object.fromEntries(ASSEMBLY_ZONES.map(({ role }) => [role,
    [...new Set((Array.isArray(raw?.[role]) ? raw[role] : []).filter((id) => valid.has(id)))]]));
}

export function inferAssemblySlots(instances, library) {
  const slots = normalizeAssemblySlots(null, library);
  for (const instance of instances || []) {
    if (instance.linked && slots[instance.shootRole] && !slots[instance.shootRole].includes(instance.asset_id))
      slots[instance.shootRole].push(instance.asset_id);
  }
  return slots;
}

export function addAssemblyAsset(slots, role, assetId, library) {
  if (!ASSEMBLY_ZONES.some((zone) => zone.role === role) || !library.some((asset) => asset.id === assetId)) return slots;
  const next = normalizeAssemblySlots(slots, library);
  if (!next[role].includes(assetId)) next[role].push(assetId);
  return next;
}

export function countAssemblyInstances(instances, slots) {
  const ids = new Set(Object.values(slots || {}).flat());
  return (instances || []).filter((instance) => instance.linked && ids.has(instance.asset_id)).length;
}

export function resizeAssemblyInstances(instances, slots, library, requested, branches, branchLimit, currentBranchCount, authoring = null) {
  const ids = new Set(Object.values(slots || {}).flat());
  const managed = instances.filter((instance) => instance.linked && ids.has(instance.asset_id));
  const unmanaged = instances.filter((instance) => !instance.linked || !ids.has(instance.asset_id));
  const target = Number(requested);
  if (!Number.isInteger(target) || target < 0 || target + unmanaged.length > 1600)
    throw new Error(`单元枝数量须在 0–${1600 - unmanaged.length} 之间`);
  if (target === managed.length) return instances;
  if (target < managed.length) {
    const protectedIds = authoring ? protectedAssemblyInstances(authoring) : new Set(managed.filter(i=>i.assembly_locked).map(i=>i.id));
    const kept = managed.filter(i=>protectedIds.has(i.id) || authoring && (!isAutomaticPlacement(authoring,i) || i.array_id));
    if (authoring?.symmetry_groups?.some(g=>g.enabled)) throw Error('联动枝群开启时，请先关闭联动再增减装配');
    if (target < kept.length) throw Error(`已有 ${kept.length} 根锁定或已编辑单元枝，目标数量不能更低`);
    const candidates = managed.filter(i=>!kept.includes(i)), remainingTarget = target-kept.length;
    const chosen = new Set(kept);
    const groups = [...ASSEMBLY_ZONES.map(({ role }) => candidates.filter((instance) => instance.shootRole === role)),
      candidates.filter((instance) => !ASSEMBLY_ZONES.some(({ role }) => role === instance.shootRole))];
    const quotas = groups.map((group) => candidates.length ? remainingTarget * group.length / candidates.length : 0);
    const allocated = quotas.map(Math.floor);
    for (let remaining = remainingTarget - allocated.reduce((sum, count) => sum + count, 0); remaining > 0; remaining--)
      allocated[quotas.map((quota, index) => ({ index, fraction: quota - allocated[index] }))
        .sort((a, b) => b.fraction - a.fraction)[0].index]++;
    groups.forEach((group, roleIndex) => {
      const count = allocated[roleIndex];
      for (let index = 0; index < count; index++) chosen.add(group[Math.floor((index + 0.5) * group.length / count)]);
    });
    return instances.filter((instance) => !managed.includes(instance) || chosen.has(instance));
  }
  const byId = new Map(library.map((asset) => [asset.id, asset]));
  const activeRoles = ASSEMBLY_ZONES.map(({ role }) => role).filter((role) => slots[role]?.some((id) => byId.has(id)));
  if (!activeRoles.length) throw new Error('请先将枝条素材拖入至少一个装配区间');
  const native = skeletonBranches(branches || []).filter((branch) => branch.stableId && branch.order >= 1 && branch.length >= 0.2);
  const gapOrder = new Map(findAssemblyGaps(branches || [], instances).map((gap, n) => [gap.branch.stableId, n]));
  if (!native.length) throw new Error('当前树形没有可用的单元枝挂接点');
  const point = (value) => Array.isArray(value) ? value : [value.x, value.y, value.z];
  const origin = point(branches[0].points[0]);
  const parents = native.map((branch, index) => {
    const end = point(branch.points.at(-1));
    return { branch, index, exposure: Math.hypot(end[0] - origin[0], end[1] - origin[1]) + (end[2] - origin[2]) * 0.25,
      attaches: instances.filter((instance) => instance.parent === branch.stableId).map((instance) => instance.attach) };
  }).sort((a, b) => a.exposure - b.exposure);
  parents.forEach((parent, index) => { const fraction = (index + 0.5) / parents.length;
    parent.role = fraction < 0.4 ? 'MATURE' : fraction < 0.9 ? 'MIXED' : 'YOUNG'; });
  const roleCounts = Object.fromEntries(activeRoles.map((role) => [role, managed.filter((instance) => instance.shootRole === role).length]));
  const roleWeights = Object.fromEntries(activeRoles.map((role) => [role, managed.length ? Math.max(1, roleCounts[role]) : ({ MATURE: 4, MIXED: 5, YOUNG: 1 })[role]]));
  const usedIds = new Set(instances.map((instance) => instance.id));
  const added = []; let usedBranches = currentBranchCount; let serial = 1;
  for (let index = managed.length; index < target; index++) {
    const role = activeRoles.reduce((best, current) => roleCounts[current] / roleWeights[current] < roleCounts[best] / roleWeights[best] ? current : best);
    const candidates = slots[role].map((id) => byId.get(id)).filter(Boolean);
    const asset = candidates[roleCounts[role] % candidates.length];
    const cost = asset.shape.branches.length;
    if (usedBranches + cost > branchLimit) throw new Error(`枝干预算最多可容纳 ${managed.length + added.length} 个装配单元枝；可减少其他枝条或选用更短样本`);
    const roleParents = parents.filter((parent) => parent.role === role || !activeRoles.includes(parent.role));
    const pool = (roleParents.length ? roleParents : parents).filter(parent=>[.36,.5,.64,.78,.82,.9].some(t=>!isPreservedAssemblyGap(authoring,parent.branch.stableId,t,role)));
    if (!pool.length) throw Error('可用挂点均被保留空隙覆盖，请调整空隙范围');
    const emptyTips = pool.filter(p => !p.attaches.length && gapOrder.has(p.branch.stableId));
    const parent = emptyTips.length ? emptyTips.sort((a, b) => gapOrder.get(a.branch.stableId) - gapOrder.get(b.branch.stableId))[0]
      : pool.reduce((best, current) => current.attaches.length < best.attaches.length
      || current.attaches.length === best.attaches.length && current.index < best.index ? current : best);
    const attachOptions = [0.36, 0.5, 0.64, 0.78, 0.82, 0.9].filter(t=>!isPreservedAssemblyGap(authoring,parent.branch.stableId,t,role));
    const attach = emptyTips.length && attachOptions.includes(.82) ? .82 : attachOptions.reduce((best, current) => {
      const clearance = (value) => Math.min(1, ...parent.attaches.map((other) => Math.abs(value - other)));
      return clearance(current) > clearance(best) ? current : best;
    });
    parent.attaches.push(attach);
    let id; do { id = `ASSEMBLY_DENSITY_${String(serial++).padStart(4, '0')}`; } while (usedIds.has(id));
    usedIds.add(id);
    const radius = parent.branch.endRadius || parent.branch.startRadius || 0.03;
    added.push({ id, parent: parent.branch.stableId, asset_id: asset.id, linked: true,
      pinned_revision: asset.revision, shape: asset.shape, shootRole: role, attach,
      angle: 29 + (serial * 19 % 34), azimuth: -180 + (serial * 137.5 % 360), roll: -25 + (serial * 23 % 51),
      scale: asset.sample ? 1 : Math.max(0.15, Math.min(1.4, radius * 0.62 / Math.max(0.001, asset.shape.branches[0].start_radius))),
      variation: 0.12, seed: 1009 + serial * 7919 });
    roleCounts[role]++; usedBranches += cost;
  }
  return [...instances, ...added];
}

export function assignAssemblyInstances(instances, slots, library, roles = ASSEMBLY_ZONES.map((zone) => zone.role), authoring = null) {
  const byId = new Map(library.map((asset) => [asset.id, asset]));
  const counters = Object.fromEntries(ASSEMBLY_ZONES.map(({ role }) => [role, 0]));
  const protectedIds = authoring ? protectedAssemblyInstances(authoring) : new Set();
  return instances.map((instance) => {
    const role = instance.shootRole;
    if (!roles.includes(role) || !slots[role]?.length) return instance;
    if (instance.assembly_locked || authoring && (protectedIds.has(instance.id) || !isAutomaticPlacement(authoring,instance) || instance.array_id || !instance.linked)) { counters[role]++; return instance; }
    const candidates = slots[role].filter((id) => byId.has(id));
    if (!candidates.length) return instance;
    const asset = byId.get(candidates[counters[role]++ % candidates.length]);
    return { ...instance, asset_id: asset.id, linked: true, pinned_revision: asset.revision, shape: instance.shape || asset.shape };
  });
}

export function seedAssemblyInstances(branches, slots, library, limit = 120) {
  const first = Object.values(slots).flat().map((id) => library.find((asset) => asset.id === id)).find(Boolean);
  if (!first || !branches?.length) return [];
  const native = skeletonBranches(branches), candidates = native.filter((branch) => branch.order >= 1 && branch.length >= 0.2);
  const parents = candidates.length ? candidates : native.filter((branch) => branch.order >= 1);
  if (!parents.length) return [];
  const tips = findAssemblyGaps(branches, []).map(g => g.branch), tipIds = new Set(tips.map(b => b.stableId));
  const pool = [...tips, ...parents.filter(b => !tipIds.has(b.stableId))];
  const selected = pool.slice(0, Math.min(limit, pool.length));
  const xyz = (point) => Array.isArray(point) ? point : [point.x, point.y, point.z];
  const origin = xyz(branches[0].points[0]);
  const ranked = selected.map((branch, index) => {
    const end = xyz(branch.points.at(-1));
    return { branch, index, exposure: Math.hypot(end[0] - origin[0], end[1] - origin[1]) + (end[2] - origin[2]) * 0.25 };
  }).sort((a, b) => a.exposure - b.exposure);
  const roles = new Array(selected.length);
  ranked.forEach(({ index }, rank) => { const t = (rank + 0.5) / ranked.length; roles[index] = t < 0.4 ? 'MATURE' : t < 0.9 ? 'MIXED' : 'YOUNG'; });
  return selected.map((branch, index) => {
    const root = first.shape.branches[0];
    const radius = branch.endRadius || branch.startRadius || 0.03;
    return { id: `ASSEMBLY_${String(index + 1).padStart(4, '0')}`, parent: branch.stableId,
      asset_id: first.id, linked: true, pinned_revision: first.revision, shape: first.shape,
      shootRole: roles[index], attach: tipIds.has(branch.stableId) ? .82 : 0.46 + (index * 37 % 31) / 100,
      angle: 28 + (index * 19 % 37), azimuth: -180 + (index * 137.5 % 360), roll: -25 + (index * 23 % 51),
      scale: first.sample ? 1 : Math.max(0.15, Math.min(1.4, radius * 0.62 / Math.max(0.001, root.start_radius))),
      variation: 0.12, seed: 1009 + index * 7919 };
  });
}
