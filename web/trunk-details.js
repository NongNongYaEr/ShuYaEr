// Explicit surface features on one structural branch. Coordinates belong to
// the unrolled transported section frame; they never create skeleton mounts.
import {normalizeTrunkDetailProfile,createTrunkDetailProfileSampler} from './trunk-detail-profile.js';
const TAU = Math.PI * 2;
const ANGLE_BINS = 128;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const number = (v, a, b, fallback) => v !== null && v !== '' && Number.isFinite(Number(v))
  ? clamp(Number(v), a, b) : fallback;
const safeId = (v, fallback) => typeof v === 'string' ? v.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 128) || fallback : fallback;
const degrees = v => (v % 360 + 360) % 360;
const radians = v => v * Math.PI / 180;
const wrap = v => Math.atan2(Math.sin(v), Math.cos(v));
const fade = q => { const u = clamp(1 - q, 0, 1); return u * u * (3 - 2 * u); };

export const TRUNK_DETAIL_TYPES = Object.freeze(['GROOVE', 'RIDGE', 'KNOT', 'SCAR', 'FLARE', 'WRINKLE']);
export const TRUNK_DETAIL_LIMIT = 128;
export const TRUNK_DETAIL_PATH_LIMIT = 128;
export const TRUNK_DETAIL_SIZE_LIMITS = Object.freeze({width:Object.freeze([1,180]),height:Object.freeze([.001,1])});
export const TRUNK_DETAIL_DEFAULTS = Object.freeze({
  GROOVE: Object.freeze({ strength: .22, width: 24, height: .65 }),
  RIDGE: Object.freeze({ strength: .2, width: 30, height: .65 }),
  KNOT: Object.freeze({ strength: .32, width: 60, height: .16 }),
  SCAR: Object.freeze({ strength: .2, width: 44, height: .22 }),
  FLARE: Object.freeze({ strength: .28, width: 100, height: .28 }),
  WRINKLE: Object.freeze({ strength: .09, width: 110, height: .25 }),
});

export function normalizeTrunkDetail(raw, index = 0) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !TRUNK_DETAIL_TYPES.includes(raw.type)) return null;
  const defaults = TRUNK_DETAIL_DEFAULTS[raw.type];
  const path = [];
  for (const point of (Array.isArray(raw.path) ? raw.path : []).slice(0, TRUNK_DETAIL_PATH_LIMIT)) {
    if (!point || typeof point !== 'object' || Array.isArray(point)) continue;
    const normalized = { t: number(point.t, 0, 1, .5), angle: degrees(number(point.angle, -36000, 36000, 0)),
      pressure: number(point.pressure, 0, 1, 1) };
    const previous = path.at(-1);
    if (previous && Math.abs(previous.t - normalized.t) < 1e-8
      && Math.abs(wrap(radians(previous.angle - normalized.angle))) < 1e-8) {
      previous.pressure = normalized.pressure;
    } else path.push(normalized);
  }
  const profile=normalizeTrunkDetailProfile(raw.profile);
  return { id: safeId(raw.id, `DETAIL_${index + 1}`), type: raw.type, enabled: raw.enabled !== false,
    strength: number(raw.strength, 0, 1, defaults.strength), t: number(raw.t, 0, 1, .5),
    angle: degrees(number(raw.angle, -36000, 36000, 0)),
    width: number(raw.width, ...TRUNK_DETAIL_SIZE_LIMITS.width, defaults.width), height: number(raw.height, ...TRUNK_DETAIL_SIZE_LIMITS.height, defaults.height),
    seed: Math.round(number(raw.seed, 0, 2147483647, 1)), path, ...(profile?{profile}:{}) };
}

export function normalizeTrunkDetails(raw) {
  const seen = new Set(), details = [];
  for (const [index, item] of (Array.isArray(raw) ? raw : []).slice(0, TRUNK_DETAIL_LIMIT).entries()) {
    const detail = normalizeTrunkDetail(item, index);
    if (!detail || seen.has(detail.id)) continue;
    seen.add(detail.id); details.push(detail);
  }
  return details;
}

