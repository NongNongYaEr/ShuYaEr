import * as THREE from 'three';

const EPSILON = 1e-10;
const clamp = value => Math.max(0, Math.min(1, value));
const finite = Number.isFinite;

function vector(value) {
  const result = value?.isVector3 ? value.clone()
    : Array.isArray(value) && value.length === 3 ? new THREE.Vector3(...value) : null;
  return result?.toArray().every(finite) ? result : null;
}

function validatedRings(rings) {
  if (!Array.isArray(rings) || !rings.length) return null;
  const result = [];
  for (const ring of rings) {
    const center = vector(ring?.center);
    if (!center || !finite(ring.t) || result.length && ring.t <= result.at(-1).t) return null;
    result.push({ t: ring.t, center, offset: ring.offset, count: ring.count });
  }
  return result;
}

function closestCenterlinePosition(rings, point) {
  let best = { distance: Infinity, t: rings[0].t };
  for (let i = 0; i < rings.length; i++) {
    const a = rings[i], b = rings[i + 1];
    const axis = b ? b.center.clone().sub(a.center) : null;
    const lengthSq = axis?.lengthSq() || 0;
    const alpha = lengthSq > EPSILON ? clamp(point.clone().sub(a.center).dot(axis) / lengthSq) : 0;
    const projected = b ? a.center.clone().lerp(b.center, alpha) : a.center;
    const distance = point.distanceToSquared(projected);
    if (distance < best.distance) best = { distance, t: a.t + (b ? b.t - a.t : 0) * alpha };
  }
  return finite(best.distance) ? clamp(best.t) : null;
}

function surfaceRingOwners(rings, indices, positions, surface) {
  // Overlapping/missing vertex ranges cannot identify a skin band safely.
  let end = 0;
  for (const ring of rings) {
    if (!Number.isInteger(ring.offset) || !Number.isInteger(ring.count) || ring.offset < end ||
      ring.offset < 0 || ring.count < 3 || ring.offset + ring.count > positions.count) return null;
    end = ring.offset + ring.count;
  }
  const owners = indices.map(index => surface?.version===1&&index>=surface.seamOffset&&index<surface.seamOffset+rings.length?index-surface.seamOffset:rings.findIndex(r => index >= r.offset && index < r.offset + r.count));
  if (owners.includes(-1)) return null;
  const min = Math.min(...owners), max = Math.max(...owners);
  return max - min === 1 ? owners : null;
}

/** Resolve a ray hit on the carrier skin to its continuous along-branch t.
 * Adjacent sampled surface rings provide exact triangle interpolation even
 * where the branch crosses itself in the camera view. Caps and other geometry
 * use a local 3D centerline projection, never a screen-space nearest segment.
 * The hit, mesh matrices, ring metadata and geometry remain unchanged. */
export function sectionPositionFromSurfaceHit(rings, hit, mesh) {
  const samples = validatedRings(rings), worldPoint = vector(hit?.point), matrix = mesh?.matrixWorld;
  if (!samples || !worldPoint || !matrix?.isMatrix4 || !matrix.elements.every(finite) ||
    Math.abs(matrix.determinant()) <= EPSILON || hit.object && hit.object !== mesh) return null;
  const point = worldPoint.applyMatrix4(matrix.clone().invert());
  if (!point.toArray().every(finite)) return null;
  const face = hit.face, positions = mesh.geometry?.getAttribute?.('position');
  if (!face || !positions) return closestCenterlinePosition(samples, point);
  const indices = [face.a, face.b, face.c];
  if (positions.itemSize < 3 || !Number.isInteger(positions.count) || indices.some(index =>
    !Number.isInteger(index) || index < 0 || index >= positions.count) || new Set(indices).size < 3) return null;
  const vertices = indices.map(index => new THREE.Vector3().fromBufferAttribute(positions, index));
  if (vertices.some(vertex => !vertex.toArray().every(finite))) return null;
  const triangle = new THREE.Triangle(...vertices), normal = triangle.getNormal(new THREE.Vector3());
  if (normal.lengthSq() < EPSILON) return null;
  const size = Math.max(...vertices.map(vertex => vertex.distanceTo(vertices[0])));
  const planeError = Math.abs(normal.dot(point.clone().sub(vertices[0])));
  const weights = triangle.getBarycoord(point, new THREE.Vector3());
  // An invalid face/point pair must not silently place a section elsewhere.
  if (!weights || planeError > Math.max(1e-7, size * 1e-6) || weights.toArray().some(value =>
    !finite(value) || value < -1e-6 || value > 1 + 1e-6)) return null;
  const owners = surfaceRingOwners(samples, indices, positions,mesh.geometry.userData.barkSurface);
  if (!owners) return closestCenterlinePosition(samples, point);
  return clamp(weights.toArray().reduce((sum, weight, i) => sum + weight * samples[owners[i]].t, 0));
}
