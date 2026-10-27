import * as THREE from 'three';
import { resolveInstanceAsset, resolveInstanceShape } from './branch-workbench-data.js';
import { branchMountAt } from './branch-mount-frame.js';
import { completeInstanceMatrix } from './branch-instance-matrix.js';
import { sampleLine, lineTangent } from './tree-sculpt.js';

// Only untouched, independent completed units can follow as a whole. Existing
// layered/custom edits retain their established curve commit path.
export function rigidSculptInstances(authoring) {
  if (authoring.active_sculpt_layer || authoring.sculpt_layers.some(l => l.enabled && l.strength)
    || authoring.symmetry_groups.some(g => g.enabled) || Object.keys(authoring.topology.reparent).length) return new Set();
  const edited = new Set(Object.keys(authoring.overrides).map(id => id.split('.')[0]));
  for (const id of authoring.topology.suppressed) edited.add(id.split('.')[0]);
  return new Set(authoring.branch_instances.filter(i => !edited.has(i.id)
    && resolveInstanceAsset(i, authoring.branch_library)?.sample
    && !authoring.branch_instances.some(p => i.parent.startsWith(p.id + '.'))).map(i => i.id));
}

// Store rigid motion in the existing instance frame/roll fields. Verify every
// curve before discarding its redundant override; real deformations fall back.
export function sculptInstanceFrames(asset, snapshot, updated, overrides, frame) {
  const authoring = asset.authoring, eligible = rigidSculptInstances(authoring);
  const families = new Map(), result = new Map();
  for (const b of snapshot.values()) if (eligible.has(b.instanceId)) {
    if (!families.has(b.instanceId)) families.set(b.instanceId, []);
    families.get(b.instanceId).push(b);
  }
  for (const instance of authoring.branch_instances) {
    const family = families.get(instance.id);
    if (!family?.some(b => overrides[b.stableId])) continue;
    const root = family.find(b => snapshot.get(b.parentId)?.instanceId !== instance.id);
    const matrix = updated.get(root?.id)?.sculptFollowMatrix;
    if (!matrix || !family.every(b => {
      const after = updated.get(b.id);
      return after && ['points', 'controlPoints'].every(key => b[key].length === after[key].length
        && b[key].every((p, n) => p.clone().applyMatrix4(matrix).distanceToSquared(after[key][n]) < 1e-16));
    })) continue;
    const shape = resolveInstanceShape(instance, authoring.branch_library);
    const parent = snapshot.get(root.parentId), afterParent = updated.get(root.parentId);
    if (!shape || !parent || !afterParent) continue;
    const desired = matrix.clone().multiply(completeInstanceMatrix(instance, shape, parent, asset.settings, frame));
    const mount = branchMountAt(afterParent, instance.attach), inverse = mount?.clone().invert();
    const local = inverse ? desired.clone().premultiply(inverse) : desired;
    const sourceParent = inverse ? {...afterParent, points: afterParent.points.map(p => p.clone().applyMatrix4(inverse))} : afterParent;
    const position = new THREE.Vector3(...shape.connector.position).applyMatrix4(local);
    const q = new THREE.Quaternion().setFromRotationMatrix(local.clone().scale(new THREE.Vector3(1, 1, 1).divide(new THREE.Vector3().setFromMatrixScale(local))));
    const direction = new THREE.Vector3(...shape.connector.direction).normalize().applyQuaternion(q);
    const base = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...shape.connector.direction).normalize(), direction);
    const residual = q.clone().multiply(base.invert());
    const angle = 2 * Math.atan2(new THREE.Vector3(residual.x, residual.y, residual.z).dot(direction), residual.w) * 180 / Math.PI;
    const next = {...instance, roll: ((angle + 180) % 360 + 360) % 360 - 180,
      frame: {position: position.toArray(), direction: direction.toArray(),
        parent_position: sampleLine(sourceParent.points, instance.attach).toArray(),
        parent_tangent: lineTangent(sourceParent.points, instance.attach).toArray()}};
    const check = completeInstanceMatrix(next, shape, afterParent, asset.settings, frame);
    if (!check.elements.every((v, n) => Math.abs(v - desired.elements[n]) < 1e-8)
      || [...next.frame.position, ...next.frame.parent_position].some(v => Math.abs(v) > 1000)) continue;
    result.set(instance.id, next);
    for (const b of family) delete overrides[b.stableId];
  }
  return result;
}
