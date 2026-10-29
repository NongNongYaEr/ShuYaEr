"""Imported-trunk workbench path. Uses the pinned bridge and native PVE export."""
import hashlib
import json
import re
import shutil
import subprocess
import time
import uuid
from pathlib import Path
import unreal
from branchforge_pve_contract import ContractError, read_contract

_jobs = globals().get('_jobs', {})


def _save(asset):
    if not unreal.EditorAssetLibrary.save_loaded_asset(asset, only_if_is_dirty=False):
        raise RuntimeError('资产保存失败：' + asset.get_path_name())


def _class(name, module='Day30ProceduralVegetationZh'):
    value = unreal.load_class(None, '/Script/' + module + '.' + name)
    if not value:
        raise ContractError('缺少树干桥接类，请安装配套 UE 工作台：' + name)
    return value


def _check_bridge():
    if not hasattr(unreal, 'BranchForgeAssemblyLibrary') or not hasattr(unreal.BranchForgeAssemblyLibrary, 'finalize_trunk_binding'):
        raise ContractError('当前 UE 加载的是旧树干桥接。请保存并退出 UE，安装配套工作台后重新打开。')
    version = getattr(unreal.BranchForgeAssemblyLibrary, 'get_trunk_binding_version', None)
    if not version or version() < 4:
        raise ContractError('当前 PVE C++ 模块缺少完整树干蒙皮验收。请保存并退出 UE，更新配套插件后重新打开。')
    _class('PVBranchForgePreviewSettings')


def check_package(json_path, target_root, contract=None):
    from branchforge_pve_package import _empty_root
    contract = contract or read_contract(json_path)
    if not contract.get('imported_trunk'):
        raise ContractError('请选择 V3 树干完整包')
    _empty_root(target_root.rstrip('/')); _check_bridge()
    return contract, contract['dependency_files'], contract.get('warnings', [])


def _material(folder, name, atlas=None):
    tools, edit = unreal.AssetToolsHelpers.get_asset_tools(), unreal.MaterialEditingLibrary
    value = tools.create_asset(name, folder, unreal.Material, unreal.MaterialFactoryNew())
    if not value:
        raise RuntimeError('材质创建失败：' + folder + '/' + name)
    value.set_editor_property('used_with_nanite', True)
    value.set_editor_property('used_with_skeletal_mesh', True)
    color = edit.create_material_expression(value, unreal.MaterialExpressionVertexColor, -500, 0)
    if atlas:
        task = unreal.AssetImportTask()
        task.filename, task.destination_path, task.destination_name = str(atlas), folder, 'T_UnitAtlas'
        task.automated, task.save, task.replace_existing = True, True, False
        tools.import_asset_tasks([task])
        texture = unreal.load_asset(folder + '/T_UnitAtlas')
        if not texture:
            raise RuntimeError('单元枝图集导入失败')
        sample = edit.create_material_expression(value, unreal.MaterialExpressionTextureSample, -500, 180)
        sample.set_editor_property('texture', texture)
        multiply = edit.create_material_expression(value, unreal.MaterialExpressionMultiply, -200, 0)
        assert edit.connect_material_expressions(color, '', multiply, 'A')
        assert edit.connect_material_expressions(sample, 'RGB', multiply, 'B')
        assert edit.connect_material_property(sample, 'A', unreal.MaterialProperty.MP_OPACITY_MASK)
        color = multiply
        value.set_editor_property('blend_mode', unreal.BlendMode.BLEND_MASKED)
        value.set_editor_property('two_sided', True)
    assert edit.connect_material_property(color, '', unreal.MaterialProperty.MP_BASE_COLOR)
    roughness = edit.create_material_expression(value, unreal.MaterialExpressionConstant, -200, 250)
    roughness.set_editor_property('r', .85)
    assert edit.connect_material_property(roughness, '', unreal.MaterialProperty.MP_ROUGHNESS)
    edit.recompile_material(value); _save(value)
    return value


