import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { buildBranchAsset, createBranchMaterials, deserializeGeometry, disposeBranchAsset, disposeMaterials, normalizeSettings } from './web/branch-kernel.js';
import { migrateProjectDocument, normalizeAuthoring } from './web/authoring-state.js';
import { pveBranchConnector } from './web/pve-export.js';
import { exportGlb } from './web/glb-export.js';

if (!globalThis.FileReader) globalThis.FileReader = class {
  async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend?.(); }
  async readAsDataURL(blob) {
    this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
    this.onloadend?.();
  }
};
const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index < 0 ? '' : args[index + 1] || ''; };
const projectPath = option('--project'), outputPath = option('--output');
if (!projectPath || !outputPath) throw new Error('用法：pve-unit-glb-cli.mjs --project 工程.branch.json --output PVE单元.glb');
const document = migrateProjectDocument(JSON.parse(await readFile(projectPath, 'utf8')));
const settings = normalizeSettings({ ...document.settings, export_format: 'GLB', export_lods: false, preview_lod: 0,
  export_profile: 'STANDARD', merge_by_material: true });
const authoring = normalizeAuthoring(document.authoring, settings.seed);
const connector = pveBranchConnector(authoring);
if (!connector) throw new Error('工程不是有连接点的 PVE 枝条单元');
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
  if (!asset.report.ok) throw new Error('枝条几何校验失败');
  const bytes = Buffer.from(await exportGlb(asset.group, { connector, singleMesh: true }));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
  const report = { format: 'BranchForgePVEUnitGLB', version: 1, source_project: path.resolve(projectPath),
    glb: path.resolve(outputPath), sha256: createHash('sha256').update(bytes).digest('hex'),
    branches: asset.masterBranches.length, leaves: asset.masterPlacements.length,
    connector, material_note: 'Reapply M_Bark and M_Leaf from the original source GLB after UE import.' };
  await writeFile(outputPath.replace(/\.glb$/i, '.manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  disposeBranchAsset(asset);
  disposeMaterials(materials);
  for (const source of leaves) source.geometry.dispose();
}
