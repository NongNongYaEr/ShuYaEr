import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FBXExporter } from './web/vendor/fbx-exporter/index.js';
import {
  buildBranchAsset, createBranchMaterials, createManifest, deserializeGeometry,
  disposeBranchAsset, disposeMaterials, normalizeSettings,
} from './web/branch-kernel.js';
import { cloneAuthoring, migrateProjectDocument, normalizeAuthoring } from './web/authoring-state.js';
import { createMaterialSetup, createPcgCsv, createRecipeDocument, createUeImportScript } from './web/ue-contract.js';
import { bindLeafExportTextures, preserveLeafTextureNames } from './web/leaf-material-export.js';

const args = process.argv.slice(2);
const option = (name, fallback = '') => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const positional = args.filter((value, index) => !value.startsWith('--') && !(index > 0 && args[index - 1].startsWith('--')));
const projectPath = option('--project', positional[0] || '');
if (!projectPath) throw new Error('用法：批量导出工程.bat 工程.branch.json [输出目录]，或使用 --project/--output/--count/--step 参数');
const absoluteProject = path.resolve(projectPath);
const document = migrateProjectDocument(JSON.parse(await readFile(absoluteProject, 'utf8')));
const outputDirectory = path.resolve(option('--output', positional[1] || path.dirname(absoluteProject)));
const count = Math.max(1, Math.min(64, Number(option('--count', '1')) || 1));
const step = Math.max(1, Number(option('--step', '101')) || 101);
await mkdir(outputDirectory, { recursive: true });

