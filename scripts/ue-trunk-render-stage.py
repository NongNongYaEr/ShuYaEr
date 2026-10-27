"""Render native exported meshes in an isolated UEProbe level.

The real exported StaticMesh is placed once. Its Nanite assembly is rendered by
UE; this helper never reconstructs leaves or substitutes manual instances.
Public APIs are checked against the installed UE 5.8 headers. Native GPU captures
are scheduled by Slate ticks and read back through the engine PNG exporter.
"""
import json
import struct
import time
import uuid
from pathlib import Path
import unreal

_ACTIVE = []


def cancel_all():
    for pending, report, camera, tick in _ACTIVE:
        if pending.get("handle") is not None:
            unreal.unregister_slate_post_tick_callback(pending["handle"])
            pending["handle"] = None


def run(name, output, row):
    root = Path(__file__).resolve().parents[1]
    probe = root / ".runtime/trunk-feasibility/UEProbe"
    assert Path(unreal.Paths.get_project_file_path()).resolve().parent == probe.resolve()
    output = Path(output)
    assert output.resolve() == (root / ".runtime/trunk-feasibility/UEVisual").resolve()
    assert name in ("Grooved", "Buttress", "Refined")
    assert row["output_folder"].startswith("/Game/TrunkFeasibility/VisualTrial")

    meshes = []
    for path in unreal.EditorAssetLibrary.list_assets(row["output_folder"], recursive=True, include_folder=False):
        asset = unreal.load_asset(path)
        if isinstance(asset, unreal.StaticMesh) and asset.get_name().startswith(row["mesh_name"]):
            meshes.append(asset)
    assert len(meshes) == 1, "One unique native master export is required"
    mesh = meshes[0]
    # The native highres API renders the level viewport. Closing only this
    # isolated sample's asset editor reveals that viewport for Slate redraws.
    graph_asset = unreal.load_asset(row["graph"])
    assert graph_asset
    unreal.get_editor_subsystem(unreal.AssetEditorSubsystem).close_all_editors_for_asset(graph_asset)
    level = row["output_folder"].rsplit("/", 1)[0] + "/Render_" + name + "_" + uuid.uuid4().hex[:8]
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    assert not unreal.EditorAssetLibrary.does_asset_exist(level)
    assert levels.new_level(level)

    tree = actors.spawn_actor_from_object(mesh, unreal.Vector(0, 0, 0))
    assert tree and isinstance(tree, unreal.StaticMeshActor)
    tree.set_actor_label("NativePVE_" + name)
    component = tree.get_component_by_class(unreal.StaticMeshComponent)
    assert component.get_editor_property("static_mesh") == mesh
    component.set_mobility(unreal.ComponentMobility.STATIC)

    floor_mesh = unreal.load_asset("/Engine/BasicShapes/Plane")
    assert floor_mesh
    floor = actors.spawn_actor_from_object(floor_mesh, unreal.Vector(0, 0, -1))
    floor.set_actor_label("ProbeGround")
    floor.set_actor_scale3d(unreal.Vector(120, 120, 1))
    floor_material = unreal.load_asset("/Engine/BasicShapes/BasicShapeMaterial")
    assert floor_material
    floor.get_component_by_class(unreal.StaticMeshComponent).set_material(0, floor_material)

    key = actors.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 600), unreal.Rotator(-38, 140, 0))
    key.set_actor_label("ProbeKey")
    key_light = key.get_component_by_class(unreal.DirectionalLightComponent)
    key_light.set_mobility(unreal.ComponentMobility.MOVABLE)
    key_light.set_intensity(4.0)
    key_light.set_light_color(unreal.LinearColor(1.0, 0.94, 0.86, 1.0))

    sky = actors.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 600))
    sky.set_actor_label("ProbeAmbient")
    sky_light = sky.get_component_by_class(unreal.SkyLightComponent)
    sky_light.set_mobility(unreal.ComponentMobility.MOVABLE)
    source_type = type(sky_light.get_editor_property("source_type"))
    sky_light.set_editor_property("source_type", source_type.SLS_SPECIFIED_CUBEMAP)
    sky_light.set_cubemap(unreal.load_asset("/Engine/MapTemplates/Sky/DaylightAmbientCubemap"))
    sky_light.set_intensity(0.8)
    sky_light.recapture_sky()

    location = unreal.Vector(650, -800, 430)
    target = unreal.Vector(0, 0, 245)
    camera = actors.spawn_actor_from_class(unreal.CameraActor, location, unreal.MathLibrary.find_look_at_rotation(location, target))
    camera.set_actor_label("ProbeCamera")
    cam = camera.get_component_by_class(unreal.CameraComponent)
    cam.set_field_of_view(45.0)
    cam.set_editor_property("constrain_aspect_ratio", False)
    settings = cam.get_editor_property("post_process_settings")
    settings.set_editor_property("override_auto_exposure_method", True)
    settings.set_editor_property("auto_exposure_method", unreal.AutoExposureMethod.AEM_MANUAL)
    settings.set_editor_property("override_auto_exposure_apply_physical_camera_exposure", True)
    settings.set_editor_property("auto_exposure_apply_physical_camera_exposure", False)
    settings.set_editor_property("override_auto_exposure_bias", True)
    settings.set_editor_property("auto_exposure_bias", 0.0)
    cam.set_editor_property("post_process_settings", settings)
    cam.set_post_process_blend_weight(1.0)

    actors.clear_actor_selection_set()
    levels.editor_set_viewport_realtime(True)
    levels.editor_set_game_view(True)
    levels.editor_invalidate_viewports()
    unreal.AutomationLibrary.set_editor_viewport_view_mode(unreal.ViewModeIndex.VMI_LIT)
    unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).set_level_viewport_camera_info(location, camera.get_actor_rotation())
    assert levels.save_current_level()

    report = {"name": name, "level": level, "master_mesh": mesh.get_path_name(),
              "actor_mesh": component.get_editor_property("static_mesh").get_path_name(),
              "manual_part_instances": 0, "completed": False, "captures": [],
              "native_png": True, "capture_method": "SceneCapture2D native GPU", "errors": []}
    cameras = [("整树", (650, -800, 430), (0, 0, 245), 45.0),
               ("主干", (360, -430, 235), (0, 0, 105), 34.0)]
    pending = {"index": 0, "wait_until": time.monotonic() + 3.0, "busy": False}

    def write_status():
        (output / (name + "-render.json")).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")

    def capture_native_scene(path, position, rotation, fov):
        # This official native GPU route needs no visible level viewport. The
        # same master actor and its engine-rendered Nanite assembly are used.
        # It avoids hidden-viewport repaint and HighRes task delegate stalls.
        world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
        unreal.AutomationLibrary.finish_loading_before_screenshot()
        capture_actor = actors.spawn_actor_from_class(unreal.SceneCapture2D, position, rotation, transient=True)
        assert capture_actor
        capture = capture_actor.get_component_by_class(unreal.SceneCaptureComponent2D)
        target = unreal.RenderingLibrary.create_render_target2d(world, 1400, 1000, unreal.TextureRenderTargetFormat.RTF_RGBA8)
        assert target
        try:
            capture.set_editor_property("capture_every_frame", False)
            capture.set_editor_property("capture_on_movement", False)
            capture.set_editor_property("always_persist_rendering_state", True)
            capture.set_editor_property("capture_source", unreal.SceneCaptureSource.SCS_FINAL_COLOR_LDR)
            capture.set_editor_property("texture_target", target)
            capture.set_editor_property("fov_angle", fov)
            capture.set_editor_property("post_process_settings", settings)
            capture.set_editor_property("post_process_blend_weight", 1.0)
            # Warm the capture's persistent render state, then read back through
            # the engine PNG exporter, which flushes the queued GPU render.
            for _ in range(3):
                capture.capture_scene()
            unreal.RenderingLibrary.export_render_target(world, target, str(path.parent), path.name)
        finally:
            actors.destroy_actor(capture_actor)
            unreal.RenderingLibrary.release_render_target2d(target)
        assert path.is_file(), "Native SceneCapture did not produce PNG"
        with path.open("rb") as png:
            header = png.read(24)
        assert header[:8] == b"\x89PNG\r\n\x1a\n" and list(struct.unpack(">II", header[16:24])) == [1400, 1000]

    def tick(delta_seconds):
        # FinishLoadingBeforeScreenshot inside the native API may pump Slate.
        # Guard against a reentrant capture while native loading pumps events.
        if pending["busy"]:
            return
        pending["busy"] = True
        try:
            if pending["index"] == len(cameras):
                report["completed"] = True
                write_status()
                unreal.unregister_slate_post_tick_callback(pending["handle"])
                return
            if time.monotonic() < pending["wait_until"]:
                return
            label, xyz, aim, fov = cameras[pending["index"]]
            position, look = unreal.Vector(*xyz), unreal.Vector(*aim)
            camera.set_actor_location_and_rotation(position, unreal.MathLibrary.find_look_at_rotation(position, look), False, True)
            cam.set_field_of_view(fov)
            path = output / (name + "-UE-" + label + "-" + level.rsplit("_", 1)[1] + ".png")
            capture_native_scene(path, position, camera.get_actor_rotation(), fov)
            report["captures"].append({"label": label, "file": str(path), "file_exists": True,
                                        "dimensions": [1400, 1000], "completion_signal": "NativeSceneCapturePNGReadback",
                                        "camera": list(xyz), "target": list(aim), "fov": fov})
            pending["index"] += 1
            pending["wait_until"] = time.monotonic() + 2.0
            write_status()
        except Exception as error:
            report["errors"].append(str(error))
            write_status()
            unreal.log_error("Native render failed: " + str(error))
            unreal.unregister_slate_post_tick_callback(pending["handle"])
        finally:
            pending["busy"] = False

    pending["handle"] = unreal.register_slate_post_tick_callback(tick)
    _ACTIVE.append((pending, report, camera, tick))
    write_status()
    return report
