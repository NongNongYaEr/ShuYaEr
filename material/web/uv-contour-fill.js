import { analyzeUV } from './uv-analysis.js';
import { collectUvCharts } from './uv-charts.js';
import { clearanceAtResolution, measureUvClearance, strictUvCharts } from './uv-clearance.js';
import { verifySurfacePreserved } from './mesh-codec.js';
import { findOutlinePlacement, outlineCollision } from './outline-collision.js';
import { dilate, rasterTriangle } from './uv-outline-packing.js';
import { buildUvTopology, uvEdgeContinuous } from './uv-topology.js';

const GRID = 1755;
const MARGIN = 3;
const STRIDE = Math.ceil(GRID / 32);
const SOFT_FACE_LIMIT = 40;
const MAX_MOVABLE_FACES = 2048;
const MAX_DISPLACED_ISLANDS = 17;
const DENSITY_SCALES = [1.22, 1.15, 1.08, 1.04];
const QUARTER_TURNS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function contourMask(chart, scale, turn, original = false) {
  const [cos, sin] = QUARTER_TURNS[turn];
  const points = chart.points.map(([x, y]) => [(x * cos - y * sin) * scale, (x * sin + y * cos) * scale]);
  const low = [Infinity, Infinity], high = [-Infinity, -Infinity];
  for (const point of points) {
    for (let axis = 0; axis < 2; axis++) {
      low[axis] = Math.min(low[axis], point[axis]);
      high[axis] = Math.max(high[axis], point[axis]);
    }
  }

  // Existing charts can have clearance exactly at the accepted tile boundary.
  // Clip their raster gutters there without changing their UV coordinates.
  const origin = low.map(value => original ? Math.max(0, Math.floor(value) - MARGIN) : value - MARGIN);
  const [width, height] = high.map((value, axis) => {
    const size = Math.floor(value - origin[axis]) + MARGIN + 1;
    return original ? Math.min(GRID - origin[axis], size) : size;
  });
  if (width > GRID || height > GRID) return null;
  for (const point of points) {
    point[0] -= origin[0];
    point[1] -= origin[1];
  }

  const raw = new Uint8Array(width * height);
  for (const corners of chart.corners) {
    rasterTriangle(raw, width, height, corners.map(index => points[index]));
  }
  const raster = dilate(raw, width, height, MARGIN);
  const runs = [], words = [];
  const wordsPerRow = Math.ceil(width / 32);
  const rowBits = new Uint32Array(wordsPerRow), rowWeights = new Uint8Array(wordsPerRow);
  for (let y = 0; y < height; y++) {
    rowBits.fill(0);
    rowWeights.fill(0);
    let start = -1;
    for (let x = 0; x <= width; x++) {
      if (x < width && raster[y * width + x]) {
        if (start < 0) start = x;
        rowBits[x >> 5] |= 1 << (x & 31);
        rowWeights[x >> 5]++;
      } else if (start >= 0) {
        runs.push(y, start, x);
        start = -1;
      }
    }
    for (let word = 0; word < wordsPerRow; word++) {
      if (rowBits[word]) words.push([y * STRIDE + word, rowBits[word], rowWeights[word]]);
    }
  }
  words.sort((a, b) => b[2] - a[2] || a[0] - b[0]);
  return {
    points, origin, w: width, h: height, scale, turn, raster,
    runs: Int32Array.from(runs),
    entries: Uint32Array.from(words.flatMap(([offset, bits]) => [offset, bits])),
  };
}

function stampContour({ counts, bits }, { mask, x, y }, amount) {
  for (let run = 0; run < mask.runs.length; run += 3) {
    const row = y + mask.runs[run];
    const end = x + mask.runs[run + 2];
    for (let column = x + mask.runs[run + 1]; column < end; column++) {
      const index = row * GRID + column, word = row * STRIDE + (column >> 5);
      const bit = 1 << (column & 31), before = counts[index], after = before + amount;
      counts[index] = after;
      if (!before) bits[word] |= bit;
      if (!after) bits[word] &= ~bit;
    }
  }
}

function contoursIntersect(a, b) {
  const lowX = Math.max(a.x, b.x), highX = Math.min(a.x + a.mask.w, b.x + b.mask.w);
  const lowY = Math.max(a.y, b.y), highY = Math.min(a.y + a.mask.h, b.y + b.mask.h);
  for (let y = lowY; y < highY; y++) {
    const rowA = (y - a.y) * a.mask.w - a.x, rowB = (y - b.y) * b.mask.w - b.x;
    for (let x = lowX; x < highX; x++) {
      if (a.mask.raster[rowA + x] && b.mask.raster[rowB + x]) return true;
    }
  }
  return false;
}

