"""UE 5.8 native static vegetation operations shared by UI and commandlet tests."""
import copy
import json
import math
import re
import shutil
import time
import uuid
from pathlib import Path
import unreal
from branchforge_static_contract import ROOT, atomic_json, contract, digest, identifier, numbers, prepare_library, prepare_variant, read_json


def state_dir():
    return Path(unreal.Paths.project_saved_dir()).resolve() / 'BranchForgeStaticUSD' / 'Workbench'


def registry():
    return read_json(registry_file(), read_json(state_dir() / 'registry.json', {'version': 1, 'libraries': {}, 'variants': {}}))


def registry_file():
    # Project source metadata must survive clearing Saved/Intermediate.
    return Path(unreal.Paths.project_dir()).resolve() / 'Config/BranchForgeStaticUSD/registry.json'


def asset_file(path):
    assert path.startswith(ROOT + '/')
    return Path(unreal.Paths.project_content_dir()).resolve() / (path.split('.')[0][6:] + '.uasset')


def prim_paths(asset):
    return [str(p) for d in asset.get_editor_property('asset_user_data') if isinstance(d, unreal.UsdAssetUserData) for p in d.prim_paths]


def save(asset):
    assert unreal.EditorAssetLibrary.save_loaded_asset(asset, only_if_is_dirty=False), '资产保存失败：' + asset.get_path_name()


def replace_mesh_contents(target, source):
    assert hasattr(unreal,'BranchForgeStaticMeshBridge'), '请启用 BranchForge Static Vegetation Workbench 插件并重启 UE。'
    assert unreal.BranchForgeStaticMeshBridge.replace_assembly(target,source), '原生装配更新失败'
    save(target)
    return target


def import_usd(file, destination):
    assert destination.startswith(ROOT + '/') and not unreal.EditorAssetLibrary.does_directory_exist(destination), '目标目录已存在'
    options = unreal.UsdStageImportOptions()
    for key, value in dict(import_actors=False, import_geometry=True, import_materials=True,
        import_only_used_materials=True, import_skeletal_animations=False, import_level_sequences=False,
        import_groom_assets=False, import_sparse_volume_textures=False, import_sounds=False,
        override_stage_options=False, share_assets_for_identical_prims=True, use_existing_asset_cache=False,
        use_prim_kinds_for_collapsing=False, prim_path_folder_structure=False,
        merge_identical_material_slots=True, nanite_triangle_threshold=0).items():
        options.set_editor_property(key, value)
    task = unreal.AssetImportTask()
    task.filename, task.destination_path = str(file), destination
    task.automated, task.save, task.replace_existing, task.options = True, True, False, options
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    assets = [unreal.load_asset(p) for p in unreal.EditorAssetLibrary.list_assets(destination, recursive=True, include_folder=False)]
    assert assets and all(assets), 'USD 导入没有生成有效资产'
    for asset in assets:
        save(asset)
    return assets


def check_library(library):
    for path, expected in library['files'].items():
        file = asset_file(path)
        assert file.is_file() and digest(file.read_bytes()) == expected, '共用素材被修改或缺失，请恢复素材或另建素材库：' + path
        assert unreal.load_asset(path), '共用素材无法加载：' + path


def create_library(c, library_id, job):
    destination = ROOT + '/Shared/' + library_id + '/V_' + c['library_key'][:20] + '_' + uuid.uuid4().hex[:8]
    assets = import_usd(prepare_library(c, job / 'library'), destination)
    leaves, materials = {}, {}
    for asset in assets:
        if isinstance(asset, unreal.StaticMesh):
            for prim in prim_paths(asset):
                name = prim.rsplit('/', 1)[-1]
                if name.startswith('Leaf_'):
                    leaves[name] = asset.get_path_name()
                elif name.startswith('Probe_'):
                    slots = asset.static_materials
                    assert len(slots) == 1 and slots[0].material_interface
                    materials['M_' + name[6:]] = slots[0].material_interface.get_path_name()
    assert set(leaves) == set(c['leaves']), '共享叶片原型不完整'
    assert len(materials) == len(c['materials']), '共用材质不完整'
    for path in materials.values():
        mat = unreal.load_asset(path)
        assert mat and 'Translucent' not in mat.parent.get_path_name(), '不支持半透明 Nanite 材质'
    return dict(key=c['library_key'], library_id=library_id, destination=destination, leaves=leaves, materials=materials,
                files={a.get_path_name(): digest(asset_file(a.get_path_name()).read_bytes()) for a in assets})


