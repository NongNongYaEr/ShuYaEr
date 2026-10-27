const filename = (value) => String(value || '').split(/[\\/]/).pop();

export function createPcgCsv(asset) {
  const rows = ['StableId,ParentId,Order,LengthM,StartRadiusM,TipX,TipY,TipZ,Health,Recipe,Season'];
  asset.branches.forEach((branch) => {
    const parent = branch.parentId < 0 ? '' : asset.branches.find((item) => item.id === branch.parentId)?.stableId || '';
    const tip = branch.points.at(-1);
    rows.push([
      branch.stableId, parent, branch.order, branch.length.toFixed(5), branch.startRadius.toFixed(5),
      tip.x.toFixed(5), tip.y.toFixed(5), tip.z.toFixed(5), asset.settings.health.toFixed(3),
      `"${asset.authoring.recipe.name.replace(/"/g, '""')}"`, asset.settings.season,
    ].join(','));
  });
  return rows.join('\r\n');
}

export function createUeImportScript(outputPath, bundle) {
  const filenames = bundle.lodReports.map((report, index) => index === 0 ? filename(outputPath) : filename(outputPath.replace(/\.fbx$/i, `_LOD${report.lod}.fbx`)));
  const assetName = bundle.settings.object_name.replace(/[^A-Za-z0-9_\u4e00-\u9fff]/g, '_');
  const screenSizes = bundle.settings.export_profile === 'MOBILE' ? [1, 0.55, 0.25, 0.08] : [1, 0.65, 0.35, 0.12];
  return `# BranchForge 4.0 - Unreal Engine 5.6/5.7 editor-only import helper\nimport os\nimport unreal\n\nROOT = os.path.dirname(os.path.abspath(__file__))\nFILES = ${JSON.stringify(filenames)}\nDESTINATION = ${JSON.stringify(bundle.settings.ue_destination)}\nASSET_NAME = ${JSON.stringify(assetName)}\nLOD_SCREEN_SIZES = ${JSON.stringify(screenSizes)}\nNANITE_POLICY = ${JSON.stringify(bundle.settings.nanite_policy)}\n\noptions = unreal.FbxImportUI()\noptions.import_as_skeletal = False\noptions.import_materials = False\noptions.import_textures = False\noptions.static_mesh_import_data.combine_meshes = True\noptions.static_mesh_import_data.import_mesh_lo_ds = False\noptions.static_mesh_import_data.vertex_color_import_option = unreal.VertexColorImportOption.REPLACE\n\ntask = unreal.AssetImportTask()\ntask.filename = os.path.join(ROOT, FILES[0])\ntask.destination_path = DESTINATION\ntask.destination_name = ASSET_NAME\ntask.automated = True\ntask.replace_existing = True\ntask.save = True\ntask.options = options\nunreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])\n\nmesh = unreal.load_asset(DESTINATION + "/" + ASSET_NAME)\nif not mesh:\n    raise RuntimeError("BranchForge LOD0 import failed")\nsubsystem = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)\nfor lod_index, source_name in enumerate(FILES[1:], 1):\n    source = os.path.join(ROOT, source_name)\n    if os.path.exists(source):\n        subsystem.import_lod(mesh, lod_index, source)\ntry:\n    subsystem.set_lod_screen_sizes(mesh, LOD_SCREEN_SIZES)\nexcept Exception as error:\n    unreal.log_warning("BranchForge LOD screen size setup skipped: " + str(error))\ntry:\n    nanite = mesh.get_editor_property("nanite_settings")\n    if NANITE_POLICY != "AUTO":\n        nanite.enabled = NANITE_POLICY == "ENABLED"\n        mesh.set_editor_property("nanite_settings", nanite)\nexcept Exception as error:\n    unreal.log_warning("BranchForge Nanite setup skipped: " + str(error))\nunreal.EditorAssetLibrary.save_loaded_asset(mesh)\nunreal.log("BranchForge import complete: " + mesh.get_path_name())\n`;
}

