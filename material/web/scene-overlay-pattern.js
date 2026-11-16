import {MAX_SCENE_TEXT_LENGTH, requiresSceneTextMask, sceneTextMaskSampler} from './scene-overlay-text.js';

const MAX_LABEL_LENGTH = 24;
const GLYPH_COLUMNS = 5;
const GLYPH_ROWS = 7;

const glyphs = {
  '0': '01110 10001 10011 10101 11001 10001 01110',
  '1': '00100 01100 00100 00100 00100 00100 01110',
  '2': '01110 10001 00001 00010 00100 01000 11111',
  '3': '11110 00001 00001 01110 00001 00001 11110',
  '4': '00010 00110 01010 10010 11111 00010 00010',
  '5': '11111 10000 10000 11110 00001 00001 11110',
  '6': '01110 10000 10000 11110 10001 10001 01110',
  '7': '11111 00001 00010 00100 01000 01000 01000',
  '8': '01110 10001 10001 01110 10001 10001 01110',
  '9': '01110 10001 10001 01111 00001 00001 01110',
  A: '01110 10001 10001 11111 10001 10001 10001',
  B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01111 10000 10000 10000 10000 10000 01111',
  D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111',
  F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01111 10000 10000 10111 10001 10001 01111',
  H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110',
  J: '00111 00010 00010 00010 10010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001',
  L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001',
  N: '10001 11001 11001 10101 10011 10011 10001',
  O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101',
  R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110',
  T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 11011 10001',
  X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100',
  Z: '11111 00001 00010 00100 01000 10000 11111',
  a: '00000 00000 01110 00001 01111 10001 01111',
  b: '10000 10000 10110 11001 10001 10001 11110',
  c: '00000 00000 01111 10000 10000 10000 01111',
  d: '00001 00001 01101 10011 10001 10001 01111',
  e: '00000 00000 01110 10001 11111 10000 01111',
  f: '00110 01001 01000 11100 01000 01000 01000',
  g: '00000 01111 10001 10001 01111 00001 01110',
  h: '10000 10000 10110 11001 10001 10001 10001',
  i: '00100 00000 01100 00100 00100 00100 01110',
  j: '00010 00000 00110 00010 00010 10010 01100',
  k: '10000 10000 10010 10100 11000 10100 10010',
  l: '01100 00100 00100 00100 00100 00100 01110',
  m: '00000 00000 11010 10101 10101 10101 10101',
  n: '00000 00000 10110 11001 10001 10001 10001',
  o: '00000 00000 01110 10001 10001 10001 01110',
  p: '00000 11110 10001 10001 11110 10000 10000',
  q: '00000 01111 10001 10001 01111 00001 00001',
  r: '00000 00000 10110 11001 10000 10000 10000',
  s: '00000 00000 01111 10000 01110 00001 11110',
  t: '01000 01000 11100 01000 01000 01001 00110',
  u: '00000 00000 10001 10001 10001 10011 01101',
  v: '00000 00000 10001 10001 10001 01010 00100',
  w: '00000 00000 10001 10001 10101 10101 01010',
  x: '00000 00000 10001 01010 00100 01010 10001',
  y: '00000 10001 10001 10001 01111 00001 01110',
  z: '00000 00000 11111 00010 00100 01000 11111',
  '!': '00100 00100 00100 00100 00100 00000 00100',
  '"': '01010 01010 01010 00000 00000 00000 00000',
  '#': '01010 01010 11111 01010 11111 01010 01010',
  '$': '00100 01111 10100 01110 00101 11110 00100',
  '%': '11001 11010 00010 00100 01000 01011 10011',
  '&': '01100 10010 10100 01000 10101 10010 01101',
  "'": '00100 00100 01000 00000 00000 00000 00000',
  '(': '00010 00100 01000 01000 01000 00100 00010',
  ')': '01000 00100 00010 00010 00010 00100 01000',
  '*': '00000 10101 01110 11111 01110 10101 00000',
  '+': '00000 00100 00100 11111 00100 00100 00000',
  ',': '00000 00000 00000 00000 00110 00100 01000',
  '-': '00000 00000 00000 11111 00000 00000 00000',
  '.': '00000 00000 00000 00000 00000 00110 00110',
  '/': '00001 00010 00010 00100 01000 01000 10000',
  ':': '00000 00110 00110 00000 00110 00110 00000',
  ';': '00000 00110 00110 00000 00110 00100 01000',
  '<': '00010 00100 01000 10000 01000 00100 00010',
  '=': '00000 00000 11111 00000 11111 00000 00000',
  '>': '01000 00100 00010 00001 00010 00100 01000',
  '?': '01110 10001 00001 00010 00100 00000 00100',
  '@': '01110 10001 10111 10101 10111 10000 01110',
  '[': '01110 01000 01000 01000 01000 01000 01110',
  '\\': '10000 01000 01000 00100 00010 00010 00001',
  ']': '01110 00010 00010 00010 00010 00010 01110',
  '^': '00100 01010 10001 00000 00000 00000 00000',
  '_': '00000 00000 00000 00000 00000 00000 11111',
  '`': '01000 00100 00000 00000 00000 00000 00000',
  '{': '00011 00100 00100 01000 00100 00100 00011',
  '|': '00100 00100 00100 00100 00100 00100 00100',
  '}': '11000 00100 00100 00010 00100 00100 11000',
  '~': '00000 00000 01001 10110 00000 00000 00000',
  '↑': '00100 01110 10101 00100 00100 00100 00100',
  '↓': '00100 00100 00100 00100 10101 01110 00100',
  '←': '00000 00100 01000 11111 01000 00100 00000',
  '→': '00000 00100 00010 11111 00010 00100 00000',
  '↗': '00000 01111 00011 00101 01001 10000 00000',
  '↘': '00000 10000 01001 00101 00011 01111 00000',
  '↖': '00000 11110 11000 10100 10010 00001 00000',
  '↙': '00000 00001 10010 10100 11000 11110 00000'
};