const leafSources = (document.leaf_meshes || []).map((item, index) => ({
  id: item.id || `LEAF_${index + 1}`, name: item.name || `Leaf_${index + 1}`, weight: Number(item.weight) || 1,
  orderMin: Number(item.orderMin) || 0, orderMax: Number.isFinite(Number(item.orderMax)) ? Number(item.orderMax) : 3,
  season: item.season || 'ANY', geometry: deserializeGeometry(item.geometry),
  calibration: item.calibration || { scale: 1, rotation: 0, flip: false },
})).filter((item) => item.geometry);
const baseSettings = normalizeSettings(document.settings || {});
const baseAuthoring = normalizeAuthoring(document.authoring, baseSettings.seed);
const wrapSeed = (value) => ((Math.trunc(value) - 1) % 2147483646 + 2147483646) % 2147483646 + 1;
const safeName = String(baseSettings.object_name || 'Branch').replace(/[<>:"/\\|?*]/g, '_');

for (let variant = 0; variant < count; variant += 1) {
  const seed = wrapSeed(baseSettings.seed + variant * step);
  const settings = normalizeSettings({ ...baseSettings, seed });
  const authoring = cloneAuthoring(baseAuthoring);
  Object.keys(authoring.seeds).forEach((key) => { authoring.seeds[key] = wrapSeed(authoring.seeds[key] + variant * step); });
  authoring.flowering.seed = wrapSeed(authoring.flowering.seed + variant * step);
  authoring.vegetation.seed = wrapSeed(authoring.vegetation.seed + variant * step);
  const materials = createBranchMaterials(settings);
  const lodIndices = settings.export_lods ? [0, 1, 2, 3] : [settings.preview_lod];
  const reports = [];
  const prefix = count > 1 ? `${safeName}_V${String(variant + 1).padStart(2, '0')}_S${seed}` : safeName;
  const assets = [];
  const f = authoring.flowering;
  const textures = [...bindLeafExportTextures(materials.leaf, authoring.leaf_material, prefix), ...(f.enabled && authoring.vine && !(f.source && f.shared_atlas) ? bindLeafExportTextures(materials.flower, f.material, prefix, 'flower') : [])];
  try {
    for (const lod of lodIndices) {
      const started = performance.now();
      const asset = buildBranchAsset(settings, materials, leafSources, lod, authoring);
      assets.push(asset);
      for(const material of asset.vegetation?.materials.values()||[])if(material.vegetationTexture)for(const file of bindLeafExportTextures(material,material.vegetationTexture,prefix,material.name))if(!textures.some(t=>t.name===file.name))textures.push(file);
      const fileName = lod === 0 ? `${prefix}.fbx` : `${prefix}_LOD${lod}.fbx`;
      const bytes = new FBXExporter().register(preserveLeafTextureNames).parseSync(asset.group, {
        axisUp: 'Z', axisForward: '-Y', unitScale: 100, version: 7400,
        includeAnimations: false, embedTextures: false, customProperties: true,
        creator: 'BranchForge Procedural Branch Generator 4.0 CLI',
      });
      await writeFile(path.join(outputDirectory, fileName), bytes);
      reports.push({
        lod, file_name: fileName, branches: asset.branches.length, leaves: asset.placements.length, flowers: asset.blooms.length,
        vertices: asset.report.vertices, triangles: asset.report.triangles, valid: asset.report.ok,
        master_branches: asset.masterBranches.length, master_derived: true,
        generation_ms: Number((performance.now() - started).toFixed(2)),
        performance_ok: performance.now() - started <= settings.generation_budget_ms,
        triangle_budget_ok: asset.report.triangles <= settings.max_triangles,
      });
    }
    const rootBranches = new Set(assets[0].branches.map((branch) => branch.stableId));
    const rootLeaves = new Set(assets[0].placements.map((leaf) => leaf.stableId));
    const rootFlowers = new Set(assets[0].blooms.map((p) => p.stableId));
    const rootVegetation = new Set(assets[0].vegetation.placements.map(p => p.id));
    reports.forEach((report, index) => {
      report.master_derived = assets[index].branches.every((branch) => rootBranches.has(branch.stableId))
        && assets[index].placements.every((leaf) => rootLeaves.has(leaf.stableId))
        && assets[index].blooms.every((p) => rootFlowers.has(p.stableId))
        && assets[index].vegetation.placements.every(p => rootVegetation.has(p.id));
      report.valid = report.valid && report.master_derived;
    });
    const manifest = createManifest(assets[0], reports);
    for (const texture of textures) await writeFile(path.join(outputDirectory, texture.name), Buffer.from(texture.base64, 'base64'));
    manifest.vegetation_textures = textures.filter(t => t.slot.startsWith('M_Vegetation_')).map(({key,name,slot})=>({key,name,slot}));
    manifest.leaf_textures = textures.filter((t) => t.slot === 'M_Leaf').map(({ key, name }) => ({ key, name }));
    manifest.flower_textures = textures.filter((t) => t.slot === 'M_Flower').map(({ key, name }) => ({ key, name }));
    await writeFile(path.join(outputDirectory, `${prefix}.manifest.json`), JSON.stringify(manifest, null, 2), 'utf8');
    const bundle = { assets, lodReports: reports, settings, authoring, leafTextureFiles: manifest.leaf_textures, flowerTextureFiles: manifest.flower_textures, vegetationTextureFiles: manifest.vegetation_textures };
    const primaryPath = path.join(outputDirectory, `${prefix}.fbx`);
    if (settings.export_pcg_metadata) await writeFile(path.join(outputDirectory, `${prefix}.pcg.csv`), createPcgCsv(assets[0]), 'utf8');
    if (settings.export_ue_script) await writeFile(path.join(outputDirectory, `${prefix}.ue-import.py`), createUeImportScript(primaryPath, bundle), 'utf8');
    if (settings.export_material_setup) await writeFile(path.join(outputDirectory, `${prefix}.materials.json`), JSON.stringify(createMaterialSetup(bundle), null, 2), 'utf8');
    await writeFile(path.join(outputDirectory, `${prefix}.validation.json`), JSON.stringify(manifest.readiness, null, 2), 'utf8');
    await writeFile(path.join(outputDirectory, `${prefix}.recipe.json`), JSON.stringify(createRecipeDocument(bundle), null, 2), 'utf8');
    process.stdout.write(`BranchForge: ${prefix} -> ${outputDirectory}\n`);
  } finally {
    assets.forEach(disposeBranchAsset);
    disposeMaterials(materials);
  }
}
leafSources.forEach((source) => source.geometry.dispose());
