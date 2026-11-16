import * as THREE from './vendor/three.module.min.js';
import { normalizePlantBaseBranch, normalizePlantUnit } from './plant-unit-data.js';
import { normalizeLeafMaterial } from './leaf-material-data.js';
import { sealImmutableJson } from './immutable-json.js';

export const BASE_BRANCH_GUIDE = 'BASE_BRANCH_GUIDE';
export const BASE_BRANCH_SCALE_RANGE = [.05, 8];
export const hasBaseBranchAtlas = assembly => Boolean(assembly?.material?.color || assembly?.material?.normal);
const maxPlacements = 256;
const maxGuidePoints = 32;
const finitePoint = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const clamp = THREE.MathUtils.clamp;
const up = new THREE.Vector3(0, 1, 0);
const sources = new WeakMap();
const wood = new WeakMap();
const normalizedUnitLists = new WeakSet();
const normalizedGuides = new WeakSet();
const stationCache = new WeakMap();
const unitReaches = new WeakMap();

function placementRotation(value) {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isFinite)) return null;
  const length = Math.hypot(...value);
  if (!(length > 1e-10) || !Number.isFinite(length)) return null;
  const normalized = value.map(component => component / (value[3] < 0 ? -length : length));
  return Math.hypot(...normalized.slice(0, 3)) > 1e-10 ? normalized : null;
}

function normalizedSource(raw, normalize) {
  if (!raw || typeof raw !== 'object') throw Error('基础枝组装缺少素材');
  if (!sources.has(raw)) {
    const value = normalize(raw);
    sealImmutableJson(value);
    sources.set(raw, value);
    sources.set(value, value);
  }
  return sources.get(raw);
}

function readWood(base) {
  if (wood.has(base)) return wood.get(base);
  const { geometry, size_m: size } = base;
  const positions = new Float32Array(geometry.position.length);
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = geometry.position[i + 1] * size;
    positions[i + 1] = -geometry.position[i] * size;
    positions[i + 2] = geometry.position[i + 2] * size;
    if (geometry.normal) {
      normals[i] = geometry.normal[i + 1];
      normals[i + 1] = -geometry.normal[i];
      normals[i + 2] = geometry.normal[i + 2];
    }
  }
  if (!geometry.normal) {
    const surface = new THREE.BufferGeometry();
    surface.setIndex(geometry.index);
    surface.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    surface.computeVertexNormals();
    normals.set(surface.attributes.normal.array);
    surface.dispose();
  }
  const value = { positions, normals, uv: new Float32Array(geometry.uv), index: geometry.index };
  wood.set(base, value);
  return value;
}

export function baseBranchGeometry(assembly) {
  const { positions, normals, uv, index } = readWood(assembly.base);
  const geometry = new THREE.BufferGeometry();
  const scale = assembly.scale ?? 1;
  const scaledPositions = scale === 1 ? positions.slice() : positions.map(value => value * scale);
  geometry.setAttribute('position', new THREE.BufferAttribute(scaledPositions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals.slice(), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv.slice(), 2));
  geometry.setIndex(index.slice());
  return geometry;
}

function initialGuide(base) {
  const size = base.size_m;
  const main = base.shape_guides?.[0]?.points;
  if (main) {
    const count = Math.min(main.length, maxGuidePoints);
    const layout = Array.from({length: count}, (_, i) => {
      const [x, y, z] = main[Math.round(i * (main.length - 1) / (count - 1))];
      return [y * size, -x * size, z * size];
    });
    if (layout.every((point, i) => !i || Math.hypot(...point.map((value, axis) => value - layout[i - 1][axis])) >= 1e-5)) return layout;
  }
  const end = [base.tip[1] * size, -base.tip[0] * size, base.tip[2] * size];
  const { positions } = readWood(base);
  const guide = [[0, 0, 0]];
  for (const t of [.25, .5, .75]) {
    const x = end[0] * t, band = end[0] * .08;
    let count = 0, y = 0, z = 0;
    for (let i = 0; i < positions.length; i += 3) {
      if (Math.abs(positions[i] - x) > band) continue;
      count++;
      y += positions[i + 1];
      z += positions[i + 2];
    }
    guide.push([x, count ? y / count : end[1] * t, count ? z / count : end[2] * t]);
  }
  guide.push(end);
  return guide;
}

export function createBaseBranchAssembly(pack, baseId) {
  const rawBase = pack?.base_branches?.find(item => item.id === baseId);
  if (!rawBase) throw Error('请选择套装里的基础枝');
  const base = normalizedSource(rawBase, normalizePlantBaseBranch);
  return normalizeBaseBranchAssembly({
    version: 1, base, guide: initialGuide(base), units: pack.units,
    material: pack.material, placements: [], pack_id: pack.id, pack_name: pack.name, revision: pack.revision,
  });
}

