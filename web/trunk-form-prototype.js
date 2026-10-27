import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const presets = {
  GROOVED: { grooveDepth: .64, bulgeStrength: .18, rootFlare: .3, buttressStrength: .25 },
  BUTTRESS: { grooveDepth: .3, bulgeStrength: .12, rootFlare: .26, buttressStrength: 1.9 },
  REFINED: { grooveDepth: .48, bulgeStrength: .22, rootFlare: .34, buttressStrength: .72 },
};
export const TRUNK_FORM_PROTOTYPE_PRESETS = Object.freeze(Object.fromEntries(
  Object.entries(presets).map(([key, value]) => [key, Object.freeze(value)])));

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const angleDistance = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const gaussian = value => Math.exp(-.5 * value * value);
const decay = (t, height, power = 2) => Math.pow(Math.max(0, 1 - t / height), power);
function random(seed) {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let v = state; v = Math.imul(v ^ v >>> 15, v | 1); v ^= v + Math.imul(v ^ v >>> 7, v | 61); return ((v ^ v >>> 14) >>> 0) / 4294967296; };
}
function positive(value, fallback, name) {
  const result = finite(value, fallback);
  if (!(result > 0)) throw new RangeError(`${name} must be positive`);
  return result;
}
function normalize(options) {
  const mode = Object.hasOwn(presets, options.mode) ? options.mode : 'GROOVED';
  const preset = presets[mode], rng = random(finite(options.seed, 1));
  const height = positive(options.height, 5, 'height'), baseRadius = positive(options.baseRadius, .45, 'baseRadius');
  const rootHeight = clamp(finite(options.rootHeight, .3), .04, .65);
  const ridgeCount = Math.round(clamp(finite(options.ridgeCount, 11), 2, 24));
  const ridges = Array.from({ length: ridgeCount }, (_, i) => ({
    angle: TAU * (i + (rng() - .5) * .28) / ridgeCount,
    width: TAU / ridgeCount * (.16 + rng() * .105),
    strength: .72 + rng() * .28, phase: rng() * TAU,
  }));
  const rawBulges = options.bulges ?? Array.from({ length: 7 }, () => ({
    height: .12 + rng() * .77, angle: rng() * TAU, width: .22 + rng() * .45,
    heightWidth: .035 + rng() * .06, strength: .65 + rng() * .75,
  }));
  const rawButtresses = options.buttresses ?? Array.from({ length: 4 }, (_, i) => ({
    angle: TAU * (i + (rng() - .5) * .32) / 4,
    width: .095 + rng() * .09, height: rootHeight * (.78 + rng() * .35),
    strength: .58 + rng() * .55, curve: (rng() - .5) * .27,
  }));
  if (!Array.isArray(rawBulges) || !Array.isArray(rawButtresses)) throw new TypeError('bulges and buttresses must be arrays');
  const parameters = {
    mode, height, baseRadius, tipRadius: positive(options.tipRadius, baseRadius * .34, 'tipRadius'),
    radialSegments: Math.round(clamp(finite(options.radialSegments, 128), 12, 256)),
    heightSegments: Math.round(clamp(finite(options.heightSegments, 96), 8, 256)),
    taper: clamp(finite(options.taper, .88), .25, 3),
    grooveDepth: clamp(finite(options.grooveDepth, preset.grooveDepth), 0, .86), ridgeCount,
    twist: clamp(finite(options.twist, .45), -Math.PI * 2, Math.PI * 2),
    asymmetry: clamp(finite(options.asymmetry, .12), 0, .3),
    roughness: clamp(finite(options.roughness, .014), 0, .06),
    bulgeStrength: clamp(finite(options.bulgeStrength, preset.bulgeStrength), 0, 1),
    rootFlare: clamp(finite(options.rootFlare, preset.rootFlare), 0, 2), rootHeight,
    buttressStrength: clamp(finite(options.buttressStrength, preset.buttressStrength), 0, 4),
    lean: [clamp(finite(options.lean?.[0], .035), -.3, .3), clamp(finite(options.lean?.[1], -.018), -.3, .3)],
    // Saved parameters contain the generated bulges/buttresses, so restoring
    // them consumes fewer random numbers. Keep the original shape phase instead
    // of changing the silhouette on the first slider edit or reset.
    seed: finite(options.seed, 1) >>> 0, phase: finite(options.phase, rng() * TAU),
    bulges: rawBulges.slice(0, 48).map(b => Object.freeze({
      height: clamp(finite(b?.height, .5), 0, 1), angle: finite(b?.angle, 0),
      width: clamp(finite(b?.width, .3), .06, 1.5), heightWidth: clamp(finite(b?.heightWidth, .08), .012, .35),
      strength: clamp(finite(b?.strength, 1), 0, 3),
    })),
    buttresses: rawButtresses.slice(0, 16).map(b => Object.freeze({
      angle: finite(b?.angle, 0), width: clamp(finite(b?.width, .14), .045, .9),
      height: clamp(finite(b?.height, rootHeight), .025, .8),
      strength: clamp(finite(b?.strength, 1), 0, 3), curve: clamp(finite(b?.curve, 0), -.8, .8),
    })),
  };
  for (const key of ['lean', 'bulges', 'buttresses']) Object.freeze(parameters[key]);
  return { parameters: Object.freeze(parameters), ridges };
}

