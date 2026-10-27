import { buildUnitAssemblySelection, createUnitAssemblyIndex, matchUnitAssemblyRoots } from './unit-assembly-selection.js';

const $ = id => document.getElementById(id);
const roles = ['MATURE', 'MIXED', 'YOUNG'];
const node = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };

// The cards render the real instance selection; their focus is never a second
// selection store. Only the active project and its canonical root IDs matter.
export function createUnitAssemblyUI(api) {
  const panel = node('section', 'unit-assembly-selection'); panel.id = 'unitAssemblySelection';
  panel.setAttribute('aria-label', '单元枝编辑选区');
  const heading = node('div', 'unit-assembly-selection-heading');
  const title = node('strong', '', '单元枝选区'), clear = node('button', '', '清空'); clear.type = 'button'; clear.dataset.assemblySelect = 'clear';
  const showAll=node('button','','显示全部');showAll.type='button';showAll.dataset.assemblyAction='show-all';showAll.onclick=()=>api.showAll?.();
  const actions=node('div','unit-assembly-selection-actions');actions.append(showAll,clear);heading.append(title, actions);
  const summary = node('p', 'unit-assembly-selection-summary'); summary.id = 'unitAssemblySelectionSummary'; summary.setAttribute('aria-live', 'polite');
  const hint = node('small', '', '点卡片选本区这款 · Shift 加选 · Ctrl 切换');
  const reason = node('p','unit-selection-reason'); reason.id='unitAssemblySelectionReason'; reason.setAttribute('role','status');
  const reset = node('button','','清除减选限制'); reset.type='button'; reset.id='unitSelectionResetExclusions';reset.onclick=()=>api.clearUnitExclusions?.();
  panel.append(heading, summary, hint, reason, reset); $('wbAssemblyZones').before(panel);
  let model = null, cache = null, graph = null;
  function state() {
    const a = api.getAuthoring(), branches = api.getUnitBranches?.() || api.getAsset()?.masterBranches || [], instances=api.getUnitInstances?.() || a.branch_instances || [], selection = [...(api.getSelections?.() || [])];
    const mode = api.getTreeEditMode?.() === 'UNIT', scope = $('branchEditScope')?.value || 'DIRECT';
    const targetSelection = [...(api.getUnitTargets?.() || selection)];
    const key = mode + '/' + scope + '/' + selection.join('/') + '>' + targetSelection.join('/');
    if (!cache || cache.a !== a || cache.branches !== branches || cache.instances!==instances || cache.key !== key || cache.library !== api.library()) {
      if(!graph||graph.a!==a||graph.branches!==branches||graph.instances!==instances)
        graph={a,branches,instances,index:createUnitAssemblyIndex(instances,branches)};
      model = buildUnitAssemblySelection({ instances, branches, library:api.library(), selection, targetSelection,
        index:graph.index,
        isVisible:api.isVisible, isUnitMode:mode, scope, arrays:a.branch_arrays || [], includeUnresolved:$('skeletonEditModeBtn')?.getAttribute('aria-pressed')==='true' });
      cache = { a, branches, instances, key, library:api.library() };
    }
    return model;
  }
  function roots(criteria) { cache = null; return matchUnitAssemblyRoots(state(), criteria); }
  async function choose(criteria, event = {}, action = {}) {
    if (!api.isTree() || api.isBusy()) return;
    try { await api.focusAssembly(roots(criteria), { criteria, shift:!!event.shiftKey, ctrl:!!event.ctrlKey, ...action }); }
    catch (error) { api.toast(error.message, true); }
  }
  clear.onclick = () => choose({}, {}, { clear:true });
  function mark(card, entry) {
    card.dataset.selection = entry.state;
    card.classList.toggle('is-focused', entry.selected > 0);
    card.classList.toggle('is-partial', entry.state === 'PARTIAL');
    const indicator = card.querySelector(':scope > .wb-card-selection-mark') || node('span', 'wb-card-selection-mark');
    indicator.textContent=entry.selected ? entry.selected === entry.total ? '✓' : '−' : '';
    indicator.setAttribute('aria-hidden', 'true'); card.append(indicator);
    const count = card.querySelector(':scope > .wb-card-selection-count') || node('small', 'wb-card-selection-count');
    count.textContent=`已选 ${entry.selected} / ${entry.total} 支${entry.locked ? ' · 锁定 '+entry.locked : ''}`;
    count.title = `${entry.name}：已用 ${entry.total} 支，已选 ${entry.selected} 支${entry.blocked ? '；含锁定子件的家族跳过整体调整' : ''}`;
    card.append(count);
    const image = card.querySelector('img,.wb-assembly-placeholder'), name = card.querySelector('.wb-assembly-name');
    const source=api.library().find(item=>item.id===entry.asset_id);
    const version=entry.revisions?.length===1?source?.versions?.find(v=>v.revision===entry.revisions[0]):null;
    if(image?.tagName==='IMG'&&version?.thumbnail)image.src=version.thumbnail;
    const criteria = entry.legacyPlacement ? {role:'LEGACY',instanceIds:entry.instances.map(i=>i.id)}
      : { assetId:entry.asset_id, ...(entry.role === 'EXTRA' ? { extra:true } : { role:entry.role }), ...(!entry.asset_id ? {instanceIds:entry.instances.map(i=>i.id)} : {}) };
    for (const target of [image, name]) if (target) {
      target.onclick = event => choose(criteria, event);
      target.ondblclick = event => event.preventDefault();
      target.tabIndex = 0; target.setAttribute('role', 'checkbox');
      target.setAttribute('aria-checked', entry.selected ? entry.selected === entry.total ? 'true' : 'mixed' : 'false');
      target.setAttribute('aria-label', `${entry.name}，已选 ${entry.selected} / ${entry.total} 支，点击选择本分区`);
      target.title = entry.legacyPlacement ? '选择这支旧完整复制件 · 保留原造型，C 整支笔刷调整 · Shift 加选 · Ctrl 切换' : '选择本分区这款完整单元枝 · Shift 加选 · Ctrl 切换';
      if(target===image)target.title+=entry.embedded?'；独立副本，图片为源素材参考':entry.revisions?.length>1?'；本区使用多个源版本，图片为源素材参考':version&&!version.thumbnail?'；旧版本无独立预览，图片为源素材参考':'';
      target.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(criteria, event); } };
    }
    card.onpointerenter = () => api.hoverAssembly?.(matchUnitAssemblyRoots(state(), criteria));
    card.onpointerleave = () => api.hoverAssembly?.([]);
    const actions = card.querySelector('.wb-card-actions') || node('div', 'wb-card-actions');
    if (!actions.parentElement) card.append(actions);
    const old = [...actions.children];
    const replace = old.find(e => e.textContent === '替换'), update = old.find(e => e.textContent === '更新');
    actions.replaceChildren();
    const button = (label, run, key) => { const b = node('button', '', label); b.type = 'button'; if (key) b.dataset.assemblyAction = key; b.onclick = run; return b; };
    actions.append(button('定位', e => choose(criteria, e, { locate:true }), 'locate'), button('隔离', e => choose(criteria, e, { isolate:true, locate:true }), 'isolate'));
    const menu = node('details', 'wb-card-menu'), toggle = node('summary', '', '更多'); toggle.title = '跨分区选择、编辑源与素材操作'; menu.append(toggle);
    const content = node('div', 'wb-card-menu-content');
    if(!entry.legacyPlacement){
      if(entry.asset_id)content.append(button('选全树同款', e => { menu.open = false; choose({ assetId:entry.asset_id, allSame:true }, e); }, 'same'));
      content.append(button('编辑源单元枝', () => { menu.open = false; api.editSource(entry.asset_id, entry.role, entry.instances[0]?.id); }, 'source'));
      for (const b of [replace, update]) if (b) content.append(b);
      menu.append(content); actions.append(menu);
    }
  }
  function extraCards(extra) {
    const previous=$('wbAssemblyZones').querySelector(':scope > [data-assembly-role="EXTRA"]'),wasOpen=previous?.open;previous?.remove();
    if (!extra.total) return;
    const section = node('details', 'wb-assembly-extra'); section.dataset.assemblyRole = 'EXTRA';
    const toggle = node('summary', '', `独立 / 未分区 · ${extra.total} 支${extra.selected ? ' · 已选 '+extra.selected : ''}`); section.append(toggle);
    section.open = extra.selected > 0 || Boolean(wasOpen);
    const row = node('div', 'wb-assembly-zone'); row.dataset.assemblyRole = 'EXTRA';
    const pick = node('button', 'wb-zone-select', '选这些'); pick.type = 'button'; pick.dataset.assemblySelect = 'EXTRA'; pick.onclick = e => choose({ extra:true }, e); row.append(pick);
    for (const entry of extra.cards) {
      const card = node('div', 'wb-assembly-card'); card.dataset.assemblyAsset = entry.asset_id;
      const source = api.library().find(item => item.id === entry.asset_id);
      if (source?.thumbnail) { const image = node('img'); image.src = source.thumbnail; image.alt = entry.name; card.append(image); }
      else card.append(node('div', 'wb-assembly-placeholder', '完整单元枝'));
      const name = node('span', 'wb-assembly-name'); name.append(node('span', 'wb-assembly-title', entry.name), node('small', '', `已用 ${entry.total} 枝 · ${entry.revisions?.length ? 'V'+entry.revisions.join('/') : '内嵌模型'}`)); card.append(name);
      mark(card, { ...entry, role:'EXTRA' }); row.append(card);
    }
    section.append(row); $('wbAssemblyZones').append(section);
  }
  function legacyCards(legacy) {
    const previous=$('wbAssemblyZones').querySelector(':scope > [data-assembly-role="LEGACY"]'),wasOpen=previous?.open;previous?.remove();
    if(!legacy?.total)return;
    const section=node('details','wb-assembly-extra');section.dataset.assemblyRole='LEGACY';
    section.append(node('summary','',`兼容旧副本 · ${legacy.total} 支${legacy.selected?` · 已选 ${legacy.selected}`:''}`));section.open=legacy.selected>0||Boolean(wasOpen);
    const row=node('div','wb-assembly-zone');row.dataset.assemblyRole='LEGACY';
    const pick=node('button','wb-zone-select','选择旧副本');pick.type='button';pick.dataset.assemblySelect='LEGACY';pick.onclick=e=>choose({role:'LEGACY'},e);row.append(pick);
    row.append(node('small','','保留复制时的完整造型。C 笔刷整支调整，不替换为当前素材版本。'));
    const entries=[...legacy.cards].sort((a,b)=>b.selected-a.selected).slice(0,24);
    for(const entry of entries){
      const card=node('div','wb-assembly-card');card.dataset.assemblyAsset=entry.asset_id;card.dataset.legacyInstance=entry.instances[0]?.id||'';
      const source=api.library().find(item=>item.id===entry.asset_id);
      if(source?.thumbnail){const image=node('img');image.src=source.thumbnail;image.alt=entry.name;image.title='源素材参考图；实际旧副本保留复制时的造型';card.append(image);}else card.append(node('div','wb-assembly-placeholder','旧完整副本'));
      const name=node('span','wb-assembly-name');name.append(node('span','wb-assembly-title',entry.name),node('small','',entry.instances[0]?.legacyRootId||entry.instances[0]?.id||''));card.append(name);mark(card,entry);row.append(card);
    }
    if(legacy.cards.length>entries.length)row.append(node('small','',`优先显示已选及前 ${entries.length} 支；其余 ${legacy.cards.length-entries.length} 支可在视口框选。`));
    section.append(row);$('wbAssemblyZones').append(section);
  }
  function refresh() {
    const tree = api.isTree(); panel.hidden = !tree;
    if (!tree) { api.hoverAssembly?.([]); cache = null; return; }
    // Isolation may change without authoring changing, so membership is rebuilt
    // on explicit UI refresh, never inside the brush's per-frame loop.
    cache = null; const current = state();
    const s = current.summary;
    // Historical complete copies are not registry instances or new source
    // classes. Show their independent installed count beside both entries.
    const oldCount=current.legacy?.total||0,suffix=oldCount?` · 旧副本 ${oldCount} 个`:'';
    const installed=current.instances.filter(i=>!i.legacyPlacement);
    const models=new Set(installed.map(i=>`${i.asset_id||i.id}@${i.pinned_revision||api.library().find(a=>a.id===i.asset_id)?.revision||1}`));
    if($('branchAssemblyCount'))$('branchAssemblyCount').textContent=`${models.size} 类 / ${installed.length} 个`+suffix;
    if($('wbAssemblyCurrent'))$('wbAssemblyCurrent').textContent=String(installed.length)+suffix;
    if($('openBranchAssembly'))$('openBranchAssembly').title='当前植物已安装的单元枝数量；打开独立单元枝页选择素材与配置装配'+(oldCount?`。另含 ${oldCount} 个旧完整副本，保持保存的造型与来源。`:'');
    showAll.hidden=!api.isIsolated?.();
    summary.textContent = api.getTreeEditMode?.() === 'UNIT' ? s.text : '先点装配卡片，选择要调整的完整单元枝';
    summary.title = s.text;
    reason.hidden=api.getTreeEditMode?.()!=='UNIT'||!s.reason;
    reason.textContent=s.reason;
    reset.hidden=api.getTreeEditMode?.()!=='UNIT'||!api.getSelectionExclusions?.()?.size;
    clear.disabled = !s.selected && $('branchEditScope')?.value !== 'ALL';
    for (const role of roles) {
      const row = [...$('wbAssemblyZones').children].find(e => e.dataset.assemblyRole === role); if (!row) continue;
      const zone = current.zones[role];
      row.dataset.count=String(zone.total);
      const heading = row.querySelector(':scope > strong');
      if (heading) {
        const label = node('span', '', `${zone.label} · ${zone.total} 枝`);
        const select = node('button', 'wb-zone-select', '选本区'); select.type = 'button'; select.dataset.assemblySelect = role;
        select.disabled = !zone.total; select.onclick = event => choose({ role }, event);
        heading.replaceChildren(label, select);
      }
      for (const card of row.querySelectorAll('.wb-assembly-card')) {
        const entry = zone.cards.find(e => e.asset_id === card.dataset.assemblyAsset) || {asset_id:card.dataset.assemblyAsset,name:card.querySelector('.wb-assembly-title')?.textContent||'单元枝',instances:[],total:0,selected:0,locked:0,blocked:0,state:'NONE'};
        const used=card.querySelector('.wb-assembly-name small');if(used)used.textContent=used.textContent.replace(/^已用 \d+ 枝/,`已用 ${entry.total} 枝`);
        mark(card, { ...entry, role });
      }
    }
    extraCards(current.extra);
    legacyCards(current.legacy);
  }
  return { refresh, roots, get state() { return state(); }, reset() { cache = null; api.hoverAssembly?.([]); } };
}
