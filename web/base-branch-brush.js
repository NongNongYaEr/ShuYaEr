import * as THREE from './vendor/three.module.min.js';
import { BASE_BRANCH_SCALE_RANGE, baseBranchFrameOrientation, baseBranchUnitMatrix } from './base-branch-assembly.js';
import { baseBranchRotationFields, localBaseBranchRotation } from './base-branch-pose-edit.js';
import { meshUnitBrushFootprint, meshUnitBrushFrame } from './mesh-unit-brush.js';
import { geometryExtent } from './plant-unit-data.js';

const source = { connector: { position: [0, 0, 0], direction: [0, 1, 0], hang_direction: [0, 0, 1] } };
const footprints = new WeakMap();

function footprint(unit) {
  let lines = footprints.get(unit.geometry);
  if (!lines) {
    const { min, max } = geometryExtent(unit.geometry);
    const bounds = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));
    lines = meshUnitBrushFootprint(source, bounds);
    footprints.set(unit.geometry, lines);
  }
  return lines;
}

export function baseBranchBrushFrame(assembly, unit, placement, anchor) {
  return meshUnitBrushFrame(source, baseBranchUnitMatrix(assembly, unit, placement, anchor));
}

export function baseBranchBrushEntry(assembly, unit, placement, anchor) {
  const basis = baseBranchFrameOrientation(anchor);
  const inverse = basis.clone().invert();
  const evaluatePlacement = next => baseBranchBrushFrame(assembly, unit, next, anchor);
  const frame = evaluatePlacement(placement);
  const sampleLines = footprint(unit).map(line => line.map(point => point.clone().applyMatrix4(frame.matrix)));
  return {
    id: placement.id, instance: placement, shape: source, frame, longAxis: frame.direction,
    sampleLines, displayLines: [sampleLines[0].map(point => point.clone())], scaleRange: BASE_BRANCH_SCALE_RANGE,
    evaluatePlacement,
    rotatePlacement(next, rotation) {
      const local = inverse.clone().multiply(rotation).multiply(basis).multiply(localBaseBranchRotation(next));
      return { ...next, ...baseBranchRotationFields(next, local) };
    },
  };
}
