import { skeletonBranches } from './skeleton-thickness.js';
import { descendants } from './branch-selection.js';
import { protectedAssemblyInstances, isAutomaticPlacement, recordGeneratedPlacements } from './assembly-distribution.js';
import { normalizeAssemblySlots, resizeAssemblyInstances } from './branch-assembly.js';
import { growthPositions } from './assembly-growth.js';
import { applyAssemblyScale } from './assembly-scale.js';
import { resolveInstanceShape } from './branch-workbench-data.js';

export function assemblyProtection(authoring) {
  const edited = protectedAssemblyInstances(authoring);
  return new Map(authoring.branch_instances.map(i => [i.id,
    i.assembly_locked ? '手动锁定' : i.array_id ? '独立阵列' : !i.linked ? '独立副本' : edited.has(i.id) ? '局部精修或附属挂接'
      : !isAutomaticPlacement(authoring, i) ? '手工挂点或来源未确认' : '']));
}
export function assemblyTargets(branches, authoring, selected, scope = 'SELECTED') {
  const bones = skeletonBranches(branches).filter(b => !b.symmetryGroup);
  if (scope === 'TREE') return bones.map(b => b.stableId);
  const roots = new Set();
  for (const id of selected) {
    if (bones.some(b => b.stableId === id)) roots.add(id);
    else { const owner = authoring.branch_instances.find(i => id === i.id || id.startsWith(i.id + '.')); if (owner) roots.add(owner.parent); }
  }
  const all = scope === 'SUBTREE' ? descendants(bones, roots) : roots;
  return bones.filter(b => all.has(b.stableId)).map(b => b.stableId);
}
export function localAssemblyRange(raw = {}) {
  const start = Number(raw.start ?? 0), end = Number(raw.end ?? 1);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 1 || start >= end) throw Error('起止范围须在 0–100%，且起点小于终点');
  return { start, end, role: ['MATURE','MIXED','YOUNG'].includes(raw.role) ? raw.role : 'ANY' };
}
export function localAssemblyState(authoring, targets, range = {}) {
  const r = localAssemblyRange(range), parents = new Set(targets), protection = assemblyProtection(authoring);
  const total = authoring.branch_instances.filter(i => parents.has(i.parent) && i.attach >= r.start && i.attach <= r.end && (r.role === 'ANY' || i.shootRole === r.role));
  const symmetry = authoring.symmetry_groups?.some(g => g.enabled);
  const editable = total.filter(i => !symmetry && !protection.get(i.id));
  return { total, editable, protected: total.filter(i => !editable.includes(i)), protection };
}
export function assemblyBranchLimit(authoring) {
  const tags = authoring.recipe?.tags || [];
  return tags.includes('DENSE_AUTHORED_SAMPLE_ASSEMBLY') ? 11000 : tags.includes('DENSE_AUTHORED_CROWN') ? 3200 : 2200;
}
export function inAssemblyVoid(authoring, parent, attach, role) {
  return (authoring.workbench?.assembly_voids || []).some(r => r.parents.includes(parent) && attach >= r.start && attach <= r.end && (r.role === 'ANY' || r.role === role));
}
export function localAssemblyPlan(authoring, branches, targets, options = {}) {
  if (!targets.length) throw Error('请先选择承重枝干，或用刷选建立范围');
  const r = localAssemblyRange(options), state = localAssemblyState(authoring, targets, r);
  const before = new Map(authoring.branch_instances.map(i => [i.id, {...i}]));
  const unlocked = new Set(state.editable.map(i => i.id));
  const action = options.action || 'COUNT';
  if(authoring.symmetry_groups?.some(g=>g.enabled)&&!['LOCK','UNLOCK','CLEAR_VOID'].includes(action))throw Error('联动枝群开启时，请先关闭联动再修改局部装配');
  const voids = authoring.workbench?.assembly_voids || [];
  if (action === 'LOCK' || action === 'UNLOCK') {
    for (const i of state.total) i.assembly_locked = action === 'LOCK';
  } else if (action === 'CLEAR_VOID') {
    authoring.workbench = { ...authoring.workbench, assembly_voids: voids.map(v => v.start === r.start && v.end === r.end && v.role === r.role
      ? {...v, parents:v.parents.filter(p=>!targets.includes(p))} : v).filter(v=>v.parents.length) };
  } else if (action === 'REPLACE') {
    const asset = authoring.branch_library.find(a => a.id === options.assetId);
    if (!asset) throw Error('请从当前工程素材中选择替换样本');
    const extra=state.editable.reduce((n,i)=>n+asset.shape.branches.length-(resolveInstanceShape(i,authoring.branch_library)?.branches?.length||0),0);
    if(branches.length+extra>assemblyBranchLimit(authoring))throw Error('替换样本超出枝干预算，请缩小范围或使用更短样本');
    for (const i of state.editable) { i.asset_id = asset.id; i.pinned_revision = asset.revision; i.shape = asset.shape; }
    const slots = normalizeAssemblySlots(authoring.workbench?.assembly_slots, authoring.branch_library);
    for (const i of state.editable) if (slots[i.shootRole] && !slots[i.shootRole].includes(asset.id)) slots[i.shootRole].push(asset.id);
    authoring.workbench = { ...authoring.workbench, assembly_slots: slots };
    recordGeneratedPlacements(authoring, [...unlocked]);
  } else if (action === 'COUNT' || action === 'VOID') {
    const requested = action === 'VOID' ? 0 : Number(options.count);
    if (!Number.isInteger(requested) || requested < 0 || requested > 1600) throw Error('局部目标单元枝数量须在 0–1600 之间');
    if (requested < state.protected.length && action !== 'VOID') throw Error(`范围内有 ${state.protected.length} 根受保护单元枝，目标数量不能更低`);
    const count = Math.max(0, requested - state.protected.length);
    if (count <= state.editable.length) {
      const keep = new Set(Array.from({length: count}, (_, n) => state.editable[Math.floor((n + .5) * state.editable.length / count)]?.id));
      authoring.branch_instances = authoring.branch_instances.filter(i => !unlocked.has(i.id) || keep.has(i.id));
    } else {
      const slots = normalizeAssemblySlots(authoring.workbench?.assembly_slots, authoring.branch_library);
      if (r.role !== 'ANY') for (const key of Object.keys(slots)) if (key !== r.role) slots[key] = [];
      if (options.assetId) {
        const asset = authoring.branch_library.find(a => a.id === options.assetId); if (!asset) throw Error('当前素材已不在工程中');
        const roles = r.role === 'ANY' ? ['MATURE','MIXED','YOUNG'] : [r.role]; for (const role of roles) slots[role] = [asset.id];
      }
      const allIds = new Set(authoring.branch_instances.map(i => i.id));
      // Resize receives only this selection as eligible carriers, but all existing
      // IDs/occupancy remain visible. No reallocation of the surrounding crown.
      const carriers = skeletonBranches(branches).filter(b => targets.includes(b.stableId));
      if (!carriers.length) throw Error('没有可用承重枝干');
      const managed = authoring.branch_instances.filter(i => i.linked && Object.values(slots).flat().includes(i.asset_id));
      const next = resizeAssemblyInstances(authoring.branch_instances, slots, authoring.branch_library, managed.length + count - state.editable.length,
        carriers, assemblyBranchLimit(authoring), branches.length, authoring);
      const added = next.filter(i => !allIds.has(i.id));
      for (const parent of targets) {
        const items = added.filter(i => i.parent === parent);
        const positions = growthPositions(items.length, {start:r.start,end:r.end});
        items.forEach((i,n) => { i.attach = positions[n]; if (voids.some(v => v.parents.includes(parent) && i.attach >= v.start && i.attach <= v.end && (v.role === 'ANY' || v.role === i.shootRole))) throw Error('新增位置与保留空隙重叠，请先解除该空隙或调整范围'); });
      }
      authoring.branch_instances = next;
      if(authoring.workbench?.assembly_scale)applyAssemblyScale(authoring);
      const merged = normalizeAssemblySlots(authoring.workbench?.assembly_slots, authoring.branch_library);
      for (const i of added) if (!merged[i.shootRole].includes(i.asset_id)) merged[i.shootRole].push(i.asset_id);
      authoring.workbench = { ...authoring.workbench, assembly_slots:merged };
      recordGeneratedPlacements(authoring, added.map(i => i.id));
    }
    if (action === 'VOID') authoring.workbench = { ...authoring.workbench, assembly_voids:[...voids, {...r, parents:[...targets]}] };
  } else if (action === 'DISTRIBUTE') {
    for (const parent of targets) {
      const items = state.editable.filter(i => i.parent === parent).sort((a,b)=>a.id.localeCompare(b.id));
      const positions = growthPositions(items.length, {...r,profile:options.profile,feather:.12});
      items.forEach((i,n)=>{ if (inAssemblyVoid(authoring,parent,positions[n],i.shootRole)) throw Error('重新铺设与保留空隙重叠，请调整范围'); i.attach=positions[n];i.frame=null; });
    }
    recordGeneratedPlacements(authoring, [...unlocked]);
  } else throw Error('未知局部装配操作');
  const after = new Map(authoring.branch_instances.map(i=>[i.id,i]));
  const added=[...after.keys()].filter(id=>!before.has(id)),removed=[...before.keys()].filter(id=>!after.has(id));
  const changed=[...after.keys()].filter(id=>before.has(id)&&JSON.stringify(after.get(id))!==JSON.stringify(before.get(id)));
  return { added,removed,changed,protectedCount:state.protected.length,targets:[...targets] };
}
