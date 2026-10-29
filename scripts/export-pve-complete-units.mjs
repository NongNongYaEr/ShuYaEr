/** Export a BranchForge whole-tree project as reusable complete-unit PVE data.
 *  Usage: node --experimental-loader TOOL/vendor-loader.mjs this-file.mjs
 *    --tool TOOL --project TREE.branch.json --out DIRECTORY [--geometry] [--keep-history]
 *  Default: one GLB per authored complete-branch class. The optional
 *  --radius-variants mode is retained only for comparing the old PVE workaround.
 *  The source project is read only. --geometry writes texture-free GLBs plus
 *  the shared atlas PNG for Unreal material assignment.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { packageTransaction } from './pve-package.mjs';
import { checkPveGeometry } from './pve-geometry-quality.mjs';
import { exportResolvedAssembly } from './export_branchforge_resolved_assembly.mjs';
import { exportVineComplete } from './export-pve-vine.mjs';
import { createPveAtlas } from './pve-merged-atlas.mjs';
import { generateFinalCompletePackage } from './pve-final-package.mjs';
import { createPveBarkExporter } from './pve-bark-materials.mjs';

const args = process.argv.slice(2);
const option = key => { const i = args.indexOf(key); return i < 0 ? '' : args[i + 1] || ''; };
const tool = path.resolve(option('--tool') || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const input = path.resolve(option('--project'));
const destination = path.resolve(option('--out'));
if (!option('--project') || !option('--out')) throw Error('需要 --project 整树.branch.json --out 交付目录');
const geometry = args.includes('--geometry');
const radiusVariants = args.includes('--radius-variants');
const generatePackage = async (out, sourceBytes, progress) => {
const qualityWarnings = [];
const barkExporter = createPveBarkExporter(out);
const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const read = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const imp = relative => import(pathToFileURL(path.join(tool, relative)).href);
const kernel = await imp('web/branch-kernel.js');
const { migrateProjectDocument, normalizeAuthoring } = await imp('web/authoring-state.js');
const { createPVESkeleton, validatePVESkeleton } = await imp('web/pve-skeleton-export.js');
const { pveBranchConnector, pveGlbMatrix } = await imp('web/pve-export.js');
const { instanceMatrix } = await imp('web/branch-instance-edit.js');
const { sampleLine } = await imp('web/tree-sculpt.js');
const { exportGlb } = await imp('web/glb-export.js');
const { sampleLeafMaterial } = await imp('web/leaf-material-data.js');
const THREE = await imp('web/vendor/three.module.min.js');
if (!globalThis.FileReader) globalThis.FileReader = class {
  async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend?.(); }
  async readAsDataURL(blob) { this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onloadend?.(); }
};


const doc = migrateProjectDocument(JSON.parse(sourceBytes.toString('utf8').replace(/^\uFEFF/, '')));
const authoring = normalizeAuthoring(doc.authoring, doc.settings.seed);
if (authoring.vine || authoring.surface_growth?.enabled) {
  if (!geometry || radiusVariants || args.includes('--metadata-only')) throw Error('藤蔓完整包需要 --geometry，不支持半包或粗细变体模式');
  return exportVineComplete({ tool, input, document: doc, sourceBytes, output: out, progress });
}
const library = authoring.branch_library || [];
const instances = authoring.branch_instances || [];
if (geometry && !radiusVariants && !args.includes('--metadata-only')) {
  // A sculpted/AI trunk can be a complete plant before any crown units are
  // mounted. Validate its actual geometry and sources in the final graph;
  // an empty unit library is not evidence that this is an incomplete project.
  if (!authoring.branch_shape?.branches?.length)
    throw Error('工程缺少可导出的承重骨架，请先完成树干整理或装配整树');
  return generateFinalCompletePackage({ tool, input, document: doc, sourceBytes, output: out, progress });
}
if (!authoring.recipe.tags.includes('WHOLE_PLANT') || !library.length || !instances.length ||
    !authoring.branch_shape?.branches?.length) throw Error('工程不是已装配完整样本枝的整树');
if (instances.some(item => !item.parent))
  throw Error('工程使用地面锚点的草本/地被实例；当前 PVE 完整枝包仅支持挂在承重枝上的乔灌木，请使用地表散布导出流程');
const libraryById = new Map(library.map(item => [item.id, item]));
if (libraryById.size !== library.length || instances.some(item => !libraryById.has(item.asset_id)))
  throw Error('完整枝 ID 缺失、重复或实例引用未知枝类');
if ((!geometry || radiusVariants || args.includes('--metadata-only')) && (Object.keys(authoring.overrides || {}).some(key => instances.some(i => key.startsWith(i.id + '.'))) ||
    (authoring.sculpt_layers || []).some(layer => Object.keys(layer.branches || {}).some(key => instances.some(i => key.startsWith(i.id + '.'))))))
  throw Error('工程含逐实例枝条雕刻，不能用共享 StaticMesh 准确复现');

// Optional compatibility mode for projects that require per-instance wood
// radius fidelity. The normal workflow keeps one mesh per authored class.
function radialLevels(values, maxLevels = 12) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.some(v => !Number.isFinite(v) || v <= 0)) throw Error('次枝粗细倍率无效');
  const unique = [...new Set(sorted.map(v => +v.toFixed(4)))];
  if (unique.length <= maxLevels) return unique;
  // Multiplicative spacing bounds relative radius error across the full range;
  // quantile bins overfit the many thick shoots and badly distort rare thin ones.
  const min = sorted[0], max = sorted.at(-1);
  const result = Array.from({ length: maxLevels }, (_, i) =>
    +(min * Math.pow(max / min, i / (maxLevels - 1))).toFixed(4));
  return [...new Set(result)];
}
const levelByAsset = new Map(library.map(asset => [asset.id,
  radiusVariants
    ? radialLevels(instances.filter(i => i.asset_id === asset.id).map(i => Number(i.radius_scale || 1)))
    : [1]]));
const nearest = (value, levels) => levels.reduce((best, item) =>
  Math.abs(item - value) < Math.abs(best - value) ? item : best, levels[0]);
const plans = new Map();
const assigned = instances.map(inst => {
  const radius = Number(inst.radius_scale || 1);
  const baked = nearest(radius, levelByAsset.get(inst.asset_id));
  const id = radiusVariants
    ? `${inst.asset_id}_R${String(Math.round(baked * 10000)).padStart(5, '0')}`
    : inst.asset_id;
  if (!plans.has(id)) plans.set(id, { id, base_id: inst.asset_id, radius_scale: baked, instance_count: 0 });
  plans.get(id).instance_count++;
  return { inst, id, actual: radius, baked, relative_error: Math.abs(radius - baked) / radius };
});
const ordered = [...plans.values()].sort((a, b) => a.id.localeCompare(b.id));
const sourceIndex = new Map(ordered.map((plan, i) => [plan.id, i]));
const structuralSettings = kernel.normalizeSettings({ ...doc.settings, leaf_density: 0, max_leaves: 0,
  buds_enabled: false, fruit_enabled: false, export_lods: false, preview_lod: 0 });
const structuralAuthoring = normalizeAuthoring({ ...doc.authoring, branch_instances: [], branch_library: [],
  tree_organs: { ...doc.authoring.tree_organs, units: [], amount: 0 },
  leaf_edits: { added: [], removed: [] } }, structuralSettings.seed);
const structuralAsset = kernel.buildBranchAsset(structuralSettings, null, [], 0, structuralAuthoring);
let skeleton;
try {
  if (structuralAsset.masterBranches.length !== authoring.branch_shape.branches.length)
    throw Error(`承重枝数量变化：${structuralAsset.masterBranches.length} != ${authoring.branch_shape.branches.length}`);
  skeleton = createPVESkeleton(structuralAsset, []);
  const byId = new Map(structuralAsset.masterBranches.map(branch => [branch.stableId, branch]));
  const sourceData = new Map();
  for (const plan of ordered) {
    const lib = libraryById.get(plan.base_id);
    const sample = lib.sample;
    if (!sample?.settings || !sample?.authoring || !sample?.leaf_meshes) throw Error(`${lib.id} 缺少内嵌完整枝工程`);
    const sampleAuthoring = normalizeAuthoring(sample.authoring, sample.settings.seed);
    // Some upgraded embedded units retain a WHOLE_PLANT tag from their source
    // profile. The explicit PLANT_UNIT_ASSEMBLY tag and authored connector take
    // precedence here because these records are installed as reusable units.
    const connector = pveBranchConnector(sampleAuthoring) ||
      (sampleAuthoring.recipe.tags.includes('PLANT_UNIT_ASSEMBLY')
        ? sampleAuthoring.branch_shape.connector : null);
    if (!connector) throw Error(`${lib.id} 缺少 PVE 根连接点`);
    sourceData.set(plan.id, { lib, sample, connector });
  }
  let maxRootError = 0;
  const foliage = assigned.map(({ inst, id }) => {
    const parent = byId.get(inst.parent);
    if (!parent || !Number.isFinite(inst.attach) || inst.attach < 0 || inst.attach > 1)
      throw Error(`${inst.id} 的承重母枝或挂点无效`);
    const { lib, connector } = sourceData.get(id);
    const transform = instanceMatrix(inst, lib.shape, structuralAsset.masterBranches, structuralSettings)
      .multiply(pveGlbMatrix(connector).clone().invert());
    const pivot = new THREE.Vector3().applyMatrix4(transform);
    const up = new THREE.Vector3(0, 1, 0).applyMatrix4(transform).sub(pivot.clone());
    const face = new THREE.Vector3(0, 0, 1).applyMatrix4(transform).sub(pivot.clone());
    const scale = up.length(); up.normalize(); face.normalize();
    // Actual root position of this instance must coincide with the PVE pivot.
    const host = sampleLine(parent.points,inst.attach);
    maxRootError = Math.max(maxRootError, pivot.distanceTo(host));
    return { id: `UNIT_${inst.id}`, branch_id: inst.parent, branch_t: inst.attach,
      source_index: sourceIndex.get(id), position_m: pivot.toArray(),
      up: up.toArray(), face: face.toArray(), scale_m: scale,
      radial_scale: Number(inst.radius_scale || 1) };
  });
  skeleton = { ...skeleton, name: doc.settings.object_name, branches: skeleton.branches,
    foliage_sources: ordered.map(plan => ({ id: plan.id, name: plan.id })), foliage,
    complete_unit_assembly: { unit_count: foliage.length, source_mesh_count: ordered.length,
      leaf_instances: 0, organ_instances: 0, baked_unit_leaves: 0, baked_unit_organs: 0,
      max_unit_root_error_m: maxRootError } };
  const result = validatePVESkeleton(skeleton);
  if (!result.valid) throw Error(`完整枝骨架无效：${result.errors.slice(0, 8).join('；')}`);
  fs.mkdirSync(out, { recursive: true });
  const skeletonPath = path.join(out, 'whole.pve-skeleton.json');
  fs.writeFileSync(skeletonPath, JSON.stringify(skeleton, null, 2) + '\n');
  const manifest = { format: 'BranchForgeCompleteUnitSet', version: 1,
    source_whole_project: input, source_whole_sha256: sha(sourceBytes),
    strategy: radiusVariants
      ? 'Authored complete-shoot classes plus optional radial mesh variants; leaves and organs baked in mesh'
      : 'One complete-shoot mesh per authored class; leaves and organs baked in mesh',
    authored_unit_classes: library.map(asset => asset.id),
    radius_variant_mode: radiusVariants ? 'opt_in_baked' : 'none',
    radius_scale_policy: radiusVariants ? 'nearest_baked_mesh' : 'json_metadata_not_rendered_by_standard_pve',
    standard_pve_radius_fidelity: radiusVariants ? 'approximated' : 'unsupported',
    standard_pve_visual_fidelity: 'not_exact',
    fidelity_warning: 'BranchGenerator regenerates foliage and organs with per-instance seeds; repeating fixed complete-unit GLBs does not reproduce the source whole tree. Use the software-generated whole-tree reference mesh for exact visual comparison.',
    leaf_atlas_uv_transform: 'flip_v_in_ue_material',
    radius_levels_per_base: radiusVariants ? 12 : 1, max_unit_root_error_m: maxRootError,
    max_relative_radius_error: Math.max(...assigned.map(a => a.relative_error)),
    p95_relative_radius_error: [...assigned.map(a => a.relative_error)].sort((a, b) => a - b)[Math.floor(assigned.length * .95)],
    units: ordered.map(plan => ({ ...plan, glb: plan.id + '.glb',
      glb_sha256: null, triangles: null, complete_unit_leaves: null, complete_unit_organs: null })) };
  progress('准备交付图集', '合并已用素材图集，保留各自叶片与花果贴图');
  const sampleMaterials=[...sourceData.values()].map(({lib,sample}) => {
    const material=sampleLeafMaterial(sample,library,authoring.leaf_material);
    if(!material?.color) throw Error(`${lib.id} 缺少完整枝图集，请重新选择素材后保存`);
    return material;
  });
  const atlas = createPveAtlas([authoring.leaf_material,...sampleMaterials],out);
  if (atlas) manifest.merged_atlas = { width:atlas.width,height:atlas.height,regions:atlas.sources,
    policy:'original_pixels_export_only_uv_remap' };
  if (geometry) {
    for (const plan of manifest.units) {
      progress('生成骨架与样本枝', `正在生成 ${manifest.units.indexOf(plan) + 1}/${manifest.units.length}：${plan.id}`);
      const { sample, connector } = sourceData.get(plan.id);
      const unitAuthoring = structuredClone(sample.authoring);
      unitAuthoring.leaf_material = sampleLeafMaterial(sample,library,authoring.leaf_material);
      for (const branch of unitAuthoring.branch_shape.branches) {
        branch.start_radius *= plan.radius_scale;
        branch.end_radius *= plan.radius_scale;
      }
      const settings = kernel.normalizeSettings({ ...sample.settings, export_format: 'GLB', export_lods: false,
        preview_lod: 0, export_profile: 'STANDARD', merge_by_material: true });
      const leafMeshes = sample.leaf_meshes.map(item => ({ ...item, geometry: kernel.deserializeGeometry(item.geometry) }));
      const materials = kernel.createBranchMaterials(settings);
      let unit;
      try {
        unit = kernel.buildBranchAsset(settings, materials, leafMeshes, 0,
          normalizeAuthoring(unitAuthoring, settings.seed));
        qualityWarnings.push(...checkPveGeometry(unit.report, plan.id));
        barkExporter.capture(unit.group);
        unit.group.traverse(node => {
          if (!node.material) return;
          if (atlas && !Array.isArray(node.material) && (node.material.name === 'M_Leaf' || node.material.sampleLeafMaterial)) {
            const uv=node.geometry.getAttribute('uv');
            const texture=node.material.sampleLeafMaterial || unitAuthoring.leaf_material;
            for(let i=0;i<uv.count;i++) uv.setXY(i,...atlas.uv(texture,uv.getX(i),uv.getY(i)));
          }
          for (const material of [node.material].flat()) {
            for (const key of Object.keys(material)) if (material[key]?.isTexture) material[key] = null;
            material.needsUpdate = true;
          }
        });
        const bytes = Buffer.from(await exportGlb(unit.group, { connector, singleMesh: true }));
        fs.writeFileSync(path.join(out, plan.glb), bytes);
        plan.glb_sha256 = sha(bytes);
        const barkBindings = barkExporter.glbBindings(bytes);
        if (barkBindings) plan.bark_material_bindings = barkBindings;
        plan.triangles = unit.report.triangles;
        plan.complete_unit_leaves = unit.masterPlacements.length;
        plan.complete_unit_organs = unit.treeOrgans.length;
        skeleton.complete_unit_assembly.baked_unit_leaves += unit.masterPlacements.length * plan.instance_count;
        skeleton.complete_unit_assembly.baked_unit_organs += unit.treeOrgans.length * plan.instance_count;
      } finally {
        kernel.disposeBranchAsset(unit);
        kernel.disposeMaterials(materials);
        leafMeshes.forEach(item => item.geometry.dispose());
      }
    }
    fs.writeFileSync(skeletonPath, JSON.stringify(skeleton, null, 2) + '\n');
  }
  if (!radiusVariants && !args.includes('--metadata-only')) {
    progress('输出实际装配数据', '保留逐实例枝形、粗细、叶片和花果');
    const resolved = await exportResolvedAssembly({ tool, document: doc, skeleton, output: out, sourceSha256: sha(sourceBytes),
      atlas,barkExporter,onQualityWarnings: warnings => qualityWarnings.push(...warnings) });
    skeleton.resolved_assembly = resolved;
    manifest.resolved_assembly = resolved;
    manifest.radius_scale_policy = 'software_resolved_per_instance_geometry';
    manifest.fidelity_warning = 'Exact software geometry is stored in the resolved assembly sidecar, including per-instance wood, foliage and organs. Fixed class meshes alone are only a fallback; use the BranchForge assembly node for the software result.';
    fs.writeFileSync(skeletonPath, JSON.stringify(skeleton, null, 2) + '\n');
  }
  fs.writeFileSync(path.join(out, 'complete_units.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'validation.json'), JSON.stringify({ ...result, assembly: skeleton.complete_unit_assembly,
    sources: ordered.length, quality_warnings: qualityWarnings, fixed_mesh_fallback_radius_p95_error: manifest.p95_relative_radius_error,
    resolved_assembly: skeleton.resolved_assembly || null,
    standard_pve_radius_fidelity: manifest.standard_pve_radius_fidelity }, null, 2) + '\n');
  return { name: doc.settings.object_name, branches: skeleton.branches.length, units: assigned.length,
    sources: ordered.length, max_root_error_m: maxRootError,
    fixed_mesh_fallback_radius_p95_error: manifest.p95_relative_radius_error,
    resolved_assembly: skeleton.resolved_assembly || null, geometry };
} finally { kernel.disposeBranchAsset(structuralAsset); }

};
if (geometry && !radiusVariants && !args.includes('--metadata-only')) {
  await packageTransaction({ input, destination, statusPath: option('--status'), generate: generatePackage, keepHistory: args.includes('--keep-history') });
} else {
  console.log(JSON.stringify(await generatePackage(destination, fs.readFileSync(input), (stage, detail) => console.log(stage, detail))));
}