def assembly_row(asset):
    settings = asset.get_editor_property('nanite_settings')
    data = settings.get_editor_property('nanite_assembly_data')
    parts = [re.search(r'/Game/[^\s\"\'(),]+', p.export_text()).group(0) for p in data.get_editor_property('parts')]
    return dict(path=asset.get_path_name(), text=data.export_text(), parts=parts,
        triangles=asset.get_num_nanite_triangles(), enabled=settings.enabled,
        materials=[s.material_interface.get_path_name() if s.material_interface else None for s in asset.static_materials],
        bounds=[asset.get_bounds().origin.x, asset.get_bounds().origin.y, asset.get_bounds().origin.z,
                asset.get_bounds().box_extent.x, asset.get_bounds().box_extent.y, asset.get_bounds().box_extent.z])


def field(node, name, names, default):
    match = re.search(name + r'=\(([^)]+)\)', node)
    return [float(re.search(k+r'=([-+\d.eE]+)', match[1])[1]) for k in names] if match else default


def audit(paths, c, library):
    """Verify every native node's referenced prototype and actual saved TRS."""
    rows, maximum, leaf_count = [], [0.,0.,0.], 0
    leaf_names = {v: k for k,v in library['leaves'].items()}
    assert len(paths) == c['manifest']['assembly_count'], '装配数量不符'
    for i, path in enumerate(paths):
        asset = unreal.load_asset(path)
        assert isinstance(asset, unreal.StaticMesh), '装配未保存：' + path
        row = assembly_row(asset)
        assert row['enabled'] and row['parts'] and all(row['materials'])
        assert all(v in library['materials'].values() for v in row['materials']), '装配未复用共用材质'
        assert all(unreal.load_asset(p) for p in row['parts']), '装配部件缺失'
        for p in row['parts']:
            part = unreal.load_asset(p)
            assert all(s.material_interface and s.material_interface.get_path_name() in library['materials'].values() for s in part.static_materials), '部件材质引用错误'
        block = c['instancers'][i][3] if i < len(c['instancers']) else None
        proto = numbers(block, 'protoIndices') if block else []
        pos = numbers(block, 'positions',3) if block else []
        rot = numbers(block, 'orientationsf',4) if block else []
        scale = numbers(block, 'scales',3) if block else []
        nodes = re.split(r'(?=\(PartIndex=)', row['text'].split(',Nodes=(',1)[1])[1:]
        index = 0
        for node in nodes:
            part = row['parts'][int(re.search(r'PartIndex=(\d+)', node)[1])]
            if part not in leaf_names:
                assert '/SM_Base' in part and 'Transform=' not in node, '独有藤干部件被替换或变换'
                continue
            assert index < len(proto) and leaf_names[part] == 'Leaf_' + str(int(proto[index])), '实例原型映射不符'
            p = [a*b for a,b in zip(pos[index*3:index*3+3], [100,-100,100])]
            q0 = rot[index*4:index*4+4]
            q = [-q0[1],q0[2],-q0[3],q0[0]]
            length = math.sqrt(sum(v*v for v in q)); q = [v/length for v in q]
            actual_p = field(node,'Translation','XYZ',[0,0,0])
            actual_q = field(node,'Rotation','XYZW',[0,0,0,1])
            actual_s = field(node,'Scale3D','XYZ',[1,1,1])
            errors = [max(abs(a-b) for a,b in zip(p,actual_p)),
                min(max(abs(a-b) for a,b in zip(q,actual_q)),max(abs(a+b) for a,b in zip(q,actual_q))),
                max(abs(a-b) for a,b in zip(scale[index*3:index*3+3],actual_s))]
            assert all(a <= b for a,b in zip(errors,[.0002,.000003,.000002])), '叶片实际变换不符'
            maximum = [max(a,b) for a,b in zip(maximum,errors)]
            index += 1
        assert index == len(proto), '叶片实例丢失'
        leaf_count += index
        rows.append(row)
    assert leaf_count == c['manifest']['summary']['shared_leaves']
    assert sum(r['triangles'] for r in rows) == c['manifest']['summary']['triangles'], '实际 Nanite 面数不符'
    return dict(passed=True, assemblies=rows, leaves=leaf_count, max_transform_error=maximum)


