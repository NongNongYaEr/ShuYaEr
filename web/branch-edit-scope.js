import { descendants } from './branch-selection.js';
import { skeletonBranches } from './skeleton-thickness.js';
import { nearestParameter } from './tree-sculpt.js';

// Resolve once per gesture, before any selection or topology changes.
export function resolveBranchEditScope(branches, selected, mode = 'SELECTED', { protectUnits = false, editable = () => true, excluded = new Set() } = {}) {
  const ids = mode === 'ALL' ? new Set(branches.map(b => b.stableId))
    : mode === 'DIRECT' ? new Set(selected) : descendants(branches, new Set(selected));
  const candidates = protectUnits ? skeletonBranches(branches) : branches;
  return new Set(candidates.filter(b => ids.has(b.stableId) && (mode === 'ALL' || !excluded.has(b.stableId)) && !b.symmetryGroup && editable(b.stableId)).map(b => b.stableId));
}

// A cut in direct-only mode must not delete attached, unselected subtrees.
export function cutHasProtectedChildren(branches, branch, t, targets) {
  return branches.some(child => child.parentId === branch.id && !targets.has(child.stableId)
    && (t <= 0 || nearestParameter(branch.points, child.points[0]) >= t - .01));
}
