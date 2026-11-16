import * as THREE from './vendor/three.module.min.js';
import { baseBranchAnchor, baseBranchAnchorFrame, baseBranchGeometry, baseBranchGuidePoints, baseBranchUnitMatrix } from './base-branch-assembly.js';
import { sameBaseBranchTopology } from './plant-unit-data.js';

const surfaceIndices = new WeakMap();
const axisNames = ['x', 'y', 'z'];
const leafFaceCount = 12;
const unitForward = new THREE.Vector3(0, 1, 0);
const finite = vector => [vector?.x, vector?.y, vector?.z].every(Number.isFinite);

function buildSurfaceIndex(base) {
  const geometry = baseBranchGeometry({ base });
  const positions = geometry.attributes.position.array;
  const normals = geometry.attributes.normal.array;
  const indices = geometry.index.array;
  geometry.dispose();
  const triangle = new THREE.Triangle(), faces = [];
  function load(face, target) {
    target.a.fromArray(positions, indices[face * 3] * 3);
    target.b.fromArray(positions, indices[face * 3 + 1] * 3);
    target.c.fromArray(positions, indices[face * 3 + 2] * 3);
  }
  for (let face = 0; face < indices.length / 3; face++) {
    load(face, triangle);
    if (!(triangle.getArea() > 0)) continue;
    const box = new THREE.Box3().setFromPoints([triangle.a, triangle.b, triangle.c]);
    faces.push({ face, box, center: box.getCenter(new THREE.Vector3()) });
  }
  function build(items) {
    const box = new THREE.Box3();
    for (const item of items) box.union(item.box);
    if (items.length <= leafFaceCount) return { box, faces: items.map(item => item.face) };
    const size = box.getSize(new THREE.Vector3());
    const axis = axisNames.reduce((largest, name) => size[name] > size[largest] ? name : largest);
    items.sort((a, b) => a.center[axis] - b.center[axis]);
    const mid = items.length >> 1;
    return { box, left: build(items.slice(0, mid)), right: build(items.slice(mid)) };
  }
  return { tree: faces.length ? build(faces) : null, load, indices, normals };
}

// Share the calibrated wood index across assemblies. Queries arrive in displayed metres.
export function createBaseBranchSurfaceProjector(assembly) {
  if (!surfaceIndices.has(assembly.base)) surfaceIndices.set(assembly.base, buildSurfaceIndex(assembly.base));
  const { tree, load, indices, normals } = surfaceIndices.get(assembly.base);
  const triangle = new THREE.Triangle(), nearestPoint = new THREE.Vector3(), bestPoint = new THREE.Vector3();
  const weight = new THREE.Vector3(), shaded = new THREE.Vector3(), vertex = new THREE.Vector3();
  const boundsPoint = new THREE.Vector3(), sourcePoint = new THREE.Vector3();
  const scale = assembly.scale ?? 1;
  const surfaceRay = new THREE.Ray(), rayPoint = new THREE.Vector3();

  function readNormal(face, barycentric) {
    const offset = face * 3;
    shaded.fromArray(normals, indices[offset] * 3).multiplyScalar(barycentric.x)
      .addScaledVector(vertex.fromArray(normals, indices[offset + 1] * 3), barycentric.y)
      .addScaledVector(vertex.fromArray(normals, indices[offset + 2] * 3), barycentric.z);
    if (shaded.lengthSq() < 1e-12) triangle.getNormal(shaded);
    else shaded.normalize();
    return shaded;
  }
  function acceptsNormal(face, normal, minNormalDot) {
    return Boolean(triangle.getBarycoord(nearestPoint, weight) && readNormal(face, weight).dot(normal) >= minNormalDot);
  }
  function nearest(point, { normal = null, maxDistance = Infinity, minNormalDot = .15 } = {}) {
    if (!tree || !finite(point) || !(maxDistance >= 0)) return null;
    const desired = finite(normal) && normal.lengthSq() > 1e-12 ? normal.clone().normalize() : null;
    sourcePoint.copy(point).divideScalar(scale);
    let best = (maxDistance / scale) ** 2, bestFace = -1;
    const distance = node => node.box.clampPoint(sourcePoint, boundsPoint).distanceToSquared(sourcePoint);
    function visit(node, lowerBound) {
      if (lowerBound > best) return;
      if (node.faces) {
        for (const face of node.faces) {
          load(face, triangle);
          triangle.closestPointToPoint(sourcePoint, nearestPoint);
          const squared = nearestPoint.distanceToSquared(sourcePoint);
          if (squared > best || (squared === best && bestFace >= 0 && face >= bestFace)) continue;
          if (desired && !acceptsNormal(face, desired, minNormalDot)) continue;
          best = squared;
          bestFace = face;
          bestPoint.copy(nearestPoint);
        }
        return;
      }
      const leftDistance = distance(node.left), rightDistance = distance(node.right);
      if (leftDistance <= rightDistance) {
        visit(node.left, leftDistance);
        visit(node.right, rightDistance);
      } else {
        visit(node.right, rightDistance);
        visit(node.left, leftDistance);
      }
    }
    visit(tree, distance(tree));
    return bestFace < 0 ? null : baseBranchAnchor(assembly, bestFace, bestPoint.multiplyScalar(scale));
  }
  function raycast(ray, { side = THREE.DoubleSide, withNormal = false } = {}) {
    if (!tree) return null;
    surfaceRay.origin.copy(ray.origin).divideScalar(scale);
    surfaceRay.direction.copy(ray.direction);
    let best = Infinity, bestFace = -1;
    function entry(node) {
      if (node.box.containsPoint(surfaceRay.origin)) return 0;
      return surfaceRay.intersectBox(node.box, rayPoint) ? rayPoint.distanceToSquared(surfaceRay.origin) : Infinity;
    }
    function visit(node, lowerBound) {
      if (lowerBound === Infinity || lowerBound > best) return;
      if (node.faces) {
        for (const face of node.faces) {
          load(face, triangle);
          const { a, b, c } = triangle;
          const hit = side === THREE.BackSide ? surfaceRay.intersectTriangle(c, b, a, true, rayPoint)
            : surfaceRay.intersectTriangle(a, b, c, side === THREE.FrontSide, rayPoint);
          if (!hit) continue;
          const squared = hit.distanceToSquared(surfaceRay.origin);
          if (squared > best || (squared === best && bestFace >= 0 && face >= bestFace)) continue;
          best = squared;
          bestFace = face;
          bestPoint.copy(hit);
        }
        return;
      }
      const left = entry(node.left), right = entry(node.right);
      if (left <= right) { visit(node.left, left); visit(node.right, right); }
      else { visit(node.right, right); visit(node.left, left); }
    }
    visit(tree, entry(tree));
    if (bestFace < 0) return null;
    const point = bestPoint.clone().multiplyScalar(scale);
    const anchor = baseBranchAnchor(assembly, bestFace, point);
    if (!anchor) return null;
    if (!withNormal) return { anchor, point };
    load(bestFace, triangle);
    return { anchor, point, normal: readNormal(bestFace, weight.fromArray(anchor.barycentric)).clone() };
  }
  return { nearest, raycast };
}