def run_operation(config, progress=lambda message: unreal.log(message)):
    directory = state_dir(); directory.mkdir(parents=True, exist_ok=True)
    lock = directory / 'operation.lock'
    # O_EXCL prevents a second workbench/commandlet writing the same registry.
    import os
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        raise RuntimeError('已有静态植被任务正在执行，或上次异常退出。请先检查任务日志和操作锁：' + str(lock))
    os.write(fd, (str(os.getpid()) + '\n').encode()); os.close(fd)
    job = directory / 'Jobs' / (time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:8])
    job.mkdir(parents=True)
    old_states, new_targets = [], []
    result = dict(passed=False, log=str(job), phase='检查输入')
    try:
        c = contract(config['package']); db = registry()
        library_id, variant_id = identifier(config.get('library','Ivy')), identifier(config['variant'])
        key = library_id + '/' + variant_id
        mode = config.get('mode','create')
        assert mode in ('create','update','clone'), '未知操作'
        old = db['variants'].get(key)
        assert (mode == 'update') == bool(old), '更新请选择已有造型；新建/另存请使用新编号'
        if mode == 'clone':
            parent = db['variants'].get(config.get('parent',''))
            assert parent and parent['library'] == library_id, '另存来源不存在或素材库不同'
        if old:
            assert hasattr(unreal,'BranchForgeStaticMeshBridge'), '请启用 BranchForge Static Vegetation Workbench 插件并重启 UE。'
            assert old['assembly_count'] == c['manifest']['assembly_count'], '装配分包数量变化，请另存造型以保留已有引用'
        source = Path(unreal.Paths.project_dir()).resolve() / 'SourceData/BranchForgeStaticUSD' / job.name / 'source'
        shutil.copytree(c['package'], source)
        c = contract(source)  # immutable snapshot for both import and reload
        library_key = library_id + '/' + c['library_key']
        library = db['libraries'].get(library_key)
        result['phase'] = '检查共用素材'; progress(result['phase'])
        reused = bool(library)
        if library:
            check_library(library)
        else:
            library = create_library(c, library_id, job)
        result['phase'] = '生成独立造型'; progress(result['phase'])
        revision = ROOT + '/Variants/' + library_id + '/' + variant_id + '/Revisions/R_' + uuid.uuid4().hex
        imported = import_usd(prepare_variant(c, library, job / 'variant'), revision)
        stage = []
        for asset in imported:
            if isinstance(asset, unreal.StaticMesh):
                row = assembly_row(asset)
                if row['parts']:
                    stage.append(asset)
        stage.sort(key=lambda a: int(next(p for p in prim_paths(a) if '/Assembly_' in p).rsplit('_',1)[1]))
        result['phase'] = '校验逐片变换与引用'; progress(result['phase'])
        audit([a.get_path_name() for a in stage], c, library)
        assert not any(isinstance(a, (unreal.MaterialInstanceConstant, unreal.Texture2D)) for a in imported), '造型重复导入了共享材质/贴图'
        if config.get('inject_failure') == 'before_publish':
            raise RuntimeError('验收注入：发布前失败')
        targets = []
        result['phase'] = '发布造型'; progress(result['phase'])
        for i, asset in enumerate(stage):
            target = ROOT + '/Variants/' + library_id + '/' + variant_id + '/SM_' + variant_id + (('_' + str(i)) if len(stage)>1 else '')
            if old:
                target = old['assets'][i]
                current = unreal.load_asset(target)
                assert isinstance(current, unreal.StaticMesh), '已有造型缺失'
                backup = unreal.EditorAssetLibrary.duplicate_asset(target, revision + '/Backup_' + str(i))
                assert backup, '无法备份当前造型'
                save(backup)
                original_file = job / ('original_' + str(i) + '.uasset')
                shutil.copy2(asset_file(target), original_file)
                old_states.append((current.get_path_name(), backup, original_file))
                atomic_json(job / 'publish-journal.json', {'restore': [dict(asset=a, file=str(f)) for a,b,f in old_states],
                                                          'registry': str(registry_file()), 'previous_record': old})
                # The native setter dispatches PostEditChangeProperty and rebuilds
                # Nanite assembly render data, preserving the existing UObject/path.
                current = replace_mesh_contents(current, asset)
            else:
                assert not unreal.EditorAssetLibrary.does_asset_exist(target), '目标资产已存在，拒绝覆盖'
                current = unreal.EditorAssetLibrary.duplicate_asset(asset.get_path_name(), target)
                assert current, '创建稳定造型资产失败'
                new_targets.append(current.get_path_name()); save(current)
            targets.append(current.get_path_name())
            expected_bounds = assembly_row(asset)['bounds']
            actual_row=assembly_row(current)
            assert all(abs(a-b) < .01 for a,b in zip(actual_row['bounds'], expected_bounds)), ('更新后的包围盒与新造型不一致：' + str(dict(actual=actual_row['bounds'],expected=expected_bounds,triangles=actual_row['triangles'],expected_triangles=asset.get_num_nanite_triangles())))
        if config.get('inject_failure') == 'after_publish':
            raise RuntimeError('验收注入：发布后失败')
        check = audit(targets, c, library)
        check_library(library)
        if config.get('fresh_verify'):
            result['phase'] = '独立进程重载验证'; progress(result['phase'])
            verify_fresh_process(targets, c, library, job)
        record = dict(library=library_id, variant=variant_id, label=config.get('label') or variant_id, assets=targets,
            library_key=library_key, source=str(source), original_package=str(Path(config['package']).resolve()),
            assembly_count=len(stage), source_sha256=c['manifest']['source_sha256'], usd_sha256=c['manifest']['files']['vegetation.usda']['sha256'],
            leaves=check['leaves'], updated=time.strftime('%Y-%m-%d %H:%M:%S'), job=str(job),
            expected_bounds=[assembly_row(a)['bounds'] for a in stage],
            previous=old['job'] if old else None, parent=config.get('parent') if mode=='clone' else None)
        db['libraries'][library_key] = library; db['variants'][key] = record
        atomic_json(registry_file(), db)
        result.update(passed=True, phase='完成', record=record, reused_library=reused,
                      reused_leaf_prototypes=len(library['leaves']) if reused else 0,
                      new_leaf_prototypes=0 if reused else len(library['leaves']), audit=check)
    except Exception:
        import traceback
        result['error'] = traceback.format_exc()
        for current_path, backup, original_file in reversed(old_states):
            current = replace_mesh_contents(unreal.load_asset(current_path), backup)
            # Keep the exact previously published package bytes after restoring
            # the in-memory object, including its previous import metadata.
            shutil.copy2(original_file, asset_file(current.get_path_name()))
        # New failed publications are ours only; keep imported revision for diagnosis.
        for path in new_targets:
            unreal.EditorAssetLibrary.delete_asset(path)
    finally:
        atomic_json(job / 'result.json', result)
        lock.unlink(missing_ok=True)
    return result


