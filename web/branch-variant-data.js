import { TREE_SPECIES } from './tree-species-library.js';
import { regenerateSpeciesStructure, speciesStructureContext, normalizeSpeciesStructure } from './branch-species-controls.js';
import { normalizeShapeOperation } from './shape-operation-data.js';

// Variation adds bounded perturbations around these uses. Even variation=0
// retains ordinary botanical randomness from each candidate's structure seed.
export const BRANCH_USE_PRESETS = Object.freeze({
  UPWARD: Object.freeze({ label: '上扬枝', description: '梢端上扬，适合树冠上部', angle: 35, branches: 1, shoots: 0, density: 1, pose: Object.freeze({ length: 1.05, width: .85, droop: -.7 }) }),
  HORIZONTAL: Object.freeze({ label: '横展枝', description: '舒展偏平，适合树冠侧面', angle: 62, branches: 1, shoots: 0, density: 1, pose: Object.freeze({ width: 1.2, flatness: .5 }) }),
  DROOPING: Object.freeze({ label: '下垂枝', description: '外伸后下垂，适合低垂轮廓', angle: 45, branches: 1, shoots: 0, density: 1, pose: Object.freeze({ length: 1.12, width: .9, droop: .85 }) }),
  SPARSE: Object.freeze({ label: '疏枝', description: '减少侧枝和叶量，留出冠内空隙', angle: 58, branches: .65, shoots: -1, density: .55, pose: Object.freeze({ width: 1.1, flatness: .85 }) }),
  DENSE: Object.freeze({ label: '密枝', description: '增加细枝和叶量，填充饱满树冠', angle: 48, branches: 1.25, shoots: 1, density: 1.5, pose: Object.freeze({ length: .95, width: 1.12 }) }),
  TIP: Object.freeze({ label: '末端细梢', description: '使用真实细梢结构，适合枝条末端', angle: 35, branches: 1, shoots: 0, density: 1, pose: Object.freeze({ length: .95, width: .9 }) }),
});

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const numeric = (value, fallback) => value != null && Number.isFinite(Number(value)) ? Number(value) : fallback;
const seedValue = value => clamp(Math.trunc(numeric(value, 12037)), 1, 2147483646);
function hash(text) {
  let result = 2166136261;
  for (const char of String(text)) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}
function candidateSeed(base, index, stream = 0) {
  return 1 + ((base - 1 + (index + 1) * 104729 + stream * 130363) % 2147483646);
}
function random(seed) {
  let n = seed >>> 0;
  return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; };
}

// Never serialize embedded atlas strings or geometry once per candidate.
// Large authored sources are stripped before the regeneration helper's clone
// and reattached as shared read-only references afterwards. Open via a clone.
function lightDocument(document, context, style) {
  const source = document.authoring;
  const tags = source.recipe.tags.filter(tag => !['MAIN', 'SIDE', 'TIP', 'BALL', 'HEDGE'].includes(tag) && !(style === 'TIP' && tag === 'WHOLE_PLANT'));
  const authoring = {
    ...source,
    recipe: { ...source.recipe, tags: [...tags, style] },
    species_structure: { ...source.species_structure, ...context, style },
    leaf_material: null, branch_library: [],
    tree_organs: source.tree_organs ? { ...source.tree_organs, units: [] } : source.tree_organs,
    flowering: source.flowering ? { ...source.flowering, source: null, material: null } : source.flowering,
    // Reference images and asset provenance belong to the draft, not to a new
    // generated candidate. Preserve only an editable candidate display name.
    workbench: { name: source.workbench?.name || document.settings?.object_name || '' },
  };
  return {
    format: document.format || 'ProceduralBranchProject', version: 4,
    generator_version: document.generator_version || '4.0.0',
    settings: document.settings, authoring,
    leaf_meshes: document.leaf_meshes || [], leaf_mesh: document.leaf_mesh || null,
    protectTrunk: document.protectTrunk ?? false,
  };
}

/**
 * Pure, deterministic candidate generation. Shared material/geometry/library
 * references are read-only; clone a candidate before installing it as a draft.
 * `variation` controls extra candidate perturbation, not base growth randomness.
 */