export function createMaterialSetup(bundle) {
  const f = bundle.authoring.flowering, flowering = !!(bundle.authoring.vine && f?.enabled), shared = !!(f?.source && f?.shared_atlas);
  return {
    format: 'BranchForgeMaterialSetup', version: 1, destination: bundle.settings.ue_destination,
    vegetation_textures: bundle.vegetationTextureFiles || [],
    vegetation_surfaces: [...(bundle.assets[0].vegetation?.materials.values() || [])].map(m => ({slot:m.name, base_color:'#'+m.color.getHexString(), alpha_cutoff:m.alphaTest, roughness:m.roughness, two_sided:true, uv_channel:0})),
    leaf_textures: bundle.leafTextureFiles || [],
    flower_textures: bundle.flowerTextureFiles || [],
    flower_surface: flowering ? { slot: shared ? 'M_Leaf' : 'M_Flower', shared_atlas: shared, alpha_cutoff: (shared ? bundle.authoring.leaf_material : f.material)?.cutoff ?? .4, roughness: (shared ? bundle.authoring.leaf_material : f.material)?.roughness ?? .72, uv_channel: 0, blend_mode: 'MASKED', two_sided: true, color_space: 'sRGB', normal_space: 'tangent', binding: shared ? 'Use the shared M_Leaf atlas.' : 'Bind flower-color to Base Color / Alpha and flower-normal to Normal.' } : null,
    leaf_surface: { alpha_cutoff: bundle.authoring.leaf_material?.cutoff ?? .4, roughness: bundle.authoring.leaf_material?.roughness ?? .72, uv_channel: 0, blend_mode: 'MASKED', color_space: 'sRGB', normal_space: 'tangent', binding: 'Bind leaf-color to Base Color / Alpha and leaf-normal to Normal on the shared M_Leaf material.' },
    instances: [
      ...[...(bundle.assets[0].vegetation?.materials.values() || [])].map(m => ({slot:m.name, parent:m.name.endsWith('_stem')?'/Game/BranchForge/Materials/M_BranchForge_Bark':'/Game/BranchForge/Materials/M_BranchForge_Leaf', vectors:{LeafTint:'#'+m.color.getHexString(),BarkTint:'#'+m.color.getHexString()}, scalars:{TwoSided:1,WindStrength:m.name.includes('ROOT')?0:bundle.settings.wind_strength}})),
      { slot: 'M_Bark', parent: '/Game/BranchForge/Materials/M_BranchForge_Bark', vectors: { BarkTint: bundle.settings.bark_color }, scalars: { WindStrength: bundle.settings.wind_strength } },
      { slot: 'M_Leaf', parent: '/Game/BranchForge/Materials/M_BranchForge_Leaf', vectors: { LeafTint: bundle.authoring.leaf_material?.color ? '#ffffff' : bundle.assets[0].state.leafColor }, scalars: { WindStrength: bundle.settings.wind_strength, LeafFlutter: bundle.authoring.wind_profile.leaf_flutter, TwoSided: bundle.settings.leaf_double_sided ? 1 : 0 } },
      ...(flowering && !shared ? [{ slot: 'M_Flower', parent: '/Game/BranchForge/Materials/M_BranchForge_Leaf', vectors: { LeafTint: f.material?.color ? '#ffffff' : f.color }, scalars: { WindStrength: bundle.settings.wind_strength, LeafFlutter: bundle.authoring.wind_profile.leaf_flutter, TwoSided: 1 } }] : []),
      ...(flowering && !f.source && f.core ? [{ slot: 'M_FlowerCore', parent: '/Game/BranchForge/Materials/M_BranchForge_Leaf', vectors: { LeafTint: '#fff1c4' }, scalars: { TwoSided: 1 } }] : []),
    ],
    vertex_color_contract: { R: 'bend weight', G: 'hierarchy/phase', B: 'leaf flutter', A: 'health/random mask' },
  };
}

export function createRecipeDocument(bundle) {
  return {
    format: 'BranchForgeRecipe', version: 1, recipe: bundle.authoring.recipe,
    settings: bundle.settings, attachment_layers: bundle.authoring.attachment_layers,
    vine: bundle.authoring.vine || null, leaf_textures: bundle.leafTextureFiles || [],
    flowering: bundle.authoring.flowering || null, flower_textures: bundle.flowerTextureFiles || [],
    vegetation: bundle.authoring.vegetation || null, surface_growth: bundle.authoring.surface_growth || null,
    timeline: bundle.authoring.timeline, wind_profile: bundle.authoring.wind_profile,
  };
}
