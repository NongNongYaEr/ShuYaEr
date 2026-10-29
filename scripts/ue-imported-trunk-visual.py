"""Prepare native PVE export entries in this task's isolated proof project."""
import json
import traceback
from pathlib import Path
import unreal

unreal.EditorPythonScripting.set_keep_python_script_alive(True)
root = Path(__file__).resolve().parents[1]
summary = json.loads((root / '.runtime/external-trunk/ue-proof-result.json').read_text(encoding='utf-8-sig'))
assert summary['passed']
assert Path(unreal.Paths.get_project_file_path()).resolve() == Path(summary['project']).resolve()
report = root / '.runtime/external-trunk/ue-visual-state.json'
state = {'ready': False, 'assets': {}, 'errors': []}
try:
    export_class = unreal.load_class(None, '/Script/ProceduralVegetation.PVExportSettings')
    assert export_class
    graphs = []
    for item in [p for p in summary['phases'] if p['mode'] == 'reload']:
        asset = unreal.load_asset(item['graph'])
        graph = unreal.find_object(asset, 'ProceduralVegetationGraph')
        assert graph
        nodes = list(graph.get_editor_property('Nodes'))
        assert not any(n.get_settings().get_class().get_name() == 'PVExportSettings' for n in nodes), 'Use a new isolated graph for a new visual proof'
        preview = next(n for n in nodes if n.get_settings().get_class().get_name() == 'PVBranchForgePreviewSettings')
        export_node, settings = graph.add_node_of_type(export_class)
        params = settings.get_editor_property('ExportSettings')
        output = '/Game/ImportedTrunkProof/NativeExport/' + item['name']
        params.set_editor_property('ContentBrowserFolder', unreal.DirectoryPath(output))
        params.set_editor_property('MeshName', 'SM_' + item['name'])
        params.set_editor_property('ExportMeshType', type(params.get_editor_property('ExportMeshType')).STATIC_MESH)
        params.set_editor_property('ReplacePolicy', type(params.get_editor_property('ReplacePolicy')).APPEND)
        params.set_editor_property('bCreateNaniteFoliage', True)
        settings.set_editor_property('ExportSettings', params)
        # Keep the visible preview output; PVE Export's Out pin is intentionally invisible.
        assert graph.add_edge(preview, 'Out', export_node, 'In')
        # The export command reads this terminal node's input collection.
        for n in graph.get_editor_property('Nodes'):
            locations = {'PVBranchForgeSkeletonSettings': 0, 'PVMeshBuilderSettings': 320, 'PVBranchForgePreviewSettings': 640, 'PVExportSettings': 960}
            if n.get_settings().get_class().get_name() in locations:
                n.set_node_position(locations[n.get_settings().get_class().get_name()], 0)
        assert unreal.EditorAssetLibrary.save_loaded_asset(asset, only_if_is_dirty=False)
        state['assets'][item['name']] = {'graph': item['graph'], 'package': item['package'], 'output_folder': output}
        graphs.append(asset)
    assert unreal.get_editor_subsystem(unreal.AssetEditorSubsystem).open_editor_for_assets(graphs)
    state['ready'] = True
except Exception:
    state['errors'].append(traceback.format_exc())
    unreal.log_error(state['errors'][-1])
report.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf8')
