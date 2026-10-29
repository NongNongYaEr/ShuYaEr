"""One-step UE editor import of a BranchForge complete-unit PVE skeleton.

The unit StaticMeshes must already be in a selected Content Browser folder.
`foliage_sources[].id` is the stable key; `source_index` is only its JSON array index.
"""

import hashlib
import json
import re
import shutil
from pathlib import Path

import unreal
from branchforge_pve_contract import ContractError, binding_for_name, preserve_bindings_by_id, read_contract


PROJECT = Path(unreal.Paths.project_dir()).resolve()
TEMPLATE = "/Game/Day30/Vegetation/PVEWorkflow/Graphs/PVE_BranchForge_CompleteUnits_BonesTemplate"
DEFAULT_TARGET_FOLDER = "/Game/Day30/Vegetation/PVEWorkflow/Graphs/Imported"


def _slot(mesh, token):
    matches = [(index, material) for index, material in enumerate(mesh.get_editor_property("static_materials"))
               if token in str(material.get_editor_property("material_slot_name")).casefold()]
    if len(matches) != 1:
        raise ContractError(f"{mesh.get_name()}: 需要恰好一个 {token} 材质槽，实际 {len(matches)} 个")
    return matches[0][0], matches[0][1].get_editor_property("material_interface")


def _glb_bark_signature(path):
    blob = Path(path).read_bytes()
    if blob[:4] != b"glTF" or len(blob) < 20:
        raise ContractError(f"GLB 文件无效：{path}")
    length = int.from_bytes(blob[12:16], "little")
    gltf = json.loads(blob[20:20 + length].decode("utf-8"))
    bark = [entry for entry in gltf.get("materials", []) if entry.get("name", "").casefold() == "m_bark"]
    if len(bark) != 1:
        raise ContractError(f"{path}: 需要恰好一个 M_Bark")
    return json.dumps(bark[0], sort_keys=True, separators=(",", ":"))


def _sidecar(path):
    candidate = Path(str(path).replace(".pve-skeleton.json", ".pve-import.json"))
    if candidate.exists():
        return json.loads(candidate.read_text(encoding="utf-8-sig"))
    candidate = path.parent / "pve_import.json"
    return json.loads(candidate.read_text(encoding="utf-8-sig")) if candidate.exists() else {}


def _game_folder(folder):
    """Content Browser may include its /All root in selected folder paths."""
    folder = str(folder).rstrip("/")
    if folder == "/All/Game":
        return "/Game"
    if folder.startswith("/All/Game/"):
        return folder[len("/All"):]
    return folder


def _mesh_lookup(folder):
    if not folder.startswith("/Game/") or not unreal.EditorAssetLibrary.does_directory_exist(folder):
        raise ContractError(f"请选择包含完整样本枝 StaticMesh 的内容资产文件夹：{folder}")
    by_name = {}
    for path in unreal.EditorAssetLibrary.list_assets(folder, recursive=True, include_folder=False):
        asset = unreal.load_asset(path)
        if asset and asset.get_class().get_name() == "StaticMesh":
            by_name.setdefault(asset.get_name(), []).append(asset)
    return by_name


def _resolve_meshes(contract, folder, explicit):
    by_name = _mesh_lookup(folder)
    resolved = {}
    for identifier in contract["source_ids"]:
        if identifier in explicit:
            path = explicit[identifier]
            mesh = unreal.load_asset(path)
            if not mesh or mesh.get_class().get_name() != "StaticMesh" or not mesh.get_path_name().startswith(folder + "/"):
                raise ContractError(f"{identifier}: 显式绑定不是所选文件夹中的 StaticMesh：{path}")
        else:
            try:
                name = binding_for_name(identifier, by_name.keys())
            except ContractError as exc:
                if not any(name.casefold() == identifier.casefold() or
                           name.casefold().startswith(identifier.casefold() + "_") for name in by_name):
                    raise ContractError(
                        f"所选文件夹 {folder} 下找到 {sum(map(len, by_name.values()))} 个 StaticMesh，"
                        f"但缺少枝类 {identifier}。请选择包含全部 {len(contract['source_ids'])} 类完整样本枝的共同上级文件夹。"
                    ) from exc
                raise
            if len(by_name[name]) != 1:
                raise ContractError(f"{identifier}: 同名 StaticMesh 不唯一")
            mesh = by_name[name][0]
        _slot(mesh, "bark")
        _slot(mesh, "leaf")
        resolved[identifier] = mesh
    unknown = set(explicit) - set(contract["source_ids"])
    if unknown:
        raise ContractError(f"配置含未使用的枝类 ID：{sorted(unknown)}")
    return resolved