export function normalizeSceneOverlayText(value, maxLength = MAX_LABEL_LENGTH) {
  if (typeof value !== 'string') return '';
  let text = '';
  for (const character of value.trim()) {
    if (character !== ' ' && !Object.hasOwn(glyphs, character)) continue;
    text += character;
    if (text.length === maxLength) break;
  }
  return text.trimEnd();
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function number(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function smooth(start, end, value) {
  const ratio = clamp((value - start) / (end - start));
  return ratio * ratio * (3 - 2 * ratio);
}

function edgeCoverage(distance, latitude) {
  return 1 - smooth(-latitude, latitude, distance);
}

function grain(u, v, frequency, seed) {
  let hash = Math.imul(Math.floor(u * frequency), 0x365f2295)
    ^ Math.imul(Math.floor(v * frequency), 0x5db7647d) ^ seed;
  hash = Math.imul(hash ^ (hash >>> 16), 0x21f0aaad);
  return ((hash ^ (hash >>> 15)) >>> 0) / 0x100000000;
}

function wearCoverage(coverage, u, v, wear, seed) {
  if (coverage <= 0 || wear <= 0) return coverage;
  const cutoff = 0.46 * wear;
  const erosion = 0.48 * wear;
  const pores = smooth(cutoff - 0.04, cutoff + 0.04, grain(u, v, 96, seed));
  const remaining = clamp((coverage - erosion) / (1 - erosion));
  return remaining * (1 - (1 - pores) * Math.min(1, wear * 4));
}

function sprayPattern(params, textMask) {
  const wear = clamp(number(params.wear, 0));
  if (textMask) {
    const sample = sceneTextMaskSampler(textMask, params.text);
    return (u, v) => wearCoverage(sample(u, v), u, v, wear, 391613);
  }
  if (requiresSceneTextMask(params.text)) return () => 0;
  const text = normalizeSceneOverlayText(params.text, MAX_SCENE_TEXT_LENGTH);
  if (!text) return () => 0;
  const cellAdvance = GLYPH_COLUMNS + 1;
  const columns = text.length * cellAdvance - 1;
  // A one-cell border lets edge samples interpolate without a special case in the inner loop.
  const stride = columns + 2;
  const grid = new Uint8Array((GLYPH_ROWS + 2) * stride);
  for (let index = 0; index < text.length; index++) {
    const rows = glyphs[text[index]]?.split(' ');
    if (!rows) continue;
    for (let y = 0; y < GLYPH_ROWS; y++) {
      for (let x = 0; x < GLYPH_COLUMNS; x++) {
        const offset = (y + 1) * stride + 1 + index * cellAdvance + x;
        grid[offset] = Number(rows[y][x]);
      }
    }
  }

  const halfWidth = Math.min(0.92, columns * 0.088);
  const halfHeight = Math.max(0.14, halfWidth * GLYPH_ROWS / columns * 1.9);
  return (u, v) => {
    const x = (u / halfWidth + 1) * columns / 2 + 0.5;
    const y = (1 - v / halfHeight) * GLYPH_ROWS / 2 + 0.5;
    if (x <= 0 || x >= columns + 1 || y <= 0 || y >= GLYPH_ROWS + 1) return 0;

    const column = Math.floor(x);
    const row = Math.floor(y);
    const xRatio = x - column;
    const yRatio = y - row;
    const offset = row * stride + column;
    const upper = grid[offset] * (1 - xRatio) + grid[offset + 1] * xRatio;
    const lower = grid[offset + stride] * (1 - xRatio) + grid[offset + stride + 1] * xRatio;
    const coat = smooth(0.24, 0.63, upper * (1 - yRatio) + lower * yRatio);
    return wearCoverage(coat, u, v, wear, 391613);
  };
}

function roundedBoxDistance(x, y, width, height, radius) {
  const outerX = Math.abs(x) - width + radius;
  const outerY = Math.abs(y) - height + radius;
  return Math.hypot(Math.max(0, outerX), Math.max(0, outerY))
    + Math.min(0, Math.max(outerX, outerY)) - radius;
}

function repeatDistance(value, period) {
  return Math.abs(value - Math.round(value / period) * period);
}

function bootPattern(params) {
  const wear = clamp(number(params.wear, 0));
  return (u, v) => {
    const frontX = u - (0.04 + 0.19 * v);
    const heelX = u + 0.13 + (v + 0.53) * 0.08;
    const front = roundedBoxDistance(frontX, v - 0.35, 0.53, 0.55, 0.22);
    const heel = roundedBoxDistance(heelX, v + 0.58, 0.34, 0.29, 0.10);
    const treadX = Math.abs(frontX);
    const frontGroove = repeatDistance(v + 0.51 * treadX, 0.245);
    const heelGroove = repeatDistance(v + 0.26 * Math.abs(heelX), 0.168);
    const frontTread = edgeCoverage(front, 0.018) * smooth(0.026, 0.062, frontGroove)
      * smooth(0.034, 0.065, treadX);
    const heelTread = edgeCoverage(heel, 0.019) * smooth(0.018, 0.049, heelGroove)
      * smooth(0.024, 0.055, Math.abs(heelX));
    return wearCoverage(Math.max(frontTread, heelTread), u, v, wear, 211601);
  };
}

const brandStrokes = [
  [0, -0.72, 0, 0.65],
  [0, 0.65, -0.51, -0.02],
  [0, 0.65, 0.51, -0.02],
  [0, 0.05, -0.66, -0.45],
  [0, 0.05, 0.66, -0.45],
  [-0.28, -0.74, 0.28, -0.74]
].map(([x1, y1, x2, y2]) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return { x1, y1, dx, dy, inverseLengthSquared: 1 / (dx * dx + dy * dy) };
});

function brandPattern(params) {
  const size = Math.max(0.1, number(params.size, 24));
  const width = Math.max(0, number(params.width, 1.9));
  const rimWidth = 2 * width / size;
  return (u, v, role) => {
    if (role === 'rim') {
      if (rimWidth <= 0) return 0;
      const scale = sceneBrandFootprintCm(size, width, role) / size;
      u *= scale;
      v *= scale;
    }
    let distanceSquared = Infinity;
    for (const stroke of brandStrokes) {
      const x = u - stroke.x1;
      const y = v - stroke.y1;
      const t = clamp((x * stroke.dx + y * stroke.dy) * stroke.inverseLengthSquared);
      const dx = x - t * stroke.dx;
      const dy = y - t * stroke.dy;
      distanceSquared = Math.min(distanceSquared, dx * dx + dy * dy);
    }
    const distance = Math.sqrt(distanceSquared) - 0.049;
    const char = edgeCoverage(distance, 0.014);
    if (role === 'rim') return (1 - char) * (1 - smooth(0, rimWidth, distance));
    return char * (0.9 + 0.1 * grain(u, v, 84, 89503));
  };
}

export function sceneBrandFootprintCm(size, width, role) {
  return role === 'rim' ? size + 2 * width : size;
}

export function sceneBiteFootprintCm(width, spacing) {
  return 2.36 * width + spacing;
}

function bitePattern(params) {
  const width = Math.max(0.1, number(params.width, 2.2));
  const spacing = Math.max(0, number(params.spacing, 3.2));
  const footprint = sceneBiteFootprintCm(width, spacing);
  const offset = (spacing + width) / footprint;
  const toothWidth = width / footprint;
  return (u, v) => {
    const bend = toothWidth * (0.48 * v * v - 0.24 * v);
    const along = v / (u < 0 ? 0.83 : 0.73);
    const across = (Math.abs(u) - offset - bend) / toothWidth;
    const distance = across * across + along * along;
    return 1 - smooth(0.56, 1.05, distance);
  };
}

function leafBlade(centerU, centerV, rotation, scale, tornEdge = 0) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return (u, v) => {
    const offsetX = (u - centerU) / scale;
    const offsetY = (v - centerV) / scale;
    const x = cos * offsetX + sin * offsetY;
    const y = -sin * offsetX + cos * offsetY;
    const t = (y + 0.72) / 1.63;
    if (t <= 0 || t >= 1) {
      if (y < -0.72 && y > -0.90) return 0.65 * edgeCoverage(Math.abs(x + 0.04) - 0.018, 0.015);
      return 0;
    }
    const curve = 0.11 * Math.sin(Math.PI * t) - 0.04;
    const distanceFromVein = Math.abs(x - curve);
    const girth = 0.58 * Math.sqrt(4 * t * (1 - t)) * (1 - 0.46 * t);
    const serration = (0.022 + tornEdge * 0.068) * Math.sin(t * 65);
    const silhouette = edgeCoverage(distanceFromVein - girth + serration, 0.025);
    if (silhouette <= 0) return 0;
    const mainVein = edgeCoverage(distanceFromVein - (0.03 - 0.018 * t), 0.016);
    const veinPitch = repeatDistance(t - distanceFromVein * 0.54, 0.132);
    const sideVeins = edgeCoverage(veinPitch - 0.008, 0.013);
    const lamina = 0.34 + 0.11 * (1 - distanceFromVein / Math.max(girth, 0.05));
    const coverage = silhouette * clamp(lamina + 0.60 * mainVein + 0.32 * sideVeins);
    return wearCoverage(coverage, offsetX, offsetY, tornEdge, 93401);
  };
}

