import { SCULPT_TOOLS } from './tree-sculpt.js';
import { normalizeSections, sectionAt, normalizeJunction } from './branch-shaping.js';

const $ = (id) => document.getElementById(id);
const button = (id, icon, label) => `<button id="${id}" title="${label}" aria-label="${label}"><i data-lucide="${icon}"></i></button>`;
export function createShapingContext(api, tools, sectionControls) {
  const panel = document.createElement('div'); panel.id = 'shapingContext'; panel.hidden = true;
  panel.innerHTML = `<div class="shaping-context-heading"><strong id="shapingContextTitle">造型</strong>${button('closeShapingContext', 'x', '关闭工具参数')}</div><div id="shapingContextBody"></div>`;
  const body = panel.lastElementChild;
  const dock = document.createElement('div'); dock.id = 'shapingActionDock'; panel.append(dock); const actionHomes = new Map();
  const sections = document.createElement('div'); sections.id = 'continuousSections';
  sections.innerHTML = `<div class="wb-tools">${button('sectionAdd', 'circle-plus', '添加截面')}${button('sectionRemove', 'circle-minus', '移除截面')}${button('sectionResetAll', 'rotate-ccw', '重置连续截面')}<select id="sectionPreset" aria-label="截面预设"><option value="">截面预设</option><option value="BASE">基部膨大</option><option value="WAIST">中段收束</option><option value="TAPER">末端渐细</option></select></div><canvas id="sectionProfileCanvas" width="480" height="144" aria-label="沿枝粗细曲线"></canvas><label>当前截面<select id="sectionNode" aria-label="当前截面"></select></label><div class="field-grid"><label>椭圆度<input id="sectionOval" type="number" min="0.25" max="4" step="0.05" value="1"></label><label>滚转（°）<input id="sectionRollLocal" type="number" min="-180" max="180" step="1" value="0"></label></div>`;
  sectionControls.append(sections); body.append(sectionControls);
  document.body.append(panel);
  const junction = document.createElement('div'); junction.id = 'junctionContext';
  junction.innerHTML = `<label class="wb-check"><input id="junctionEnabled" type="checkbox">启用连接过渡</label><div class="field-grid"><label>过渡长度（m）<input id="junctionLength" type="number" min="0.01" max="2" step="0.01" value="0.18"></label><label>根部外扩<input id="junctionFlareLocal" type="number" min="0" max="2" step="0.05" value="0.25"></label></div><label>方向衔接<input id="junctionAlign" type="range" min="0" max="1" step="0.05" value="0.5"></label><label class="wb-check"><input id="junctionMatch" type="checkbox" checked>匹配母枝粗度</label>${button('junctionReset', 'rotate-ccw', '重置连接过渡')}<span id="junctionTarget"></span>`;
  body.append(junction);
  const sculpt = document.createElement('div'); sculpt.id = 'sculptQuickContext'; body.append(sculpt);
  const brushAdvanced = document.createElement('details'); brushAdvanced.className = 'companion-advanced'; brushAdvanced.innerHTML = '<summary>更多笔刷参数</summary>';
  const quickSync = [];
  for (const [id, label] of [['unitBrushEffect', '完整单元枝笔刷'], ['unitCombOrientation', '整支转向方向'], ['sculptRadius', '半径 · F / [ / ]'], ['sculptStrength', '强度 · Shift+F'], ['sculptHardness', '硬度'], ['sculptScope', '影响范围'], ['sculptDepth', '穿透深度（m）'], ['sculptDirection', '操作方向'], ['sculptSelection', '枝条范围'], ['sculptFlexibility', '柔顺度'], ['sculptLength', '长度保持'], ['sculptProtectTrunk', '保护主干']]) {
    const original = $(id); const row = document.createElement('label'); const input = original.cloneNode(true); input.id = `quick_${id}`; const output = document.createElement('output');
    row.append(document.createTextNode(label), output, input); if (input.type === 'checkbox') row.className = 'wb-check';
    (['sculptHardness','sculptDepth','sculptDirection','sculptFlexibility','sculptLength'].includes(id) ? brushAdvanced : sculpt).append(row);
    const sync = () => { input.value = original.value; input.checked = original.checked; input.disabled = original.disabled; output.textContent = input.type === 'range' ? input.value : ''; };
    quickSync.push(sync);
    input.oninput = () => { original.value = input.value; original.checked = input.checked; original.dispatchEvent(new Event('input', { bubbles: true })); output.textContent = input.type === 'range' ? input.value : ''; };
    input.onchange = () => original.dispatchEvent(new Event('change', { bubbles: true })); original.addEventListener('input', sync); original.addEventListener('change', sync); sync();
  }
  const unitBrush = document.createElement('section'); unitBrush.id = 'unitBrushSettings';
  unitBrush.innerHTML = `<div data-unit-brush="ALIGN" class="unit-brush-reference"><button id="unitBrushSample" type="button">点取一支 · 取样方向</button><span id="unitBrushSampleStatus" role="status">尚未取样</span></div>
    <div data-unit-brush="SPREAD" class="unit-brush-reference"><label>作用方式<select id="unitBrushSpreadMode" aria-label="散开或收拢"><option value="OUT">向外散开</option><option value="IN">向内收拢</option></select></label><button id="unitBrushCenter" type="button">在画面中点取中心</button><span id="unitBrushCenterStatus" role="status">尚未设置中心</span></div>
    <div data-unit-brush="SCALE"><div class="field-grid"><label>作用方式<select id="unitBrushSizeMode" aria-label="放大或缩小完整单元枝"><option value="GROW">放大整支</option><option value="SHRINK">缩小整支</option></select></label><label>每笔最多（%）<input id="unitBrushSizeLimit" aria-label="每笔尺寸变化上限" type="number" min="1" max="80" step="1" value="20"></label></div></div>
    <div data-unit-brush="SPREAD JITTER"><label>每笔最多转动（°）<input id="unitBrushAngleLimit" aria-label="每笔旋转角度上限" type="number" min="1" max="90" step="1" value="25"></label></div>
    <div data-unit-brush="JITTER"><div class="unit-brush-seed"><label>变化组<input id="unitBrushSeed" aria-label="自然扰动变化组" type="number" min="1" max="2147483647" step="1" value="1"></label><button id="unitBrushShuffle" type="button">换一组</button></div></div>`;
  $('quick_unitCombOrientation').closest('label').after(unitBrush);
  sculpt.append(brushAdvanced);
  const brushHint = document.createElement('p'); brushHint.className = 'wb-note'; brushHint.textContent = 'F 调半径 · Shift+F 调强度 · 左键确认 / Esc 取消。枝干上 Shift 拖动临时平滑；Shift 框选加选，Ctrl 框选减选，Ctrl 空白框清空。每种笔刷独立记忆参数。'; sculpt.prepend(brushHint);
  const unitSummary = document.createElement('p'); unitSummary.className='unit-tool-selection-summary'; unitSummary.id='unitToolSelectionSummary'; unitSummary.setAttribute('aria-live','polite'); sculpt.prepend(unitSummary);
  const unitHit = document.createElement('div'); unitHit.id = 'unitBrushHitSettings';
  unitHit.innerHTML = '<label>笔刷命中<select id="unitBrushHitMode" aria-label="单元枝笔刷命中方式"><option value="AUTO">智能 · 优先当前选区</option><option value="SURFACE">只刷表层</option><option value="THROUGH">选区内穿透</option><option value="SPHERE">空间球</option></select></label><small id="unitBrushHitHint"></small>';
  unitSummary.after(unitHit);
  const clearMask = document.createElement('button'); clearMask.type = 'button'; clearMask.textContent = '清除保护蒙版'; clearMask.onclick = () => $('clearSculptMask').click(); brushAdvanced.append(clearMask);
  const leafBrush = document.createElement('div'); leafBrush.id = 'leafBrushContext'; body.append(leafBrush);
  for (const id of ['leafBrushRadius','leafBrushCount']) {
    const original = $(id), row = document.createElement('label'), input = original.cloneNode(true);
    input.id = `quick_${id}`; row.textContent = id === 'leafBrushRadius' ? '画笔半径（m）' : '单次数量'; row.append(input); leafBrush.append(row);
    input.oninput = () => { original.value = input.value; original.dispatchEvent(new Event('input', {bubbles:true})); };
    input.onchange = () => original.dispatchEvent(new Event('change', {bubbles:true}));
    quickSync.push(() => input.value = original.value);
  }
  const retractHint = document.createElement('p'); retractHint.className = 'wb-note'; retractHint.textContent = '圈住要回缩的枝条，按住左键向下拖动；拖回起点恢复本笔。根部固定，枝梢沿当前弯曲路径退回，子枝跟随。不会剪掉分叉或缩小单元枝。有固定点或保护蒙版的枝条不回缩。'; sculpt.prepend(retractHint);
  const combHint = document.createElement('p'); combHint.className = 'wb-note'; combHint.textContent = '按住左键沿想要的方向梳理，根部固定，实际枝长与粗细保持，子枝及叶花果跟随。半径控制范围，强度控制转向速度；枝干上 Shift 临时平滑，空白处 Shift 框选加选，Ctrl 框选减选，Esc 取消本笔。固定点或完全保护点之前保持原形，只梳理后方自由枝梢。'; sculpt.prepend(combHint);
  combHint.title = combHint.textContent; combHint.textContent = '沿拖动方向梳理，保长保粗；固定点之前不变，子枝和叶片跟随。枝干上 Shift 临时平滑。';
  retractHint.title = retractHint.textContent; retractHint.textContent = '向下拖动，枝梢沿原路径收回，根部固定；子枝跟随，单元枝尺寸保持。Esc 取消本笔。';
  let mode = ''; let graphDrag = null; const extensions = new Map();
  const graph = $('sectionProfileCanvas') || sections.querySelector('canvas');
  const find = (id) => panel.querySelector(`#${id}`);
  function sectionRecords() { return tools.getBranch()?.sections?.length ? tools.getBranch().sections.map((p) => ({ ...p })) : [0, 0.5, 1].map((t) => ({ t, radius: 1, oval: 1, roll: 0 })); }
  function writeSections(records) { const branch = tools.getBranch(); if (!branch) return; api.preview((a) => { a.overrides[branch.stableId] ||= {}; a.overrides[branch.stableId].sections = normalizeSections(records); }); }
  function draw() {
    const ctx = graph.getContext('2d'); const w = graph.width, h = graph.height; ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#101916'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#32433b'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(12, 12 + (h - 24) * i / 4); ctx.lineTo(w - 12, 12 + (h - 24) * i / 4); ctx.stroke(); }
    const records = sectionRecords(); ctx.strokeStyle = '#78c1d2'; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let i = 0; i <= 100; i++) { const t = i / 100, radius = sectionAt(records, t).radius; const x = 12 + t * (w - 24), y = h - 12 - radius / 4 * (h - 24); if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke();
    records.forEach((p) => { ctx.fillStyle = Math.abs(p.t - tools.sectionT) < 0.006 ? '#eac86d' : '#83c3d0'; ctx.beginPath(); ctx.arc(12 + p.t * (w - 24), h - 12 - p.radius / 4 * (h - 24), 5, 0, 2 * Math.PI); ctx.fill(); });
  }
  function refresh() {
    const unit=api.isTree?.()&&api.getTreeEditMode?.()==='UNIT';
    retractHint.hidden = mode !== 'RETRACT';
    combHint.hidden = mode !== 'COMB';
    const orientation=$('unitCombOrientation').value,effect=$('unitBrushEffect').value;
    const effectHints={ALIGN:'点取一支作为方向样本，刷过目标整支以对齐；各自枝根与尺寸保持。',SPREAD:'先点取固定中心，再刷过整支散开或收拢；各自枝根保持，每笔转动限幅。',SCALE:'木枝与叶花果围绕各自枝根等比缩放；每笔变化限幅，松手后可继续下一笔。',JITTER:'整支轻微转向，各自枝根与尺寸保持；同一笔目标固定，换一组只改变下一笔。'};
    combHint.textContent=unit?(effectHints[effect]||(orientation==='DOWN'?'刷过的整支枝梢朝世界下方转向，与拖动方向和视角无关；各自枝根固定。':orientation==='ROLL'?'保持整支长轴，绕轴翻转让源模型标定的一侧朝下；未标定的单元枝跳过，请在枝条工作台设置悬垂参考。':'沿拖动方向批量转动整支；各自枝根固定，长度、粗细与内部样式保持。')):'沿拖动方向梳理，保长保粗；固定点之前不变，子枝和叶片跟随。枝干上 Shift 临时平滑。';
    combHint.title=combHint.textContent;
    brushHint.textContent=unit?'F 半径 · Shift+F 强度 · Esc 取消本笔 · Ctrl 空白框清空':'F 调半径 · Shift+F 调强度 · 左键确认 / Esc 取消。枝干上 Shift 拖动临时平滑；Shift 框选加选，Ctrl 框选减选，Ctrl 空白框清空。每种笔刷独立记忆参数。';
    for(const id of ['sculptFlexibility','sculptLength','sculptProtectTrunk'])$('quick_'+id).closest('label').hidden=Boolean(unit);
    $('quick_unitBrushEffect').closest('label').hidden=!unit||mode!=='COMB';
    $('quick_unitBrushEffect').closest('label').classList.toggle('unit-brush-wide',effect!=='TURN');
    $('quick_unitCombOrientation').closest('label').hidden=!unit||mode!=='COMB'||effect!=='TURN';
    unitBrush.hidden=!unit||mode!=='COMB'||effect==='TURN';
    unitBrush.querySelectorAll('[data-unit-brush]').forEach(row=>row.hidden=!row.dataset.unitBrush.split(' ').includes(effect));
    $('quick_sculptDirection').closest('label').hidden=Boolean(unit&&(effect!=='TURN'||orientation!=='DRAG'));
    unitSummary.hidden=!unit;unitSummary.textContent=unit?api.getUnitSelectionSummary?.()||'':'';
    unitHit.hidden=!unit||mode!=='COMB';
    const hitMode=$('unitBrushHitMode').value, allScope=$('branchEditScope').value==='ALL';
    $('unitBrushHitHint').textContent=hitMode==='AUTO'
      ? allScope?'全树范围只刷表层；框选后自动限定为选区。':'只刷已选整支；忽略前后遮挡，仍须在笔刷圆内。'
      :hitMode==='SURFACE'?'在选区内按深度筛选表层，后方单元枝可能不受影响。'
        :hitMode==='THROUGH'?'笔刷圆内前后均可命中，选区外始终不受影响。':'按三维距离命中选区内单元枝。';
    $('quick_sculptScope').closest('label').hidden=Boolean(unit);
    $('quick_sculptDepth').closest('label').hidden=Boolean(unit&&!(hitMode==='SURFACE'||hitMode==='AUTO'&&allScope));
    $('quick_sculptSelection').closest('label').firstChild.textContent=unit?'选择对象范围':'枝条范围';
    clearMask.hidden=Boolean(unit);
    for(const option of $('quick_sculptSelection').options)option.textContent=$('sculptSelection').querySelector(`option[value="${option.value}"]`)?.textContent||option.textContent;
    $('sculptLength').disabled = mode === 'COMB';
    $('sculptLengthValue').value = mode === 'COMB' ? '固定保长' : $('sculptLength').value;
    quickSync.forEach(sync => sync());
    actionHomes.forEach((home, actions) => home.append(actions)); dock.replaceChildren();
    const editableBranch = tools.getBranch();
    if (graphDrag && !editableBranch) cancelGraph();
    sectionControls.hidden = mode !== 'SECTION' || !editableBranch; junction.hidden = mode !== 'JUNCTION' || !editableBranch; sculpt.hidden = !SCULPT_TOOLS.has(mode);
    leafBrush.hidden = !['LEAF_ADD','LEAF_ERASE'].includes(mode);
    $('quick_leafBrushCount').closest('label').hidden = mode === 'LEAF_ERASE';
    extensions.forEach((entry, key) => { entry.element.hidden = mode !== key; });
    const activeActions = extensions.get(mode)?.element.querySelector('.form-actions'); if (activeActions) { actionHomes.set(activeActions, activeActions.parentElement); dock.append(activeActions); }
    panel.hidden = !extensions.has(mode) && !['SECTION', 'JUNCTION', 'LEAF_ADD', 'LEAF_ERASE', ...SCULPT_TOOLS].includes(mode);
    document.querySelector('.inspector-panel').classList.toggle('has-shaping-context', !panel.hidden);
    find('shapingContextTitle').textContent = extensions.get(mode)?.title || (mode === 'SECTION' ? '连续截面' : mode === 'JUNCTION' ? '树杈连接' : mode === 'RETRACT' ? '沿枝路回缩' : mode === 'COMB' ? unit?`单元枝 · ${{TURN:'整支转向',ALIGN:'取样对齐',SPREAD:'散开 / 收拢',SCALE:'大小刷',JITTER:'自然扰动'}[effect]||'整支梳理'}`:'主枝干 · 保长梳理' : mode === 'LEAF_ADD' ? '补叶画笔' : mode === 'LEAF_ERASE' ? '擦叶画笔' : '雕刻参数');
    if (mode === 'SECTION' && editableBranch) {
      draw(); if (graphDrag || api.isEditing()) return;
      const records = sectionRecords(); const select = find('sectionNode'); select.replaceChildren();
      records.forEach((p) => select.add(new Option(`${Math.round(p.t * 100)}%`, String(p.t)))); select.value = String(tools.sectionT);
      const p = sectionAt(records, tools.sectionT); find('sectionOval').value = p.oval; find('sectionRollLocal').value = p.roll;
      $('wbSectionT').value = tools.sectionT;
    }
    if (mode === 'JUNCTION' && !api.isEditing()) {
      const branch = tools.getBranch(); const enabled = branch?.parentId >= 0; const value = branch?.junction || normalizeJunction({ enabled: false });
      junction.querySelectorAll('input,button').forEach((i) => { i.disabled = !enabled; });
      find('junctionAlign').disabled = !enabled || Boolean(branch?.override?.curve_knots?.length);
      find('junctionAlign').title = branch?.override?.curve_knots?.length ? '接合方向由当前手工曲线控制' : '从母枝方向平滑过渡';
      find('junctionTarget').textContent = enabled ? branch.stableId : '请选择有母枝的枝条';
      for (const [key, id] of Object.entries({ enabled: 'junctionEnabled', length: 'junctionLength', flare: 'junctionFlareLocal', align: 'junctionAlign', match: 'junctionMatch' })) { const input = find(id); if (input.type === 'checkbox') input.checked = value[key]; else input.value = value[key]; }
    }
  }
  $('unitCombOrientation').addEventListener('change',refresh);
  $('unitBrushEffect').addEventListener('change',refresh);
  $('unitBrushHitMode').addEventListener('change',refresh);
  document.addEventListener('tree-assembly-refreshed',()=>{if(mode==='COMB')refresh();});
  function setMode(next) { if (['SECTION','JUNCTION'].includes(next) && !tools.getBranch()) { api.toast('单元枝样式请在枝条工作台编辑；整树中可用 G/R/S 调整整支'); return; } if (graphDrag) cancelGraph(); const changed = mode !== next; if (changed) body.scrollTop = 0; mode = next; refresh(); if (changed && next) $('contextTab')?.click(); }
  find('closeShapingContext').onclick = () => { api.setTool('SELECT'); tools.activate(''); setMode(''); };
  find('sectionAdd').onclick = () => { if (!tools.getBranch()) return; const records = sectionRecords(); if (records.length >= 24) return api.toast('最多可设置 24 个截面'); if (records.some((p) => Math.abs(p.t - tools.sectionT) < 0.006)) { let widest = 0; for (let i = 1; i < records.length; i++) if (records[i].t - records[i - 1].t > widest) { widest = records[i].t - records[i - 1].t; tools.setSection((records[i].t + records[i - 1].t) / 2); } } api.begin(); records.push({ ...sectionAt(records, tools.sectionT), t: tools.sectionT }); writeSections(records); api.commit(); refresh(); };
  find('sectionRemove').onclick = () => { if (!tools.getBranch()) return; api.begin(); writeSections(sectionRecords().filter((p) => Math.abs(p.t - tools.sectionT) >= 0.006)); api.commit(); refresh(); };
  find('sectionResetAll').onclick = () => { if (!tools.getBranch()) return; api.begin(); writeSections([]); api.commit(); refresh(); };
  find('sectionNode').onchange = () => { tools.setSection(+find('sectionNode').value); refresh(); };
  find('sectionPreset').onchange = () => { const key = find('sectionPreset').value; if (!key || !tools.getBranch()) return; const values = { BASE: [1.8, 1, 1], WAIST: [1, 0.45, 1], TAPER: [1.3, 0.9, 0.25] }[key]; api.begin(); writeSections([0, 0.5, 1].map((t, i) => ({ t, radius: values[i], oval: 1, roll: 0 }))); api.commit(); find('sectionPreset').value = ''; refresh(); };
  for (const [id, key] of [['sectionOval', 'oval'], ['sectionRollLocal', 'roll']]) { const input = find(id); input.oninput = () => { if (!tools.getBranch() || !input.validity.valid || input.value === '') return; api.begin(); tools.setSectionValue(key, +input.value); }; input.onchange = () => { api.commit(); refresh(); }; }
  for (const [key, id] of Object.entries({ enabled: 'junctionEnabled', length: 'junctionLength', flare: 'junctionFlareLocal', align: 'junctionAlign', match: 'junctionMatch' })) {
    const input = find(id); input.oninput = () => { const b = tools.getBranch(); if (!b || !input.validity.valid || input.value === '') return; api.begin(); api.preview((a) => { const o = a.overrides[b.stableId] ||= {}; o.junction = { ...(o.junction || b.junction || normalizeJunction({})), [key]: input.type === 'checkbox' ? input.checked : +input.value }; }); }; input.onchange = () => api.commit();
  }
  find('junctionReset').onclick = () => { const b = tools.getBranch(); if (b) api.transact('重置连接过渡', (a) => { a.overrides[b.stableId] ||= {}; a.overrides[b.stableId].junction = { ...normalizeJunction({}), enabled: false }; }, { bypassLayers: true }); };
  function graphPosition(e) { const r = graph.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * graph.width, y: (e.clientY - r.top) / r.height * graph.height }; }
  graph.onpointerdown = (e) => { if (e.button !== 0 || !tools.getBranch()) return; const p = graphPosition(e), records = sectionRecords(); const index = records.findIndex((k) => Math.hypot(12 + k.t * (graph.width - 24) - p.x, graph.height - 12 - k.radius / 4 * (graph.height - 24) - p.y) < 16); if (index < 0) return; api.begin(); graphDrag = { records, index, pointer: e.pointerId }; tools.setSection(records[index].t); graph.setPointerCapture(e.pointerId); e.preventDefault(); draw(); };
  graph.onpointermove = (e) => { if (!graphDrag) return; const p = graphPosition(e), { records, index } = graphDrag; const k = records[index]; k.radius = Math.max(0.05, Math.min(4, (graph.height - 12 - p.y) / (graph.height - 24) * 4)); if (index > 0 && index < records.length - 1) k.t = Math.max(records[index - 1].t + 0.015, Math.min(records[index + 1].t - 0.015, (p.x - 12) / (graph.width - 24))); tools.setSection(k.t); writeSections(records); draw(); };
  graph.onpointerup = (e) => { if (!graphDrag) return; graphDrag = null; api.commit(); if (graph.hasPointerCapture(e.pointerId)) graph.releasePointerCapture(e.pointerId); refresh(); };
  function cancelGraph() { if (!graphDrag) return false; const id = graphDrag.pointer; graphDrag = null; api.cancel(); if (graph.hasPointerCapture(id)) graph.releasePointerCapture(id); refresh(); return true; }
  graph.onpointercancel = cancelGraph; graph.onlostpointercapture = cancelGraph;
  window.addEventListener('blur', cancelGraph);
  return { refresh, setMode, get mode() { return mode; }, cancel: cancelGraph,
    register(key, title, element) { extensions.set(key, { title, element }); body.append(element); element.hidden = true; },
    mount() { document.querySelector('.inspector-scroll').before(panel); document.querySelector('.parameter-panel').classList.remove('has-shaping-context'); window.lucide?.createIcons(); },
  };
}