def _shared_materials(contract, meshes, config):
    bark = unreal.load_asset(config["bark_material"]) if config.get("bark_material") else None
    leaf = unreal.load_asset(config["leaf_material"]) if config.get("leaf_material") else None
    bark_values = [_slot(mesh, "bark")[1] for mesh in meshes.values()]
    leaf_values = [_slot(mesh, "leaf")[1] for mesh in meshes.values()]
    if bark and bark.get_class().get_name() not in ("Material", "MaterialInstanceConstant"):
        raise ContractError("bark_material 不是材质")
    if leaf and leaf.get_class().get_name() not in ("Material", "MaterialInstanceConstant"):
        raise ContractError("leaf_material 不是材质")
    manifest = contract["manifest"]
    if not bark and manifest:
        signatures = []
        for entry in manifest["units"]:
            glb = Path(entry["glb"])
            if not glb.is_absolute():
                glb = contract["path"].parent / glb
            if not glb.exists() or hashlib.sha256(glb.read_bytes()).hexdigest().upper() != entry.get("glb_sha256"):
                raise ContractError(f"{entry['id']}: 原 GLB 不存在或 SHA-256 不符")
            signatures.append(_glb_bark_signature(glb))
        if len(set(signatures)) == 1:
            bark = bark_values[0]
    if not leaf and len({item.get_path_name() if item else None for item in leaf_values}) == 1:
        leaf = leaf_values[0]
    if not bark:
        raise ContractError("各枝条树皮未证明相同；在 .pve-import.json 配置共用 bark_material")
    if not leaf:
        raise ContractError("各枝条叶片材质不同；在 .pve-import.json 配置共用 leaf_material")
    return bark, leaf


def _material_setup_with_material(previous, material):
    # UE 5.8 Python returns array-owned UStruct wrappers whose Material setter
    # silently leaves the old value in place. A fresh struct persists correctly.
    replacement = unreal.TrunkGenerationMaterialSetup()
    for field in ("derive_from_trunk_texture_setup", "y_texture_mode", "y_scale",
                  "y_offset", "y_offset_random", "x_offset", "x_offset_random", "u_range"):
        replacement.set_editor_property(field, previous.get_editor_property(field))
    replacement.set_editor_property("derive_from_trunk_texture_setup", False)
    replacement.set_editor_property("material", material)
    return replacement


def preflight(json_path, mesh_folder=None):
    contract = read_contract(json_path)
    config = _sidecar(contract["path"])
    if config.get("allow_compatible_replacement") and not config.get("bark_material"):
        raise ContractError("替换完整枝网格时请显式设置共用 bark_material")
    folder = mesh_folder or config.get("mesh_folder")
    if not folder:
        raise ContractError("未指定枝网格内容资产文件夹")
    folder = _game_folder(folder)
    meshes = _resolve_meshes(contract, folder, config.get("mesh_bindings", {}))
    if contract["manifest"]:
        for item in contract["manifest"]["units"]:
            mesh = meshes[item["id"]]
            nanite = mesh.get_editor_property("nanite_settings").get_editor_property("enabled")
            triangles = mesh.get_num_nanite_triangles() if nanite else mesh.get_num_triangles(0)
            if triangles != item["triangles"] and item["id"] not in config.get("allow_compatible_replacement", []):
                raise ContractError(f"{item['id']}: 网格三角面数 {triangles} 与导出清单 {item['triangles']} 不同；"
                                    "若是有意替换，请核对根点/方向/尺寸后在配置中列入 allow_compatible_replacement")
    bark, leaf = _shared_materials(contract, meshes, config)
    template_path = config.get("template_graph", TEMPLATE)
    template = unreal.load_asset(template_path)
    if not template or template.get_class().get_name() != "ProceduralVegetation":
        raise ContractError(f"PVE 通用模板不存在：{template_path}")
    token = re.sub(r"[^A-Za-z0-9_]+", "_", contract["path"].name.removesuffix(".pve-skeleton.json"))
    if not token.strip("_"):
        token = hashlib.sha256(str(contract["path"]).encode()).hexdigest()[:8]
    name = config.get("asset_name") or "PVE_BranchForge_" + token
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", name):
        raise ContractError(f"PVE 资产名无效：{name}")
    target_folder = config.get("target_folder", DEFAULT_TARGET_FOLDER).rstrip("/")
    if not target_folder.startswith("/Game/"):
        raise ContractError("目标必须位于 /Game 内容目录")
    return {"contract": contract, "config": config, "meshes": meshes, "bark": bark, "leaf": leaf,
            "template": template, "name": name, "target_folder": target_folder,
            "mesh_folder": folder}


