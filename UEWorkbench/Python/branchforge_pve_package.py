"""Prepare newly exported complete-branch meshes and an atlas in an empty UE folder.

This is optional automation of the user's first import step. PVE creation/update
still goes through branchforge_pve_importer, the same entry used by the workbench.
"""
import hashlib
import json
import re
import shutil
import time
import uuid
from pathlib import Path
import unreal
from branchforge_pve_contract import read_contract

_active = None


def _empty_root(target_root):
    if not re.fullmatch(r"/Game/[A-Za-z0-9_/]+", target_root) or '//' in target_root:
        raise ValueError("新树内容根目录应为 /Game/ 开头的英文、数字或下划线路径")
    assets = unreal.EditorAssetLibrary.list_assets(target_root, recursive=True, include_folder=False)
    if assets:
        raise ValueError("新树目录中已有资产，请选择空目录；更新已有树请使用同步模式：" + target_root)


def check_complete_package(json_path, target_root):
    """Read-only preflight, also suitable for the workbench's create-plan button."""
    contract = read_contract(json_path)
    if contract.get("imported_trunk"):
        from branchforge_pve_trunk import check_package
        return check_package(json_path, target_root, contract)
    from branchforge_pve_importer import _glb_bark_signature, TEMPLATE
    target_root = target_root.rstrip('/')
    _empty_root(target_root)
    contract = read_contract(json_path)
    if not contract['manifest'] or not contract['resolved_files']:
        raise ValueError('请选择包含清单、GLB、图集和实际装配附件的完整枝包')
    if not unreal.EditorAssetLibrary.does_asset_exist(TEMPLATE):
        raise ValueError('PVE 模板不存在：' + TEMPLATE)
    bundle = contract['path'].parent
    files = [contract['path'], bundle / 'complete_units.manifest.json', *contract['resolved_files']]
    signatures = set()
    for item in contract['manifest']['units']:
        path = (bundle / item['glb']).resolve()
        if not path.is_relative_to(bundle) or path.suffix.lower() != '.glb' or not path.is_file():
            raise ValueError('完整枝 GLB 必须位于包内：' + item['id'])
        if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*', item['id']):
            raise ValueError('枝类 ID 需要英文、数字或下划线：' + item['id'])
        if hashlib.sha256(path.read_bytes()).hexdigest().upper() != item['glb_sha256'].upper():
            raise ValueError('GLB 校验失败：' + item['id'])
        signatures.add(_glb_bark_signature(path))
        files.append(path)
    if len(signatures) != 1:
        raise ValueError('枝类树皮材质不一致，请使用已有网格的手动配置方式')
    atlas = bundle / 'leaf_atlas_color.png'
    if not atlas.is_file() or atlas.read_bytes()[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('缺少有效的 leaf_atlas_color.png')
    files.append(atlas)
    validation = bundle / 'validation.json'
    warnings = []
    if validation.exists():
        check = json.loads(validation.read_text(encoding='utf-8-sig'))
        if check.get('valid') is False or check.get('errors'):
            raise ValueError('软件导出验证报告含错误：' + str(check.get('errors')))
        warnings = check.get('warnings', []) + check.get('quality_warnings', [])
        for name, info in check.get('files', {}).items():
            path = (bundle / name).resolve()
            if not path.is_relative_to(bundle) or not path.is_file():
                raise ValueError('验证报告引用文件无效：' + name)
            if path.stat().st_size != info['bytes'] or hashlib.sha256(path.read_bytes()).hexdigest().upper() != info['sha256'].upper():
                raise ValueError('验证报告文件校验失败：' + name)
        files.append(validation)
    return contract, files, warnings


def create_from_package(json_path, target_root, *, open_editor=True):
    """Import one new tree; all source files are staged inside the UE project."""
    if read_contract(json_path).get("imported_trunk"):
        from branchforge_pve_trunk import create_from_package as create_trunk
        return create_trunk(json_path, target_root, open_editor=open_editor)
    from branchforge_pve_importer import PROJECT, import_tree
    from branchforge_pve_sync import _stamp, _hash, _save
    target_root = target_root.rstrip('/')
    contract, files, warnings = check_complete_package(json_path, target_root)
    asset_name = 'PVE_' + target_root.rsplit('/', 1)[1]
    run_id = time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:8]
    stage = PROJECT / 'PVEData/CompletePackages' / asset_name / run_id
    stage.mkdir(parents=True)
    receipt = PROJECT / 'Saved/PVEWorkflow/NewTrees' / (run_id + '.json')
    receipt.parent.mkdir(parents=True, exist_ok=True)
    report = {'status': 'copying', 'mode': 'new_complete_package', 'source_json': str(contract['path']),
              'target_root': target_root, 'staged_folder': str(stage), 'warnings': warnings,
              'report': str(receipt)}
    write = lambda: receipt.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    write()
    try:
        for path in files:
            dest = stage / path.relative_to(contract['path'].parent)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, dest)
        staged_json = stage / contract['path'].name
        check_complete_package(staged_json, target_root)
        report['status'] = 'importing_assets'
        write()
        config = prepare_package(staged_json, target_root, asset_name)
        report['status'] = 'creating_pve'
        write()
        result = import_tree(staged_json, config['mesh_folder'], open_editor=False)
        # Seed the update fingerprints now, avoiding a redundant first sync.
        for item in contract['manifest']['units']:
            mesh = unreal.load_asset(config['mesh_bindings'][item['id']])
            _stamp(mesh, {'id': item['id'], 'sha256': item['glb_sha256'].upper()}, stage / item['glb'])
            _save(mesh)
        texture = unreal.load_asset(target_root + '/Materials/T_' + asset_name.removeprefix('PVE_') + '_Atlas')
        _stamp(texture, {'sha256': _hash(stage / 'leaf_atlas_color.png')}, stage / 'leaf_atlas_color.png')
        _save(texture)
        unreal.EditorAssetLibrary.make_directory(target_root + '/Meshes')
        report.update(result)
        report['status'] = 'complete'
        write()
        if open_editor:
            unreal.get_editor_subsystem(unreal.AssetEditorSubsystem).open_editor_for_assets([unreal.load_asset(result['asset'])])
        unreal.log('BRANCHFORGE_NEW_TREE_COMPLETE ' + str(receipt))
        return report
    except Exception as exc:
        report.update(status='failed', error=str(exc),
                      recovery='原导出包未修改。新建目录可能含部分资产，请按回执检查后继续；不会覆盖已有树。')
        write()
        raise RuntimeError(str(exc) + '\n创建回执：' + str(receipt)) from exc