export function normalizeBaseBranchAssembly(raw) {
  if (raw == null) return null;
  if (raw.version !== 1 || !Array.isArray(raw.guide) || raw.guide.length < 2
    || raw.guide.length > maxGuidePoints || !raw.guide.every(finitePoint)
    || !Array.isArray(raw.units) || raw.units.length > 64 || !Array.isArray(raw.placements)
    || raw.placements.length > maxPlacements) throw Error('基础枝组装数据无效');
  const base = normalizedSource(raw.base, normalizePlantBaseBranch);
  const units = normalizedUnitLists.has(raw.units) ? raw.units : raw.units.map(unit => normalizedSource(unit, normalizePlantUnit));
  const unitIds = new Set(units.map(unit => unit.id));
  if (unitIds.size !== units.length) throw Error('基础枝装配的叶花果素材 ID 重复');
  if (!normalizedUnitLists.has(units)) {
    sealImmutableJson(units);
    normalizedUnitLists.add(units);
  }
  const ids = new Set();
  const placements = raw.placements.map(item => {
    if (typeof item.id !== 'string' || !item.id || item.id.length > 160 || ids.has(item.id)
      || !unitIds.has(item.unit_id) || !Number.isInteger(item.face) || item.face < 0 || item.face >= base.geometry.index.length / 3
      || !finitePoint(item.barycentric) || item.barycentric.some(weight => weight < -1e-6 || weight > 1 + 1e-6)) {
      throw Error('基础枝叶花果挂点无效');
    }
    const sum = item.barycentric.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 1e-5) throw Error('基础枝挂点重心坐标无效');
    ids.add(item.id);
    const rotation = placementRotation(item.rotation);
    return { id: item.id, unit_id: item.unit_id, face: item.face, barycentric: item.barycentric.slice(),
      roll: Number.isFinite(item.roll) ? item.roll % 360 : 0,
      scale: Number.isFinite(item.scale) ? clamp(item.scale, ...BASE_BRANCH_SCALE_RANGE) : 1,
      ...(rotation ? { rotation } : {}),
      automatic: item.automatic === true };
  });
  let guide = raw.guide;
  if (!normalizedGuides.has(guide)) {
    guide = raw.guide.map(point => point.slice());
    for (let i = 1; i < guide.length; i++) {
      if (Math.hypot(...guide[i].map((coordinate, axis) => coordinate - guide[i - 1][axis])) < 1e-5) throw Error('相邻导向点不能重合');
    }
    sealImmutableJson(guide);
    normalizedGuides.add(guide);
  }
  const scale = Number.isFinite(raw.scale) ? clamp(raw.scale, ...BASE_BRANCH_SCALE_RANGE) : 1;
  return { version: 1, base, guide, units, placements, ...(scale !== 1 ? { scale } : {}), material: normalizeLeafMaterial(raw.material),
    pack_id: String(raw.pack_id || '').slice(0, 160), pack_name: String(raw.pack_name || '').slice(0, 160),
    revision: Math.max(1, Math.trunc(Number(raw.revision) || 1)) };
}

export function baseBranchWoodSize(assembly) {
  return assembly.base.size_m * (assembly.scale ?? 1);
}

export function baseBranchGuidePoints(assembly) {
  const scale = assembly.scale ?? 1;
  return assembly.guide.map(point => new THREE.Vector3(...point).multiplyScalar(scale));
}

function guideStations(assembly) {
  const guide = assembly.guide, scale = assembly.scale ?? 1;
  const cached = stationCache.get(guide);
  if (cached?.scale === scale) return cached.stations;
  const points = baseBranchGuidePoints(assembly);
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances.at(-1) + points[i].distanceTo(points[i - 1]));
  const stations = { points, distances, length: distances.at(-1) };
  if (normalizedGuides.has(guide)) stationCache.set(guide, { scale, stations });
  return stations;
}

export function baseBranchShape(assembly) {
  const { points, distances, length } = guideStations(assembly);
  const radius = Math.max(.001, Math.min(.2, assembly.base.size_m * .035)) * (assembly.scale ?? 1);
  return { branches: [{ id: BASE_BRANCH_GUIDE, parent: '', attach: 0, points: points.map(point => point.toArray()),
    knots: points.map(point => point.toArray()), sample_times: distances.map(distance => distance / length),
    length, start_radius: radius, end_radius: radius * .35 }],
  connector: { position: [0, 0, 0], direction: [1, 0, 0], locked: true } };
}

