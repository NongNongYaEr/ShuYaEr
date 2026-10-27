"""Build/reload isolated PVE feasibility graphs using the already compiled bridge.

Run through UE's PythonScript commandlet with a JSON config file argument. This
script never opens an editor, exports through a modal window, or edits Day30Man.
Actual graph generation is audited separately by the installed PVEWorkflow
commandlet. Counts/bounds are measured there; per-vertex PVE parity and wind are
explicitly not claimed by this probe.
"""
import hashlib
import json
import struct
import sys
import traceback
from pathlib import Path

import unreal

config = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
root = Path(config["probe_root"]).resolve()
report = Path(config["report"]).resolve()
mode = config.get("mode", "create")
result = {"passed": False, "mode": mode, "engine": unreal.SystemLibrary.get_engine_version(),
          "packages": [], "visual_render_verified": False, "wind_verified": False,
          "pve_per_vertex_parity_verified": False}


def read_json(file):
    return json.loads(Path(file).read_text(encoding="utf-8-sig"))


def asset_class(name):
    # These exact /Script paths come from the installed module UCLASS names.
    # PVE's asset/factory classes are reflected but not exported as top-level
    # Python types in this 5.8 build; load the UClass instead of assuming an alias.
    modules = {"ProceduralVegetation": "ProceduralVegetation",
               "ProceduralVegetationFactory": "ProceduralVegetationEditor",
               "PVMeshBuilderSettings": "ProceduralVegetation",
               "PVBranchForgeSkeletonSettings": "Day30ProceduralVegetationZh",
               "PVBranchForgePreviewSettings": "Day30ProceduralVegetationZh",
               "BranchForgeAssemblyLibrary": "Day30ProceduralVegetationZh"}
    cls = unreal.load_class(None, "/Script/" + modules[name] + "." + name)
    if not cls:
        raise RuntimeError("Required UClass unavailable: /Script/" + modules[name] + "." + name)
    return cls


def save(asset):
    assert unreal.EditorAssetLibrary.save_loaded_asset(asset, only_if_is_dirty=False), asset.get_path_name()


def get_pve_graph(asset):
    # UProceduralVegetation::GetGraph is a non-UFUNCTION C++ virtual method;
    # Graph itself is protected from Python. CreateGraph (installed source)
    # creates this exact named child with the asset as outer. Public object
    # lookup retrieves that same graph without changing property permissions.
    graph = unreal.find_object(asset, "ProceduralVegetationGraph")
    assert graph and graph.get_class().get_name() == "ProceduralVegetationGraph", "PVE child graph unavailable"
    assert graph.get_outer() == asset, "PVE graph belongs to a different asset"
    return graph


def create_material(folder, name, texture=None, foliage=False):
    mat = unreal.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, unreal.Material, unreal.MaterialFactoryNew())
    assert mat
    mel = unreal.MaterialEditingLibrary
    color = mel.create_material_expression(mat, unreal.MaterialExpressionVertexColor, -450, 0)
    if texture:
        sample = mel.create_material_expression(mat, unreal.MaterialExpressionTextureSample, -450, 180)
        sample.set_editor_property("texture", texture)
        # PrepareSharedParts copies resolved UVs, which already contain 1-v.
        # A second material flip would invert this atlas. Fallback GLB assets
        # have a different contract and are deliberately not used by this probe.
        multiply = mel.create_material_expression(mat, unreal.MaterialExpressionMultiply, -200, 0)
        mel.connect_material_expressions(color, "RGB", multiply, "A")
        mel.connect_material_expressions(sample, "RGB", multiply, "B")
        mel.connect_material_property(multiply, "", unreal.MaterialProperty.MP_BASE_COLOR)
        if foliage:
            mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_MASKED)
            mat.set_editor_property("opacity_mask_clip_value", 0.4)
            mel.connect_material_property(sample, "A", unreal.MaterialProperty.MP_OPACITY_MASK)
    else:
        mel.connect_material_property(color, "RGB", unreal.MaterialProperty.MP_BASE_COLOR)
    roughness = mel.create_material_expression(mat, unreal.MaterialExpressionConstant, -200, 200)
    roughness.set_editor_property("r", 0.88 if not foliage else 0.72)
    mel.connect_material_property(roughness, "", unreal.MaterialProperty.MP_ROUGHNESS)
    mat.set_editor_property("two_sided", foliage)
    mel.recompile_material(mat)
    save(mat)
    return mat


def import_texture(file, folder):
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", str(file))
    task.set_editor_property("destination_path", folder)
    task.set_editor_property("destination_name", "T_LeafAtlas")
    task.set_editor_property("automated", True)
    task.set_editor_property("replace_existing", False)
    task.set_editor_property("save", True)
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    paths = list(task.imported_object_paths)
    assert paths, "Atlas import returned no assets"
    texture = unreal.load_asset(paths[0])
    assert isinstance(texture, unreal.Texture2D)
    texture.set_editor_property("srgb", True)
    save(texture)
    return texture


