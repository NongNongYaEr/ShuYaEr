"""Read-only geometry acceptance for an open, isolated UEProbe PVE sample.

The source mesh description is examined, not Nanite's reduced fallback mesh.
Only this module's caller writes the resulting report. A missing preview is
reported independently of native export; it never becomes a successful preview.
"""
import hashlib
import itertools
import json
import math
import re
import struct
import sys
import time
import traceback
from collections import Counter, defaultdict
from pathlib import Path

import unreal

ROOT = Path(__file__).resolve().parents[1]
POSITION_TOLERANCE_CM = 0.001
UV_TOLERANCE = 0.000002
NORMAL_TOLERANCE = 0.0002


def _xyz(value):
    return tuple(float(getattr(value, axis)) for axis in ("x", "y", "z"))


def _uv(value):
    return (float(value.x), float(value.y))


def _f32(value):
    return struct.unpack("<f", struct.pack("<f", value))[0]


def _norm(value):
    length = math.sqrt(sum(x * x for x in value))
    return tuple(x / length for x in value)


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _frame(instance):
    # Same float inputs, reflection, orthogonalization and MakeFromYZ basis as
    # BranchForgeAssemblyLibrary.cpp / BranchForgeResolvedAssembly.cpp.
    def direction(field):
        a = instance[field]
        return (_f32(a[0]), _f32(-a[1]), _f32(a[2]))
    z = _norm(direction("up"))
    y = _norm(direction("face"))
    dot = sum(a * b for a, b in zip(y, z))
    y = _norm(tuple(a - dot * b for a, b in zip(y, z)))
    x = _norm(_cross(y, z))
    z = _norm(_cross(x, y))
    p = instance["position_m"]
    return {"translation": (_f32(p[0] * 100), _f32(-p[1] * 100), _f32(p[2] * 100)),
            "basis": (x, y, z), "scale": (_f32(instance["scale_m"]),) * 3}


def _transform_frame(transform):
    # Also supports the reflected FTransform3f used by Nanite assembly nodes.
    if isinstance(transform, tuple):
        # Python binding versions either promote the success bool to None, or
        # return the bool and OutInstanceTransform as a pair.
        assert len(transform) == 2 and isinstance(transform[0], bool) and transform[0], str(transform)
        transform = transform[1]
    assert transform is not None
    p = _xyz(transform.get_editor_property("translation"))
    q = transform.get_editor_property("rotation")
    s = _xyz(transform.get_editor_property("scale3d"))
    qv = (float(q.x), float(q.y), float(q.z))
    qw = float(q.w)
    def rotate(vector):
        t = tuple(2 * x for x in _cross(qv, vector))
        u = _cross(qv, t)
        return tuple(vector[i] + qw * t[i] + u[i] for i in range(3))
    return {"translation": p, "basis": tuple(rotate(v) for v in ((1, 0, 0), (0, 1, 0), (0, 0, 1))), "scale": s}


def _exported_struct(text):
    """Parse UE's public StructBase.export_text output without eval/importing it."""
    index = 0
    def skip():
        nonlocal index
        while index < len(text) and text[index].isspace():
            index += 1
    def value():
        nonlocal index
        skip()
        if text[index] == "(":
            index += 1
            items = []
            skip()
            if text[index] == ")":
                index += 1
                return []
            while True:
                skip()
                match = re.match(r"([A-Za-z_][A-Za-z_0-9]*)\s*=", text[index:])
                if match:
                    index += match.end()
                    items.append((match.group(1), value()))
                else:
                    items.append(value())
                skip()
                delimiter = text[index]
                assert delimiter in ",)", "Unexpected UE text delimiter: " + text[index:index + 30]
                index += 1
                if delimiter == ")":
                    break
            if all(isinstance(item, tuple) and len(item) == 2 and isinstance(item[0], str) for item in items):
                return dict(items)
            return items
        if text[index] == '"':
            start = index
            index += 1
            while index < len(text):
                if text[index] == "\\":
                    index += 2
                    continue
                if text[index] == '"':
                    index += 1
                    return json.loads(text[start:index])
                index += 1
            raise ValueError("Unclosed UE text string")
        start = index
        while index < len(text) and text[index] not in ",)":
            index += 1
        token = text[start:index].strip()
        try:
            return float(token) if any(c in token for c in ".eE") else int(token)
        except ValueError:
            return token
    result = value()
    skip()
    assert index == len(text), "Trailing UE text"
    return result


