import * as THREE from './vendor/three.module.min.js';
import {
  BASE_BRANCH_SCALE_RANGE, baseBranchAnchorFrame, baseBranchFrameOrientation, baseBranchWoodSize,
  createBaseBranchGuideSlide,
} from './base-branch-assembly.js';
import { createBaseBranchSurfaceProjector } from './base-branch-surface-edit.js';

const yAxis = new THREE.Vector3(0, 1, 0);
const identity = new THREE.Quaternion();

export function localBaseBranchRotation(record) {
  const rotation = record.rotation ? new THREE.Quaternion(...record.rotation) : new THREE.Quaternion();
  return rotation.multiply(twist(record));
}

function twist(record) {
  return new THREE.Quaternion().setFromAxisAngle(yAxis, THREE.MathUtils.degToRad(record.roll));
}

export function baseBranchRotationFields(record, localRotation) {
  return { rotation: localRotation.clone().multiply(twist(record).invert()).normalize().toArray() };
}

export function baseBranchDegrees(rotation) {
  return new THREE.Euler().setFromQuaternion(rotation).toArray().slice(0, 3).map(THREE.MathUtils.radToDeg);
}

export function baseBranchRotationDegrees(degrees) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(...degrees.map(THREE.MathUtils.degToRad)));
}

export function createBaseBranchPoseEdit(assembly, placements, primaryId = placements.at(-1)?.id) {
  const entries = placements.map(record => {
    const frame = baseBranchAnchorFrame(assembly, record);
    if (!frame) throw Error('所选单元的挂点无效，请检查挂接');
    return {record, frame, orientation: baseBranchFrameOrientation(frame).multiply(localBaseBranchRotation(record))};
  });
  const center = entries.reduce((position, entry) => position.add(entry.frame.position), new THREE.Vector3())
    .divideScalar(Math.max(1, entries.length));
  const primary = entries.find(entry => entry.record.id === primaryId) || entries[0];
  const [minimum, maximum] = BASE_BRANCH_SCALE_RANGE;
  const scaleRange = [Math.max(...placements.map(p => minimum / p.scale)), Math.min(...placements.map(p => maximum / p.scale))];
  let projector = null;
  const project = (point, normal) => {
    projector ||= createBaseBranchSurfaceProjector(assembly);
    const limit = Math.max(.02, baseBranchWoodSize(assembly) * .35);
    return projector.nearest(point, {normal, maxDistance:limit})
      || projector.nearest(point, {maxDistance:limit});
  };
  function anchorRecord(entry, anchor) {
    if (!anchor) return null;
    const frame = baseBranchAnchorFrame(assembly, anchor);
    return frame.position.distanceToSquared(entry.frame.position) > 1e-14 ? {...entry.record, ...anchor} : entry.record;
  }
  const validGroup = items => items.every(Boolean) ? items : null;
  function moveTo(anchor) {
    const frame = baseBranchAnchorFrame(assembly, anchor);
    if (!primary || !frame) return null;
    const delta = frame.position.clone().sub(primary.frame.position);
    if (delta.lengthSq() <= 1e-14) return placements;
    return validGroup(entries.map(entry => anchorRecord(entry, entry === primary
      ? anchor : project(entry.frame.position.clone().add(delta), entry.frame.normal))));
  }
  function moveBy(delta) {
    if (delta.lengthSq() <= 1e-14) return placements;
    const anchor = project(primary.frame.position.clone().add(delta), primary.frame.normal);
    return anchor ? moveTo(anchor) : null;
  }
  function slide(metres) {
    if (Math.abs(metres) < 1e-9) return placements;
    return entries.map(entry => {
      entry.slide ||= createBaseBranchGuideSlide(assembly, entry.frame);
      return anchorRecord(entry, entry.slide(metres)) || entry.record;
    });
  }
  function transform({rotation = identity, factor = 1, centered = false}) {
    factor = THREE.MathUtils.clamp(factor, ...scaleRange);
    const rotate = 1 - Math.abs(rotation.w) > 1e-12, resize = Math.abs(factor - 1) > 1e-9;
    if (!rotate && !resize) return placements;
    return validGroup(entries.map(entry => {
      let record = entry.record, frame = entry.frame;
      if (centered && entries.length > 1) {
        const point = frame.position.clone().sub(center).applyQuaternion(rotation).multiplyScalar(factor).add(center);
        const anchor = project(point, frame.normal.clone().applyQuaternion(rotation));
        if (!anchor) return null;
        record = anchorRecord(entry, anchor);
        if (record !== entry.record) frame = baseBranchAnchorFrame(assembly, record);
      }
      const next = {...record, scale:entry.record.scale * factor};
      if (rotate || frame !== entry.frame) {
        const local = baseBranchFrameOrientation(frame).invert().multiply(rotation).multiply(entry.orientation);
        Object.assign(next, baseBranchRotationFields(record, local));
      }
      return next;
    }));
  }
  return { entries, center, primary, scaleRange, moveTo, moveBy, slide, transform };
}
