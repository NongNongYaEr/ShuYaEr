import * as THREE from 'three';
import { buildBranchAsset, disposeBranchAsset } from './branch-kernel.js';
import { normalizeAuthoring } from './authoring-state.js';
import { captureSculptLayer } from './generator-geometry.js';
import { resamplePolyline } from './v4-tools.js';
import { lineTangent, sampleLine } from './tree-sculpt.js';
import { branchRadiusAt, sectionAt, normalizeSections } from './branch-shaping.js';

export function strokeCurve(raw, anchor, tangent, options) {
  if (raw.length < 2) throw new Error('笔迹至少需要两个点');
  let knots = resamplePolyline(raw.map((p) => p.toArray()), 12).map((p) => new THREE.Vector3(...p));
  const shift = anchor.clone().sub(knots[0]); knots.forEach((p) => p.add(shift));
  tangent = tangent.clone();
  if (options.normal) { const normal = new THREE.Vector3(...options.normal).normalize(); knots.forEach((p) => p.addScaledVector(normal, -p.clone().sub(anchor).dot(normal))); tangent.addScaledVector(normal, -tangent.dot(normal)).normalize(); }
  for (let pass = 0; pass < Math.round(options.smooth * 5); pass++) { const previous = knots; knots = previous.map((p, i) => i === 0 || i === previous.length - 1 ? p : p.clone().lerp(previous[i - 1].clone().lerp(previous[i + 1], 0.5), 0.5)); }
  const length = knots.slice(1).reduce((sum, p, i) => sum + p.distanceTo(knots[i]), 0);
  if (length < 0.025) throw new Error('笔迹过短');
  const ratio = options.length > 0 ? options.length / length : 1;
  knots.forEach((p) => p.sub(anchor).multiplyScalar(ratio).add(anchor));
  const step = knots[1].distanceTo(anchor); if (tangent.lengthSq() > 1e-8) knots[1].lerp(anchor.clone().addScaledVector(tangent, step), options.align);
  if (options.length > 0) { const adjusted = knots.slice(1).reduce((n, p, i) => n + p.distanceTo(knots[i]), 0); knots.forEach((p) => p.sub(anchor).multiplyScalar(options.length / adjusted).add(anchor)); }
  return knots;
}

export function planBranchStroke(authoring, settings, branches, branchId, raw, options, id) {
  const a = { ...authoring, manual_branches: [...authoring.manual_branches], sculpt_layers: [...authoring.sculpt_layers], topology: { ...authoring.topology, operations: [...authoring.topology.operations] } }, branch = branches.find((b) => b.stableId === branchId);
  if (!branch || branch.symmetryGroup || branch.instanceId || branch.unitOwner) throw new Error('请选择承重骨架；单元枝内部请进入枝条工作台编辑');
  const fork = options.mode === 'FORK', t = fork ? options.attach : 1, anchor = sampleLine(branch.points, t);
  if (fork && branches.length >= 2200) throw new Error('已达到 2200 枝段上限');
  if (!fork && (a.overrides[branchId]?.pinned_points || []).includes(branch.controlPoints.length - 1)) throw new Error('枝梢已固定，请先解除固定');
  const tail = strokeCurve(raw, anchor, lineTangent(branch.points, t), options), targetId = fork ? id : branchId;
  const radius = branchRadiusAt(branch, settings, t) * (fork ? options.radius : 1);
  if (fork) a.manual_branches.push({ id, parent: branchId, attach: t, length: Math.max(0.03, tail.slice(1).reduce((n, p, i) => n + p.distanceTo(tail[i]), 0)), radius: Math.max(0.001, radius), angle: 35, azimuth: 0 });
  const baseline = buildBranchAsset({ ...settings, leaf_density: 0 }, null, [], 0, a, { skeletonOnly: true });
  try {
    const source = baseline.masterBranches.find((b) => b.stableId === targetId); if (!source) throw new Error('母枝不可用或枝段预算不足');
    const knots = fork ? tail : [...branch.controlPoints.map((p) => p.clone()), ...tail.slice(1)];
    if (knots.length > 64) throw new Error('续枝后超过 64 个控制点，请先精简曲线');
    const newSamples = new THREE.CatmullRomCurve3(tail).getPoints(48), points = fork ? newSamples : [...branch.points.map((p) => p.clone()), ...newSamples.slice(1)];
    const curve = { curve_knots: knots.map((p) => p.toArray()), curve_samples: points.map((p) => p.toArray()), curve_reference_knots: knots.map((p) => p.toArray()) };
    const layer = { id: 'STROKE_' + id, name: fork ? '画笔分叉' : '画笔续枝', enabled: true, strength: 1, branches: {} };
    captureSculptLayer(layer, baseline.masterBranches, { [targetId]: curve });
    const entry = layer.branches[targetId]; if (!entry) throw new Error('笔迹未改变枝条');
    const split = fork ? 0 : (branch.points.length - 1) / (points.length - 1);
    entry.sections = normalizeSections(Array.from({ length: 24 }, (_, i) => {
      const u = Math.round(i / 23 * 1000) / 1000, oldT = split ? Math.min(1, u / split) : 0, beyond = split ? Math.max(0, (u - split) / (1 - split)) : u;
      const desired = !fork && u < split ? branchRadiusAt(branch, settings, oldT) : radius * THREE.MathUtils.lerp(1, options.taper, beyond);
      return { ...sectionAt(branch.sections, oldT), t: u, radius: Math.max(0.00065, desired) / Math.max(0.00001, branchRadiusAt({ ...source, sections: [] }, settings, u)) };
    }));
    // Continuation changes parameterization; retain existing child roots and directions.
    if (!fork) for (const child of baseline.masterBranches.filter((b) => b.parentId === source.id)) {
      const oldAttach = sampleLine(source.points, child.parentT), newAttach = sampleLine(points, child.parentT), rotation = new THREE.Quaternion().setFromUnitVectors(lineTangent(source.points, child.parentT), lineTangent(points, child.parentT));
      const offset = child.points[0].clone().sub(newAttach).sub(child.points[0].clone().sub(oldAttach).applyQuaternion(rotation));
      layer.branches[child.stableId] = { parent: branchId, root_offset: offset.toArray(), deltas: child.points.map(() => [0, 0, 0]), knot_deltas: child.controlPoints.map(() => [0, 0, 0]) };
    }
    a.sculpt_layers.push(layer); a.active_sculpt_layer = layer.id;
    a.topology.operations.push({ id: 'DRAW_' + id, type: fork ? 'FORK_DRAW' : 'EXTEND', target: branchId, created: fork ? id : '', at: t });
    return { authoring: normalizeAuthoring(a), targetId, knots, points };
  } finally { disposeBranchAsset(baseline); }
}
