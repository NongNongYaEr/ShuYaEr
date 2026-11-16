import { normalizeLeafMaterial } from './leaf-material-data.js';
import { normalizeFlowering } from './flowering-data.js';
import { normalizeTreeOrgans } from './tree-organ-data.js';
import {packageOrigins} from './asset-origins.js';
import {validateTrunkGuides} from './imported-trunk-data.js';

export const UNIT_ROLES = { LEAF: '叶片', FLOWER: '花', BUD: '花苞', FRUIT: '果实' };
export const BASE_BRANCH_MAX_SIZE_M = 20;
const bounded = (v, d, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) ? Number(v) : d));
const text = (v, fallback = '') => String(v || fallback).slice(0, 160);

export function geometryExtent(g) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < g.position.length; i++) {
    min[i % 3] = Math.min(min[i % 3], g.position[i]);
    max[i % 3] = Math.max(max[i % 3], g.position[i]);
  }
  return { min, max, size: max.map((v, i) => v - min[i]), longest: Math.max(...max.map((v, i) => v - min[i])) };
}

// Unit geometry has a longest dimension of one. Physical size has one owner:
// size_m. The assembly compiler converts it to the existing renderer fields.
function normalizedUnitGeometry(raw) {
  const source = normalizeFlowering({ source: raw }).source;
  if (!source?.geometry.uv) throw Error('单元需要有效三角网格和 UV；请先在 Blender 中展开 UV');
  const extent = geometryExtent(source.geometry);
  if (!(extent.longest > 1e-8)) throw Error('单元网格没有有效尺寸');
  const longest = Math.abs(extent.longest - 1) < 1e-12 ? 1 : extent.longest;
  const geometry = longest === 1 ? source.geometry : {...source.geometry, position:source.geometry.position.map(v => v / longest)};
  return { geometry, longest };
}

