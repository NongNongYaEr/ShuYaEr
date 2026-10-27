import { createAppConfirm } from './app-confirm.js';
import { TREE_SPECIES } from './tree-species-library.js';

const roles = { MATURE: '深绿', MIXED: '混合', YOUNG: '嫩绿', OTHER: '未分类' };
const extraPlants = { IVY: '常春藤', BOUGAINVILLEA: '三角梅', SCENE_BROADLEAF: '阔叶草本（种未定）', SCENE_FLOWER: '黄花草本（种未定）', SCENE_GRASS: '禾草（种未定）' };
function describe(item) {
  const tags = item.sample?.authoring?.recipe?.tags || item.tags || [];
  const species = tags.find(t => TREE_SPECIES[t] || extraPlants[t]) || Object.keys(TREE_SPECIES).find(k => item.name.includes(TREE_SPECIES[k].name)) || '';
  const role = tags.find(t => ['MATURE','MIXED','YOUNG'].includes(t)) || (item.name.includes('深绿') ? 'MATURE' : item.name.includes('混合') ? 'MIXED' : /嫩绿|红嫩叶|金黄嫩叶/.test(item.name) ? 'YOUNG' : 'OTHER');
  return { species, speciesName: TREE_SPECIES[species]?.name || extraPlants[species] || '未分类植物', role };
}

