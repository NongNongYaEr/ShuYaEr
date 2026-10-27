import * as THREE from 'three';
import { completeInstanceMatrix } from './branch-instance-matrix.js';
import { branchInstanceFrame, buildBranchReferenceCurves } from './branch-kernel.js';
import { copy, normalizeBranchShape } from './branch-workbench-data.js';
import { lineTangent, sampleLine } from './tree-sculpt.js';
import {readAuthoringDraft} from './authoring-draft.js';

export function instanceMatrix(instance, shape, branches, settings) {
  const parent = branches.find((b) => b.stableId === instance.parent);
  return completeInstanceMatrix(instance,shape,parent,settings,branchInstanceFrame);
}

export function clearInstanceEdits(authoring, instanceId) {
  for (const [id, value] of Object.entries(authoring.overrides)) if (id.startsWith(instanceId + '.')) {
    for (const key of ['curve_knots', 'curve_samples', 'curve_sample_times', 'curve_reference_knots', 'curve_parent_frame', 'frozen_points', 'locked', 'offset', 'rotation', 'length', 'radius', 'radius_profile', 'sections', 'junction', 'bend']) delete value[key];
  }
  authoring.sculpt_layers.forEach((layer) => { for (const id of Object.keys(layer.branches)) if (id.startsWith(instanceId + '.')) delete layer.branches[id]; });
  authoring.sculpt_layers = authoring.sculpt_layers.filter((l) => { if (!l.operation) return true; l.operation.targets = l.operation.targets.filter((id) => !id.startsWith(instanceId + '.')); return l.operation.targets.length > 0; });
}

export function instanceEditBase(authoring, instanceId, branches, settings) {
  if (!authoring.sculpt_layers.some((l) => [...Object.keys(l.branches), ...(l.operation?.targets || [])].some((id) => id.startsWith(instanceId + '.')))) return branches;
  const baseline = copy(readAuthoringDraft(authoring));
  baseline.sculpt_layers.forEach((l) => { for (const id of Object.keys(l.branches)) if (id.startsWith(instanceId + '.')) delete l.branches[id]; });
  baseline.sculpt_layers = baseline.sculpt_layers.filter((l) => { if (!l.operation) return true; l.operation.targets = l.operation.targets.filter((id) => !id.startsWith(instanceId + '.')); return l.operation.targets.length > 0; });
  return buildBranchReferenceCurves({...settings,leaf_density:0},baseline,{owners:new Set([instanceId])});
}

export function reframeInstanceEdits(authoring, before, after, shape, branches, settings, baseBranches = null, scope = null) {
  const matrix = instanceMatrix(after, shape, branches, settings).multiply(instanceMatrix(before, shape, branches, settings).invert());
  const base = baseBranches || instanceEditBase(authoring, before.id, branches, settings);
  const members = base.filter((b) => b.instanceId === before.id), ids = new Set(members.map((b) => b.stableId));
  const updated = new Map(members.map((b) => [b.id, { ...b, points: b.points.map((p) => p.clone().applyMatrix4(matrix)) }]));
  for (const b of members) {
    const local = authoring.overrides[b.stableId];
    if (!local?.curve_knots?.length && !local?.frozen_points?.length) continue;
    const points = updated.get(b.id).points, knots = b.controlPoints.map((p) => p.clone().applyMatrix4(matrix));
    const parent = base.find((p) => p.id === b.parentId), nextParent = updated.get(parent?.id) || parent;
    const parentT = ids.has(parent?.stableId) ? b.parentT : after.attach;
    authoring.overrides[b.stableId] = { ...local, locked: true, frozen_points: null, curve_knots: knots.map((p) => p.toArray()), curve_samples: points.map((p) => p.toArray()), curve_reference_knots: knots.map((p) => p.toArray()),
      offset: nextParent ? knots[0].clone().sub(ids.has(parent?.stableId) ? sampleLine(nextParent.points, parentT) : branchInstanceFrame(after, nextParent, settings).position).toArray() : [0, 0, 0],
      curve_parent_frame: nextParent ? { parent: nextParent.stableId, tangent: lineTangent(nextParent.points, parentT).toArray() } : null };
  }
  const linear = new THREE.Matrix3().setFromMatrix4(matrix);
  const indexed=scope?.authoring===authoring&&scope.owner===before.id&&scope.operationsAbsent===true;
  for (const layer of indexed?[]:[...authoring.sculpt_layers]) {
    const op = layer.operation; if (!op) continue;
    const targets = op.targets.filter((id) => id.startsWith(before.id + '.')); if (!targets.length) continue;
    let moved = op;
    if (targets.length !== op.targets.length) {
      moved = structuredClone(op); moved.targets = targets; op.targets = op.targets.filter((id) => !targets.includes(id));
      authoring.sculpt_layers.splice(authoring.sculpt_layers.indexOf(layer) + 1, 0, { ...structuredClone(layer), id: layer.id.slice(0, 25) + '_' + before.id.slice(-24), operation: moved });
    }
    for (const key of ['rest', 'nodes', 'guide']) if (moved[key]) moved[key] = moved[key].map((p) => new THREE.Vector3(...p).applyMatrix4(matrix).toArray());
    for (const key of ['center', 'anchor']) if (moved[key]) moved[key] = new THREE.Vector3(...moved[key]).applyMatrix4(matrix).toArray();
    if (moved.type === 'POSE') moved.offset = new THREE.Vector3(...moved.offset).applyMatrix3(linear).toArray();
    const ratio = Math.cbrt(Math.abs(matrix.determinant())); if (moved.radius) moved.radius *= ratio; if (moved.clearance) moved.clearance *= ratio;
  }
  const entries=indexed?scope.entries:authoring.sculpt_layers.flatMap(l=>Object.entries(l.branches).filter(([id])=>id.startsWith(before.id+'.')).map(([,entry])=>entry));
  for(const entry of entries){
    for (const key of ['deltas', 'knot_deltas']) if (entry[key]) entry[key] = entry[key].map((p) => new THREE.Vector3(...p).applyMatrix3(linear).toArray());
    entry.root_offset = new THREE.Vector3(...(entry.root_offset || [0, 0, 0])).applyMatrix3(linear).toArray();
  }
  authoring.curve_editor.affect_children = true;
}

export function captureInstanceShape(instance, shape, branches, settings) {
  const inverse = instanceMatrix(instance, shape, branches, settings).invert();
  const scale = branchInstanceFrame(instance, branches.find((b) => b.stableId === instance.parent), settings).scale;
  return normalizeBranchShape({ ...shape, branches: shape.branches.map((record) => {
    const branch = branches.find((b) => b.stableId === `${instance.id}.${record.id}`); if (!branch) return record;
    return { ...record, points: branch.points.map((p) => p.clone().applyMatrix4(inverse).toArray()), knots: branch.controlPoints.map((p) => p.clone().applyMatrix4(inverse).toArray()),
      length: branch.length / scale, start_radius: branch.startRadius / scale / (instance.radius_scale || 1), end_radius: branch.endRadius / scale / (instance.radius_scale || 1), radius_profile: branch.radiusProfile, sections: branch.sections };
  }) });
}
