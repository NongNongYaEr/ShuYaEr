import { buildBranchAsset, disposeBranchAsset } from './branch-kernel.js';
import { captureBranchShape } from './branch-workbench-data.js';
import { captureSculptLayer } from './generator-geometry.js';

export function detachSymmetryGroup(authoring, group, branches, settings) {
  const roots = branches.filter((b) => b.symmetryGroup === group.id && b.symmetrySource === group.source);
  if (authoring.branch_instances.length + roots.length > 360) throw new Error('安装实例数量达到上限');
  const desired = {};
  const instances = roots.map((root) => {
    const { shape, source } = captureBranchShape(branches.filter((b) => !b.symmetryGroup || (b.symmetryGroup === group.id && b.symmetryCopy === root.symmetryCopy)), root.stableId);
    const id = 'INST_' + crypto.randomUUID().replaceAll('-', '');
    shape.branches.forEach((record, i) => {
      const b = branches.find((b) => b.stableId === source.ids[i]), knots = b.controlPoints.map((p) => p.toArray());
      desired[`${id}.${record.id}`] = { curve_knots: knots, curve_reference_knots: knots, curve_samples: b.points.map((p) => p.toArray()) };
    });
    return { id, shape, linked: false, parent: source.parent, attach: source.attach, frame: source.frame, scale: 1, roll: 0, azimuth: 0 };
  });
  const next = structuredClone(authoring); next.symmetry_groups = next.symmetry_groups.filter((g) => g.id !== group.id); next.branch_instances.push(...instances);
  // Converted copies enter before existing shape layers; compensate for that evaluation order.
  const baseline = buildBranchAsset({ ...settings, leaf_density: 0 }, null, [], 0, next);
  const layer = { id: 'SCULPT_' + crypto.randomUUID().replaceAll('-', ''), name: '解除联动保形', enabled: true, strength: 1, branches: {} };
  try { captureSculptLayer(layer, baseline.masterBranches, desired); } finally { disposeBranchAsset(baseline); }
  if (Object.keys(layer.branches).length) {
    next.sculpt_layers.push(layer);
  }
  Object.assign(authoring, next);
}
