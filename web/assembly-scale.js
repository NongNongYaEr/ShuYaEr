// Editor-only controls; resolved sizes remain in the existing instance.scale field.
export const INSTANCE_SCALE_MIN = 0.0005;
export const INSTANCE_SCALE_MAX = 500;
const multiplier = value => {
  const n = Number(value ?? 1);
  if (!Number.isFinite(n) || n < 0.1 || n > 10) throw Error('单元枝倍率须在 0.1–10 之间');
  return n;
};

export function assemblyScaleState(workbench) {
  const raw = workbench?.assembly_scale || {};
  return { overall: multiplier(raw.overall), cards: Object.fromEntries(Object.entries(raw.cards || {}).map(([id, value]) => [id, multiplier(value)])),
    zoneCards: Object.fromEntries(Object.entries(raw.zoneCards || {}).map(([role, cards]) => [role,
      Object.fromEntries(Object.entries(cards || {}).map(([id, value]) => [id, multiplier(value)]))])), records: raw.records || {} };
}

// A source may be used in several zones. Its zone value replaces the legacy
// source-wide card value; those two values must never be multiplied together.
export function assemblyCardScale(workbench, role, assetId) {
  const state = assemblyScaleState(workbench);
  return cardScale(state, role, assetId);
}

function cardScale(state, role, assetId) {
  const key = role === 'EXTRA' ? 'ANY' : role || 'ANY';
  return state.zoneCards[key]?.[assetId] ?? state.cards[assetId] ?? 1;
}

// Old projects may carry a radial-only adjustment on completed samples. Keep it
// on load; restoration is an explicit, undoable edit, separate from size factors.
export function sampleThicknessAdjustments(authoring, assetId = null) {
  const samples = new Set(authoring.branch_library.filter(item => item.sample).map(item => item.id));
  return authoring.branch_instances.filter(instance => samples.has(instance.asset_id)
    && (assetId === null || instance.linked && instance.asset_id === assetId)
    && Math.abs((instance.radius_scale ?? 1) - 1) > 1e-8);
}

export function restoreSampleThickness(authoring, assetId = null) {
  const adjusted = sampleThicknessAdjustments(authoring, assetId);
  for (const instance of adjusted) instance.radius_scale = 1;
  return adjusted.length;
}

// A locked nested unit must not move indirectly when an unlocked ancestor is
// resized. Source IDs and random-seed aliases are not attachment identities.
// Runtime ownership can supplement saved parents for older non-prefixed roots.
function blockedScaleInstances(authoring, suppliedIds) {
  const instances = authoring.branch_instances || [];
  const byId = new Map(instances.map(instance => [instance.id, instance]));
  const arrayLocks = new Map((authoring.branch_arrays || []).map(group => [group.id, new Set(group.locked || [])]));
  const blocked = new Set(instances.filter(instance => instance.assembly_locked
    || arrayLocks.get(instance.array_id)?.has(instance.id)).map(instance => instance.id));
  if (suppliedIds != null) for (const id of typeof suppliedIds === 'string' ? [suppliedIds] : suppliedIds)
    if (byId.has(id)) blocked.add(id);

  const localParents = new Map((authoring.manual_branches || []).map(branch => [branch.id, branch.parent]));
  for (const layer of authoring.sculpt_layers || []) if (layer.enabled !== false && layer.operation?.type === 'DUPLICATE')
    for (const branch of layer.operation.records || []) localParents.set(branch.id, branch.parent);
  const reparent = authoring.topology?.reparent || {};
  const ownerCache = new Map();
  const ownerOf = parent => {
    let id = parent;
    const path = [], seen = new Set();
    while (typeof id === 'string' && id && !seen.has(id)) {
      if (ownerCache.has(id)) {
        const owner = ownerCache.get(id);
        for (const visited of path) ownerCache.set(visited, owner);
        return owner;
      }
      path.push(id); seen.add(id);
      let prefix = id;
      while (prefix) {
        if (byId.has(prefix)) {
          for (const visited of path) ownerCache.set(visited, prefix);
          return prefix;
        }
        const dot = prefix.lastIndexOf('.');
        if (dot < 0) break;
        prefix = prefix.slice(0, dot);
      }
      id = reparent[id] ?? localParents.get(id);
    }
    for (const visited of path) ownerCache.set(visited, null);
    return null;
  };
  const parents = new Map();
  for (const instance of instances) {
    const parent = ownerOf(instance.parent);
    if (parent && parent !== instance.id) parents.set(instance.id, parent);
  }
  const queue = [...blocked];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const parent = parents.get(queue[cursor]);
    if (parent && !blocked.has(parent)) { blocked.add(parent); queue.push(parent); }
  }
  return blocked;
}

// Preserve different installed sizes and local size edits. Never multiply an
// already-scaled value again, or copy meshes / atlas payloads to track a baseline.
// options.blockedIds accepts the current selection model's blocked instance IDs
// to include runtime ownership; existing three-argument callers remain safe.
export function applyAssemblyScale(authoring, patch = {}, onChange = () => {}, options = {}) {
  const old = assemblyScaleState(authoring.workbench);
  const next = { overall: multiplier(patch.overall ?? old.overall), cards: { ...old.cards, ...patch.cards },
    zoneCards: { ...old.zoneCards }, records: {} };
  for (const key of Object.keys(next.cards)) next.cards[key] = multiplier(next.cards[key]);
  for (const [role, cards] of Object.entries(patch.zoneCards || {})) {
    const key = role === 'EXTRA' ? 'ANY' : role;
    next.zoneCards[key] = { ...next.zoneCards[key], ...cards };
  }
  for (const cards of Object.values(next.zoneCards)) for (const id of Object.keys(cards)) cards[id] = multiplier(cards[id]);
  const blocked = blockedScaleInstances(authoring, options.blockedIds);
  const changes = authoring.branch_instances.map(instance => {
    const previous = old.records[instance.id];
    if(blocked.has(instance.id)){
      if(previous)next.records[instance.id]=previous;return {before:instance,after:instance};
    }
    const tracked = previous && Number.isFinite(previous.base) && Number.isFinite(previous.factor) && previous.factor > 0;
    const base = tracked
      ? (instance.scale === previous.scale ? previous.base : instance.scale / previous.factor)
      : instance.scale;
    const factor = next.overall * (instance.linked ? cardScale(next, instance.shootRole, instance.asset_id) : 1);
    // Updating another zone must not round-trip a locally edited size through
    // division and multiplication when this instance's factor did not change.
    const scale = tracked && factor === previous.factor ? instance.scale : base * factor;
    if (!Number.isFinite(scale) || scale < INSTANCE_SCALE_MIN || scale > INSTANCE_SCALE_MAX)
      throw Error('叠加后的单元枝尺寸超出支持范围，请减小倍率或调整单枝尺寸');
    next.records[instance.id] = { base, factor, scale };
    return { before: instance, after: { ...instance, scale } };
  });
  for (const { before, after } of changes) if (before.scale !== after.scale) onChange(before, after);
  authoring.branch_instances = changes.map(({ after }) => after);
  authoring.workbench = { ...authoring.workbench, assembly_scale: next };
}