def _text_transform_frame(transform):
    class Fields:
        def __init__(self, entries):
            self.entries = entries
        def get_editor_property(self, field):
            aliases = {"translation": "Translation", "rotation": "Rotation", "scale3d": "Scale3D"}
            return Fields(self.entries[aliases[field]])
        def __getattr__(self, field):
            return self.entries[field.upper()]
    return _transform_frame(Fields(transform))


def _transform_position(position, frame):
    return tuple(frame["translation"][i] + sum(position[j] * frame["basis"][j][i] * frame["scale"][j]
                                               for j in range(3)) for i in range(3))


def _transform_normal(normal, frame):
    return tuple(sum(normal[j] * frame["basis"][j][i] for j in range(3)) for i in range(3))


def _frame_error(actual, expected):
    return {"position_cm": max(abs(a - b) for a, b in zip(actual["translation"], expected["translation"])),
            "direction": max(abs(a - b) for va, vb in zip(actual["basis"], expected["basis"]) for a, b in zip(va, vb)),
            "scale": max(abs(a - b) for a, b in zip(actual["scale"], expected["scale"]))}


def _reference_triangles(manifest, binary, predicate):
    triangles = []
    for chunk in manifest["chunks"]:
        if not predicate(chunk):
            continue
        count = chunk["vertex_count"]
        vertices = [struct.unpack_from("<12f", binary, chunk["vertex_offset"] + i * 48) for i in range(count)]
        for k in range(0, chunk["index_count"], 3):
            indices = struct.unpack_from("<3I", binary, chunk["index_offset"] + k * 4)
            assert all(i < count for i in indices)
            corners = [vertices[i] for i in indices]
            triangles.append(tuple({"position": v[:3], "normal": v[3:6], "uv": v[6:8]} for v in corners))
    return triangles


def _static_dynamic(mesh):
    options = unreal.GeometryScriptCopyMeshFromAssetOptions(
        apply_build_settings=False, use_build_scale=False, request_tangents=True)
    lod = unreal.GeometryScriptMeshReadLOD(lod_type=unreal.GeometryScriptLODType.SOURCE_MODEL, lod_index=0)
    dynamic, outcome = unreal.GeometryScript_AssetUtils.copy_mesh_from_static_mesh_v2(
        mesh, unreal.DynamicMesh(), options, lod, use_section_materials=False)
    assert outcome == unreal.GeometryScriptOutcomePins.SUCCESS, str(outcome)
    return dynamic


def _mesh_triangles(mesh, frame=None):
    query = unreal.GeometryScript_MeshQueries
    # Unreal's name conversion separates the last acronym letter before a
    # plural suffix: GetAllTriangleIDs -> get_all_triangle_i_ds.
    triangle_ids = getattr(query, "get_all_triangle_i_ds", None) or getattr(query, "get_all_triangle_ids")
    _, id_list, _ = triangle_ids(mesh)
    ids = unreal.GeometryScript_List.convert_index_list_to_array(id_list)
    triangles = []
    for triangle_id in ids:
        valid, p1, p2, p3 = query.get_triangle_positions(mesh, triangle_id)
        assert valid
        material_id, valid_material = unreal.GeometryScript_Materials.get_triangle_material_id(mesh, triangle_id)
        triangle_uvs = getattr(query, "get_triangle_u_vs", None) or getattr(query, "get_triangle_uvs")
        uv1, uv2, uv3, valid_uv = triangle_uvs(mesh, 0, triangle_id)
        _, n1, n2, n3, valid_normal = query.get_triangle_normals(mesh, triangle_id)
        corners = []
        for p, uv, n in zip((p1, p2, p3), (uv1, uv2, uv3), (n1, n2, n3)):
            position, normal = _xyz(p), _xyz(n)
            if frame:
                position, normal = _transform_position(position, frame), _transform_normal(normal, frame)
            corners.append({"position": position, "normal": normal if valid_normal else None,
                            "uv": _uv(uv) if valid_uv else None,
                            "triangle_id": int(triangle_id), "material_id": int(material_id) if valid_material else None})
        triangles.append(tuple(corners))
    return triangles


