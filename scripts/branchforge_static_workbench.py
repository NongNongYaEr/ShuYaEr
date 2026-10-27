"""User-operated UE Tools menu; never drives the user's editor or desktop."""
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, ttk
from branchforge_static_contract import contract, identifier


def describe(package, library_id, db):
    c = contract(package)
    library = db['libraries'].get(identifier(library_id) + '/' + c['library_key'])
    m = c['manifest']; count = len(c['leaves'])
    return c, (f"{m['name']}\n{m['summary']['shared_leaves']:,} 片共享叶 · {m['assembly_count']} 个装配 · "
        f"{m['summary']['triangles']:,} 个实际三角面\n"
        + (f'复用现有素材版本：{count} 个叶片网格，以及配套材质与贴图。' if library else
           f'新增素材版本：{count} 个叶片网格，以及配套材质与贴图；其他造型保持原版本。')
        + '\n独有藤干保存在当前造型中；所有叶片位置、旋转和大小保持导出结果。')


def form(db, initial=None):
    initial = initial or {}
    root = tk.Tk(); root.title('BranchForge 静态植被工作台'); root.geometry('980x690'); root.minsize(790,580)
    root.columnconfigure(1, weight=1); root.rowconfigure(8, weight=1)
    style = ttk.Style(root); style.configure('Title.TLabel', font=('Microsoft YaHei UI',14,'bold'))
    ttk.Label(root, text='共用素材 · 多种造型', style='Title.TLabel').grid(row=0,column=0,columnspan=3,sticky='w',padx=16,pady=12)
    ttk.Label(root, text='选择软件导出的 vegetation.usda。相同叶片、材质和贴图自动复用，造型独立保存。').grid(row=1,column=0,columnspan=3,sticky='w',padx=16)
    package = tk.StringVar(value=initial.get('package',''))
    library = tk.StringVar(value=initial.get('library','Ivy'))
    variant = tk.StringVar(value=initial.get('variant','IvyShape01'))
    label = tk.StringVar(value=initial.get('label','常春藤造型'))
    mode = tk.StringVar(value=initial.get('mode','create'))
    selected = tk.StringVar(value=initial.get('selected',''))
    status = tk.StringVar(value='选择导出文件后，点击“检查素材与造型”。')
    outcome = {}
    ttk.Label(root,text='静态植被 USD').grid(row=2,column=0,sticky='w',padx=16,pady=12)
    ttk.Entry(root,textvariable=package).grid(row=2,column=1,sticky='ew')
    def browse():
        value = filedialog.askopenfilename(parent=root,title='选择静态植被包',filetypes=[('BranchForge 静态植被','*.usda')])
        if value: package.set(value); preview()
    ttk.Button(root,text='选择文件…',command=browse).grid(row=2,column=2,padx=12)
    ttk.Label(root,text='共用素材库编号').grid(row=3,column=0,sticky='w',padx=16,pady=6)
    ttk.Combobox(root,textvariable=library,values=sorted({'Ivy'} | {v['library_id'] for v in db['libraries'].values()})).grid(row=3,column=1,sticky='ew')
    ttk.Label(root,text='例如 Ivy；不同植物分库').grid(row=3,column=2,padx=12)
    modes = ttk.Frame(root); modes.grid(row=4,column=0,columnspan=3,sticky='w',padx=16,pady=12)
    for title,value in [('新建造型','create'),('更新当前造型','update'),('从已有造型另存','clone')]:
        ttk.Radiobutton(modes,text=title,variable=mode,value=value,command=lambda:sync()).pack(side='left',padx=(0,20))
    ttk.Label(root,text='已有造型').grid(row=5,column=0,sticky='w',padx=16,pady=6)
    choices = {f"{v['label']}  [{k}]": k for k,v in db['variants'].items()}
    choice = ttk.Combobox(root,textvariable=selected,values=sorted(choices),state='readonly')
    choice.grid(row=5,column=1,columnspan=2,sticky='ew',padx=(0,16)); choice.bind('<<ComboboxSelected>>',lambda _:sync(True))
    ttk.Label(root,text='造型编号 / 显示名称').grid(row=6,column=0,sticky='w',padx=16,pady=6)
    names = ttk.Frame(root); names.grid(row=6,column=1,columnspan=2,sticky='ew',padx=(0,16)); names.columnconfigure(1,weight=1)
    variant_entry=ttk.Entry(names,textvariable=variant,width=27); variant_entry.grid(row=0,column=0,padx=(0,10))
    ttk.Entry(names,textvariable=label).grid(row=0,column=1,sticky='ew')
    hint = tk.StringVar()
    ttk.Label(root,textvariable=hint,wraplength=870).grid(row=7,column=0,columnspan=3,sticky='w',padx=16,pady=10)
    info = tk.Text(root,wrap='word',font=('Microsoft YaHei UI',10),height=12)
    info.grid(row=8,column=0,columnspan=3,sticky='nsew',padx=16,pady=8)
    def write(text):
        info.configure(state='normal'); info.delete('1.0','end'); info.insert('1.0',text); info.configure(state='disabled')
    def sync(changed=False):
        choice.configure(state='disabled' if mode.get()=='create' else 'readonly')
        variant_entry.configure(state='readonly' if mode.get()=='update' else 'normal')
        record = db['variants'].get(choices.get(selected.get()))
        if record and mode.get() != 'create':
            library.set(record['library'])
            if mode.get()=='update': variant.set(record['variant']); label.set(record['label'])
            elif changed: variant.set(record['variant'] + '_Copy'); label.set(record['label'] + ' 副本')
            if changed and not package.get(): package.set(str(Path(record['original_package']) / 'vegetation.usda'))
        hint.set('更新保留现有 SM 资产路径和关卡引用；只更新所选造型。素材改变时自动新建素材版本。' if mode.get()=='update' else
                 '编号使用英文、数字和下划线；显示名称支持中文。新造型沿用所选素材库，相同内容自动复用。')
    def preview():
        try:
            _, text = describe(package.get(),library.get(),db); write(text); status.set('检查通过，可以执行。')
        except Exception as exc: write(str(exc)); status.set('检查未通过，请修正输入。')
    def execute():
        try:
            c,text = describe(package.get(),library.get(),db)
            lid,vid = identifier(library.get()),identifier(variant.get()); key=lid+'/'+vid
            if (mode.get()=='update') != (key in db['variants']): raise ValueError('更新请选择已有造型；新建/另存请填写未使用的造型编号。')
            parent=choices.get(selected.get())
            if mode.get()!='create' and not parent: raise ValueError('请先选择已有造型。')
            if mode.get()=='update' and parent!=key: raise ValueError('更新目标与所选造型不一致。')
            outcome.update(package=str(c['package']),library=lid,variant=vid,label=label.get(),mode=mode.get(),parent=parent)
            root.destroy()
        except Exception as exc: write(str(exc)); status.set('未开始导入。')
    bottom=ttk.Frame(root); bottom.grid(row=9,column=0,columnspan=3,sticky='ew',padx=16,pady=12)
    ttk.Button(bottom,text='检查素材与造型',command=preview).pack(side='left')
    ttk.Label(bottom,textvariable=status).pack(side='left',padx=12)
    ttk.Button(bottom,text='开始导入 / 更新',command=execute).pack(side='right')
    sync(); write('共用素材按实际网格、UV、材质参数及贴图内容识别。\n\n每个素材版本保留，旧造型不会被新素材自动修改。\n修改叶片或材质后，请从植物软件重新导出。\n\n导入会检查全部叶片变换、原型映射、材质引用和 Nanite 面数。\n大规模造型需要等待 UE 构建；操作期间请勿关闭编辑器。')
    root.mainloop()
    return outcome


