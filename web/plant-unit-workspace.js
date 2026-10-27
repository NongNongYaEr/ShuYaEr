import {VIEWPORT_NAVIGATION_HINT} from './viewport-navigation.js';
import { UNIT_ROLES, normalizePlantUnitPack, normalizeUnitAssembly, plantPackFromBuiltin, plantPackFromDocument, legacyPlantAssembly, documentWithUnitAssembly } from './plant-unit-data.js';
import { createPlantUnitStore } from './plant-unit-store.js';
import { importPlantGlb, imageFileData, samePlantTexture } from './plant-unit-import.js';
import { createPlantUnitPreview } from './plant-unit-preview.js';
import {isPackageAsset} from './plant-pack-client.js';
import {generatePlantUnitThumbnail,savePlantUnitThumbnail} from './plant-unit-thumbnails.js';
import {resourceIcon as icon,trapResourceDialogFocus,syncResourceOverlay} from './resource-ui.js';
import {createUnitPreparation} from './unit-preparation.js';

const $ = id => document.getElementById(id);
const stage = value => document.dispatchEvent(new CustomEvent('branch-workflow-show', { detail: value }));
const roleOptions = Object.entries(UNIT_ROLES).map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
const download = (data, name) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function createPlantUnitWorkspace(api, section) {
  const store = createPlantUnitStore();
  let catalog = [], saved = [], pack = null, selected = '', dirty = false, busy = false, preview = null;
  let thumbnails = new Map(), config = normalizeUnitAssembly({ entries: [] }), sourceStamp = '', renderToken = 0;
  let sourceLeaves = null, refreshPending = false, preserveDropLibrary = false;
  let context = {}, branchDraft = null, checkpoint = null, returnFocus = null, editorPack = null;
  const pendingFields=new Set();
  const panel = document.createElement('section'); panel.id = 'branchUnitAssemblyPanel'; panel.className = 'pu-assembly';
  panel.innerHTML = `<h3>单元枝 · 叶花果装配</h3><p class="vine-note">将单元卡拖到右侧枝干上，松手新增一个叶片、花或果实；也可拖入下方组合槽配置自动生成。</p>
    <label>植物素材套装<select id="unitAssemblyPack"><option value="">请选择植物</option></select></label>
    <div class="wb-row"><button id="unitOpenWorkbench" type="button">叶花果资产工作台</button><button id="unitRefreshPack" type="button">读取库中新版</button></div>
    <p id="unitAssemblyMaterial" class="vine-note"></p><div id="unitAssemblyLibrary" class="pu-unit-grid"></div>
    <div id="unitAssemblySlots"></div>
    <div class="field-grid"><label>叶片密度（片 / 米）<input id="unitAssemblyDensity" type="number" min="0" max="400" step="1" value="12"></label>
    <label>起始枝级<select id="unitAssemblyOrder"><option value="0">主轴及全部侧枝</option><option value="1" selected>一级侧枝起</option><option value="2">二级侧枝起</option><option value="3">三级侧枝</option></select></label>
    <label>叶片区间起点（%）<input id="unitAssemblyStart" type="number" min="0" max="99" value="15"></label><label>叶片区间终点（%）<input id="unitAssemblyEnd" type="number" min="1" max="100" value="100"></label>
    <label>花果点缀量<input id="unitAssemblyOrganAmount" type="number" min="0" max="1" step=".05" value=".35"></label><label>花果位置<select id="unitAssemblyHabit"><option value="AXILLARY">叶腋</option><option value="PENDANT">下垂</option><option value="TERMINAL">枝梢</option></select></label></div>
    <p class="vine-note">尺寸按完整单元最长边计算（含叶柄 / 花梗）；生成时保留自然大小变化。卡片权重控制该类单元的选用比例。应用组合会恢复校准尺寸，额外缩放可在“调整”中设置整体倍率。</p>
    <button id="unitAssemblyApply" type="button" class="accent">应用到当前单元枝</button><p id="unitAssemblyStatus" class="vine-note" role="status"></p>
    <button id="unitAssemblySaveBranch" type="button">去保存单元枝素材</button>`;
  section.append(panel);
  const dialog = document.createElement('dialog'); dialog.id = 'plantUnitDialog';dialog.classList.add('library-polished','pu-workbench-v2');dialog.setAttribute('aria-labelledby','unitWorkbenchTitle');
  dialog.innerHTML = `<header class="pu-header"><img src="/brand/category-units-v1.png" alt="" class="pu-brand-art"><div><small>素材制作 · 叶片 / 花 / 果实</small><h2 id="unitWorkbenchTitle">叶花果工作台</h2></div><button id="unitWorkbenchClose" type="button">${icon('arrow-left')}<span>返回创作</span></button></header>
    <div class="pu-pack-bar"><label>当前套装<input id="unitPackName" maxlength="80" required aria-label="植物名称"></label><span id="unitPackState" role="status"></span><button id="unitPackExport" type="button">${icon('resource-export')}导出套装</button></div>
    <div class="pu-workspace"><aside class="pu-pack-sidebar" aria-label="套装与单元列表"><details id="unitPackBrowser"><summary>${icon('library-big')}<span id="unitPackBrowserName">选择植物套装</span>${icon('chevron-down')}</summary><div class="pu-pack-browser-body"><div class="wb-row"><button id="unitPackNew" type="button">${icon('plus')}新建套装</button><button id="unitPackImport" type="button">${icon('resource-import')}导入套装</button></div><input id="unitPackSearch" type="search" placeholder="搜索植物套装" aria-label="搜索植物"><div id="unitPackList"></div></div></details>
      <div class="pu-library-toolbar"><h3>套装单元</h3><button id="unitRefreshThumbnails" type="button" aria-label="刷新套装预览" title="刷新套装预览">${icon('refresh-cw')}</button><input id="unitLibrarySearch" type="search" placeholder="查找单元" aria-label="查找单元"><select id="unitLibraryRole" aria-label="单元类型筛选"><option value="">全部类型</option>${roleOptions}</select><p id="unitLibraryCount"></p></div><div id="unitPackGrid" class="pu-unit-grid"></div></aside>
    <main class="pu-preview-stage"><div class="pu-model-heading"><div><small id="unitPreviewRole">单元预览</small><h3 id="unitPreviewName">选择一个单元</h3></div><button id="unitPreviewReset" type="button" title="复位视角">${icon('scan')}复位视角</button></div><div class="pu-preview-tools" role="group" aria-label="模型显示方式"><button type="button" data-preview-mode="material" aria-pressed="true">材质</button><button type="button" data-preview-mode="solid" aria-pressed="false">白模</button><button type="button" data-preview-mode="wireframe" aria-pressed="false">线框</button></div><div id="unitPreviewCanvas"></div><div id="unitPreviewEmpty" class="pu-preview-empty" hidden>${icon('resource-units')}<strong>从一个真实模型开始</strong><p>导入叶片、花或果实，检查姿态与校准尺寸。</p><button type="button" id="unitPreviewImport">${icon('plus')}导入模型单元</button></div><p class="pu-preview-help">${VIEWPORT_NAVIGATION_HINT}</p></main>
    <aside class="pu-inspector" aria-label="素材编辑"><div class="pu-inspector-tabs" role="tablist" aria-label="素材编辑分类"><button type="button" id="unitTabProperties" role="tab" aria-selected="true" aria-controls="unitPanelProperties" data-unit-tab="Properties">${icon('sliders-horizontal')}属性</button><button type="button" id="unitTabMaterial" role="tab" aria-selected="false" aria-controls="unitPanelMaterial" data-unit-tab="Material" tabindex="-1">${icon('layers')}材质</button><button type="button" id="unitTabImport" role="tab" aria-selected="false" aria-controls="unitPanelImport" data-unit-tab="Import" tabindex="-1">${icon('resource-import')}导入</button></div>
    <section id="unitPanelProperties" class="pu-editor-section" role="tabpanel" aria-labelledby="unitTabProperties"><h3>单位属性</h3><p>校准素材本身的名称、类型与自然尺寸。</p><label>单元名称<input id="unitEditName" maxlength="80" required></label><label>单元类型<select id="unitEditRole">${roleOptions}</select></label><label>基准尺寸 <small>cm · 含叶柄 / 花梗的最长边</small><input id="unitEditSize" type="number" min=".1" max="100" step=".001" required></label><div class="pu-source-info"><strong>模型来源</strong><p id="unitPreviewInfo"></p><p id="unitPackSource"></p></div><button id="unitRemove" type="button" class="pu-remove">${icon('trash-2')}移除此单元</button></section>
    <section id="unitPanelMaterial" class="pu-editor-section" role="tabpanel" aria-labelledby="unitTabMaterial" hidden><h3>套装共享材质</h3><p id="unitPackMaterialStatus"></p><div class="pu-map-preview"><img id="unitPackAtlas" alt="当前植物共享颜色图集" hidden><span id="unitPackAtlasEmpty">尚未配置颜色贴图</span></div><button id="unitPackColor" type="button">${icon('image')}更换颜色 / 透明贴图</button><div class="pu-normal-row"><span id="unitPackNormalStatus"></span><button id="unitPackNormal" type="button">法线贴图</button><button id="unitPackClearNormal" type="button" title="移除法线">${icon('x')}</button></div><div class="field-grid"><label>透明裁切<input id="unitPackCutoff" type="number" min="0" max="1" step=".01"></label><label>粗糙度<input id="unitPackRoughness" type="number" min="0" max="1" step=".01"></label></div><div class="pu-editor-note">${icon('layers')}<p>材质修改会用于本套装的全部单元。已有单元枝保留所用版本，读取新版并应用后才更新。</p></div></section>
    <section id="unitPanelImport" class="pu-editor-section" role="tabpanel" aria-labelledby="unitTabImport" hidden><h3>添加真实模型</h3><p>每个 GLB 对应一个单元，可一次选择多个文件。</p><label>导入类型<select id="unitImportRole">${roleOptions}</select></label><label>Blender 生长方向<select id="unitImportAxis"><option value="Y">+Y</option><option value="-Y">−Y</option><option value="Z">+Z</option><option value="-Z">−Z</option><option value="X">+X</option><option value="-X">−X</option></select></label><label class="pu-checkbox"><input id="unitImportReuse" type="checkbox">复用当前共享材质，仅读取网格与 UV</label><button id="unitGlbImport" type="button" class="pu-import-primary">${icon('plus')}选择 GLB 单元</button><ol class="pu-import-steps"><li>从 Blender 导出静态 GLB，内嵌贴图。</li><li>保持同一套装的共享图集与 UV。</li><li>导入后检查生长方向及厘米尺寸。</li></ol><p>贴图保留原分辨率，套装最多 64 个单元。</p></section>
    <div class="pu-assembly-action" id="unitAssemblyAction" hidden><button id="unitAddFromEditor" type="button">${icon('plus')}加入当前单元枝组合</button><small>返回装配后，点击“应用到当前单元枝”。</small></div></aside></div>
    <footer class="pu-footer"><div><span id="unitPackStatus" role="status" aria-live="polite"></span><small>保存到本机内容库 · 素材版本独立保留</small></div><button id="unitPackSave" type="button" class="accent">${icon('save')}保存套装<span>Ctrl S</span></button></footer>
    <input id="unitGlbFiles" type="file" accept=".glb" multiple hidden><input id="unitPackFile" type="file" accept=".json,.plantunits.json" hidden>
    <input id="unitPackColorFile" type="file" accept="image/png,image/jpeg,image/webp" hidden><input id="unitPackNormalFile" type="file" accept="image/png,image/jpeg,image/webp" hidden>`;
  document.body.append(dialog);
  trapResourceDialogFocus(dialog);
  const prepareButton=document.createElement('button');prepareButton.type='button';prepareButton.id='unitPrepareGlb';prepareButton.className='pu-import-primary';prepareButton.innerHTML=icon('scissors')+'整包 GLB 拆分整理';
  $('unitGlbImport').before(prepareButton);const prepareNote=document.createElement('p');prepareNote.className='pu-prepare-note';prepareNote.textContent='一份 GLB 包含多片叶子或多簇花果？进入整理台框选拆分、定底点和朝向，共用原图集。';prepareButton.before(prepareNote);
  const preparation=createUnitPreparation({onSave:async (output,preparationContext)=>{
    if(busy)throw Error('叶花果工作台正在处理，请稍后重试');busy=true;dialog.setAttribute('aria-busy','true');
    try{const previous=await store.get(output.id),next=normalizePlantUnitPack({...output,revision:(previous?.revision||0)+1}),thumbnail=await generatePlantUnitThumbnail(next);await store.put(next,{thumbnail});if(preparationContext?.source==='resource-center')return next;pack=next;dirty=false;config=normalizeUnitAssembly({entries:[],pack_id:pack.id,pack_name:pack.name});selected=pack.units[0]?.id||'';saved=await store.list();$('unitLibrarySearch').value='';$('unitLibraryRole').value='';rememberClean();try{await redraw();}catch(error){status('套装已保存，预览需重新打开：'+error.message,true);}status('已收入本机内容库 · '+pack.name+' · '+pack.units.length+' 单元 · V'+pack.revision);return next;
    }finally{busy=false;dialog.removeAttribute('aria-busy');updateState();}
  }});
  prepareButton.onclick=safe(async()=>{if(await ensureClean())await preparation.open();});
  const prepareTop=document.createElement('button');prepareTop.type='button';prepareTop.id='unitPrepareGlbTop';prepareTop.innerHTML=icon('scissors')+'整包 GLB 整理';prepareTop.title='拆出叶花果、设置挂接底点、朝向与自然尺寸';$('unitPackExport').before(prepareTop);prepareTop.onclick=prepareButton.onclick;
  const openGlobal = document.createElement('button'); openGlobal.id = 'openPlantUnitWorkbench'; openGlobal.textContent = '叶花果资产';
  document.querySelector('.branch-workspace-bar').append(openGlobal);
  function status(message, error = false) { $('unitPackStatus').textContent = message; $('unitPackStatus').classList.toggle('pu-error', error); }
  function safe(fn) { return async (...args) => {
    if (busy) return; busy = true; dialog.setAttribute('aria-busy', 'true');
    try { await ready; return await fn(...args); } catch (e) { status(e.message, true); api.toast(e.message, true); }
    finally { busy = false; dialog.removeAttribute('aria-busy'); updateState(); if (refreshPending && !dialog.open) { refreshPending = false; queueMicrotask(refresh); } }
  }; }
  const pendingDialog=document.createElement('dialog');pendingDialog.id='unitUnsavedDialog';pendingDialog.setAttribute('aria-labelledby','unitUnsavedTitle');
  pendingDialog.innerHTML='<h2 id="unitUnsavedTitle">保留套装修改？</h2><p>保存后可在本机内容库继续使用；放弃将恢复本次保存前的素材。</p><div><button type="button" data-choice="cancel">继续编辑</button><button type="button" data-choice="discard">放弃修改</button><button type="button" data-choice="save">保存并继续</button></div>';
  document.body.append(pendingDialog);trapResourceDialogFocus(pendingDialog);
  function updateState(){
    $('unitPackState').textContent=pack?(dirty?'未保存修改':'V'+pack.revision+' · 已载入'):'未选择套装';$('unitPackState').classList.toggle('is-dirty',dirty);
    $('unitPackBrowserName').textContent=pack?.name||'选择植物套装';
    for(const id of ['unitPackName','unitPackSave','unitPackExport','unitGlbImport','unitPackColor','unitPackNormal','unitPackCutoff','unitPackRoughness'])$(id).disabled=!pack;
    $('unitPackClearNormal').disabled=!pack?.material.normal;
    $('unitAssemblyAction').hidden=!api.isBranch()||context.source==='resource-center';
  }
  function rememberClean(){checkpoint=pack?{pack:structuredClone(pack),config:structuredClone(config),selected}:null;}
  function commitFields(validate=false){
    if(!pack||!dialog.open||editorPack!==pack)return;
    const fields=['unitPackName','unitPackCutoff','unitPackRoughness',...(selected?['unitEditName','unitEditSize']:[])];
    if(validate){const invalid=fields.find(id=>!$(id).value.trim()||!$(id).checkValidity());if(invalid){const tab=$(invalid).closest('[role=tabpanel]');if(tab)showTab(tab.id.replace('unitPanel',''));$(invalid).reportValidity();throw Error('请填写有效的名称、尺寸和材质参数');}}
    const set=(object,key,value)=>{if(object[key]!==value){object[key]=value;dirty=true;}};
    if(pendingFields.has('unitPackName')&&$('unitPackName').value.trim())set(pack,'name',$('unitPackName').value.trim());
    const unit=pack.units.find(u=>u.id===selected);
    if(unit){if(pendingFields.has('unitEditName')&&$('unitEditName').value.trim())set(unit,'name',$('unitEditName').value.trim());if(pendingFields.has('unitEditSize')&&$('unitEditSize').value&&$('unitEditSize').checkValidity())set(unit,'size_m',+$('unitEditSize').value/100);if(pendingFields.has('unitEditRole'))set(unit,'role',$('unitEditRole').value);}
    for(const [id,key] of [['unitPackCutoff','cutoff'],['unitPackRoughness','roughness']])if(pendingFields.has(id)&&$(id).value&&$(id).checkValidity())set(pack.material,key,+$(id).value);
    pendingFields.clear();
  }
  async function ensureClean(){
    commitFields();if(!dirty)return true;
    const focus=document.activeElement,choice=await new Promise(resolve=>{pendingDialog.showModal();pendingDialog.querySelector('[data-choice=cancel]').focus();pendingDialog.onclick=e=>{const value=e.target.closest('[data-choice]')?.dataset.choice;if(value){pendingDialog.close();resolve(value);}};pendingDialog.oncancel=e=>{e.preventDefault();pendingDialog.close();resolve('cancel');};});
    if(choice==='save')await save();
    if(choice==='discard'){pack=checkpoint?structuredClone(checkpoint.pack):null;config=checkpoint?structuredClone(checkpoint.config):normalizeUnitAssembly({entries:[]});selected=checkpoint?.selected||'';dirty=false;await redraw();}
    if(choice==='cancel')focus?.focus({preventScroll:true});return choice!=='cancel';
  }
  function showTab(name){for(const tab of dialog.querySelectorAll('[data-unit-tab]')){const active=tab.dataset.unitTab===name;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;$('unitPanel'+tab.dataset.unitTab).hidden=!active;}}
  const tabs=[...dialog.querySelectorAll('[data-unit-tab]')];for(const [index,tab] of tabs.entries()){tab.onclick=()=>showTab(tab.dataset.unitTab);tab.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=tabs[e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];showTab(next.dataset.unitTab);next.focus();};}
  for(const button of dialog.querySelectorAll('[data-preview-mode]'))button.onclick=()=>{preview?.setMode(button.dataset.previewMode);for(const b of dialog.querySelectorAll('[data-preview-mode]'))b.setAttribute('aria-pressed',String(b===button));};
  $('unitPreviewReset').onclick=()=>preview?.reset();$('unitPreviewImport').onclick=()=>{showTab('Import');$('unitGlbImport').focus();};
  for(const id of ['unitPackName','unitEditName','unitEditRole','unitEditSize','unitPackCutoff','unitPackRoughness'])$(id).addEventListener('input',()=>{if(pack&&!busy){pendingFields.add(id);dirty=true;updateState();}});
  function entries() { const rows = new Map(catalog.map(e => [e.id, e])); for (const e of saved) rows.set(e.id, { ...rows.get(e.id), ...e }); if (pack && !rows.has(pack.id)) rows.set(pack.id, { id: pack.id, name: pack.name, count: pack.units.length }); return [...rows.values()]; }
  function renderPackList() {
    const rows = entries(), search = $('unitPackSearch').value.trim().toLowerCase();
    $('unitAssemblyPack').replaceChildren(new Option('请选择植物', ''), ...rows.map(e => new Option(`${e.name} · ${e.count} 单元`, e.id)));
    if (pack) $('unitAssemblyPack').value = pack.id;
    $('unitPackList').replaceChildren();
    for (const e of rows.filter(e => !search || e.name.toLowerCase().includes(search))) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'pu-pack-item'; b.classList.toggle('active', e.id === pack?.id);
      const name = document.createElement('strong'), note = document.createElement('small'); name.textContent = e.name; note.textContent = `${e.count} 单元 · ${e.local ? '本地套装' : e.file ? 'Blender 配套素材' : '当前草稿'}`;
      if(e.thumbnail){const image=new Image();image.src=e.thumbnail;image.alt=e.name+' · 真实模型预览';b.append(image);}b.append(name, note); b.onclick = safe(async()=>{if(await selectPack(e.id)!==false)$('unitPackBrowser').open=false;}); $('unitPackList').append(b);
    }
  }
  async function save() {
    commitFields(true);
    if (!pack) throw Error('请先新建或选择植物');
    if (!dirty && saved.some(e => e.id === pack.id)) {if(pack.units.length&&store.kind==='disk'&&!saved.find(e=>e.id===pack.id)?.thumbnail){await savePlantUnitThumbnail(pack.id,await generatePlantUnitThumbnail(pack));saved=await store.list();renderPackList();}return;}
    const next = normalizePlantUnitPack({ ...pack, ...(isPackageAsset(pack.id)?{id:'plant-'+crypto.randomUUID(),name:pack.name+' · 我的副本',revision:1}:{revision: pack.revision + (saved.some(e => e.id === pack.id) ? 1 : 0)}) });
    const thumbnail=next.units.length?await generatePlantUnitThumbnail(next):'',result=await store.put(next,{thumbnail}); pack = next; dirty = false; saved = await store.list();rememberClean(); renderPackList();renderMaterial();updateState(); status(`已保存 ${pack.name} · ${pack.units.length} 单元 · v${pack.revision} · ${store.kind === 'disk' ? '电脑共享素材库' : '当前浏览器库'}`+(result?.thumbnailError?'；预览保存失败，可刷新重试：'+result.thumbnailError:''));
  }
  $('unitRefreshThumbnails').onclick=safe(redraw);$('unitLibraryRole').onchange=renderGrids;$('unitLibrarySearch').oninput=renderGrids;
  async function readPack(id) {
    const local = await store.get(id); if (local) return normalizePlantUnitPack(local);
    const entry = catalog.find(e => e.id === id); if (!entry) throw Error('素材库中没有这套植物，请导入套装文件');
    const response = await fetch('/assets/plants/' + entry.file); if (!response.ok) throw Error('读取植物素材失败');
    return plantPackFromBuiltin(await response.json(), entry);
  }
  async function selectPack(id, preserve = false) {
    if (!id) return; if (!await ensureClean())return false;
    const next = await readPack(id); pack = next; dirty = false;
    if (!preserve) config = normalizeUnitAssembly({ entries: [], pack_id: id, pack_name: pack.name });
    else {
      const missing = config.entries.filter(e => !pack.units.some(u => u.id === e.unit_id));
      config.entries = config.entries.filter(e => pack.units.some(u => u.id === e.unit_id)).map(e => ({ ...e,
        size_m: e.size_override ? e.size_m : pack.units.find(u => u.id === e.unit_id).size_m }));
      if (missing.length) api.toast(`新版套装已移除 ${missing.length} 款单元，相应组合槽已清理`);
    }
    selected = pack.units[0]?.id || '';$('unitLibrarySearch').value='';$('unitLibraryRole').value=''; await redraw();rememberClean(); status(`已载入 ${pack.name} · 选择单元，检查模型与校准尺寸`);return true;
  }
  async function redraw() {
    if (!pack){++renderToken;thumbnails.clear();$('unitPackGrid').replaceChildren();$('unitAssemblyLibrary').replaceChildren();$('unitPackName').value='';$('unitLibraryCount').textContent='0 款单元';renderPackList();renderSlots();inspect('');updateState();return;} const token = ++renderToken;
    preview ||= createPlantUnitPreview($('unitPreviewCanvas'));
    const images = await preview.load(pack); if (token !== renderToken) return;
    thumbnails = images; renderPackList(); renderMaterial(); renderGrids(); renderSlots(); renderControls(); inspect(selected);updateState();
  }
  function renderMaterial() {
    if (!pack) return;
    editorPack=pack;
    for(const id of ['unitPackName','unitPackCutoff','unitPackRoughness'])pendingFields.delete(id);
    $('unitPackName').value = pack.name; $('unitPackSource').textContent = pack.source ? '来源：' + pack.source : '自定义 GLB 素材';
    const img = $('unitPackAtlas'); img.hidden = !pack.material.color; if (pack.material.color) img.src = pack.material.color; else img.removeAttribute('src');
    $('unitPackAtlasEmpty').hidden=!!pack.material.color;$('unitPackNormalStatus').textContent=pack.material.normal?(pack.material.normal_name||'已配置法线贴图'):'未配置法线贴图';
    const text = pack.material.color ? `${pack.material.color_name || '共享颜色图集'} · ${pack.units.length} 单元共用` : '尚未配置颜色贴图，请导入贴图后再应用到单元枝';
    $('unitPackMaterialStatus').textContent = text; $('unitAssemblyMaterial').textContent = `${pack.name} · ${text}`;
    $('unitPackCutoff').value = pack.material.cutoff; $('unitPackRoughness').value = pack.material.roughness;
    $('unitImportReuse').disabled = !pack.material.color;
  }
  function card(unit, assembly = false) {
    const article = document.createElement('article'); article.className = 'pu-unit-card'; article.dataset.unitId = unit.id; article.draggable = true;
    if(!assembly){article.classList.toggle('is-current',unit.id===selected);article.setAttribute('aria-current',String(unit.id===selected));}
    const image = document.createElement('img'); image.draggable = false; image.alt = unit.name + '共享材质预览'; if (thumbnails.has(unit.id)) image.src = thumbnails.get(unit.id);
    const name = document.createElement('strong'); name.textContent = unit.name;name.title=unit.name;
    const note = document.createElement('small'); note.textContent = `${UNIT_ROLES[unit.role]} · ${(unit.size_m * 100).toFixed(1)} cm`;
    const add = document.createElement('button'); add.type = 'button'; add.textContent = assembly ? '＋ 加入组合' : '预览 / 编辑';
    add.onclick = () => {if(busy)return;if(assembly)addUnit(unit.id);else{commitFields();inspect(unit.id);}};
    article.append(image, name, note, add); article.ondblclick = safe(async () => { if (!dialog.open) await beginOpen({source:'assembly'}); preview.resize(); inspect(unit.id); });
    article.ondragstart = e => { if (assembly && !api.startUnitDrag(pack, unit, preview.material, async commit => { busy = true; try { await commit(); } finally { busy = false; refreshPending = false; preserveDropLibrary = true; refresh(); } })) { e.preventDefault(); return; } e.dataTransfer.setData('application/x-branchforge-plant-unit', JSON.stringify({ pack_id: pack.id, unit_id: unit.id })); e.dataTransfer.effectAllowed = 'copy'; };
    return article;
  }
  function renderGrids() {
    if (!pack) return;
    const search=$('unitLibrarySearch').value.trim().toLowerCase(),filtered=pack.units.filter(u=>(!$('unitLibraryRole').value||u.role===$('unitLibraryRole').value)&&(!search||u.name.toLowerCase().includes(search)));
    $('unitLibraryCount').textContent=`显示 ${filtered.length} / ${pack.units.length} 款单元`;
    $('unitPackGrid').replaceChildren(...filtered.map(u=>card(u)));
    if(!filtered.length){const empty=document.createElement('p');empty.className='pu-list-empty';empty.textContent=pack.units.length?'没有匹配的单元，请调整筛选。':'还没有单元，到右侧“导入”添加模型。';$('unitPackGrid').append(empty);}
    if(!filtered.some(u=>u.id===selected))inspect(filtered[0]?.id||'');
    $('unitAssemblyLibrary').replaceChildren(...pack.units.map(u=>card(u,true)));
  }
  function inspect(id) {
    for(const key of ['unitEditName','unitEditSize','unitEditRole'])pendingFields.delete(key);
    selected = id; const unit = pack?.units.find(u => u.id === id);
    for(const card of $('unitPackGrid').querySelectorAll('.pu-unit-card')){const current=card.dataset.unitId===id;card.classList.toggle('is-current',current);card.setAttribute('aria-current',String(current));}
    for (const key of ['unitEditName', 'unitEditRole', 'unitEditSize', 'unitAddFromEditor', 'unitRemove']) $(key).disabled = !unit;
    $('unitPreviewName').textContent=unit?.name||'选择一个单元';$('unitPreviewRole').textContent=unit?UNIT_ROLES[unit.role]+' · '+(unit.size_m*100).toFixed(1)+' cm':'模型预览';$('unitPreviewEmpty').hidden=!!unit;
    $('unitPreviewInfo').textContent = unit ? `${unit.geometry.index.length / 3} 三角面 · ${unit.source_file || '配套单元网格'} · 与其他单元共用材质` : '导入单元后可在这里检查网格、贴图和尺寸';
    if (unit) { $('unitEditName').value = unit.name; $('unitEditRole').value = unit.role; $('unitEditSize').value = +(unit.size_m * 100).toFixed(3); }else{$('unitEditName').value='';$('unitEditSize').value='';}
    preview?.show(unit);
  }
  function addUnit(id, targetRole = null) {
    const unit = pack?.units.find(u => u.id === id); if (!unit) return;
    if (targetRole && (unit.role === 'BUD' ? 'FLOWER' : unit.role) !== targetRole) { api.toast('请将该单元放入对应类型的槽位', true); return; }
    if (!config.entries.some(e => e.unit_id === id)) config.entries.push({ unit_id: id, size_m: unit.size_m, size_override: false, weight: 1 });
    if(checkpoint?.pack.id===pack.id&&checkpoint.pack.units.some(u=>u.id===id))checkpoint.config=structuredClone(config);
    renderSlots(); $('unitAssemblyStatus').textContent = '组合已调整，点击“应用到当前单元枝”更新模型';
    if (dialog.open) status('已加入当前单元枝组合，返回装配后点击应用');
  }
  function renderSlots() {
    $('unitAssemblySlots').replaceChildren();
    for (const role of ['LEAF', 'FLOWER', 'FRUIT']) {
      const box = document.createElement('section'); box.className = 'pu-slot'; box.dataset.role = role;
      const heading = document.createElement('h4'); heading.textContent = role === 'FLOWER' ? '花 / 花苞' : UNIT_ROLES[role]; box.append(heading);
      for (const entry of config.entries) {
        const unit = pack?.units.find(u => u.id === entry.unit_id); if (!unit || (unit.role === 'BUD' ? 'FLOWER' : unit.role) !== role) continue;
        const row = document.createElement('div'); row.className = 'pu-assigned'; row.dataset.unitId = unit.id;
        const image = document.createElement('img'); image.alt = unit.name; image.src = thumbnails.get(unit.id) || ''; image.ondblclick = safe(async () => { await beginOpen({source:'assembly'}); preview.resize(); inspect(unit.id); });
        const info = document.createElement('div'), name = document.createElement('strong'); name.textContent = unit.name; info.append(name);
        const fields = document.createElement('div'); fields.className = 'pu-row-fields';
        for (const [key, title, min, max, factor] of [['size_m', 'cm', .1, 100, 100], ['weight', '权重', .01, 10, 1]]) {
          const label = document.createElement('label'), input = document.createElement('input'); label.textContent = title; input.type = 'number'; input.min = min; input.max = max; input.step = '.1'; input.value = +(entry[key] * factor).toFixed(3);
          input.setAttribute('aria-label', unit.name + ' ' + title); input.onchange = () => { if (!input.value || !input.checkValidity()) return; entry[key] = +input.value / factor; if (key === 'size_m') entry.size_override = true; }; label.append(input); fields.append(label);
        }
        info.append(fields); const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', '移除 ' + unit.name);
        remove.onclick = () => { config.entries = config.entries.filter(e => e !== entry); renderSlots(); }; row.append(image, info, remove); box.append(row);
      }
      const empty = document.createElement('div'); empty.className = 'pu-drop'; empty.textContent = '+ 拖入' + (role === 'FLOWER' ? '花或花苞' : UNIT_ROLES[role]) + '单元'; box.append(empty);
      box.ondragover = e => { if (e.dataTransfer.types.includes('application/x-branchforge-plant-unit')) { e.preventDefault(); box.classList.add('drag-over'); } };
      box.ondragleave = () => box.classList.remove('drag-over'); box.ondrop = e => {
        e.preventDefault(); box.classList.remove('drag-over');
        try { const data = JSON.parse(e.dataTransfer.getData('application/x-branchforge-plant-unit')); if (data.pack_id !== pack?.id) throw Error('一次单元枝装配使用一套植物共享材质，请先切换对应植物'); addUnit(data.unit_id, role); } catch (error) { api.toast(error.message, true); }
      };
      $('unitAssemblySlots').append(box);
    }
  }
  const controls = { unitAssemblyDensity: ['density', 1], unitAssemblyOrder: ['order_min', 1], unitAssemblyStart: ['start', 100], unitAssemblyEnd: ['end', 100], unitAssemblyOrganAmount: ['organ_amount', 1] };
  function renderControls() { for (const [id, [key, factor]] of Object.entries(controls)) $(id).value = config[key] * factor; $('unitAssemblyHabit').value = config.habit; }
  function readControls() { for (const [id, [key, factor]] of Object.entries(controls)) { if (!$(id).value || !$(id).checkValidity()) throw Error('请填写有效的装配参数'); config[key] = +$(id).value / factor; } config.habit = $('unitAssemblyHabit').value; }
  async function beginOpen(options={},id=null){
    if(!dialog.open){
      context=options;returnFocus=document.activeElement;
      if(options.source==='resource-center'&&api.isBranch()){branchDraft={pack,config,selected,dirty,checkpoint,thumbnails};pack=null;dirty=false;checkpoint=null;config=normalizeUnitAssembly({entries:[]});}
    }
    try{
      if(id){if(await selectPack(id)===false)return;}
      else if(!pack)await selectPack(entries()[0]?.id);else{await redraw();if(!dirty)rememberClean();}
    }catch(error){restoreBranchDraft();const onReturn=context.onReturn;if(!dialog.open){context={};if(onReturn)await onReturn();}throw error;}
    $('unitWorkbenchClose').querySelector('span').textContent=context.source==='resource-center'?'返回资源中心':api.isBranch()?'返回单元枝装配':'返回创作';
    updateState();if(!dialog.open)dialog.showModal();syncResourceOverlay();preview?.resize();$('unitWorkbenchClose').focus();window.lucide?.createIcons({root:dialog});
  }
  const open = safe(options=>beginOpen(options||{}));
  openGlobal.onclick=()=>open({source:api.isBranch()?'assembly':'editor'});$('unitOpenWorkbench').onclick=()=>open({source:'assembly'});
  function restoreBranchDraft(){if(!branchDraft)return;({pack,config,selected,dirty,checkpoint,thumbnails}=branchDraft);branchDraft=null;renderPackList();renderGrids();renderSlots();renderControls();updateState();}
  async function close(){
    if(!await ensureClean())return;const onReturn=context.onReturn;dialog.close();syncResourceOverlay();context={};
    restoreBranchDraft();
    if(onReturn)await onReturn();else{if(api.isBranch())stage('ASSEMBLE');returnFocus?.isConnected&&returnFocus.focus({preventScroll:true});}
  }
  $('unitWorkbenchClose').onclick=safe(close);dialog.oncancel=e=>{e.preventDefault();if(!busy)safe(close)();};
  for(const event of ['keydown','keyup'])document.addEventListener(event,e=>{if(!dialog.open||!(dialog.contains(e.target)||pendingDialog.contains(e.target)))return;if(event==='keydown'&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(!busy)safe(save)();}e.stopPropagation();},false);
  pendingDialog.addEventListener('keydown',e=>e.stopPropagation());pendingDialog.addEventListener('keyup',e=>e.stopPropagation());
  $('unitPackSave').onclick = safe(save); $('unitPackSearch').oninput = renderPackList;
  $('unitAssemblyPack').onchange = safe(() => selectPack($('unitAssemblyPack').value));
  $('unitRefreshPack').onclick = safe(async () => { if (pack) await selectPack(pack.id, true); });
  $('unitPackNew').onclick = safe(async () => {
    if (!await ensureClean())return;rememberClean(); pack = normalizePlantUnitPack({ id: crypto.randomUUID(), name: '新植物', units: [] }); dirty = true; selected = ''; config = normalizeUnitAssembly({ entries: [] }); await redraw();$('unitPackBrowser').open=false;showTab('Import'); $('unitPackName').focus();
  });
  $('unitPackName').onchange = () => { if (busy || !pack) return;const name=$('unitPackName').value.trim();if(name&&name!==pack.name){pack.name=name;dirty=true;renderPackList();}updateState(); };
  for (const [id, key, factor] of [['unitEditName', 'name', null], ['unitEditRole', 'role', null], ['unitEditSize', 'size_m', 100]]) $(id).onchange = () => {
    const unit = pack?.units.find(u => u.id === selected); if (busy || !unit || !$(id).value || !$(id).checkValidity()) return;
    const value=factor?+$(id).value/factor:$(id).value;if(unit[key]===value)return;
    unit[key] = value; dirty = true; renderGrids(); renderSlots(); inspect(selected);updateState(); status('单元素材已修改，请保存套装；当前单元枝尺寸可在装配卡上单独设置');
  };
  $('unitAddFromEditor').onclick = () => addUnit(selected);
  $('unitRemove').onclick = () => { if (busy || !pack) return; pack.units = pack.units.filter(u => u.id !== selected); config.entries = config.entries.filter(e => e.unit_id !== selected); dirty = true; renderGrids(); renderSlots(); inspect(pack.units[0]?.id); };
  $('unitPackExport').onclick = safe(async () => { if (!pack) return;commitFields(true); download(normalizePlantUnitPack(pack), pack.name.replace(/[<>:"/\\|?*]/g, '_') + '.plantunits.json'); status('套装已导出，包含全部单元和一份共享贴图'); });
  $('unitPackImport').onclick = () => $('unitPackFile').click();
  $('unitPackFile').onchange = safe(async () => {
    const file = $('unitPackFile').files[0]; $('unitPackFile').value = ''; if (!file) return; if (file.size > 120 * 1024 * 1024) throw Error('套装文件请控制在 120 MB 内');
    const raw = JSON.parse(await file.text()); if (raw.format !== 'BranchForgePlantUnits') throw Error('请选择 .plantunits.json 素材套装文件');
    const imported = normalizePlantUnitPack(raw); if (!await ensureClean())return; pack = imported; dirty = true; config = normalizeUnitAssembly({ entries: [] }); selected = pack.units[0]?.id; await save(); await redraw();$('unitPackBrowser').open=false;showTab('Properties');
  });
  for (const [button, input, key] of [['unitPackColor', 'unitPackColorFile', 'color'], ['unitPackNormal', 'unitPackNormalFile', 'normal']]) {
    $(button).onclick = () => { if (pack) $(input).click(); };
    $(input).onchange = safe(async () => { const file = $(input).files[0]; $(input).value = ''; if (!file || !pack) return; const data = await imageFileData(file); pack.material[key] = data; pack.material[key + '_name'] = file.name; dirty = true; await redraw(); status('共享贴图已更新，全部单元已使用同一材质重新预览'); });
  }
  $('unitPackClearNormal').onclick = safe(async () => { if (!pack) return; pack.material.normal = ''; pack.material.normal_name = ''; dirty = true; await redraw(); });
  for (const [id, key] of [['unitPackCutoff', 'cutoff'], ['unitPackRoughness', 'roughness']]) $(id).onchange = safe(async () => { if (!pack || !$(id).value || !$(id).checkValidity()||pack.material[key]===+$(id).value) return; pack.material[key] = +$(id).value; dirty = true; await redraw(); });
  $('unitGlbImport').onclick = () => { if (pack && !busy) $('unitGlbFiles').click(); };
  $('unitGlbFiles').onchange = safe(async () => {
    const files = [...$('unitGlbFiles').files]; $('unitGlbFiles').value = ''; if (!pack || !files.length) return;
    if (pack.units.length + files.length > 64) throw Error('每套植物最多 64 个单元');
    const imported = [], reuse = $('unitImportReuse').checked && !!pack.material.color;
    let material = pack.material;
    for (let i = 0; i < files.length; i++) {
      status(`正在导入 ${i + 1}/${files.length} · ${files[i].name}`);
      const result = await importPlantGlb(files[i], { role: $('unitImportRole').value, axis: $('unitImportAxis').value, reuseMaterial: reuse });
      if (!reuse && material.color && result.material.color && !await samePlantTexture(material.color, result.material.color)) throw Error('GLB 中的贴图与当前植物不一致。请确认使用同一图集，或勾选“复用当前共享材质”后导入');
      if (!reuse && material.normal && result.material.normal && !await samePlantTexture(material.normal, result.material.normal)) throw Error('GLB 中的法线图与当前共享材质不一致，请统一图集或明确选择复用共享材质');
      if (!material.color && result.material.color) material = result.material;
      imported.push(result.unit);
    }
    pack.units.push(...imported); pack.material = material; dirty = true; selected = imported[0].id; await redraw();
    status(`已导入 ${imported.length} 个单元。请检查生长方向、UV 与厘米尺寸，再保存套装。`);
  });
  $('unitAssemblyApply').onclick = safe(async () => {
    if (!api.isBranch()) throw Error('请先切换到枝条工作台，再应用叶花果组合');
    if (!pack) throw Error('请选择植物素材套装'); readControls(); await api.flush();
    const next = documentWithUnitAssembly(api.capture(), pack, config); await api.applyPlantAssets(next);
    $('unitAssemblyStatus').textContent = `已应用 ${config.entries.length} 款单元 · ${pack.name} · 共享贴图已随单元枝保存`;
    api.toast('已更新当前单元枝叶花果，可继续调整并保存为单元枝素材');
  });
  $('unitAssemblySaveBranch').onclick = () => { stage('ASSETS'); $('wbAssetName')?.focus(); };
  const ready = Promise.all([fetch('/assets/plant-unit-catalog.json').then(r => { if (!r.ok) throw Error('配套素材目录读取失败'); return r.json(); }), store.list()])
    .then(([builtins, locals]) => { catalog = builtins; saved = locals; renderPackList(); renderSlots(); })
    .catch(e => { status(e.message, true); api.toast(e.message, true); });
  function refresh() {
    panel.hidden = !api.isBranch(); $('unitAssemblyApply').disabled = !api.isBranch();
    if (!api.isBranch()) { sourceLeaves = null; sourceStamp = ''; return; }
    if (busy||dialog.open) { refreshPending = true; return; }
    const a = api.getAuthoring(), settings = api.getSettings();
    const leaves = api.getLeafSources?.();
    const stamp = JSON.stringify([a.workbench?.name, a.plant_unit_assembly, settings.leaf_density, settings.leaf_scale, settings.leaf_aspect, settings.leaf_zone_start,
      a.foliage_range, a.tree_organs.mode, a.tree_organs.amount, a.tree_organs.habit, a.tree_organs.scale,
      a.tree_organs.units.map(u => [u.id, u.size, u.weight]), leaves?.map(u => [u.id, u.calibration, u.colorTint, u.weight])]);
    if (stamp === sourceStamp && leaves === sourceLeaves) return;
    const changedDocument = leaves !== sourceLeaves; sourceStamp = stamp; sourceLeaves = leaves;
    if (preserveDropLibrary) { preserveDropLibrary = false; return; }
    const restored = normalizeUnitAssembly(a.plant_unit_assembly);
    if (restored) {
      config = { ...restored, density: settings.leaf_density, start: Math.max(settings.leaf_zone_start, a.foliage_range.start), end: a.foliage_range.end, organ_amount: a.tree_organs.amount, habit: a.tree_organs.habit }; const embedded = plantPackFromDocument({ ...api.capture(), settings });
      if (embedded && (changedDocument || pack?.id !== embedded.id || restored.entries.some(e => !pack.units.some(u => u.id === e.unit_id)))) {
        pack = embedded; dirty = false; selected = pack.units[0]?.id; safe(redraw)();
      } else { renderSlots(); renderControls(); }
      $('unitAssemblyStatus').textContent = `当前单元枝：${restored.pack_name} · ${restored.entries.length} 款单元。可读取库中新版并重新应用。`;
    } else {
      // During a load the controls and sources are current before the generated
      // asset is replaced. capture() still contains the previous asset.settings.
      const recovered = legacyPlantAssembly({ ...api.capture(), settings });
      if (recovered) {
        pack = recovered.pack; config = recovered.config; dirty = false; selected = pack.units[0]?.id; safe(redraw)();
        $('unitAssemblyStatus').textContent = `已读取旧单元枝实际使用的 ${config.entries.length} 款叶花果；原网格、贴图和枝条保持原样。库中未启用的花果可另行加入组合。`;
      } else {
        pack = null; dirty = false; selected = ''; thumbnails.clear(); config = normalizeUnitAssembly({ entries: [], density: settings.leaf_density });
        renderPackList(); renderSlots(); renderControls(); inspect('');
        $('unitAssemblyLibrary').replaceChildren(); $('unitPackGrid').replaceChildren(); $('unitAssemblyMaterial').textContent = '';
        $('unitAssemblyStatus').textContent = '当前单元枝没有内嵌叶花果单元，请选择植物素材套装';
      }
    }
  }
  return { refresh, open,preparation,openPreparation:safe(async(options={})=>{if(dialog.open&&!await ensureClean())return;await preparation.open({source:'resource-center',returnLabel:'返回资源中心',onSaved:async next=>{options.beforeOpenPack?.();await safe(()=>beginOpen({source:'resource-center',onReturn:options.onReturn},next.id))();}});}),async reload(){saved=await store.list();renderPackList();},openPack:safe((id,options={})=>beginOpen(options,id)), get pack() { return pack; }, get config() { return config; }, get preview() { return preview; }, get busy() { return busy; }, ready };
}

