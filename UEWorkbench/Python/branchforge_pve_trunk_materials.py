"""Build imported trunk PBR materials for the versioned TreeDuck PVE bridge."""
import hashlib
import json
from pathlib import Path
import unreal


def setup(package_directory, content_folder='/Game/TreeDuckTrunks', settings=None):
    directory = Path(package_directory).resolve()
    data = json.loads((directory / 'whole.resolved.json').read_text(encoding='utf-8-sig'))
    records = data.get('imported_trunk_materials', {}).get('materials', [])
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    edit = unreal.MaterialEditingLibrary
    textures, materials = {}, {}
    unreal.EditorAssetLibrary.make_directory(content_folder)

    def texture(item, role):
        filename = item['file']
        if Path(filename).name != filename:
            raise RuntimeError('Trunk image must remain in the package directory')
        source = directory / filename
        if hashlib.sha256(source.read_bytes()).hexdigest() != item['sha256']:
            raise RuntimeError('Trunk image hash mismatch: ' + filename)
        identity = item['sha256'] + '_' + role + '_' + hashlib.sha256(json.dumps(item.get('sampler', {}), sort_keys=True).encode()).hexdigest()
        if identity not in textures:
            task = unreal.AssetImportTask()
            task.filename, task.destination_path = str(source), content_folder
            task.destination_name = 'T_Trunk_' + hashlib.sha256(identity.encode()).hexdigest()[:24]
            task.automated, task.replace_existing, task.save = True, False, True
            tools.import_asset_tasks([task])
            if not task.imported_object_paths:
                raise RuntimeError('Trunk image import failed: ' + filename)
            value = unreal.load_asset(task.imported_object_paths[0])
            value.set_editor_property('srgb', role in ('baseColor', 'emissive'))
            if role == 'normal':
                value.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_NORMALMAP)
                value.set_editor_property('flip_green_channel', True)
            else:
                value.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_DEFAULT)
            sampler = item.get('sampler', {})
            addresses = {33071: unreal.TextureAddress.TA_CLAMP, 33648: unreal.TextureAddress.TA_MIRROR}
            value.set_editor_property('address_x', addresses.get(sampler.get('wrapS'), unreal.TextureAddress.TA_WRAP))
            value.set_editor_property('address_y', addresses.get(sampler.get('wrapT'), unreal.TextureAddress.TA_WRAP))
            unreal.EditorAssetLibrary.save_loaded_asset(value)
            textures[identity] = value
        return textures[identity]

    for record in records:
        name = 'M_' + record['id'].replace('-', '_')
        material = tools.create_asset(name, content_folder, unreal.Material, unreal.MaterialFactoryNew())
        if not material:
            material = unreal.load_asset(content_folder + '/' + name)
        if not material:
            raise RuntimeError('Cannot create trunk material')
        edit.delete_all_material_expressions(material)
        material.set_editor_property('used_with_nanite', True)
        material.set_editor_property('used_with_skeletal_mesh', True)
        material.set_editor_property('two_sided', record['double_sided'])
        material.set_editor_property('blend_mode', {'MASK': unreal.BlendMode.BLEND_MASKED, 'BLEND': unreal.BlendMode.BLEND_TRANSLUCENT}.get(record['alpha_mode'], unreal.BlendMode.BLEND_OPAQUE))
        material.set_editor_property('opacity_mask_clip_value', record['alpha_cutoff'])

        def node(cls, x=0, y=0):
            return edit.create_material_expression(material, cls, x, y)

        def scalar(value, y=0):
            result = node(unreal.MaterialExpressionConstant, -200, y)
            result.set_editor_property('r', value)
            return result

        def multiply(a, out_a, b, out_b='', y=0):
            result = node(unreal.MaterialExpressionMultiply, 100, y)
            assert edit.connect_material_expressions(a, out_a, result, 'A'), 'Material expression connection failed'
            assert edit.connect_material_expressions(b, out_b, result, 'B'), 'Material expression connection failed'
            return result

        def sample(role, y):
            item = record['maps'][role]
            uv = node(unreal.MaterialExpressionTextureCoordinate, -1100, y)
            transform = node(unreal.MaterialExpressionCustom, -850, y)
            inp = unreal.CustomInput()
            inp.set_editor_property('input_name', 'UV')
            transform.set_editor_property('inputs', [inp])
            transform.set_editor_property('output_type', unreal.CustomMaterialOutputType.CMOT_FLOAT2)
            import math
            c, s = math.cos(item['rotation']), math.sin(item['rotation'])
            sx, sy = item['scale']
            ox, oy = item['offset']
            transform.set_editor_property('code', 'return float2(%.12g*UV.x+%.12g*UV.y+%.12g, %.12g*UV.x+%.12g*UV.y+%.12g);' % (c*sx, s*sx, ox, -s*sy, c*sy, oy))
            assert edit.connect_material_expressions(uv, '', transform, 'UV'), 'Material expression connection failed'
            result = node(unreal.MaterialExpressionTextureSample, -550, y)
            result.set_editor_property('texture', texture(item, role))
            result.set_editor_property('sampler_type', unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL if role == 'normal' else unreal.MaterialSamplerType.SAMPLERTYPE_COLOR if role in ('baseColor', 'emissive') else unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
            assert edit.connect_material_expressions(transform, '', result, ''), 'Texture UV connection failed'
            return result

        vertex = node(unreal.MaterialExpressionVertexColor, -300, -150)
        base = sample('baseColor', 0) if 'baseColor' in record['maps'] else None
        color = multiply(base, '', vertex, '') if base else vertex
        assert edit.connect_material_property(color, '', unreal.MaterialProperty.MP_BASE_COLOR), 'Material property connection failed'
        alpha = multiply(vertex, 'A', scalar(record['base_color_linear'][3]))
        if base:
            alpha = multiply(base, 'A', alpha)
        if record['alpha_mode'] in ('MASK', 'BLEND'):
            assert edit.connect_material_property(alpha, '', unreal.MaterialProperty.MP_OPACITY_MASK if record['alpha_mode'] == 'MASK' else unreal.MaterialProperty.MP_OPACITY), 'Material property connection failed'
        if 'metallicRoughness' in record['maps']:
            packed = sample('metallicRoughness', 300)
            rough = multiply(packed, 'G', scalar(record['roughness']))
            metal = multiply(packed, 'B', scalar(record['metalness']))
        else:
            rough, metal = scalar(record['roughness']), scalar(record['metalness'])
        assert edit.connect_material_property(rough, '', unreal.MaterialProperty.MP_ROUGHNESS), 'Material property connection failed'
        assert edit.connect_material_property(metal, '', unreal.MaterialProperty.MP_METALLIC), 'Material property connection failed'
        if 'normal' in record['maps']:
            normal = sample('normal', 550)
            scale = node(unreal.MaterialExpressionCustom, 100, 550)
            inp = unreal.CustomInput()
            inp.set_editor_property('input_name', 'N')
            scale.set_editor_property('inputs', [inp])
            scale.set_editor_property('output_type', unreal.CustomMaterialOutputType.CMOT_FLOAT3)
            scale.set_editor_property('code', 'return normalize(float3(N.xy*%.12g,N.z));' % record['normal_scale'])
            assert edit.connect_material_expressions(normal, '', scale, 'N'), 'Material expression connection failed'
            assert edit.connect_material_property(scale, '', unreal.MaterialProperty.MP_NORMAL), 'Material property connection failed'
        if 'occlusion' in record['maps']:
            ao = sample('occlusion', 800)
            strength = node(unreal.MaterialExpressionCustom, 100, 800)
            inp = unreal.CustomInput()
            inp.set_editor_property('input_name', 'AO')
            strength.set_editor_property('inputs', [inp])
            strength.set_editor_property('output_type', unreal.CustomMaterialOutputType.CMOT_FLOAT1)
            strength.set_editor_property('code', 'return lerp(1,AO,%.12g);' % record['occlusion_strength'])
            assert edit.connect_material_expressions(ao, 'R', strength, 'AO'), 'Material expression connection failed'
            assert edit.connect_material_property(strength, '', unreal.MaterialProperty.MP_AMBIENT_OCCLUSION), 'Material property connection failed'
        emissive = node(unreal.MaterialExpressionConstant3Vector, -200, 1000)
        emissive.set_editor_property('constant', unreal.LinearColor(*record['emissive_factor'], 1))
        if 'emissive' in record['maps']:
            emissive = multiply(sample('emissive', 1000), '', emissive)
        assert edit.connect_material_property(emissive, '', unreal.MaterialProperty.MP_EMISSIVE_COLOR), 'Material property connection failed'
        if record.get('unlit'):
            material.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_UNLIT)
            assert edit.connect_material_property(color, '', unreal.MaterialProperty.MP_EMISSIVE_COLOR), 'Material property connection failed'
        edit.recompile_material(material)
        unreal.EditorAssetLibrary.save_loaded_asset(material, only_if_is_dirty=False)
        materials[record['id']] = material
    if settings is not None:
        try:
            settings.set_editor_property('AssemblyMaterialOverrides', materials)
        except Exception as exc:
            raise RuntimeError('This package requires the current TreeDuck PVE material-table bridge') from exc
    return materials