def _unique_target(folder, name):
    candidate = name
    counter = 2
    while (unreal.EditorAssetLibrary.does_asset_exist(f"{folder}/{candidate}")
           or (PROJECT / "PVEData" / "Imported" / candidate).exists()):
        candidate = f"{name}_{counter:02d}"
        counter += 1
    return candidate, f"{folder}/{candidate}"


def import_tree(json_path, mesh_folder=None, *, dry_run=False, open_editor=True):
    ready = preflight(json_path, mesh_folder)
    contract = ready["contract"]
    summary = {"json": str(contract["path"]), "mesh_folder": ready["mesh_folder"],
               "sources": {identifier: mesh.get_path_name() for identifier, mesh in ready["meshes"].items()},
               "instance_counts": contract["counts"], "structural_branches": contract["branch_count"],
               "instances": contract["instance_count"], "bark_material": ready["bark"].get_path_name(),
               "leaf_material": ready["leaf"].get_path_name()}
    if dry_run:
        return summary
    name, target = _unique_target(ready["target_folder"], ready["name"])
    data_folder = PROJECT / "PVEData" / "Imported" / name
    data_folder.mkdir(parents=True, exist_ok=False)
    copied_json = _copy_contract_files(contract, data_folder, contract["path"].name)
    # The imported meshes remain user assets. Shared materials are rebound only
    # after every reference and GLB signature has passed preflight.
    for mesh in ready["meshes"].values():
        for token, material in (("bark", ready["bark"]), ("leaf", ready["leaf"])):
            slot, current = _slot(mesh, token)
            if current != material:
                mesh.set_material(slot, material)
        if not unreal.EditorAssetLibrary.save_loaded_asset(mesh):
            raise RuntimeError(f"保存网格材质失败：{mesh.get_path_name()}")
    asset = unreal.EditorAssetLibrary.duplicate_asset(ready["template"].get_path_name(), target)
    if not asset:
        raise RuntimeError(f"创建 PVE 资产失败：{target}")
    graph = unreal.find_object(None, asset.get_path_name() + ":ProceduralVegetationGraph")
    if not graph:
        raise RuntimeError("PVE 模板缺少 ProceduralVegetationGraph")
    bridge_nodes = [node for node in graph.nodes if node.get_settings().get_class().get_name() == "PVBranchForgeSkeletonSettings"]
    mesher_nodes = [node for node in graph.nodes if node.get_settings().get_class().get_name() == "PVMeshBuilderSettings"]
    if len(bridge_nodes) != 1 or len(mesher_nodes) != 1:
        raise RuntimeError("PVE 模板必须各有一个骨架读取节点和网格构建节点")
    bridge = bridge_nodes[0].get_settings()
    relative_json = copied_json.relative_to(PROJECT).as_posix()
    bridge.set_editor_property("skeleton_file", unreal.FilePath(file_path=relative_json))
    bridge.set_editor_property("leaf_meshes", [ready["meshes"][identifier] for identifier in contract["source_ids"]])
    mesher = mesher_nodes[0].get_settings()
    params = mesher.get_editor_property("mesher_settings")
    details = params.get_editor_property("material_details")
    setups = [_material_setup_with_material(setup, ready["bark"])
              for setup in details.get_editor_property("material_setups")]
    details.set_editor_property("material_setups", setups)
    params.set_editor_property("material_details", details)
    mesher.set_editor_property("mesher_settings", params)
    from branchforge_pve_resolved import configure_preview
    configure_preview(graph, contract, [ready["meshes"][identifier] for identifier in contract["source_ids"]], ready["leaf"])
    graph.force_notification_for_editor(unreal.PCGChangeType.EXTERNAL_MODIFICATION)
    if not unreal.EditorAssetLibrary.save_loaded_asset(asset):
        raise RuntimeError(f"保存 PVE 资产失败：{target}")
    summary.update({"asset": asset.get_path_name(), "copied_json": str(copied_json),
                    "source_id_order": contract["source_ids"]})
    resolved_config = {"format": "BranchForgePVEImportConfig", "version": 1,
                       "mesh_folder": ready["mesh_folder"], "mesh_bindings": summary["sources"],
                       "bark_material": summary["bark_material"],
                       "leaf_material": summary["leaf_material"],
                       "asset_name": ready["name"], "target_folder": ready["target_folder"]}
    (data_folder / "pve_import.json").write_text(
        json.dumps(resolved_config, ensure_ascii=False, indent=2), encoding="utf-8")
    report = PROJECT / "Saved/PVEWorkflow/Imports" / f"{name}.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    if open_editor:
        unreal.get_editor_subsystem(unreal.AssetEditorSubsystem).open_editor_for_assets([asset])
    unreal.log(f"BRANCHFORGE_PVE_IMPORTED {asset.get_path_name()} report={report}")
    return summary


