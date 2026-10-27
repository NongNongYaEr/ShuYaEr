import * as THREE from './vendor/three.module.min.js';
import { branchMountAt } from './branch-mount-frame.js';
import { sectionAt } from './branch-shaping.js';
import { lineTangent, sampleLine } from './tree-sculpt.js';
import { transformLegacyRigidGeometry } from './legacy-unit-placement.js';

// An installed unit owns its entire subtree, including nested units and older
// manually attached branches that did not carry explicit owner metadata.
export function protectedUnitBranches(branches) {
  const byId = new Map(branches.map(b => [b.id, b])), protectedIds = new Set(), seen = new Set();
  function visit(b, stack = new Set()) {
    if (!b || seen.has(b.id)) return protectedIds.has(b?.id);
    if (stack.has(b.id)) return false;
    stack.add(b.id);
    const copiedUnit=b.copySnapshot&&(b.sourceInstanceId||[...(b.copiedLeaves||[]),...(b.copiedOrgans||[])].some(unit=>unit.metadata?.sourceInstanceId));
    if (b.instanceId || b.unitOwner || copiedUnit || visit(byId.get(b.parentId), stack)) protectedIds.add(b.id);
    stack.delete(b.id); seen.add(b.id); return protectedIds.has(b.id);
  }
  branches.forEach(b => visit(b));
  return protectedIds;
}

function carrierMotion(before, after, t) {
  const tangent = lineTangent(after.points, t);
  const q = new THREE.Quaternion().setFromUnitVectors(lineTangent(before.points, t), tangent);
  const roll = (sectionAt(after.sections, t).roll - sectionAt(before.sections, t).roll) * Math.PI / 180;
  if (roll) q.premultiply(new THREE.Quaternion().setFromAxisAngle(tangent, roll));
  return new THREE.Matrix4().makeTranslation(...sampleLine(after.points, t).toArray())
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q))
    .multiply(new THREE.Matrix4().makeTranslation(...sampleLine(before.points, t).negate().toArray()));
}

// The support evaluation supplies curves only. Record carrier frames for the
// shared prototype renderer and move each outermost installed subtree once.
export function followProtectedUnits(branches, structural, protectedIds) {
  // applySculptLayers commits fields into the input branch objects afterwards.
  // Retain their original arrays in stable shallow snapshots for frame lookup.
  const before = new Map(branches.map(b => [b.id, {...b}])), after = new Map(structural.map(b => [b.id, b]));
  const identity = new THREE.Matrix4(), changed = new Set(), moves = new Map();
  for (const b of structural) {
    const original = before.get(b.id);
    if (b.points.every((p, i) => p.equals(original.points[i]))
      && JSON.stringify(b.sections) === JSON.stringify(original.sections)) continue;
    changed.add(b.id);
    const final = {...b};
    const at = t => carrierMotion(original, final, t).multiply(branchMountAt(original, t) || identity);
    const frames = b.points.slice(1).map((_, i) => {
      const t = (i + .5) / (b.points.length - 1);
      return at(t);
    });
    after.set(b.id, { ...final, mountFrames:frames, mountFrameBinding:{points:final.points,frames,at} });
  }
  function motion(b, stack = new Set()) {
    if (moves.has(b.id)) return moves.get(b.id);
    if (stack.has(b.id)) return null;
    stack.add(b.id);
    const parent = before.get(b.parentId);
    const matrix = protectedIds.has(parent?.id) ? motion(parent, stack)
      : parent && changed.has(parent.id) ? carrierMotion(parent, after.get(parent.id), b.parentT) : null;
    stack.delete(b.id); moves.set(b.id, matrix); return matrix;
  }
  return branches.map(b => {
    if (!protectedIds.has(b.id)) return after.get(b.id) || b;
    const matrix = motion(b); if (!matrix) return b;
    const q = new THREE.Quaternion().setFromRotationMatrix(matrix);
    const copiedUnit=b.copySnapshot&&(b.sourceInstanceId||[...(b.copiedLeaves||[]),...(b.copiedOrgans||[])].some(unit=>unit.metadata?.sourceInstanceId));
    const legacyGeometry=b.legacyRigidGeometry || copiedUnit;
    const parent=before.get(b.parentId);
    const collar=legacyGeometry&&(b.collarQuaternion || (parent?.points?.length>1
      ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),lineTangent(parent.points,.7)) : null));
    return { ...b, points: b.points.map(p => p.clone().applyMatrix4(matrix)),
      controlPoints: b.controlPoints.map(p => p.clone().applyMatrix4(matrix)),
      surfaceNormals: b.surfaceNormals?.map(n => n.clone().applyQuaternion(q)),
      mountMatrix: matrix.clone().multiply(b.mountMatrix || identity),
      ...(collar?.isQuaternion ? { collarQuaternion: q.clone().multiply(collar).normalize() } : {}),
      ...(legacyGeometry ? { legacyRigidGeometry: transformLegacyRigidGeometry(b,matrix,parent) } : {}),
      mountFrames: b.mountFrames?.map(frame => matrix.clone().multiply(frame)) };
  });
}
