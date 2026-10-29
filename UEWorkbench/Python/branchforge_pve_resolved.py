"""Configure six-class software assembly with vertex tints and existing atlas UVs."""
import unreal
import json
from pathlib import Path


def ensure_binding_validation(graph):
    """Keep invalid skeletal attachments away from the native export input."""
    by_class = {n.get_settings().get_class().get_name(): n for n in graph.nodes}
    bone = by_class.get("PVBoneReductionSettings")
    export = by_class.get("PVExportSettings")
    if not bone or not export:
        raise RuntimeError("骨骼挂接校验需要骨骼精简与导出节点")
    guard = by_class.get("PVBranchForgeBindingSettings")
    if not guard:
        guard, _ = graph.add_node_of_type(unreal.PVBranchForgeBindingSettings)
    label = lambda p: p.get_editor_property("properties").get_editor_property("label")
    output = graph.get_output_node()
    graph.remove_edge(bone, label(bone.output_pins[0]), export, label(export.input_pins[0]))
    for pin in output.input_pins:
        graph.remove_edge(bone, label(bone.output_pins[0]), output, label(pin))
    for a, b in ((bone, guard), (guard, export), (guard, output)):
        graph.add_edge(a, label(a.output_pins[0]), b, label(b.input_pins[0]))
    guard.set_node_position(1040, 0)
    export.set_node_position(1300, 0)
    return guard


def set_shared_state(settings, meshes, modes, digest):
    if not unreal.BranchForgeAssemblyLibrary.set_prepared_parts(settings, meshes, modes, digest):
        raise RuntimeError('Nanite 部件状态无效，未修改已有状态')


def prepare_shared_parts(graph, contract):
    """Rebuild reusable parts on create/update; source meshes and six user slots stay intact."""
    if not contract.get("resolved_files"):
        return
    settings = next(n.get_settings() for n in graph.nodes
                    if n.get_settings().get_class().get_name() == "PVBranchForgePreviewSettings")
    if not settings.get_editor_property("use_shared_assembly") or not settings.get_editor_property("use_resolved_assembly"):
        return
    asset = graph.get_outer()
    package = asset.get_path_name().split(".")[0]
    folder = package.rsplit("/", 2)[0] + "/SharedParts/" + asset.get_name()
    result = json.loads(unreal.BranchForgeAssemblyLibrary.prepare_shared_parts(
        settings, str(contract["resolved_files"][0]), folder))
    if not result.get("success"):
        raise RuntimeError("Nanite 装配准备失败：" + result.get("error", "未知错误"))
    for part in result["parts"]:
        mesh = unreal.load_asset(part["mesh"])
        # Parts may be referenced by other shapes and exported SMs. Native
        # preparation compares materials and includes their paths in cache keys.
        if not mesh or mesh.get_material(0) != settings.get_editor_property("assembly_bark_material") or mesh.get_material(1) != settings.get_editor_property("assembly_foliage_material"):
            raise RuntimeError("共享部件材质校验失败：" + part["mesh"])
        if not part.get('reused_reference') and not unreal.EditorAssetLibrary.save_loaded_asset(mesh):
            raise RuntimeError("共享部件保存失败：" + part["mesh"])
    report = Path(unreal.Paths.project_saved_dir()).resolve() / "PVEWorkflow/Assemblies" / (asset.get_name() + ".json")
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")