def source_expectation(package):
    skeleton = read_json(package / "whole.pve-skeleton.json")
    resolved = read_json(package / "whole.resolved.json")
    binary = (package / resolved["binary"]).read_bytes()
    assert binary[:8] == b"BFRA0001"
    assert len(binary) == resolved["binary_bytes"]
    assert hashlib.sha1(binary).hexdigest().upper() == resolved["binary_sha1"].upper()
    assert hashlib.sha256(binary).hexdigest().upper() == resolved["binary_sha256"].upper()
    assert resolved.get("uv_policy") == "UE_top_left_V_is_one_minus_software_V_sample_without_extra_flip", "Unexpected resolved UV convention"
    source_hash = resolved.get("source_sha256", "").upper()
    assert len(source_hash) == 64 and all(character in "0123456789ABCDEF" for character in source_hash)
    assert skeleton["resolved_assembly"]["source_sha256"].upper() == source_hash, "Skeleton/resolved source hashes differ"
    complete_manifest = read_json(package / "complete_units.manifest.json")
    assert complete_manifest["source_whole_sha256"].upper() == source_hash, "Complete source manifest hash differs"
    assert len(skeleton["foliage_sources"]) == len(resolved["sources"])
    assert len(skeleton["foliage"]) == len(resolved["instances"])
    base = [c for c in resolved["chunks"] if c["instance_index"] < 0]
    lower, upper = [float("inf")] * 3, [float("-inf")] * 3
    for chunk in base:
        for index in range(chunk["vertex_count"]):
            xyz = struct.unpack_from("<fff", binary, chunk["vertex_offset"] + index * 48)
            for axis in range(3):
                lower[axis] = min(lower[axis], xyz[axis])
                upper[axis] = max(upper[axis], xyz[axis])
    return skeleton, resolved, {"source_count": len(resolved["sources"]), "source_sha256": source_hash,
        "unit_instance_count": len(resolved["instances"]), "base_vertices": sum(c["vertex_count"] for c in base),
        "base_faces": sum(c["index_count"] // 3 for c in base), "base_bounds_cm": {"min": lower, "max": upper},
        "binary_sha1": resolved["binary_sha1"], "per_vertex_parity_verified": False}


try:
    project_file = Path(unreal.Paths.get_project_file_path()).resolve()
    assert project_file.parent == root, "Only run inside the isolated UEProbe project"
    assert mode in ("create", "reload")
    result["reflected_classes"] = {name: str(asset_class(name)) for name in (
        "ProceduralVegetation", "ProceduralVegetationFactory", "PVMeshBuilderSettings",
        "PVBranchForgeSkeletonSettings", "PVBranchForgePreviewSettings", "BranchForgeAssemblyLibrary")}
    for item in config["packages"]:
        package = Path(item["package"]).resolve()
        folder = item["asset_folder"]
        assert folder.startswith("/Game/TrunkFeasibility/")
        skeleton, resolved, expected = source_expectation(package)
        row = {"name": item["name"], "package": str(package), "asset_folder": folder, "expected": expected}
        if mode == "create":
            assert not unreal.EditorAssetLibrary.does_directory_exist(folder), "Choose fresh probe content folder"
            atlas_file = package / "leaf_atlas_color.png"
            atlas = import_texture(atlas_file, folder + "/Materials") if atlas_file.is_file() else None
            bark = create_material(folder + "/Materials", "M_TrunkProbe")
            foliage = create_material(folder + "/Materials", "M_UnitProbe", atlas, foliage=True)
            asset = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
                "PVE_" + item["name"], folder, asset_class("ProceduralVegetation"),
                unreal.new_object(asset_class("ProceduralVegetationFactory")))
            assert asset
            graph = get_pve_graph(asset)
            assert graph
            skeleton_node, skeleton_settings = graph.add_node_of_type(asset_class("PVBranchForgeSkeletonSettings"))
            mesher_node, mesher_settings = graph.add_node_of_type(asset_class("PVMeshBuilderSettings"))
            preview_node, preview_settings = graph.add_node_of_type(asset_class("PVBranchForgePreviewSettings"))
            skeleton_settings.set_editor_property("SkeletonFile", unreal.FilePath(str(package / "whole.pve-skeleton.json")))
            preview_settings.set_editor_property("AssemblyBarkMaterial", bark)
            preview_settings.set_editor_property("AssemblyFoliageMaterial", foliage)
            preview_settings.set_editor_property("bUseResolvedAssembly", True)
            preview_settings.set_editor_property("bUseSharedAssembly", True)
            library = unreal.get_default_object(asset_class("BranchForgeAssemblyLibrary"))
            prepared = json.loads(library.call_method("PrepareSharedParts", (
                preview_settings, str(package / "whole.resolved.json"), folder + "/CompleteUnits")))
            assert prepared["success"], prepared
            parts = list(preview_settings.get_editor_property("SharedPartMeshes"))
            modes = list(preview_settings.get_editor_property("SharedPartModes"))
            assert len(parts) == expected["source_count"]
            assert all(part for part in parts), "A source did not produce a reusable part; use at least two copies per class"
            assert all(value == 2 for value in modes), "Probe requires complete reusable units, not loose foliage clusters"
            skeleton_settings.set_editor_property("LeafMeshes", parts)
            preview_settings.set_editor_property("AuthoredSourceMeshes", parts)
            assert graph.add_edge(skeleton_node, "Out", mesher_node, "In")
            assert graph.add_edge(mesher_node, "Out", preview_node, "In")
            assert graph.add_edge(preview_node, "Out", graph.get_output_node(), "Out")
            row["prepared"] = prepared
            row["graph_asset"] = asset.get_path_name()
            save(asset)
            for path in unreal.EditorAssetLibrary.list_assets(folder, recursive=True, include_folder=False):
                loaded = unreal.load_asset(path)
                if loaded:
                    save(loaded)
        else:
            asset = unreal.load_asset(folder + "/PVE_" + item["name"])
            assert asset, "Saved PVE graph missing"
            graph = get_pve_graph(asset)
            nodes = list(graph.get_editor_property("Nodes"))
            preview_settings = next(node.get_settings() for node in nodes
                                    if node.get_settings().get_class().get_name() == "PVBranchForgePreviewSettings")
            skeleton_settings = next(node.get_settings() for node in nodes
                                     if node.get_settings().get_class().get_name() == "PVBranchForgeSkeletonSettings")
            parts = list(preview_settings.get_editor_property("SharedPartMeshes"))
            modes = list(preview_settings.get_editor_property("SharedPartModes"))
            assert len(parts) == expected["source_count"] and all(value == 2 for value in modes)
            assert str(preview_settings.get_editor_property("SharedBinaryHash")).upper() == expected["binary_sha1"].upper()
            row["graph_asset"] = asset.get_path_name()
            row["graph_node_classes"] = [node.get_settings().get_class().get_name() for node in nodes]
            row["reloaded_leaf_mesh_bindings"] = len(skeleton_settings.get_editor_property("LeafMeshes"))
        part_rows = []
        bark_material = preview_settings.get_editor_property("AssemblyBarkMaterial")
        foliage_material = preview_settings.get_editor_property("AssemblyFoliageMaterial")
        assert bark_material and foliage_material, "Saved PVE material binding missing"
        expected_material_paths = [bark_material.get_path_name(), foliage_material.get_path_name()]
        def complete_path(value):
            loaded = value if isinstance(value, unreal.StaticMesh) else unreal.load_asset(str(value))
            assert isinstance(loaded, unreal.StaticMesh), "Complete source binding missing: " + str(value)
            return loaded.get_path_name()
        shared_paths = [complete_path(part) for part in parts]
        leaf_paths = [complete_path(part) for part in skeleton_settings.get_editor_property("LeafMeshes")]
        authored_paths = [complete_path(part) for part in preview_settings.get_editor_property("AuthoredSourceMeshes")]
        assert leaf_paths == shared_paths, "Skeleton source slots differ from complete shared source slots"
        assert authored_paths == shared_paths, "Authored source slots differ from complete shared source slots"
        row["source_slot_bindings"] = {"shared": shared_paths, "skeleton_leaf_meshes": leaf_paths,
                                       "authored_source_meshes": authored_paths, "exact_slot_match": True}
        row["preview_material_paths"] = expected_material_paths
        for index, part in enumerate(parts):
            # Soft object arrays can resolve to UObject or SoftObjectPath depending on binding.
            mesh = part if isinstance(part, unreal.StaticMesh) else unreal.load_asset(str(part))
            assert isinstance(mesh, unreal.StaticMesh), "Saved complete source part missing: " + str(part)
            materials = [slot.material_interface.get_path_name() if slot.material_interface else None
                         for slot in mesh.get_editor_property("static_materials")]
            assert materials == expected_material_paths, "Complete part materials differ from PVE preview bindings"
            vertices = mesh.get_num_vertices(0)
            nanite_enabled = mesh.get_editor_property("nanite_settings").get_editor_property("enabled")
            assert vertices > 0, "Complete part has no saved render vertices"
            assert nanite_enabled, "Complete source part lost Nanite enablement"
            part_rows.append({"source_index": index, "path": mesh.get_path_name(), "mode": modes[index],
                              "vertices": vertices, "materials": materials, "nanite_enabled": nanite_enabled})
        row["complete_source_parts"] = part_rows
        row["leaf_atlas_present"] = (package / "leaf_atlas_color.png").is_file()
        row["uv_policy"] = {"geometry": resolved["uv_policy"], "material_extra_v_flip": False,
                            "source_geometry": "resolved complete part, not fallback GLB"}
        row["material_scope"] = {"foliage_color_alpha": row["leaf_atlas_present"], "per_chunk_tint": True,
                                  "bark_normal_roughness_maps_verified": False,
                                  "foliage_normal_map_verified": False}
        row["passed"] = True
        result["packages"].append(row)
    result["passed"] = True
except Exception:
    result["error"] = traceback.format_exc()
    unreal.log_error(result["error"])
finally:
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf8")
    unreal.log("TRUNK_FEASIBILITY_REPORT " + str(report))
if not result["passed"]:
    raise RuntimeError(result.get("error", "PVE feasibility probe failed"))
