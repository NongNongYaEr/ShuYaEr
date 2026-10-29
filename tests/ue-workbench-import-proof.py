"""Exercise the workbench's production entry in an isolated UE commandlet."""
import json
import sys
import traceback
from pathlib import Path
import unreal

config = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
project = Path(unreal.Paths.get_project_file_path()).resolve()
assert project == Path(config['project']).resolve() and project.name == 'UEProbe.uproject'
sys.path.insert(0, config['python'])
from branchforge_pve_package import check_complete_package, create_from_package
from branchforge_pve_contract import read_contract

result = {'passed': False, 'mode': config['mode'], 'cases': []}
try:
    for case in config['cases']:
        if config['mode'] == 'create':
            folder = case['folder']
            assert folder.startswith('/Game/WorkbenchProof/')
            contract, files, warnings = check_complete_package(case['json'], folder)
            report = create_from_package(case['json'], folder, open_editor=False)
            asset = unreal.load_asset(report['asset'])
            staged = read_contract(report['copied_json'])
            assert staged['instance_count'] == contract['instance_count']
            assert staged['branch_count'] == contract['branch_count']
            row = {'name': case['name'], 'asset': report['asset'], 'package': str(staged['path'].parent),
                   'sources': len(contract['source_ids']), 'instances': contract['instance_count'],
                   'branches': contract['branch_count'], 'triangles': contract['resolved_summary']['triangles'],
                   'entry': 'branchforge_pve_package.create_from_package', 'dependency_count': len(files)}
            # A repeat into this occupied folder must stop without changing it.
            try:
                check_complete_package(case['json'], folder)
                raise AssertionError('occupied target must be rejected')
            except (ValueError, RuntimeError) as exc:
                assert '已有资产' in str(exc), str(exc)
            row['occupied_target_rejected'] = True
        else:
            row = dict(case)
            asset = unreal.load_asset(row['asset'])
            assert asset
        graph = unreal.find_object(asset, 'ProceduralVegetationGraph')
        assert graph
        preview = next(n.get_settings() for n in graph.nodes if n.get_settings().get_class().get_name() == 'PVBranchForgePreviewSettings')
        skeleton = next(n.get_settings() for n in graph.nodes if n.get_settings().get_class().get_name() == 'PVBranchForgeSkeletonSettings')
        assert len(skeleton.get_editor_property('leaf_meshes')) == row['sources']
        assert len(preview.get_editor_property('shared_part_meshes')) == row['sources']
        imported_trunk = read_contract(Path(row['package']) / 'whole.pve-skeleton.json').get('imported_trunk', False)
        row['imported_trunk'] = bool(imported_trunk)
        if imported_trunk:
            parts = list(preview.get_editor_property('shared_part_meshes'))
            assert all(parts)
            assert all(mode == 2 for mode in preview.get_editor_property('shared_part_modes'))
            row['whole_shared_parts'] = [part.get_path_name() for part in parts]
            overrides = dict(preview.get_editor_property('assembly_material_overrides'))
            assert overrides
            row['material_paths'] = {k: v.get_path_name() for k, v in overrides.items()}
            row['imported_trunk'] = True
        row['passed'] = True
        result['cases'].append(row)
    result['passed'] = True
except Exception:
    result['error'] = traceback.format_exc()
    unreal.log_error(result['error'])
Path(config['report']).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
if not result['passed']:
    raise RuntimeError(result['error'])