def _bridge_for_asset(asset):
    if not asset or asset.get_class().get_name() != "ProceduralVegetation":
        raise ContractError("请选择 ProceduralVegetation 资产")
    graph = unreal.find_object(None, asset.get_path_name() + ":ProceduralVegetationGraph")
    if not graph:
        raise ContractError("PVE 资产缺少 ProceduralVegetationGraph")
    bridges = [node.get_settings() for node in graph.nodes
               if node.get_settings().get_class().get_name() == "PVBranchForgeSkeletonSettings"]
    if len(bridges) != 1:
        raise ContractError("PVE 图中需要恰好一个 BranchForge 骨架节点")
    return graph, bridges[0]


def _copy_contract_files(contract, folder, filename):
    folder.mkdir(parents=True, exist_ok=True)
    destination = folder / filename
    if contract["path"] != destination:
        shutil.copy2(contract["path"], destination)
    if contract["manifest"]:
        manifest_path = folder / "complete_units.manifest.json"
        source_manifest = contract["path"].parent / "complete_units.manifest.json"
        if source_manifest != manifest_path:
            shutil.copy2(source_manifest, manifest_path)
    for source in contract.get("resolved_files", []):
        target = folder / source.name
        if source != target:
            shutil.copy2(source, target)
    return destination


def create_tree_unbound(json_path, *, dry_run=False, open_editor=True):
    """Create a skeleton graph with indexed empty slots for manual mesh assignment."""
    contract = read_contract(json_path)
    config = _sidecar(contract["path"])
    template = unreal.load_asset(config.get("template_graph", TEMPLATE))
    if not template or template.get_class().get_name() != "ProceduralVegetation":
        raise ContractError("PVE 通用模板不存在")
    token = re.sub(r"[^A-Za-z0-9_]+", "_", contract["path"].name.removesuffix(".pve-skeleton.json"))
    name = config.get("asset_name") or "PVE_BranchForge_" + token
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", name):
        raise ContractError(f"PVE 资产名无效：{name}")
    target_folder = _game_folder(config.get("target_folder", DEFAULT_TARGET_FOLDER))
    if not target_folder.startswith("/Game/"):
        raise ContractError("目标必须位于 /Game 内容目录")
    summary = {"mode": "create_unbound", "json": str(contract["path"]),
               "source_id_order": contract["source_ids"], "missing_source_ids": contract["source_ids"],
               "structural_branches": contract["branch_count"], "instances": contract["instance_count"]}
    if dry_run:
        return summary
    unique_name, target = _unique_target(target_folder, name)
    data_folder = PROJECT / "PVEData" / "Imported" / unique_name
    copied_json = _copy_contract_files(contract, data_folder, contract["path"].name)
    asset = unreal.EditorAssetLibrary.duplicate_asset(template.get_path_name(), target)
    if not asset:
        raise RuntimeError(f"创建 PVE 资产失败：{target}")
    graph, bridge = _bridge_for_asset(asset)
    bridge.set_editor_property("skeleton_file", unreal.FilePath(
        file_path=copied_json.relative_to(PROJECT).as_posix()))
    bridge.set_editor_property("leaf_meshes", [None] * len(contract["source_ids"]))
    for node in graph.nodes:
        if node.get_settings().get_class().get_name() == "PVBranchForgePreviewSettings":
            node.get_settings().set_editor_property("use_resolved_assembly", False)
    graph.force_notification_for_editor(unreal.PCGChangeType.EXTERNAL_MODIFICATION)
    if not unreal.EditorAssetLibrary.save_loaded_asset(asset):
        raise RuntimeError(f"保存 PVE 资产失败：{target}")
    summary.update({"asset": asset.get_path_name(), "copied_json": str(copied_json)})
    _write_import_report(unique_name, summary)
    if open_editor:
        unreal.get_editor_subsystem(unreal.AssetEditorSubsystem).open_editor_for_assets([asset])
    return summary