def start_create(json_path, target_root, *, export_after=False, notify=True):
    """Queue import outside a console/Tk callback to avoid Interchange deadlocks."""
    global _active
    if _active:
        raise RuntimeError('已有完整包导入任务运行中')
    _active = True
    handle = None
    def tick(_delta):
        global _active
        unreal.unregister_slate_post_tick_callback(handle)
        try:
            result = create_from_package(json_path, target_root)
            if export_after:
                from branchforge_pve_export import export_static_mesh
                try:
                    result['export_job'] = export_static_mesh(result['asset'], output_folder=target_root.rstrip('/') + '/Meshes')
                except Exception as exc:
                    result['export_error'] = str(exc)
                    raise RuntimeError('新树已创建，但成品导出启动失败：' + str(exc)) from exc
                finally:
                    Path(result['report']).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
            elif notify:
                unreal.EditorDialog.show_message('BranchForge 新树已创建',
                    result['asset'] + '\n模型、贴图、材质、PVE 和共享部件已配置。\n回执：' + result['report'], unreal.AppMsgType.OK)
        except Exception as exc:
            unreal.log_error('BRANCHFORGE_NEW_TREE_FAILED ' + str(exc))
            if notify:
                unreal.EditorDialog.show_message('BranchForge 新树导入失败', str(exc), unreal.AppMsgType.OK)
        finally:
            _active = None
    handle = unreal.register_slate_post_tick_callback(tick)
    return {'status': 'queued', 'target_root': target_root}


