"""Offline contract checks for the packaged Unreal helper; no engine is started."""
import copy
import importlib.util
import json
import os
import shutil
import sys
import tempfile
import types


class Object:
    def __init__(self, kind='', path=''):
        self.kind, self.path, self.properties = kind, path, {}
        self.nodes, self.outputs = [], {}

    def set_editor_property(self, name, value):
        self.properties[name] = value

    def get_editor_property(self, name):
        return self.properties[name]

    def get_path_name(self):
        return self.path


def fake_unreal():
    module = types.ModuleType('unreal')
    assets = {}
    calls = {'textures': [], 'materials': [], 'connections': []}
    module.AssetImportTask = Object
    module.CustomInput = Object
    module.LinearColor = lambda *values: values
    module.Material = 'Material'
    module.MaterialFactoryNew = lambda: 'MaterialFactory'
    for name in ['TextureAddress', 'TextureCompressionSettings', 'CustomMaterialOutputType', 'MaterialSamplerType', 'MaterialProperty']:
        setattr(module, name, types.SimpleNamespace(**{value: value for value in [
            'TA_WRAP', 'TC_NORMALMAP', 'TC_DEFAULT', 'CMOT_FLOAT2', 'CMOT_FLOAT3',
            'SAMPLERTYPE_COLOR', 'SAMPLERTYPE_NORMAL', 'SAMPLERTYPE_LINEAR_COLOR',
            'MP_BASE_COLOR', 'MP_ROUGHNESS', 'MP_NORMAL']}))
    for name in ['TextureCoordinate', 'Custom', 'TextureSample', 'Constant3Vector', 'Multiply']:
        setattr(module, 'MaterialExpression' + name, name)

    def import_tasks(tasks):
        for task in tasks:
            item = Object('Texture', task.properties['destination_path'] + '/' + task.properties['destination_name'])
            item.properties['source'] = task.properties['filename']
            assets[item.path] = item
            task.properties['imported_object_paths'] = [item.path]
            calls['textures'].append(item)

    def create_asset(name, folder, *_):
        item = Object('Material', folder + '/' + name)
        assets[item.path] = item
        calls['materials'].append(item)
        return item

    module.AssetToolsHelpers = types.SimpleNamespace(get_asset_tools=lambda: types.SimpleNamespace(
        import_asset_tasks=import_tasks, create_asset=create_asset))
    module.load_asset = assets.get
    module.EditorAssetLibrary = types.SimpleNamespace(make_directory=lambda *_: True, save_loaded_asset=lambda *_: True)

    def expression(material, kind, *_):
        item = Object(kind)
        material.nodes.append(item)
        return item

    def connect(source, source_pin, target, target_pin):
        calls['connections'].append((source, source_pin, target, target_pin))
        assert source_pin != 'RGB', 'UE unnamed RGB output must use its default port'
        assert target.kind != 'TextureSample' or target_pin == '', 'Texture coordinates use the default input'
        return True

    def connect_property(node, pin, prop):
        assert pin != 'RGB'
        node.properties['material_output'] = prop
        return True

    module.MaterialEditingLibrary = types.SimpleNamespace(
        delete_all_material_expressions=lambda material: material.nodes.clear(),
        create_material_expression=expression, connect_material_expressions=connect,
        connect_material_property=connect_property,
        recompile_material=lambda *_: True)
    module.log = lambda *_: None
    return module, calls


def main(package):
    unreal, calls = fake_unreal()
    sys.modules['unreal'] = unreal
    spec = importlib.util.spec_from_file_location('bark_setup', 'scripts/pve-bark-setup.py')
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    result = helper.setup(package, '/Game/OfflineBark')
    with open(os.path.join(package, 'whole.resolved.json'), encoding='utf-8') as handle:
        resolved = json.load(handle)
    with open(os.path.join(package, 'complete_units.manifest.json'), encoding='utf-8') as handle:
        manifest = json.load(handle)
    assert len(result['chunk_materials']) == sum(bool(chunk.get('bark_material_binding')) for chunk in resolved['chunks'])
    assert len(result['unit_materials']) == sum(len(unit.get('bark_material_bindings', [])) for unit in manifest['units'])
    assert result['AssemblyBarkMaterial'] is None, 'old complete-unit wood forbids using a new carrier-only material globally'
    assert result['multi_material_bridge_required'] is True
    for texture in calls['textures']:
        slot = texture.path.rsplit('_', 1)[-1]
        assert texture.properties['srgb'] == (slot == 'color')
        if slot == 'normal':
            assert texture.properties['compression_settings'] == 'TC_NORMALMAP'
            assert texture.properties['flip_green_channel'] is True
        assert texture.properties['address_x'] == texture.properties['address_y'] == 'TA_WRAP'
    assert calls['materials']
    rough_connections = [item for item in calls['connections'] if item[0].kind == 'TextureSample'
                         and item[0].properties['texture'].path.endswith('_roughness') and item[2].kind == 'Multiply']
    assert rough_connections and all(item[1] == 'G' for item in rough_connections), 'roughness uses the same green channel as Three.js/glTF'
    for material in calls['materials']:
        outputs = {node.properties.get('material_output') for node in material.nodes}
        assert {'MP_BASE_COLOR', 'MP_ROUGHNESS', 'MP_NORMAL'} <= outputs
        samples = [node for node in material.nodes if node.kind == 'TextureSample']
        assert len(samples) == 3
        assert {node.properties['sampler_type'] for node in samples} == {'SAMPLERTYPE_COLOR', 'SAMPLERTYPE_NORMAL', 'SAMPLERTYPE_LINEAR_COLOR'}
        normals = [node for node in material.nodes if node.kind == 'Custom' and node.properties.get('output_type') == 'CMOT_FLOAT3']
        assert len(normals) == 1 and 'normalize(float3(N.x*' in normals[0].properties['code']
        uv = [node for node in material.nodes if node.kind == 'Custom' and node.properties.get('output_type') == 'CMOT_FLOAT2']
        assert len(uv) == 3 and all('return float2(' in node.properties['code'] for node in uv)

    # A genuinely uniform resolved package can use the old one-slot bridge.
    temp = tempfile.mkdtemp(prefix='bark-helper-', dir='.runtime')
    try:
        for name in os.listdir(package):
            if os.path.isfile(os.path.join(package, name)):
                shutil.copyfile(os.path.join(package, name), os.path.join(temp, name))
        uniform = copy.deepcopy(resolved)
        binding = next(chunk['bark_material_binding'] for chunk in uniform['chunks'] if chunk.get('bark_material_binding'))
        for chunk in uniform['chunks']:
            if chunk['material_role'] == 'bark':
                chunk['bark_material_binding'] = binding
        with open(os.path.join(temp, 'whole.resolved.json'), 'w', encoding='utf-8') as handle:
            json.dump(uniform, handle)
        same = helper.setup(temp, '/Game/OfflineUniform')
        assert same['AssemblyBarkMaterial'] is not None
        assert same['multi_material_bridge_required'] is False
        image = uniform['bark_materials'][0]['maps']['color']['file']
        with open(os.path.join(temp, image), 'ab') as handle:
            handle.write(b'tampered')
        try:
            helper.setup(temp, '/Game/OfflineTampered')
            raise AssertionError('Tampered PNG should not be imported')
        except RuntimeError as error:
            assert 'hash mismatch' in str(error)
    finally:
        shutil.rmtree(temp)
    print('Offline Unreal material contract passed; actual UE material application remains unverified')


if __name__ == '__main__':
    main(sys.argv[1])
