"""Run inside UE 5.8 PythonScript commandlet; never controls an editor window.

Input is a JSON config path passed as the first script argument. Imports only to
a fresh /Game folder, or audits an existing output on a separate reload run.
"""
import hashlib
import json
import re
import sys
import traceback
from pathlib import Path

import unreal

config = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
package = Path(config['package']).resolve()
destination = config['destination'].rstrip('/')
report = Path(config['report']).resolve()
result = {'passed': False, 'mode': config.get('mode', 'import'), 'destination': destination,
          'engine': unreal.SystemLibrary.get_engine_version(), 'assets': []}

def vec(v):
    return [v.x, v.y, v.z]

try:
    assert destination.startswith('/Game/Day30/Vegetation/StaticUSD/'), 'Use the isolated StaticUSD content root'
    manifest = json.loads((package / 'static_vegetation.manifest.json').read_text(encoding='utf8'))
    assert manifest['format'] == 'BranchForgeStaticVegetation'
    for filename, item in manifest['files'].items():
        file = (package / filename).resolve()
        assert file.parent == package
        assert hashlib.sha256(file.read_bytes()).hexdigest().upper() == item['sha256'].upper(), filename
    result['source_sha256'] = manifest['source_sha256']
    result['usd_sha256'] = manifest['files']['vegetation.usda']['sha256']
    result['expected'] = manifest['summary']
    if result['mode'] == 'import':
        assert not unreal.EditorAssetLibrary.does_directory_exist(destination), 'Preserve existing assets: choose a new destination'
        options = unreal.UsdStageImportOptions()
        for name, value in {
            'import_actors': False, 'import_geometry': True, 'import_materials': True,
            'import_skeletal_animations': False, 'import_level_sequences': False,
            'import_groom_assets': False, 'import_sparse_volume_textures': False, 'import_sounds': False,
            'override_stage_options': False, 'share_assets_for_identical_prims': True,
            'use_existing_asset_cache': False, 'use_prim_kinds_for_collapsing': False,
            'prim_path_folder_structure': False, 'merge_identical_material_slots': True,
            'nanite_triangle_threshold': 0,
        }.items():
            options.set_editor_property(name, value)
        task = unreal.AssetImportTask()
        task.filename = str(package / 'vegetation.usda')
        task.destination_path = destination
        task.automated = True
        task.save = True
        task.replace_existing = False
        task.options = options
        unreal.log('BRANCHFORGE_STATIC_USD_IMPORT_BEGIN ' + destination)
        unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
        result['task_paths'] = list(task.imported_object_paths)
        unreal.log('BRANCHFORGE_STATIC_USD_IMPORT_FINISHED')
    paths = unreal.EditorAssetLibrary.list_assets(destination, recursive=True, include_folder=False)
    assert paths, 'Official USD importer created no assets'
    assemblies = []
    for path in sorted(paths):
        asset = unreal.load_asset(path)
        assert asset, path
        row = {'path': path, 'class': asset.get_class().get_name()}
        if isinstance(asset, unreal.StaticMesh):
            settings = asset.get_editor_property('nanite_settings')
            data = settings.get_editor_property('nanite_assembly_data')
            parts = list(data.get_editor_property('parts'))
            assembly_text = data.export_text()
            # UE does not expose Nodes as editable Python properties. Its public
            # struct text serializer still permits a complete read-only audit.
            node_indices = [int(x) for x in re.findall(r'PartIndex=(-?\d+)', assembly_text)]
            row.update(nanite_enabled=settings.enabled, parts=len(parts), instances=len(node_indices),
                       bounds_origin_cm=vec(asset.get_bounds().origin), bounds_extent_cm=vec(asset.get_bounds().box_extent),
                       lod_count=asset.get_num_lods(), vertices=asset.get_num_vertices(0),
                       nanite_triangles=asset.get_num_nanite_triangles(), nanite_vertices=asset.get_num_nanite_vertices(),
                       materials=[s.material_interface.get_path_name() if s.material_interface else None for s in asset.static_materials])
            row['part_paths'] = [re.search(r'/Game/[^\s\"\'(),]+', p.export_text()).group(0) for p in parts]
            row['usd_prim_paths'] = [str(p) for d in asset.get_editor_property('asset_user_data') if isinstance(d, unreal.UsdAssetUserData) for p in d.prim_paths]
            if node_indices:
                row['assembly_text'] = assembly_text
                row['node_part_indices'] = node_indices
                row['leaf_instances'] = sum('SM_Leaf' in row['part_paths'][i] for i in row['node_part_indices'])
                row['base_instances'] = sum('SM_Base' in row['part_paths'][i] for i in row['node_part_indices'])
                assert row['leaf_instances'] + row['base_instances'] == len(node_indices)
                assert settings.enabled and len(parts) > 0
                assert all(row['materials']), 'Assembly has unbound material slots'
                assemblies.append(row)
        elif isinstance(asset, unreal.MaterialInstanceConstant):
            row['parent'] = asset.parent.get_path_name() if asset.parent else None
            row['texture_parameters'] = [p.export_text() for p in asset.texture_parameter_values]
            row['scalar_parameters'] = [p.export_text() for p in asset.scalar_parameter_values]
            row['vector_parameters'] = [p.export_text() for p in asset.vector_parameter_values]
        elif isinstance(asset, unreal.Texture2D):
            row['srgb'] = asset.srgb
        result['assets'].append(row)
        if result['mode'] == 'import':
            assert unreal.EditorAssetLibrary.save_loaded_asset(asset, only_if_is_dirty=False), 'Save failed: ' + path
    result['assembly_count'] = len(assemblies)
    result['instance_count'] = sum(a['instances'] for a in assemblies)
    result['leaf_instance_count'] = sum(a['leaf_instances'] for a in assemblies)
    assert len(assemblies) == manifest['assembly_count'], 'Output is not the expected Nanite assembly count'
    assert result['leaf_instance_count'] == manifest['summary']['shared_leaves'], 'Leaf instance count mismatch'
    assert sum(a['nanite_triangles'] for a in assemblies) == manifest['summary']['triangles'], 'Nanite render triangle count mismatch'
    known_paths = {a['path'] for a in result['assets']}
    assert all(p in known_paths for a in assemblies for p in a['part_paths']), 'Saved assembly has a missing part asset'
    assert not any('Translucent' in (a.get('parent') or '') for a in result['assets']), 'Translucent material is incompatible with Nanite'
    result['passed'] = True
except Exception:
    result['error'] = traceback.format_exc()
    unreal.log_error(result['error'])
finally:
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
    unreal.log('BRANCHFORGE_STATIC_USD_REPORT ' + str(report))
if not result['passed']:
    raise RuntimeError(result.get('error', 'Static USD audit failed'))