export function createBranchLibraryManager(api) {
  const dialog = document.createElement('dialog'); dialog.id = 'branchLibraryDialog';
  dialog.setAttribute('aria-labelledby', 'blmTitle');
  dialog.innerHTML = `<header><div><h2 id="blmTitle">单元枝素材库</h2><p>查阅单元枝，双击卡片进入枝条工作台编辑。</p></div><button id="blmClose" aria-label="关闭单元枝库">关闭</button></header>
    <div class="blm-toolbar"><input id="blmSearch" type="search" placeholder="搜索名称或植物" aria-label="搜索单元枝"><select id="blmSpecies" aria-label="按植物筛选"></select><select id="blmRole" aria-label="按配色筛选"><option value="">全部配色</option>${Object.entries(roles).map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select><select id="blmSort" aria-label="排序"><option value="NAME">名称排序</option><option value="REVISION">版本从高到低</option></select><button id="blmImport">导入单元枝文件</button><button id="blmNew" class="accent">＋ 新建单元枝</button></div>
    <div class="blm-body"><section class="blm-results"><p id="blmCount" aria-live="polite"></p><div id="blmGrid"></div><p id="blmEmpty" hidden>没有匹配的单元枝。可以清除筛选、导入单元枝文件，或新建单元枝后保存素材。</p></section><aside><div id="blmPreview"></div><h3 id="blmName">选择一款单元枝</h3><p id="blmDetails"></p><label>名称<input id="blmRename" maxlength="80"></label><button id="blmRenameApply">保存名称</button><button id="blmEdit" class="accent">打开编辑</button><button id="blmExport">导出单元枝文件</button><button id="blmDelete" class="danger">删除单元枝</button><p class="blm-note">删除会移出单元枝库；原始导入文件保留。当前工程已安装的枝条保留为副本。</p></aside></div>
    <footer><span id="blmStorage"></span><button id="blmPersist">将工程素材存入库</button></footer><p id="blmStatus" role="status"></p>`;
  dialog.classList.add('library-polished');document.body.append(dialog);
  const confirmAction=createAppConfirm('branchLibraryConfirm');
  const $ = id => dialog.querySelector('#'+id);
  const collection=document.createElement('select');collection.id='blmCollection';collection.setAttribute('aria-label','收藏与最近使用');collection.innerHTML='<option value="ALL">全部素材</option><option value="FAVORITES">我的收藏</option><option value="RECENT">最近使用</option>';$('blmSort').before(collection);
  const recentOption=new Option('最近使用优先','RECENT');$('blmSort').append(recentOption);
  const organization=document.createElement('div');organization.className='blm-organization';organization.innerHTML='<button id="blmFavorite" type="button">☆ 收藏</button><label>用途标签<input id="blmUserTags" placeholder="如：街道、树冠、疏枝；逗号分隔" maxlength="300"></label><button id="blmSaveTags">保存标签</button><details id="blmDependencies"><summary>素材与工程引用</summary><button id="blmCheckDependencies">检查引用与素材</button><p id="blmDependencyStatus" role="status"></p><div id="blmDependencyList"></div></details>';$('blmDetails').after(organization);
  const use = document.createElement('button'); use.id = 'blmUseAssembly'; use.type = 'button';
  use.textContent = '选作当前树的装配素材'; use.className = 'accent';
  $('blmEdit').before(use);
  const refreshImage=document.createElement('button');refreshImage.id='blmRefreshThumbnail';refreshImage.type='button';refreshImage.textContent='刷新所选缩略图';refreshImage.title='重新渲染所选成品的真实枝叶花果；保留正式库文件与树形';$('blmExport').before(refreshImage);refreshImage.onclick=()=>perform(()=>api.refreshThumbnail(selected));
  let selected = '', working = false, lastSignature = '', picker = false;
  let lastThumbnails = new Map();
  const dragType = 'application/x-branchforge-catalog';
  const hint = document.createElement('p'); hint.className = 'blm-picker-hint';
  hint.textContent = '← 拖到左侧「当前工程」列表，或选中后点击「加入当前工程」。加入后再拖往右侧分区装配。';
  dialog.querySelector('.blm-toolbar').before(hint);
  function stopDrag() { document.body.classList.remove('catalog-dragging'); document.getElementById('wbAssetLibrary')?.classList.remove('catalog-over'); }
  function positionPicker() {
    if (!picker || !dialog.open) return;
    const edge = document.querySelector('.parameter-panel')?.getBoundingClientRect().right || 320;
    dialog.style.setProperty('--picker-left', `${Math.min(edge + 14, innerWidth - 340)}px`);
  }
  window.addEventListener('resize', positionPicker);
  dialog.addEventListener('close', () => { stopDrag(); document.body.classList.remove('branch-picker-open'); });
  function image(item, parent) {
    parent.replaceChildren();
    if(item?.thumbnail) { const img=document.createElement('img');img.src=item.thumbnail;img.alt=item.name;img.loading='lazy';parent.append(img); }
    else { const empty=document.createElement('span');empty.className='blm-placeholder';empty.textContent=item?'暂无预览':'单元枝预览';parent.append(empty); }
  }
  function details() {
    const item=api.library().find(a=>a.id===selected); image(item,$('blmPreview'));
    use.hidden = !picker && !api.canUse?.(); use.disabled = working || !item || !api.canUse?.() || (picker && api.contains?.(selected));
    use.textContent = picker ? (api.contains?.(selected) ? '已在当前工程' : '＋ 加入当前工程') : '选作当前树的装配素材';
    $('blmName').textContent=item?.name||'选择一款单元枝';
    $('blmRename').value=item?.name||'';
    const organization=api.organizer?.get(selected)||{};$('blmFavorite').textContent=organization.favorite?'★ 已收藏':'☆ 收藏';$('blmFavorite').setAttribute('aria-pressed',String(!!organization.favorite));$('blmFavorite').disabled=working||!item;$('blmUserTags').value=(organization.tags||[]).join(', ');$('blmSaveTags').disabled=working||!item;$('blmCheckDependencies').disabled=working||!item;
    if($('blmDependencies').dataset.asset!==selected){$('blmDependencies').dataset.asset=selected;$('blmDependencyList').replaceChildren();$('blmDependencyStatus').textContent='当前工程实时检查；已保存引用仅检查登记库。外部独立文件不扫描。';}
    $('blmDetails').textContent=item?`${describe(item).speciesName} · ${roles[describe(item).role]} · v${item.revision}\n${item.shape?.branches?.length??item.branches??0} 段枝 · ${item.sample?.leaf_meshes?.length??item.leafCount??0} 款叶单元 · ${item.sample?.authoring?.tree_organs?.units?.length??item.organCount??0} 款花果单元`:'';
    for(const id of ['blmRename','blmRenameApply','blmEdit','blmExport','blmDelete','blmRefreshThumbnail']) $(id).disabled=working||!item;
    for(const card of $('blmGrid').children) card.setAttribute('aria-pressed',String(card.dataset.id===selected));
  }
  function refresh(force=false) {
    if(!dialog.open)return;
    const library=api.library();
    const signature=JSON.stringify([api.canUse?.(), library.map(a=>[a.id,a.name,a.revision,api.contains?.(a.id),api.organizer?.get(a.id)])]);
    if(!force&&signature===lastSignature&&library.every(a=>lastThumbnails.get(a.id)===a.thumbnail))return;
    lastSignature=signature;lastThumbnails=new Map(library.map(a=>[a.id,a.thumbnail]));
    const previous=$('blmSpecies').value, species=new Map();
    for(const item of library){const d=describe(item);species.set(d.species,d.speciesName);}
    $('blmSpecies').replaceChildren(new Option('全部植物','*'),...Array.from(species).sort((a,b)=>a[1].localeCompare(b[1],'zh-CN')).map(([k,n])=>new Option(n,k)));
    $('blmSpecies').value=previous==='*'||species.has(previous)?previous:'*';
    const query=$('blmSearch').value.trim().toLowerCase();
    const filtered=library.filter(item=>{const d=describe(item),user=api.organizer?.get(item.id)||{};return (collection.value==='ALL'||collection.value==='FAVORITES'&&user.favorite||collection.value==='RECENT'&&user.lastUsed>0)&&(!query||(item.name+' '+d.speciesName+' '+(user.tags||[]).join(' ')).toLowerCase().includes(query))&&($('blmSpecies').value==='*'||d.species===$('blmSpecies').value)&&(!$('blmRole').value||d.role===$('blmRole').value);});
    filtered.sort((a,b)=>$('blmSort').value==='RECENT'?(api.organizer?.get(b.id).lastUsed||0)-(api.organizer?.get(a.id).lastUsed||0)||a.name.localeCompare(b.name,'zh-CN'):$('blmSort').value==='REVISION'?b.revision-a.revision||a.name.localeCompare(b.name,'zh-CN'):a.name.localeCompare(b.name,'zh-CN'));
    if(!filtered.some(a=>a.id===selected))selected=filtered[0]?.id||'';
    const grid=$('blmGrid');grid.replaceChildren();
    for(const item of filtered){
      const card=document.createElement('button');card.className='blm-card';card.dataset.id=item.id;card.type='button';
      const preview=document.createElement('div');image(item,preview);const name=document.createElement('strong');name.textContent=item.name.replace(/[_·]成品V\d+$/,'').replaceAll('_',' · ');name.title=item.name;
      const meta=document.createElement('span');const d=describe(item),organization=api.organizer?.get(item.id)||{};meta.textContent=`${organization.favorite?'★ ':''}${d.speciesName} · ${roles[d.role]} · v${item.revision}`;meta.title=(organization.tags||[]).join(' · ');
      if(picker && api.contains?.(item.id)){const badge=document.createElement('span');badge.className='blm-in-project';badge.textContent='已加入';preview.append(badge);}
      card.draggable = picker && !!api.canUse?.() && !working;
      card.ondragstart=e=>{selected=item.id;e.dataTransfer.setData(dragType,item.id);e.dataTransfer.effectAllowed='copy';document.body.classList.add('catalog-dragging');};
      card.ondragend=stopDrag;
      card.append(preview,name,meta);card.onclick=()=>{selected=item.id;details();};card.ondblclick=()=>picker?add(item.id):perform(()=>edit(item));
      card.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();picker?add(item.id):perform(()=>edit(item));}};grid.append(card);
    }
    $('blmCount').textContent=`显示 ${filtered.length} / ${library.length} 款成品`;
    $('blmEmpty').hidden=!!filtered.length;
    $('blmStorage').textContent=api.storage()==='disk'?'电脑共享成品库 · 当前工程素材也显示在此':'当前浏览器成品库 · 当前工程素材也显示在此';
    details();
  }
  async function perform(fn){if(working)return;working=true;dialog.setAttribute('aria-busy','true');$('blmStatus').textContent='正在处理…';try{await fn();$('blmStatus').textContent='已完成';}catch(e){$('blmStatus').textContent=e.message;}finally{working=false;dialog.removeAttribute('aria-busy');refresh(true);}}
  async function edit(item){await api.edit(item.id);await api.organizer?.use(item.id);dialog.close();}
  async function add(id){return perform(async()=>{await api.use(id);if(!picker)dialog.close();});}
  for(const id of ['blmSearch','blmSpecies','blmRole','blmSort','blmCollection'])$(id).addEventListener(id==='blmSearch'?'input':'change',()=>refresh(true));
  $('blmFavorite').onclick=()=>perform(()=>api.organizer.update(selected,{favorite:!api.organizer.get(selected).favorite}));
  $('blmSaveTags').onclick=()=>perform(()=>api.organizer.update(selected,{tags:$('blmUserTags').value.split(/[,，、;；]/)}));
  $('blmCheckDependencies').onclick=()=>perform(async()=>{const id=selected;$('blmDependencies').open=true;$('blmDependencyStatus').textContent='正在检查实际保存工程…';const {item,workspaces}=await api.inspectAsset(id),saved=await api.organizer.dependencies(id);if(id!==selected)return;const lines=[];for(const space of workspaces)lines.push(`当前 ${space.workspace}：${space.count} 实例 · 固定版本 ${space.revisions.map(v=>'V'+v).join('/')}`);const sample=item?.sample;lines.push('叶片单元：'+((sample?.leaf_meshes||[]).map(l=>l.name||l.id).join('、')||'无独立叶片单元'));lines.push('花果单元：'+((sample?.authoring?.tree_organs?.units||[]).map(l=>l.name||l.id).join('、')||'无'));lines.push('材质：'+(sample?.authoring?.leaf_material?.color?'样本自带贴图/材质':sample?.material_asset_id?'共享于 '+sample.material_asset_id:'工程材质/程序色'));for(const ref of saved.items||[])for(const space of ref.workspaces)lines.push(`${ref.kind||'工程'} ${ref.name}${ref.version?' · V'+ref.version:''}：${space.count} 实例 · ${(space.revisions||[]).map(v=>'V'+v).join('/')||'素材已收录'}`);$('blmDependencyList').textContent=lines.join('\n');$('blmDependencyStatus').textContent=`找到 ${saved.items.length} 份已保存引用。${saved.scope}${saved.errors?.length?'；'+saved.errors.length+' 份文件未能读取，请检查后重试':''}。更新当前工程不会自动改写这些已保存副本。`;});
  $('blmClose').onclick=()=>{if(!working)dialog.close();};dialog.oncancel=e=>{if(working)e.preventDefault();};
  $('blmEdit').onclick=()=>perform(()=>edit(api.library().find(a=>a.id===selected)));
  use.onclick=()=>add(selected);
  $('blmNew').onclick=()=>perform(async()=>{if(await api.create()!==false)dialog.close();});
  $('blmImport').onclick=()=>api.import();
  $('blmExport').onclick=()=>perform(()=>api.export(selected));
  $('blmRenameApply').onclick=()=>perform(()=>api.rename(selected,$('blmRename').value));
  $('blmDelete').onclick=()=>perform(async()=>{const item=api.library().find(a=>a.id===selected);if(item&&await confirmAction({title:'删除这个成品？',name:item.name,message:'原始文件保留，当前工程已安装的枝条保留为副本。',accept:'删除成品',danger:true}))await api.remove(selected);});
  $('blmPersist').onclick=()=>perform(()=>api.persist());
  // Keep typing and Delete/undo shortcuts inside the manager, away from the model.
  dialog.addEventListener('keydown',e=>{e.stopPropagation();if(picker&&e.key==='Escape'){e.preventDefault();if(!working)dialog.close();}});
  return {refresh,create:()=>api.create(),add:id=>api.use(id),edit:id=>edit({id}),closePicker(){if(picker&&dialog.open)dialog.close();},notify(message){$('blmStatus').textContent=message;},open(options={}){
    if(dialog.open)dialog.close();picker=!!options.picker;dialog.classList.toggle('blm-picker',picker);
    $('blmTitle').textContent=picker?'添加单元枝':'单元枝素材库';
    if(picker){dialog.show();document.body.classList.add('branch-picker-open');positionPicker();}else dialog.showModal();
    $('blmStatus').textContent='';refresh(true);$('blmSearch').focus();
  },get isOpen(){return dialog.open;}};
}
