"""Independent tree shapes with verified resource reuse and copy-on-write updates."""
import json
import shutil
import time
import uuid
from pathlib import Path

import unreal
from branchforge_pve_contract import ContractError, read_contract
from branchforge_pve_importer import PROJECT, _bridge_for_asset, _copy_contract_files, _slot
from branchforge_pve_sync import _old_path, _atlas_from_material, _hash, _save, _stamp, _import_new

_active = False
LEDGER = PROJECT / 'PVEData/SharedResources/consumers.json'


def _preview(graph):
    candidates = [n.get_settings() for n in graph.nodes
                  if n.get_settings().get_class().get_name() == 'PVBranchForgePreviewSettings']
    if len(candidates) != 1:
        raise ContractError('需要一个 BranchForge 整树预览节点')
    return candidates[0]


def _same_file(asset, digest):
    # Import metadata is also checked: old trees may predate SyncSHA256 tags.
    data = asset.get_editor_property('asset_import_data') if asset else None
    files = list(data.extract_filenames()) if data else []
    return bool(len(files) == 1 and Path(files[0]).is_file() and _hash(files[0]) == digest.upper())


def is_shared(asset, current_pve):
    if not asset or not LEDGER.exists():
        return False
    consumers = json.loads(LEDGER.read_text(encoding='utf-8')).get(asset.get_path_name(), [])
    return any(p != current_pve and unreal.EditorAssetLibrary.does_asset_exist(p) for p in consumers)