function findNearby(occupied, masks, centerX, centerY, reach) {
  for (let radius = 0; radius <= reach;) {
    const step = radius < 8 ? 2 : radius < 24 ? 4 : 8;
    for (let dx = -radius; dx <= radius; dx += step) {
      const offsets = Math.abs(dx) === radius ? [-radius, 0, radius] : [-radius, radius];
      for (const dy of offsets) {
        for (const mask of masks) {
          const x = Math.round(centerX + dx - mask.w / 2);
          const y = Math.round(centerY + dy - mask.h / 2);
          if (!outlineCollision(occupied, mask, x, y, GRID, STRIDE)) return { mask, x, y };
        }
      }
    }
    radius += step;
  }
  return null;
}

function encodePlacement(input, charts, faceIslands, resolution) {
  const pos = [], normal = [], uv = [], sourceIndices = [], chartIds = [];
  const indices = new Uint32Array(input.indices.length);
  const perChartVertices = charts.map(() => new Map());
  for (let corner = 0; corner < indices.length; corner++) {
    const source = input.indices[corner], chartId = faceIslands[Math.floor(corner / 3)];
    const cache = perChartVertices[chartId];
    let index = cache.get(source);
    if (index === undefined) {
      index = sourceIndices.length;
      cache.set(source, index);
      sourceIndices.push(source);
      chartIds.push(chartId);
      pos.push(...input.pos.subarray(source * 3, source * 3 + 3));
      normal.push(...input.normal.subarray(source * 3, source * 3 + 3));
      const chart = charts[chartId], { mask, x, y } = chart.placement;
      const [u, v] = mask.points[chart.localVertices.get(source)];
      uv.push((x + u) / GRID, (y + v) / GRID);
    }
    indices[corner] = index;
  }
  return {
    pos: Float32Array.from(pos), normal: Float32Array.from(normal), uv: Float32Array.from(uv),
    indices, sourceIndices: Uint32Array.from(sourceIndices), chartIds: Int32Array.from(chartIds),
    tangent: new Float32Array(sourceIndices.length * 4),
    atlas: { charts: charts.length, width: resolution, height: resolution, packedUtilization: 0 },
  };
}

function faceWinding(mesh, at) {
  const [a, b, c] = [0, 1, 2].map(offset => mesh.indices[at + offset] * 2);
  const u = mesh.uv;
  return Math.sign((u[b] - u[a]) * (u[c + 1] - u[a + 1]) - (u[c] - u[a]) * (u[b + 1] - u[a + 1]));
}

