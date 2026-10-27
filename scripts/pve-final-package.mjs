import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createPveAtlas } from './pve-merged-atlas.mjs';
import { checkPveGeometry } from './pve-geometry-quality.mjs';
import { exportResolvedAssembly } from './export_branchforge_resolved_assembly.mjs';
import { extractPveUnitGeometry, hashPveUnitGeometry, equalPveUnitGeometry, disposePveUnitGeometry, rebuildPveUnitTangents } from './pve-final-geometry.mjs';
import { createPveBarkExporter } from './pve-bark-materials.mjs';
import { fitPveUnitPair, matchesTransformedPveGeometry } from './pve-unit-reuse.mjs';

export async function generateFinalCompletePackage({ tool, input, document, sourceBytes, output, progress }) {
  const imp = relative => import(pathToFileURL(path.join(tool, relative)).href);
  const k = await imp('web/branch-kernel.js');
  const { normalizeAuthoring } = await imp('web/authoring-state.js');
  const { resolvePveExportPlan } = await imp('web/pve-export-plan.js');
  const { createPVESkeleton, validatePVESkeleton } = await imp('web/pve-skeleton-export.js');
  const { exportGlb } = await imp('web/glb-export.js');
  const { sampleLeafMaterial } = await imp('web/leaf-material-data.js');
  const { sampleLine } = await imp('web/tree-sculpt.js');
  const T = await imp('web/vendor/three.module.min.js');
  const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
  const settings = k.normalizeSettings({ ...document.settings, preview_lod: 0 });
  const authoring = normalizeAuthoring(document.authoring, settings.seed);
  const sources = (document.leaf_meshes || []).map(source => ({ ...source, geometry: k.deserializeGeometry(source.geometry) }));
  const warnings = [], unitGroups = [];
  const barkExporter = createPveBarkExporter(output);
  let asset, placementBaseline;
  const baselineGroups=[];
  try {
    progress('生成骨架与样本枝', '解析最终承重枝、完整成品枝及局部精修');
    asset = k.buildBranchAsset(settings, null, sources, 0, authoring);
    warnings.push(...checkPveGeometry(asset.report, '整树实际装配'));
    const plan = resolvePveExportPlan(asset, authoring);
    if (!plan.units.length) throw Error('工程没有可交付的完整成品枝实例');
    const skeleton = createPVESkeleton({ ...asset, masterBranches: plan.structuralBranches,
      masterPlacements: [], placements: [] }, []);
    skeleton.kind = 'whole_plant'; skeleton.connector = null;
    skeleton.name = document.settings.object_name;
    const textures = [], textureObjects = new Set(), untexturedMaterials = [];
    const addTexture = texture => { if (texture && !textureObjects.has(texture)) { textureObjects.add(texture); textures.push(texture); } };
    addTexture(authoring.leaf_material);
    plan.units.forEach(unit => { if (unit.sourceAsset.sample) addTexture(sampleLeafMaterial(unit.sourceAsset.sample, authoring.branch_library, authoring.leaf_material)); });
    asset.group.traverse(mesh => {
      for (const material of [mesh.material].flat().filter(Boolean)) {
        if (material.sampleLeafMaterial) addTexture(material.sampleLeafMaterial);
        if (material.name === 'M_Leaf' || material.sampleLeafMaterial) {
          const texture = material.sampleLeafMaterial || authoring.leaf_material;
          if (!texture?.color) untexturedMaterials.push(texture);
        }
      }
    });
    progress('准备交付图集', '按实际完整枝材质合并图集，保留原图像素');
    const atlas = createPveAtlas(textures, output, {untexturedMaterials});
    unitGroups.push(...extractPveUnitGeometry(asset, plan, atlas));
    const extractionTransforms=plan.units.map(unit=>unit.transform.clone());
    // UNIT_PLACEMENT is a whole-model transform. Its pre-placement meshes are
    // the stable payload; the live geometry proves whether later edits still
    // allow that payload to be reused. Never regenerate the user's document.
    const modelGeometry=new Map();
    if(authoring.sculpt_layers.some(layer=>layer.enabled!==false&&layer.operation?.type==='UNIT_PLACEMENT')){
      const baselineAuthoring={...authoring,sculpt_layers:authoring.sculpt_layers.filter(layer=>layer.operation?.type!=='UNIT_PLACEMENT')};
      placementBaseline=k.buildBranchAsset(settings,null,sources,0,baselineAuthoring);
      const basePlan=resolvePveExportPlan(placementBaseline,baselineAuthoring);
      baselineGroups.push(...extractPveUnitGeometry(placementBaseline,basePlan,atlas));
      const baseById=new Map(basePlan.units.map((u,i)=>[u.id,{unit:u,group:baselineGroups[i]}]));
      for(const [i,unit] of plan.units.entries()){
        const base=baseById.get(unit.id);if(!unit.variantRequired||!base?.unit.variantRequired||!unit.branches.some(branch=>branch.legacyRigidGeometry))continue;
        const transform=fitPveUnitPair(base.unit,unit);
        if(transform&&matchesTransformedPveGeometry(unitGroups[i],unit.transform,base.group,transform)){
          unit.transform=transform;modelGeometry.set(unit.id,{group:base.group,asset:placementBaseline,unit:base.unit});
        }
      }
    }
    const classes = new Map();
    let sharedVariants=0;
    for (const [index, unit] of plan.units.entries()) {
      const baseId = unit.sourceAsset.id;
      const current = authoring.branch_library.find(item => item.id === baseId);
      const revisionId = unit.sourceAsset.revision === current?.revision ? baseId : `${baseId}_REV${unit.sourceAsset.revision}`;
      const geometry=modelGeometry.get(unit.id)||{group:unitGroups[index],asset,unit};
      // A different attachment frame is not different model content. Prove a
      // rigid/scaled payload match before sharing an existing complete variant.
      let shared;
      if(unit.variantRequired)for(const candidate of classes.values()){
        if(candidate.base_id!==baseId||!candidate.group)continue;
        const transform=fitPveUnitPair(candidate.representative,unit);
        if(transform&&matchesTransformedPveGeometry(unitGroups[index],extractionTransforms[index],candidate.group,transform)){
          shared=candidate;unit.transform=transform;break;
        }
      }
      if(shared){shared.instance_count++;unit.source_id=shared.id;sharedVariants++;continue;}
      let contentHash = unit.variantRequired ? hashPveUnitGeometry(geometry.group, geometry.asset, geometry.unit) : null;
      let id = contentHash ? `${revisionId.slice(0, 96)}_V${contentHash.slice(0, 20)}` : revisionId;
      if (classes.has(id) && contentHash && !equalPveUnitGeometry(classes.get(id).group, geometry.group)) {
        contentHash = hashPveUnitGeometry(geometry.group);
        id = `${revisionId.slice(0, 96)}_V${contentHash.slice(0, 20)}`;
      }
      if (!classes.has(id)) classes.set(id, { id, base_id: baseId, revision: unit.sourceAsset.revision,
        radius_scale: 1, instance_count: 0, sourceAsset: unit.sourceAsset,
        connector: unit.connector, group: unit.variantRequired ? geometry.group : null,
        content_sha256: contentHash, representative: unit });
      classes.get(id).instance_count++;
      unit.source_id = id;
    }
    const ordered = [...classes.values()].sort((a, b) => a.id.localeCompare(b.id));
    const sourceIndex = new Map(ordered.map((source, index) => [source.id, index]));
    let maxRootError = 0;
    const foliage = plan.units.map(unit => {
      unit.source_index = sourceIndex.get(unit.source_id);
      const position = new T.Vector3().applyMatrix4(unit.transform);
      const up = new T.Vector3(0, 1, 0).applyMatrix4(unit.transform).sub(position);
      const face = new T.Vector3(0, 0, 1).applyMatrix4(unit.transform).sub(position);
      const scale = up.length(); up.normalize(); face.normalize();
      const parent = unit.parent || unit.host;
      const hostPosition = sampleLine(parent.points,unit.root.parentT);
      maxRootError = Math.max(maxRootError, position.distanceTo(hostPosition));
      return { id: `UNIT_${unit.id}`, branch_id: unit.host.stableId, branch_t: unit.hostT,
        source_index: unit.source_index, position_m: position.toArray(), up: up.toArray(), face: face.toArray(),
        scale_m: scale, radial_scale: Number(unit.sourceInstance?.radius_scale || 1),
        ...(unit.parentUnitId ? {parent_unit_id:`UNIT_${unit.parentUnitId}`,parent_unit_branch_id:unit.parent.stableId,parent_unit_t:unit.root.parentT} : {}) };
    });
    const countUnits = (unit, kind) => (kind === 'LEAF' ? unit.leaves : unit.organs).length;
    Object.assign(skeleton, { foliage_sources: ordered.map(source => ({ id: source.id, name: source.id })), foliage,
      complete_unit_assembly: { unit_count: foliage.length, source_mesh_count: ordered.length,
        leaf_instances: 0, organ_instances: 0, baked_unit_leaves: 0, baked_unit_organs: 0,
        max_unit_root_error_m: maxRootError } });
    const validation = validatePVESkeleton(skeleton);
    if (!validation.valid) throw Error('完整枝骨架无效：' + validation.errors.slice(0, 8).join('；'));
    const manifest = { format: 'BranchForgeCompleteUnitSet', version: 1,
      source_whole_project: input, source_whole_sha256: sha(sourceBytes),
      strategy: 'Reusable authored complete-unit classes and independently mounted nested units; complete variants for historical edited families',
      authored_unit_classes: [...new Set(plan.units.map(unit => unit.sourceAsset.id))],
      radius_variant_mode: 'none', radius_scale_policy: 'software_resolved_per_instance_geometry',
      standard_pve_radius_fidelity: 'unsupported', standard_pve_visual_fidelity: 'not_exact',
      local_variant_mesh_policy: 'baked_final_geometry_deduplicated_by_content',
      fidelity_warning: 'Local variants retain final unit geometry. Shared unedited classes remain reusable; the resolved assembly is the exact software result, including per-instance radius and foliage.',
      leaf_atlas_uv_transform: 'flip_v_in_ue_material', radius_levels_per_base: 1,
      max_unit_root_error_m: maxRootError, max_relative_radius_error: Math.max(...plan.units.map(unit => Math.abs((unit.sourceInstance?.radius_scale || 1) - 1) / (unit.sourceInstance?.radius_scale || 1))),
      p95_relative_radius_error: [...plan.units.map(unit => Math.abs((unit.sourceInstance?.radius_scale || 1) - 1) / (unit.sourceInstance?.radius_scale || 1))].sort((a,b) => a-b)[Math.floor(plan.units.length * .95)],
      units: [] };
    manifest.model_reuse = { policy:'complete_geometry_verified_rigid_reuse',
      source_models:ordered.filter(source=>!source.group).length,
      historical_complete_models:ordered.filter(source=>source.group).length,
      stable_placement_instances:modelGeometry.size, shared_historical_instances:sharedVariants };
    const recovered = plan.units.filter(unit => unit.sourceRecovery === 'snapshot_geometry');
    if (recovered.length) {
      manifest.legacy_snapshot_recovery = { policy: 'saved_complete_geometry_no_source_guess',
        instance_ids: recovered.map(unit => unit.id), count: recovered.length };
      warnings.push(`${recovered.length} 个旧版复制单元枝缺少素材来源，已按保存的完整枝叶几何交付；未替换为当前库素材。`);
    }
    if (atlas) manifest.merged_atlas = { width: atlas.width, height: atlas.height, regions: atlas.sources,
      policy: 'original_pixels_export_only_uv_remap' };
    for (const [index, source] of ordered.entries()) {
      progress('生成骨架与样本枝', `正在生成 ${index + 1}/${ordered.length}：${source.id}`);
      let bytes, triangles, leaves, organs;
      if (source.group) {
        rebuildPveUnitTangents(source.group);
        barkExporter.capture(source.group);
        triangles = source.group.children.reduce((count, mesh) => count + mesh.geometry.index.count / 3, 0);
        if (!triangles) throw Error('局部完整枝没有可交付几何：' + source.id);
        bytes = Buffer.from(await exportGlb(source.group, { singleMesh: true,
          connector: { position: [0,0,0], direction: [0,1,0] } }));
        leaves = countUnits(source.representative, 'LEAF'); organs = countUnits(source.representative, 'ORGAN');
      } else {
        const sample = source.sourceAsset.sample;
        const localSources = sample.leaf_meshes.map(item => ({ ...item, geometry: k.deserializeGeometry(item.geometry) }));
        let built;
        try {
          const unitAuthoring = normalizeAuthoring({ ...sample.authoring,
            leaf_material: sampleLeafMaterial(sample, authoring.branch_library, authoring.leaf_material) }, sample.settings.seed);
          built = k.buildBranchAsset(k.normalizeSettings({ ...sample.settings, export_lods: false, preview_lod: 0 }), null, localSources, 0, unitAuthoring);
          warnings.push(...checkPveGeometry(built.report, source.id));
          barkExporter.capture(built.group);
          built.group.traverse(mesh => {
            if (!mesh.material) return;
            for (const material of [mesh.material].flat()) {
              if (material.name === 'M_Leaf' || material.sampleLeafMaterial) {
                const texture = material.sampleLeafMaterial || unitAuthoring.leaf_material;
                if (texture?.color) material.color.set(material.vegetationTint || '#ffffff');
                if (atlas) {
                  const uv = mesh.geometry.getAttribute('uv');
                  for (let v = 0; v < uv.count; v++) uv.setXY(v, ...atlas.uv(texture, uv.getX(v), uv.getY(v)));
                }
              }
              for (const key of Object.keys(material)) if (material[key]?.isTexture) material[key] = null;
            }
          });
          bytes = Buffer.from(await exportGlb(built.group, { connector: source.connector, singleMesh: true }));
          triangles = built.report.triangles; leaves = built.masterPlacements.length; organs = built.treeOrgans.length;
        } finally { k.disposeBranchAsset(built); localSources.forEach(item => item.geometry.dispose()); }
      }
      const glb = source.id + '.glb'; fs.writeFileSync(path.join(output, glb), bytes);
      manifest.units.push({ id: source.id, base_id: source.base_id, revision: source.revision,
        radius_scale: 1, instance_count: source.instance_count, glb, glb_sha256: sha(bytes), triangles,
        complete_unit_leaves: leaves, complete_unit_organs: organs,
        ...(source.content_sha256 ? { variant_kind: 'final_complete_unit', content_sha256: source.content_sha256 } : {}),
        ...(source.representative.sourceRecovery ? { source_recovery: source.representative.sourceRecovery } : {}) });
      const barkBindings = barkExporter.glbBindings(bytes);
      if (barkBindings) manifest.units.at(-1).bark_material_bindings = barkBindings;
      skeleton.complete_unit_assembly.baked_unit_leaves += leaves * source.instance_count;
      skeleton.complete_unit_assembly.baked_unit_organs += organs * source.instance_count;
    }
    progress('输出实际装配数据', '保存完整单元的独立挂接与精确枝叶，旧精修家族整体保留，几何只输出一次');
    const resolved = await exportResolvedAssembly({ tool, document, skeleton, output,
      sourceSha256: sha(sourceBytes), asset, atlas, exportPlan: plan, barkExporter,
      onQualityWarnings: items => warnings.push(...items) });
    skeleton.resolved_assembly = resolved; manifest.resolved_assembly = resolved;
    fs.writeFileSync(path.join(output, 'whole.pve-skeleton.json'), JSON.stringify(skeleton, null, 2) + '\n');
    fs.writeFileSync(path.join(output, 'complete_units.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({ ...validation,
      assembly: skeleton.complete_unit_assembly, sources: ordered.length, quality_warnings: warnings,
      model_reuse: manifest.model_reuse,
      fixed_mesh_fallback_radius_p95_error: manifest.p95_relative_radius_error,
      resolved_assembly: resolved, standard_pve_radius_fidelity: manifest.standard_pve_radius_fidelity }, null, 2) + '\n');
    return { name: settings.object_name, branches: skeleton.branches.length, units: foliage.length,
      sources: ordered.length, max_root_error_m: maxRootError, geometry: true,
      model_reuse: manifest.model_reuse,
      fixed_mesh_fallback_radius_p95_error: manifest.p95_relative_radius_error, resolved_assembly: resolved };
  } finally {
    unitGroups.forEach(disposePveUnitGeometry);baselineGroups.forEach(disposePveUnitGeometry);k.disposeBranchAsset(placementBaseline); k.disposeBranchAsset(asset); sources.forEach(source => source.geometry.dispose());
  }
}