def register_consumers(asset):
    graph, bridge = _bridge_for_asset(asset)
    preview = _preview(graph)
    resources = list(bridge.get_editor_property('leaf_meshes')) + list(preview.get_editor_property('shared_part_meshes'))
    for mesh in bridge.get_editor_property('leaf_meshes'):
        if mesh:
            resources += [slot.material_interface for slot in mesh.get_editor_property('static_materials')]
    leaf = preview.get_editor_property('assembly_foliage_material')
    resources += [preview.get_editor_property('assembly_bark_material'), leaf, _atlas_from_material(leaf)]
    ledger = json.loads(LEDGER.read_text(encoding='utf-8')) if LEDGER.exists() else {}
    # Remove obsolete entries for this PVE after a versioned update.
    path = asset.get_path_name()
    ledger = {k: [p for p in v if p != path] for k, v in ledger.items()}
    for obj in resources:
        if obj:
            ledger.setdefault(obj.get_path_name(), []).append(path)
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    temporary = LEDGER.with_suffix('.tmp')
    temporary.write_text(json.dumps({k: sorted(set(v)) for k, v in ledger.items() if v}, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(LEDGER)


def _plan(json_path, reference_path, target_root, *, allow_custom=False):
    from branchforge_pve_package import check_complete_package
    from branchforge_pve_importer import _glb_bark_signature
    contract, files, warnings = check_complete_package(json_path, target_root)
    reference = unreal.load_asset(reference_path)
    graph, bridge = _bridge_for_asset(reference)
    previous = read_contract(_old_path(bridge))
    preview = _preview(graph)
    if not preview.get_editor_property('use_resolved_assembly'):
        raise ContractError('复用来源需要启用软件实际装配，才能按原软件验证新造型')
    meshes = list(bridge.get_editor_property('leaf_meshes'))
    authored = list(preview.get_editor_property('authored_source_meshes'))
    if len(meshes) != len(previous['source_ids']) or len(authored) != len(meshes):
        raise ContractError('来源 PVE 的枝类绑定数量与原 JSON 不一致')
    bindings = dict(zip(previous['source_ids'], meshes))
    baselines = dict(zip(previous['source_ids'], authored))
    incoming = {u['id']: u for u in contract['manifest']['units']}
    old_units = {u['id']: u for u in (previous.get('manifest') or {}).get('units', [])}
    if not set(incoming).intersection(bindings):
        raise ContractError('两个造型没有相同枝类 ID；请使用“新建：完整包自动导入”')
    # An explicitly replaced branch cannot be claimed to match the exported software data.
    custom = [i for i in incoming if i in bindings and bindings[i] != baselines[i]]
    if custom and not allow_custom:
        raise ContractError('来源存在手动换绑，请使用原始绑定的来源 PVE：' + ', '.join(custom))
    custom_bindings = {i: bindings[i].get_path_name() for i in custom if bindings[i]}
    if allow_custom:
        bindings = baselines
        meshes = authored
    for identifier, mesh in bindings.items():
        if not mesh or mesh.get_class().get_name() != 'StaticMesh':
            raise ContractError('来源次枝未绑定：' + identifier)
    leaf = _slot(meshes[0], 'leaf')[1]
    bark = _slot(meshes[0], 'bark')[1]
    atlas = _atlas_from_material(preview.get_editor_property('assembly_foliage_material'))
    if _atlas_from_material(leaf) != atlas:
        raise ContractError('来源次枝与实际装配使用不同图集')
    if any(_slot(m, 'leaf')[1] != leaf or _slot(m, 'bark')[1] != bark for m in meshes):
        raise ContractError('来源次枝未使用统一材质，无法自动建立共享资源组')
    atlas_same = _same_file(atlas, _hash(contract['path'].parent / 'leaf_atlas_color.png'))
    old_signature = None
    data = meshes[0].get_editor_property('asset_import_data')
    old_files = list(data.extract_filenames()) if data else []
    if len(old_files) == 1 and Path(old_files[0]).is_file():
        old_signature = _glb_bark_signature(old_files[0])
    signature = _glb_bark_signature(contract['path'].parent / next(iter(incoming.values()))['glb'])
    new_materials = not atlas_same or old_signature != signature
    actions = []
    for identifier in contract['source_ids']:
        mesh = bindings.get(identifier)
        unit = incoming[identifier]
        same = (mesh and _same_file(mesh, unit['glb_sha256']) and
                old_units.get(identifier, {}).get('glb_sha256', '').upper() == unit['glb_sha256'].upper())
        triangles = (mesh.get_num_nanite_triangles() if mesh and mesh.get_editor_property('nanite_settings').enabled
                     else mesh.get_num_triangles(0) if mesh else 0)
        same = bool(same and triangles == unit['triangles'])
        actions.append({'id': identifier, 'action': 'reuse' if same and not new_materials else 'import_version',
                        'asset': mesh.get_path_name() if mesh else None,
                        'reason': '图集或树皮发生变化，建立独立材质版本' if new_materials else
                                  '枝类 ID、GLB 内容及面数一致' if same else '新增或变化的样本枝'})
    report = {'mode': 'new_shape_reuse', 'reference': reference.get_path_name(), 'target_root': target_root,
              'json': str(contract['path']), 'branches': actions,
              'atlas': 'import_version' if new_materials else 'reuse', 'warnings': warnings,
              'custom_bindings': custom_bindings,
              'structural_branches': contract['branch_count'], 'instances': contract['instance_count'],
              'note': '按稳定枝类 ID 绑定；树形独立。实际几何、UV、颜色及材质一致的 Nanite 部件继续共用。'}
    return report, (contract, files, reference, previous, bindings, bark, leaf)


def plan_variant(json_path, reference_path, target_root):
    return _plan(json_path, reference_path, target_root.rstrip('/'))[0]


def describe_plan(report):
    labels = {'reuse': '复用已有资源', 'import_version': '导入独立新版本'}
    lines = (['来源：' + report['reference'], '新目录：' + report['target_root'], report['note'], ''] +
                     [i['id'] + '：' + labels[i['action']] + '（' + i['reason'] + '）' for i in report['branches']] +
                     ['材质/图集：' + labels[report['atlas']], '原 PVE、原次枝及原成品均保留。'])
    if 'nanite_shared_classes' in report:
        lines += [f"Nanite 部件可复用枝类：{report['nanite_shared_classes']}；保留逐实例几何枝类：{report['resolved_classes']}。"]
        if report['resolved_classes']:
            lines += ['这些实例实际几何有差异，已保留软件形状；这部分不会获得部件共享的体积收益。']
    return '\n'.join(lines)


def _assembly_summary(asset):
    graph, bridge = _bridge_for_asset(asset)
    settings = _preview(graph)
    count = len(bridge.get_editor_property('leaf_meshes'))
    shared = sum(m > 0 for m in settings.get_editor_property('shared_part_modes')) if settings.get_editor_property('use_shared_assembly') else 0
    return {'nanite_shared_classes': shared, 'resolved_classes': count - shared}


def _resources(report, context, key, run_id):
    """Stage the package, then import only changed resources; never reimport a shared asset."""
    contract, files, reference, previous, bindings, bark, leaf = context
    stage = PROJECT / 'PVEData/CompletePackages' / key / run_id
    stage.mkdir(parents=True, exist_ok=False)
    for path in files:
        dest = stage / path.relative_to(contract['path'].parent)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dest)
    staged = read_contract(stage / contract['path'].name)
    # Revalidate the staged bytes, before any UE mutations.
    from branchforge_pve_package import check_complete_package, prepare_package
    check_complete_package(staged['path'], report['target_root'])
    units = {u['id']: u for u in staged['manifest']['units']}
    if report['atlas'] == 'import_version':
        config = prepare_package(staged['path'], report['target_root'], key)
        result = {i: unreal.load_asset(p) for i, p in config['mesh_bindings'].items()}
        bark, leaf = unreal.load_asset(config['bark_material']), unreal.load_asset(config['leaf_material'])
        texture = _atlas_from_material(leaf)
        _stamp(texture, {'sha256': _hash(stage / 'leaf_atlas_color.png')}, stage / 'leaf_atlas_color.png')
        _save(texture)
    else:
        result = {}
        for item in report['branches']:
            identifier = item['id']
            if item['action'] == 'reuse':
                result[identifier] = bindings[identifier]
                continue
            mesh = _import_new(stage / units[identifier]['glb'], report['target_root'] + '/Branches', identifier)
            for token, material in (('bark', bark), ('leaf', leaf)):
                mesh.set_material(_slot(mesh, token)[0], material)
            result[identifier] = mesh
    for item in report['branches']:
        mesh = result[item['id']]
        if item['action'] != 'reuse':
            unit = units[item['id']]
            actual = mesh.get_num_nanite_triangles() if mesh.get_editor_property('nanite_settings').enabled else mesh.get_num_triangles(0)
            if actual != unit['triangles']:
                raise ContractError('导入面数不符：' + item['id'])
            _stamp(mesh, {'id': item['id'], 'sha256': unit['glb_sha256'].upper()}, stage / unit['glb'])
            _save(mesh)
        item['result_asset'] = mesh.get_path_name()
    report['staged_folder'] = str(stage)
    return staged, result, bark, leaf


def _apply(asset, contract, previous, meshes, bark, leaf, new_shape):
    from branchforge_pve_importer import _material_setup_with_material
    graph, bridge = _bridge_for_asset(asset)
    preview = _preview(graph)
    # Source order is an implementation detail of each package, not identity.
    remapped = {}
    for field, empty in (('shared_part_meshes', None), ('shared_part_modes', 0)):
        old = list(preview.get_editor_property(field))
        mapping = dict(zip(previous['source_ids'], old))
        remapped[field] = [mapping.get(i, empty) for i in contract['source_ids']]
    from branchforge_pve_resolved import set_shared_state
    set_shared_state(preview, remapped['shared_part_meshes'], remapped['shared_part_modes'], '')
    old_leaf = _slot(next(m for m in preview.get_editor_property('authored_source_meshes') if m), 'leaf')[1]
    ordered = [meshes[i] for i in contract['source_ids']]
    folder = PROJECT / 'PVEData/Imported' / asset.get_name() / 'Revisions' / uuid.uuid4().hex[:12]
    copied = _copy_contract_files(contract, folder, contract['path'].name)
    bridge.set_editor_property('skeleton_file', unreal.FilePath(file_path=copied.relative_to(PROJECT).as_posix()))
    bridge.set_editor_property('leaf_meshes', ordered)
    preview.set_editor_property('authored_source_meshes', ordered)
    if old_leaf == leaf:
        from branchforge_pve_resolved import prepare_shared_parts
        prepare_shared_parts(graph, contract)
    else:
        from branchforge_pve_resolved import configure_preview
        configure_preview(graph, contract, ordered, leaf)
    for node in graph.nodes:
        settings = node.get_settings()
        cls = settings.get_class().get_name()
        if cls == 'PVMeshBuilderSettings':
            params = settings.get_editor_property('mesher_settings')
            details = params.get_editor_property('material_details')
            details.set_editor_property('material_setups', [_material_setup_with_material(s, bark) for s in details.get_editor_property('material_setups')])
            params.set_editor_property('material_details', details)
            settings.set_editor_property('mesher_settings', params)
        if cls == 'PVExportSettings' and new_shape:
            params = settings.get_editor_property('export_settings')
            params.set_editor_property('mesh_name', 'SM_' + asset.get_name().removeprefix('PVE_'))
            params.set_editor_property('content_browser_folder', unreal.DirectoryPath(path=asset.get_path_name().split('.')[0].rsplit('/', 2)[0] + '/Meshes'))
            params.set_editor_property('replace_policy', unreal.PVAssetReplacePolicy.APPEND)
            settings.set_editor_property('export_settings', params)
    config = {'format': 'BranchForgePVEImportConfig', 'version': 1,
              'mesh_folder': asset.get_path_name().split('.')[0].rsplit('/', 2)[0] + '/Branches',
              'mesh_bindings': {i: m.get_path_name() for i, m in meshes.items()},
              'bark_material': bark.get_path_name(), 'leaf_material': leaf.get_path_name()}
    (folder / 'pve_import.json').write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')
    graph.force_notification_for_editor(unreal.PCGChangeType.EXTERNAL_MODIFICATION)
    _save(asset)
    return str(copied)


def create_variant(json_path, reference_path, target_root, *, open_editor=True):
    target_root = target_root.rstrip('/')
    report, context = _plan(json_path, reference_path, target_root)
    key = 'PVE_' + target_root.rsplit('/', 1)[1]
    target = target_root + '/PVE/' + key
    run_id = time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:8]
    receipt = PROJECT / 'Saved/PVEWorkflow/Variants' / (run_id + '.json')
    receipt.parent.mkdir(parents=True, exist_ok=True)
    report.update(status='preparing', report=str(receipt))
    def write():
        receipt.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    write()
    try:
        staged, meshes, bark, leaf = _resources(report, context, key, run_id)
        asset = unreal.EditorAssetLibrary.duplicate_asset(context[2].get_path_name(), target)
        if not asset:
            raise RuntimeError('创建独立造型 PVE 失败：' + target)
        copied = _apply(asset, staged, context[3], meshes, bark, leaf, True)
        register_consumers(context[2])
        register_consumers(asset)
        report.update(status='complete', asset=asset.get_path_name(), copied_json=copied)
        report.update(_assembly_summary(asset))
        write()
        unreal.EditorAssetLibrary.make_directory(target_root + '/Meshes')
        if open_editor:
            unreal.get_editor_subsystem(unreal.AssetEditorSubsystem).open_editor_for_assets([asset])
        return report
    except Exception as exc:
        report.update(status='failed', error=str(exc), recovery='来源资产未重导入。新目录可能存在部分资产；请根据回执检查。')
        write()
        raise RuntimeError(str(exc) + '\n回执：' + str(receipt)) from exc