def _canonical(corners):
    # Cyclic rotations preserve winding; reversed faces are deliberately unequal.
    positions = tuple(c["position"] for c in corners)
    index = min(range(3), key=lambda i: positions[i:] + positions[:i])
    return positions[index:] + positions[:index], corners[index:] + corners[:index]


def _compare_triangles(actual, expected, native_placeholder_material_ids=None):
    """Snap within a measured tolerance, then compare full directed face multisets.

    Vertex reindexing, seam splitting or welding are allowed. Topology, winding,
    triangle multiplicity and corner UV/normal bindings must still match.
    """
    grid = defaultdict(list)
    tolerance = POSITION_TOLERANCE_CM
    points = {c["position"] for triangle in expected for c in triangle}
    def cell(p):
        return tuple(math.floor(x / tolerance) for x in p)
    for p in points:
        grid[cell(p)].append(p)
    cache, maximum_error, unmatched_positions = {}, 0.0, 0
    def snap(p):
        nonlocal maximum_error, unmatched_positions
        if p in cache:
            return cache[p]
        center = cell(p)
        candidates = (q for delta in itertools.product((-1, 0, 1), repeat=3)
                      for q in grid.get(tuple(center[i] + delta[i] for i in range(3)), ()))
        closest, distance = None, float("inf")
        for q in candidates:
            d = sum((a - b) ** 2 for a, b in zip(p, q))
            if d < distance:
                closest, distance = q, d
        error = math.sqrt(distance)
        if error <= tolerance:
            maximum_error = max(maximum_error, error)
        else:
            unmatched_positions += 1
        cache[p] = closest if error <= tolerance else p
        return cache[p]
    ref = defaultdict(list)
    for triangle in expected:
        key, corners = _canonical(triangle)
        ref[key].append(corners)
    expected_counts = Counter({key: len(value) for key, value in ref.items()})
    actual_counts = Counter()
    actual_details = defaultdict(list)
    maximum_uv_error = maximum_normal_error = 0.0
    missing_uv = missing_normals = attribute_mismatches = 0
    for triangle in actual:
        triangle = tuple(dict(c, raw_position=c["position"], position=snap(c["position"])) for c in triangle)
        key, corners = _canonical(triangle)
        actual_counts[key] += 1
        actual_details[key].append(corners)
        if key not in ref:
            continue
        comparison = []
        for reference in ref[key]:
            uv_error = normal_error = 0.0
            valid_uv = all(c["uv"] is not None for c in corners)
            valid_normal = all(c["normal"] is not None for c in corners)
            if valid_uv:
                uv_error = max(abs(a - b) for c, r in zip(corners, reference) for a, b in zip(c["uv"], r["uv"]))
            if valid_normal:
                normal_error = max(abs(a - b) for c, r in zip(corners, reference) for a, b in zip(c["normal"], r["normal"]))
            comparison.append((uv_error + normal_error, uv_error, normal_error, valid_uv, valid_normal))
        _, uv_error, normal_error, valid_uv, valid_normal = min(comparison)
        missing_uv += not valid_uv
        missing_normals += not valid_normal
        maximum_uv_error = max(maximum_uv_error, uv_error)
        maximum_normal_error = max(maximum_normal_error, normal_error)
        attribute_mismatches += (not valid_uv or not valid_normal or uv_error > UV_TOLERANCE or normal_error > NORMAL_TOLERANCE)
    missing = sum((expected_counts - actual_counts).values())
    extra_counts = actual_counts - expected_counts
    extra = sum(extra_counts.values())
    extra_details, placeholder_count = [], 0
    for key, count in extra_counts.items():
        for corners in actual_details[key][-count:]:
            placeholder = (native_placeholder_material_ids is not None and expected_counts[key] == 0 and count == 1
                           and all(c["raw_position"] == (0.0, 0.0, 0.0)
                                   and c["normal"] == (0.0, 0.0, 0.0) and c["uv"] == (0.0, 0.0)
                                   and c.get("material_id") in native_placeholder_material_ids for c in corners))
            placeholder_count += bool(placeholder)
            if len(extra_details) < 8:
                extra_details.append({"native_material_placeholder": bool(placeholder), "corners": corners})
    # Engine NaniteAssemblyDataBuilder.cpp 421–452 creates exactly one all-zero
    # degenerate face for each material absent from the base geometry. Accept
    # only those explicit unused material slots; all real faces remain exact.
    accepted_placeholders = (placeholder_count if native_placeholder_material_ids is not None
                             and placeholder_count <= len(native_placeholder_material_ids) else 0)
    geometry_ok = missing == 0 and extra == accepted_placeholders and len(actual) == len(expected) + accepted_placeholders
    attributes_ok = geometry_ok and attribute_mismatches == 0
    return {"passed": geometry_ok and attributes_ok, "positions_topology_winding": geometry_ok,
            "corner_uv_normals": attributes_ok, "expected_triangles": len(expected), "actual_triangles": len(actual),
            "missing_triangles": missing, "extra_triangles": extra, "attribute_mismatches": attribute_mismatches,
            "accepted_native_material_placeholders": accepted_placeholders,
            "extra_surface_triangles": extra - accepted_placeholders, "extra_triangle_details": extra_details,
            "placeholder_engine_source": "Engine/Private/NaniteAssemblyDataBuilder.cpp:421–452" if accepted_placeholders else None,
            "missing_uv_triangles": missing_uv, "missing_normal_triangles": missing_normals,
            "max_position_error_cm": maximum_error if not unmatched_positions else None,
            "max_matched_position_error_cm": maximum_error, "unmatched_unique_positions": unmatched_positions,
            "max_uv_error": maximum_uv_error,
            "max_normal_component_error": maximum_normal_error,
            "tolerances": {"position_cm": tolerance, "uv": UV_TOLERANCE, "normal_component": NORMAL_TOLERANCE}}