function triangleAt(assembly, face, triangle) {
  const { positions, index } = readWood(assembly.base);
  if (!Number.isInteger(face) || face < 0 || face * 3 + 2 >= index.length) return null;
  const scale = assembly.scale ?? 1;
  triangle.a.fromArray(positions, index[face * 3] * 3).multiplyScalar(scale);
  triangle.b.fromArray(positions, index[face * 3 + 1] * 3).multiplyScalar(scale);
  triangle.c.fromArray(positions, index[face * 3 + 2] * 3).multiplyScalar(scale);
  return triangle;
}

export function baseBranchAnchor(assembly, face, point) {
  const triangle = triangleAt(assembly, face, new THREE.Triangle());
  if (!triangle) return null;
  const position = Array.isArray(point) ? new THREE.Vector3(...point) : point;
  const bary = triangle.getBarycoord(position, new THREE.Vector3());
  if (!bary) return null;
  bary.clampScalar(0, 1);
  const sum = bary.x + bary.y + bary.z;
  return sum > 1e-6 ? { face, barycentric: bary.multiplyScalar(1 / sum).toArray() } : null;
}

function nearestBaseBranchAnchor(assembly, point) {
  const triangle = new THREE.Triangle(), nearest = new THREE.Vector3(), position = new THREE.Vector3();
  const { index } = readWood(assembly.base);
  let best = Infinity, bestFace = -1;
  for (let face = 0; face < index.length / 3; face++) {
    triangleAt(assembly, face, triangle).closestPointToPoint(point, nearest);
    const distance = point.distanceToSquared(nearest);
    if (distance < best) { best = distance; bestFace = face; position.copy(nearest); }
  }
  return baseBranchAnchor(assembly, bestFace, position);
}

export function baseBranchAnchorFrame(assembly, anchor) {
  const triangle = triangleAt(assembly, anchor.face, new THREE.Triangle());
  if (!triangle) return null;
  const [a, b, c] = anchor.barycentric;
  const position = triangle.a.clone().multiplyScalar(a).addScaledVector(triangle.b, b).addScaledVector(triangle.c, c);
  const { normals, index } = readWood(assembly.base);
  const offset = anchor.face * 3;
  const normal = new THREE.Vector3().fromArray(normals, index[offset] * 3).multiplyScalar(a);
  const vertexNormal = new THREE.Vector3();
  normal.addScaledVector(vertexNormal.fromArray(normals, index[offset + 1] * 3), b)
    .addScaledVector(vertexNormal.fromArray(normals, index[offset + 2] * 3), c);
  if (normal.lengthSq() < 1e-8) triangle.getNormal(normal);
  else normal.normalize();
  const { points, distances, length } = guideStations(assembly);
  const target = new THREE.Vector3(), line = new THREE.Line3();
  let closest = Infinity, t = 0, tangent = new THREE.Vector3(1, 0, 0);
  for (let i = 1; i < points.length; i++) {
    line.set(points[i - 1], points[i]);
    const param = line.closestPointToPointParameter(position, true);
    const distance = line.at(param, target).distanceToSquared(position);
    if (distance >= closest) continue;
    closest = distance;
    t = (distances[i - 1] + (distances[i] - distances[i - 1]) * param) / length;
    tangent = line.delta(new THREE.Vector3()).normalize();
  }
  return { position, normal, tangent, t, guideLength: length };
}

export function baseBranchFrameOrientation(frame) {
  const along = frame.normal.clone().multiplyScalar(.7).addScaledVector(frame.tangent, .3).normalize();
  return new THREE.Quaternion().setFromUnitVectors(up, along);
}

export function baseBranchUnitReach(geometry) {
  if (!unitReaches.has(geometry)) {
    let reach = .001;
    for (let i = 1; i < geometry.position.length; i += 3) reach = Math.max(reach, geometry.position[i]);
    unitReaches.set(geometry, reach);
  }
  return unitReaches.get(geometry);
}

export function baseBranchUnitMatrix(assembly, unit, placement, frame = baseBranchAnchorFrame(assembly, placement)) {
  if (!frame) return null;
  const orientation = baseBranchFrameOrientation(frame);
  if (placement.rotation) orientation.multiply(new THREE.Quaternion(...placement.rotation));
  orientation.multiply(new THREE.Quaternion().setFromAxisAngle(up, THREE.MathUtils.degToRad(placement.roll)));
  const size = unit.size_m * placement.scale * (assembly.scale ?? 1);
  return new THREE.Matrix4().compose(frame.position, orientation, new THREE.Vector3().setScalar(size));
}

