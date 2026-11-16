import { assemblyBranchLimit } from './assembly-budget.js';
import { assemblyCardScale } from './assembly-scale.js';
import { resolveInstanceShape } from './branch-workbench-data.js';

// A different model can have different internal branch and foliage IDs. Leave
// units with project-local internal edits or dependent mounts in place.
export function unitAssetApplySelection(authoring, selection) {
  const { index, selectedIds, visibleIds, blockedIds, mixedIds } = selection;
  const selectedCount = selection.summary.selected;
  if (!selectedIds.size) return { eligible: [], selectedCount, protectedCount: selectedCount, branchCount: index.byBranch.size };
  const protectedIds = new Set([...blockedIds, ...mixedIds]);
  const protect = id => {
    const owner = index.ownerOf(id) || index.boundary.owners.get(id);
    if (owner) protectedIds.add(owner.id);
  };
  for (const id of index.children.keys()) protect(id);
  for (const id of Object.keys(authoring.overrides)) protect(id);
  for (const layer of authoring.sculpt_layers) {
    for (const id of [...Object.keys(layer.branches), ...(layer.operation?.targets || [])]) protect(id);
    for (const branch of layer.operation?.records || []) protect(branch.parent);
  }
  for (const branch of authoring.manual_branches) protect(branch.parent);
  for (const [id, parent] of Object.entries(authoring.topology.reparent)) {
    protect(id);
    protect(parent);
  }
  for (const id of authoring.topology.suppressed) protect(id);
  for (const item of [...authoring.leaf_edits.added, ...authoring.unit_editing.items, ...(authoring.mesh_units?.instances || [])]) protect(item.parent);
  for (const id of [...authoring.leaf_edits.removed, ...authoring.unit_editing.removed]) protect(id);
  for (const rule of authoring.unit_editing.rules) for (const id of rule.targets) protect(id);
  const protectedFamilies = [...protectedIds];
  for (let i = 0; i < protectedFamilies.length; i++) {
    const parent = index.parents.get(protectedFamilies[i]);
    if (parent && !protectedIds.has(parent)) {
      protectedIds.add(parent);
      protectedFamilies.push(parent);
    }
  }

  const placed = new Map(authoring.branch_instances.map(instance => [instance.id, instance]));
  const revisions = new Map(authoring.branch_library.map(item => [item.id, item.revision]));
  const eligible = [];
  for (const id of selectedIds) {
    const instance = placed.get(id);
    if (instance && visibleIds.has(id) && !protectedIds.has(id) && !instance.array_id && !instance.prefab_root) {
      eligible.push({ instance, root: index.roots.get(id), revision: instance.pinned_revision || revisions.get(instance.asset_id),
        branchCount: resolveInstanceShape(instance, authoring.branch_library)?.branches.length || 0 });
    }
  }
  return { eligible, selectedCount, protectedCount: selectedCount - eligible.length,
    branchCount: index.byBranch.size };
}

export function planUnitAssetApply(authoring, selection, target) {
  const result = (reason, rows = []) => ({ count: rows.length, reason, rows, target, skipped: selection.protectedCount });
  if (!target?.shape?.branches.length) return result('这张卡片的源单元枝不可用');
  if (!selection.selectedCount) return result('先在整树上点选或框选要更换的单元枝');
  if (authoring.symmetry_groups.some(group => group.enabled)) return result('请先关闭联动枝群，再更换单元枝素材');
  if (!selection.eligible.length) return result('所选单元枝已锁定、隐藏，或有需要保留的内部编辑与子件');
  const rows = selection.eligible.filter(({ instance, revision }) => !instance.linked || instance.asset_id !== target.id ||
    revision !== target.revision);
  if (!rows.length) return result('已选单元枝已使用这款素材及版本');
  const newCount = selection.branchCount + rows.reduce((sum, row) => sum + target.shape.branches.length - row.branchCount, 0);
  if (newCount > assemblyBranchLimit(authoring)) return result('应用后将超过当前整树枝段预算，请减少选中数量');
  return result('', rows);
}

export function applyUnitAssetPlan(authoring, { rows, target }) {
  const ids = new Set(rows.map(row => row.instance.id));
  const roots = new Map(rows.map(({ instance, root }) => [root, instance.id + '.' + target.shape.branches[0].id]));
  const instances = authoring.branch_instances.map(instance => ids.has(instance.id)
    ? { ...instance, asset_id: target.id, linked: true, pinned_revision: target.revision,
      shape: target.shape, assembly_manual: true, assembly_refined: true }
    : instance);
  let workbench = authoring.workbench;
  const scale = workbench?.assembly_scale;
  if (scale) {
    const records = { ...scale.records };
    for (const { instance } of rows) {
      const factor = scale.overall * assemblyCardScale(workbench, instance.shootRole, target.id);
      records[instance.id] = { base: instance.scale / factor, factor, scale: instance.scale };
    }
    workbench = { ...workbench, assembly_scale: { ...scale, records } };
  }
  const selectionSets = Object.fromEntries(Object.entries(authoring.selection_sets)
    .map(([name, selection]) => [name, selection.map(id => roots.get(id) || id)]));
  return { authoring: { ...authoring, branch_instances: instances, workbench, selection_sets: selectionSets }, roots };
}
