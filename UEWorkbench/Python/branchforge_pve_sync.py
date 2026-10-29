"""Synchronize an exported complete package into an existing PVE and its source assets.

Call start_sync from editor commands (imports run on a deferred Slate tick).
plan_sync is read-only. sync_package is for callers already on a safe editor tick.
"""
import hashlib
import json
import re
import shutil
import time
import uuid
from pathlib import Path

import unreal
from branchforge_pve_contract import ContractError, read_contract
from branchforge_pve_importer import PROJECT, _bridge_for_asset, _slot, update_tree_json

HASH_TAG = 'BranchForge.SyncSHA256'
SOURCE_TAG = 'BranchForge.SyncSource'
ID_TAG = 'BranchForge.SourceID'
_active = None


def _hash(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest().upper()


def _name(obj):
    return obj.get_path_name() if obj else None


def _old_path(bridge):
    path = Path(bridge.get_editor_property('skeleton_file').file_path)
    return path if path.is_absolute() else PROJECT / path


def _config(path):
    # Updates may be in Revisions/<digest> or an *_Updates directory.
    for folder in [path.parent, *path.parents]:
        if not folder.is_relative_to(PROJECT / 'PVEData'):
            continue
        config = folder / 'pve_import.json'
        if config.exists():
            return json.loads(config.read_text(encoding='utf-8-sig'))
    return {}


def _atlas_from_material(material):
    if not material or material.get_class().get_name() != 'Material':
        raise ContractError('无法唯一识别叶果图集：当前同步需要可编辑的图集 Material')
    textures = {}
    for expr in unreal.MaterialEditingLibrary.get_material_expressions(material):
        if expr.get_class().get_name().startswith('MaterialExpressionTextureSample'):
            texture = expr.get_editor_property('texture')
            if texture:
                textures[texture.get_path_name()] = texture
    if len(textures) != 1:
        raise ContractError('叶果材质不是单一图集，请先明确图集绑定；不会猜测覆盖贴图')
    return next(iter(textures.values()))


def _unchanged(asset, digest):
    if unreal.EditorAssetLibrary.get_metadata_tag(asset, HASH_TAG) != digest:
        return False
    expected = unreal.EditorAssetLibrary.get_metadata_tag(asset, SOURCE_TAG)
    data = asset.get_editor_property('asset_import_data')
    files = list(data.extract_filenames()) if data else []
    # If the user reimported this path from another source, resynchronize it.
    return bool(expected and files and Path(files[0]).resolve() == Path(expected).resolve()
                and Path(expected).is_file() and _hash(expected) == digest)


def _build_plan(json_path, asset_path):
    contract = read_contract(json_path)
    if not contract['manifest']:
        raise ContractError('同步需要 complete_units.manifest.json 和完整导出包')
    asset = unreal.load_asset(asset_path)
    graph, bridge = _bridge_for_asset(asset)
    old_path = _old_path(bridge)
    previous = read_contract(old_path)
    config = _config(old_path)
    current = list(bridge.get_editor_property('leaf_meshes'))
    if len(current) != len(previous['source_ids']):
        raise ContractError('旧 JSON 枝类数与节点槽数不一致，请先修正绑定')
    previews = [n.get_settings() for n in graph.nodes
                if n.get_settings().get_class().get_name() == 'PVBranchForgePreviewSettings']
    if len(previews) != 1:
        raise ContractError('同步需要一个 BranchForge 整树预览节点')
    preview = previews[0]
    authored = list(preview.get_editor_property('authored_source_meshes'))
    if not authored:
        authored = [unreal.load_asset(config.get('mesh_bindings', {}).get(i, ''))
                    if config.get('mesh_bindings', {}).get(i) else None for i in previous['source_ids']]
    if len(authored) != len(current):
        raise ContractError('基准枝类数组与旧 JSON 不一致')
    old = dict(zip(previous['source_ids'], zip(current, authored)))
    folder = config.get('mesh_folder') or asset.get_path_name().split('.')[0].rsplit('/', 2)[0] + '/Branches'
    if not re.fullmatch(r'/Game/[A-Za-z0-9_/]+', folder):
        raise ContractError('无法确定新增枝类目录')
    bundle = contract['path'].parent
    units = {unit['id']: unit for unit in contract['manifest']['units']}
    actions, objects = [], {}
    used_targets = set()
    for identifier in contract['source_ids']:
        unit = units[identifier]
        source = (bundle / unit['glb']).resolve()
        if not source.is_relative_to(bundle) or source.suffix.lower() != '.glb' or not source.is_file():
            raise ContractError('GLB 必须位于完整包内：' + identifier)
        digest = _hash(source)
        if digest != unit.get('glb_sha256', '').upper():
            raise ContractError('GLB 校验不符：' + identifier)
        bound, baseline = old.get(identifier, (None, None))
        custom = bound and (not baseline or _name(bound) != _name(baseline))
        if custom:
            action, target = 'preserve_custom', bound
        elif baseline:
            target = baseline
            if target.get_class().get_name() != 'StaticMesh':
                raise ContractError(identifier + ' 基准资产不是 StaticMesh')
            _slot(target, 'bark')
            _slot(target, 'leaf')
            action = 'unchanged' if _unchanged(target, digest) else 'reimport'
        else:
            target, action = None, 'import_new'
            if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*', identifier):
                raise ContractError('新增枝类 ID 需要英文、数字或下划线：' + identifier)
            if unreal.EditorAssetLibrary.does_directory_exist(folder + '/' + identifier):
                raise ContractError('新增枝类目录已有资产，请先绑定该类后重试：' + identifier)
        target_path = _name(target)
        if target_path and action != 'preserve_custom':
            if not target_path.startswith('/Game/') or target_path in used_targets:
                raise ContractError('不同枝类不能同步覆盖同一资产或插件资产：' + str(target_path))
            used_targets.add(target_path)
        actions.append({'id': identifier, 'action': action, 'asset': target_path,
                        'source': str(source), 'sha256': digest, 'triangles': unit['triangles']})
        objects[identifier] = target
    atlas_file = bundle / 'leaf_atlas_color.png'
    if not atlas_file.is_file():
        raise ContractError('完整包缺少 leaf_atlas_color.png')
    atlas_material = preview.get_editor_property('assembly_foliage_material')
    if not atlas_material and config.get('leaf_material'):
        atlas_material = unreal.load_asset(config['leaf_material'])
    atlas = _atlas_from_material(atlas_material)
    if not atlas.get_path_name().startswith('/Game/'):
        raise ContractError('不能同步覆盖引擎或插件图集')
    # The fixed source meshes and resolved material must point to the same atlas.
    for action in actions:
        if action['action'] not in ('preserve_custom', 'import_new'):
            leaf = _slot(objects[action['id']], 'leaf')[1]
            if _atlas_from_material(leaf) != atlas:
                raise ContractError('次枝与软件装配使用不同图集，请先统一绑定：' + action['id'])
    digest = _hash(atlas_file)
    texture = {'asset': atlas.get_path_name(), 'source': str(atlas_file), 'sha256': digest,
               'action': 'unchanged' if _unchanged(atlas, digest) else 'reimport'}
    # Legacy resources may predate sync tags. Shared resources with verified
    # import-source bytes need no destructive first-time fingerprint reimport.
    from branchforge_pve_variants import is_shared, _same_file
    for item in actions + [texture]:
        obj = objects[item['id']] if item.get('id') else atlas
        if item['action'] == 'reimport' and is_shared(obj, asset.get_path_name()) and _same_file(obj, item['sha256']):
            item['action'] = 'unchanged'
    report = {'mode': 'sync_package', 'asset': asset.get_path_name(), 'json': str(contract['path']),
              'branches': actions, 'atlas': texture, 'structural_branches': contract['branch_count'],
              'instances': contract['instance_count'], 'removed_source_ids': sorted(set(old) - set(units)),
              'requires_static_mesh_export': True,
              'note': '首次同步将重导入尚无同步指纹的资产；手动换绑保留，移除的枝类资产不删除。'}
    return report, (contract, asset, graph, bridge, preview, old, objects, atlas, folder)


def plan_sync(json_path, asset_path):
    report, context = _build_plan(json_path, asset_path)
    if _requires_shared_version(report, context):
        from branchforge_pve_variants import _plan
        base = context[1].get_path_name().split('.')[0].rsplit('/', 2)[0]
        report, _ = _plan(json_path, asset_path, base + '/ResourceVersions/R_Plan_' + uuid.uuid4().hex[:8], allow_custom=True)
        report.update(mode='sync_shared_version', asset=context[1].get_path_name(), copy_on_write=True,
                      note='共享资源更新：未变化的资源继续复用，变化的资源写入本树的独立版本，其他造型不受影响。')
    return report


def _requires_shared_version(report, context):
    from branchforge_pve_variants import is_shared
    _, asset, _, _, _, _, objects, atlas, _ = context
    return (any(i['action'] == 'reimport' and is_shared(objects[i['id']], asset.get_path_name()) for i in report['branches'])
            or report['atlas']['action'] == 'reimport' and is_shared(atlas, asset.get_path_name()))


def describe_plan(report):
    if report.get('mode') == 'sync_shared_version':
        from branchforge_pve_variants import describe_plan as describe_variant
        return describe_variant(report)
    labels = {'reimport': '原路径重导入', 'unchanged': '未变化，复用',
              'import_new': '新增枝类', 'preserve_custom': '保留手动替换', 'import_version': '导入独立版本（保护其他造型）'}
    lines = [report['asset'], report['note'], '']
    lines += [f"{item['id']}：{labels[item['action']]}" for item in report['branches']]
    lines += ['图集：' + labels[report['atlas']['action']],
              '不再使用的枝类：' + (', '.join(report['removed_source_ids']) or '无'),
              '随后更新树形与共享部件；已有成品 SM 需要重新导出。']
    return '\n'.join(lines)


def _save(asset):
    if not unreal.EditorAssetLibrary.save_loaded_asset(asset, only_if_is_dirty=False):
        raise RuntimeError('保存失败：' + asset.get_path_name())


def _backup(asset, root, report):
    _save(asset)
    package = asset.get_path_name().split('.')[0]
    if not package.startswith('/Game/'):
        raise ContractError('备份仅支持 /Game 资产')
    relative = package[len('/Game/'):]
    files = []
    for ext in ('.uasset', '.uexp', '.ubulk'):
        source = PROJECT / 'Content' / (relative + ext)
        if source.exists():
            target = root / 'Content' / (relative + ext)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            files.append(str(target))
    if not files:
        raise RuntimeError('资产备份不存在：' + package)
    report.setdefault('backups', {})[asset.get_path_name()] = files


def _durable_source(item, key):
    source = Path(item['source'])
    target = PROJECT / 'PVEData/Imported' / key / 'SourceFiles' / item['sha256'] / source.name
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists() or _hash(target) != item['sha256']:
        shutil.copy2(source, target)
    if _hash(target) != item['sha256']:
        raise RuntimeError('复制期间源文件发生变化，请重新执行同步')
    return target


def _stamp(asset, item, source):
    unreal.EditorAssetLibrary.set_metadata_tag(asset, HASH_TAG, item['sha256'])
    unreal.EditorAssetLibrary.set_metadata_tag(asset, SOURCE_TAG, str(source))
    if item.get('id'):
        unreal.EditorAssetLibrary.set_metadata_tag(asset, ID_TAG, item['id'])


def _restore_materials(mesh, saved):
    by_name = {str(slot.material_slot_name): slot.material_interface for slot in saved}
    imported = list(mesh.get_editor_property('static_materials'))
    if set(by_name) != {str(slot.material_slot_name) for slot in imported}:
        raise ContractError('重导入材质槽发生增删，请核对：' + mesh.get_path_name())
    for index, slot in enumerate(imported):
        mesh.set_material(index, by_name[str(slot.material_slot_name)])


def _reimport(asset, source):
    params = unreal.ImportAssetParameters()
    params.set_editor_property('reimport_asset', asset)
    params.set_editor_property('is_automated', True)
    params.set_editor_property('replace_existing', True)
    manager = unreal.InterchangeManager.get_interchange_manager_scripted()
    data = unreal.InterchangeManager.create_source_data(str(source))
    imported = manager.import_asset(asset.get_path_name().split('.')[0].rsplit('/', 1)[0], data, params)
    if not imported or asset.get_path_name() not in [o.get_path_name() for o in imported]:
        raise RuntimeError('原路径重导入未返回目标资产：' + asset.get_path_name())


def _import_new(source, folder, identifier):
    # The existing tree owns the materials/atlas. Do not generate another set
    # of GLB materials for every newly introduced branch class.
    pipeline = unreal.InterchangeGenericAssetsPipeline()
    pipeline.set_editor_property('scene_name_sub_folder', True)
    pipeline.set_editor_property('asset_type_sub_folders', True)
    pipeline.set_editor_property('asset_name', identifier)
    pipeline.material_pipeline.set_editor_property('import_materials', False)
    pipeline.material_pipeline.texture_pipeline.set_editor_property('import_textures', False)
    params = unreal.ImportAssetParameters()
    params.is_automated, params.replace_existing = True, False
    params.override_pipelines = [unreal.SoftObjectPath(pipeline.get_path_name())]
    manager = unreal.InterchangeManager.get_interchange_manager_scripted()
    imported = manager.import_asset(folder, unreal.InterchangeManager.create_source_data(str(source)), params)
    candidates = [o for o in (imported or []) if o.get_class().get_name() == 'StaticMesh']
    # Interchange may shorten long asset names to fit the package path limit.
    # The validated source ID is recorded separately; it is not the mesh name.
    if len(candidates) != 1 or not candidates[0].get_path_name().startswith(folder.rstrip('/') + '/'):
        raise RuntimeError('新枝类必须在目标目录中导入为一个 StaticMesh：' + identifier)
    return candidates[0]


def sync_package(json_path, asset_path, *, open_editor=True):
    report, context = _build_plan(json_path, asset_path)
    if _requires_shared_version(report, context):
        from branchforge_pve_variants import sync_shared_version
        return sync_shared_version(json_path, asset_path, open_editor=open_editor)
    contract, asset, graph, bridge, preview, old, objects, atlas, folder = context
    key = asset.get_name()
    run_id = time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:8]
    root = PROJECT / 'Saved/PVEWorkflow/Sync' / key / run_id
    root.mkdir(parents=True)
    receipt = root / 'report.json'
    report.update(status='preparing', report=str(receipt), completed=[])
    write = lambda: receipt.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    write()
    original_meshes = list(bridge.get_editor_property('leaf_meshes'))
    original_authored = list(preview.get_editor_property('authored_source_meshes'))
    original_file = bridge.get_editor_property('skeleton_file')
    original_shared = {field: preview.get_editor_property(field) for field in
                       ('shared_part_meshes', 'shared_part_modes', 'shared_binary_hash')}
    graph_changed = False
    try:
        # Backup all targets before any import. No deletion or relocation of user assets.
        targets = [asset] + [objects[i['id']] for i in report['branches'] if i['action'] == 'reimport']
        if report['atlas']['action'] == 'reimport':
            targets.append(atlas)
        for target in targets:
            _backup(target, root, report)
        write()
        materials = next((list(obj.get_editor_property('static_materials')) for obj in original_authored if obj), None)
        if any(i['action'] == 'import_new' for i in report['branches']) and not materials:
            raise ContractError('新枝类缺少原始材质基准，请先绑定一个软件原始枝类')
        for item in report['branches']:
            if item['action'] in ('unchanged', 'preserve_custom'):
                continue
            source = _durable_source(item, key)
            report['active_asset'] = item['asset'] or item['id']
            write()
            mesh = objects[item['id']]
            if mesh:
                saved_materials = list(mesh.get_editor_property('static_materials'))
                nanite = mesh.get_editor_property('nanite_settings')
                try:
                    _reimport(mesh, source)
                finally:
                    _restore_materials(mesh, saved_materials)
                    mesh.set_editor_property('nanite_settings', nanite)
            else:
                mesh = _import_new(source, folder, item['id'])
                objects[item['id']] = mesh
                item['asset'] = mesh.get_path_name()
                if materials:
                    _restore_materials(mesh, materials)
            actual = (mesh.get_num_nanite_triangles() if mesh.get_editor_property('nanite_settings').enabled
                      else mesh.get_num_triangles(0))
            if actual != item['triangles']:
                raise RuntimeError(f"{item['id']} 重导入面数不符：{actual} != {item['triangles']}")
            _stamp(mesh, item, source)
            _save(mesh)
            report['completed'].append(item['id'])
            write()
        if report['atlas']['action'] == 'reimport':
            report['active_asset'] = atlas.get_path_name()
            write()
            source = _durable_source(report['atlas'], key)
            properties = {field: atlas.get_editor_property(field) for field in
                          ('srgb', 'compression_settings', 'mip_gen_settings', 'lod_group')}
            try:
                _reimport(atlas, source)
            finally:
                for field, value in properties.items():
                    atlas.set_editor_property(field, value)
            _stamp(atlas, report['atlas'], source)
            _save(atlas)
            report['completed'].append('atlas')
            write()
        report['status'] = 'updating_pve'
        write()
        graph_changed = True
        updated = update_tree_json(json_path, asset_path, open_editor=False)
        ids = contract['source_ids']
        bindings = [objects[i] for i in ids]
        authored = [(old[i][1] if i in old and next(a for a in report['branches'] if a['id'] == i)['action'] == 'preserve_custom'
                     else objects[i]) for i in ids]
        bridge.set_editor_property('leaf_meshes', bindings)
        preview.set_editor_property('authored_source_meshes', authored)
        graph.force_notification_for_editor(unreal.PCGChangeType.EXTERNAL_MODIFICATION)
        _save(asset)
        report.update(status='complete', copied_json=updated['copied_json'],
                      bindings={i: _name(m) for i, m in zip(ids, bindings)}, missing_source_ids=[])
        report.pop('active_asset', None)
        write()
        if open_editor:
            unreal.get_editor_subsystem(unreal.AssetEditorSubsystem).open_editor_for_assets([asset])
        unreal.log('BRANCHFORGE_SYNC_COMPLETE ' + str(receipt))
        return report
    except Exception as exc:
        if graph_changed:
            try:
                bridge.set_editor_property('skeleton_file', original_file)
                bridge.set_editor_property('leaf_meshes', original_meshes)
                preview.set_editor_property('authored_source_meshes', original_authored)
                from branchforge_pve_resolved import set_shared_state
                set_shared_state(preview, original_shared['shared_part_meshes'], original_shared['shared_part_modes'], original_shared['shared_binary_hash'])
                graph.force_notification_for_editor(unreal.PCGChangeType.EXTERNAL_MODIFICATION)
                _save(asset)
            except Exception as restore_error:
                report['restore_error'] = str(restore_error)
        report.update(status='failed', error=str(exc),
                      recovery='已重导入的资产见 completed，出错目标见 active_asset，原文件在本回执目录 Content 中。'
                               'PVE 绑定已保留/尝试恢复；若有 restore_error 请从备份恢复。修正错误后可重试。')
        write()
        raise RuntimeError(str(exc) + '\n同步回执与备份：' + str(receipt)) from exc