def create_from_package(json_path, target_root, *, open_editor=True):
    contract, files, warnings = check_package(json_path, target_root)
    project = Path(unreal.Paths.project_dir()).resolve()
    run_id = time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:8]
    stage = project / 'PVEData/CompletePackages' / ('Trunk_' + run_id)
    stage.mkdir(parents=True, exist_ok=False)
    report_file = project / 'Saved/PVEWorkflow/NewTrees' / (run_id + '.json')
    report_file.parent.mkdir(parents=True, exist_ok=True)
    report = {'status': 'copying', 'mode': 'new_imported_trunk', 'imported_trunk': True,
              'source_json': str(contract['path']), 'staged_folder': str(stage),
              'target_root': target_root, 'warnings': warnings, 'report': str(report_file)}
    def record():
        report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    record()
    try:
        for source in files:
            shutil.copy2(source, stage / source.name)
        staged = stage / contract['path'].name
        copied = read_contract(staged)
        assert len(copied['dependency_files']) == len(files)
        report['status'] = 'creating_pve'; record()
        tools = unreal.AssetToolsHelpers.get_asset_tools()
        folder = target_root.rstrip('/')
        asset = tools.create_asset('PVE_' + folder.rsplit('/', 1)[1], folder + '/PVE',
                                  _class('ProceduralVegetation', 'ProceduralVegetation'),
                                  unreal.new_object(_class('ProceduralVegetationFactory', 'ProceduralVegetationEditor')))
        if not asset:
            raise RuntimeError('树干 PVE 资产创建失败')
        graph = unreal.find_object(asset, 'ProceduralVegetationGraph')
        if not graph:
            raise RuntimeError('树干 PVE 图创建失败')
        skeleton_node, skeleton = graph.add_node_of_type(_class('PVBranchForgeSkeletonSettings'))
        mesh_node, _ = graph.add_node_of_type(_class('PVMeshBuilderSettings', 'ProceduralVegetation'))
        preview_node, preview = graph.add_node_of_type(_class('PVBranchForgePreviewSettings'))
        bone_node, bone = graph.add_node_of_type(_class('PVBoneReductionSettings', 'ProceduralVegetation'))
        guard_node, _ = graph.add_node_of_type(_class('PVBranchForgeBindingSettings'))
        export_node, export = graph.add_node_of_type(_class('PVExportSettings', 'ProceduralVegetation'))
        bone.set_editor_property('strength', 0)
        skeleton.set_editor_property('skeleton_file', unreal.FilePath(str(staged.relative_to(project)).replace('\\', '/')))
        atlas = stage / 'leaf_atlas_color.png'
        preview.set_editor_property('assembly_bark_material', _material(folder + '/Materials', 'M_UnitBark'))
        preview.set_editor_property('assembly_foliage_material', _material(folder + '/Materials', 'M_UnitFoliage', atlas if atlas.is_file() else None))
        preview.set_editor_property('use_resolved_assembly', True)
        preview.set_editor_property('use_shared_assembly', True)
        from branchforge_pve_trunk_materials import setup
        materials = setup(str(stage), folder + '/Materials/Trunk', preview)
        if not materials:
            raise RuntimeError('树干 PBR 材质表为空')
        prepared = json.loads(unreal.BranchForgeAssemblyLibrary.prepare_shared_parts(
            preview, str(stage / 'whole.resolved.json'), folder + '/SharedParts'))
        if not prepared.get('success'):
            raise RuntimeError(prepared.get('error', '完整单元枝准备失败'))
        parts = list(preview.get_editor_property('shared_part_meshes'))
        if len(parts) != len(contract['source_ids']):
            raise RuntimeError('完整单元枝源数量不一致')
        modes = list(preview.get_editor_property('shared_part_modes'))
        if len(modes) != len(parts) or any(not mesh or mode != 2 for mesh, mode in zip(parts, modes)):
            raise RuntimeError('完整单元枝未通过共享模型校验，已停止导入。请检查源工程的完整单元枝并重新导出；不会拆散叶花果代替完整模型。')
        skeleton.set_editor_property('leaf_meshes', parts)
        preview.set_editor_property('authored_source_meshes', parts)
        assert graph.add_edge(skeleton_node, 'Out', mesh_node, 'In')
        assert graph.add_edge(mesh_node, 'Out', preview_node, 'In')
        assert graph.add_edge(preview_node, 'Out', bone_node, 'In')
        assert graph.add_edge(bone_node, 'Out', guard_node, 'In')
        assert graph.add_edge(guard_node, 'Out', graph.get_output_node(), 'Out')
        assert graph.add_edge(guard_node, 'Out', export_node, 'In')
        params = export.get_editor_property('export_settings')
        params.set_editor_property('content_browser_folder', unreal.DirectoryPath(folder + '/Meshes'))
        params.set_editor_property('mesh_name', 'SM_' + folder.rsplit('/', 1)[1])
        params.set_editor_property('export_mesh_type', type(params.get_editor_property('export_mesh_type')).STATIC_MESH)
        params.set_editor_property('replace_policy', type(params.get_editor_property('replace_policy')).APPEND)
        params.set_editor_property('create_nanite_foliage', True)
        export.set_editor_property('export_settings', params)
        for i, node in enumerate([skeleton_node, mesh_node, preview_node, bone_node, guard_node, export_node]):
            node.set_node_position(i * 320, 0)
        _save(asset)
        for path in unreal.EditorAssetLibrary.list_assets(folder, recursive=True, include_folder=False):
            value = unreal.load_asset(path)
            if value:
                _save(value)
        unreal.EditorAssetLibrary.make_directory(folder + '/Meshes')
        report.update(status='complete', asset=asset.get_path_name(), copied_json=str(staged),
                      structural_branches=contract['branch_count'], instances=contract['instance_count'],
                      source_id_order=contract['source_ids'], material_ids=list(materials),
                      dependencies=[p.name for p in copied['dependency_files']], prepared=prepared)
        record()
        if open_editor:
            unreal.get_editor_subsystem(unreal.AssetEditorSubsystem).open_editor_for_assets([asset])
        return report
    except Exception as exc:
        report.update(status='failed', error=str(exc), recovery='原有树和源包未修改；本次新目录与回执保留。')
        record(); raise


