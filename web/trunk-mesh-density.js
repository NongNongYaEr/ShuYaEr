import { normalizeTrunkDetails } from './trunk-details.js';
import {axisTime,axisTimes} from './branch-axis.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const number = (v, a, b, fallback) => v !== null && v !== '' && Number.isFinite(Number(v))
  ? clamp(Number(v), a, b) : fallback;
const EPS = 1e-7;
// Bounded per carrier, independent of camera, render LOD and export profile.
export const TRUNK_MESH_VERTEX_LIMIT = 250000;
export const TRUNK_MESH_PRESETS = Object.freeze({
  COARSE: Object.freeze({ radial_segments: 64, segment_length: .16, detail_samples: 8 }),
  STANDARD: Object.freeze({ radial_segments: 128, segment_length: .08, detail_samples: 12 }),
  FINE: Object.freeze({ radial_segments: 192, segment_length: .04, detail_samples: 16 }),
});

export function normalizeTrunkMeshSettings(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1) return null;
  return { version: 1,
    radial_segments: Math.round(number(raw.radial_segments, 64, 512, 128)),
    segment_length: number(raw.segment_length, .005, 2, .08),
    detail_samples: Math.round(number(raw.detail_samples, 8, 24, 12)),
    adaptive_details: raw.adaptive_details !== false };
}

export function createTrunkMeshPreset(name = 'STANDARD') {
  return normalizeTrunkMeshSettings({ version: 1, ...(TRUNK_MESH_PRESETS[name] || TRUNK_MESH_PRESETS.STANDARD) });
}

function unique(values) {
  return values.sort((a, b) => a - b).filter((v, i, all) => !i || v - all[i - 1] > EPS);
}

function sampleAxis(seeds, ranges, end, maxCount, priority = []) {
  let keys = unique([0, end, ...seeds, ...ranges.flatMap(r => [r.start, r.end])]
    .filter(Number.isFinite).map(v => clamp(v, 0, end)));
  keys[keys.length - 1] = end;
  let limited = keys.length > maxCount;
  if (limited) {
    const required=unique([0,end,...priority].filter(Number.isFinite).map(v=>clamp(v,0,end)))
      .map(v=>keys.find(k=>Math.abs(k-v)<=EPS)??v);
    if(required.length<=maxCount){
      const optional=keys.filter(k=>!required.some(v=>Math.abs(k-v)<=EPS)),slots=maxCount-required.length;
      const chosen=slots?Array.from({length:slots},(_,i)=>optional[Math.round((slots===1?.5:i/(slots-1))*(optional.length-1))]).filter(Number.isFinite):[];
      keys=unique([...required,...chosen]);
    }else keys=Array.from({length:maxCount},(_,i)=>required[Math.round(i*(required.length-1)/(maxCount-1))]);
  }
  const spans = keys.slice(1).map((b, i) => {
    const a = keys[i], middle = (a + b) / 2;
    let step = end;
    for (const r of ranges) if (middle >= r.start && middle <= r.end) step = Math.min(step, r.step);
    return { a, b, step: Math.max(EPS, step) };
  });
  const subdivisions = (r, scale) => Math.max(1, Math.ceil((r.b - r.a) / (r.step * scale) - 1e-9));
  const count = scale => 1 + spans.reduce((sum, r) => sum + subdivisions(r, scale), 0);
  let scale = 1;
  if (count(scale) > maxCount) {
    limited = true; let low = 1, high = 2;
    while (count(high) > maxCount) high *= 2;
    for (let i = 0; i < 32; i++) { const mid = (low + high) / 2; if (count(mid) > maxCount) low = mid; else high = mid; }
    scale = high;
  }
  const values = [keys[0]];
  for (const { a, b, step } of spans) {
    const n = subdivisions({a,b,step},scale);
    for (let i = 1; i <= n; i++) values.push(i === n ? b : a + (b - a) * i / n);
  }
  return { values, limited };
}

function angularRange(ranges, start, end, step) {
  if (end - start >= TAU) { ranges.push({ start: 0, end: TAU, step }); return; }
  const a = (start % TAU + TAU) % TAU, b = a + end - start;
  ranges.push({ start: a, end: Math.min(b, TAU), step });
  if (b > TAU) ranges.push({ start: 0, end: b - TAU, step });
}

/** Extra rings refine the existing carrier polyline; they do not add bones or
 * move mounts. All rings share the same ordered angular grid, so detail patches
 * and the periodic seam stay closed without T junctions. Angular refinement
 * runs through the carrier; axial refinement stays in the detail's support.
 * The original transported frame grid is deliberately NOT an input to modify.
 */