def _path(value):
    if isinstance(value, unreal.Object):
        return value.get_path_name()
    return str(value)


def _material_root(material):
    while isinstance(material, unreal.MaterialInstance):
        parent = material.get_editor_property("parent")
        if not parent:
            break
        material = parent
    return material.get_path_name() if material else None


def _is_transient_pve_component(component):
    # PVE's MeshRenderer and FoliageRenderer create ownerless components in the
    # transient package. WorldPrivate and WorldType are not Python-reflected.
    return component.get_owner() is None and component.get_outer().get_path_name() == "/Engine/Transient"


def _match_frames(actual, expected):
    remaining = list(expected)
    maxima = {"position_cm": 0.0, "direction": 0.0, "scale": 0.0}
    for frame in actual:
        if not remaining:
            return {"passed": False, "error": "More actual transforms than expected"}
        index = min(range(len(remaining)), key=lambda i: sum((a - b) ** 2 for a, b in zip(frame["translation"], remaining[i]["translation"])))
        error = _frame_error(frame, remaining.pop(index))
        maxima = {key: max(maxima[key], value) for key, value in error.items()}
    passed = not remaining and maxima["position_cm"] <= POSITION_TOLERANCE_CM and maxima["direction"] <= 0.000002 and maxima["scale"] <= 0.000002
    return {"passed": passed, "expected_count": len(expected), "actual_count": len(actual), "max_errors": maxima}


