"""BranchForge PVE workbench for create, manual binding, and JSON refresh."""

import tkinter as tk
from tkinter import filedialog, ttk

import unreal

from branchforge_pve_contract import read_contract, describe_contract
from branchforge_pve_importer import (
    DEFAULT_TARGET_FOLDER, _game_folder, create_tree_unbound, import_tree,
    update_tree_json, _bridge_for_asset, PROJECT,
)


def _selection():
    folders = list(unreal.EditorUtilityLibrary.get_selected_folder_paths())
    if not folders:
        folders = list(unreal.EditorUtilityLibrary.get_selected_path_view_folder_paths())
    folder = _game_folder(folders[0]) if len(folders) == 1 else ""
    assets = list(unreal.EditorUtilityLibrary.get_selected_assets())
    pve = [asset.get_path_name() for asset in assets
           if asset.get_class().get_name() == "ProceduralVegetation"]
    return folder, pve[0] if len(pve) == 1 else ""


def _existing_pve_assets():
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    assets = registry.get_assets_by_class(
        unreal.TopLevelAssetPath("/Script/ProceduralVegetation", "ProceduralVegetation"))
    return sorted(str(a.package_name) + "." + str(a.asset_name) for a in assets
                  if str(a.package_name).startswith("/Game/") and "/ExportJobs/" not in str(a.package_name))


def _show_result(result):
    pending = result.get("missing_source_ids", [])
    text = (f"{result['asset']}\n{result['structural_branches']} 根承重枝，"
            f"{result['instances']} 个枝实例。")
    if pending:
        text += (f"\n\n还有 {len(pending)} 个网格槽未绑定。"
                 "打开 PVE 图的 BranchForge 骨架节点，在“完整枝网格（按 JSON 枝类顺序）”中拖入完整枝 StaticMesh。")
    if result.get("copied_json"):
        text += "\n\n" + describe_contract(read_contract(result["copied_json"]))
    if result.get("mode") == "update_json":
        text += "\n\n已有枝网格按来源 ID 保留；叶图集或样本枝文件有改动时，还需重导入对应内容资产。"
    unreal.EditorDialog.show_message("BranchForge PVE 工作台", text, unreal.AppMsgType.OK)


