"""Interactive native PVE acceptance in the isolated UEProbe project.

Run with -ExecutePythonScript, not a commandlet. Only the three registered probe
assets are duplicated/edited. A narrow JSON command queue drives public editor
APIs; no user project assets or plugin code are changed.
"""
import json
import math
import time
import traceback
from pathlib import Path
import unreal

unreal.EditorPythonScripting.set_keep_python_script_alive(True)

ROOT = Path(__file__).resolve().parents[1]
PROBE = ROOT / ".runtime/trunk-feasibility/UEProbe"
OUTPUT = ROOT / ".runtime/trunk-feasibility/UEVisual"
OUTPUT.mkdir(parents=True, exist_ok=True)
CONFIG = json.loads((OUTPUT / "config.json").read_text(encoding="utf-8-sig"))
assert Path(unreal.Paths.get_project_file_path()).resolve().parent == PROBE.resolve()
STATE = {"ready": False, "assets": {}, "current": None, "errors": [],
         "engine": unreal.SystemLibrary.get_engine_version()}
LAST_COMMAND = None
AUTO = {"jobs": [], "index": 0, "after": time.monotonic() + 3.0, "failed": False, "busy": False}


def write(name, value):
    (OUTPUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf8")


def graph_of(asset):
    graph = unreal.find_object(asset, "ProceduralVegetationGraph")
    assert graph and graph.get_outer() == asset
    return graph


def console(command):
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    unreal.SystemLibrary.execute_console_command(world, command)


def open_sample(name):
    row = STATE["assets"][name]
    editors = unreal.get_editor_subsystem(unreal.AssetEditorSubsystem)
    for sample in STATE["assets"].values():
        editors.close_all_editors_for_asset(unreal.load_asset(sample["graph"]))
    asset = unreal.load_asset(row["graph"])
    assert editors.open_editor_for_assets([asset])
    STATE["current"] = name
    write("state.json", STATE)


def execute(command):
    operation = command["operation"]
    if operation == "open":
        open_sample(command["name"])
    elif operation == "camera":
        values = command["values"]
        assert len(values) == 7 and all(math.isfinite(float(x)) for x in values)
        console("BranchForge.PreviewCamera " + " ".join(str(float(x)) for x in values))
    elif operation == "export":
        assert STATE["current"]
        console("BranchForge.ExportStaticMesh " + STATE["assets"][STATE["current"]]["graph"])
    elif operation == "list_exports":
        exports = []
        for row in STATE["assets"].values():
            for path in unreal.EditorAssetLibrary.list_assets(row["output_folder"], recursive=True, include_folder=False):
                asset = unreal.load_asset(path)
                exports.append({"path": path, "class": asset.get_class().get_name(),
                    "vertices": asset.get_num_vertices(0) if isinstance(asset, unreal.StaticMesh) else None})
        write("exports.json", exports)
    elif operation == "audit":
        import importlib.util
        spec = importlib.util.spec_from_file_location("trunk_native_audit", ROOT / "scripts/ue-trunk-render-audit.py")
        helper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(helper)
        name = STATE["current"]
        assert name
        report = helper.run(name, OUTPUT, STATE["assets"][name])
        write(name + "-audit.json", report)
    elif operation == "screenshot":
        # Capture the focused UE viewport through the engine screenshot system.
        filename = OUTPUT / command["filename"]
        assert filename.parent.resolve() == OUTPUT.resolve() and filename.suffix.lower() == ".png"
        console('HighResShot 1400x1000 filename="' + str(filename).replace("\\", "/") + '"')
    else:
        raise ValueError("Unsupported probe operation: " + operation)


def tick(delta_seconds):
    global LAST_COMMAND
    if AUTO["busy"]:
        return
    if AUTO["jobs"] and not AUTO["failed"] and time.monotonic() >= AUTO["after"]:
        job = AUTO["jobs"][AUTO["index"]]
        AUTO["busy"] = True
        try:
            if job["operation"] == "wait_export":
                status_file = PROBE / "Saved/PVEWorkflow/Exports/native_export_status.json"
                status = json.loads(status_file.read_text(encoding="utf-8-sig")) if status_file.is_file() else {}
                if status.get("asset") != STATE["assets"][STATE["current"]]["graph"] or status.get("status") != "returned":
                    if time.monotonic() > AUTO["after"] + 180:
                        raise RuntimeError("Native export did not finish: " + STATE["current"])
                    return
                assert status.get("confirmed"), "Native export was not confirmed"
            elif job["operation"] == "wait_preview":
                prefix = STATE["assets"][STATE["current"]]["source"].rsplit("/", 1)[0] + "/CompleteUnits/"
                components = [c for c in unreal.ObjectIterator(unreal.InstancedStaticMeshComponent)
                              if c.get_editor_property("static_mesh")
                              and c.get_editor_property("static_mesh").get_path_name().startswith(prefix)
                              and c.get_instance_count() == 4]
                if len(components) != 6:
                    if time.monotonic() > AUTO["after"] + 180:
                        raise RuntimeError("Complete PVE preview was not ready: " + STATE["current"])
                    return
            else:
                execute(job)
            AUTO["index"] += 1
            AUTO["after"] = time.monotonic() + 3.0
            write("automation.json", {"completed": AUTO["index"] == len(AUTO["jobs"]), "index": AUTO["index"], "last": job})
            if AUTO["index"] == len(AUTO["jobs"]):
                AUTO["jobs"] = []
        except Exception:
            AUTO["failed"] = True
            write("automation.json", {"completed": False, "index": AUTO["index"], "error": traceback.format_exc()})
        finally:
            AUTO["busy"] = False
        return
    file = OUTPUT / "command.json"
    if not file.is_file():
        return
    try:
        command = json.loads(file.read_text(encoding="utf-8-sig"))
        if command.get("id") == LAST_COMMAND:
            return
        LAST_COMMAND = command["id"]
        execute(command)
        write("command-result.json", {"id": LAST_COMMAND, "accepted": True,
            "current": STATE["current"], "operation": command["operation"], "time": time.time()})
    except Exception:
        error = traceback.format_exc()
        STATE["errors"].append(error)
        write("command-result.json", {"id": LAST_COMMAND, "accepted": False, "error": error})
        unreal.log_error(error)


try:
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    export_class = unreal.load_class(None, "/Script/ProceduralVegetation.PVExportSettings")
    assert export_class
    for item in CONFIG["samples"]:
        target = item["target"]
        assert target.startswith("/Game/TrunkFeasibility/VisualTrial")
        assert not unreal.EditorAssetLibrary.does_asset_exist(target), "Use a new visual trial folder"
        asset = unreal.EditorAssetLibrary.duplicate_asset(item["source"], target)
        assert asset
        graph = graph_of(asset)
        preview = next(n for n in graph.get_editor_property("Nodes")
                       if n.get_settings().get_class().get_name() == "PVBranchForgePreviewSettings")
        export_node, settings = graph.add_node_of_type(export_class)
        params = settings.get_editor_property("ExportSettings")
        output_folder = target.rsplit("/", 1)[0] + "/NativeExport"
        params.set_editor_property("ContentBrowserFolder", unreal.DirectoryPath(output_folder))
        params.set_editor_property("MeshName", "SM_" + item["name"])
        params.set_editor_property("ExportMeshType", type(params.get_editor_property("ExportMeshType")).STATIC_MESH)
        params.set_editor_property("ReplacePolicy", type(params.get_editor_property("ReplacePolicy")).APPEND)
        params.set_editor_property("bCreateNaniteFoliage", True)
        settings.set_editor_property("ExportSettings", params)
        assert graph.remove_edge(preview, "Out", graph.get_output_node(), "Out")
        assert graph.add_edge(preview, "Out", export_node, "In")
        assert graph.add_edge(export_node, "Out", graph.get_output_node(), "Out")
        for node in graph.get_editor_property("Nodes"):
            positions = {"PVBranchForgeSkeletonSettings": (0, 0), "PVMeshBuilderSettings": (320, 0),
                         "PVBranchForgePreviewSettings": (640, 0), "PVExportSettings": (960, 0)}
            x, y = positions[node.get_settings().get_class().get_name()]
            node.set_node_position(x, y)
        assert unreal.EditorAssetLibrary.save_loaded_asset(asset, only_if_is_dirty=False)
        STATE["assets"][item["name"]] = {"graph": asset.get_path_name(), "source": item["source"],
            "output_folder": output_folder, "mesh_name": "SM_" + item["name"]}
    STATE["ready"] = True
    write("state.json", STATE)
    TICK_HANDLE = unreal.register_slate_post_tick_callback(tick)
    open_sample("Buttress")
    if CONFIG.get("automate_native_exports"):
        for name in ("Grooved", "Refined", "Buttress"):
            AUTO["jobs"].extend([{"operation": "open", "name": name}, {"operation": "wait_preview"},
                                 {"operation": "export"}, {"operation": "wait_export"}])
        AUTO["jobs"].append({"operation": "audit"})
except Exception:
    STATE["errors"].append(traceback.format_exc())
    write("state.json", STATE)
    unreal.log_error(STATE["errors"][-1])