function createGuideSampler(assembly) {
  const points = baseBranchGuidePoints(assembly);
  const stations = [0];
  for (let i = 1; i < points.length; i++) stations.push(stations.at(-1) + points[i - 1].distanceTo(points[i]));
  const length = stations.at(-1);
  return {
    length,
    sample(t) {
      const target = t * length;
      let i = 1;
      while (i < stations.length - 1 && stations[i] < target) i++;
      const fraction = (target - stations[i - 1]) / (stations[i] - stations[i - 1]);
      return {
        center: points[i - 1].clone().lerp(points[i], fraction),
        tangent: points[i].clone().sub(points[i - 1]).normalize(),
      };
    },
  };
}

function validAnchorFrame(assembly, placement) {
  const weights = placement.barycentric;
  if (!Array.isArray(weights) || weights.length !== 3 || weights.some(value => !Number.isFinite(value) || value < -1e-6 || value > 1 + 1e-6)
    || Math.abs(weights[0] + weights[1] + weights[2] - 1) > 1e-5) return null;
  const frame = baseBranchAnchorFrame(assembly, placement);
  if (!finite(frame?.position) || !finite(frame.normal) || frame.normal.lengthSq() < .5) return null;
  return baseBranchAnchor(assembly, placement.face, frame.position) ? frame : null;
}

function sameNormalizedWood(previous, next) {
  if (previous.base === next.base) return true;
  const a = previous.base.geometry, b = next.base.geometry;
  return a.position.length === b.position.length && a.index.length === b.index.length
    && a.index.every((value, index) => value === b.index[index])
    && a.position.every((value, index) => Math.abs(value - b.position[index]) <= 1e-10);
}

function sameVariantSurface(previous, next) {
  const a = previous.base, b = next.base;
  const from = a.variant_from, to = b.variant_from;
  if (!from?.topology && !to?.topology) return false;
  if (from?.topology && to?.topology && from.topology !== to.topology) return false;
  if ((from?.root_id || a.id) !== (to?.root_id || b.id)) return false;
  const sameKit = previous.pack_id && previous.pack_id === next.pack_id;
  const originalKit = from?.pack_id || previous.pack_id;
  return Boolean((sameKit || originalKit && originalKit === (to?.pack_id || next.pack_id)) && sameBaseBranchTopology(a, b));
}

const sourceName = unit => unit.name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

