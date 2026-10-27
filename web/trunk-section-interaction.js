import * as THREE from './vendor/three.module.min.js';

// Pointer math stays independent of DOM, authoring and the rendered handle
// objects. Points and rings are in the carrier's local space; pointer/rect
// values are browser client coordinates. None of the inputs are mutated.
const TAU = Math.PI * 2;
const EPSILON = 1e-10;
const identity = new THREE.Matrix4();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = value => Number.isFinite(value);

function vector(value, fallback) {
  const result = value?.isVector3 ? value.clone() : Array.isArray(value) ? new THREE.Vector3(...value) : null;
  return result && result.toArray().every(finite) ? result : fallback?.clone() || null;
}

function pointerPosition(point) {
  const x = point?.x ?? point?.clientX, y = point?.y ?? point?.clientY;
  return finite(x) && finite(y) ? { x, y } : null;
}

function validRect(rect) {
  return rect && [rect.left, rect.top, rect.width, rect.height].every(finite) && rect.width > 0 && rect.height > 0;
}

function validMatrix(matrix) {
  return matrix?.isMatrix4 && matrix.elements.every(finite) && Math.abs(matrix.determinant()) > EPSILON;
}

function frame(ring) {
  const center = vector(ring?.center), x = vector(ring?.rolledX || ring?.x), y = vector(ring?.rolledY || ring?.y);
  if (!center || !x || !y || x.lengthSq() < EPSILON || y.lengthSq() < EPSILON) return null;
  x.normalize(); y.addScaledVector(x, -y.dot(x));
  if (y.lengthSq() < EPSILON) return null;
  y.normalize();
  const normal = new THREE.Vector3().crossVectors(x, y).normalize();
  return { center, x, y, normal };
}

function rayFor(point, camera, rect) {
  const pointer = pointerPosition(point);
  if (!pointer || !validRect(rect) || !(camera?.isPerspectiveCamera || camera?.isOrthographicCamera)) return null;
  const caster = new THREE.Raycaster();
  caster.setFromCamera(new THREE.Vector2((pointer.x - rect.left) / rect.width * 2 - 1,
    1 - (pointer.y - rect.top) / rect.height * 2), camera);
  return caster.ray;
}

/** Project a local carrier point to client coordinates. w is retained for
 * perspective-correct interpolation when sliding along a curved branch. */
export function screenPointOnSection(point, camera, worldMatrix, rect) {
  const local = vector(point), matrix = worldMatrix || identity;
  if (!local || !validRect(rect) || !validMatrix(matrix) || !camera?.projectionMatrix || !camera?.matrixWorldInverse) return null;
  const clip = new THREE.Vector4(local.x, local.y, local.z, 1).applyMatrix4(matrix)
    .applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  if (![clip.x, clip.y, clip.z, clip.w].every(finite) || Math.abs(clip.w) < EPSILON) return null;
  return { x: rect.left + (clip.x / clip.w + 1) * rect.width / 2,
    y: rect.top + (1 - clip.y / clip.w) * rect.height / 2,
    z: clip.z / clip.w, w: clip.w };
}

/** Continuous visual section between evaluated rings. Surface points follow
 * the actual rendered triangle strips; frame slerp avoids zero-length axes
 * when two sampled orientations are opposite. No skin is regenerated here. */