def graph_contract(asset_path):
    asset = unreal.load_asset(asset_path)
    if not asset:
        raise ContractError('请选择 PVE 资产')
    graph = unreal.find_object(asset, 'ProceduralVegetationGraph')
    if not graph:
        raise ContractError('资产没有 PVE 图')
    settings = next((n.get_settings() for n in graph.nodes
                     if n.get_settings().get_class().get_name() == 'PVBranchForgeSkeletonSettings'), None)
    if not settings:
        raise ContractError('PVE 图缺少骨架读取节点')
    file = Path(settings.get_editor_property('skeleton_file').get_editor_property('file_path'))
    if not file.is_absolute():
        file = Path(unreal.Paths.project_dir()).resolve() / file
    return asset, read_contract(file)


def _notify_export(job):
    state = job['worker'].snapshot()
    status = state['status']
    finished = status in ('complete', 'failed', 'cancelled')
    if finished:
        text = {'complete': '树干成品导出完成', 'cancelled': '树干成品导出已取消'}.get(status, '树干成品导出失败')
        detail = state['output_folder'] if status == 'complete' else state.get('error', '请查看导出日志')
    else:
        text = '树干成品导出：' + {'export': '1/3 构建成品', 'reload': '2/3 重载校验', 'publish': '3/3 发布成品'}[state['phase']]
        detail = '已用 %d 秒 · %s' % (state['elapsed_seconds'], state['output_folder'])
    try:
        unreal.BranchForgeAssemblyLibrary.update_trunk_export_notification(
            job['worker'].token, text, detail, state['primary_asset'], finished, status == 'complete')
    except Exception as exc:
        unreal.log_warning('导出通知更新失败：' + str(exc))


def _poll_export(token, force=False):
    job = _jobs.get(token)
    if not job or job.get('finalizing'):
        return
    worker = job['worker']
    if not force and not worker.done.is_set() and time.monotonic() < job['next_update']:
        return
    job['next_update'] = time.monotonic() + 1
    if not worker.done.is_set():
        _notify_export(job)
        return
    job['finalizing'] = True
    try:
        state = worker.snapshot()
        if state['status'] == 'ready_to_publish':
            if worker.cancelled.is_set():
                worker.publication_failed('已取消发布，原成品保留')
            else:
                worker.publishing()
                _notify_export(job)
                published = json.loads(unreal.BranchForgeAssemblyLibrary.publish_trunk_export(
                    state['staging_folder'], json.dumps(state['publish_plan'], ensure_ascii=False)))
                if not published.get('passed'):
                    raise RuntimeError(published.get('error', '成品发布失败'))
                worker.published(published)
            state = worker.snapshot()
        if state['status'] == 'complete':
            unreal.AssetRegistryHelpers.get_asset_registry().scan_paths_synchronous([state['output_folder']], force_rescan=True)
        _notify_export(job)
        unreal.log('PVE_EXPORT_FINISHED ' + json.dumps(state, ensure_ascii=False))
    except Exception as exc:
        worker.publication_failed(exc)
        unreal.log_error('成品发布或编辑器刷新失败：' + str(exc))
        _notify_export(job)
    finally:
        _jobs.pop(token, None)
        if job['handle'] is not None:
            unreal.unregister_slate_post_tick_callback(job['handle'])


def cancel_export(token):
    job = _jobs.get(token)
    if job:
        job['worker'].cancel()
        _poll_export(token, force=True)


