import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { buildBranchAsset, createBranchMaterials, deserializeGeometry, disposeBranchAsset, disposeMaterials, normalizeSettings } from './web/branch-kernel.js';
import { migrateProjectDocument, normalizeAuthoring } from './web/authoring-state.js';
import { createPVESkeleton, validatePVESkeleton } from './web/pve-skeleton-export.js';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? '' : args[index + 1] || '';
};
const projectPath = option('--project') || args.find((arg) => !arg.startsWith('--'));
if (!projectPath) throw new Error('用法：node --experimental-loader ./vendor-loader.mjs pve-skeleton-cli.mjs --project 工程.branch.json --output 树.pve-skeleton.json');
const absoluteProject = path.resolve(projectPath);
const outputPath = path.resolve(option('--output') || absoluteProject.replace(/\.branch\.json$/i, '.pve-skeleton.json'));
if (outputPath === absoluteProject) throw new Error('输出路径不能覆盖工程文件');

const document = migrateProjectDocument(JSON.parse(await readFile(absoluteProject, 'utf8')));
const settings = normalizeSettings(document.settings || {});
const authoring = normalizeAuthoring(document.authoring, settings.seed);
const leaves = (document.leaf_meshes || []).map((item, index) => ({
  id: item.id || `LEAF_${index + 1}`, name: item.name || `Leaf_${index + 1}`,
  weight: Number(item.weight) || 1, orderMin: Number(item.orderMin) || 0,
  orderMax: Number.isFinite(Number(item.orderMax)) ? Number(item.orderMax) : 3,
  season: item.season || 'ANY', geometry: deserializeGeometry(item.geometry),
  calibration: item.calibration || { scale: 1, rotation: 0, flip: false },
})).filter((item) => item.geometry);
const materials = createBranchMaterials(settings);
let asset;
try {
  asset = buildBranchAsset(settings, materials, leaves, 0, authoring);
  const skeleton = createPVESkeleton(asset, leaves);
  const report = validatePVESkeleton(skeleton);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(skeleton, null, 2)}\n`, 'utf8');
  await writeFile(outputPath.replace(/\.json$/i, '.validation.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ output: outputPath, kind: skeleton.kind, ...report }, null, 2)}\n`);
} finally {
  disposeBranchAsset(asset);
  disposeMaterials(materials);
  leaves.forEach((item) => item.geometry.dispose());
}
