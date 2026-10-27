import { validatePVESkeleton } from './pve-skeleton-export.js';

const mix = (a, b, t) => a + (b - a) * t;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value) => Number(value.toFixed(6));

function randomStream(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function sample(points, t, field) {
  const scaled = clamp(t, 0, 1) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const blend = scaled - index;
  if (field === 'radius_m') return mix(points[index].radius_m, points[index + 1].radius_m, blend);
  return [0, 1, 2].map((axis) => mix(points[index].position_m[axis], points[index + 1].position_m[axis], blend));
}

function branchPoints(count, positionAt, radiusAt) {
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    return { t: round(t), position_m: positionAt(t).map(round), radius_m: round(radiusAt(t)) };
  });
}

function createBranch(id, parent, parentT, order, count, positionAt, radiusAt) {
  return {
    id, parent_id: parent?.id ?? null, parent_t: parent ? round(parentT) : null,
    order, instance_id: null, points: branchPoints(count, positionAt, radiusAt),
  };
}

// This creates only the mature tree's woody support skeleton. The imported
// BranchGenerator twig mesh is placed later by PVE's Foliage Palette.
export function createPVEWholeTree(recipe) {
  const height = Number(recipe.height_m);
  const crownRadius = Number(recipe.crown_radius_m);
  const clearTrunk = Number(recipe.clear_trunk_m);
  const baseRadius = Number(recipe.base_radius_m);
  const primaryCount = Number(recipe.primary_count);
  const seed = Number(recipe.seed);
  const trunkFraction = recipe.trunk_height_fraction === undefined ? 1 : Number(recipe.trunk_height_fraction);
  if (![height, crownRadius, clearTrunk, baseRadius, primaryCount, seed, trunkFraction].every(Number.isFinite)
    || height < 4 || crownRadius < 1 || clearTrunk < 0.5 || clearTrunk >= height * 0.55
    || baseRadius <= 0 || !Number.isInteger(primaryCount) || primaryCount < 4 || primaryCount > 24
    || trunkFraction < 0.65 || trunkFraction > 1) {
    throw new Error('整树配方尺寸或主枝数量无效');
  }
  const trunkHeight = height * trunkFraction;
  const rand = randomStream(seed);
  const branches = [];
  const trunkPosition = (t) => [
    0.018 * height * t + 0.045 * Math.sin(t * 7.2),
    -0.011 * height * t + 0.04 * Math.sin(t * 5.4),
    trunkHeight * t,
  ];
  const trunkRadius = trunkFraction === 1
    ? (t) => baseRadius * (1 - 0.91 * t) ** 1.35 + baseRadius * 0.12 * Math.exp(-t * 25)
    : (t) => baseRadius * (1 - 0.75 * trunkHeight * t / height) ** 1.25
      * (1 - 0.85 * t ** 10) + baseRadius * 0.12 * Math.exp(-t * 25);
  const trunk = createBranch('TRUNK', null, null, 0, 41, trunkPosition, trunkRadius);
  branches.push(trunk);

  for (let i = 0; i < primaryCount; i++) {
    const layer = i / Math.max(1, primaryCount - 1);
    const attachZ = clearTrunk + layer * (height - clearTrunk) * 0.55 + (rand() - 0.5) * 0.35;
    const parentT = clamp(attachZ / trunkHeight, 0.05, 0.92);
    const start = sample(trunk.points, parentT, 'position_m');
    const angle = i * 2.399963229728653 + (rand() - 0.5) * 0.38;
    const direction = [Math.cos(angle), Math.sin(angle)];
    const length = crownRadius * mix(0.91, 0.60, layer) * mix(0.92, 1.06, rand());
    const lift = mix(0.42, 2.05, layer) + (rand() - 0.5) * 0.45;
    const rootRadius = sample(trunk.points, parentT, 'radius_m') * mix(0.57, 0.68, rand());
    const primaryPosition = (t) => [
      start[0] + direction[0] * length * t + direction[1] * 0.19 * Math.sin(Math.PI * t),
      start[1] + direction[1] * length * t - direction[0] * 0.19 * Math.sin(Math.PI * t),
      start[2] + lift * t + 0.30 * Math.sin(Math.PI * t),
    ];
    const primaryRadius = (t) => rootRadius * (1 - 0.80 * t) ** 1.1;
    const primary = createBranch(`PRIMARY_${i + 1}`, trunk, parentT, 1, 17, primaryPosition, primaryRadius);
    branches.push(primary);

    for (let j = 0; j < 3; j++) {
      const side = j === 1 ? -1 : 1;
      const attach = [0.34, 0.58, 0.79][j];
      const secondaryStart = sample(primary.points, attach, 'position_m');
      const secondaryLength = crownRadius * mix(0.42, 0.27, layer) * mix(0.86, 1.08, rand());
      const sAngle = angle + side * mix(0.57, 1.18, rand());
      const sDir = [Math.cos(sAngle), Math.sin(sAngle)];
      const sLift = mix(0.62, 1.55, layer) * mix(0.82, 1.15, rand());
      const secondaryRootRadius = sample(primary.points, attach, 'radius_m') * 0.54;
      const secondaryPosition = (t) => [
        secondaryStart[0] + sDir[0] * secondaryLength * t,
        secondaryStart[1] + sDir[1] * secondaryLength * t,
        secondaryStart[2] + sLift * t + 0.11 * Math.sin(Math.PI * t),
      ];
      const secondaryRadius = (t) => secondaryRootRadius * (1 - 0.59 * t);
      const secondary = createBranch(`SECONDARY_${i + 1}_${j + 1}`, primary, attach, 2, 11, secondaryPosition, secondaryRadius);
      branches.push(secondary);

      for (let k = 0; k < 2; k++) {
        const tipAttach = k === 0 ? 0.59 : 0.84;
        const tipStart = sample(secondary.points, tipAttach, 'position_m');
        const tipAngle = sAngle + (k === 0 ? -0.66 : 0.73);
        const tipLength = crownRadius * mix(0.18, 0.11, layer) * mix(0.83, 1.12, rand());
        const tipRadius = sample(secondary.points, tipAttach, 'radius_m') * 0.48;
        const tipPosition = (t) => [
          tipStart[0] + Math.cos(tipAngle) * tipLength * t,
          tipStart[1] + Math.sin(tipAngle) * tipLength * t,
          tipStart[2] + mix(0.35, 0.78, layer) * t,
        ];
        branches.push(createBranch(`TERTIARY_${i + 1}_${j + 1}_${k + 1}`, secondary, tipAttach, 3, 7,
          tipPosition, (t) => tipRadius * (1 - 0.71 * t)));
      }
    }
  }

  if (trunkFraction < 1) {
    const crownTop = Math.max(...branches.flatMap((branch) => branch.points.map((point) => point.position_m[2])));
    const crownStretch = (height - clearTrunk) / (crownTop - clearTrunk);
    for (const branch of branches) {
      for (const point of branch.points) {
        if (point.position_m[2] > clearTrunk) {
          point.position_m[2] = round(clearTrunk + (point.position_m[2] - clearTrunk) * crownStretch);
        }
      }
    }
  }

  const skeleton = {
    format: 'BranchForgePVESkeleton', version: 1,
    coordinate_system: { handedness: 'right', up: 'Z', unit: 'meter', point_space: 'source_local' },
    kind: 'whole_plant', name: recipe.name || 'Whole Tree', seed, connector: null,
    recipe: { format: 'BranchForgeWholeTreeRecipe', version: 1, height_m: height,
      crown_radius_m: crownRadius, clear_trunk_m: clearTrunk, base_radius_m: baseRadius,
      primary_count: primaryCount, trunk_height_fraction: trunkFraction },
    branches,
  };
  const report = validatePVESkeleton(skeleton);
  if (report.errors.length || report.thin_parent_connections || report.displaced_connections) {
    throw new Error(`整树骨架验证失败：${[...report.errors, ...report.warnings].join('；')}`);
  }
  return skeleton;
}