def start_export(asset_path, output_folder=None, *, confirm=False):
    """A worker owns export and cold-load stages; Slate only displays their state."""
    from branchforge_pve_export_jobs import ExportJob
    _check_bridge()
    for existing in list(_jobs):
        _poll_export(existing, force=True)
    if _jobs:
        # Repeated clicks reveal the current task instead of pausing it behind a modal warning.
        active = next(iter(_jobs.values()))
        _notify_export(active)
        return active['worker'].snapshot()
    asset, contract = graph_contract(asset_path)
    if not contract.get('imported_trunk'):
        raise ContractError('请选择导入树干 PVE')
    project = Path(unreal.Paths.get_project_file_path()).resolve()
    engine = Path(unreal.Paths.engine_dir()).resolve() / 'Binaries/Win64/UnrealEditor-Cmd.exe'
    if not engine.is_file():
        raise RuntimeError('找不到 UE 后台导出程序')
    plan = json.loads(unreal.BranchForgeAssemblyLibrary.plan_trunk_export(asset, output_folder or ''))
    if not plan.get('passed'):
        raise RuntimeError(plan.get('error', '无法解析导出节点设置'))
    if plan.get('ignored'):
        unreal.EditorDialog.show_message('PVE 导出', '目标资产已存在，已按“忽略”策略跳过。', unreal.AppMsgType.OK)
        return {'status': 'ignored', 'primary_asset': plan['primary_asset']}
    token = time.strftime('%Y%m%d_%H%M%S') + '_' + uuid.uuid4().hex[:8]
    folder = plan['folder']
    staging = '/Game/Developers/TreeDuck/ExportStaging/' + token
    if confirm:
        kind = '风动骨骼网格与骨架' if plan['mesh_type'] == 'skeletal' else '静态网格'
        policy = {'append': '追加编号', 'replace': '替换', 'ignore': '忽略'}[plan['policy']]
        targets = [plan['mesh_package']] + ([plan['skeleton_package']] if plan['skeleton_package'] else [])
        answer = unreal.EditorDialog.show_message('树干成品导出',
            '导出类型：' + kind + '\n同名策略：' + policy + '\n\n成品：\n' + '\n'.join(targets) +
            ('\n\n将覆盖：\n' + '\n'.join(plan['overwrites']) if plan['overwrites'] else '') +
            '\n\n运行期间右下角显示阶段与用时，可取消。\n\n开始导出？',
            unreal.AppMsgType.OK_CANCEL)
        if answer != unreal.AppReturnType.OK:
            return {'status': 'cancelled_before_start'}
    _save(asset)
    reports = project.parent / 'Saved/PVEWorkflow/TrunkExports' / token
    reports.mkdir(parents=True, exist_ok=False)
    receipt = {'status': 'running', 'phase': 'export', 'asset': asset.get_path_name(), 'output_folder': folder,
               'reports': str(reports), 'primary_asset': plan['primary_asset'], 'publish_plan': plan, 'staging_folder': staging}
    manifest = contract['path'].parent / 'whole.resolved.json'
    stages = []
    for phase in ('export', 'reload'):
        report, log = reports / (phase + '.json'), reports / (phase + '.log')
        args = [str(engine), str(project), '-run=PVEWorkflow', '-unattended', '-nullrhi', '-nop4', '-nosound',
                '-NoSplash', '-NoDefaultMaps', '-NoShaderCompile', '-Report=' + str(report), '-abslog=' + str(log),
                '-DDC=InstalledNoZenLocalFallback', '-asyncassetcompilationmaxconcurrency=1']
        args += (['-RequireResolved=1', '-RequireFoliage=' + str(contract['instance_count']),
                  '-Asset=' + asset.get_path_name(), '-TrunkManifest=' + str(manifest), '-ExportTrunk=' + staging]
                 if phase == 'export' else ['-AuditTrunk=' + staging, '-TrunkAuditSummary'])
        stages.append((phase, args, report))
    worker = ExportJob(token, reports / 'receipt.json', receipt, stages)
    job = {'worker': worker, 'handle': None, 'next_update': 0}
    _jobs[token] = job
    try:
        job['handle'] = unreal.register_slate_post_tick_callback(lambda _delta: _poll_export(token))
        _notify_export(job)
        worker.start()
    except Exception as exc:
        worker.receipt.update(status='failed', error=str(exc))
        worker.done.set()
        _notify_export(job)
        _jobs.pop(token, None)
        if job['handle'] is not None:
            unreal.unregister_slate_post_tick_callback(job['handle'])
        raise
    return worker.snapshot()


def export_from_pve_editor(asset_path):
    """Shared PVE toolbar and console entry; never falls back to generic skinning."""
    try:
        return start_export(asset_path, confirm=True)
    except Exception as exc:
        unreal.log_error('树干成品导出未完成：' + str(exc))
        unreal.EditorDialog.show_message('树干成品导出', str(exc), unreal.AppMsgType.OK)
        return None