// A typed G uses metres along the editable guide. Transport the attachment's
// side of the branch to the new station and snap it back to the original mesh.
export function createBaseBranchGuideSlide(assembly, frame) {
  const { points, distances, length } = guideStations(assembly);
  function station(distance) {
    let i = 1;
    while (i < distances.length - 1 && distances[i] < distance) i++;
    const t = (distance - distances[i - 1]) / (distances[i] - distances[i - 1]);
    return { center: points[i - 1].clone().lerp(points[i], t), tangent: points[i].clone().sub(points[i - 1]).normalize() };
  }
  const start = frame.t * length, first = station(start);
  const offset = frame.position.clone().sub(first.center);
  offset.addScaledVector(first.tangent, -offset.dot(first.tangent));
  const radial = offset.clone();
  if (radial.lengthSq() < 1e-10) radial.copy(frame.normal).addScaledVector(first.tangent, -frame.normal.dot(first.tangent));
  const radius = offset.length(), triangle = new THREE.Triangle(), hit = new THREE.Vector3(), target = new THREE.Vector3(), ray = new THREE.Ray();
  const faceCount = assembly.base.geometry.index.length / 3;
  let lastMetres = null, result = null;
  return metres => {
    if (metres === lastMetres) return result;
    const distance = clamp(start + metres, 0, length);
    lastMetres = metres;
    if (Math.abs(distance - start) < 1e-9) return result = null;
    const next = station(distance);
    const transport = new THREE.Quaternion().setFromUnitVectors(first.tangent, next.tangent);
    ray.set(next.center, radial.clone().applyQuaternion(transport).normalize());
    // Intersect the new cross-section first, so the signed distance stays
    // on the requested guide station where the mesh surrounds that station.
    let bestFace = -1, best = Infinity;
    for (let face = 0; face < faceCount; face++) {
      triangleAt(assembly, face, triangle);
      if (!ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit)) continue;
      const error = Math.abs(hit.distanceTo(next.center) - radius);
      if (error < best) { best = error; bestFace = face; target.copy(hit); }
    }
    const maxError = Math.max(radius * .75, baseBranchWoodSize(assembly) * .08);
    return result = (best <= maxError && baseBranchAnchor(assembly, bestFace, target))
      || nearestBaseBranchAnchor(assembly, next.center.add(offset.clone().applyQuaternion(transport)));
  };
}

export function distributeBaseBranchUnits(assembly, { unitIds, count, start = .15, end = .95, clearExisting = true }) {
  const available = new Set(assembly.units.map(unit => unit.id));
  const chosen = [...new Set(unitIds)].filter(id => available.has(id));
  if (!chosen.length) throw Error('请先选择用于排布的叶花果');
  if (!(start >= 0 && start < end && end <= 1)) throw Error('排布的起点必须小于终点');
  const placements = clearExisting ? assembly.placements.filter(item => !item.automatic) : assembly.placements.slice();
  const capacity = maxPlacements - placements.length;
  if (!capacity) throw Error('基础枝挂件数量已到上限');
  if (!Number.isFinite(count) || count < 1) throw Error('请输入有效的排布数量');
  const n = Math.min(capacity, Math.trunc(count));
  const geometry = baseBranchGeometry(assembly);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material), ray = new THREE.Raycaster();
  const { points, distances, length } = guideStations(assembly);
  const normal = new THREE.Vector3(), radial = new THREE.Vector3(), axis = new THREE.Vector3(), origin = new THREE.Vector3();
  try {
    for (let j = 0; j < n; j++) {
      const distance = (start + (end - start) * (j + .5) / n) * length;
      let i = 1;
      while (i < distances.length - 1 && distances[i] < distance) i++;
      const t = (distance - distances[i - 1]) / (distances[i] - distances[i - 1]);
      origin.copy(points[i - 1]).lerp(points[i], t);
      axis.subVectors(points[i], points[i - 1]).normalize();
      normal.set(0, 0, 1);
      if (Math.abs(normal.dot(axis)) > .9) normal.set(0, 1, 0);
      radial.crossVectors(axis, normal).normalize().applyAxisAngle(axis, j * 2.399963229728653);
      ray.set(origin, radial);
      ray.far = Math.max(.03, baseBranchWoodSize(assembly) * .3);
      const hit = ray.intersectObject(mesh, false)[0];
      let anchor = hit && baseBranchAnchor(assembly, hit.faceIndex, hit.point);
      if (!anchor) anchor = nearestBaseBranchAnchor(assembly, origin);
      if (anchor) placements.push({ id: 'BASE_UNIT_' + crypto.randomUUID(), unit_id: chosen[j % chosen.length],
        ...anchor, roll: 0, scale: 1, automatic: true });
    }
  } finally {
    geometry.dispose();
    material.dispose();
  }
  return placements;
}
