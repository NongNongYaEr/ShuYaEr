import { descendants } from './branch-selection.js';

// Delete is selection-based even when a brush is set to affect the whole tree.
// Suppress only outer roots so restoring one root restores the whole bundle.
export function planBranchDeletion(branches, selected, excluded = new Set()) {
  const byStable = new Map(branches.map(b => [b.stableId, b])), candidates = [], skipped = [];
  for (const id of selected) {
    const b = byStable.get(id); if (!b) continue;
    if (b.parentId < 0 || b.order === 0) { skipped.push('主干保留'); continue; }
    if (b.unitOwner || b.instanceId || b.symmetryGroup) { skipped.push('单元枝或联动副本保持独立'); continue; }
    const subtree = descendants(branches, new Set([id]));
    if ([...subtree].some(key => excluded.has(key))) { skipped.push('枝束含已减选的子枝，请先加回选区'); continue; }
    candidates.push({ id, subtree });
  }
  const roots = candidates.filter(c => !candidates.some(other => other !== c && other.subtree.has(c.id))).map(c => c.id);
  const removed = descendants(branches, new Set(roots));
  return { roots, removed, skipped: [...new Set(skipped)] };
}
