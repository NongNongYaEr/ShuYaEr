import { captureBranchDuplicate } from './branch-duplicate.js';
import { descendants, selectionRoots } from './branch-selection.js';
import { resolvePveExportPlan } from './pve-export-plan.js';
import { instanceMatrix } from './branch-instance-edit.js';
import { instanceFromMatrix } from './branch-instance-operations.js';

// A carrier copy snapshots only its structural wood. Installed complete models
// remain linked instances so copying a carrier cannot invent model variants.
export function captureLinkedBranchDuplicate(asset, selected, token, leafSources = []) {
  const operation = captureBranchDuplicate(asset, selected, token, leafSources);
  const roots = selectionRoots(asset.masterBranches, selected);
  const family = descendants(asset.masterBranches, new Set(roots.map(b => b.stableId)));
  const branches = asset.masterBranches.filter(b => family.has(b.stableId));
  const mapping = new Map(branches.map((b, i) => [b.stableId, operation.records[i].id]));
  const units = resolvePveExportPlan(asset).units.filter(u => !u.variantRequired && u.branches.every(b => family.has(b.stableId)));
  const instanceIds = new Map(units.map((u, i) => [u.id, token + '_U' + i]));
  for (const unit of units) for (const b of unit.branches)
    mapping.set(b.stableId, instanceIds.get(unit.id) + b.stableId.slice(unit.id.length));
  const omitted = new Set(units.flatMap(u => u.branches.map(b => b.stableId)));
  operation.records = operation.records.filter((r, i) => !omitted.has(branches[i].stableId));
  const copies = units.map(unit => {
    const original = unit.sourceInstance, shape = unit.sourceAsset.shape;
    const placed = instanceFromMatrix(original, shape, unit.parent, instanceMatrix(original, shape, asset.masterBranches, asset.settings));
    return { ...structuredClone(placed), id: instanceIds.get(unit.id), parent: mapping.get(original.parent) || original.parent,
      unit_seed_owner: original.unit_seed_owner || original.id, array_id: '', assembly_manual: true };
  });
  return { operation, copies, mapping };
}