export function normalizePlantUnit(raw) {
  const { geometry } = normalizedUnitGeometry(raw);
  return { id: text(raw.id, 'UNIT'), name: text(raw.name, '新单元'), role: UNIT_ROLES[raw.role] ? raw.role : 'LEAF',
    size_m: bounded(raw.size_m, .1, .001, 1), geometry, source_file: text(raw.source_file),
    ...(/^#[0-9a-f]{6}$/i.test(raw.colorTint || '') ? { colorTint: raw.colorTint } : {}) };
}

export function normalizePlantBaseBranch(raw) {
  const { geometry, longest } = normalizedUnitGeometry(raw);
  const tip = raw.tip;
  if (!Array.isArray(tip) || tip.length !== 3 || !tip.every(Number.isFinite) || tip[1] <= 0) {
    throw Error('基础枝缺少有效的枝尖校准点');
  }
  const shapeGuides = raw.shape_guides == null ? null : validateTrunkGuides(raw.shape_guides).map(guide => ({
    id: guide.id, parent: guide.parent || '', attach: guide.attach,
    points: guide.points.map(point => point.map(value => value / longest)),
    start_radius: guide.start_radius / longest, end_radius: guide.end_radius / longest,
  }));
  const origin = raw.variant_from;
  const variantFrom = origin && typeof origin.base_id === 'string' && origin.base_id.trim() ? {
    base_id: text(origin.base_id), root_id: text(origin.root_id, origin.base_id),
    ...(origin.pack_id ? {pack_id: text(origin.pack_id)} : {}),
    ...(/^[a-f0-9]{64}$/.test(origin.topology || '') ? {topology: origin.topology} : {}),
  } : null;
  return { id: text(raw.id, 'BASE_BRANCH'), name: text(raw.name, '基础枝'), geometry,
    size_m: bounded(raw.size_m, .5, .001, BASE_BRANCH_MAX_SIZE_M), source_file: text(raw.source_file),
    tip: tip.map(value => value / longest),
    ...(shapeGuides ? {shape_guides: shapeGuides} : {}), ...(variantFrom ? {variant_from: variantFrom} : {}) };
}

function sameValues(a, b, epsilon = 0) {
  return a === b || Boolean(a && b && a.length === b.length && a.every((value, i) => Math.abs(value - b[i]) <= epsilon));
}

export function sameBaseBranchTopology(a, b) {
  return a.geometry.position.length === b.geometry.position.length
    && sameValues(a.geometry.index, b.geometry.index) && sameValues(a.geometry.uv, b.geometry.uv);
}

export function samePlantUnitAtlas(a, b) {
  return a.color === b.color && a.normal === b.normal;
}

function sameShapeGuides(a, b) {
  const epsilon = 1e-10;
  return a === b || Boolean(a && b && a.length === b.length && a.every((guide, index) => {
    const other = b[index];
    return guide.id === other.id && guide.parent === other.parent && guide.attach === other.attach
      && sameValues([guide.start_radius, guide.end_radius], [other.start_radius, other.end_radius], epsilon)
      && guide.points.length === other.points.length
      && guide.points.every((point, i) => sameValues(point, other.points[i], epsilon));
  }));
}

export async function appendPlantBaseBranchVariant(sourcePack, latestPack, rawVariant, {
  id = latestPack.id, name = latestPack.name, revision = latestPack.revision + 1,
} = {}) {
  const sourceId = rawVariant.variant_from?.base_id;
  const source = sourcePack.base_branches?.find(branch => branch.id === sourceId);
  const current = latestPack.base_branches?.find(branch => branch.id === sourceId);
  if (!source || !current || !sameBaseBranchTopology(source, current)
    || source.size_m !== current.size_m || !sameValues(source.geometry.position, current.geometry.position, 1e-10)
    || !sameValues(source.tip, current.tip, 1e-10) || !sameShapeGuides(source.shape_guides, current.shape_guides)
    || !samePlantUnitAtlas(sourcePack.material, latestPack.material)
    || sourcePack.material.cutoff !== latestPack.material.cutoff || sourcePack.material.roughness !== latestPack.material.roughness) {
    throw Error('基础枝或套装材质已更新，请读取库中新版后再调整。');
  }
  const variant = normalizePlantBaseBranch(rawVariant);
  if (!rawVariant.id || !variant.shape_guides || !sameBaseBranchTopology(source, variant)) {
    throw Error('新基础枝需保留原三角面和 UV，并包含造型曲线。');
  }
  const topologyBytes = new TextEncoder().encode(JSON.stringify([
    source.geometry.position.length, source.geometry.index, source.geometry.uv,
  ]));
  const topology = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', topologyBytes)), value => value.toString(16).padStart(2, '0')).join('');
  variant.variant_from = {
    base_id: source.id, root_id: source.variant_from?.root_id || source.id,
    pack_id: source.variant_from?.pack_id || sourcePack.id, topology,
  };
  return normalizePlantUnitPack({ ...latestPack, id, name, revision, base_branches: [...latestPack.base_branches, variant] });
}

export function normalizePlantUnitPack(raw) {
  if (!raw || !Array.isArray(raw.units) || (raw.base_branches != null && !Array.isArray(raw.base_branches))
    || raw.units.length + (raw.base_branches?.length || 0) > 64) throw Error('每套植物素材最多 64 个单元');
  const units = raw.units.map(normalizePlantUnit);
  const baseBranches = (raw.base_branches || []).map(normalizePlantBaseBranch);
  const ids = [...units, ...baseBranches].map(unit => unit.id);
  if (new Set(ids).size !== ids.length) throw Error('单元 ID 重复，请重新导入');
  return { format: 'BranchForgePlantUnits', version: 1, id: text(raw.id, 'PLANT_UNITS'), name: text(raw.name, '新植物'),
    revision: Math.max(1, Math.trunc(Number(raw.revision) || 1)), species: text(raw.species), source: text(raw.source),
    material: normalizeLeafMaterial(raw.material), units, ...(baseBranches.length ? {base_branches: baseBranches} : {}),
    ...(raw.package_origins?.length?{package_origins:packageOrigins(raw.package_origins)}:{}) };
}

export function plantPackFromBuiltin(raw, entry) {
  const leafSize = entry.leaf_size || .1;
  const units = (raw.leaf_meshes || raw.units || []).map((u, i) => ({ ...u, id: u.id || `UNIT_${i}`,
    role: raw.kind === 'FLOWER' ? 'FLOWER' : 'LEAF', size_m: leafSize }));
  for (const u of raw.organ_meshes || []) units.push({ ...u, size_m: u.size || .06 });
  if (raw.flower) units.push({ ...raw.flower, id: 'FLOWER', role: 'FLOWER', size_m: .06 });
  return normalizePlantUnitPack({ id: entry.id, name: entry.name, species: raw.species, source: entry.source,
    units, material: raw.leaf_material || raw.material });
}

export function normalizeUnitAssembly(raw) {
  if (!raw || !Array.isArray(raw.entries)) return null;
  return { pack_id: text(raw.pack_id), pack_name: text(raw.pack_name), revision: Math.max(1, Math.trunc(Number(raw.revision) || 1)),
    entries: raw.entries.slice(0, 64).map(e => ({ unit_id: text(e.unit_id), size_m: bounded(e.size_m, .1, .001, 1), size_override: e.size_override === true, weight: bounded(e.weight, 1, .01, 10) })),
    density: bounded(raw.density, 12, 0, 400), start: bounded(raw.start, .15, 0, 1), end: bounded(raw.end, 1, 0, 1),
    order_min: Math.round(bounded(raw.order_min, 1, 0, 3)), organ_amount: bounded(raw.organ_amount, .35, 0, 1),
    habit: ['AXILLARY', 'PENDANT', 'TERMINAL'].includes(raw.habit) ? raw.habit : 'AXILLARY' };
}

export function documentWithUnitAssembly(document, rawPack, rawConfig) {
  const pack = normalizePlantUnitPack(rawPack), config = normalizeUnitAssembly(rawConfig);
  if (!pack.material.color) throw Error('请先为该植物配置共享颜色 / 透明贴图');
  if (!config?.entries.length) throw Error('请先拖入至少一个叶片、花或果实单元');
  if (config.start >= config.end) throw Error('分布起点必须小于终点');
  const chosen = config.entries.map(e => {
    const unit = pack.units.find(u => u.id === e.unit_id);
    if (!unit) throw Error('所选单元已被移除，请从素材库重新选择');
    return { ...unit, size_m: e.size_m, weight: e.weight };
  });
  const organs = chosen.filter(u => u.role !== 'LEAF');
  if (organs.length > 24) throw Error('当前单元枝最多使用 24 款花果单元');
  const next = structuredClone(document), a = next.authoring;
  if(pack.package_origins?.length)a.workbench={...a.workbench,package_origins:packageOrigins([...(a.workbench?.package_origins||[]),...pack.package_origins])};
  next.leaf_meshes = chosen.filter(u => u.role === 'LEAF').map(u => ({ id: `${pack.id}:${u.id}`, name: u.name,
    geometry: u.geometry, ...(u.colorTint ? { colorTint: u.colorTint } : {}), weight: u.weight, orderMin: 0, orderMax: 3, season: 'ANY', ageStage: 'ANY', shootRole: 'ANY',
    calibration: { scale: u.size_m / .1, rotation: 0, flip: false } }));
  next.leaf_mesh = null;
  Object.assign(next.settings, { leaf_scale: .1, leaf_aspect: 1, leaf_density: next.leaf_meshes.length ? config.density : 0,
    leaf_age_layering: 0, leaf_shoot_zoning: false, leaf_shoot_quota: false, foliage_mode: 'SINGLE', leaf_zone_start: config.start,
    petiole_length: 0, branch_clearance: 0, leaf_double_sided: true });
  a.leaf_material = pack.material;
  a.plant_unit_assembly = { ...config, pack_id: pack.id, pack_name: pack.name, revision: pack.revision };
  a.foliage_unit = { ...a.foliage_unit, mode: 'SINGLE', procedural: false };
  a.profiles = { ...a.profiles, leaf_scale: [1, 1, 1] };
  a.foliage_range = { start: config.start, end: config.end };
  a.leaf_edits = { removed: [], added: [] };
  a.attachment_layers = [{ id: 'ASSEMBLED_LEAVES', name: `${pack.name} · 所选叶片`, type: 'LEAF', enabled: true,
    order_min: config.order_min, order_max: 3, start: config.start, end: config.end, density: 1, scale: 1, source: -1 }];
  a.flowering = { ...a.flowering, enabled: false };
  a.tree_organs = normalizeTreeOrgans({ species: pack.species || pack.id, mode: organs.length ? 'MIXED' : 'LEAVES',
    habit: config.habit, amount: config.organ_amount, scale: 1, order_min: config.order_min,
    units: organs.map(u => ({ id: `${pack.id}:${u.id}`, name: u.name, role: u.role, geometry: u.geometry, size: u.size_m, weight: u.weight })) });
  a.recipe = { ...a.recipe, tags: [...new Set([...(a.recipe?.tags || []).filter(t => t !== 'PLACEHOLDER_LEAVES'), 'REAL_TREE_LEAVES', 'PLANT_UNIT_ASSEMBLY'])] };
  return next;
}

// Reopening a branch must work even when this browser has no shared library.
export function plantPackFromDocument(doc) {
  const config = normalizeUnitAssembly(doc.authoring?.plant_unit_assembly);
  if (!config) return legacyPlantAssembly(doc)?.pack || null;
  const prefix = config.pack_id + ':';
  const recovered = doc.leaf_meshes?.some(u => u.manual_only) ? legacyPlantAssembly(doc)?.pack : null;
  const units = (doc.leaf_meshes || []).map((u, i) => ({ ...(u.manual_only && recovered ? recovered.units[i] : u), id: u.id.startsWith(prefix) ? u.id.slice(prefix.length) : u.id,
    role: 'LEAF', size_m: .1 * (u.calibration?.scale || 1) }));
  for (const u of doc.authoring.tree_organs?.units || []) units.push({ ...u,
    id: u.id.startsWith(prefix) ? u.id.slice(prefix.length) : u.id, size_m: u.size });
  return normalizePlantUnitPack({ id: config.pack_id, name: config.pack_name, revision: config.revision,
    material: doc.authoring.leaf_material, units, source: '当前工程内嵌单元' });
}

// Read old embedded assets without writing migration metadata or regenerating
// the branch. The active organ mode decides which cards belong in the slots.
export function legacyPlantAssembly(doc) {
  const a = doc.authoring || {}, s = doc.settings || {}, o = a.tree_organs || {};
  const leaves = doc.leaf_meshes?.length ? doc.leaf_meshes : doc.leaf_mesh ? [{ id: 'LEAF_1', name: '工程叶片', geometry: doc.leaf_mesh }] : [];
  const units = [], entries = [];
  for (const [i, leaf] of leaves.entries()) {
    if (!leaf.geometry?.uv) continue;
    const geometry = structuredClone(leaf.geometry), c = leaf.calibration || {};
    const angle = (Number(c.rotation) || 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
    const flip = c.flip ? -1 : 1, aspect = bounded(s.leaf_aspect, 1, .04, 1.5);
    // Match the renderer's calibration then X aspect transform. Bake into the
    // recovered unit so changing the shared global scale cannot shrink it twice.
    for (let v = 0; v < geometry.position.length; v += 3) {
      const x = geometry.position[v] * flip, z = geometry.position[v + 2];
      geometry.position[v] = (x * cos + z * sin) * aspect;
      geometry.position[v + 2] = z * cos - x * sin;
      if (geometry.normal) {
        const nx = geometry.normal[v] * flip, nz = geometry.normal[v + 2];
        const transformed = [(nx * cos + nz * sin) / (leaf.manual_only ? 1 : aspect), geometry.normal[v + 1], nz * cos - nx * sin];
        const length = Math.hypot(...transformed) || 1;
        transformed.forEach((n, axis) => { geometry.normal[v + axis] = n / length; });
      }
    }
    if (flip < 0 && geometry.index) for (let v = 0; v < geometry.index.length; v += 3) [geometry.index[v + 1], geometry.index[v + 2]] = [geometry.index[v + 2], geometry.index[v + 1]];
    const unit = normalizePlantUnit({ ...leaf, id: `leaf:${i}:${leaf.id || i}`, role: 'LEAF', geometry,
      size_m: geometryExtent(geometry).longest * (leaf.manual_only ? .1 : bounded(s.leaf_scale, .1, .001, 10)) * bounded(c.scale, 1, .01, 20) });
    units.push(unit); entries.push({ unit_id: unit.id, size_m: unit.size_m, weight: leaf.weight ?? 1 });
  }
  for (const [i, organ] of (o.units || []).entries()) {
    if (!organ.geometry?.uv) continue;
    const unit = normalizePlantUnit({ ...organ, id: `organ:${i}:${organ.id || i}`,
      size_m: geometryExtent(organ.geometry).longest * (organ.size || .06) * (organ.manual_only ? 1 : o.scale || 1) });
    units.push(unit);
    if (o.mode === 'MIXED' || (o.mode === 'FRUIT' && unit.role === 'FRUIT') || (o.mode === 'FLOWER' && ['FLOWER', 'BUD'].includes(unit.role))) {
      entries.push({ unit_id: unit.id, size_m: unit.size_m, weight: organ.weight ?? 1 });
    }
  }
  if (!units.length) return null;
  const name = a.workbench?.name || s.object_name || o.species || '旧工程';
  let hash = 2166136261;
  for (const ch of JSON.stringify([name, s.seed, units.map(u => u.id)])) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  const pack = normalizePlantUnitPack({ id: `embedded:${(hash >>> 0).toString(16)}`, name: name + ' · 工程素材',
    species: o.species, units, material: a.leaf_material, source: '旧工程内嵌的原始叶花果网格与贴图' });
  const layers = (a.attachment_layers || []).filter(l => l.type === 'LEAF' && l.enabled !== false);
  const config = normalizeUnitAssembly({ pack_id: pack.id, pack_name: pack.name, entries,
    density: s.leaf_density, start: Math.max(s.leaf_zone_start || 0, a.foliage_range?.start || 0), end: a.foliage_range?.end ?? 1,
    order_min: layers.length ? Math.min(...layers.map(l => l.order_min ?? 0)) : 0,
    organ_amount: o.amount, habit: o.habit });
  return { pack, config };
}