/**
 * Independent Z-up, metre-scale trunk study. Every height section is a positive
 * polar outline around one axis; buttresses are part of that skin, never tubes
 * intersecting a cylinder. This topology cannot make holes, overhangs, or several
 * trunks merging together. It changes no existing branch/source/PVE contract.
 * Angular values are radians; bulge/buttress heights are fractions of height.
 */
export function createTrunkFormPrototype(options = {}) {
  const { parameters: p, ridges } = normalize(options);
  const centerAt = t => new THREE.Vector3(
    p.height * p.lean[0] * (t * t + .12 * Math.sin(Math.PI * t)),
    p.height * p.lean[1] * (t * t + .1 * Math.sin(TAU * t)), p.height * t);
  const coreRadius = t => THREE.MathUtils.lerp(p.baseRadius, p.tipRadius, Math.pow(t, p.taper));
  function sampleRadius(t, theta) {
    t = clamp(finite(t, 0), 0, 1); theta = finite(theta, 0);
    const phase = theta - p.twist * t;
    const asymmetry = 1 + p.asymmetry * (.7 * Math.sin(phase + p.phase) + .3 * Math.cos(phase * 2 - p.phase));
    let grooves = 0;
    for (const ridge of ridges) {
      const drift = .045 * Math.sin(TAU * t + ridge.phase);
      const width = ridge.width * (1 + .18 * Math.sin(t * Math.PI + ridge.phase));
      grooves += ridge.strength * (.83 + .17 * Math.sin(t * 5 + ridge.phase)) * gaussian(angleDistance(phase, ridge.angle + drift) / width);
    }
    let radius = coreRadius(t) * asymmetry * (1 - p.grooveDepth * Math.min(1, grooves));
    radius *= 1 + p.roughness * Math.sin(theta * 23 + t * 31 + p.phase) * Math.sin(theta * 7 - t * 17);
    for (const bulge of p.bulges) radius += p.baseRadius * p.bulgeStrength * bulge.strength
      * gaussian((t - bulge.height) / bulge.heightWidth) * gaussian(angleDistance(theta, bulge.angle) / bulge.width);
    radius += p.baseRadius * p.rootFlare * decay(t, p.rootHeight);
    for (const root of p.buttresses) radius += p.baseRadius * p.buttressStrength * root.strength
      * decay(t, root.height, 1.8) * gaussian(angleDistance(theta, root.angle + root.curve * t / root.height) / root.width);
    return Math.max(coreRadius(t) * .08, radius);
  }
  function sampleSurface(t, theta) {
    t = clamp(finite(t, 0), 0, 1); theta = finite(theta, 0);
    const radius = sampleRadius(t, theta);
    return centerAt(t).add(new THREE.Vector3(Math.cos(theta) * radius, Math.sin(theta) * radius, 0));
  }
  const positions = [], uv = [], indices = [], axis = [], sections = [];
  const n = p.radialSegments, rows = p.heightSegments + 1, stride = n + 1;
  for (let row = 0; row < rows; row++) {
    const t = row / p.heightSegments, center = centerAt(t); axis.push(center);
    let minimumRadius = Infinity, maximumRadius = 0;
    for (let side = 0; side <= n; side++) {
      const theta = side / n * TAU, radius = sampleRadius(t, side === n ? 0 : theta);
      // The UV seam duplicates the exact same position, avoiding a geometric crack.
      const point = side === n ? positions.slice(row * stride * 3, row * stride * 3 + 3)
        : [center.x + Math.cos(theta) * radius, center.y + Math.sin(theta) * radius, center.z];
      positions.push(...point); uv.push(side / n, t);
      minimumRadius = Math.min(minimumRadius, radius); maximumRadius = Math.max(maximumRadius, radius);
    }
    sections.push({ t, center: center.clone(), radius: coreRadius(t), minimumRadius, maximumRadius });
  }
  for (let row = 0; row < rows - 1; row++) for (let side = 0; side < n; side++) {
    const a = row * stride + side, b = a + 1, c = b + stride, d = a + stride;
    indices.push(a, b, c, a, c, d);
  }
  const wallIndexCount = indices.length;
  // Independent cap rims preserve a sharp cut and planar cap UVs. They weld to
  // the side by position, as in a normal UV-seamed closed export mesh.
  function cap(row, reverse) {
    const center = axis[row], start = positions.length / 3, scale = sections[row].maximumRadius * 2;
    for (let side = 0; side < n; side++) {
      const offset = (row * stride + side) * 3, x = positions[offset], y = positions[offset + 1];
      positions.push(x, y, center.z); uv.push(.5 + (x - center.x) / scale, .5 + (y - center.y) / scale);
    }
    const middle = positions.length / 3; positions.push(center.x, center.y, center.z); uv.push(.5, .5);
    for (let side = 0; side < n; side++) {
      const a = start + side, b = start + (side + 1) % n;
      indices.push(middle, reverse ? b : a, reverse ? a : b);
    }
  }
  cap(0, true); cap(rows - 1, false);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const normal = geometry.getAttribute('normal'), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let row = 0; row < rows; row++) {
    const first = row * stride, last = first + n;
    a.fromBufferAttribute(normal, first); b.fromBufferAttribute(normal, last); a.add(b).normalize();
    normal.setXYZ(first, a.x, a.y, a.z); normal.setXYZ(last, a.x, a.y, a.z);
  }
  geometry.computeTangents();
  const tangent = geometry.getAttribute('tangent');
  for (let row = 0; row < rows; row++) {
    const first = row * stride, last = first + n;
    a.fromBufferAttribute(tangent, first); b.fromBufferAttribute(tangent, last); a.add(b);
    b.fromBufferAttribute(normal, first); a.addScaledVector(b, -a.dot(b)).normalize();
    const w = tangent.getW(first);
    tangent.setXYZW(first, a.x, a.y, a.z, w); tangent.setXYZW(last, a.x, a.y, a.z, w);
  }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData.trunkFormPrototype = { version: 1, axis_up: 'Z', unit: 'meter',
    topology: 'single_closed_star_section_skin', mode: p.mode, wallIndexCount,
    radialSegments: n, heightSegments: p.heightSegments, parameters: p,
    limits: ['no_holes', 'no_overhangs', 'no_multistem_fusion', 'not_connected_to_production_generator'] };
  return { geometry, axis, sections, parameters: p, sampleRadius, sampleSurface,
    topology: { closed: true, starShaped: true, uvSeamed: true, wallIndexCount } };
}