export function createTrunkDetailId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `DETAIL_${uuid ? uuid.replaceAll('-', '') : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`}`;
}

export function createTrunkDetail(type = 'GROOVE', patch = {}) {
  return normalizeTrunkDetail({ type, id: createTrunkDetailId(), ...patch });
}

function compileDetail(detail) {
  const points = detail.path.length ? detail.path : [{ t: detail.t, angle: detail.angle, pressure: 1 }];
  const halfT = detail.height / 2, halfA = radians(detail.width / 2), segments = [];
  for (let i = 0; i < Math.max(1, points.length - 1); i++) {
    const a = points[i], b = points[Math.min(i + 1, points.length - 1)];
    const angle = radians(a.angle), dt = (b.t - a.t) / halfT, da = wrap(radians(b.angle) - angle) / halfA;
    // Conservative support bins discard distant angles before the expensive
    // periodic closest-segment calculation. The original distance/envelope
    // math and addition order are preserved for every possible contribution.
    const angularBins = new Uint8Array(ANGLE_BINS), center = angle + da * halfA / 2;
    const extent = Math.abs(da * halfA) / 2 + halfA + TAU / ANGLE_BINS / 2 + 1e-12;
    for (let bin = 0; bin < ANGLE_BINS; bin++) if (extent >= Math.PI || Math.abs(wrap((bin + .5) * TAU / ANGLE_BINS - center)) <= extent) angularBins[bin] = 1;
    segments.push({ t: a.t, angle, dt, da, denom: dt * dt + da * da, length:Math.hypot(dt,da), angularBins,
      pressure: a.pressure, pressureDelta: b.pressure - a.pressure,
      low: Math.min(a.t, b.t) - halfT, high: Math.max(a.t, b.t) + halfT });
  }
  const bins = Array.from({ length: 65 }, () => []);
  for (const segment of segments) {
    const start = Math.max(0, Math.floor(segment.low * 64)), end = Math.min(64, Math.ceil(segment.high * 64));
    for (let i = start; i <= end; i++) bins[i].push(segment);
  }
  return { ...detail, halfT, halfA, bins, profileAt:detail.profile?createTrunkDetailProfileSampler(detail.profile):null, phase: detail.seed * .7548776662466927 % TAU };
}

function closestPoint(detail, t, angle, angleBin) {
  let best = Infinity, result = null;
  for (const segment of detail.bins[Math.min(64, Math.floor(t * 64))]) {
    if (t < segment.low || t > segment.high || angleBin !== null && !segment.angularBins[angleBin]) continue;
    const x = (t - segment.t) / detail.halfT, y = wrap(angle - segment.angle) / detail.halfA;
    const u = segment.denom ? clamp((x * segment.dt + y * segment.da) / segment.denom, 0, 1) : 0;
    const dx = x - segment.dt * u, dy = y - segment.da * u, distance = dx * dx + dy * dy;
    if (distance < best && distance < 1) {
      best = distance; result = { distance, x: dx, y: dy, cross:detail.profileAt?(segment.length?(segment.dt*dy-segment.da*dx)/segment.length:dy):0,
        pressure: segment.pressure + segment.pressureDelta * u };
    }
  }
  return result;
}

function displacement(detail, sample, t, angle) {
  const envelope = fade(sample.distance), q = Math.sqrt(sample.distance), strength = detail.strength * sample.pressure;
  if(detail.profileAt){
    // Transverse profile is exact in the middle of the stroke and fades at its
    // rounded ends. Ratio preserves zero displacement at the support boundary.
    return strength*detail.profileAt(sample.cross)*Math.min(1,envelope/Math.max(1e-12,fade(sample.cross*sample.cross)));
  }
  switch (detail.type) {
    case 'GROOVE': return strength * envelope * (-1 + .18 * Math.pow(Math.abs(sample.y), 2));
    case 'RIDGE': return strength * envelope;
    case 'KNOT': return strength * envelope * (1 + .12 * Math.cos(q * Math.PI * 4 + detail.phase) * q);
    case 'SCAR': return strength * envelope * (-.7 + 1.6 * Math.sin(q * Math.PI));
    case 'FLARE': return strength * envelope * (1 - .12 * sample.x);
    case 'WRINKLE': return strength * envelope * (.7 * Math.sin((t - detail.t) / detail.height * TAU * 5 + detail.phase)
      + .3 * Math.sin(sample.y * Math.PI * 3 + detail.phase * 1.7));
    default: return 0;
  }
}

/** Capture the type's centre cross section only when the user first edits it. */
export function defaultTrunkDetailProfile(raw) {
  const detail=normalizeTrunkDetail(raw);if(!detail)return null;
  const compiled=compileDetail({...detail,profile:undefined,strength:1});
  return normalizeTrunkDetailProfile({version:1,interpolation:'SMOOTH',points:Array.from({length:17},(_,i)=>{
    const x=-1+i/8,y=i===0||i===16?0:clamp(displacement(compiled,{distance:x*x,x:0,y:x,pressure:1},detail.t,radians(detail.angle)),-1,1);
    return{x,y};
  })});
}

/** Compile once per mesh/preview. Layer contributions add to one bounded
 * radial field, rather than multiplying overlaps into spikes or inversions. */
export function createTrunkDetailSampler(raw) {
  const details = normalizeTrunkDetails(raw).filter(detail => detail.enabled && detail.strength > 0).map(compileDetail);
  const bins = Array.from({ length: 65 }, (_, index) => details.filter(detail => detail.bins[index].length));
  return (t, angle) => {
    if (!Number.isFinite(t) || !Number.isFinite(angle)) return 1;
    t = clamp(t, 0, 1); let delta = 0;
    // Extreme public inputs retain the trigonometric periodic reduction of
    // the old evaluator; binning is used only in the accurate modulo range.
    const angleBin = Math.abs(angle) <= TAU * 10000 ? Math.min(ANGLE_BINS - 1, Math.floor(((angle % TAU + TAU) % TAU) / TAU * ANGLE_BINS)) : null;
    for (const detail of bins[Math.min(64, Math.floor(t * 64))]) {
      const sample = closestPoint(detail, t, angle, angleBin);
      if (sample) delta += displacement(detail, sample, t, angle);
    }
    return clamp(1 + delta, .12, 4);
  };
}

/** The same coordinates used by UI pick markers, never skeleton positions. */
export function trunkDetailAnchors(raw) {
  const detail = normalizeTrunkDetail(raw);
  return detail ? (detail.path.length ? detail.path : [{ t: detail.t, angle: detail.angle, pressure: 1 }]).map(point => ({ ...point })) : [];
}
