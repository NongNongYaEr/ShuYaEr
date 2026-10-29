"""One-action native PVE static export, with a saved receipt and unique output name."""
import json
import re
import time
from pathlib import Path

import unreal

_job = None


def export_static_mesh(asset_path, *, output_folder=None, open_result=True):
    global _job
    if _job is not None:
        raise RuntimeError("已有静态网格导出任务正在运行")
    asset = unreal.load_asset(asset_path)
    if not asset or asset.get_class().get_name() != "ProceduralVegetation":
        raise ValueError("请选择一个 PVE 资产")
    graph = unreal.find_object(None, asset.get_path_name() + ":ProceduralVegetationGraph")
    bridge = next((n.get_settings() for n in graph.nodes if n.get_settings().get_class().get_name() == "PVBranchForgeSkeletonSettings"), None)
    if bridge:
        source = Path(bridge.get_editor_property("skeleton_file").get_editor_property("file_path"))
        if not source.is_absolute():
            source = Path(unreal.Paths.project_dir()).resolve() / source
        if source.is_file() and json.loads(source.read_text(encoding="utf-8-sig")).get("version") == 3:
            from branchforge_pve_trunk import start_export
            return start_export(asset_path, output_folder)
    nodes = [n for n in graph.nodes if n.get_settings().get_class().get_name() == "PVExportSettings"]
    if len(nodes) != 1:
        raise ValueError("自动导出需要且仅支持一个 PVE 导出节点")
    folder = output_folder or "/Game/Day30/Vegetation/PVEWorkflow/Exports/SoftwareMatched"
    if not folder.startswith("/Game/") or not re.fullmatch(r"/Game/[A-Za-z0-9_/]+", folder):
        raise ValueError("输出目录必须为有效 /Game 内容路径")
    # Copy the graph, including current unsaved edits, to retain a reproducible bake
    # without changing the author's graph/export settings.
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    job_path, _ = tools.create_unique_asset_name(
        "/Game/Day30/Vegetation/PVEWorkflow/Graphs/ExportJobs/" + asset.get_name() + "_Bake", "")
    copied = unreal.EditorAssetLibrary.duplicate_asset(asset.get_path_name(), job_path)
    if not copied:
        raise RuntimeError("创建导出图副本失败")
    bake_graph = unreal.find_object(None, copied.get_path_name() + ":ProceduralVegetationGraph")
    settings = next(n.get_settings() for n in bake_graph.nodes
                    if n.get_settings().get_class().get_name() == "PVExportSettings")
    params = settings.get_editor_property("export_settings")
    base_name = "SM_" + asset.get_name().removeprefix("PVE_")
    package, name = tools.create_unique_asset_name(folder + "/" + base_name, "")
    params.set_editor_property("mesh_name", name)
    params.set_editor_property("content_browser_folder", unreal.DirectoryPath(path=folder))
    params.set_editor_property("export_mesh_type", unreal.PVExportMeshType.STATIC_MESH)
    params.set_editor_property("replace_policy", unreal.PVAssetReplacePolicy.APPEND)
    settings.set_editor_property("export_settings", params)
    if not unreal.EditorAssetLibrary.save_loaded_asset(copied):
        raise RuntimeError("保存导出图副本失败")
    report = Path(unreal.Paths.project_saved_dir()).resolve() / "PVEWorkflow/Exports" / (name + ".json")
    report.parent.mkdir(parents=True, exist_ok=True)
    job = {"status": "waiting_for_generation", "source_pve": asset.get_path_name(),
           "bake_pve": copied.get_path_name(), "output": package + "." + name,
           "report": str(report), "started": time.time()}
    report.write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
    _job = job
    unreal.get_editor_subsystem(unreal.AssetEditorSubsystem).open_editor_for_assets([copied])
    start = time.monotonic()
    dispatched = False
    finishing = False
    handle = None

    def tick(_delta):
        nonlocal dispatched, finishing
        global _job
        if finishing:
            return
        try:
            elapsed = time.monotonic() - start
            if not dispatched and elapsed >= 8:
                dispatched = True
                job["status"] = "exporting"
                report.write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
                world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
                unreal.SystemLibrary.execute_console_command(world, "BranchForge.ExportStaticMesh " + copied.get_path_name())
                return
            if not dispatched:
                return
            native_path = report.parent / "native_export_status.json"
            native = json.loads(native_path.read_text(encoding="utf-8")) if native_path.exists() else {}
            # Native progress dialogs pump Slate while the asset is only partly built.
            # Do not inspect or save it until the export command has fully returned.
            returned = native.get("asset") == job["bake_pve"] and native.get("status") == "returned"
            if returned and not native.get("confirmed"):
                raise RuntimeError("PVE 未完成生成或原生导出被取消；请生成完成后重试")
            if returned and unreal.EditorAssetLibrary.does_asset_exist(job["output"]):
                finishing = True
                unreal.unregister_slate_post_tick_callback(handle)
                mesh = unreal.load_asset(job["output"])
                nanite = mesh.get_editor_property("nanite_settings").get_editor_property("enabled")
                job.update({"status": "complete", "seconds": elapsed,
                            "nanite": nanite, "lod0_triangles": mesh.get_num_triangles(0),
                            "nanite_triangles": mesh.get_num_nanite_triangles() if nanite else 0,
                            "material_slots": [s.material_interface.get_path_name() if s.material_interface else None
                                               for s in mesh.get_editor_property("static_materials")],
                            "bounds": str(mesh.get_bounds())})
                assembly = mesh.get_editor_property("nanite_settings").get_editor_property("nanite_assembly_data").export_text()
                job["assembly_parts"] = re.findall(r'MeshObjectPath="([^"]+)"', assembly)
                job["assembly_instances"] = len(re.findall(r"PartIndex=", assembly))
                if not unreal.EditorAssetLibrary.save_loaded_asset(mesh):
                    raise RuntimeError("导出网格存在，但保存失败")
                _job = None
                report.write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
                unreal.EditorAssetLibrary.sync_browser_to_objects([job["output"]])
                if open_result:
                    unreal.get_editor_subsystem(unreal.AssetEditorSubsystem).open_editor_for_assets([mesh])
                unreal.log("BRANCHFORGE_STATIC_EXPORT_COMPLETE " + str(report))
            elif returned:
                raise RuntimeError("原生导出已返回，但没有生成目标静态网格；请查看输出日志")
            elif elapsed > 35 and native.get("asset") != job["bake_pve"]:
                raise RuntimeError("自动导出接口未接收任务；请确认插件已更新，并等待 PVE 生成完成")
            elif elapsed > 900:
                raise RuntimeError("等待原生导出超时；请检查 UE 输出日志及导出窗口")
        except Exception as exc:
            unreal.unregister_slate_post_tick_callback(handle)
            _job = None
            job.update(status="failed", error=str(exc))
            report.write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
            unreal.log_error("BRANCHFORGE_STATIC_EXPORT_FAILED " + str(exc))
            unreal.EditorDialog.show_message("BranchForge 静态网格导出失败", str(exc), unreal.AppMsgType.OK)

    handle = unreal.register_slate_post_tick_callback(tick)
    return dict(job)
