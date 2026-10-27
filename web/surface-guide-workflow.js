import { NEW_GUIDE_BUNDLE, normalizeGuideBundle } from './surface-guide-shape.js';

export const GUIDE_CONFIG_FIELDS = {
  length: [2, .1, 15], spread: [.35, 0, 2], density: [3, 0, 12], radius: [.004, .0005, .05],
  hang_length: [1.5, .1, 10], hang_density: [4, 1, 12], offset: [.012, .003, .1],
  hang_reach: [.25, .05, 2], hang_variation: [.35, 0, .8],
};
export function normalizeGuideConfig(raw, fallback = {}) {
  const result = {};
  for (const [key, [initial, min, max]] of Object.entries(GUIDE_CONFIG_FIELDS)) {
    const value = raw?.[key] ?? fallback[key] ?? initial;
    result[key] = Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : initial));
  }
  for (const key of ['flip', 'auto_hang']) result[key] = (raw?.[key] ?? fallback[key]) === true;
  const seed = raw?.seed ?? fallback.seed;
  if (Number.isFinite(seed)) result.seed = Math.round(seed);
  return result;
}
export function resolveGuideConfig(surface, guide, vine = {}, seed) {
  return normalizeGuideConfig(guide?.config, { ...surface, radius: vine.stem ?? .004, seed });
}
export function normalizeDrawingRecipe(raw, fallback = {}) {
  if (!raw) return null;
  return { bundle: normalizeGuideBundle(raw.bundle || NEW_GUIDE_BUNDLE), config: normalizeGuideConfig(raw.config, fallback) };
}
export function drawingRecipe(surface, vine, seed) {
  return structuredClone(surface.draw_recipe || { bundle: NEW_GUIDE_BUNDLE, config: resolveGuideConfig(surface, null, vine, seed) });
}
export function recipeFromGuide(surface, guide, vine, seed) {
  return { bundle: structuredClone(guide.bundle || { count: 1, width: 0, follow: 1 }), config: resolveGuideConfig(surface, guide, vine, seed) };
}

// A parameter edit is a field patch, never an assignment of the primary item's
// complete configuration to every selected route. Locked routes remain intact.
export function patchGuideParameters(surface, ids, section, field, value, { vine, seed, recipeOnly = false } = {}) {
  const selected = surface.guides.filter(g => ids.includes(g.id));
  const editable = selected.filter(g => !g.locked && (section !== 'bundle' || g.type !== 'EAVE'));
  if (!recipeOnly && !editable.length) return 0;
  let recipe = drawingRecipe(surface, vine, seed);
  for (const guide of recipeOnly ? [] : editable) {
    if (section === 'bundle') guide.bundle = { ...(guide.bundle || { count: 1, width: 0, follow: 1 }), [field]: value };
    else guide.config = { ...resolveGuideConfig(surface, guide, vine, seed), [field]: value };
  }
  // A single-route edit carries its full effective recipe forward. A mixed
  // selection changes only this field in the drawing recipe, avoiding guesswork.
  if (!recipeOnly && selected.length === 1) recipe = recipeFromGuide(surface, editable[0], vine, seed);
  else recipe[section][field] = value;
  surface.draw_recipe = normalizeDrawingRecipe(recipe);
  return recipeOnly ? 1 : editable.length;
}

export function createGuideSelection() {
  let ids = [], primary = '', known = [], mesh = null;
  return {
    get ids() { return [...ids]; }, get primary() { return primary; },
    sync(guides, preferred, meshId) {
      const current = guides.map(g => g.id), added = current.filter(id => !known.includes(id));
      if (mesh !== meshId || added.length) { ids = added.length ? added : preferred && current.includes(preferred) ? [preferred] : current.slice(0, 1); primary = ids.at(-1) || ''; }
      ids = ids.filter(id => current.includes(id)); if (!ids.includes(primary)) primary = ids.at(-1) || '';
      known = current; mesh = meshId;
    },
    select(id, guides, { toggle = false, range = false, additive = false } = {}) {
      const order = guides.map(g => g.id); if (!order.includes(id)) return;
      if (range && order.includes(primary)) { const a = order.indexOf(primary), b = order.indexOf(id), span = order.slice(Math.min(a,b), Math.max(a,b)+1); ids = [...new Set([...(additive ? ids : []), ...span])]; }
      else if (toggle) ids = ids.includes(id) ? ids.filter(x => x !== id) : [...ids,id];
      else ids = [id];
      primary = ids.includes(id) ? id : ids.at(-1) || '';
    },
    all(guides) { ids = guides.map(g => g.id); primary = ids.includes(primary) ? primary : ids[0] || ''; },
    clear() { ids = []; primary = ''; },
  };
}