export function fillUvContourGaps(input, { resolution = 2048, padding = 3, onProgress = () => {}, densityBudget = null } = {}) {
  // At 2K, three cells on each side of a contour correspond to a 7.0017 px gap.
  if (resolution !== 2048 || padding !== 3 || !input.indices.length || input.indices.length > 150000) return null;
  const deadline = Date.now() + 18000;
  const before = analyzeUV(input, { resolution });
  if (before.overlap || before.zeroUvFaces || before.outOfRangeFaces) return null;
  const strict = strictUvCharts(input);
  const { charts, faceIslands } = collectUvCharts(input, { faceCharts: strict.labels });
  if (charts.length < 2 || charts.length > 1500) return null;
  const topology = buildUvTopology(input);
  const makeOccupancy = () => ({
    counts: new Uint16Array(GRID * GRID),
    bits: new Uint32Array(GRID * STRIDE + 1),
  });
  const full = makeOccupancy(), hard = makeOccupancy();

  // Keep two masks so medium islands can test positions through small blockers.
  // Counts preserve existing charts when conservative raster borders share a cell.
  function place(chart, placement) {
    if (chart.placement) {
      stampContour(full, chart.placement, -1);
      if (!chart.soft) stampContour(hard, chart.placement, -1);
    }
    chart.placement = placement;
    if (placement) {
      stampContour(full, placement, 1);
      if (!chart.soft) stampContour(hard, placement, 1);
    }
  }

  for (const chart of charts) {
    if (Date.now() >= deadline) return null;
    const vertices = [...chart.vertices];
    chart.localVertices = new Map(vertices.map((index, i) => [index, i]));
    chart.points = vertices.map(index => [input.uv[index * 2] * GRID, input.uv[index * 2 + 1] * GRID]);
    chart.corners = chart.faces.map(face => [0, 1, 2].map(corner => chart.localVertices.get(input.indices[face * 3 + corner])));
    chart.area = chart.corners.reduce((sum, corners) => {
      const [a, b, c] = corners.map(index => chart.points[index]);
      return sum + Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
    }, 0);
    chart.soft = chart.faces.length <= SOFT_FACE_LIMIT;
    let densityLimit = DENSITY_SCALES[0] ** 2;
    if (densityBudget) {
      for (const face of chart.faces) densityLimit = Math.min(densityLimit, densityBudget.faceLimits[face]);
    }
    chart.maxScale = Math.sqrt(densityLimit);
    const mask = contourMask(chart, 1, 0, true);
    const [x, y] = mask.origin;
    place(chart, { mask, x, y });
  }
  onProgress(.12);

  function orientations(chart, scale) {
    return QUARTER_TURNS.map((_, turn) => contourMask(chart, scale, turn)).filter(Boolean);
  }

  function relocateSmall(chart, old) {
    const { mask, x, y } = old;
    if (!outlineCollision(full.bits, mask, x, y, GRID, STRIDE)) return old;
    const nearby = findNearby(full.bits, [mask], x + mask.w / 2, y + mask.h / 2, 28);
    if (nearby || Date.now() >= deadline) return nearby;
    const rotations = [mask, ...orientations(chart, mask.scale).filter(other => other.turn !== mask.turn)];
    return findOutlinePlacement(full.bits, rotations, GRID, STRIDE, 2);
  }

  function placeWithSmallMoves(chart, placement) {
    const displaced = charts.filter(other => other.soft && other.placement && contoursIntersect(placement, other.placement))
      .map(other => [other, other.placement]);
    if (displaced.length > MAX_DISPLACED_ISLANDS) return false;
    displaced.sort((a, b) => b[0].area - a[0].area);
    for (const [other] of displaced) place(other, null);
    place(chart, placement);
    for (const [other, old] of displaced) {
      const next = relocateSmall(other, old);
      if (!next) {
        place(chart, null);
        for (const [affected] of displaced) place(affected, null);
        for (const [affected, original] of displaced) place(affected, original);
        return false;
      }
      place(other, next);
    }
    movedSmallIslands += displaced.length;
    return true;
  }

  let enlarged = 0, movedSmallIslands = 0;
  const moving = charts.filter(chart => chart.faces.length <= MAX_MOVABLE_FACES).sort((a, b) => b.area - a.area);
  for (const [index, chart] of moving.entries()) {
    if (Date.now() >= deadline) break;
    const old = chart.placement;
    const centerX = old.x + old.mask.w / 2, centerY = old.y + old.mask.h / 2;
    place(chart, null);
    const scales = DENSITY_SCALES.filter(scale => scale <= chart.maxScale);
    if (chart.maxScale > (scales[0] ?? 1.015) + .002) scales.unshift(chart.maxScale);
    for (const scale of scales) {
      if (Date.now() >= deadline) break;
      const masks = orientations(chart, scale);
      if (!masks.length) continue;
      let candidate = findNearby(full.bits, masks, centerX, centerY, 64);
      if (candidate) {
        place(chart, candidate);
        break;
      }
      if (!chart.soft) {
        candidate = findNearby(hard.bits, masks, centerX, centerY, 64);
        if (candidate && placeWithSmallMoves(chart, candidate)) break;
      }
      if (chart.faces.length <= 55 && Date.now() < deadline) {
        candidate = findOutlinePlacement(full.bits, masks, GRID, STRIDE, 2);
        if (candidate) {
          place(chart, candidate);
          break;
        }
      }
    }
    if (chart.placement) enlarged++;
    else place(chart, old);
    if (index % 16 === 0) onProgress(.12 + .71 * (index + 1) / moving.length);
  }
  if (!enlarged) return null;

  const result = encodePlacement(input, charts, faceIslands, resolution);
  verifySurfacePreserved(input, result);
  const after = analyzeUV(result, { resolution });
  if (after.summedUvTriangleArea <= before.summedUvTriangleArea + 1e-7 || after.overlap ||
      after.zeroUvFaces || after.outOfRangeFaces || after.mirroredFaces !== before.mirroredFaces ||
      after.anisotropy.p95 > before.anisotropy.p95 * 1.0001) return null;
  for (let corner = 0; corner < input.indices.length; corner += 3) {
    if (faceWinding(input, corner) !== faceWinding(result, corner)) return null;
  }
  if (topology.edges.some(edge => uvEdgeContinuous(input, edge, 0) !== uvEdgeContinuous(result, edge, 0))) return null;
  onProgress(.86);
  const exact = measureUvClearance(result);
  const clearance = clearanceAtResolution(exact, { resolution, padding });
  if (!clearance.safe || exact.chartCount !== strict.count ||
      (clearance.gapPixels != null && clearance.gapPixels < clearance.requiredGapPixels) ||
      clearance.borderPixels < clearance.requiredBorderPixels) return null;
  const density = densityBudget?.audit(result);
  if (densityBudget && !density) return null;

  result.packing = {
    method: 'uv-contour-fill', resolution, padding,
    pinnedIslands: [], relativeDensityWeights: {}, requiresMikk: true,
    ...(density ? { densityBudget: density } : {}),
    contourFill: {
      before: before.summedUvTriangleArea, after: after.summedUvTriangleArea,
      beforeP95: before.anisotropy.p95, afterP95: after.anisotropy.p95,
      islands: strict.count, gapPixels: clearance.gapPixels, enlarged,
      movedSmallIslands, maxRelativeDensity: DENSITY_SCALES[0],
    },
  };
  onProgress(1);
  return result;
}