export function interpolateSectionRing(rings, t, positions, options = {}) {
  if (!Array.isArray(rings) || !rings.length || !finite(t) || !Number.isInteger(positions?.count) ||
    positions.itemSize < 3 || !['getX', 'getY', 'getZ'].every(name => typeof positions[name] === 'function')) return null;
  const count = rings[0]?.count;
  if (!Number.isInteger(count) || count < 3 || count > 4096) return null;
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    if (!finite(r?.t) || i && r.t <= rings[i - 1].t || r.count !== count ||
      !Number.isInteger(r.offset) || r.offset < 0 || r.offset + count > positions.count) return null;
  }
  const value = clamp(t, rings[0].t, rings.at(-1).t);
  let low = 0, high = rings.length - 1;
  while (low < high) { const middle = (low + high) >> 1; if (rings[middle].t < value) low = middle + 1; else high = middle; }
  const index = Math.max(0, low - 1);
  const a = rings[index], b = rings[Math.min(index + 1, rings.length - 1)];
  const u = a === b ? 0 : (value - a.t) / (b.t - a.t);
  const pointAt = side => {
    if (!Number.isInteger(side) || side < 0 || side >= count) return null;
    const p = new THREE.Vector3().fromBufferAttribute(positions, a.offset + side)
      .lerp(new THREE.Vector3().fromBufferAttribute(positions, b.offset + side), u);
    return p.toArray().every(finite) ? p : null;
  };
  // Marker placement needs two angular vertices, not an entire dense ring.
  // The normal API still validates and returns the complete outline.
  const points = options.points === false ? null : [];
  if (points) for (let side = 0; side < count; side++) { const p = pointAt(side); if (!p) return null; points.push(p); }
  const skin = points ? { points } : { pointAt };
  if (u === 0 || u === 1) {
    const r = u === 1 ? b : a, result = { ...r, ...skin };
    for (const key of ['center', 'tangent', 'x', 'y', 'rolledX', 'rolledY']) {
      const v = vector(r[key]); if (!v) return null; result[key] = v.toArray();
    }
    return result;
  }
  const rotation = (r, rolled) => {
    const x = vector(rolled ? r.rolledX || r.x : r.x), y = vector(rolled ? r.rolledY || r.y : r.y);
    if (!x || !y || x.lengthSq() < EPSILON || y.lengthSq() < EPSILON) return null;
    x.normalize(); y.addScaledVector(x, -y.dot(x)); if (y.lengthSq() < EPSILON) return null; y.normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)));
  };
  const qa = rotation(a, false), qb = rotation(b, false), ca = vector(a.center), cb = vector(b.center);
  if (!qa || !qb || !ca || !cb) return null;
  const q = qa.slerp(qb, u), x = new THREE.Vector3(1, 0, 0).applyQuaternion(q),
    y = new THREE.Vector3(0, 1, 0).applyQuaternion(q), tangent = new THREE.Vector3().crossVectors(x, y).normalize();
  const scalar = (key, fallback) => finite(a[key]) && finite(b[key]) ? THREE.MathUtils.lerp(a[key], b[key], u) : fallback;
  const roll = scalar('roll', 0); let rolledX;
  if (finite(a.roll) && finite(b.roll)) rolledX = x.clone().applyAxisAngle(tangent, roll);
  else {
    const ra = rotation(a, true), rb = rotation(b, true); if (!ra || !rb) return null;
    rolledX = new THREE.Vector3(1, 0, 0).applyQuaternion(ra.slerp(rb, u));
    rolledX.addScaledVector(tangent, -rolledX.dot(tangent)); if (rolledX.lengthSq() < EPSILON) return null; rolledX.normalize();
  }
  return { ...a, t: value, count, center: ca.lerp(cb, u).toArray(), tangent: tangent.toArray(), x: x.toArray(), y: y.toArray(),
    rolledX: rolledX.toArray(), rolledY: new THREE.Vector3().crossVectors(tangent, rolledX).normalize().toArray(),
    localRadius: scalar('localRadius', 1), ovalX: scalar('ovalX', 1), ovalY: scalar('ovalY', 1), roll,
    angleOffset: scalar('angleOffset', 0), ...skin };
}

/** Closest continuous point on the projected, evaluated centerline. nearT
 * limits the local search during a drag, preventing a jump to another branch
 * segment at a screen-space crossing. Pass the current result each move. */