def prepare_package(json_path, target_root, asset_name):
    target_root = target_root.rstrip("/")
    _empty_root(target_root)
    if not re.fullmatch(r"PVE_[A-Za-z0-9_]+", asset_name):
        raise ValueError("PVE 资产名应为 PVE_ 开头的英文、数字或下划线")
    contract = read_contract(json_path)
    bundle = contract["path"].parent
    manifest = contract["manifest"]
    if not manifest:
        raise ValueError("缺少完整枝清单")
    atlas = bundle / "leaf_atlas_color.png"
    if not atlas.is_file():
        raise ValueError("缺少叶果图集")
    config_path = bundle / "pve_import.json"
    if config_path.exists():
        raise ValueError("导出包已有 UE 配置，请使用工作台或新的导出目录，避免覆盖配置")
    unit_paths = []
    for item in manifest["units"]:
        path = (bundle / item["glb"]).resolve()
        if not path.is_relative_to(bundle.resolve()):
            raise ValueError("完整枝 GLB 必须位于导出包内")
        if hashlib.sha256(path.read_bytes()).hexdigest().upper() != item["glb_sha256"]:
            raise ValueError("完整枝校验不符：" + item["id"])
        unit_paths.append(path)
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    tasks = []
    mesh_folder = target_root + "/Branches"
    material_folder = target_root + "/Materials"
    for path in unit_paths:
        task = unreal.AssetImportTask()
        task.filename = str(path)
        task.destination_path = mesh_folder
        task.automated = True
        task.save = True
        task.replace_existing = False
        tasks.append(task)
    tools.import_asset_tasks(tasks)
    meshes = {}
    # Tie each import result to its manifest ID. Interchange shortens object
    # names in long package paths; the shortened display name is not identity.
    for unit, task in zip(manifest['units'], tasks):
        candidates = [obj for obj in task.get_objects() if obj.get_class().get_name() == 'StaticMesh']
        if len(candidates) != 1 or not candidates[0].get_path_name().startswith(mesh_folder + '/'):
            raise RuntimeError('每个完整枝文件应导入一个 StaticMesh：' + unit['id'])
        meshes[unit['id']] = candidates[0]
    if set(meshes) != set(contract["source_ids"]):
        raise RuntimeError("导入的完整枝网格与清单不一致")
    token = asset_name.removeprefix("PVE_")
    texture_name = "T_" + token + "_Atlas"
    task = unreal.AssetImportTask()
    task.filename = str(atlas)
    task.destination_path = material_folder
    task.destination_name = texture_name
    task.automated = True
    task.save = True
    task.replace_existing = False
    tools.import_asset_tasks([task])
    texture = unreal.load_asset(material_folder + "/" + texture_name)
    if not texture:
        raise RuntimeError("图集导入失败")
    leaf = tools.create_asset("M_" + token + "_Atlas", material_folder, unreal.Material, unreal.MaterialFactoryNew())
    leaf.set_editor_property("two_sided", True)
    leaf.set_editor_property("blend_mode", unreal.BlendMode.BLEND_MASKED)
    lib = unreal.MaterialEditingLibrary
    sample = lib.create_material_expression(leaf, unreal.MaterialExpressionTextureSample, -300, 0)
    sample.set_editor_property("texture", texture)
    uv = lib.create_material_expression(leaf, unreal.MaterialExpressionTextureCoordinate, -1200, 0)
    u = lib.create_material_expression(leaf, unreal.MaterialExpressionComponentMask, -1000, -100)
    u.set_editor_property("r", True)
    u.set_editor_property("g", False)
    v = lib.create_material_expression(leaf, unreal.MaterialExpressionComponentMask, -1000, 100)
    v.set_editor_property("r", False)
    v.set_editor_property("g", True)
    flip = lib.create_material_expression(leaf, unreal.MaterialExpressionOneMinus, -800, 100)
    combined = lib.create_material_expression(leaf, unreal.MaterialExpressionAppendVector, -600, 0)
    for source, target, pin in ((uv, u, ""), (uv, v, ""), (v, flip, ""),
                                (u, combined, "A"), (flip, combined, "B"), (combined, sample, "UVs")):
        if not lib.connect_material_expressions(source, "", target, pin):
            raise RuntimeError("完整枝图集 UV 连接失败")
    assert lib.connect_material_property(sample, "RGB", unreal.MaterialProperty.MP_BASE_COLOR)
    assert lib.connect_material_property(sample, "A", unreal.MaterialProperty.MP_OPACITY_MASK)
    lib.recompile_material(leaf)
    assert unreal.EditorAssetLibrary.save_loaded_asset(leaf)

    from branchforge_pve_importer import _slot, _glb_bark_signature
    if len({_glb_bark_signature(path) for path in unit_paths}) != 1:
        raise ValueError("枝类树皮材质不一致，请在工作台手动配置")
    bark_source = _slot(meshes[contract["source_ids"][0]], "bark")[1]
    bark = unreal.EditorAssetLibrary.duplicate_asset(bark_source.get_path_name(), material_folder + "/M_" + token + "_Bark")
    assert bark and unreal.EditorAssetLibrary.save_loaded_asset(bark)
    config = {"format": "BranchForgePVEImportConfig", "version": 1,
              "asset_name": asset_name, "target_folder": target_root + "/PVE",
              "mesh_folder": mesh_folder, "mesh_bindings": {i: meshes[i].get_path_name() for i in contract["source_ids"]},
              "bark_material": bark.get_path_name(), "leaf_material": leaf.get_path_name()}
    config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    return config