// Keep the source identity within a kit. Across kits, migrate only an unambiguous
// name and role pair; generated IDs from unrelated kits can coincide.
export function rehangBaseBranchPlacements(previous, next) {
  const sameWood = sameNormalizedWood(previous, next);
  const sameVariant = sameVariantSurface(previous, next);
  const exact = sameWood || sameVariant;
  const sameTip = sameWood && previous.base.tip.every((value, axis) => Math.abs(value - next.base.tip[axis]) <= 1e-10);
  const sizeRatio = next.base.size_m / previous.base.size_m;
  const scaledGuide = sameTip ? previous.guide.map(point => point.map(value => value * sizeRatio)) : null;
  const guide = scaledGuide?.every((point, index) => !index || Math.hypot(...point.map((value, axis) => value - scaledGuide[index - 1][axis])) >= 1e-5)
    ? scaledGuide : next.guide;
  const target = guide === next.guide ? next : { ...next, guide };
  const oldGuide = exact ? null : createGuideSampler(previous);
  const newGuide = exact ? null : createGuideSampler(target);
  const projector = exact ? null : createBaseBranchSurfaceProjector(target);
  const oldUnits = new Map(previous.units.map(unit => [unit.id, unit]));
  const newUnits = new Map(target.units.map(unit => [unit.id, unit]));
  const sameKit = sameVariant || Boolean(previous.pack_id && previous.pack_id === target.pack_id);
  const placements = [], unmatched = [];
  for (const placement of previous.placements) {
    const unit = oldUnits.get(placement.unit_id);
    if (!unit) { unmatched.push({ id: placement.id, reason: '原挂件素材已缺失' }); continue; }
    let replacement = sameKit ? newUnits.get(unit.id) : null;
    if (replacement && replacement.role !== unit.role) {
      unmatched.push({ id: placement.id, reason: `「${unit.name}」的素材类型已变更` });
      continue;
    }
    if (!replacement) {
      const name = sourceName(unit);
      const candidates = target.units.filter(candidate => candidate.role === unit.role && sourceName(candidate) === name);
      if (candidates.length === 1) [replacement] = candidates;
    }
    if (!replacement) {
      unmatched.push({ id: placement.id, reason: `找不到与「${unit.name}」同名同类的唯一素材` });
      continue;
    }
    const frame = validAnchorFrame(previous, placement);
    if (!frame) { unmatched.push({ id: placement.id, reason: '原挂点已失效' }); continue; }
    let anchor = { face: placement.face, barycentric: placement.barycentric.slice() };
    if (!exact) {
      const oldStation = oldGuide.sample(frame.t), newStation = newGuide.sample(frame.t);
      const transport = new THREE.Quaternion().setFromUnitVectors(oldStation.tangent, newStation.tangent);
      const outward = frame.position.clone().sub(oldStation.center).applyQuaternion(transport)
        .multiplyScalar(newGuide.length / oldGuide.length);
      const maxDistance = Math.max(.0005, Math.min(newGuide.length * .08, newGuide.length * .025 + outward.length() * .5));
      anchor = projector.nearest(newStation.center.clone().add(outward), {
        normal: frame.normal.clone().applyQuaternion(transport),
        maxDistance,
        minNormalDot: .3,
      });
      const newFrame = anchor && validAnchorFrame(target, anchor);
      const stationTolerance = Math.max(.06, 2 * maxDistance / newGuide.length);
      if (!newFrame || Math.abs(newFrame.t - frame.t) > stationTolerance) anchor = null;
    } else if (!validAnchorFrame(target, anchor)) anchor = null;
    if (!anchor) {
      unmatched.push({ id: placement.id, reason: `「${unit.name}」附近找不到对应的枝面` });
      continue;
    }
    placements.push({ ...placement, ...anchor, unit_id: replacement.id,
      ...(placement.rotation ? { rotation: placement.rotation.slice() } : {}) });
  }
  return { placements, unmatched, guide, exactCount: exact ? placements.length : 0 };
}

export function inspectBaseBranchPlacements(assembly) {
  const units = new Map(assembly.units.map(unit => [unit.id, unit]));
  const poses = [], issues = [];
  for (const placement of assembly.placements) {
    const unit = units.get(placement.unit_id);
    if (!unit) { issues.push({ id: placement.id, reason: '素材引用缺失' }); continue; }
    const frame = validAnchorFrame(assembly, placement);
    if (!frame) { issues.push({ id: placement.id, reason: '枝面挂点已失效' }); continue; }
    const direction = unitForward.clone().transformDirection(baseBranchUnitMatrix(assembly, unit, placement, frame));
    const overlap = poses.find(pose => pose.point.distanceToSquared(frame.position) < .008 ** 2 && pose.direction.dot(direction) > .94);
    if (overlap) issues.push({ id: placement.id, other: overlap.id, reason: '挂点与朝向近似重叠' });
    poses.push({ id: placement.id, point: frame.position, direction });
  }
  return issues;
}