export function projectSectionPosition(rings, point, camera, worldMatrix, rect, options = {}) {
  const pointer = pointerPosition(point);
  if (!pointer || !Array.isArray(rings) || !rings.length) return null;
  const near = finite(options.nearT) ? options.nearT : null;
  const window = finite(options.searchWindow) ? Math.max(0, options.searchWindow) : .2;
  const minT = Math.max(0, finite(options.minT) ? options.minT : 0, near === null ? 0 : near - window);
  const maxT = Math.min(1, finite(options.maxT) ? options.maxT : 1, near === null ? 1 : near + window);
  const maxDistance = finite(options.maxScreenDistance) ? Math.max(0, options.maxScreenDistance) : Infinity;
  if (minT > maxT) return null;
  let best = null;
  const consider = (local, t, index, alpha) => {
    const screen = screenPointOnSection(local, camera, worldMatrix, rect);
    if (!screen || screen.w <= EPSILON || screen.z < -1 || screen.z > 1) return;
    const distance = Math.hypot(screen.x - pointer.x, screen.y - pointer.y);
    if (distance > maxDistance || best && (distance > best.distance + 1e-7 ||
      Math.abs(distance - best.distance) <= 1e-7 && near !== null && Math.abs(t - near) >= Math.abs(best.t - near))) return;
    best = { t, point: local.clone(), distance, index, alpha };
  };
  for (let index = 0; index < rings.length - 1; index++) {
    const a = rings[index], b = rings[index + 1], pa = vector(a?.center), pb = vector(b?.center);
    if (!pa || !pb || !finite(a.t) || !finite(b.t) || b.t <= a.t || b.t < minT || a.t > maxT) continue;
    const span = b.t - a.t, start = clamp((minT - a.t) / span, 0, 1), end = clamp((maxT - a.t) / span, 0, 1);
    const localA = pa.clone().lerp(pb, start), localB = pa.clone().lerp(pb, end);
    const screenA = screenPointOnSection(localA, camera, worldMatrix, rect), screenB = screenPointOnSection(localB, camera, worldMatrix, rect);
    // Do not slide onto a segment behind the camera or crossing its near plane.
    // Such a projection would create an unbounded segment near the camera.
    if (!screenA || !screenB || screenA.w <= EPSILON || screenB.w <= EPSILON ||
      screenA.z < -1 || screenB.z < -1 || screenA.z > 1 || screenB.z > 1) continue;
    const dx = screenB.x - screenA.x, dy = screenB.y - screenA.y, lengthSq = dx * dx + dy * dy;
    let screenAlpha;
    if (lengthSq < EPSILON) screenAlpha = near === null ? 0 : clamp((near - a.t) / span - start, 0, end - start) / Math.max(EPSILON, end - start);
    else screenAlpha = clamp(((pointer.x - screenA.x) * dx + (pointer.y - screenA.y) * dy) / lengthSq, 0, 1);
    // Screen interpolation is not linear in local/world t under perspective.
    const denominator = (1 - screenAlpha) * screenB.w + screenAlpha * screenA.w;
    const localAlpha = denominator > EPSILON ? screenAlpha * screenA.w / denominator : screenAlpha;
    const alpha = start + (end - start) * localAlpha;
    consider(pa.clone().lerp(pb, alpha), a.t + span * alpha, index, alpha);
  }
  if (rings.length === 1 && finite(rings[0]?.t) && rings[0].t >= minT && rings[0].t <= maxT) {
    const local = vector(rings[0].center); if (local) consider(local, rings[0].t, 0, 0);
  }
  return best;
}

/** Ray intersection with the actual curved section plane, in local space.
 * Grazing views return null instead of huge, unstable coordinates. */