def _write_import_report(name, summary):
    report = PROJECT / "Saved/PVEWorkflow/Imports" / f"{name}.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")


def update_tree_json(json_path, asset_path, *, dry_run=False, open_editor=True):
    """Refresh geometry data in an existing graph, retaining current meshes by stable ID."""
    contract = read_contract(json_path)
    asset = unreal.load_asset(asset_path)
    graph, bridge = _bridge_for_asset(asset)
    old_value = bridge.get_editor_property("skeleton_file").get_editor_property("file_path")
    if not old_value:
        raise ContractError("目标 PVE 尚未绑定旧 JSON，无法安全识别已有网格槽")
    old_path = Path(old_value)
    if not old_path.is_absolute():
        old_path = PROJECT / old_path
    if not old_path.exists():
        raise ContractError(f"原 JSON 不存在，无法按枝类 ID 保留手动绑定：{old_path}")
    old_contract = read_contract(old_path)
    old_meshes = list(bridge.get_editor_property("leaf_meshes"))
    if len(old_meshes) > len(old_contract["source_ids"]):
        raise ContractError("原 PVE 网格槽多于原 JSON 枝类，更新前请核对")
    old_meshes.extend([None] * (len(old_contract["source_ids"]) - len(old_meshes)))
    new_meshes = preserve_bindings_by_id(old_contract["source_ids"], old_meshes, contract["source_ids"])
    preview_bindings = []
    for node in graph.nodes:
        settings = node.get_settings()
        if settings.get_class().get_name() != "PVBranchForgePreviewSettings":
            continue
        original = list(settings.get_editor_property("authored_source_meshes"))
        if original:
            if len(original) != len(old_contract["source_ids"]):
                raise ContractError("软件装配基准源与旧 JSON 不一致")
            remapped = preserve_bindings_by_id(old_contract["source_ids"], original, contract["source_ids"])
            preview_bindings.append((settings, original, remapped))
    missing = [identifier for identifier, mesh in zip(contract["source_ids"], new_meshes) if not mesh]
    summary = {"mode": "update_json", "asset": asset.get_path_name(),
               "old_json": str(old_path), "json": str(contract["path"]),
               "source_id_order": contract["source_ids"], "missing_source_ids": missing,
               "bindings": {identifier: mesh.get_path_name() if mesh else None
                            for identifier, mesh in zip(contract["source_ids"], new_meshes)},
               "structural_branches": contract["branch_count"], "instances": contract["instance_count"]}
    if dry_run:
        return summary
    revision_hash = hashlib.sha256(contract["path"].read_bytes())
    if contract.get("resolved_files"):
        # The manifest includes the binary digest. Exporter fixes may change
        # geometry without changing the skeleton JSON; retain both revisions.
        revision_hash.update(contract["resolved_files"][0].read_bytes())
    revision = revision_hash.hexdigest()[:12]
    old_import_folder = old_path.parent if old_path.parent.parent == PROJECT / "PVEData" / "Imported" else None
    asset_key = re.sub(r"[^A-Za-z0-9_]+", "_", asset.get_name())
    data_folder = (old_import_folder or PROJECT / "PVEData" / "Imported" / f"{asset_key}_Updates") / "Revisions" / revision
    copied_json = _copy_contract_files(contract, data_folder, contract["path"].name)
    shared_snapshots = []
    for node in graph.nodes:
        settings = node.get_settings()
        if settings.get_class().get_name() == "PVBranchForgePreviewSettings":
            shared_snapshots.append((settings,
                list(settings.get_editor_property("shared_part_meshes")),
                list(settings.get_editor_property("shared_part_modes")),
                settings.get_editor_property("shared_binary_hash")))
    try:
        bridge.set_editor_property("skeleton_file", unreal.FilePath(
            file_path=copied_json.relative_to(PROJECT).as_posix()))
        bridge.set_editor_property("leaf_meshes", new_meshes)
        for settings, original, remapped in preview_bindings:
            settings.set_editor_property("authored_source_meshes", remapped)
        for settings, meshes, modes, digest in shared_snapshots:
            lookup = dict(zip(old_contract['source_ids'], zip(meshes, modes)))
            from branchforge_pve_resolved import set_shared_state
            set_shared_state(settings, [lookup.get(i, (None, 0))[0] for i in contract['source_ids']],
                             [lookup.get(i, (None, 0))[1] for i in contract['source_ids']], '')
        from branchforge_pve_resolved import prepare_shared_parts
        prepare_shared_parts(graph, contract)
        graph.force_notification_for_editor(unreal.PCGChangeType.EXTERNAL_MODIFICATION)
        if not unreal.EditorAssetLibrary.save_loaded_asset(asset):
            raise RuntimeError("保存更新后的 PVE 资产失败")
    except Exception:
        bridge.set_editor_property("skeleton_file", unreal.FilePath(file_path=old_value))
        bridge.set_editor_property("leaf_meshes", old_meshes)
        for settings, original, remapped in preview_bindings:
            settings.set_editor_property("authored_source_meshes", original)
        for settings, meshes, modes, digest in shared_snapshots:
            from branchforge_pve_resolved import set_shared_state
            set_shared_state(settings, meshes, modes, digest)
        graph.force_notification_for_editor(unreal.PCGChangeType.EXTERNAL_MODIFICATION)
        raise
    summary["copied_json"] = str(copied_json)
    _write_import_report(asset_key + "_update_" + revision, summary)
    if open_editor:
        unreal.get_editor_subsystem(unreal.AssetEditorSubsystem).open_editor_for_assets([asset])
    return summary


def run_interactive():
    """Tools-menu action: selected Content Browser folder + one JSON file picker."""
    try:
        folders = list(unreal.EditorUtilityLibrary.get_selected_folder_paths())
        if not folders:
            folders = list(unreal.EditorUtilityLibrary.get_selected_path_view_folder_paths())
        if len(folders) != 1:
            raise ContractError("请先在内容浏览器选中一个包含完整样本枝的文件夹")
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        try:
            filename = filedialog.askopenfilename(parent=root, title="导入 BranchForge 完整枝 PVE JSON",
                                                  filetypes=[("PVE 骨架 JSON", "*.json")])
        finally:
            root.destroy()
        if not filename:
            return
        result = import_tree(filename, folders[0])
        unreal.EditorDialog.show_message("BranchForge PVE 导入完成",
                                         f"已创建 {result['asset']}\n{result['structural_branches']} 根承重枝，{result['instances']} 个完整枝实例。",
                                         unreal.AppMsgType.OK)
    except Exception as exc:
        unreal.log_error(f"BranchForge PVE 导入失败：{exc}")
        unreal.EditorDialog.show_message("BranchForge PVE 导入失败", str(exc), unreal.AppMsgType.OK)
