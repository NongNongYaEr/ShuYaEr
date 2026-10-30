import {axisTimes,sampleAxis} from './branch-axis.js';
import { branchRadiusAt, branchSampleTs } from './branch-shaping.js';

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const vec = (point) => [point.x, point.y, point.z];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalized = (a) => { const length = Math.hypot(...a); return length > 1e-9 ? a.map((v) => v / length) : [0, 0, 0]; };

function foliageSourceIndex(placement, branch, sources, season) {
  if (Number.isInteger(placement.source) && placement.source >= 0 && placement.source < sources.length) return placement.source;
  const eligible = sources.map((source, index) => ({ source, index })).filter(({ source }) =>
    branch.order >= (source.orderMin ?? 0) && branch.order <= (source.orderMax ?? 3)
    && (source.season === 'ANY' || source.season === season));
  const pool = eligible.length ? eligible : sources.map((source, index) => ({ source, index }));
  let cursor = placement.random * pool.reduce((sum, item) => sum + item.source.weight, 0);
  for (const item of pool) { cursor -= item.source.weight; if (cursor <= 0) return item.index; }
  return pool.at(-1).index;
}

function foliagePose(placement) {
  const up = normalized(vec(placement.direction));
  const helper = Math.abs(up[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1];
  let across = normalized(cross(up, placement.normal ? vec(placement.normal) : helper));
  if (Math.hypot(...across) < 1e-9) across = normalized(cross(up, helper));
  const face = normalized(cross(across, up));
  const twist = placement.twist || 0;
  return { up, face: face.map((v, index) => v * Math.cos(twist) + across[index] * Math.sin(twist)) };
}

function samplePosition(points, t) {
  const target = Math.max(0, Math.min(1, t));
  const index = Math.max(0, points.findIndex((point) => point.t >= target) - 1);
  const next = Math.min(points.length - 1, index + 1);
  const blend = Math.max(0, Math.min(1, (target - points[index].t) / Math.max(1e-9, points[next].t - points[index].t)));
  return [0, 1, 2].map((axis) => points[index].position_m[axis] * (1 - blend) + points[next].position_m[axis] * blend);
}

function sampleRadius(points, t) {
  const target = Math.max(0, Math.min(1, t));
  const index = Math.max(0, points.findIndex((point) => point.t >= target) - 1);
  const next = Math.min(points.length - 1, index + 1);
  const blend = Math.max(0, Math.min(1, (target - points[index].t) / Math.max(1e-9, points[next].t - points[index].t)));
  return points[index].radius_m * (1 - blend) + points[next].radius_m * blend;
}

// Uses the same sample positions and radius function as createSweptBranchGeometry.
// It deliberately exports masterBranches before viewport/foliage LOD removes twigs.
export function createPVESkeleton(asset, leafSources = []) {
  if (asset?.skeletonOnly) throw Error('请先返回整树预览，再导出完整 PVE 骨架');
  if (!asset?.masterBranches?.length || !asset.settings) throw new Error('没有可导出的最终枝条骨架');
  const byRuntimeId = new Map(asset.masterBranches.map((branch) => [branch.id, branch]));
  const branches = asset.masterBranches.map((branch) => {
    if (!branch.stableId || !Array.isArray(branch.points) || branch.points.length < 2) {
      throw new Error(`枝条 ${branch.id} 缺少稳定 ID 或曲线点`);
    }
    const sampleTs = branchSampleTs(branch);
    const points = sampleTs.map((t) => {
      const scaled = t * (branch.points.length - 1);
      const index = Math.min(branch.points.length - 2, Math.floor(scaled));
      const position = axisTimes(branch.points)?sampleAxis(branch.points,t):branch.points[index].clone().lerp(branch.points[index + 1], scaled - index);
      return { t, position_m: vec(position), radius_m: branchRadiusAt(branch, asset.settings, t) };
    });
    const parent = byRuntimeId.get(branch.parentId);
    if (branch.parentId >= 0 && !parent) throw new Error(`枝条 ${branch.stableId} 的父枝不存在`);
    return {
      id: branch.stableId,
      parent_id: parent?.stableId ?? null,
      parent_t: parent ? branch.parentT : null,
      order: branch.order,
      instance_id: branch.instanceId || null,
      points,
    };
  });
  const wholePlant = asset.authoring?.recipe?.tags?.includes('WHOLE_PLANT') || asset.authoring?.vine || asset.authoring?.surface_growth?.enabled;
  const source = wholePlant ? null : asset.authoring?.branch_shape?.connector;
  const connector = source && Array.isArray(source.position) && Array.isArray(source.direction)
    ? { position_m: source.position, direction: source.direction }
    : null;
  const sources = leafSources.length ? leafSources.map((source, index) => ({
    id: source.id || `LEAF_${index + 1}`, name: source.name || `Leaf_${index + 1}`,
    weight: Math.max(0.001, Number(source.weight) || 1),
    orderMin: Number.isFinite(Number(source.orderMin)) ? Number(source.orderMin) : 0,
    orderMax: Number.isFinite(Number(source.orderMax)) ? Number(source.orderMax) : 3,
    season: source.season || 'ANY',
  })) : [{ id: 'BUILTIN_LEAF', name: '内置阔叶', weight: 1, orderMin: 0, orderMax: 3, season: 'ANY' }];
  const foliage = (asset.masterPlacements || asset.placements || []).map((placement) => {
    const branch = byRuntimeId.get(placement.branchId);
    if (!branch) throw new Error(`叶片 ${placement.stableId} 的父枝不存在`);
    const pose = foliagePose(placement);
    return {
      id: placement.stableId, branch_id: branch.stableId, branch_t: placement.branchT,
      source_index: foliageSourceIndex(placement, branch, sources, asset.settings.season),
      position_m: vec(placement.position), up: pose.up, face: pose.face,
      scale_m: placement.scale,
    };
  });
  const result = {
    format: 'BranchForgePVESkeleton', version: 2,
    coordinate_system: { handedness: 'right', up: 'Z', unit: 'meter', point_space: 'source_local' },
    kind: wholePlant ? 'whole_plant' : 'branch_unit',
    name: asset.settings.object_name,
    seed: asset.settings.seed,
    connector,
    branches,
    foliage_sources: sources.map(({ id, name }) => ({ id, name })),
    foliage,
  };
  const report = validatePVESkeleton(result);
  if (report.errors.length) throw new Error(`PVE 骨架无效：${report.errors.slice(0, 5).join('；')}`);
  return result;
}

export function validatePVESkeleton(skeleton) {
  const errors = [], warnings = [];
  if (skeleton?.format !== 'BranchForgePVESkeleton' || ![1, 2, 3].includes(skeleton.version)) errors.push('格式或版本不受支持');
  if(skeleton.version===3&&(!skeleton.required_capabilities?.includes('imported_trunk_materials_v1')||skeleton.imported_trunks?.version!==1))errors.push('外部树干能力声明缺失');
  if(skeleton.version===3){
    if(!Array.isArray(skeleton.required_capabilities)||skeleton.required_capabilities.some(c=>!['imported_trunk_materials_v1','imported_trunk_skin_v1'].includes(c)))errors.push('PVE 入口需要当前桥接尚不支持的能力');
    const imported=skeleton.imported_trunks,sources=imported?.sources,mounts=imported?.mounts;
    if(!Array.isArray(sources)||!sources.length||!Array.isArray(mounts)||!mounts.length)errors.push('外部树干来源或实例清单缺失');
    else{const ids=new Set(),mounted=new Set(),branches=new Set((skeleton.branches||[]).map(b=>b.id));for(const s of sources){if(typeof s.id!=='string'||ids.has(s.id)||!Number.isInteger(s.revision)||s.revision<1||!/^[a-f0-9]{64}$/i.test(s.source_sha256||''))errors.push('外部树干来源身份或哈希无效');ids.add(s.id);}for(const m of mounts){if(typeof m.id!=='string'||mounted.has(m.id)||!sources.some(s=>s.id===m.asset_id&&s.revision===m.revision)||!m.guide_map||!Object.values(m.guide_map).length||Object.values(m.guide_map).some(id=>!branches.has(id)))errors.push('外部树干实例或控制枝引用无效');mounted.add(m.id);}}
  }
  if (skeleton?.coordinate_system?.up !== 'Z' || skeleton?.coordinate_system?.unit !== 'meter'
    || skeleton?.coordinate_system?.handedness !== 'right') errors.push('坐标或单位不受支持');
  const branches = Array.isArray(skeleton?.branches) ? skeleton.branches : [];
  if (!branches.length) errors.push('骨架为空');
  const byId = new Map();
  let point_count = 0;
  for (const branch of branches) {
    if (typeof branch?.id !== 'string' || !branch.id) { errors.push('枝条缺少 ID'); continue; }
    if (byId.has(branch.id)) errors.push(`重复枝条 ID：${branch.id}`);
    byId.set(branch.id, branch);
    if (!Array.isArray(branch.points) || branch.points.length < 2) { errors.push(`${branch.id} 的曲线点不足`); continue; }
    point_count += branch.points.length;
    for (let index = 0; index < branch.points.length; index++) {
      const point = branch.points[index];
      if (!Array.isArray(point.position_m) || point.position_m.length !== 3 || !point.position_m.every(finite)
        || !finite(point.t) || point.t < 0 || point.t > 1 || !finite(point.radius_m) || point.radius_m <= 0
        || (index > 0 && branch.points[index - 1].t >= point.t)) {
        errors.push(`${branch.id} 有无效位置或半径`); break;
      }
    }
  }
  let min_parent_to_child_radius_ratio = Infinity;
  let thin_parent_connections = 0;
  let displaced_connections = 0;
  for (const branch of branches) {
    if (!branch?.parent_id) continue;
    const parent = byId.get(branch.parent_id);
    if (!parent) { errors.push(`${branch.id} 的父枝 ${branch.parent_id} 不存在`); continue; }
    if (!finite(branch.parent_t) || branch.parent_t < 0 || branch.parent_t > 1) {
      errors.push(`${branch.id} 的连接位置无效`); continue;
    }
    const visited = new Set([branch.id]);
    let cursor = parent;
    while (cursor) {
      if (visited.has(cursor.id)) { errors.push(`${branch.id} 的父子关系成环`); break; }
      visited.add(cursor.id);
      cursor = byId.get(cursor.parent_id);
    }
    if (!parent.points?.length || !branch.points?.length) continue;
    const parentRadius = sampleRadius(parent.points, branch.parent_t);
    const childRadius = branch.points[0].radius_m;
    const ratio = parentRadius / childRadius;
    min_parent_to_child_radius_ratio = Math.min(min_parent_to_child_radius_ratio, ratio);
    if (ratio < 1) thin_parent_connections++;
    if (distance(samplePosition(parent.points, branch.parent_t), branch.points[0].position_m) > Math.max(0.02, parentRadius + childRadius)) {
      displaced_connections++;
    }
  }
  if (thin_parent_connections) warnings.push(`${thin_parent_connections} 处母枝比接入的子枝细`);
  if (displaced_connections) warnings.push(`${displaced_connections} 处连接点离母枝较远`);
  // The source mix determines capacity; branch count alone cannot prove truncation.
  const foliage = skeleton.version >= 2 ? skeleton.foliage : [];
  const sources = skeleton.version >= 2 ? skeleton.foliage_sources : [];
  if (skeleton.version >= 2 && (!Array.isArray(foliage) || !Array.isArray(sources) || !sources.length&&!(skeleton.version===3&&Array.isArray(foliage)&&foliage.length===0))) errors.push('叶片实例或叶片源列表缺失');
  if (Array.isArray(foliage) && Array.isArray(sources)) {
    const ids = new Set();
    for (const leaf of foliage) {
      if (!leaf || typeof leaf.id !== 'string' || !leaf.id || ids.has(leaf.id)) { errors.push('叶片 ID 缺失或重复'); continue; }
      ids.add(leaf.id);
      if (!byId.has(leaf.branch_id) || !Number.isInteger(leaf.source_index) || leaf.source_index < 0 || leaf.source_index >= sources.length
        || !finite(leaf.branch_t) || leaf.branch_t < 0 || leaf.branch_t > 1
        || !Array.isArray(leaf.position_m) || leaf.position_m.length !== 3 || !leaf.position_m.every(finite)
        || !finite(leaf.scale_m) || leaf.scale_m <= 0
        || !Array.isArray(leaf.up) || leaf.up.length !== 3 || !leaf.up.every(finite)
        || !Array.isArray(leaf.face) || leaf.face.length !== 3 || !leaf.face.every(finite)
        || Math.abs(Math.hypot(...leaf.up) - 1) > 1e-4 || Math.abs(Math.hypot(...leaf.face) - 1) > 1e-4
        || Math.abs(dot(leaf.up, leaf.face)) > 1e-4) {
        errors.push(`${leaf.id} 的叶片附着或姿态无效`);
      }
    }
  }
  return {
    valid: errors.length === 0, branch_count: branches.length, point_count, foliage_count: Array.isArray(foliage) ? foliage.length : 0,
    root_count: branches.filter((branch) => !branch.parent_id).length,
    thin_parent_connections, displaced_connections,
    min_parent_to_child_radius_ratio: Number.isFinite(min_parent_to_child_radius_ratio) ? min_parent_to_child_radius_ratio : null,
    errors, warnings,
  };
}
