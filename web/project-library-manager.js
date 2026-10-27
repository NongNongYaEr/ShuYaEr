import { activeProject, editableProjectCopy, BINDING_LABELS, KIND_LABELS } from './project-library-data.js';
import { attachSaveContext, templateContext } from './project-save-data.js';
import { createAppConfirm } from './app-confirm.js';

export function createProjectLibraryManager(api) {
  const dialog = document.createElement('dialog'); dialog.id = 'projectLibraryDialog';
  dialog.setAttribute('aria-label', '成品树样板库与旧工程浏览器');
  dialog.innerHTML = `<header><div><h2>成品树样板库</h2><p>选择已有树型，创建可编辑副本，再调整主枝和单元枝装配。</p></div><button id="plClose">关闭</button></header>
    <nav><button id="plTemplates" class="accent">整树样板</button><button id="plLegacy">旧工程浏览器</button><button id="plScan">刷新目录</button></nav>
    <div class="pl-toolbar"><input id="plSearch" aria-label="搜索工程" placeholder="搜索植物、工程名或路径"><select id="plSpecies" aria-label="植物筛选"><option value="">所有植物</option></select><select id="plKind" aria-label="工程类型"><option value="">所有类型</option><option value="TREE">整树 / 整株</option><option value="BRANCH">单元枝</option><option value="VINE">藤蔓工作区</option><option value="UNKNOWN">待分类</option></select><select id="plBinding" aria-label="单元枝装配状态"><option value="">所有装配状态</option><option value="new">已接入本轮单元枝</option><option value="mixed">新旧单元枝混用</option><option value="legacy">仍用旧单元枝</option><option value="none">尚未装配单元枝</option></select></div>
    <div class="pl-body"><section class="pl-results"><p id="plCount"></p><div id="plGrid"></div><p id="plEmpty" hidden>没有符合筛选条件的工程。</p></section><aside><h3 id="plName">选择工程</h3><p id="plInfo"></p><p id="plPath"></p><p id="plWarning">旧工程按原始数据载入。单元枝已入库，不代表旧工程已换用。</p><button id="plOpen" class="accent" disabled>从样板创建副本</button><button id="plDelete" disabled>删除自存样板</button><hr><h3>保存当前整树</h3><input id="plSaveName" aria-label="样板名称" placeholder="为当前树型命名"><button id="plSave">将当前整树保存为新样板</button><p>保存完整可编辑工程、叶花果网格和材质；每次新增一份样板。</p></aside></div>
    <footer><span id="plStatus" role="status">初始样本与软件预览目录；原工程保留。</span></footer>`;
  dialog.classList.add('library-polished');document.body.append(dialog);
  const confirm = createAppConfirm('projectLibraryConfirm');
  const $ = id => dialog.querySelector('#'+id);
  let items=[], tab='templates', selected='', working=false;let previewCache=new Map();
  const refreshPreview=document.createElement('button');refreshPreview.id='plRefreshPreview';refreshPreview.type='button';refreshPreview.textContent='刷新所选预览';refreshPreview.title='重新渲染保存工程，保留当前树和正式样板';$('plDelete').before(refreshPreview);
  refreshPreview.onclick=()=>perform(async()=>{const item=items.find(i=>i.id===selected);if(!item)return;$('plStatus').textContent='读取保存工程并渲染真实植物预览…';const doc=await request('/api/project-document?id='+encodeURIComponent(item.id));const preview=await api.thumbnailDocument(doc);if(!preview.image)throw Error('未生成预览');const img=new Image();img.src=preview.image;await img.decode();const canvas=document.createElement('canvas');canvas.width=400;canvas.height=300;canvas.getContext('2d').drawImage(img,0,0);const thumbnail=canvas.toDataURL('image/jpeg',.85),revision=Math.round(item.mtimeMs||1);await request('/api/branch-thumbnails',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'project:'+item.id,revision,thumbnail})});previewCache.set(item.id,{revision,thumbnail});render();$('plStatus').textContent='预览已刷新 · 正式样板与当前编辑保持';});
  const request = async (url, options) => { const r=await fetch(url, options); if(!r.ok) { let m;try{m=(await r.json()).message;}catch{} throw Error(m || `请求失败 (${r.status})，请重启软件服务后重试`); } return r.json(); };
  async function refresh() {
    const result = await request('/api/project-library'); items=result.items || [];
    try{const cache=await request('/api/branch-thumbnails');previewCache=new Map((cache.items||[]).filter(i=>i.id.startsWith('project:')).map(i=>[i.id.slice(8),i]));}catch{}
    const value=$('plSpecies').value;
    $('plSpecies').replaceChildren(new Option('所有植物',''));
    const species = new Map(items.map(i=>[i.species || 'UNKNOWN',i.speciesName || '未识别植物']));
    for(const [id,name] of [...species].sort((a,b)=>a[1].localeCompare(b[1],'zh-CN'))) $('plSpecies').add(new Option(name,id));
    $('plSpecies').value=value;
    $('plStatus').textContent=`来源样板 ${items.filter(i=>i.managed&&!i.userSaved).length} 份 · 自存样板及版本 ${items.filter(i=>i.userSaved).length} 份 · 旧工程目录 ${items.filter(i=>!i.managed).length} 份${result.errors?.length ? ` · ${result.errors.length} 份扫描失败` : ''}`;
    render();
  }
  function details() {
    const item=items.find(i=>i.id===selected);
    const source=items.find(i=>i.id===(item?.parentId||item?.sourceId));
    $('plName').textContent=item?.name || '选择工程';
    $('plInfo').textContent=item ? `${item.speciesName || '未识别植物'} · ${KIND_LABELS[item.kind]||'待分类'} · V${item.version || 1}\n${BINDING_LABELS[item.binding]||'未核实'}\n${(item.bytes/1048576).toFixed(1)} MB · ${new Date(item.mtimeMs).toLocaleString()}\n${item.userSaved ? '你保存的样板版本' : '来源样板 · 创建副本后调整'}${item.parentId?'\n基于上一版本保存':''}${item.notes?'\n备注：'+item.notes:''}` : '';
    $('plPath').textContent=item?.path || '';
    if(source)$('plInfo').textContent+=`\n来源：${source.name} · V${source.version||1}`;
    $('plWarning').textContent=item?.batch==='ALL_PLANT_SAMPLE_V2' ? '已通过软件重载及三视图检查。部分冠形、疏密仍有调整项，见工程目录的视觉验收记录。' : item?.binding==='new' ? '已引用本轮单元枝；载入后可继续调整和另存。' : '旧工程按原始数据载入。单元枝已入库，不代表旧工程已换用。';
    refreshPreview.disabled=!item||working;$('plOpen').disabled=!item || working; $('plDelete').disabled=!item?.userSaved || working;
    $('plOpen').textContent=item?.userSaved?'打开此版本编辑':tab==='templates'?'从样板创建副本':'打开副本编辑';
    for(const card of $('plGrid').children) {card.setAttribute('aria-pressed',String(card.dataset.id===selected));card.disabled=working;}
  }
  function render() {
    const query=$('plSearch').value.trim().toLowerCase(),sp=$('plSpecies').value,kind=$('plKind').value,binding=$('plBinding').value;
    const registeredSources=new Set(items.filter(i=>i.managed).map(i=>i.sourcePath).filter(Boolean));
    const found=items.filter(i=>(tab==='legacy'?!i.managed:(i.managed||(i.recommended&&!registeredSources.has(i.path))))&&(!sp||(i.species||'UNKNOWN')===sp)&&(!kind||i.kind===kind)&&(!binding||i.binding===binding)&&(!query||`${i.name} ${i.speciesName} ${i.path}`.toLowerCase().includes(query)))
      .sort((a,b)=>Number(!!b.userSaved)-Number(!!a.userSaved)||(a.speciesName||'').localeCompare(b.speciesName||'','zh-CN')||b.version-a.version||b.mtimeMs-a.mtimeMs);
    if(!found.some(i=>i.id===selected))selected=found[0]?.id||'';
    $('plGrid').replaceChildren();
    for(const item of found) {
      const card=document.createElement('button');card.className='pl-card';card.dataset.id=item.id;
      const preview=document.createElement('div');
      const cached=previewCache.get(item.id);
      if(cached&&cached.revision===Math.round(item.mtimeMs||1)){const img=document.createElement('img');img.src=cached.thumbnail;img.alt=item.name+' 预览';img.loading='lazy';preview.append(img);}
      else if(item.previewPath) { const img=document.createElement('img');img.loading='lazy';img.alt=item.name+' 预览';img.src='/api/project-preview?id='+encodeURIComponent(item.id)+'&revision='+encodeURIComponent(item.saveToken||item.mtimeMs||'');preview.textContent='正在读取预览…';preview.style.position='relative';img.style.cssText='position:absolute;inset:0;opacity:0';img.onload=()=>{img.style.opacity='1';preview.replaceChildren(img);};img.onerror=()=>{preview.textContent='预览不可用 · 载入后可另存样板';};preview.append(img); }
      else preview.textContent='尚无预览 · 可载入查看';
      const name=document.createElement('strong');name.textContent=item.name.replace(/[_·]真实样本装配整株/g,'').replaceAll('_',' · ');name.title=item.name;
      const meta=document.createElement('span');meta.textContent=`${item.speciesName||'未识别'} · ${KIND_LABELS[item.kind]||'待分类'} · V${item.version||1}`;
      const status=document.createElement('span');status.className='pl-binding '+item.binding;status.textContent=BINDING_LABELS[item.binding]||'未核实';
      card.append(preview,name,meta,status);card.onclick=()=>{selected=item.id;details();};card.ondblclick=()=>perform(()=>openItem(item));card.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();perform(()=>openItem(item));}};
      $('plGrid').append(card);
    }
    $('plCount').textContent=`${found.length} 份${tab==='templates'?'样板候选 / 自存样板 · 历史工程每种植物显示最新非草稿整株':'历史工程 · 包含旧版本和单枝'}`;
    $('plEmpty').hidden=!!found.length;details();
  }
  async function perform(fn) { if(working)return;working=true;dialog.setAttribute('aria-busy','true');details();$('plSave').disabled=true;$('plScan').disabled=true;try{await fn();}catch(e){$('plStatus').textContent=e.message;api.toast(e.message,true);}finally{working=false;dialog.removeAttribute('aria-busy');$('plSave').disabled=false;$('plScan').disabled=false;details();} }
  async function openItem(item) {
    if(!item)return;
    const choice=await confirm({title:item.userSaved?'打开这个版本？':item.managed?'使用这个树型？':'打开旧工程？',
      name:item.name,detail:`${item.speciesName || '未分类植物'} · ${KIND_LABELS[item.kind] || '工程'} · V${item.version || 1}`,
      message:api.dirty?.()?'当前有未保存修改。保存后打开会先完成保存；直接打开会保留自动恢复副本。':'打开后会切换当前工程。',save:!!api.dirty?.(),
      accept:item.userSaved || !item.managed?'继续打开':'创建副本'});if(!choice)return;
    if(choice==='save'){const visible=dialog.open;if(visible)dialog.close();if(!await api.save({closeOnSuccess:true})){if(visible)dialog.showModal();return false;}if(visible)dialog.showModal();}
    if(api.beforeOpen&&!await api.beforeOpen())return;
    $('plStatus').textContent='正在载入工程与素材…';
    const operation=async progress=>{await progress(0,'读取完整工程数据');
    const original=await request('/api/project-document?id='+encodeURIComponent(item.id));
    const doc=attachSaveContext(editableProjectCopy(original,item.kind,{consume:true}),templateContext(item));
    if(item.userSaved)for(const part of new Set([doc,activeProject(doc)]))part.settings.object_name=item.name;
    await api.load(doc,progress);dialog.close();};
    if(api.openFlow)await api.openFlow(item.name,operation);else await operation(async()=>{});api.toast((item.userSaved?'已打开样板版本：':'已创建可编辑副本：')+item.name);return true;
  }
  async function saveCurrent() {
    dialog.close();await api.save({mode:'NEW',name:$('plSaveName').value.trim()||api.name()});
  }
  for(const id of ['plSearch','plSpecies','plKind','plBinding'])$(id).addEventListener(id==='plSearch'?'input':'change',render);
  function setTab(value){tab=value;$('plTemplates').classList.toggle('accent',tab==='templates');$('plLegacy').classList.toggle('accent',tab==='legacy');dialog.querySelector('h2').textContent=tab==='templates'?'成品树样板库':'旧工程资产浏览器';render();}
  $('plTemplates').onclick=()=>setTab('templates');$('plLegacy').onclick=()=>setTab('legacy');
  $('plOpen').onclick=()=>perform(()=>openItem(items.find(i=>i.id===selected)));
  $('plScan').onclick=()=>perform(async()=>{$('plStatus').textContent='正在扫描本地工程，首次扫描可能需要一些时间…';await request('/api/project-library/scan',{method:'POST'});await refresh();});
  $('plSave').onclick=()=>perform(saveCurrent);
  $('plDelete').onclick=()=>perform(async()=>{const item=items.find(i=>i.id===selected);if(!item?.userSaved||!await confirm({title:'删除这个样板版本？',name:item.name,detail:`自存样板 · V${item.version || 1}`,message:'将从样板库删除这个版本。其他版本和当前编辑副本会保留。',accept:'删除此版本',danger:true}))return;await request('/api/tree-template?id='+encodeURIComponent(item.id),{method:'DELETE'});await refresh();});
  $('plClose').onclick=()=>{if(!working)dialog.close();};dialog.oncancel=e=>{if(working)e.preventDefault();};
  dialog.addEventListener('keydown',e=>e.stopPropagation());dialog.addEventListener('keyup',e=>e.stopPropagation());
  async function open(value='templates',id='') { dialog.showModal();if(id){selected=id;$('plSearch').value='';$('plSpecies').value='';$('plKind').value='';$('plBinding').value='';tab=value;}else setTab(value);$('plSaveName').value=api.name()||'';await perform(async()=>{await refresh();if(id){selected=id;setTab(value);dialog.querySelector(`[data-id="${id}"]`)?.scrollIntoView({block:'nearest'});}}); }
  document.getElementById('openProjectLibrary').onclick=()=>open();
  return {open,refresh,async use(id){if(working)return false;working=true;try{await refresh();const item=items.find(i=>i.id===id);if(!item)throw Error('样板已不存在，请刷新资源列表');return (await openItem(item))===true;}finally{working=false;}} };
}
