"""Apply pinned trunk weights after PVE's native skeletal export.

Call finalize(manifest, skeletal_mesh_asset_path) inside UE. This only changes
the explicitly supplied skeletal asset, validates geometry first, and leaves
the source PVE graph and complete source-model parts unchanged.
"""
import json
from pathlib import Path
import unreal

def finalize(manifest, skeletal_mesh_asset_path):
    manifest = Path(manifest).resolve()
    metadata = json.loads(manifest.read_text(encoding='utf-8-sig'))
    assert metadata.get('imported_trunk_skin', {}).get('version') == 1, 'Missing pinned trunk binding'
    asset = unreal.load_asset(skeletal_mesh_asset_path)
    assert isinstance(asset, unreal.SkeletalMesh), 'Select the newly exported PVE SkeletalMesh'
    cls = unreal.load_class(None, '/Script/Day30ProceduralVegetationZh.BranchForgeAssemblyLibrary')
    assert cls, 'Install the matching TreeDuck PVE bridge'
    library = unreal.get_default_object(cls)
    report = json.loads(library.call_method("FinalizeTrunkBinding", (asset, str(manifest))))
    assert report.get('passed'), report.get('error', 'Trunk binding failed')
    assert unreal.EditorAssetLibrary.save_loaded_asset(asset, only_if_is_dirty=False)
    return report