function litterPattern() {
  const leaves = [
    { sample: leafBlade(-0.34, 0.26, 0.68, 0.64, 0.30), opacity: 0.92 },
    { sample: leafBlade(0.37, 0.33, -0.90, 0.49, 0.32), opacity: 0.83 },
    { sample: leafBlade(0.04, -0.44, -1.21, 0.59, 0.28), opacity: 1 },
    { sample: leafBlade(0.64, -0.29, 0.44, 0.27, 0.32), opacity: 0.65 }
  ];
  return (u, v) => {
    let coverage = 0;
    for (const { sample, opacity } of leaves) coverage = Math.max(coverage, opacity * sample(u, v));
    return coverage;
  };
}

/** Return coverage in a decal's normalized coordinates, with positive V pointing up. */
export function createSceneOverlayPattern(style, params = {}, {textMask} = {}) {
  let sample;
  switch (style) {
    case 'spray': sample = sprayPattern(params, textMask); break;
    case 'boot': sample = bootPattern(params); break;
    case 'brand': sample = brandPattern(params); break;
    case 'bite': sample = bitePattern(params); break;
    case 'leaf-print': sample = leafBlade(0, 0, -0.25, 0.94); break;
    case 'litter': sample = litterPattern(); break;
    default: return null;
  }
  return (u, v, role = 'main') => {
    if (!(u >= -1 && u <= 1 && v >= -1 && v <= 1)) return 0;
    return sample(u, v, role);
  };
}