export function generateBranchCandidates(document, options = {}) {
  const context = speciesStructureContext(document), spec = TREE_SPECIES[context.species];
  const count = options.count == null ? 6 : Number(options.count);
  if (![6, 8, 12].includes(count)) throw Error('候选数量仅支持 6、8 或 12');
  const presetKey = String(options.preset || 'HORIZONTAL').toUpperCase(), preset = BRANCH_USE_PRESETS[presetKey];
  if (!preset) throw Error('未知枝条用途');
  const seed = seedValue(options.seed ?? context.seed), variation = clamp(numeric(options.variation, .5), 0, 1);
  const varyFoliage = options.varyFoliage === true, varyOrgans = options.varyOrgans === true;
  const style = presetKey === 'TIP' ? 'TIP' : context.style;
  const source = lightDocument(document, context, style);
  const baseline = presetKey === 'TIP' ? normalizeSpeciesStructure({}, spec, 'TIP') : context.structure;
  const configKey = hash(`${context.species}|${style}|${presetKey}|${variation}|${varyFoliage}|${varyOrgans}|${JSON.stringify(baseline)}`).toString(36);
  return Array.from({ length: count }, (_, index) => {
    const structureSeed = candidateSeed(seed, index, hash(presetKey) % 701), rng = random(structureSeed);
    const jitter = amplitude => (rng() * 2 - 1) * amplitude * variation;
    const structure = normalizeSpeciesStructure({
      branch_count: Math.round(baseline.branch_count * preset.branches + jitter(2)),
      shoot_count: Math.round(baseline.shoot_count + preset.shoots + jitter(1)),
      angle: preset.angle + jitter(12),
      // A nonzero base is deliberate: zero extra variation must not generate
      // identical fixed curves just because all candidate seeds are different.
      variation: clamp(Math.max(.25, baseline.variation) + jitter(.15), .15, .95),
    }, spec, style);
    const next = regenerateSpeciesStructure(source, { seed: structureSeed, structure });
    const name = `${spec.name}_${preset.label}_${String(index + 1).padStart(2, '0')}`;
    const id = `BV_${context.species}_${presetKey}_${structureSeed}_${configKey}`;
    next.settings = { ...next.settings, object_name: name,
      leaf_density: clamp(numeric(document.settings?.leaf_density, 30) * preset.density * (1 + jitter(.15)), 0, 120) };
    next.authoring.recipe = { ...next.authoring.recipe, name };
    next.authoring.workbench = { name };
    const roots = next.authoring.branch_shape.branches.filter(branch => !branch.parent).map(branch => branch.id);
    const operation = normalizeShapeOperation({ type: 'QUICK', targets: roots, ...preset.pose,
      length: (preset.pose.length ?? 1) * (1 + jitter(.13)),
      width: (preset.pose.width ?? 1) * (1 + jitter(.16)),
      bend: jitter(.2), droop: (preset.pose.droop ?? 0) + jitter(.13),
    });
    next.authoring.sculpt_layers = [{ id: `${id}_POSE`, name: `${preset.label}用途姿态`, enabled: true, strength: 1, branches: {}, operation }];
    next.authoring.leaf_material = document.authoring.leaf_material;
    next.authoring.branch_library = document.authoring.branch_library;
    next.authoring.foliage_unit = document.authoring.foliage_unit;
    if (document.authoring.tree_organs) next.authoring.tree_organs = { ...next.authoring.tree_organs, units: document.authoring.tree_organs.units };
    if (document.authoring.flowering) next.authoring.flowering = { ...next.authoring.flowering,
      source: document.authoring.flowering.source, material: document.authoring.flowering.material };
    if (varyFoliage) next.authoring.seeds.foliage = candidateSeed(structureSeed, index, 101);
    if (varyOrgans) {
      next.authoring.seeds.organs = candidateSeed(structureSeed, index, 211);
      if (next.authoring.flowering) {
        next.authoring.flowering.seed = candidateSeed(structureSeed, index, 307);
        next.authoring.flowering.pose_seed = candidateSeed(structureSeed, index, 401);
      }
    }
    if (presetKey === 'TIP') {
      // A former MAIN/whole-plant leaf layer may otherwise exclude every new
      // first-order tip. Keep density/source rules, but include the true tips.
      next.authoring.attachment_layers = next.authoring.attachment_layers.map(layer => ['LEAF', 'NEEDLE'].includes(layer.type) ? { ...layer, order_min: Math.min(layer.order_min, 1) } : layer);
    }
    delete next.selection; delete next.pointIndex;
    return { id, name, seed: structureSeed, preset: presetKey, document: next };
  });
}
