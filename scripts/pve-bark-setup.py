r"""Run in Unreal Python. Builds real bark materials; does not modify PVE nodes.

    result = setup(r'C:\path\to\tree_PVE_Complete', '/Game/TreeBark')
    # result['chunk_materials'] maps resolved chunk indices to material objects.
    # Only a non-None AssemblyBarkMaterial is safe for the old single-slot bridge.
"""
import hashlib
import json
import os
import unreal


def setup(package_directory, content_folder='/Game/BranchForgeBark'):
    with open(os.path.join(package_directory, 'whole.resolved.json'), encoding='utf-8-sig') as handle:
        resolved = json.load(handle)
    with open(os.path.join(package_directory, 'complete_units.manifest.json'), encoding='utf-8-sig') as handle:
        manifest = json.load(handle)
    records = {item['id']: item for item in resolved.get('bark_materials', [])}
    textures = {}
    materials = {}
    editing = unreal.MaterialEditingLibrary
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    unreal.EditorAssetLibrary.make_directory(content_folder)

    def texture(record, slot):
        key = record['id'] + '_' + slot
        if key in textures:
            return textures[key]
        image = record['maps'][slot]
        source = os.path.join(package_directory, image['file'])
        with open(source, 'rb') as handle:
            if hashlib.sha256(handle.read()).hexdigest().upper() != image['sha256']:
                raise RuntimeError('Bark PNG hash mismatch: ' + image['file'])
        task = unreal.AssetImportTask()
        task.set_editor_property('filename', source)
        task.set_editor_property('destination_path', content_folder)
        task.set_editor_property('destination_name', key)
        task.set_editor_property('automated', True)
        task.set_editor_property('replace_existing', True)
        task.set_editor_property('save', True)
        tools.import_asset_tasks([task])
        paths = task.get_editor_property('imported_object_paths')
        if not paths:
            raise RuntimeError('Bark texture import failed: ' + image['file'])
        value = unreal.load_asset(paths[0])
        value.set_editor_property('srgb', slot == 'color')
        value.set_editor_property('address_x', unreal.TextureAddress.TA_WRAP)
        value.set_editor_property('address_y', unreal.TextureAddress.TA_WRAP)
        if slot == 'normal':
            value.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_NORMALMAP)
            value.set_editor_property('flip_green_channel', True)
        else:
            value.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_DEFAULT)
        unreal.EditorAssetLibrary.save_loaded_asset(value)
        textures[key] = value
        return value

    def build(binding, resolved_uv):
        record = records[binding['material_id']]
        fingerprint = json.dumps([binding, resolved_uv], sort_keys=True, separators=(',', ':'))
        key = hashlib.sha256(fingerprint.encode()).hexdigest()[:24]
        if key in materials:
            return materials[key]
        name = 'M_Bark_' + key
        value = unreal.load_asset(content_folder + '/' + name)
        if value is None:
            value = tools.create_asset(name, content_folder, unreal.Material, unreal.MaterialFactoryNew())
        if value is None:
            raise RuntimeError('Bark material creation failed: ' + name)
        editing.delete_all_material_expressions(value)
        value.set_editor_property('used_with_nanite', True)
        value.set_editor_property('used_with_skeletal_mesh', True)
        value.set_editor_property('two_sided', False)
        value.set_editor_property('tangent_space_normal', True)

        def node(kind, x, y):
            return editing.create_material_expression(value, kind, x, y)

        coordinate = node(unreal.MaterialExpressionTextureCoordinate, -1100, 0)

        def sample(slot, y):
            matrix = binding['texture_transforms'][slot]['matrix']
            transform = node(unreal.MaterialExpressionCustom, -900, y)
            inp = unreal.CustomInput()
            inp.set_editor_property('input_name', 'UV')
            transform.set_editor_property('inputs', [inp])
            transform.set_editor_property('output_type', unreal.CustomMaterialOutputType.CMOT_FLOAT2)
            transform.set_editor_property('code',
                'float2 p=UV; ' + ('p.y=1-p.y; ' if resolved_uv else '') +
                'return float2(%.12g*p.x+%.12g*p.y+%.12g, %.12g*p.x+%.12g*p.y+%.12g);' %
                (matrix[0], matrix[3], matrix[6], matrix[1], matrix[4], matrix[7]))
            assert editing.connect_material_expressions(coordinate, '', transform, 'UV'), 'Bark expression connection failed'
            sampled = node(unreal.MaterialExpressionTextureSample, -650, y)
            sampled.set_editor_property('texture', texture(record, slot))
            sampler = (unreal.MaterialSamplerType.SAMPLERTYPE_COLOR if slot == 'color' else
                       unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL if slot == 'normal' else
                       unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
            sampled.set_editor_property('sampler_type', sampler)
            assert editing.connect_material_expressions(transform, '', sampled, ''), 'Bark expression connection failed'
            return sampled

        color = sample('color', -220)
        tint = node(unreal.MaterialExpressionConstant3Vector, -650, -410)
        tint.set_editor_property('constant', unreal.LinearColor(*record['base_color_linear'], 1))
        multiply = node(unreal.MaterialExpressionMultiply, -320, -220)
        assert editing.connect_material_expressions(color, '', multiply, 'A'), 'Bark expression connection failed'
        assert editing.connect_material_expressions(tint, '', multiply, 'B'), 'Bark expression connection failed'
        assert editing.connect_material_property(multiply, '', unreal.MaterialProperty.MP_BASE_COLOR), 'Bark property connection failed'
        roughness = sample('roughness', 50)
        rough_factor = node(unreal.MaterialExpressionMultiply, -320, 50)
        rough_factor.set_editor_property('const_b', record['roughness'])
        assert editing.connect_material_expressions(roughness, 'G', rough_factor, 'A'), 'Bark expression connection failed'
        assert editing.connect_material_property(rough_factor, '', unreal.MaterialProperty.MP_ROUGHNESS), 'Bark property connection failed'
        normal = sample('normal', 330)
        strength = node(unreal.MaterialExpressionCustom, -320, 330)
        inp = unreal.CustomInput()
        inp.set_editor_property('input_name', 'N')
        strength.set_editor_property('inputs', [inp])
        strength.set_editor_property('output_type', unreal.CustomMaterialOutputType.CMOT_FLOAT3)
        sx, sy = record['normal_scale']
        strength.set_editor_property('code', 'return normalize(float3(N.x*%.12g,N.y*%.12g,N.z));' % (sx, sy))
        assert editing.connect_material_expressions(normal, '', strength, 'N'), 'Bark expression connection failed'
        assert editing.connect_material_property(strength, '', unreal.MaterialProperty.MP_NORMAL), 'Bark property connection failed'
        editing.recompile_material(value)
        unreal.EditorAssetLibrary.save_loaded_asset(value)
        materials[key] = value
        return value

    chunk_materials = {index: build(chunk['bark_material_binding'], True)
                       for index, chunk in enumerate(resolved['chunks']) if chunk.get('bark_material_binding')}
    unit_materials = {(unit['id'], item['material_index']): build(item, False)
                      for unit in manifest['units'] for item in unit.get('bark_material_bindings', [])}
    # The existing bridge shares its one bark slot with both carrier trunks and
    # complete unit wood. A carrier-only match would overwrite source materials.
    bark_chunks = [index for index, chunk in enumerate(resolved['chunks']) if chunk['material_role'] == 'bark']
    all_bark_materials = [chunk_materials.get(index) for index in bark_chunks]
    unique = {item.get_path_name(): item for item in all_bark_materials if item is not None}
    fallback = next(iter(unique.values())) if all_bark_materials and all(all_bark_materials) and len(unique) == 1 else None
    unreal.log('BranchForge bark: %d chunk bindings, %d complete-model material slots; single shared bark slot compatible: %s' %
               (len(chunk_materials), len(unit_materials), fallback is not None))
    return {'chunk_materials': chunk_materials, 'unit_materials': unit_materials,
            'AssemblyBarkMaterial': fallback, 'multi_material_bridge_required': fallback is None}
