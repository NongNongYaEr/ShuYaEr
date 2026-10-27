// Runtime geometry is addressable for rendering, but an installed unit branch
// remains one reusable model in TREE. Only BRANCH may edit its internal parts.
const values = value => value == null ? [] : typeof value === 'string' ? [value] : value;

// Only a real instance ID establishes identity. Random-seed and source aliases
// may intentionally be shared by copies and must never merge their selections.
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

export function unitBranchIndex(branches = [], instances = []) {
  const byInstance = new Map(), legacyByInstance = new Map();
  for (const instance of instances) if (instance?.id && !byInstance.has(instance.id)) byInstance.set(instance.id, instance);
  const byBranch = new Map(), byRuntime = new Map();
  for (const branch of branches) if (branch?.stableId) {
    byBranch.set(branch.stableId, branch);
    if (branch.id != null) byRuntime.set(branch.id, branch);
  }
  const runtimeChildren = new Map(), owners = new Map(), roots = new Map(), queue = [];
  for (const branch of branches) {
    if (!branch?.stableId) continue;
    if (!runtimeChildren.has(branch.parentId)) runtimeChildren.set(branch.parentId, []);
    runtimeChildren.get(branch.parentId).push(branch);
    const flaggedId = branch.instanceId || branch.unitOwner;
    // Prefer either valid authoring identity over a stale flag in the other
    // field. An explicit unknown owner is a protected old snapshot; a source
    // prefix alone must not silently merge that snapshot into another model.
    let owner = byInstance.get(branch.instanceId) || byInstance.get(branch.unitOwner)
      || (!flaggedId ? prefixOwner(branch.stableId, byInstance) : null);
    if (!owner && flaggedId) {
      if (!legacyByInstance.has(flaggedId)) legacyByInstance.set(flaggedId, { id: flaggedId, legacyEmbedded: true });
      owner = legacyByInstance.get(flaggedId);
    }
    if (owner) { owners.set(branch.stableId, owner); queue.push(branch); }
  }
  // Legacy hand-added descendants need the same protection even without an ID
  // prefix or instanceId. Keep the saved contents; do not edit them in TREE.
  for (let index = 0; index < queue.length; index++) {
    const branch = queue[index], owner = owners.get(branch.stableId);
    const children = branch.id == null ? [] : [...(runtimeChildren.get(branch.id) || [])];
    if (branch.stableId !== branch.id) children.push(...(runtimeChildren.get(branch.stableId) || []));
    for (const child of children) if (!owners.has(child.stableId)) {
      owners.set(child.stableId, owner); queue.push(child);
    }
  }
  const ownedBranches = new Map();
  for (const branch of branches) {
    const owner = owners.get(branch?.stableId); if (!owner) continue;
    if (!ownedBranches.has(owner.id)) ownedBranches.set(owner.id, []);
    ownedBranches.get(owner.id).push(branch);
    const parent = byRuntime.get(branch.parentId) || byBranch.get(branch.parentId);
    if (owners.get(parent?.stableId)?.id !== owner.id && !roots.has(owner.id)) roots.set(owner.id, branch.stableId);
  }
  const ownerOf = id => byInstance.get(id) || owners.get(id) || prefixOwner(id, byInstance) || legacyByInstance.get(id) || null;
  const parents = new Map(), children = new Map();
  // Instance mounts are authoritative. Runtime roots also recover hierarchy
  // for old embedded owners and incomplete saved mount metadata.
  for (const id of new Set([...byInstance.keys(), ...roots.keys()])) {
    const instance = byInstance.get(id), branch = byBranch.get(roots.get(id));
    let parent = instance ? ownerOf(instance.parent) : null;
    if (!parent || parent.id === id) {
      const runtimeParent = byRuntime.get(branch?.parentId) || byBranch.get(branch?.parentId);
      parent = owners.get(runtimeParent?.stableId);
    }
    if (!parent || parent.id === id) continue;
    parents.set(id, parent.id);
    if (!children.has(parent.id)) children.set(parent.id, []);
    children.get(parent.id).push(id);
  }
  return { owners, roots, byInstance, legacyByInstance, byBranch, ownedBranches, parents, children, ownerOf };
}

// Old copied geometry is replayed by DUPLICATE layers; new instances are
// placed through their registry. Until both transports can share a persistent
// parent transform, a mixed ancestor cannot safely move its mounted family.
// The complete child models remain independently editable.
export function mixedUnitPlacementParents(index) {
  const blocked=new Set(),byInstance=index.byInstance||new Map(),parents=index.parents||new Map();
  for(const instance of byInstance.values()){
    const legacy=!!instance.legacyPlacement,seen=new Set([instance.id]);let parent=parents.get(instance.id);
    while(parent&&!seen.has(parent)){
      seen.add(parent);const ancestor=byInstance.get(parent);
      if(ancestor&&!!ancestor.legacyPlacement!==legacy)blocked.add(parent);
      parent=parents.get(parent);
    }
  }
  return blocked;
}

/**
 * Resolve complete-unit targets independently of skeleton edit restrictions.
 * Returned values are runtime root stable IDs of actual authoring instances.
 * Legacy baked owners remain protected/addressable, but are never regenerated
 * into editable instances by selection alone.
 */
export function resolveUnitEditScope(branches = [], instances = [], selected = [], mode = 'SELECTED',
  { excluded = new Set(), isVisible = () => true, index = null } = {}) {
  const boundary = index || unitBranchIndex(branches, instances);
  const { byInstance, roots, ownedBranches, parents, children, ownerOf } = boundary;
  const family = seeds => {
    const result = new Set(), queue = [...seeds];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const id = queue[cursor]; if (result.has(id)) continue;
      result.add(id); queue.push(...(children.get(id) || []));
    }
    return result;
  };
  const explicit = new Set();
  for (const id of values(selected)) {
    const owner = ownerOf(id);
    if (owner && byInstance.has(owner.id) && roots.has(owner.id)) explicit.add(owner.id);
  }
  const excludedOwners = new Set();
  for (const id of values(excluded)) {
    const owner = ownerOf(id);
    if (owner) excludedOwners.add(owner.id);
  }
  const excludedFamily = family(excludedOwners);
  const blockedParents = new Set(), queue = [...excludedFamily];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const parent = parents.get(queue[cursor]);
    if (parent && !blockedParents.has(parent)) { blockedParents.add(parent); queue.push(parent); }
  }
  const candidates = mode === 'ALL' || mode === 'TREE' ? new Set(byInstance.keys())
    : mode === 'DIRECT' ? explicit : family(explicit);
  const result = new Set();
  for (const id of candidates) {
    const root = roots.get(id), instance = byInstance.get(id);
    // A whole parent moves its mounted family. Subtracting a child therefore
    // also prevents that parent from carrying the excluded child indirectly.
    if (!instance || !root || excludedFamily.has(id) || blockedParents.has(id)) continue;
    if ((ownedBranches.get(id) || []).some(branch => isVisible(branch.stableId, instance))) result.add(root);
  }
  return result;
}