export function sectionPlanePoint(ring, point, camera, worldMatrix, rect, options = {}) {
  const basis = frame(ring), matrix = worldMatrix || identity, ray = rayFor(point, camera, rect);
  if (!basis || !ray || !validMatrix(matrix)) return null;
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(basis.normal, basis.center).applyMatrix4(matrix);
  const minFacing = finite(options.minFacing) ? Math.max(EPSILON, options.minFacing) : .06;
  const centerRay = rayFor(screenPointOnSection(basis.center, camera, matrix, rect), camera, rect);
  if (!centerRay || Math.abs(centerRay.direction.dot(plane.normal)) < minFacing || Math.abs(ray.direction.dot(plane.normal)) < minFacing) return null;
  const world = ray.intersectPlane(plane, new THREE.Vector3());
  if (!world) return null;
  const local = world.applyMatrix4(matrix.clone().invert());
  const screen = screenPointOnSection(local, camera, matrix, rect);
  return local.toArray().every(finite) && screen && screen.w > EPSILON && screen.z >= -1 && screen.z <= 1 ? local : null;
}

/** Corrected coordinates on an existing ring, useful for contour dragging.
 * x/y are in base-radius units, including the actual ring's oval and roll. */
export function sectionPlaneCoordinates(ring, localPoint) {
  const basis = frame(ring), point = vector(localPoint), radius = ring?.localRadius;
  const ovalX = ring?.ovalX ?? 1, ovalY = ring?.ovalY ?? 1;
  if (!basis || !point || !finite(radius) || radius <= EPSILON || !finite(ovalX) || ovalX <= EPSILON || !finite(ovalY) || ovalY <= EPSILON) return null;
  const offset = point.sub(basis.center);
  return { x: offset.dot(basis.x) / (radius * ovalX), y: offset.dot(basis.y) / (radius * ovalY) };
}

/** Shortest signed delta; use successive deltas to accumulate a twist drag
 * across the ±π seam. Both values are radians. */
export function signedAngleDelta(from, to) {
  if (!finite(from) || !finite(to)) return 0;
  return ((to - from + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

/** A fixed ring plus a fixed mode for the duration of the twist gesture avoids
 * discontinuities. Edge-on views fall back to a client-space rotation ring. */
export function sectionPointerAngle(ring, point, camera, worldMatrix, rect, options = {}) {
  const basis = frame(ring), pointer = pointerPosition(point);
  if (!basis || !pointer) return null;
  if (options.mode !== 'screen') {
    const local = sectionPlanePoint(ring, point, camera, worldMatrix, rect, options);
    if (local) {
      const offset = local.sub(basis.center);
      const x = offset.dot(basis.x) / (options.correctOval ? ring.ovalX || 1 : 1);
      const y = offset.dot(basis.y) / (options.correctOval ? ring.ovalY || 1 : 1);
      if (Math.hypot(x, y) > EPSILON) return { angle: Math.atan2(y, x), mode: 'plane' };
    }
    if (options.mode === 'plane') return null;
  }
  const center = screenPointOnSection(basis.center, camera, worldMatrix, rect);
  if (!center || center.w <= EPSILON) return null;
  const dx = pointer.x - center.x, dy = center.y - pointer.y;
  return Math.hypot(dx, dy) > .5 ? { angle: Math.atan2(dy, dx), mode: 'screen' } : null;
}

/** Fixed-angle contour control point. baseScale is the radial surface factor
 * with this editable profile's contribution removed, so grabbing a point
 * leaves its current radius unchanged rather than counting bark/root detail
 * twice. The caller can use a 2D section window when the plane is edge-on. */
export function profilePointerRadius(ring, point, camera, worldMatrix, rect, options = {}) {
  const angle = options.angle ?? 0, baseScale = options.baseScale ?? 1;
  if (!finite(angle) || !finite(baseScale) || baseScale <= EPSILON) return null;
  const local = sectionPlanePoint(ring, point, camera, worldMatrix, rect, options);
  const coordinates = local && sectionPlaneCoordinates(ring, local);
  if (!coordinates) return null;
  const value = (coordinates.x * Math.cos(angle) + coordinates.y * Math.sin(angle)) / baseScale;
  const min = finite(options.min) ? options.min : .2, max = finite(options.max) ? options.max : 3;
  return finite(value) && min <= max ? clamp(value, min, max) : null;
}