export function createTrunkMeshSampling(branch, rawMesh, rawDetails, seedTs, options = {}) {
  const mesh = normalizeTrunkMeshSettings(rawMesh);
  if (!mesh) return null;
  const ts = [...seedTs], angles = Array.from({ length: mesh.radial_segments }, (_, i) => i * TAU / mesh.radial_segments);
  for(const angle of options.seedAngles||[])if(Number.isFinite(angle))angles.push((angle%TAU+TAU)%TAU);
  const axial = [{ start: 0, end: 1, step: 1 / 64 }];
  const angular = [{ start: 0, end: TAU, step: TAU / mesh.radial_segments }];
  const points = branch.points, n = Math.max(1, points.length - 1);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const length = Math.hypot((b.x ?? b[0]) - (a.x ?? a[0]), (b.y ?? b[1]) - (a.y ?? a[1]), (b.z ?? b[2]) - (a.z ?? a[2]));
    const start=axisTime(points,i),end=axisTime(points,i+1);
    ts.push(start,end);
    if (length > EPS) axial.push({ start,end,step:axisTimes(points)?mesh.segment_length/length*(end-start):mesh.segment_length/length/n });
  }
  const details = mesh.adaptive_details ? normalizeTrunkDetails(rawDetails).filter(d => d.enabled && d.strength > 0) : [];
  for (const d of details) {
    const path = d.path.length ? d.path : [{ t: d.t, angle: d.angle }];
    const low = Math.min(...path.map(p => p.t)), high = Math.max(...path.map(p => p.t));
    ts.push(...path.map(p => p.t));
    // A wrinkle has five axial waves and three angular waves. A scar/knot
    // needs extra samples for its hollow centre and raised rim.
    const profileCycles=d.profile?Math.min(50,Math.ceil(1/Math.min(...d.profile.points.slice(1).map((p,i)=>p.x-d.profile.points[i].x)))):0;
    const axialCycles = profileCycles|| (d.type === 'WRINKLE' ? 5 : ['SCAR', 'KNOT'].includes(d.type) ? 2 : 1);
    const angularCycles = profileCycles|| (d.type === 'WRINKLE' ? 3 : ['SCAR', 'KNOT'].includes(d.type) ? 2 : 1);
    axial.push({ start: clamp(low - d.height / 2, 0, 1), end: clamp(high + d.height / 2, 0, 1),
      step: d.height / (mesh.detail_samples * axialCycles) });
    let previous = path[0].angle * Math.PI / 180, min = previous, max = previous;
    for (const p of path) {
      const value = p.angle * Math.PI / 180;
      previous += Math.atan2(Math.sin(value - previous), Math.cos(value - previous));
      min = Math.min(min, previous); max = Math.max(max, previous);
      angles.push((value % TAU + TAU) % TAU);
    }
    const width = d.width * Math.PI / 180;
    angularRange(angular, min - width / 2, max + width / 2, width / (mesh.detail_samples * angularCycles));
  }
  const vertexLimit = Number.isFinite(options.vertexLimit) ? Math.max(8192, Math.min(TRUNK_MESH_VERTEX_LIMIT, Math.floor(options.vertexLimit))) : TRUNK_MESH_VERTEX_LIMIT;
  const seam = options.continuousBark ? 1 : 0;
  const around = sampleAxis(angles, angular, TAU, Math.min(1025, Math.floor((vertexLimit - 2-65*seam) / (65+2*seam)) + 1));
  around.values.pop(); // one shared periodic vertex, no geometric crack
  const along = sampleAxis(ts, axial, 1, Math.max(65, Math.min(4097, Math.floor((vertexLimit - 2-around.values.length*2*seam) / (around.values.length+seam)))), options.priorityTs);
  return { angles: around.values, ts: along.values,
    info: { version: 1, settings: mesh, radial_samples: around.values.length, rings: along.values.length,
      adaptive_detail_count: details.length, limited: around.limited || along.limited,
      vertex_limit: vertexLimit, ...(vertexLimit < TRUNK_MESH_VERTEX_LIMIT ? { interactive_preview: true } : {}) } };
}

/** Find the actual bracketing samples for a contour/marker, including a
 * nonuniform refined angular grid. Legacy uniform rings keep their old math. */
export function trunkRingAngleSegment(ring, angle) {
  const value = ((angle - (ring.angleOffset || 0)) % TAU + TAU) % TAU;
  const angles = ring.sampleAngles;
  if (!angles?.length) { const u = value / TAU * ring.count, i = Math.floor(u); return { i, next: (i + 1) % ring.count, u: u - i }; }
  let low = 0, high = angles.length;
  while (low < high) { const mid = (low + high) >> 1; if (angles[mid] <= value) low = mid + 1; else high = mid; }
  const i = Math.max(0, low - 1), next = (i + 1) % angles.length;
  const end = next === 0 ? TAU : angles[next];
  return { i, next, u: clamp((value - angles[i]) / (end - angles[i]), 0, 1) };
}

export function trunkMeshStats(geometry) {
  const rings = geometry?.userData.radiusRings, p = geometry?.getAttribute('position');
  if (!rings?.length || !p) return null;
  let axial = 0, around = 0;
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    if (i) axial = Math.max(axial, Math.hypot(...r.center.map((v, k) => v - rings[i - 1].center[k])));
    for (let j = 0; j < r.count; j++) {
      const a = r.offset + j, b = r.offset + (j + 1) % r.count;
      around = Math.max(around, Math.hypot(p.getX(a) - p.getX(b), p.getY(a) - p.getY(b), p.getZ(a) - p.getZ(b)));
    }
  }
  return { rings: rings.length, radial_samples: rings[0].count, vertices: p.count,
    triangles: geometry.index?.count / 3 || p.count / 3, max_axial_spacing: axial, max_around_spacing: around,
    limited: geometry.userData.trunkMeshSampling?.limited || false };
}