def start_sync(json_path, asset_path, *, export_after=False, notify=True):
    global _active
    if _active:
        raise RuntimeError('已有整树同步任务运行中')
    _active = {'status': 'queued'}
    handle = None

    def tick(_delta):
        global _active
        unreal.unregister_slate_post_tick_callback(handle)
        try:
            result = sync_package(json_path, asset_path)
            if export_after:
                from branchforge_pve_export import export_static_mesh
                try:
                    result['export_job'] = export_static_mesh(asset_path)
                except Exception as export_error:
                    result['export_error'] = str(export_error)
                    raise RuntimeError('整树同步已经完成，但启动成品导出失败：' + str(export_error)) from export_error
                finally:
                    Path(result['report']).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
            elif notify:
                unreal.EditorDialog.show_message('BranchForge 同步完成', describe_plan(result) + '\n\n已保存。\n回执：' + result['report'], unreal.AppMsgType.OK)
        except Exception as exc:
            unreal.log_error('BRANCHFORGE_SYNC_FAILED ' + str(exc))
            if notify:
                unreal.EditorDialog.show_message('BranchForge 同步失败', str(exc), unreal.AppMsgType.OK)
        finally:
            _active = None

    handle = unreal.register_slate_post_tick_callback(tick)
    return {'status': 'queued', 'asset': asset_path}