def start_variant(json_path, reference_path, target_root, *, export_after=False, notify=True):
    global _active
    if _active:
        raise RuntimeError('已有新造型任务运行中')
    _active = True
    handle = None
    def tick(_delta):
        global _active
        unreal.unregister_slate_post_tick_callback(handle)
        try:
            result = create_variant(json_path, reference_path, target_root)
            if export_after:
                from branchforge_pve_export import export_static_mesh
                result['export_job'] = export_static_mesh(result['asset'], output_folder=target_root.rstrip('/') + '/Meshes')
                Path(result['report']).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
            elif notify:
                unreal.EditorDialog.show_message('BranchForge 新造型已创建', describe_plan(result) + '\n\n' + result['asset'], unreal.AppMsgType.OK)
        except Exception as exc:
            unreal.log_error('BRANCHFORGE_VARIANT_FAILED ' + str(exc))
            if notify:
                unreal.EditorDialog.show_message('BranchForge 新造型失败', str(exc), unreal.AppMsgType.OK)
        finally:
            _active = False
    handle = unreal.register_slate_post_tick_callback(tick)
    return {'status': 'queued', 'target_root': target_root}


def sync_shared_version(json_path, asset_path, *, open_editor=True):
    """Copy-on-write for a shared resource, preserving this PVE's identity."""
    asset = unreal.load_asset(asset_path)
    base = asset.get_path_name().split('.')[0].rsplit('/', 2)[0]
    run_id = time.strftime('%Y%m%d_%H%M%S') + '_' + uuid.uuid4().hex[:8]
    resource_root = base + '/ResourceVersions/R_' + run_id
    report, context = _plan(json_path, asset_path, resource_root, allow_custom=True)
    report['mode'] = 'sync_shared_version'
    report['asset'] = asset.get_path_name()
    report['removed_source_ids'] = sorted(set(context[3]['source_ids']) - set(context[0]['source_ids']))
    report['note'] = '共享资源更新：未变化的资源继续复用，变化的资源写入本树的独立版本，其他造型不受影响。'
    receipt = PROJECT / 'Saved/PVEWorkflow/Sync' / asset.get_name() / run_id / 'report.json'
    receipt.parent.mkdir(parents=True)
    report.update(status='preparing', report=str(receipt))
    write = lambda: receipt.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    write()
    graph, bridge = _bridge_for_asset(asset)
    preview = _preview(graph)
    snapshot = {field: list(preview.get_editor_property(field)) if field.endswith('meshes') or field == 'shared_part_modes' else preview.get_editor_property(field)
                for field in ('authored_source_meshes', 'shared_part_meshes', 'shared_part_modes', 'shared_binary_hash', 'assembly_bark_material', 'assembly_foliage_material')}
    skeleton = bridge.get_editor_property('skeleton_file')
    original_meshes = list(bridge.get_editor_property('leaf_meshes'))
    mesher = next(n.get_settings() for n in graph.nodes if n.get_settings().get_class().get_name() == 'PVMeshBuilderSettings')
    original_mesher = mesher.get_editor_property('mesher_settings')
    changed = False
    try:
        from branchforge_pve_sync import _backup
        _backup(asset, receipt.parent, report)
        staged, meshes, bark, leaf = _resources(report, context, 'PVE_BFResource_' + uuid.uuid4().hex[:12], run_id)
        changed = True
        copied = _apply(asset, staged, context[3], meshes, bark, leaf, False)
        if report['custom_bindings']:
            bridge.set_editor_property('leaf_meshes', [unreal.load_asset(report['custom_bindings'][i])
                if i in report['custom_bindings'] else meshes[i] for i in staged['source_ids']])
            graph.force_notification_for_editor(unreal.PCGChangeType.EXTERNAL_MODIFICATION)
            _save(asset)
        register_consumers(asset)
        report.update(status='complete', copied_json=copied, missing_source_ids=[])
        report.update(_assembly_summary(asset))
        write()
        if open_editor:
            unreal.get_editor_subsystem(unreal.AssetEditorSubsystem).open_editor_for_assets([asset])
        return report
    except Exception as exc:
        if changed:
            bridge.set_editor_property('skeleton_file', skeleton)
            bridge.set_editor_property('leaf_meshes', original_meshes)
            for field, value in snapshot.items():
                if not field.startswith('shared_'):
                    preview.set_editor_property(field, value)
            from branchforge_pve_resolved import set_shared_state
            set_shared_state(preview, snapshot['shared_part_meshes'], snapshot['shared_part_modes'], snapshot['shared_binary_hash'])
            mesher.set_editor_property('mesher_settings', original_mesher)
            graph.force_notification_for_editor(unreal.PCGChangeType.EXTERNAL_MODIFICATION)
            _save(asset)
        report.update(status='failed', error=str(exc), recovery='原共享资源未修改；新资源目录可能有部分资产，PVE 原绑定已恢复。')
        write()
        raise