def run(name, OUTPUT, row, _batch=False):
    started = time.time()
    # A previous asynchronous capture must finish or be explicitly superseded
    # before replacing its stage/world. Keep its own incomplete report honest.
    for module_name, module in ([] if _batch else list(sys.modules.items())):
        if module_name.startswith("trunk_native_stage_"):
            active = getattr(module, "_ACTIVE", [])
            for pending, stage_report, _, _ in list(active):
                if not stage_report.get("completed"):
                    try:
                        unreal.unregister_slate_post_tick_callback(pending["handle"])
                    except Exception:
                        pass
                    stage_report["superseded_by_audit"] = True
            active.clear()
    assert name in ("Grooved", "Buttress", "Refined")
    assert Path(unreal.Paths.get_project_file_path()).resolve().parent == (ROOT / ".runtime/trunk-feasibility/UEProbe").resolve()
    assert row["output_folder"].startswith("/Game/TrunkFeasibility/VisualTrial")
    package = ROOT / ".runtime/trunk-feasibility" / name / "PVE_Complete"
    manifest = json.loads((package / "whole.resolved.json").read_text(encoding="utf8"))
    binary = (package / manifest["binary"]).read_bytes()
    assert hashlib.sha256(binary).hexdigest().upper() == manifest["binary_sha256"].upper()
    asset = unreal.load_asset(row["graph"])
    graph = unreal.find_object(asset, "ProceduralVegetationGraph")
    assert graph and graph.get_outer() == asset
    settings = next(node.get_settings() for node in graph.get_editor_property("Nodes")
                    if node.get_settings().get_class().get_name() == "PVBranchForgePreviewSettings")
    source_paths = [_path(v) for v in settings.get_editor_property("SharedPartMeshes")]
    expected_materials = [_path(settings.get_editor_property(field)) for field in ("AssemblyBarkMaterial", "AssemblyFoliageMaterial")]
    reference_base = _reference_triangles(manifest, binary, lambda c: c["instance_index"] < 0)
    frames_by_source = {i: [_frame(instance) for instance in manifest["instances"] if instance["source_index"] == i]
                        for i in range(len(source_paths))}
    report = {"sample": name, "engine": unreal.SystemLibrary.get_engine_version(), "graph": row["graph"],
              "binary_sha256": manifest["binary_sha256"], "source_sha256": manifest["source_sha256"],
              "preview": {"passed": False}, "complete_source_parts": {"passed": False}, "native_exports": [],
              "scope": {"native_source_geometry": True, "reduced_nanite_fallback_not_used": True,
                        "complete_unit_reuse_required": True, "vertex_color_not_audited": True,
                        "wind_not_audited": True,
                        "preview_filter": "Unique ownerless transient PVE components, exact sample source/material bindings"},
              "errors": []}
    try:
        components = [component for component in unreal.ObjectIterator(unreal.DynamicMeshComponent)
                      if _is_transient_pve_component(component) and any(
                          _material_root(component.get_material(i)) in expected_materials
                          for i in range(component.get_num_materials()))]
        assert len(components) == 1, "Expected one live PVE base mesh component, found " + str(len(components))
        component = components[0]
        preview_geometry = _compare_triangles(_mesh_triangles(component.get_dynamic_mesh()), reference_base)
        instanced = [component for component in unreal.ObjectIterator(unreal.InstancedStaticMeshComponent)
                     if _is_transient_pve_component(component) and component.get_editor_property("static_mesh")
                     and _path(component.get_editor_property("static_mesh")) in source_paths]
        assert len(instanced) == len(source_paths), "PVE complete-source component count mismatch: " + str(len(instanced))
        rows = []
        for index, path in enumerate(source_paths):
            matches = [c for c in instanced if _path(c.get_editor_property("static_mesh")) == path]
            assert len(matches) == 1, "Duplicate/missing live complete-source component: " + path
            component = matches[0]
            actual = [_transform_frame(component.get_instance_transform(i, world_space=False)) for i in range(component.get_instance_count())]
            rows.append(dict(_match_frames(actual, frames_by_source[index]), source_index=index, path=path))
        report["preview"] = {"passed": preview_geometry["passed"] and all(r["passed"] for r in rows),
                             "base_geometry": preview_geometry, "complete_instances": rows,
                             "source_count": len(rows), "instance_count": sum(r["actual_count"] for r in rows)}
    except Exception:
        report["preview"]["error"] = traceback.format_exc()
    try:
        rows = []
        for index, path in enumerate(source_paths):
            mesh = unreal.load_asset(path)
            assert isinstance(mesh, unreal.StaticMesh)
            first_instance = next(i for i, instance in enumerate(manifest["instances"]) if instance["source_index"] == index)
            expected = _reference_triangles(manifest, binary, lambda c, k=first_instance: c["instance_index"] == k)
            actual = _mesh_triangles(_static_dynamic(mesh), _frame(manifest["instances"][first_instance]))
            geometry = _compare_triangles(actual, expected)
            materials = [_path(slot.material_interface) if slot.material_interface else None for slot in mesh.get_editor_property("static_materials")]
            nanite = bool(mesh.get_editor_property("nanite_settings").get_editor_property("enabled"))
            rows.append({"source_index": index, "path": path, "geometry": geometry, "materials": materials,
                         "nanite_enabled": nanite, "passed": geometry["passed"] and nanite and materials == expected_materials})
        report["complete_source_parts"] = {"passed": len(rows) == 6 and all(r["passed"] for r in rows), "parts": rows}
    except Exception:
        report["complete_source_parts"]["error"] = traceback.format_exc()
    for path in unreal.EditorAssetLibrary.list_assets(row["output_folder"], recursive=True, include_folder=False):
        mesh = unreal.load_asset(path)
        if not isinstance(mesh, unreal.StaticMesh):
            continue
        export = {"path": mesh.get_path_name(), "passed": False}
        try:
            base_material_ids = {0 if chunk["material_role"] == "bark" else 1 for chunk in manifest["chunks"]
                                 if chunk["instance_index"] < 0}
            unused_base_material_ids = set(range(len(expected_materials))) - base_material_ids
            geometry = _compare_triangles(_mesh_triangles(_static_dynamic(mesh)), reference_base,
                                          native_placeholder_material_ids=unused_base_material_ids)
            export["base_geometry"] = geometry
            nanite_settings = mesh.get_editor_property("nanite_settings")
            assembly = nanite_settings.get_editor_property("nanite_assembly_data")
            # Nodes/PartIndex/Transform are serialized UPROPERTY fields without
            # editor visibility. StructBase.export_text is the public read-only
            # API supplied by PythonScriptPlugin; do not alter access flags.
            assembly_text = assembly.export_text()
            assembly_file = Path(OUTPUT) / (name + "-nanite-assembly.txt")
            assembly_file.write_text(assembly_text, encoding="utf8")
            serialized = _exported_struct(assembly_text)
            parts, nodes = serialized.get("Parts", []), serialized.get("Nodes", [])
            part_paths = [part["MeshObjectPath"] for part in parts]
            final_materials = [_path(slot.material_interface) if slot.material_interface else None
                               for slot in mesh.get_editor_property("static_materials")]
            material_rows = []
            for part, source in zip(parts, part_paths):
                source_mesh = unreal.load_asset(source)
                source_materials = [_path(slot.material_interface) if slot.material_interface else None
                                    for slot in source_mesh.get_editor_property("static_materials")]
                remap = part.get("MaterialRemap", []) or list(range(len(source_materials)))
                bound_materials = [final_materials[i] if 0 <= i < len(final_materials) else None for i in remap]
                material_rows.append({"path": source, "material_remap": remap, "source_materials": source_materials,
                                      "final_bound_materials": bound_materials, "passed": source_materials == bound_materials})
            same_materials = len(material_rows) == len(source_paths) and all(r["passed"] for r in material_rows)
            rows = []
            for index, source in enumerate(source_paths):
                actual = [_text_transform_frame(node["Transform"]) for node in nodes
                          if part_paths[node["PartIndex"]] == source]
                rows.append(dict(_match_frames(actual, frames_by_source[index]), source_index=index, path=source))
            local_transforms = all(str(node.get("TransformSpace", "Local")).rsplit("::", 1)[-1] == "Local" for node in nodes)
            no_bones = all(not node.get("BoneInfluences", []) for node in nodes)
            source_reuse = Counter(part_paths) == Counter(source_paths)
            nanite_enabled = bool(nanite_settings.get_editor_property("enabled"))
            export.update({"base_geometry": geometry, "nanite_enabled": nanite_enabled, "final_material_paths": final_materials,
                           "nanite_assembly": {"source_count": len(parts), "instance_count": len(nodes), "part_paths": part_paths,
                                               "public_serialization": str(assembly_file),
                                               "same_material_bindings": same_materials, "material_bindings": material_rows,
                                               "same_source_references": source_reuse, "local_transforms": local_transforms,
                                               "no_static_bone_influences": no_bones, "instances": rows},
                           "passed": geometry["passed"] and nanite_enabled and source_reuse and same_materials and len(nodes) == 24
                                     and local_transforms and all(r["passed"] for r in rows)})
            if export["passed"]:
                export["saved_for_cold_reload"] = bool(unreal.EditorAssetLibrary.save_loaded_asset(mesh, only_if_is_dirty=False))
                export["passed"] = export["passed"] and export["saved_for_cold_reload"]
        except Exception:
            export["error"] = traceback.format_exc()
        report["native_exports"].append(export)
    report["preview_verified"] = report["preview"]["passed"]
    report["native_export_verified"] = (report["complete_source_parts"]["passed"] and bool(report["native_exports"])
                                          and all(r["passed"] for r in report["native_exports"]))
    report["passed"] = report["preview_verified"] and report["native_export_verified"]
    batch_request = Path(OUTPUT) / "batch-native-request.json"
    if not _batch and batch_request.is_file() and json.loads(batch_request.read_text(encoding="utf-8-sig")).get("enabled"):
        state = json.loads((Path(OUTPUT) / "state.json").read_text(encoding="utf-8-sig"))
        summaries = []
        for other_name, other_row in state["assets"].items():
            other = report if other_name == name else run(other_name, OUTPUT, other_row, _batch=True)
            (Path(OUTPUT) / (other_name + "-native-audit.json")).write_text(json.dumps(other, ensure_ascii=False, indent=2), encoding="utf8")
            summaries.append({"sample": other_name, "native_export_verified": other["native_export_verified"]})
        report["batch_native"] = summaries
    stage_request = Path(OUTPUT) / "stage-request.json"
    if not _batch and stage_request.is_file():
        try:
            request = json.loads(stage_request.read_text(encoding="utf-8-sig"))
            if request.get("name") == name:
                import importlib.util
                spec = importlib.util.spec_from_file_location("trunk_native_stage", ROOT / "scripts/ue-trunk-render-stage.py")
                helper = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(helper)
                # Retain the module while its asynchronous Slate screenshot
                # callback waits for assets, rendering and screenshot completion.
                sys.modules["trunk_native_stage_" + name] = helper
                report["stage"] = helper.run(name, OUTPUT, row)
        except Exception:
            report["stage"] = {"passed": False, "error": traceback.format_exc()}
    restart_request = Path(OUTPUT) / "restart-request.json"
    if not _batch and restart_request.is_file() and json.loads(restart_request.read_text(encoding="utf-8-sig")).get("enabled"):
        state = json.loads((Path(OUTPUT) / "state.json").read_text(encoding="utf-8-sig"))
        preserved = []
        for probe_row in state["assets"].values():
            assert probe_row["output_folder"].startswith("/Game/TrunkFeasibility/VisualTrial")
            for path in unreal.EditorAssetLibrary.list_assets(probe_row["output_folder"], recursive=True, include_folder=False):
                loaded = unreal.load_asset(path)
                if isinstance(loaded, unreal.StaticMesh):
                    preserved.append({"path": loaded.get_path_name(),
                                      "saved": bool(unreal.EditorAssetLibrary.save_loaded_asset(loaded, only_if_is_dirty=False)),
                                      "reason": "Preserve measured native outputs before probe renderer restart; this does not certify assembly parity"})
        for module_name, module in list(sys.modules.items()):
            if module_name.startswith("trunk_native_stage_"):
                active = getattr(module, "_ACTIVE", [])
                for pending, _, _, _ in list(active):
                    try:
                        unreal.unregister_slate_post_tick_callback(pending["handle"])
                    except Exception:
                        pass
                active.clear()
        report["restart"] = {"requested": True, "preserved_native_assets": preserved,
                             "reason": "Restart isolated UEProbe with explicit Nanite assembly renderer support"}
        # The editor processes this exit after the current callback returns; the
        # outer narrow command handler still writes its final JSON status.
        unreal.SystemLibrary.quit_editor()
    report["elapsed_seconds"] = round(time.time() - started, 3)
    return report
