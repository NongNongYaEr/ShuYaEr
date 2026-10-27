/** Package a fitted vine as a complete branch assembly, not loose PVE leaves. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { hash } from './pve-package.mjs';
import { exportResolvedAssembly } from './export_branchforge_resolved_assembly.mjs';
import { checkPveGeometry } from './pve-geometry-quality.mjs';
import { writePveAtlas } from './pve-atlas.mjs';

export async function exportVineComplete({ tool, input, document, sourceBytes, output, progress }) {
  const imp = file => import(pathToFileURL(path.join(tool, file)).href);
  const k = await imp('web/branch-kernel.js'), T = await imp('web/vendor/three.module.min.js');
  const { normalizeAuthoring } = await imp('web/authoring-state.js');
  const { createPVESkeleton, validatePVESkeleton } = await imp('web/pve-skeleton-export.js');
  const { pveGlbMatrix } = await imp('web/pve-export.js');
  const { exportGlb } = await imp('web/glb-export.js');
  const authoring = normalizeAuthoring(document.authoring, document.settings.seed);
  if (!document.leaf_meshes?.length) throw Error('藤蔓完整包缺少叶片素材，请先选择当前植物的真实叶片包');
  if (!authoring.leaf_material?.color) throw Error('藤蔓缺少内嵌共享图集，请重新选择植物的模型与贴图后保存');
  const sources = document.leaf_meshes.map(s => ({ ...s, geometry: k.deserializeGeometry(s.geometry) }));
  const warnings = [], write = (name, data) => fs.writeFileSync(path.join(output, name), JSON.stringify(data, null, 2) + '\n');
  let asset;
  try {
    progress('生成骨架与样本枝', '生成当前整片藤蔓的完整装配：藤干、叶片及连接细茎');
    asset = k.buildBranchAsset(document.settings, null, sources, 0, authoring, { resolveSources: true });
    if (!asset.masterBranches.length) throw Error('当前藤蔓还没有藤干，请先生成或绘制生长路线');
    warnings.push(...checkPveGeometry(asset.report, '藤蔓实际装配'));
    const detail = createPVESkeleton(asset, sources);
    if (new Set(detail.foliage_sources.map(s => s.id)).size !== sources.length) throw Error('叶片素材稳定 ID 重复，请修正素材包');
    if (asset.masterPlacements.some(p => !Number.isInteger(p.source) || p.source < 0 || p.source >= sources.length))
      throw Error('部分叶片没有对应实际素材，不能生成完整包');
    // Retain one actual root as the structural host. Everything else is one
    // complete fitted assembly, baked once; never spawn thousands of leaf assets.
    const root = asset.masterBranches.find(b => b.parentId < 0);
    if (!root) throw Error('藤蔓没有可用的根连接点');
    const host = detail.branches.find(b => b.id === root.stableId);
    const connector = { position: root.points[0].toArray(), direction: root.points[1].clone().sub(root.points[0]).normalize().toArray() };
    const inverse = pveGlbMatrix(connector).invert();
    const pivot = new T.Vector3().applyMatrix4(inverse);
    const up = new T.Vector3(0, 1, 0).applyMatrix4(inverse).sub(pivot).normalize();
    const face = new T.Vector3(0, 0, 1).applyMatrix4(inverse).sub(pivot).normalize();
    const id = 'VINE_COMPLETE_' + hash(Buffer.from(root.stableId + ':' + authoring.seeds.shape)).slice(0, 16);
    const instance = { id: 'UNIT_' + id, branch_id: host.id, branch_t: 0, source_index: 0,
      position_m: pivot.toArray(), up: up.toArray(), face: face.toArray(), scale_m: 1, radial_scale: 1 };
    const organs = asset.treeOrgans.length + (asset.masterBlooms?.length || 0);
    const skeleton = { ...detail, branches: [host], foliage_sources: [{ id, name: '完整藤蔓装配' }], foliage: [instance],
      complete_unit_assembly: { unit_count: 1, source_mesh_count: 1, leaf_instances: 0, organ_instances: 0,
        baked_unit_leaves: detail.foliage.length, baked_unit_organs: organs, max_unit_root_error_m: pivot.distanceTo(root.points[0]) } };
    const group = asset.group.clone(true); group.name = id;
    const excluded = [];
    let unitTriangles = 0, hostTriangles = 0;
    group.traverseVisible(mesh => {
      if (!mesh.isMesh) return;
      if (mesh.userData.stable_id === host.id) { excluded.push(mesh); hostTriangles += mesh.geometry.index.count / 3; return; }
      unitTriangles += mesh.geometry.index.count / 3;
      for (const material of [mesh.material].flat()) {
        if (material.name === 'M_Leaf') material.color.set(material.vegetationTint || '#ffffff');
        for (const key of Object.keys(material)) if (material[key]?.isTexture) material[key] = null;
      }
    });
    excluded.forEach(mesh => mesh.removeFromParent());
    if (!hostTriangles || !unitTriangles || hostTriangles + unitTriangles !== asset.report.triangles)
      throw Error('完整藤蔓装配几何分配不完整，不能导出');
    progress('生成骨架与样本枝', `打包 1 个完整藤蔓单元（${asset.masterBranches.length} 段藤干，${detail.foliage.length} 片叶）`);
    const glb = id + '.glb', bytes = Buffer.from(await exportGlb(group, { connector, singleMesh: true }));
    fs.writeFileSync(path.join(output, glb), bytes);
    writePveAtlas(authoring.leaf_material.color, path.join(output, 'leaf_atlas_color.png'));
    if (authoring.leaf_material.normal) writePveAtlas(authoring.leaf_material.normal, path.join(output, 'leaf_atlas_normal.png'));
    // Keep audit data inside the existing manifest. The UE importer validates
    // report references against the established package file set.
    const manifest = { format: 'BranchForgeCompleteUnitSet', version: 1, package_kind: 'vine',
      source_whole_project: input, source_whole_sha256: hash(sourceBytes),
      strategy: 'One complete fitted vine assembly; wood, leaves and connector stems baked together; one actual root retained as structural host',
      authored_unit_classes: [id], radius_variant_mode: 'none', radius_levels_per_base: 1,
      radius_scale_policy: 'software_resolved_per_instance_geometry', standard_pve_radius_fidelity: 'not_exact',
      standard_pve_visual_fidelity: 'not_exact',
      fidelity_warning: 'Use the resolved assembly for the exact software result. Standard PVE may retessellate the retained structural host.',
      leaf_atlas_uv_transform: 'flip_v_in_ue_material', max_unit_root_error_m: skeleton.complete_unit_assembly.max_unit_root_error_m,
      max_relative_radius_error: 0, p95_relative_radius_error: 0, support_mesh_exported: false,
      vine_detail: { data: detail, sha256: hash(Buffer.from(JSON.stringify(detail))),
        branches: detail.branches.length, leaves: detail.foliage.length, sources: detail.foliage_sources.length,
        structural_host: host.id, structural_triangles: hostTriangles, unit_triangles: unitTriangles },
      units: [{ id, base_id: id, name: '完整藤蔓装配', radius_scale: 1, instance_count: 1, glb, glb_sha256: hash(bytes),
        triangles: unitTriangles, complete_unit_leaves: detail.foliage.length, complete_unit_organs: organs }] };
    progress('输出实际装配数据', '保留整片藤蔓的逐实例几何，并使用完整装配单元绑定');
    const resolved = await exportResolvedAssembly({ tool, document, skeleton, output, sourceSha256: hash(sourceBytes),
      asset, completeVineUnit: true, onQualityWarnings: items => warnings.push(...items) });
    manifest.resolved_assembly = skeleton.resolved_assembly = resolved;
    write('whole.pve-skeleton.json', skeleton); write('complete_units.manifest.json', manifest);
    write('validation.json', { ...validatePVESkeleton(skeleton), assembly: skeleton.complete_unit_assembly,
      package_kind: 'vine', sources: 1, support_mesh_exported: false, quality_warnings: [...new Set(warnings)], resolved_assembly: resolved });
    return { name: document.settings.object_name, package_kind: 'vine', branches: detail.branches.length,
      leaves: detail.foliage.length, leaf_sources: sources.length, units: 1, sources: 1,
      max_root_error_m: skeleton.complete_unit_assembly.max_unit_root_error_m, geometry: true, resolved_assembly: resolved };
  } finally { k.disposeBranchAsset(asset); sources.forEach(s => s.geometry.dispose()); }
}
