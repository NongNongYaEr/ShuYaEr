import { descendants } from './branch-selection.js';

// Subtraction under a selected parent needs explicit exclusions; deleting the
// child only from the selected roots would expand it back into the edit scope.
export function combineScopedSelection(branches, selected, hits, operation, includeChildren, previousExclusions = new Set()) {
  const affected = includeChildren ? descendants(branches, hits) : new Set(hits);
  const ids = new Set(operation === 'REPLACE' ? hits : selected);
  const excluded = new Set(operation === 'REPLACE' || !includeChildren ? [] : previousExclusions);
  if (operation === 'ADD') { hits.forEach(id => ids.add(id)); affected.forEach(id => excluded.delete(id)); }
  if (operation === 'SUBTRACT') affected.forEach(id => { ids.delete(id); if (includeChildren) excluded.add(id); });
  const expanded = includeChildren ? descendants(branches, ids) : ids;
  return { ids, excluded: new Set([...excluded].filter(id => expanded.has(id))) };
}