def run(initial=None):
    """Take editor selection once, then show a modal form without touching UE from Tk callbacks."""
    folder, selected_pve = _selection()
    initial = initial or {}
    folder = initial.get('folder', folder)
    selected_pve = initial.get('asset', selected_pve)
    candidates = _existing_pve_assets()
    # Snapshot UE objects before Tk starts: callbacks only inspect ordinary files/data.
    snapshots = {}
    for path in ([selected_pve] if selected_pve else []):
        try:
            _, bridge = _bridge_for_asset(unreal.load_asset(path))
            snapshots[path] = {
                "json": bridge.get_editor_property("skeleton_file").get_editor_property("file_path"),
                "meshes": [m.get_path_name() if m else "未绑定" for m in bridge.get_editor_property("leaf_meshes")],
            }
        except Exception:
            pass
    root = tk.Tk()
    root.title("BranchForge PVE 工作台 · 0.2.65")
    root.geometry("1120x780")
    root.minsize(650, 440)
    root.attributes("-topmost", True)
    root.columnconfigure(1, weight=1)
    root.rowconfigure(6, weight=1)

    json_var = tk.StringVar(value=initial.get('json', ''))
    folder_var = tk.StringVar(value=folder)
    asset_var = tk.StringVar(value=selected_pve)
    mode_var = tk.StringVar(value=initial.get('mode', "sync" if selected_pve else "package"))
    empty_selected = (folder.startswith('/Game/') and not unreal.EditorAssetLibrary.list_assets(folder, recursive=True, include_folder=False))
    new_root_var = tk.StringVar(value=initial.get('new_root', folder if empty_selected else '/Game/Day30/Vegetation/Trees/NewTree'))
    export_after_var = tk.BooleanVar(value=initial.get('export_after', False))
    outcome = {}

    ttk.Label(root, text="整树 PVE JSON").grid(row=0, column=0, sticky="w", padx=12, pady=10)
    ttk.Entry(root, textvariable=json_var).grid(row=0, column=1, sticky="ew", pady=10)

    def browse():
        selected = filedialog.askopenfilename(parent=root, title="选择 BranchForge PVE JSON",
                                              filetypes=[("PVE 骨架 JSON", "*.json")])
        if selected:
            json_var.set(selected)
            preview()

    ttk.Button(root, text="浏览…", command=browse).grid(row=0, column=2, padx=12)
    ttk.Label(root, text="枝网格共同文件夹").grid(row=1, column=0, sticky="w", padx=12, pady=5)
    existing_folder_entry = ttk.Entry(root, textvariable=folder_var)
    existing_folder_entry.grid(row=1, column=1, columnspan=2, sticky="ew", padx=(0, 12), pady=5)
    target_label = ttk.Label(root, text="更新/导出目标 PVE")
    target_label.grid(row=2, column=0, sticky="w", padx=12, pady=5)
    target_combo = ttk.Combobox(root, textvariable=asset_var, values=candidates)
    target_combo.grid(row=2, column=1, columnspan=2, sticky="ew", padx=(0, 12), pady=5)
    ttk.Label(root, text="新树内容根目录").grid(row=3, column=0, sticky="w", padx=12, pady=5)
    new_root_entry = ttk.Entry(root, textvariable=new_root_var)
    new_root_entry.grid(row=3, column=1, columnspan=2, sticky="ew", padx=(0, 12), pady=5)

    modes = ttk.Frame(root)
    modes.grid(row=4, column=0, columnspan=3, sticky="w", padx=12, pady=8)
    ttk.Radiobutton(modes, text="新建：完整包自动导入", variable=mode_var,
                    value="package").grid(row=0, column=0, sticky="w", padx=(0, 18), pady=4)
    ttk.Radiobutton(modes, text="新建：匹配已导入的完整枝", variable=mode_var,
                    value="automatic").grid(row=0, column=1, sticky="w", padx=(0, 18))
    ttk.Radiobutton(modes, text="新建：网格稍后手动绑定", variable=mode_var,
                    value="unbound").grid(row=0, column=2, sticky="w")
    ttk.Radiobutton(modes, text="更新数据包，保留枝网格", variable=mode_var,
                    value="update").grid(row=1, column=0, sticky="w", pady=4)
    ttk.Radiobutton(modes, text="同步更新整树包（含次枝与图集）", variable=mode_var,
                    value="sync").grid(row=1, column=1, columnspan=2, sticky="w")
    ttk.Radiobutton(modes, text="新建造型：复用已有树种资源", variable=mode_var,
                    value="variant").grid(row=2, column=0, columnspan=3, sticky="w", pady=4)

    ttk.Label(root, text="JSON 枝类顺序 / 当前绑定").grid(
        row=5, column=0, columnspan=3, sticky="w", padx=12, pady=(10, 2))
    output = tk.Text(root, height=14, wrap="word", state="disabled")
    output.grid(row=6, column=0, columnspan=3, sticky="nsew", padx=12)

    def show(message):
        output.configure(state="normal")
        output.delete("1.0", "end")
        output.insert("end", message)
        output.configure(state="disabled")

    def preview():
        try:
            contract = read_contract(json_var.get())
            trunk = contract.get("imported_trunk", False)
            for button in modes.winfo_children():
                if isinstance(button, ttk.Radiobutton):
                    button.configure(state="normal" if not trunk or str(button.cget("value")) == "package" else "disabled")
            if trunk and mode_var.get() not in ("package", "package_plan"):
                mode_var.set("package")
                return
            lines = [describe_contract(contract), ""]
            if trunk:
                lines += ["雕刻树干使用完整包自动导入；在新目录保存新造型，已有树不覆盖。",
                          "自动导出按 PVE 导出节点的目录、名称、网格类型和替换策略执行，并进行冷重载检查。", ""]
            if mode_var.get() == "package":
                dest = new_root_var.get().rstrip('/')
                lines += ['新树导入目录：' + dest,
                          '自动创建 Branches（次枝）、Materials（材质与图集）、PVE、SharedParts。',
                          '资产名：PVE_' + dest.rsplit('/', 1)[-1],
                          '不用预先导入枝网格。已有空目录可使用；含资产的目录不会覆盖。',
                          '勾选自动导出后，成品会存入该树的 Meshes。', '']
            bindings = {}
            if mode_var.get() == 'variant':
                lines += ['新造型目录：' + new_root_var.get(),
                          '选择一棵同树种的已有 PVE 作为资源来源。新 PVE 使用本次 JSON 的树形。',
                          '按枝类 ID、文件内容、面数核对；相同次枝与材质直接复用。',
                          '变化的资源导入独立版本；实际几何一致的 Nanite 部件也会复用。',
                          '已有树和已导出的 SM 保留。先点“检查复用计划”查看结果。', '']
            snapshot = snapshots.get(asset_var.get()) if mode_var.get() in ("update", "sync", "variant") else None
            if mode_var.get() in ("update", "sync", "variant") and not snapshot:
                lines.append("当前目标绑定将在执行前按来源 ID 检查；内容浏览器选中该 PVE 后重开工作台可预览绑定。")
            if snapshot:
                from pathlib import Path
                previous_path = Path(snapshot["json"])
                if not previous_path.is_absolute():
                    previous_path = PROJECT / previous_path
                previous = read_contract(previous_path)
                bindings = dict(zip(previous["source_ids"], snapshot["meshes"]))
                removed = set(previous["source_ids"]) - set(contract["source_ids"])
                if removed:
                    lines.append("新数据不再使用的枝类：" + ", ".join(sorted(removed)))
            for index, identifier in enumerate(contract["source_ids"]):
                binding = f"\n    保留：{bindings.get(identifier, '新增枝类，需绑定')}" if snapshot else ""
                lines.append(f"[{index}] {identifier} — {contract['counts'][identifier]} 个实例{binding}")
            if mode_var.get() not in ('package', 'variant'):
                lines += ["\n手动模式创建空槽，默认关闭软件实际装配；绑定完成后显示所选固定网格。",
                      "替换不同路径的枝网格：该类改用新网格，其余类保留软件装配。",
                      "同路径重导入：不会自动替换已解析几何；请重新导出完整枝包，或关闭读取软件实际装配结果。",
                      "更新数据包保留材质绑定；图集内容变化需另行重导入贴图。"]
            if mode_var.get() == "sync":
                lines += ["\n整树同步：自动按 ID 更新变化的次枝和图集，保留手动换绑，刷新共享部件。",
                          "被其他造型共用的资源发生变化时，导入本树的独立版本，保护其他造型。",
                          "首次同步建立文件指纹。移除枝类保留资产；更新前自动备份。",
                          "点‘检查同步计划’可在执行前查看每项变更。"]
            show("\n".join(lines))
        except Exception as exc:
            show(f"JSON 检查失败：{exc}")

    buttons = ttk.Frame(root)
    buttons.grid(row=7, column=0, columnspan=3, sticky="e", padx=12, pady=12)
    ttk.Button(buttons, text="检查 JSON", command=preview).pack(side="left", padx=5)
    def inspect_sync():
        outcome.update({"json": json_var.get(), "asset": asset_var.get(),
                        "mode": mode_var.get() + '_plan',
                        "folder": folder_var.get(), "new_root": new_root_var.get(), "export_after": export_after_var.get()})
        root.destroy()
    plan_button = ttk.Button(buttons, text="检查同步计划", command=inspect_sync)
    plan_button.pack(side="left", padx=5)
    ttk.Checkbutton(root, text="完成后按 PVE 导出节点设置导出成品",
                    variable=export_after_var).grid(row=8, column=0, columnspan=3, sticky="w", padx=12, pady=8)

    def submit():
        outcome.update({"json": json_var.get(), "folder": folder_var.get(),
                        "asset": asset_var.get(), "mode": mode_var.get(), "new_root": new_root_var.get(), "export_after": export_after_var.get()})
        root.destroy()

    ttk.Button(buttons, text="取消", command=root.destroy).pack(side="left", padx=5)
    def export_selected():
        outcome.update({"asset": asset_var.get(), "mode": "export"})
        root.destroy()

    export_button = ttk.Button(buttons, text="导出目标 PVE 成品", command=export_selected)
    export_button.pack(side="left", padx=5)
    ttk.Button(buttons, text="执行并打开 PVE", command=submit).pack(side="left", padx=5)
    def mode_changed(*_):
        try:
            trunk = bool(json_var.get()) and read_contract(json_var.get()).get("imported_trunk", False)
        except Exception:
            trunk = False
        existing_folder_entry.configure(state='normal' if mode_var.get() == 'automatic' else 'disabled')
        target_label.configure(text='复用来源 PVE' if mode_var.get() == 'variant' else '更新/导出目标 PVE')
        target_combo.configure(state='normal' if trunk or mode_var.get() in ('sync', 'update', 'variant') else 'disabled')
        new_root_entry.configure(state='normal' if mode_var.get() in ('package', 'variant') else 'disabled')
        plan_button.configure(text={'package': '检查导入计划', 'variant': '检查复用计划'}.get(mode_var.get(), '检查同步计划'),
                              state='normal' if mode_var.get() in ('package', 'sync', 'variant') else 'disabled')
        export_button.configure(state='normal' if (trunk and asset_var.get()) or mode_var.get() in ('sync', 'update') else 'disabled')
    mode_var.trace_add('write', mode_changed)
    mode_changed()
    for variable in (mode_var, asset_var, new_root_var):
        variable.trace_add("write", lambda *_: preview() if json_var.get() else None)
    if json_var.get():
        preview()
    root.mainloop()
    if not outcome:
        return
    try:
        if outcome["mode"] == "package":
            from branchforge_pve_package import start_create
            start_create(outcome['json'], _game_folder(outcome['new_root']), export_after=outcome['export_after'])
            return
        elif outcome["mode"] == "variant":
            from branchforge_pve_variants import start_variant
            start_variant(outcome['json'], outcome['asset'], _game_folder(outcome['new_root']), export_after=outcome['export_after'])
            return
        elif outcome["mode"] in ("sync_plan", "package_plan", "variant_plan"):
            if outcome['mode'] == 'package_plan':
                from branchforge_pve_package import check_complete_package
                contract, _, warnings = check_complete_package(outcome['json'], _game_folder(outcome['new_root']))
                text = describe_contract(contract) + '\n\n新树目录：' + outcome['new_root']
                text += '\n自动创建 Branches / Materials / PVE / SharedParts，成品导出到 Meshes。'
                if warnings:
                    text += '\n\n软件质量提醒：\n' + '\n'.join(warnings)
                unreal.EditorDialog.show_message('BranchForge 导入计划（未修改资产）', text, unreal.AppMsgType.OK)
                outcome['mode'] = 'package'
            elif outcome['mode'] == 'variant_plan':
                from branchforge_pve_variants import plan_variant, describe_plan
                result = plan_variant(outcome['json'], outcome['asset'], _game_folder(outcome['new_root']))
                unreal.EditorDialog.show_message('BranchForge 复用计划（未修改资产）', describe_plan(result), unreal.AppMsgType.OK)
                outcome['mode'] = 'variant'
            else:
                from branchforge_pve_sync import plan_sync, describe_plan
                result = plan_sync(outcome["json"], outcome["asset"])
                unreal.EditorDialog.show_message("BranchForge 同步计划（未修改资产）", describe_plan(result), unreal.AppMsgType.OK)
                outcome['mode'] = 'sync'
            handle = None
            def reopen(_delta):
                unreal.unregister_slate_post_tick_callback(handle)
                run(outcome)
            handle = unreal.register_slate_post_tick_callback(reopen)
            return
        elif outcome["mode"] == "sync":
            from branchforge_pve_sync import start_sync
            start_sync(outcome["json"], outcome["asset"], export_after=outcome["export_after"])
            return
        elif outcome["mode"] == "export":
            from branchforge_pve_export import export_static_mesh
            export_static_mesh(outcome["asset"])
            return
        elif outcome["mode"] == "automatic":
            result = import_tree(outcome["json"], outcome["folder"])
        elif outcome["mode"] == "unbound":
            result = create_tree_unbound(outcome["json"])
        else:
            result = update_tree_json(outcome["json"], outcome["asset"])
        _show_result(result)
    except Exception as exc:
        unreal.log_error(f"BranchForge PVE 工作台失败：{exc}")
        unreal.EditorDialog.show_message("BranchForge PVE 工作台失败", str(exc), unreal.AppMsgType.OK)
