"""Version-3 imported trunks: checked data and dependencies, no Unreal import."""
import hashlib
import json
import math
import struct
from pathlib import Path


def read_trunk_contract(path, data):
    from branchforge_pve_contract import ContractError
    def require(value, message):
        if not value:
            raise ContractError(message)
    directory = path.parent.resolve()
    def file(name):
        require(isinstance(name, str) and Path(name).name == name and '\\' not in name,
                '资源引用必须为包内文件名')
        value = (directory / name).resolve()
        require(value.parent == directory and value.is_file(), '资源文件缺失：' + name)
        return value
    def read(name):
        return json.loads(file(name).read_text(encoding='utf-8-sig'))
    capabilities = data.get('required_capabilities')
    require(isinstance(capabilities, list) and set(capabilities) == {
        'imported_trunk_materials_v1', 'imported_trunk_skin_v1'}, '树干包能力声明不受支持')
    require(data.get('coordinate_system', {}).get('up') == 'Z' and
            data.get('coordinate_system', {}).get('unit') == 'meter', '树干骨架必须为 Z 向上、米制')
    branches, sources, instances = (data.get(k) for k in ('branches', 'foliage_sources', 'foliage'))
    require(isinstance(branches, list) and branches, '树干骨架为空')
    require(isinstance(sources, list) and isinstance(instances, list), '完整单元枝列表无效')
    ids = [s.get('id') for s in sources]
    branch_ids = [b.get('id') for b in branches]
    require(all(isinstance(i, str) and i for i in ids + branch_ids) and
            len(set(ids)) == len(ids) and len(set(branch_ids)) == len(branch_ids), '骨架或单元枝身份无效')
    counts = dict.fromkeys(ids, 0)
    seen = set()
    for item in instances:
        i = item.get('source_index')
        require(type(i) is int and 0 <= i < len(ids) and item.get('branch_id') in branch_ids,
                '完整单元枝来源或挂接枝无效')
        require(isinstance(item.get('id'), str) and item['id'] not in seen, '完整单元枝身份重复')
        seen.add(item['id']); counts[ids[i]] += 1
    assembly = data.get('complete_unit_assembly', {})
    require(assembly.get('source_mesh_count') == len(ids) and assembly.get('unit_count') == len(instances)
            and assembly.get('leaf_instances') == 0 and assembly.get('organ_instances') == 0,
            '完整单元枝装配数量不一致')
    trunks = data.get('imported_trunks', {})
    require(trunks.get('version') == 1 and trunks.get('mounts') and trunks.get('sources'), '缺少固定树干来源')
    for mount in trunks['mounts']:
        require(set(mount.get('guide_map', {}).values()).issubset(set(branch_ids)) and mount.get('guide_map'),
                '树干控制枝引用无效')
    manifest = read('complete_units.manifest.json')
    require(manifest.get('format') == 'BranchForgeCompleteUnitSet' and
            [u.get('id') for u in manifest.get('units', [])] == ids, '完整枝清单与来源顺序不一致')
    for unit in manifest['units']:
        require(unit.get('instance_count') == counts[unit['id']], '完整枝清单安装数量不一致')
    resolved = data.get('resolved_assembly', {})
    payload = read(resolved.get('manifest'))
    binary_file = file(resolved.get('binary'))
    binary = binary_file.read_bytes()
    require(payload.get('format') == 'BranchForgeResolvedAssembly' and payload.get('version') == 1,
            '实际装配格式不受支持')
    require(payload.get('branches') == branches and payload.get('sources') == sources and
            payload.get('instances') == instances, '实际装配与骨架或单元枝不一致')
    require(payload.get('source_sha256') == resolved.get('source_sha256') == manifest.get('source_whole_sha256'),
            '工程来源哈希不一致')
    require(binary[:8] == b'BFRA0001' and len(binary) == payload.get('binary_bytes') and
            hashlib.sha256(binary).hexdigest().upper() == payload.get('binary_sha256', '').upper(),
            '实际装配二进制校验失败')
    validation = read('validation.json')
    require(validation.get('valid') is True and not validation.get('errors'), '导出包未通过完整校验')
    files = [path, file('validation.json')]
    checked_names = set()
    for name, record in validation.get('files', {}).items():
        value = file(name); content = value.read_bytes()
        require(len(content) == record.get('bytes') and hashlib.sha256(content).hexdigest().upper() ==
                record.get('sha256', '').upper(), '包内文件校验失败：' + name)
        checked_names.add(name); files.append(value)
    required = {'complete_units.manifest.json', resolved['manifest'], resolved['binary']}
    skin = payload.get('imported_trunk_skin', {})
    require(skin.get('version') == 1 and skin.get('stride') == 12 and skin.get('nodes'), '缺少树干两节点权重')
    weights = file(skin.get('file')).read_bytes(); required.add(skin['file'])
    require(weights[:8] == b'BFTS0001' and len(weights) == skin.get('bytes') and
            hashlib.sha256(weights).hexdigest().upper() == skin.get('sha256', '').upper(), '树干权重校验失败')
    for node in skin['nodes']:
        require(node.get('branch_id') in branch_ids and len(node.get('position_cm', [])) == 3 and
                all(math.isfinite(v) for v in node['position_cm']), '树干权重控制节点无效')
    end = 8
    for piece in skin.get('pieces', []):
        require(type(piece.get('chunk')) is int and 0 <= piece['chunk'] < len(payload['chunks']), '树干权重分区无效')
        chunk = payload['chunks'][piece['chunk']]
        require(piece.get('offset') == end and piece.get('count') == chunk['vertex_count'], '树干权重与顶点数量不一致')
        for i in range(piece['count']):
            a, b, weight = struct.unpack_from('<IIf', weights, end + i * 12)
            require(a < len(skin['nodes']) and b < len(skin['nodes']) and math.isfinite(weight) and
                    0 <= weight <= 1, '树干权重值无效')
        end += piece['count'] * 12
    require(end == len(weights), '树干权重长度不一致')
    materials = payload.get('imported_trunk_materials', {}).get('materials', [])
    require(materials, '缺少树干 PBR 材质')
    material_ids = {m['id'] for m in materials}
    for chunk in payload['chunks']:
        trunk_material = chunk.get('imported_trunk_material')
        if trunk_material:
            require(trunk_material.get('material_id') in material_ids, '树干材质槽引用无效')
    for material in materials:
        required.update(item['file'] for item in material.get('maps', {}).values())
    required.update(u['glb'] for u in manifest['units'])
    require(required.issubset(checked_names), '依赖未列入完整校验清单')
    if sources:
        require('leaf_atlas_color.png' in checked_names, '完整单元枝缺少图集')
    summary = dict(payload['summary']); summary['binary_bytes'] = len(binary)
    return {'path': path, 'data': data, 'source_ids': ids, 'counts': counts, 'branch_count': len(branches),
            'instance_count': len(instances), 'manifest': manifest, 'resolved_files': [file(resolved['manifest']), binary_file],
            'resolved_summary': summary, 'resolved_payload': payload, 'dependency_files': list(dict.fromkeys(files)),
            'imported_trunk': True, 'warnings': validation.get('quality_warnings', [])}