def run():
    import unreal
    from branchforge_static_ue import registry, run_operation
    db=registry(); initial={}
    selected={a.get_path_name() for a in unreal.EditorUtilityLibrary.get_selected_assets()}
    matches=[(k,v) for k,v in db['variants'].items() if selected.intersection(v['assets'])]
    if len(matches)==1:
        key,record=matches[0]
        package=Path(record['original_package'])
        if not package.exists(): package=Path(record['source'])
        initial=dict(mode='update',library=record['library'],variant=record['variant'],label=record['label'],
                     selected=f"{record['label']}  [{key}]",package=str(package/'vegetation.usda'))
    config=form(db,initial)
    if not config: return
    config['fresh_verify']=True
    try:
        with unreal.ScopedSlowTask(7, 'BranchForge 静态植被导入') as task:
            task.make_dialog(False)
            result=run_operation(config,lambda message:task.enter_progress_frame(1,message))
    except Exception as exc:
        unreal.EditorDialog.show_message('静态植被工作台',str(exc),unreal.AppMsgType.OK)
        return
    root=tk.Tk(); root.title('静态植被 · 导入结果'); root.geometry('880x490')
    root.columnconfigure(0,weight=1); root.rowconfigure(1,weight=1)
    title='导入完成：'+config['label'] if result['passed'] else '导入未完成：'+result.get('phase','检查')
    ttk.Label(root,text=title,font=('Microsoft YaHei UI',13,'bold')).grid(row=0,column=0,sticky='w',padx=16,pady=12)
    info=tk.Text(root,wrap='word'); info.grid(row=1,column=0,sticky='nsew',padx=16)
    paths=result.get('record',{}).get('assets',[])
    text=(f"{result['audit']['leaves']:,} 片叶，{len(paths)} 个装配。\n叶片网格：复用 {result['reused_leaf_prototypes']}，新增 {result['new_leaf_prototypes']}。\n逐片变换、实际面数、依赖引用与独立进程重载校验通过。\n\n"+'\n'.join(paths)) if result['passed'] else result.get('error','未知错误')
    info.insert('1.0',text+'\n\n日志与恢复记录：\n'+result['log']); info.configure(state='disabled')
    buttons=ttk.Frame(root); buttons.grid(row=2,column=0,sticky='ew',padx=16,pady=12)
    action={}
    def locate(): action['locate']=True; root.destroy()
    if paths:
        ttk.Button(buttons,text='在内容浏览器定位造型',command=locate).pack(side='left')
        ttk.Button(buttons,text='复制资产路径',command=lambda:(root.clipboard_clear(),root.clipboard_append('\n'.join(paths)))).pack(side='left',padx=10)
    import os
    ttk.Button(buttons,text='打开日志文件夹',command=lambda:os.startfile(result['log'])).pack(side='left')
    ttk.Button(buttons,text='关闭',command=root.destroy).pack(side='right')
    root.mainloop()
    if action.get('locate'): unreal.EditorAssetLibrary.sync_browser_to_objects(paths)


def register():
    import unreal
    menus=unreal.ToolMenus.get(); menu=menus.extend_menu('LevelEditor.MainMenu.Tools')
    entry=unreal.ToolMenuEntry(name='Day30.BranchForge.StaticVegetationWorkbench',type=unreal.MultiBlockType.MENU_ENTRY)
    entry.set_label('BranchForge 静态植被工作台')
    entry.set_tool_tip('共享常春藤叶片和材质；新建、更新或另存静态植被造型。')
    entry.set_string_command(unreal.ToolMenuStringCommandType.PYTHON,'','import branchforge_static_workbench; branchforge_static_workbench.run()')
    menu.add_menu_entry('BranchForge',entry); menus.refresh_all_widgets()
