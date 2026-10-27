import * as THREE from 'three';
import { buildBranchAsset, disposeBranchAsset } from './branch-kernel.js';
import { normalizeBranchArrays } from './branch-array-data.js';
import { resolveInstanceShape } from './branch-workbench-data.js';
import { planAssemblyGroup, structureGroupCarrier, deleteStructureGroup, detachStructureGroup } from './assembly-group-data.js';
import { reframeInstanceEdits, clearInstanceEdits } from './branch-instance-edit.js';
import { sampleLine, nearestParameter } from './tree-sculpt.js';

const $ = (id) => document.getElementById(id);
const input = (id, name, value, min, max, step = 'any') => `<label>${name}<input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
export function createBranchArrayEditor(api, context) {
  const { canvas, camera, modelRoot, controls } = api;
  const panel = document.createElement('div'); panel.id = 'branchArrayContext';
  panel.innerHTML = `<label>排列组<select id="arrayGroup"></select></label><div class="wb-row"><button id="arrayNew"><i data-lucide="plus"></i>新建排列</button><button id="arrayUnlink"><i data-lucide="unlink"></i>解除分组</button><button id="arrayDelete" title="删除整组"><i data-lucide="trash-2"></i></button></div><label>组名<input id="arrayName" maxlength="64"></label><label>枝条素材<select id="arrayAsset"></select></label><label>母枝<select id="arrayParent"></select></label><div class="field-grid">${input('arrayStart', '区间起点', 0.25, 0.02, 0.97)}${input('arrayEnd', '区间终点', 0.85, 0.03, 0.98)}</div><label>分布<select id="arrayDistribution"><option value="COUNT">按数量</option><option value="SPACING">按间距</option></select></label><div class="field-grid">${input('arrayCount', '排列站点', 5, 1, 32, 1)}${input('arraySpacing', '间距（m）', 0.25, 0.01, 10)}</div><label>排列方式<select id="arrayArrangement"><option value="ALTERNATE">交替</option><option value="PAIR">成对</option><option value="RING">环绕</option></select></label><div class="field-grid">${input('arrayRingCount', '每圈数量', 3, 2, 8, 1)}${input('arrayAngle', '分枝角（°）', 45, 0, 180)}${input('arrayAzimuth', '起始绕枝角（°）', 0, -180, 180)}${input('arrayScale', '长度缩放', 0.7, 0.05, 5)}${input('arrayVariation', '自然差异', 0.1, 0, 0.5)}${input('arraySeed', '变化种子', 1, 1, 2147483646, 1)}</div><label>沿区间变化<select id="arrayProfile"><option value="length">长度</option><option value="angle">分枝角</option><option value="radius">粗度</option></select></label><canvas id="arrayProfileCanvas" width="420" height="140" aria-label="排列变化曲线"></canvas><div class="field-grid">${input('arrayProfile0', '起点倍率', 1, 0.05, 2)}${input('arrayProfile1', '中点倍率', 1, 0.05, 2)}${input('arrayProfile2', '终点倍率', 1, 0.05, 2)}</div><p id="arrayStatus"></p><label class="wb-check"><input id="arrayCompare" type="checkbox">显示调整前</label><div class="wb-row form-actions"><button id="arrayApply"><i data-lucide="check"></i>应用排列</button><button id="arrayCancel" title="取消排列"><i data-lucide="x"></i></button></div>`;
  context.register('ARRAY', '结构枝组 · 更多设置', panel);
  $('arrayRingCount').parentElement.after(Object.assign(document.createElement('label'), { innerHTML: '隔层错角（°）<input id="arrayLayerOffset" type="number" min="-180" max="180" step="1" value="25">' }));
  $('arrayScale').parentElement.firstChild.textContent = '完整枝倍率';
  const mixPanel = document.createElement('div'); mixPanel.className = 'array-mix';
  mixPanel.innerHTML = `<details id="arrayMixDetails"><summary>素材混排</summary><div id="arrayPalette"></div><div class="wb-row"><select id="arrayPaletteAsset" aria-label="添加混排素材"></select><button id="arrayPaletteAdd" title="加入素材池"><i data-lucide="plus"></i></button></div><label>素材分配<select id="arrayMix"><option value="ALTERNATE">逐个交替</option><option value="SEQUENCE">按权重分段顺序</option><option value="RANDOM">按权重随机</option></select></label><button id="arrayReroll"><i data-lucide="shuffle"></i>重排未锁定成员</button><label>当前成员<select id="arrayMember"></select></label><label class="wb-check"><input id="arrayMemberLock" type="checkbox">锁定此成员</label><label>替换成员素材<select id="arrayReplacement"></select></label></details>`;
  $('arrayAsset').parentElement.after(mixPanel);
  const button = document.createElement('button'); button.id = 'openBranchArray'; button.title = '枝簇批量排列'; button.innerHTML = '<i data-lucide="list-tree"></i>'; document.querySelector('.viewport-tool-rail').append(button);
  const root = new THREE.Group(); root.name = 'BranchArrayPreview'; modelRoot.add(root); const handles = new THREE.Group(); root.add(handles);
  const ray = new THREE.Raycaster(), graph = $('arrayProfileCanvas'); let session = null, ghost = null, timer = null, drag = null, graphDrag = null, applying = false;
  const fields = { arrayName: 'name', arrayAsset: 'asset_id', arrayParent: 'parent', arrayStart: 'start', arrayEnd: 'end', arrayDistribution: 'distribution', arrayCount: 'count', arraySpacing: 'spacing', arrayArrangement: 'arrangement', arrayRingCount: 'ringCount', arrayLayerOffset: 'layerOffset', arrayAngle: 'angle', arrayAzimuth: 'azimuth', arrayScale: 'scale', arrayVariation: 'variation', arraySeed: 'seed' };
  function clearGhost() { if (ghost) { root.remove(ghost.group); disposeBranchAsset(ghost); ghost = null; } }
  function clearHandles() { handles.children.forEach((h) => { h.geometry.dispose(); h.material.dispose(); }); handles.clear(); }
  function parent() { return session?.asset.masterBranches.find((b) => b.stableId === session.group.parent && !b.symmetryGroup); }
  function graphValues() { return session?.group.profiles[$('arrayProfile').value] || [1, 1, 1]; }
  function drawGraph() { const ctx = graph.getContext('2d'), values = graphValues(); ctx.fillStyle = '#101916'; ctx.fillRect(0, 0, graph.width, graph.height); ctx.strokeStyle = '#3b4b43'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(14, 12 + i * 29); ctx.lineTo(406, 12 + i * 29); ctx.stroke(); } ctx.strokeStyle = '#7dc7d2'; ctx.lineWidth = 2; ctx.beginPath(); values.forEach((v, i) => { const x = 14 + i * 196, y = 128 - v / 2 * 116; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); values.forEach((v, i) => { ctx.fillStyle = '#e6c568'; ctx.beginPath(); ctx.arc(14 + i * 196, 128 - v / 2 * 116, 6, 0, Math.PI * 2); ctx.fill(); $('arrayProfile' + i).value = v.toFixed(3); }); }
  function sync() { if (!session) return; for (const [id, key] of Object.entries(fields)) $(id).value = session.group[key]; $('arrayCount').disabled = session.group.distribution !== 'COUNT'; $('arraySpacing').disabled = session.group.distribution !== 'SPACING'; $('arrayRingCount').disabled = session.group.arrangement !== 'RING'; drawGraph(); }
  function drawHandles() { clearHandles(); const b = parent(); if (!b) return; for (const [index, t] of [session.group.start, session.group.end].entries()) { const h = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.025, b.length * 0.028), 14, 10), new THREE.MeshBasicMaterial({ color: index ? 0x79cbd8 : 0xe7c566, depthTest: false })); h.position.copy(sampleLine(b.points, t)); h.userData.endpoint = index; h.renderOrder = 120; handles.add(h); } const points = Array.from({ length: 40 }, (_, i) => sampleLine(b.points, session.group.start + (session.group.end - session.group.start) * i / 39)); handles.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x79cbd8, depthTest: false }))); }
  function planned() {
    if ([...panel.querySelectorAll('input[type="number"]:not(:disabled)')].some((i) => i.value === '' || !i.validity.valid)) throw new Error('请输入有效的排列参数');
    if (session.group.end <= session.group.start) throw new Error('终点需大于起点');
    const baseline = structuredClone(session.authoring);
    baseline.branch_instances = baseline.branch_instances.map(record => session.lockedRecords.get(record.id) || record);
    const result = planAssemblyGroup(baseline, session.asset.masterBranches, session.group, api.library());
    const a = result.authoring, records = result.records;
    for (const next of records) {
      const old = baseline.branch_instances.find((i) => i.id === next.id); if (!old) continue;
      if (old.asset_id !== next.asset_id) { clearInstanceEdits(a, old.id); continue; }
      const local = Object.keys(a.overrides).some((id) => id.startsWith(old.id + '.')) || a.sculpt_layers.some((l) => [...Object.keys(l.branches), ...(l.operation?.targets || [])].some((id) => id.startsWith(old.id + '.')));
      if (local) reframeInstanceEdits(a, old, next, resolveInstanceShape(old, api.library()), session.asset.masterBranches, api.getSettings());
    }
    return result;
  }
  function rebuild() {
    clearTimeout(timer); timer = null; if (!session) return;
    try { const { authoring, records, woodLimit, protectedCount } = planned(), next = buildBranchAsset({ ...api.getSettings(), leaf_density: 0 }, null, [], 0, authoring);
      const ids = new Set(records.map((i) => i.id)); next.group.traverse((o) => { if (!o.isMesh || ![...ids].some((id) => (o.userData.stable_id || '').startsWith(id + '.'))) return; o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); const materials = Array.isArray(o.material) ? o.material : [o.material]; materials.forEach((m) => { m.transparent = true; m.opacity = 0.55; m.depthWrite = false; m.color?.set('#75c3cd'); }); });
      clearGhost(); ghost = next; root.add(ghost.group); session.records = records; drawMembers(); session.asset.group.visible = $('arrayCompare').checked; ghost.group.visible = !$('arrayCompare').checked; session.valid = true; $('arrayStatus').textContent = `${records.length} 支完整枝 · 保留 ${protectedCount} 支手工或锁定枝 · ${next.masterBranches.length} / ${woodLimit} 木质枝段`; $('arrayApply').disabled = false;
    } catch (e) { clearGhost(); session.asset.group.visible = session.visibility; session.valid = false; $('arrayStatus').textContent = e.message; $('arrayApply').disabled = true; }
    drawHandles();
  }
  function preview() { if (!session) return; clearTimeout(timer); timer = setTimeout(rebuild, 80); drawHandles(); }
  function open(id = '') {
    if (applying) return api.toast('正在准备结构枝素材，请稍候');
    if (api.getAsset()?.skeletonOnly) return api.toast('枝干编辑中已暂停单元枝排列，请先返回整树预览');
    api.setTool('SELECT'); const a = api.getAuthoring(), asset = api.getAsset(); if (!asset || asset.group.userData.pending_rebuild) return api.toast('模型更新后可排列');
    if (!api.library().length) return api.toast('先在枝条工作台保存一份素材');
    const existing = a.branch_arrays.find((g) => g.id === id); if (!existing && a.branch_arrays.length >= 16) return api.toast('排列组最多 16 组');
    const group = existing || normalizeBranchArrays([{ id: 'ARRAY_' + crypto.randomUUID().replaceAll('-', ''), parent: structureGroupCarrier(asset.masterBranches, api.getSelection())?.stableId, asset_id: api.selectedAsset()?.id || api.library()[0].id, identity_version: 2 }])[0];
    session = { group: structuredClone(group), original: JSON.stringify(group), lockedRecords: new Map(a.branch_instances.filter((i) => group.locked.includes(i.id)).map((i) => [i.id, structuredClone(i)])), records: [], asset, authoring: structuredClone(a), visibility: asset.group.visible, valid: false, helpers: (api.selectionHelpers || []).map((helper) => [helper, helper.visible]) }; session.helpers.forEach(([helper]) => helper.visible = false); root.visible = true;
    $('arrayGroup').replaceChildren(new Option('新排列', ''), ...a.branch_arrays.map((g) => new Option(g.name, g.id))); $('arrayGroup').value = existing?.id || '';
    $('arrayAsset').replaceChildren(...api.library().map((v) => new Option(v.name, v.id))); $('arrayParent').replaceChildren(...asset.masterBranches.filter((b) => !b.symmetryGroup && !b.unitOwner && !b.instanceId).map((b) => new Option(b.stableId, b.stableId)));
    $('arrayPaletteAsset').replaceChildren(...api.library().map((v) => new Option(v.name, v.id))); $('arrayReplacement').replaceChildren(new Option('按组分配', ''), ...api.library().map((v) => new Option(v.name, v.id))); $('arrayMix').value = group.mix; drawPalette();
    $('arrayCompare').checked = false; $('arrayDelete').disabled = !existing; $('arrayUnlink').disabled = !existing; sync(); context.setMode('ARRAY'); rebuild();
  }
  function release() { const id = drag?.id; drag = null; if (id != null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); if (graphDrag) { const pointer = graphDrag.id; graphDrag = null; if (graph.hasPointerCapture(pointer)) graph.releasePointerCapture(pointer); } controls.enabled = true; }
  function cancel() { if (!session) return false; release(); clearTimeout(timer); timer = null; session.asset.group.visible = session.visibility; session.helpers.forEach(([helper, visible]) => helper.visible = visible); session = null; clearGhost(); clearHandles(); root.visible = false; if (context.mode === 'ARRAY') context.setMode(''); return true; }
  function apply() {
    if (applying || !session || drag || graphDrag) return false;
    let result;
    try { result = planned(); } catch (error) { api.toast(error.message, true); return false; }
    // First release the temporary ghost. Hydrating complete source geometry can
    // rebuild the main asset, and must finish before this one document commit.
    cancel(); applying = true;
    return (async () => {
      try {
        await api.ensureAssets?.([...new Set(result.records.map(record => record.asset_id))]);
        const {authoring} = result;
        api.transact('保存结构枝组排列', a => {
          a.branch_arrays = authoring.branch_arrays; a.branch_instances = authoring.branch_instances;
          a.overrides = authoring.overrides; a.sculpt_layers = authoring.sculpt_layers; a.recipe = authoring.recipe;
          const units = new Map((a.tree_organs?.units || []).map(unit => [unit.id, unit]));
          for (const unit of authoring.tree_organs?.units || []) units.set(unit.id, unit);
          a.tree_organs = {...authoring.tree_organs, units:[...units.values()]};
        }, {bypassLayers:true});
        context.setMode(''); return true;
      } catch (error) { api.toast(error.message, true); return false; }
      finally { applying = false; }
    })();
  }
  function drawPalette() {
    const list = $('arrayPalette'); list.replaceChildren(); if (!session) return;
    session.group.palette.forEach((entry, index) => { const item = api.library().find((i) => i.id === entry.asset_id), row = document.createElement('div'); row.className = 'array-palette-row'; const image = document.createElement('img'); if (item?.thumbnail) image.src = item.thumbnail; image.alt = item?.name || entry.asset_id; const label = document.createElement('span'); label.textContent = item?.name || entry.asset_id; const weight = document.createElement('input'); weight.type = 'number'; weight.min = '0'; weight.max = '100'; weight.step = '1'; weight.value = entry.weight; weight.setAttribute('aria-label', (item?.name || entry.asset_id) + ' 权重'); weight.oninput = () => { if (weight.value !== '' && weight.validity.valid) { entry.weight = +weight.value; preview(); } }; const remove = document.createElement('button'); remove.title = '移除混排素材'; remove.innerHTML = '<i data-lucide="x"></i>'; remove.onclick = () => { session.group.palette.splice(index, 1); drawPalette(); preview(); }; row.append(image, label, weight, remove); list.append(row); }); window.lucide?.createIcons({ nodes: [list] });
  }
  function drawMembers() { if (!session) return; const select = $('arrayMember'), selected = select.value; select.replaceChildren(...session.records.map((i) => new Option(`${i.array_index + 1} · ${api.library().find((a) => a.id === i.asset_id)?.name || i.asset_id}`, i.id))); if (session.records.some((i) => i.id === selected)) select.value = selected; syncMember(); }
  function syncMember() { if (!session) return; const id = $('arrayMember').value; $('arrayMemberLock').checked = session.group.locked.includes(id); $('arrayMemberLock').disabled = !id; $('arrayReplacement').value = session.group.replacements[id] || ''; $('arrayReplacement').disabled = !id || session.group.locked.includes(id); }
  $('arrayPaletteAdd').onclick = () => { if (!session || session.group.palette.length >= 12) return; const id = $('arrayPaletteAsset').value; if (!session.group.palette.some((p) => p.asset_id === id)) session.group.palette.push({ asset_id: id, weight: 1 }); drawPalette(); preview(); };
  $('arrayMix').onchange = () => { session.group.mix = $('arrayMix').value; preview(); }; $('arrayReroll').onclick = () => { session.group.seed = session.group.seed % 2147483646 + 1; sync(); preview(); }; $('arrayMember').onchange = syncMember;
  $('arrayMemberLock').onchange = () => { const id = $('arrayMember').value; if ($('arrayMemberLock').checked) { session.group.locked = [...new Set([...session.group.locked, id])]; session.lockedRecords.set(id, structuredClone(session.records.find((i) => i.id === id))); } else { session.group.locked = session.group.locked.filter((v) => v !== id); session.lockedRecords.delete(id); const record = session.authoring.branch_instances.find(instance => instance.id === id); if (record) delete record.assembly_locked; } syncMember(); preview(); };
  $('arrayReplacement').onchange = () => { const id = $('arrayMember').value; if ($('arrayReplacement').value) session.group.replacements[id] = $('arrayReplacement').value; else delete session.group.replacements[id]; preview(); };
  for (const [id, key] of Object.entries(fields)) $(id).oninput = () => { const i = $(id); if (!session || !i.validity.valid || i.value === '') return; session.group[key] = i.type === 'number' ? +i.value : i.value; if (session.group.end <= session.group.start) { clearTimeout(timer); timer = null; rebuild(); return; } sync(); preview(); };
  $('arrayProfile').onchange = drawGraph; [0, 1, 2].forEach((i) => $('arrayProfile' + i).oninput = () => { const field = $('arrayProfile' + i); if (session && field.value !== '' && field.validity.valid) { session.group.profiles[$('arrayProfile').value][i] = +field.value; drawGraph(); preview(); } });
  function graphPoint(e) { const r = graph.getBoundingClientRect(); return [(e.clientX - r.x) / r.width * graph.width, (e.clientY - r.y) / r.height * graph.height]; }
  graph.onpointerdown = (e) => { if (!session || e.button !== 0) return; const [x, y] = graphPoint(e), index = graphValues().findIndex((v, i) => Math.hypot(x - 14 - i * 196, y - 128 + v / 2 * 116) < 18); if (index < 0) return; graphDrag = { index, id: e.pointerId }; graph.setPointerCapture(e.pointerId); e.preventDefault(); };
  graph.onpointermove = (e) => { if (!graphDrag) return; const [, y] = graphPoint(e); session.group.profiles[$('arrayProfile').value][graphDrag.index] = THREE.MathUtils.clamp((128 - y) / 116 * 2, 0.05, 2); drawGraph(); preview(); };
  graph.onpointerup = () => { if (graphDrag) { release(); rebuild(); } }; graph.onpointercancel = () => { cancel(); context.setMode(''); };
  function cast(e) { const r = canvas.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((e.clientX - r.x) / r.width * 2 - 1, -(e.clientY - r.y) / r.height * 2 + 1), camera); }
  function begin(e) { if (!session || e.button !== 0) return false; cast(e); root.updateWorldMatrix(true, true); const hit = ray.intersectObjects(handles.children).find((h) => h.object.userData.endpoint !== undefined); if (!hit) return true; const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), hit.object.getWorldPosition(new THREE.Vector3())); drag = { id: e.pointerId, index: hit.object.userData.endpoint, plane }; controls.enabled = false; canvas.setPointerCapture(e.pointerId); return true; }
  function move(e) { if (!session) return false; if (!drag) return true; cast(e); const point = ray.ray.intersectPlane(drag.plane, new THREE.Vector3()); if (!point || !parent()) return true; const t = nearestParameter(parent().points, modelRoot.worldToLocal(point)); if (drag.index) session.group.end = THREE.MathUtils.clamp(t, session.group.start + 0.01, 0.98); else session.group.start = THREE.MathUtils.clamp(t, 0.02, session.group.end - 0.01); sync(); preview(); return true; }
  function end(e) { if (!session || e.button !== 0) return false; if (drag) { move(e); release(); rebuild(); } return true; }
  button.onclick = () => { const i = api.getAuthoring().branch_instances.find((i) => api.getSelection()?.startsWith(i.id + '.')); open(i?.array_id || api.getAuthoring().branch_arrays[0]?.id || ''); };
  $('arrayNew').onclick = () => open(); $('arrayGroup').onchange = () => open($('arrayGroup').value); $('arrayApply').onclick = apply; $('arrayCancel').onclick = () => { cancel(); context.setMode(''); };
  for (const [id, remove] of [['arrayDelete', true], ['arrayUnlink', false]]) $(id).onclick = () => { const key = session.group.id; cancel(); api.transact(remove ? '删除结构枝组' : '结构枝组转为手工枝', a => (remove ? deleteStructureGroup : detachStructureGroup)(a, key), { bypassLayers: true }); context.setMode(''); };
  $('arrayCompare').onchange = () => { if (!session) return; session.asset.group.visible = $('arrayCompare').checked; if (ghost) ghost.group.visible = !$('arrayCompare').checked; };
  canvas.addEventListener('pointercancel', () => { if (drag) cancel(); }); canvas.addEventListener('lostpointercapture', () => { if (drag) cancel(); }); window.addEventListener('blur', () => { if (drag || graphDrag) cancel(); });
  document.addEventListener('click', event => { if (!applying || !event.target.closest?.('button,input,select')) return; event.preventDefault(); event.stopImmediatePropagation(); }, true);
  root.visible = false;
  return { open, cancel, begin, move, end, apply, root, handles, get dirty() { return applying || !!session && (session.original !== JSON.stringify(session.group) || !session.authoring.branch_arrays.some((g) => g.id === session.group.id)); }, get pending() { return applying || Boolean(timer); }, get active() { return applying || Boolean(session); }, get session() { return session; }, get ghost() { return ghost; }, refresh() { if (session && session.asset !== api.getAsset()) cancel(); }, key(e) { if (applying) {e.preventDefault(); return true;} if (!session) return false; if (e.key === 'Escape') { cancel(); context.setMode(''); return true; } if (e.key === 'Enter' && !e.target.matches?.('input,select,textarea')) { apply(); return true; } return false; } };
}