def reload_variant(key):
    db = registry(); record = db['variants'][key]; library = db['libraries'][record['library_key']]
    check_library(library)
    c = contract(record['source'])
    result = audit(record['assets'], c, library)
    for row, expected in zip(result['assemblies'], record.get('expected_bounds', [])):
        assert all(abs(a-b)<.01 for a,b in zip(row['bounds'],expected)), '重载后包围盒发生变化'
    result['record'] = record
    return result


def verify_fresh_process(paths, c, library, job):
    import subprocess
    file = job / 'reload-config.json'; report = job / 'reload.json'; log = job / 'reload.log'
    atomic_json(file, dict(mode='audit_paths', paths=paths, package=str(c['package']), library_record=library, report=str(report)))
    engine = Path(unreal.Paths.engine_dir()).resolve() / 'Binaries/Win64/UnrealEditor-Cmd.exe'
    project = Path(unreal.Paths.get_project_file_path()).resolve()
    script = Path(__file__).resolve().with_name('branchforge_static_commandlet.py')
    args = [str(engine), project.as_posix(), '-run=pythonscript',
            '-script=' + script.as_posix() + ' ' + file.as_posix(), '-EnablePlugins=USDCore,USDImporter',
            '-nullrhi', '-unattended', '-nop4', '-nosound', '-NoSplash', '-abslog='+log.as_posix()]
    process = subprocess.run(args, creationflags=subprocess.CREATE_NO_WINDOW, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    saved = read_json(report, {})
    assert process.returncode == 0 and saved.get('passed'), '独立重载失败：' + saved.get('error', str(log))
