import { copy } from './branch-workbench-data.js';
import { normalizeBranchArrays } from './branch-array-data.js';
import { planAssemblyGroup, structureGroupState, structureGroupCarrier, removeStructureMember, deleteStructureGroup } from './assembly-group-data.js';
import { reframeInstanceEdits } from './branch-instance-edit.js';
import { resolveInstanceShape } from './branch-workbench-data.js';
import { skeletonBranches } from './skeleton-thickness.js';
import { resetBranchInstanceEdits } from './branch-instance-operations.js';

const dragType = 'application/x-branchforge-asset';
const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
const button = (text, handler, title = text) => { const node = element('button', text); node.type = 'button'; node.title = title; node.onclick = handler; return node; };

// The tree owns the document transaction. No second scene or materialized clone
// is made for these controls: complete samples keep the existing GPU preview.
export function createAssemblyGroupControls(api, mount = null) {
  if (!document.querySelector('link[data-assembly-groups]')) {
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/assembly-group-controls.css'; link.dataset.assemblyGroups = ''; document.head.append(link);
  }
  const panel = element('section', undefined, 'assembly-groups wb-tree-only'); panel.id = 'structureAssemblyGroups'; panel.setAttribute('aria-label', '结构枝组');
  const heading = element('div', undefined, 'assembly-groups-heading'); heading.append(element('h3', '结构枝组'), button('＋ 新建', () => addGroup(), '用所选承重枝或主干建立结构枝组'));
  const hint = element('p', '完整大枝挂到主干或承重枝。拖入素材配置，自动成员随组调整，手工枝与锁定枝保留。', 'vine-note');
  const list = element('div', undefined, 'assembly-group-list'); list.id = 'structureGroupList';
  const empty = button('从左侧拖入单元枝 · 建立结构枝组', () => addGroup()); empty.className = 'assembly-group-drop'; empty.id = 'structureGroupDrop';
  const editor = element('div', undefined, 'assembly-group-editor'); editor.id = 'structureGroupEditor'; editor.hidden = true;
  editor.innerHTML = `<label>组名<input id="sgName" maxlength="64"></label><div class="assembly-group-pair"><label>母枝<select id="sgParent"></select></label><label>主要素材<select id="sgAsset"></select></label></div>
    <div class="assembly-group-pair"><label>分布<select id="sgDistribution"><option value="COUNT">按层数</option><option value="SPACING">按间距</option></select></label><label>排列<select id="sgArrangement"><option value="ALTERNATE">交替</option><option value="PAIR">成对</option><option value="RING">轮生</option></select></label></div>
    <div class="assembly-group-pair"><label>层数<input id="sgCount" type="number" min="1" max="32" step="1"></label><label>层间距（m）<input id="sgSpacing" type="number" min="0.01" max="10" step="0.05"></label></div>
    <div class="assembly-group-pair"><label>每层支数<input id="sgRingCount" type="number" min="2" max="8" step="1"></label><label>隔层错角（°）<input id="sgLayerOffset" type="number" min="-180" max="180" step="1"></label></div>
    <div class="assembly-group-pair"><label>起点（%）<input id="sgStart" type="number" min="2" max="97" step="1"><input id="sgStartRange" type="range" min="2" max="97" step="1" aria-label="结构枝组起点"></label><label>终点（%）<input id="sgEnd" type="number" min="3" max="98" step="1"><input id="sgEndRange" type="range" min="3" max="98" step="1" aria-label="结构枝组终点"></label></div>
    <div class="assembly-group-pair"><label>单元枝倍率<input id="sgScale" type="number" min="0.05" max="5" step="0.05"><input id="sgScaleRange" type="range" min="0.05" max="5" step="0.05" aria-label="结构枝完整倍率"></label><label>展开角（°）<input id="sgAngle" type="number" min="0" max="180" step="1"><input id="sgAngleRange" type="range" min="0" max="180" step="1" aria-label="结构枝展开角"></label></div>
    <details><summary>自然错落与上下变化</summary><div class="assembly-group-pair"><label>起始绕干角（°）<input id="sgAzimuth" type="number" min="-180" max="180" step="1"></label><label>尺寸差异<input id="sgVariation" type="number" min="0" max="0.5" step="0.01"></label></div><div class="assembly-group-pair"><label>下方大小倍率<input id="sgProfileRoot" type="number" min="0.05" max="2" step="0.05"></label><label>上方大小倍率<input id="sgProfileTip" type="number" min="0.05" max="2" step="0.05"></label></div></details>
    <div id="sgPalette" class="assembly-group-palette" aria-label="结构枝组素材"></div><button type="button" id="sgAddSelected" class="assembly-group-drop">＋ 加入左侧选中素材 · 可直接拖入</button>
    <p id="sgStatus" role="status" class="vine-note"></p><div class="assembly-group-actions"><button type="button" id="sgReroll">重排自动枝</button><button type="button" id="sgFill">补齐缺口</button><button type="button" id="sgSelect">选中本组</button><button type="button" id="sgAdvanced">更多排列设置</button></div>
    <details><summary>成员与手工保护</summary><label>当前成员<select id="sgMember"></select></label><div class="assembly-group-actions"><button type="button" id="sgMemberLock">锁定</button><button type="button" id="sgMemberDetach">转为手工枝</button><button type="button" id="sgMemberDelete">删除并留空</button><button type="button" id="sgMemberAuto">恢复自动</button></div><button type="button" id="sgRestoreAuto">恢复未锁定成员自动布置</button><p class="vine-note">恢复自动会清除该支的局部枝形修改，再按本组配方布置；素材库保持原版本。转为手工枝则离开本组，原位置留空。</p><button type="button" id="sgDeleteGroup">删除本组及其成员</button></details>`;
  panel.append(heading, hint, list, empty, editor);
  (mount || document.getElementById('wbAssemblyZones')?.closest('.wb-assembly') || document.querySelector('.inspector-scroll')).append(panel);
  const $ = id => panel.querySelector('#' + id);
  const fields = { sgName: 'name', sgParent: 'parent', sgAsset: 'asset_id', sgDistribution: 'distribution', sgArrangement: 'arrangement', sgCount: 'count', sgSpacing: 'spacing', sgRingCount: 'ringCount', sgLayerOffset: 'layerOffset', sgStart: 'start', sgEnd: 'end', sgScale: 'scale', sgAngle: 'angle', sgAzimuth: 'azimuth', sgVariation: 'variation' };
  const rangePairs = { sgStartRange: 'sgStart', sgEndRange: 'sgEnd', sgScaleRange: 'sgScale', sgAngleRange: 'sgAngle' };
  let selected = '', gesture = null, timer = null, revision = '', cancelling = false, loadingAssets = false;
  const usable = () => !loadingAssets && api.isTree() && !api.getSkeletonEditMode() && !api.isBusy?.() && api.getAsset() && !api.getAsset().group.userData.pending_rebuild;
  const groups = () => api.getAuthoring().branch_arrays;
  const current = () => gesture?.group || groups().find(group => group.id === selected);
  const report = message => { $('sgStatus').textContent = message; };
  function assign(next, source) { for (const key of ['branch_arrays','branch_instances','overrides','sculpt_layers','recipe','tree_organs','manual_branches','topology','leaf_edits','unit_editing','workbench']) { if (source[key] !== undefined) next[key] = source[key]; else delete next[key]; } }
  function announce() { document.dispatchEvent(new Event('tree-assembly-refreshed')); }
  function selectGroup(id) {
    if (!usable()) return;
    if (gesture) commit(); selected = id; revision = ''; refresh();
    const instanceIds = new Set(api.getAuthoring().branch_instances.filter(instance => instance.array_id === id).map(instance => instance.id));
    const branches = api.getAsset()?.masterBranches || [], byId = new Map(branches.map(branch => [branch.id, branch]));
    const roots = branches.filter(branch => instanceIds.has(branch.instanceId) && byId.get(branch.parentId)?.instanceId !== branch.instanceId).map(branch => branch.stableId);
    if (roots.length) api.setSelections?.(roots);
  }
  function previewNow() {
    clearTimeout(timer); timer = null; if (!gesture) return false;
    try {
      const result = planAssemblyGroup(gesture.authoring, gesture.branches, gesture.group, api.library(), gesture.options);
      for (const next of result.records) {
        const before = gesture.authoring.branch_instances.find(record => record.id === next.id);
        if (!before || before.asset_id !== next.asset_id || JSON.stringify(before) === JSON.stringify(next)) continue;
        if (!gesture.options.forceAutomatic?.includes(next.id)) reframeInstanceEdits(result.authoring, before, next, resolveInstanceShape(before, api.library()), gesture.branches, api.getSettings(), gesture.branches);
      }
      api.preview(next => assign(next, result.authoring)); gesture.result = result; gesture.valid = true;
      report(`${result.records.length} 支单元枝 · 保留 ${result.protectedCount} 支手工或锁定枝 · 木质枝段 ${result.woodCost} / ${result.woodLimit}。调节自动生效，松手记一次撤销，Esc 取消。`);
      return true;
    } catch (error) { gesture.valid = false; report(error.message); return false; }
  }
  function begin() {
    if (gesture) return true;
    if (!usable() || api.isEditing?.()) return false;
    const group = current(); if (!group) return false;
    gesture = { group: copy(group), authoring: copy(api.getAuthoring()), branches: api.getAsset().masterBranches, options: {}, valid: true, result: null };
    api.begin(); return true;
  }
  function preview() { clearTimeout(timer); timer = setTimeout(previewNow, 70); }
  function commit() {
    if (!gesture) return false;
    if (!previewNow()) return cancel();
    const result = gesture.result; gesture = null; api.commit(); revision = ''; refresh(); announce();
    if (result.records.length > result.expected) report(`本组现有 ${result.records.length} 支，含超出新配方范围的手工或锁定成员；这些枝保留原位置。`);
    return true;
  }
  function cancel() {
    if (!gesture) return false;
    clearTimeout(timer); timer = null; gesture = null; cancelling = true; api.cancel(); cancelling = false; revision = ''; refresh(); return true;
  }
  function immediate(patch, options = {}) {
    if (gesture) commit(); if (!begin()) return false;
    Object.assign(gesture.group, patch); gesture.options = options;
    if (options.forceAutomatic?.length) {
      gesture.group.locked = gesture.group.locked.filter(id => !options.forceAutomatic.includes(id));
      resetBranchInstanceEdits(gesture.authoring, options.forceAutomatic);
    }
    return commit();
  }
  async function addGroup(assetId = '') {
    if (gesture) commit(); if (!usable() || api.isEditing?.()) return;
    try {
      const source = api.library().find(item => item.id === assetId) || api.selectedAsset?.() || api.library()[0];
      if (!source) return api.toast('先从左侧添加一款单元枝，再建立结构枝组');
      loadingAssets = true; revision = ''; refresh();
      await api.ensureAssets?.([source.id]);
      loadingAssets = false;
      if (!usable()) return;
      const carrier = structureGroupCarrier(api.getAsset().masterBranches, api.getSelection());
      if (!carrier) throw Error('当前没有可用承重枝，请先建立主干');
      const group = normalizeBranchArrays([{ id: 'ARRAY_' + crypto.randomUUID().replaceAll('-', ''), name: `${source.name.slice(0, 28)} · 结构枝`, parent: carrier.stableId, asset_id: source.id, identity_version: 2, scale: 1, count: 3 }])[0];
      const result = planAssemblyGroup(api.getAuthoring(), api.getAsset().masterBranches, group, api.library());
      api.transact('新增结构枝组', next => assign(next, result.authoring), { bypassLayers: true }); selected = group.id; revision = ''; refresh(); announce();
    } catch (error) { api.toast(error.message, true); }
    finally { loadingAssets = false; revision = ''; refresh(); }
  }
  async function addAsset(assetId) {
    if (gesture) commit(); if (!usable() || api.isEditing?.()) return;
    const source = api.library().find(item => item.id === assetId); if (!source) return api.toast('请先把这款单元枝加入当前工程素材');
    if (!selected) return addGroup(assetId);
    const groupId = selected;
    try {
      const initial = current();
      if ((initial.palette.length ? initial.palette : [{ asset_id: initial.asset_id }]).some(item => item.asset_id === assetId)) return report('这款素材已在本组，可调整它的使用权重。');
      loadingAssets = true; revision = ''; refresh();
      await api.ensureAssets?.([assetId]); loadingAssets = false;
      if (!usable() || selected !== groupId) return;
      const group = current(); if (!group) return;
      const palette = copy(group.palette.length ? group.palette : [{ asset_id: group.asset_id, weight: 1 }]);
      if (palette.length >= 12) return api.toast('一个结构枝组最多混排 12 款素材');
      palette.push({ asset_id: assetId, weight: 1 }); immediate({ palette });
    } catch (error) { api.toast(error.message, true); }
    finally { loadingAssets = false; revision = ''; refresh(); }
  }
  function dropTarget(target, groupId = null) {
    target.addEventListener('dragover', event => { if (!usable() || !event.dataTransfer.types.includes(dragType)) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; target.classList.add('drag-over'); });
    target.addEventListener('dragleave', event => { if (!target.contains(event.relatedTarget)) target.classList.remove('drag-over'); });
    target.addEventListener('drop', event => { const assetId = event.dataTransfer.getData(dragType); target.classList.remove('drag-over'); if (!assetId || !usable()) return; event.preventDefault(); event.stopPropagation(); if (groupId) selected = groupId; if (groupId === '') addGroup(assetId); else addAsset(assetId); });
  }
  dropTarget(empty, ''); dropTarget(editor);
  function options(select, entries, value) { select.replaceChildren(...entries.map(([label, key]) => new Option(label, key))); select.value = value; }
  function syncEditor() {
    const group = current(); if (!group) return;
    options($('sgParent'), skeletonBranches(api.getAsset().masterBranches).filter(branch => !branch.symmetryGroup).map(branch => [branch.stableId, branch.stableId]), group.parent);
    options($('sgAsset'), api.library().map(asset => [asset.name, asset.id]), group.asset_id);
    for (const [id, key] of Object.entries(fields)) if (!['sgParent', 'sgAsset'].includes(id)) $(id).value = ['start', 'end'].includes(key) ? group[key] * 100 : group[key];
    for (const [range, input] of Object.entries(rangePairs)) $(range).value = $(input).value;
    $('sgCount').disabled = group.distribution !== 'COUNT'; $('sgSpacing').disabled = group.distribution !== 'SPACING'; $('sgRingCount').disabled = group.arrangement !== 'RING';
    $('sgLayerOffset').disabled = group.arrangement === 'ALTERNATE';
    $('sgProfileRoot').value = group.profiles.length[0]; $('sgProfileTip').value = group.profiles.length[2];
    const state = structureGroupState(api.getAuthoring(), group, api.getAsset().masterBranches, api.library());
    const member = $('sgMember').value; options($('sgMember'), state.records.map(instance => [`${state.states.get(instance.id) === 'AUTO' ? '自动' : state.states.get(instance.id) === 'LOCKED' ? '锁定' : '手工'} · ${api.library().find(asset => asset.id === instance.asset_id)?.name || instance.asset_id} · ${instance.id}`, instance.id]), member);
    if (!state.records.some(instance => instance.id === $('sgMember').value)) $('sgMember').value = state.records[0]?.id || '';
    memberState(); drawPalette(group);
    report(`实际 ${state.total} 支 · 自动 ${state.automatic.length} · 手工 ${state.manual.length} · 锁定 ${state.locked.length} · 保留空位 ${state.removed}。`);
  }
  function drawPalette(group) {
    const palette = group.palette.length ? group.palette : [{ asset_id: group.asset_id, weight: 1 }]; $('sgPalette').replaceChildren();
    for (const entry of palette) {
      const source = api.library().find(asset => asset.id === entry.asset_id), row = element('div', undefined, 'assembly-group-palette-row');
      const image = element('img'); image.alt = ''; if (source?.thumbnail) image.src = source.thumbnail;
      const name = element('span', source?.name || entry.asset_id); name.title = name.textContent;
      const weight = element('input'); weight.type = 'number'; weight.min = '0'; weight.max = '100'; weight.step = '1'; weight.value = entry.weight; weight.setAttribute('aria-label', `${name.textContent} 使用权重`);
      weight.oninput = () => { if (!weight.validity.valid || weight.value === '' || !begin()) return; if (!gesture.group.palette.length) gesture.group.palette = copy(palette); gesture.group.palette.find(item => item.asset_id === entry.asset_id).weight = Number(weight.value); preview(); };
      weight.onchange = commit; weight.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); weight.blur(); commit(); } if (event.key === 'Escape') { event.preventDefault(); cancel(); } };
      const remove = button('×', () => { if (palette.length === 1) return api.toast('请保留至少一种素材，或直接修改主要素材'); immediate({ palette: palette.filter(item => item.asset_id !== entry.asset_id) }); }, `从本组移除 ${name.textContent}`);
      row.append(image, name, weight, remove); $('sgPalette').append(row);
    }
  }
  function memberState() {
    const instance = api.getAuthoring().branch_instances.find(record => record.id === $('sgMember').value), group = current();
    $('sgMemberLock').textContent = instance && (instance.assembly_locked || group.locked.includes(instance.id)) ? '解锁' : '锁定';
    for (const id of ['sgMemberLock', 'sgMemberDetach', 'sgMemberDelete', 'sgMemberAuto']) $(id).disabled = !instance;
  }
  function refresh() {
    panel.hidden = !api.isTree(); if (cancelling) return;
    if (gesture) { if (!api.isTree()) cancel(); return; }
    const a = api.getAuthoring(), enabled = usable();
    for (const node of panel.querySelectorAll('button,input,select')) node.disabled = !enabled;
    if (!groups().some(group => group.id === selected)) selected = groups()[0]?.id || '';
    const signature = JSON.stringify([selected, enabled, groups(), a.branch_instances.map(instance => [instance.id, instance.array_id, instance.parent, instance.asset_id, instance.assembly_manual, instance.assembly_refined, instance.assembly_locked, instance.frame, instance.attach, instance.scale]), api.library().map(asset => [asset.id, asset.revision, asset.thumbnail_revision])]);
    if (signature === revision) return; revision = signature; list.replaceChildren();
    if (api.getAsset()) for (const raw of groups()) {
      const state = structureGroupState(a, raw, api.getAsset().masterBranches, api.library()), card = element('article', undefined, 'assembly-group-card'); card.dataset.group = raw.id; card.classList.toggle('active', raw.id === selected);
      const title = button(raw.name, () => selectGroup(raw.id)); title.className = 'assembly-group-title'; title.disabled = !enabled;
      const count = element('span', `${state.total} 支`, 'assembly-group-count'); const top = element('div', undefined, 'assembly-group-card-heading'); top.append(title, count);
      const art = element('div', undefined, 'assembly-group-thumbnails');
      const sourceIds = [...new Set([raw.asset_id, ...raw.palette.map(entry => entry.asset_id), ...state.records.map(record => record.asset_id)])];
      for (const id of sourceIds.slice(0, 4)) { const source = api.library().find(asset => asset.id === id); const image = element('img'); if (source?.thumbnail) image.src = source.thumbnail; image.alt = source?.name || id; image.title = image.alt; art.append(image); }
      const stats = element('div', `自动 ${state.automatic.length} · 手工 ${state.manual.length} · 锁定 ${state.locked.length}${state.removed ? ` · 留空 ${state.removed}` : ''}`, 'assembly-group-stats');
      card.append(top, art, stats); card.onclick = event => { if (!event.target.closest('button')) selectGroup(raw.id); }; dropTarget(card, raw.id); list.append(card);
    }
    editor.hidden = !selected; if (selected && enabled) syncEditor();
  }
  for (const [id, key] of Object.entries(fields)) {
    const node = $(id);
    node.oninput = () => {
      if (id === 'sgAsset') return;
      if (!node.validity.valid || node.value === '' || !begin()) return;
      gesture.group[key] = node.type === 'number' ? Number(node.value) / (['start', 'end'].includes(key) ? 100 : 1) : node.value;
      for (const [range, input] of Object.entries(rangePairs)) if (input === id) $(range).value = node.value;
      preview();
    };
    node.onchange = id === 'sgAsset' ? async () => { const assetId = node.value, groupId = selected; if (gesture) commit(); if (!usable()) return; try { loadingAssets = true; revision = ''; refresh(); await api.ensureAssets?.([assetId]); loadingAssets = false; if (usable() && selected === groupId) immediate({ asset_id: assetId, palette: [] }); } catch (error) { api.toast(error.message, true); } finally { loadingAssets = false; revision = ''; refresh(); } } : commit;
    node.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); node.blur(); commit(); } if (event.key === 'Escape') { event.preventDefault(); cancel(); } };
  }
  for (const [range, input] of Object.entries(rangePairs)) { $(range).oninput = () => { $(input).value = $(range).value; $(input).oninput(); }; $(range).onchange = commit; }
  for (const [id, index] of [['sgProfileRoot', 0], ['sgProfileTip', 2]]) { $(id).oninput = () => { if (!$(id).validity.valid || $(id).value === '' || !begin()) return; gesture.group.profiles.length[index] = Number($(id).value); gesture.group.profiles.length[1] = (gesture.group.profiles.length[0] + gesture.group.profiles.length[2]) / 2; preview(); }; $(id).onchange = commit; }
  $('sgAddSelected').onclick = () => { const asset = api.selectedAsset?.(); asset ? addAsset(asset.id) : api.toast('先在左侧选择一款单元枝，或把卡片拖到这里'); };
  $('sgReroll').onclick = () => immediate({ seed: current().seed % 2147483646 + 1 });
  $('sgFill').onclick = () => immediate({ removed: [] }, { fillMissing: true }); $('sgSelect').onclick = () => selectGroup(selected);
  $('sgAdvanced').onclick = () => { if (gesture) commit(); api.openAdvanced?.(selected); };
  $('sgMember').onchange = memberState;
  function memberAction(label, mutate) { if (gesture) commit(); if (!usable()) return; const id = $('sgMember').value, groupId = selected; if (!id) return; api.transact(label, next => mutate(next, groupId, id), { bypassLayers: true }); revision = ''; refresh(); announce(); }
  $('sgMemberLock').onclick = () => memberAction('调整结构枝成员锁定', (a, groupId, id) => { const group = a.branch_arrays.find(record => record.id === groupId), instance = a.branch_instances.find(record => record.id === id); const locked = !!instance.assembly_locked || group.locked.includes(id); if (locked) { delete instance.assembly_locked; group.locked = group.locked.filter(key => key !== id); } else { instance.assembly_locked = true; group.locked = [...new Set([...group.locked, id])]; } });
  $('sgMemberDelete').onclick = () => memberAction('删除结构枝并保留空位', removeStructureMember);
  $('sgMemberDetach').onclick = () => memberAction('结构枝转为手工枝', (a, groupId, id) => { const group = a.branch_arrays.find(record => record.id === groupId), instance = a.branch_instances.find(record => record.id === id); group.removed = [...new Set([...group.removed, id])]; group.locked = group.locked.filter(key => key !== id); instance.array_id = ''; instance.assembly_manual = true; instance.assembly_refined = true; });
  function restore(ids) { if (!ids.length) return api.toast('当前没有可恢复的未锁定成员'); immediate({}, { forceAutomatic: ids }); }
  $('sgMemberAuto').onclick = () => restore([$('sgMember').value].filter(Boolean));
  $('sgRestoreAuto').onclick = () => { const state = structureGroupState(api.getAuthoring(), current(), api.getAsset().masterBranches, api.library()); restore(state.manual.map(instance => instance.id)); };
  $('sgDeleteGroup').onclick = () => { if (gesture) commit(); if (!usable()) return; const id = selected; api.transact('删除结构枝组', a => deleteStructureGroup(a, id), { bypassLayers: true }); selected = ''; revision = ''; refresh(); announce(); };
  window.addEventListener('blur', () => { if (gesture) cancel(); });
  refresh();
  return { panel, refresh, cancel, commit, addGroup, addAsset, selectGroup, get active() { return !!gesture; }, get selected() { return selected; },
    key(event) { if (gesture && event.key === 'Escape') { event.preventDefault(); cancel(); return true; } return false; } };
}
