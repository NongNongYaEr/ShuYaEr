import { LEGACY_BRANCH_SAMPLES } from './legacy-branch-samples.js';

const copy = (value) => JSON.parse(JSON.stringify(value));

export function recoverLegacyBranchAsset(asset, tree) {
  if (asset.sample || !tree?.authoring || !tree?.settings) return asset;
  const packed = LEGACY_BRANCH_SAMPLES[asset.id];
  const treeAuthoring = tree.authoring;
  const source = packed?.authoring || treeAuthoring;
  const leaves = (tree.leaf_meshes || []).filter((leaf) => asset.leaf_source_ids?.includes(leaf.id));
  const organUnits = (treeAuthoring.tree_organs?.units || []).filter((unit) => asset.organ_source_ids?.includes(unit.id));
  const baseOrgans = source.tree_organs || treeAuthoring.tree_organs || {};
  const treeOrgans = treeAuthoring.tree_organs || {};
  const sampleOrgans = packed ? {
    mode: baseOrgans.mode, amount: baseOrgans.amount, max_count: baseOrgans.max_count,
    scale: baseOrgans.scale, terminal_branches_only: baseOrgans.terminal_branches_only,
  } : {
    mode: asset.organ_mode || baseOrgans.mode || 'LEAVES',
    amount: asset.organ_amount ?? baseOrgans.amount ?? 0,
    max_count: asset.organ_max_count ?? baseOrgans.max_count ?? 0,
    scale: (treeOrgans.scale || 1) * (asset.organ_scale || 1),
    terminal_branches_only: asset.organ_terminal_only === true,
  };
  const authoring = {
    branch_shape: copy(asset.shape),
    recipe: copy(source.recipe || { tags: [] }), seeds: copy(source.seeds || treeAuthoring.seeds),
    level_rules: copy(source.level_rules || treeAuthoring.level_rules),
    profiles: copy(source.profiles || treeAuthoring.profiles),
    attachment_layers: copy(source.attachment_layers || treeAuthoring.attachment_layers),
    foliage_range: copy(source.foliage_range || treeAuthoring.foliage_range),
    foliage_unit: copy(source.foliage_unit || treeAuthoring.foliage_unit),
    leaf_edits: copy(source.leaf_edits || { removed: [], added: [] }),
    tree_organs: { ...copy(baseOrgans), ...sampleOrgans, units: copy(organUnits) },
  };
  authoring.recipe.tags = (authoring.recipe.tags || []).filter((tag) => tag !== 'FOLIAGE_ON_INSTANCES_ONLY');
  const settings = packed?.settings ? copy(packed.settings) : {
    ...copy(tree.settings),
    leaf_density: tree.settings.leaf_density * (asset.leaf_density_multiplier || 1),
    leaf_scale: tree.settings.leaf_scale * (asset.leaf_scale_multiplier || 1),
    max_leaves: Math.min(5000, tree.settings.max_leaves || 5000),
    max_triangles: Math.min(1500000, tree.settings.max_triangles || 1500000),
  };
  settings.object_name = asset.name;
  settings.preview_lod = 0;
  return { ...asset, sample: { settings, authoring, leaf_meshes: copy(leaves), recovered_from: packed?.source || '整树工程已有叶花果单元' } };
}
