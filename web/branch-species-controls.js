import * as THREE from 'three';
import { copy } from './branch-workbench-data.js';
import { TREE_SPECIES, TREE_BRANCH_STYLES, createTreeSpeciesDocument } from './tree-species-library.js';
import { normalizeSpeciesStructure } from './tree-species-shape.js';
export { normalizeSpeciesStructure } from './tree-species-shape.js';

const clone = copy;

export function speciesStructureContext(document) {
  const authoring = document?.authoring, tags = authoring?.recipe?.tags || [];
  if (!tags.includes('CN_TREE_STARTER')) throw Error('当前工程不是可再生成的树种枝条');
  const saved = authoring.species_structure;
  const species = tags.find(tag => TREE_SPECIES[tag]) || saved?.species;
  const spec = TREE_SPECIES[species];
  const style = tags.find(tag => ['MAIN', 'SIDE', 'TIP', 'BALL', 'HEDGE'].includes(tag)) || saved?.style;
  if (!spec || !TREE_BRANCH_STYLES[style] || spec.category === 'POTTED' || authoring.plant_form) throw Error('结构再生成仅支持乔木或灌木的主枝段、侧枝和末端细梢；盆栽、修剪球和绿篱不支持');
  if (!authoring.branch_shape?.branches?.length) throw Error('当前工程缺少可再生成的枝条结构');
  const seed = Math.max(1, Math.min(2147483646, Math.trunc(Number(saved?.seed ?? document.settings?.seed) || 12037)));
  return { species, style, seed, structure: normalizeSpeciesStructure(saved?.structure, spec, style) };
}

/** Returns a replacement document. Callers own confirmation, restore and undo. */
export function regenerateSpeciesStructure(document, options = {}) {
  const context = speciesStructureContext(document);
  const raw = options.structure || Object.fromEntries(['branch_count', 'shoot_count', 'angle', 'variation'].filter(key => options[key] != null).map(key => [key, options[key]]));
  const structure = normalizeSpeciesStructure({ ...context.structure, ...raw }, TREE_SPECIES[context.species], context.style);
  const seed = Math.max(1, Math.min(2147483646, Math.trunc(Number(options.seed ?? context.seed) || context.seed)));
  const fresh = createTreeSpeciesDocument(context.species, context.style, seed, { structure });
  const shape = fresh.authoring.branch_shape;
  const previous = document.authoring.branch_shape.connector;
  if (previous) {
    const from = new THREE.Vector3(...shape.connector.direction).normalize();
    const to = new THREE.Vector3(...previous.direction).normalize();
    if (![...previous.position, ...previous.direction].every(Number.isFinite) || to.lengthSq() < 1e-10) throw Error('当前枝条连接点无效，无法保留根部朝向');
    const rotation = new THREE.Quaternion().setFromUnitVectors(from, to);
    const origin = new THREE.Vector3(...shape.connector.position), destination = new THREE.Vector3(...previous.position);
    for (const branch of shape.branches) for (const collection of [branch.points, branch.knots]) for (const value of collection) {
      const transformed = new THREE.Vector3(...value).sub(origin).applyQuaternion(rotation).add(destination);
      value.splice(0, 3, ...transformed.toArray());
    }
    // All vectors remain in the editor's native Z-up frame. PVE conversion
    // happens at export; no Y/Z swapping belongs in structure regeneration.
    shape.connector = clone(previous);
  }
  const authoring = clone(document.authoring);
  Object.assign(authoring, {
    branch_shape: shape, species_structure: { species: context.species, style: context.style, seed, structure },
    overrides: {}, sculpt_layers: [], active_sculpt_layer: '',
    topology: { reparent: {}, attach: {}, suppressed: [], operations: [] },
    branch_instances: [], branch_arrays: [], symmetry_groups: [], influence_regions: [],
    manual_branches: [], leaf_edits: { removed: [], added: [] }, selection_sets: {},
  });
  if(authoring.unit_editing){
    // A replacement skeleton can reuse branch labels for unrelated limbs. Never
    // silently bind retained hand edits to those new limbs. Keep records repairable.
    authoring.unit_editing.items=authoring.unit_editing.items.map(v=>({...v,parent:'UNBOUND:'+v.parent}));
    authoring.unit_editing.rules=authoring.unit_editing.rules.map(r=>r.targets.length?{...r,enabled:false,targets:r.targets.map(id=>'UNBOUND:'+id)}:r);
  }
  // Region edits and deletions use old branch/node identifiers; retain every
  // flower asset, appearance setting and independent random seed around them.
  if (authoring.flowering) authoring.flowering = { ...authoring.flowering, regions: {}, removed: [] };
  if (Array.isArray(authoring.attachment_layers)) authoring.attachment_layers = authoring.attachment_layers.filter(layer => !layer.parent && !layer.branch_id && !layer.branchId && !layer.branch_ids?.length);
  return { ...document, settings: { ...document.settings }, authoring, selection: [], pointIndex: null };
}