def configure_preview(graph, contract, meshes, leaf_material):
    if not contract["data"].get("resolved_assembly"):
        return
    previews = [n.get_settings() for n in graph.nodes
                if n.get_settings().get_class().get_name() == "PVBranchForgePreviewSettings"]
    if len(previews) != 1:
        raise RuntimeError("软件装配需要一个 BranchForge 整树预览节点")
    lib = unreal.MaterialEditingLibrary
    folder = "/Game/Day30/Vegetation/PVEWorkflow/Materials/BranchForgeResolved"
    bark_path = folder + "/M_BranchForge_Resolved_Bark"
    bark = unreal.load_asset(bark_path) if unreal.EditorAssetLibrary.does_asset_exist(bark_path) else None
    if not bark:
        bark = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
            "M_BranchForge_Resolved_Bark", folder, unreal.Material, unreal.MaterialFactoryNew())
        color = lib.create_material_expression(bark, unreal.MaterialExpressionVertexColor, -350, 0)
        lib.connect_material_property(color, "RGB", unreal.MaterialProperty.MP_BASE_COLOR)
        roughness = lib.create_material_expression(bark, unreal.MaterialExpressionConstant, -350, 150)
        roughness.set_editor_property("r", 0.88)
        lib.connect_material_property(roughness, "", unreal.MaterialProperty.MP_ROUGHNESS)
        lib.recompile_material(bark)
        if not unreal.EditorAssetLibrary.save_loaded_asset(bark):
            raise RuntimeError("软件树皮材质保存失败")
    leaf_path = folder + "/" + leaf_material.get_name() + "_ResolvedTint"
    leaf = unreal.load_asset(leaf_path) if unreal.EditorAssetLibrary.does_asset_exist(leaf_path) else None
    if not leaf:
        if leaf_material.get_class().get_name() != "Material":
            raise RuntimeError("软件装配当前需要可编辑的叶图集 Material，以加入软件叶色")
        leaf = unreal.EditorAssetLibrary.duplicate_asset(leaf_material.get_path_name(), leaf_path)
        source = lib.get_material_property_input_node(leaf, unreal.MaterialProperty.MP_BASE_COLOR)
        output = lib.get_material_property_input_node_output_name(leaf, unreal.MaterialProperty.MP_BASE_COLOR)
        if not source:
            raise RuntimeError("叶图集材质没有颜色输入")
        tint = lib.create_material_expression(leaf, unreal.MaterialExpressionVertexColor, -200, 250)
        multiply = lib.create_material_expression(leaf, unreal.MaterialExpressionMultiply, 40, 0)
        lib.connect_material_expressions(source, output, multiply, "A")
        lib.connect_material_expressions(tint, "RGB", multiply, "B")
        lib.connect_material_property(multiply, "", unreal.MaterialProperty.MP_BASE_COLOR)
        lib.recompile_material(leaf)
        if not unreal.EditorAssetLibrary.save_loaded_asset(leaf):
            raise RuntimeError("软件叶色材质保存失败")
    # Resolved vertices already store UE UV=(u,1-v_software). The fixed-GLB
    # material's extra V flip must not be applied a second time here.
    expressions = list(lib.get_material_expressions(leaf))
    coords = next((e for e in expressions if e.get_class().get_name() == 'MaterialExpressionTextureCoordinate'), None)
    if not coords:
        coords = lib.create_material_expression(leaf, unreal.MaterialExpressionTextureCoordinate, -1200, 0)
    for expression in expressions:
        if expression.get_class().get_name() == 'MaterialExpressionTextureSample':
            if not lib.connect_material_expressions(coords, '', expression, 'UVs'):
                raise RuntimeError('软件装配图集 UV 连接失败')
    lib.recompile_material(leaf)
    if not unreal.EditorAssetLibrary.save_loaded_asset(leaf):
        raise RuntimeError('软件装配图集 UV 保存失败')
    preview = previews[0]
    preview.set_editor_property("assembly_bark_material", bark)
    preview.set_editor_property("assembly_foliage_material", leaf)
    preview.set_editor_property("authored_source_meshes", meshes)
    preview.set_editor_property("use_resolved_assembly", True)
    prepare_shared_parts(graph, contract)
    # Build/reduce native bones after the resolved vertices have been installed.
    by_class = {n.get_settings().get_class().get_name(): n for n in graph.nodes}
    mesher = by_class.get("PVMeshBuilderSettings")
    bone = by_class.get("PVBoneReductionSettings")
    node = by_class.get("PVBranchForgePreviewSettings")
    export = by_class.get("PVExportSettings")
    if export:
        settings = export.get_settings()
        params = settings.get_editor_property('export_settings')
        if str(params.get_editor_property('mesh_name')) == 'TEMPTESTPVE':
            params.set_editor_property('mesh_name', 'SM_' + graph.get_outer().get_name().removeprefix('PVE_'))
            params.set_editor_property('content_browser_folder', unreal.DirectoryPath(
                path='/Game/Day30/Vegetation/PVEWorkflow/Exports/SoftwareMatched'))
            params.set_editor_property('replace_policy', unreal.PVAssetReplacePolicy.APPEND)
            settings.set_editor_property('export_settings', params)
    if mesher and bone and export:
        label = lambda p: p.get_editor_property("properties").get_editor_property("label")
        for a, b in ((mesher, bone), (bone, node), (node, export)):
            graph.remove_edge(a, label(a.output_pins[0]), b, label(b.input_pins[0]))
        for a, b in ((mesher, node), (node, bone), (bone, export)):
            graph.add_edge(a, label(a.output_pins[0]), b, label(b.input_pins[0]))
        # The native export node's output is invisible; old templates linked it
        # to PCG Output, causing PCGEditorGraph::CreateLinks to assert on open.
        output = graph.get_output_node()
        for pin in output.input_pins:
            graph.remove_edge(export, label(export.output_pins[0]), output, label(pin))
        graph.add_edge(bone, label(bone.output_pins[0]), output, label(output.input_pins[0]))
        node.set_node_position(520, 0)
        bone.set_node_position(780, 0)
        export.set_node_position(1040, 0)
        ensure_binding_validation(graph)
