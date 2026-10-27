import { createSculptLayerWindow, requiresRetainedLayers } from './sculpt-layer-window.js';
import * as THREE from 'three';
import { createSculptSnapshot, createMeshPreview } from './tree-sculpt.js';
import { bundleOverrides, descendants } from './branch-selection.js';
import { createBranchCage } from './branch-deformation.js';
import { buildBranchAsset, disposeBranchAsset } from './branch-kernel.js';
import { normalizeShapeOperation } from './shape-operation-data.js';
import { operationCage, evaluateShapeOperation, inspectBranchSpacing } from './shape-operation-geometry.js';
import { applySculptLayers } from './generator-geometry.js';
import { applyBranchSymmetry } from './branch-symmetry.js';

const $ = (id) => document.getElementById(id);
const iconButton = (id, icon, label) => `<button id="${id}" title="${label}" aria-label="${label}"><i data-lucide="${icon}"></i></button>`;
const slider = (id, label, value, min, max, step) => `<label>${label}<output for="${id}">${value}</output><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;

export function createBranchDeformation(api, context) {
  const { canvas, camera, controls, modelRoot } = api;
  const root = new THREE.Group(); root.name = 'BranchDeformationHelpers'; modelRoot.add(root);
  const handles = new THREE.Group(); root.add(handles);
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x6dbdc9, depthTest: false })); root.add(lines);
  const path = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xe5bc62, depthTest: false })); root.add(path);
  root.renderOrder = 110;
  const panel = document.createElement('div'); panel.id = 'deformationContext';
  panel.innerHTML = `<div class="wb-row"><strong id="deformationCount"></strong><span id="deformationState"></span></div>
    <label class="wb-check"><input id="deformLockRoot" type="checkbox" checked>固定枝群根部</label>
    ${slider('deformFalloff', '根部过渡', 1, 0.2, 3, 0.1)}
    <div id="cageOptions">${slider('cageSpread', '横向展开', 1, 0.2, 2.5, 0.05)}${slider('cageStretch', '主轴拉长', 1, 0.3, 2, 0.05)}${slider('cageTwist', '渐变扭转（°）', 0, -150, 150, 1)}
    <label>控制点<select id="cageNode"></select></label><div class="field-grid">${['X', 'Y', 'Z'].map((a) => `<label>${a} 偏移（m）<input id="cageOffset${a}" type="number" min="-30" max="30" step="0.02" value="0"></label>`).join('')}</div></div>
    <div id="guideOptions"><div class="wb-tools">${iconButton('guideDraw', 'pencil', '重新绘制引导线')}${iconButton('guideFromBranch', 'spline', '采用当前枝条曲线')}<select id="guidePlane" aria-label="引导线绘制平面"><option value="VIEW">当前视图</option><option value="XZ">前视 XZ</option><option value="XY">俯视 XY</option><option value="YZ">侧视 YZ</option></select></div>
    ${slider('guideRoot', '根段跟随', 0, 0, 1, 0.05)}${slider('guideMiddle', '中段跟随', 0.65, 0, 1, 0.05)}${slider('guideTip', '末梢跟随', 1, 0, 1, 0.05)}
    <label class="wb-check"><input id="guideKeepLength" type="checkbox">保持控制段长度</label></div>
    <div id="spaceOptions"><label class="wb-check"><input id="spaceVoid" type="checkbox" checked>留白区域</label>${slider('spaceRadius', '留白半径（m）', 0.4, 0.02, 3, 0.02)}<div class="field-grid">${['X', 'Y', 'Z'].map((a) => `<label>中心 ${a}<input id="spaceCenter${a}" type="number" min="-30" max="30" step="0.05" value="0"></label>`).join('')}</div><label class="wb-check"><input id="spaceSeparate" type="checkbox" checked>疏开过近枝段</label>${slider('spaceClearance', '最小间距（m）', 0.1, 0.005, 1, 0.005)}${slider('spaceAmount', '疏开程度', 0.7, 0, 1, 0.05)}<label>保留骨架<select id="spaceMinOrder"><option value="0">全部可调整</option><option value="1" selected>保留主干</option><option value="2">保留主干及一级枝</option><option value="3">只调整末级枝</option></select></label><div class="wb-row"><button id="spaceInspect">检查空间过近</button><button id="spaceInspectView">检查视角遮挡</button></div><div id="spaceIssues"></div></div>
    <label class="wb-check"><input id="deformRetain" type="checkbox" checked>保留可编辑参数</label><div class="wb-row"><button id="deformApply"><i data-lucide="check"></i>应用造型</button>${iconButton('deformReset', 'rotate-ccw', '重置预览')}${iconButton('deformCancel', 'x', '取消造型')}</div>`;
  context.register('DEFORM', '枝群造型', panel);
  panel.querySelector('#deformApply').parentElement.classList.add('form-actions');
  const toolbar = document.createElement('div'); toolbar.className = 'shaping-viewport-tools';
  toolbar.innerHTML = `${iconButton('openBranchCage', 'box', '枝群变形笼')}${iconButton('openBranchGuide', 'spline', '枝势引导曲线')}${iconButton('openBranchSpace', 'scan', '疏密与留白')}${iconButton('openShapeStack', 'layers', '可编辑造型操作')}`;
  document.querySelector('.viewport-tool-rail').append(toolbar);
  const stack = document.createElement('div'); stack.id = 'retainedShapeStack'; context.register('STACK', '造型操作', stack);
  const voidSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0x65c6d0, transparent: true, opacity: 0.14, wireframe: true, depthWrite: false })); root.add(voidSphere);
  let mode = '', session = null, drag = null, drawing = false, selectedNode = 8, helperVisibility = [], editingId = '';
  const ray = new THREE.Raycaster();
  const editors = new Map(); let comparison = null;
  const targetOverlay = new THREE.Group(); targetOverlay.name = 'ShapeOperationTargets'; modelRoot.add(targetOverlay);
  function clearTargets() { targetOverlay.children.forEach((o) => { o.geometry.dispose(); o.material.dispose(); }); targetOverlay.clear(); }
  function highlight(targets) { clearTargets(); const asset = api.getAsset(); if (!asset) return; const ids = descendants(asset.masterBranches, new Set(targets)); asset.masterBranches.filter((b) => ids.has(b.stableId)).forEach((b) => { const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(b.points), new THREE.LineBasicMaterial({ color: 0x78c9d3, depthTest: false })); line.renderOrder = 120; targetOverlay.add(line); }); }
  function stopComparison() { if (!comparison) return; comparison.asset.group.visible = comparison.visible; modelRoot.remove(comparison.preview.group); disposeBranchAsset(comparison.preview); comparison = null; }
  function compareLayer(id) { stopComparison(); const asset = api.getAsset(), a = structuredClone(api.getAuthoring()); const layer = a.sculpt_layers.find((l) => l.id === id); if (!layer || asset.group.userData.pending_rebuild) return; layer.enabled = false; const preview = buildBranchAsset({ ...api.getSettings(), leaf_density: 0 }, null, [], 0, a, { skeletonOnly: asset.skeletonOnly === true }); comparison = { asset, visible: asset.group.visible, preview }; asset.group.visible = false; modelRoot.add(preview.group); }
  function disposeHandles() { handles.children.forEach((h) => { h.geometry.dispose(); h.material.dispose(); }); handles.clear(); }
  function selected() { return new Set(api.getSelections()); }
  const editable = id => api.isEditable?.(id) !== false;
  const editableLayer = layer => !!layer && [...(layer.operation?.targets || []), ...Object.keys(layer.branches || {}), ...(layer.operation?.stamps || []).map(s => s.branch)].every(editable);
  const writeLayer = (label, layer, mutate) => editableLayer(layer) && api.transact(label, mutate, { bypassLayers: true });
  function clearPreview() { session?.preview.restore(); session = null; }
  function init() {
    clearPreview(); const asset = api.getAsset(); if (!asset) return false;
    const a = api.getAuthoring(), layerIndex = a.sculpt_layers.findIndex((l) => l.id === editingId), layer = a.sculpt_layers[layerIndex];
    let inputBranches = asset.masterBranches;
    if (layer || a.symmetry_groups.length) { const input = buildBranchAsset({ ...api.getSettings(), leaf_density: 0 }, null, [], 0, { ...a, symmetry_groups: [], sculpt_layers: layer ? a.sculpt_layers.slice(0, layerIndex) : a.sculpt_layers }, { skeletonOnly: asset.skeletonOnly === true }); inputBranches = input.masterBranches; disposeBranchAsset(input); }
    const selection = selected();
    if (!selection.size || [...selection].some(id => !editable(id))) { api.toast('请先选择承重骨架；单元枝样式请在枝条工作台编辑'); return false; }
    const snapshot = createSculptSnapshot(inputBranches, a.overrides), cage = createBranchCage(new Map([...snapshot].filter(([, b]) => editable(b.stableId))), selection);
    if (!cage) { api.toast('请先选择需要调整的枝条'); return false; }
    const branch = inputBranches.find((b) => selection.has(b.stableId));
    session = { asset, snapshot, selection, cage, preview: createMeshPreview(asset, createSculptSnapshot(asset.masterBranches, a.overrides)), updated: snapshot, anchor: branch.points[0].clone(), tail: layer ? a.sculpt_layers.slice(layerIndex + 1) : [], strength: layer?.strength ?? 1,
      guide: Array.from({ length: 7 }, (_, i) => new THREE.CatmullRomCurve3(branch.controlPoints).getPoint(i / 6)) };
    ['cageSpread', 'cageStretch'].forEach((id) => $(id).value = 1); $('cageTwist').value = 0;
    selectedNode = mode === 'CAGE' ? 8 : 3;
    const op = layer?.operation;
    $('deformRetain').checked = true; $('deformRetain').disabled = Boolean(layer);
    if (op) {
      $('deformLockRoot').checked = op.keepRoots; $('deformFalloff').value = op.falloff;
      if (op.type === 'CAGE') session.cage = operationCage(op);
      if (op.type === 'GUIDE') { session.guide = op.guide.map((p) => new THREE.Vector3(...p)); session.anchor.fromArray(op.anchor); ['guideRoot', 'guideMiddle', 'guideTip'].forEach((id, i) => $(id).value = op.strengths[i]); $('guideKeepLength').checked = op.preserveLength; $('guidePlane').value = op.plane; }
    }
    const center = op?.center || cage.box.getCenter(new THREE.Vector3()).toArray();
    ['X', 'Y', 'Z'].forEach((v, i) => $('spaceCenter' + v).value = center[i]);
    for (const [id, key, fallback] of [['spaceRadius', 'radius', 0.4], ['spaceClearance', 'clearance', 0.1], ['spaceAmount', 'amount', 0.7], ['spaceMinOrder', 'minOrder', 1]]) $(id).value = op?.[key] ?? fallback;
    $('spaceVoid').checked = op?.voidEnabled !== false; $('spaceSeparate').checked = op?.spacingEnabled !== false;
    $('deformationCount').textContent = `${selection.size} 枝群`;
    redraw(); return true;
  }
  function activate(next, id = '') {
    if (editors.has(next)) return editors.get(next)(id);
    if (api.getAsset()?.group.userData.pending_rebuild) return api.toast('模型更新后可编辑造型');
    const layer = id && api.getAuthoring().sculpt_layers.find(l => l.id === id);
    if (layer && !editableLayer(layer)) return api.toast('此旧造型包含单元枝内部内容；整树中保留读取，样式请在枝条工作台编辑');
    if (!id && [...selected()].some(target => !editable(target))) return api.toast('单元枝只调整整支 G/R/S；内部造型请在枝条工作台编辑');
    api.setTool('SELECT'); editingId = id;
    if (id) api.setSelections(api.getAuthoring().sculpt_layers.find((l) => l.id === id)?.operation.targets || []);
    mode = next; drawing = false;
    if (!init()) { mode = ''; return; }
    root.visible = true; context.setMode('DEFORM');
    helperVisibility = (api.selectionHelpers || []).map((object) => [object, object.visible]); helperVisibility.forEach(([o]) => o.visible = false);
    $('shapingContextTitle').textContent = { CAGE: '枝群变形笼', GUIDE: '枝势引导曲线', SPACE: '疏密与留白' }[mode];
    $('cageOptions').hidden = mode !== 'CAGE'; $('guideOptions').hidden = mode !== 'GUIDE';
    $('spaceOptions').hidden = mode !== 'SPACE'; $('spaceIssues').replaceChildren();
    $('openBranchCage').classList.toggle('active', mode === 'CAGE'); $('openBranchGuide').classList.toggle('active', mode === 'GUIDE');
    if (id) preview();
    session.originalOperation = JSON.stringify(operation());
  }
  function release() { const id = drag?.pointer; drag = null; if (id != null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); controls.enabled = true; }
  function deactivate() { stopComparison(); clearTargets(); release(); clearPreview(); helperVisibility.forEach(([o, visible]) => o.visible = visible); helperVisibility = []; mode = ''; root.visible = false; drawing = false; $('openBranchCage').classList.remove('active'); $('openBranchGuide').classList.remove('active'); }
  function cancel() { if (!mode) return false; deactivate(); context.setMode(''); return true; }
  function syncFields() {
    panel.querySelectorAll('input[type="range"]').forEach((i) => { i.previousElementSibling.textContent = i.value; });
    const cage = session?.cage; if (!cage) return;
    const select = $('cageNode'); select.replaceChildren(...cage.nodes.map((_, i) => new Option(`${i + 1}`, i))); select.value = selectedNode;
    ['X', 'Y', 'Z'].forEach((a, i) => { $('cageOffset' + a).value = (cage.nodes[selectedNode]?.getComponent(i) - cage.rest[selectedNode]?.getComponent(i) || 0).toFixed(3); });
  }
  function redraw() {
    if (!session) return;
    disposeHandles(); const nodes = mode === 'CAGE' ? session.cage.nodes : mode === 'GUIDE' ? session.guide : [new THREE.Vector3(...['X', 'Y', 'Z'].map((a) => +$('spaceCenter' + a).value))];
    voidSphere.visible = mode === 'SPACE' && $('spaceVoid').checked; if (voidSphere.visible) { voidSphere.position.copy(nodes[0]); voidSphere.scale.setScalar(+$('spaceRadius').value); }
    const radius = session.cage.box.getSize(new THREE.Vector3()).length() * 0.012;
    nodes.forEach((p, index) => { const h = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), new THREE.MeshBasicMaterial({ color: index === selectedNode ? 0xf5cd70 : 0x79c8d8, depthTest: false })); h.position.copy(p); h.userData.node = index; h.renderOrder = 111; handles.add(h); });
    const edges = [];
    if (mode === 'CAGE') for (let i = 0; i < 12; i++) {
      if (i % 2 === 0) edges.push(nodes[i], nodes[i + 1]);
      if (Math.floor(i / 2) % 2 === 0) edges.push(nodes[i], nodes[i + 2]);
      if (i < 8) edges.push(nodes[i], nodes[i + 4]);
    }
    lines.geometry.dispose(); lines.geometry = new THREE.BufferGeometry().setFromPoints(edges); lines.visible = mode === 'CAGE';
    path.geometry.dispose(); path.geometry = new THREE.BufferGeometry().setFromPoints(mode === 'GUIDE' ? new THREE.CatmullRomCurve3(nodes).getPoints(80) : []); path.visible = mode === 'GUIDE';
    syncFields();
  }
  function preview() {
    if (!session) return;
    const updated = evaluateShapeOperation([...session.snapshot.values()], operation(), session.strength, api.getAuthoring().overrides);
    applySculptLayers(updated, session.tail, api.getAuthoring().overrides);
    applyBranchSymmetry(updated, api.getAuthoring().symmetry_groups);
    session.updated = new Map(updated.map((b) => [b.id, b]));
    session.preview.update(session.updated); $('deformationState').textContent = '预览中'; redraw();
  }
  function apply() {
    if (!session || drag) return false;
    if ([...session.selection].some(id => !editable(id))) { cancel(); return false; }
    if ($('deformRetain').checked) {
      const op = operation(), id = editingId, name = { CAGE: '变形笼', GUIDE: '引导曲线', SPACE: '疏密留白' }[mode];
      deactivate(); context.setMode('STACK');
      api.transact('保存可编辑造型', (a) => { const existing = a.sculpt_layers.find((l) => l.id === id); if (existing) { existing.operation = op; existing.enabled = true; } else a.sculpt_layers.push({ id: 'SHAPE_' + crypto.randomUUID().replaceAll('-', ''), name, enabled: true, strength: 1, operation: op, branches: {} }); }, { bypassLayers: true });
      drawStack(); return true;
    }
    const overrides = Object.fromEntries(Object.entries(bundleOverrides(session.snapshot, session.updated, api.getAuthoring().overrides)).filter(([id]) => editable(id)));
    const label = mode === 'CAGE' ? '应用枝群变形笼' : '应用枝势引导曲线';
    deactivate(); context.setMode('');
    if (Object.keys(overrides).length) api.transact(label, (a) => { Object.assign(a.overrides, overrides); a.curve_editor.affect_children = true; });
    return true;
  }
  function operation() {
    return normalizeShapeOperation({ type: mode, targets: [...session.selection], protect_units: document.body.dataset.workbench === 'TREE', keepRoots: $('deformLockRoot').checked, falloff: +$('deformFalloff').value,
      preserveLength: mode === 'GUIDE' && $('guideKeepLength').checked, rest: session.cage.rest.map((p) => p.toArray()), nodes: session.cage.nodes.map((p) => p.toArray()), axis: session.cage.axis,
      guide: session.guide.map((p) => p.toArray()), anchor: session.anchor.toArray(), strengths: ['guideRoot', 'guideMiddle', 'guideTip'].map((id) => +$(id).value), plane: $('guidePlane').value,
      center: ['X', 'Y', 'Z'].map((v) => +$('spaceCenter' + v).value), radius: +$('spaceRadius').value, clearance: +$('spaceClearance').value, amount: +$('spaceAmount').value, minOrder: +$('spaceMinOrder').value,
      voidEnabled: $('spaceVoid').checked, spacingEnabled: $('spaceSeparate').checked });
  }
  const layerWindow=createSculptLayerWindow();
  let stackDocument=null,stackBranches=null,stackPolicy='';
  function drawStack(force=false) {
    if (api.isEditing()) return;
    const authoring=api.getAuthoring(),branches=api.getAsset()?.masterBranches,policy=branches?.filter(b=>!editable(b.stableId)).map(b=>b.stableId).join('|')||'';
    if(!force&&stackDocument===authoring&&stackBranches===branches&&stackPolicy===policy)return;
    stackDocument=authoring;stackBranches=branches;stackPolicy=policy;
    stack.replaceChildren(); const layers = authoring.sculpt_layers;
    for (const [index, layer] of layerWindow(stack,layers,()=>drawStack(true),{operationsOnly:true})) {
      if (!layer.operation) continue;
      const row = document.createElement('div'); row.className = 'retained-operation'; row.dataset.operation = layer.id;
      row.innerHTML = `<div class="wb-tools"><input type="checkbox" aria-label="启用造型"><input type="text" aria-label="造型名称"><button data-edit title="重新编辑参数"><i data-lucide="pencil"></i></button><button data-copy title="复制造型"><i data-lucide="copy"></i></button></div><label>强度<input data-strength type="range" min="0" max="1" step="0.01" aria-label="造型强度"></label><div class="wb-tools"><span></span><button data-up title="上移"><i data-lucide="chevron-up"></i></button><button data-down title="下移"><i data-lucide="chevron-down"></i></button><button data-delete title="删除"><i data-lucide="trash-2"></i></button></div>`;
      const find = (a) => a.sculpt_layers.find((l) => l.id === layer.id);
      const enabled = row.querySelector('input[type="checkbox"]'); enabled.checked = layer.enabled; enabled.onchange = () => writeLayer('切换造型', layer, (a) => find(a).enabled = enabled.checked);
      const name = row.querySelector('input[type="text"]'); name.value = layer.name; name.onchange = () => writeLayer('重命名造型', layer, (a) => find(a).name = name.value);
      const strength = row.querySelector('[data-strength]'); strength.value = layer.strength; strength.oninput = () => { if (!editableLayer(layer)) return; api.begin(); api.preview((a) => find(a).strength = +strength.value); }; strength.onchange = () => { api.commit(); drawStack(); };
      row.querySelector('[data-edit]').disabled = ['DUPLICATE','ROOT_SCALE','POINT_ROTATE','POINT_SCALE','POINT_SLIDE','RADIUS'].includes(layer.operation.type);
      row.querySelector('[data-edit]').onclick = () => { if (!editableLayer(layer)) return; return ['QUICK','MOUNT'].includes(layer.operation.type) ? document.dispatchEvent(new CustomEvent(layer.operation.type === 'MOUNT' ? 'branch-mount-edit' : 'branch-quick-edit', {detail:layer.id})) : activate(layer.operation.type, layer.id); };
      row.querySelector('[data-copy]').onclick = () => writeLayer('复制造型操作', layer, (a) => { a.sculpt_layers.splice(index + 1, 0, { ...structuredClone(layer), id: 'SHAPE_' + crypto.randomUUID().replaceAll('-', ''), name: layer.name + ' 副本' }); });
      for (const [key, delta] of [['up', -1], ['down', 1]]) { const b = row.querySelector('[data-' + key + ']'); b.disabled = index + delta < 0 || index + delta >= layers.length || !editableLayer(layers[index + delta]); b.onclick = () => { if (!layers[index + delta] || !editableLayer(layers[index + delta])) return; writeLayer('调整造型顺序', layer, (a) => { [a.sculpt_layers[index], a.sculpt_layers[index + delta]] = [a.sculpt_layers[index + delta], a.sculpt_layers[index]]; }); }; }
      row.querySelector('[data-delete]').onclick = () => writeLayer('删除造型操作', layer, (a) => a.sculpt_layers.splice(index, 1));
      const missing = layer.operation.targets.filter((id) => !api.getAsset()?.masterBranches.some((b) => b.stableId === id)).length;
      const tools = document.createElement('div'); tools.className = 'wb-tools';
      tools.innerHTML = '<button data-focus title="高亮作用枝群"><i data-lucide="scan-eye"></i></button><button data-compare title="按住查看此操作之前"><i data-lucide="columns-2"></i></button><button data-add-target title="加入当前选择"><i data-lucide="list-plus"></i></button><button data-remove-target title="移除当前选择"><i data-lucide="list-minus"></i></button>';
      tools.querySelector('[data-focus]').onclick = () => highlight(layer.operation.targets);
      const compare = tools.querySelector('[data-compare]'); compare.onpointerdown = (e) => { compareLayer(layer.id); compare.setPointerCapture(e.pointerId); }; compare.onpointerup = stopComparison; compare.onlostpointercapture = stopComparison; compare.onblur = stopComparison;
      tools.querySelector('[data-add-target]').onclick = () => writeLayer('加入造型目标', layer, (a) => find(a).operation.targets = [...new Set([...find(a).operation.targets, ...[...api.getSelections()].filter(editable)])]);
      tools.querySelector('[data-remove-target]').onclick = () => writeLayer('移除造型目标', layer, (a) => find(a).operation.targets = find(a).operation.targets.filter((id) => !api.getSelections().has(id)));
      if (['MOUNT','DUPLICATE'].includes(layer.operation.type)) {
        strength.disabled = true;
        for (const key of ['copy','up','down']) row.querySelector(`[data-${key}]`).disabled = true;
        for (const key of ['add-target','remove-target']) tools.querySelector(`[data-${key}]`).disabled = true;
        row.querySelector('[data-edit]').title = '调整当前枝束挂接';
      }
      const targets = document.createElement('details'); targets.className = 'operation-targets'; const summary = document.createElement('summary'); summary.textContent = '作用目标'; targets.append(summary);
      let targetsReady=false;targets.addEventListener('toggle',()=>{
        if(!targets.open||targetsReady)return;targetsReady=true;
        layer.operation.targets.forEach((target) => { const entry = document.createElement('div'); entry.className = 'wb-tools'; const select = document.createElement('select'); select.setAttribute('aria-label', `重新绑定 ${target}`); select.add(new Option(target, target)); for (const b of api.getAsset()?.masterBranches || []) if (b.stableId !== target && !b.symmetryGroup && editable(b.stableId)) select.add(new Option(b.stableId, b.stableId)); select.value = target; select.disabled=!editableLayer(layer);select.onchange = () => { if (!editable(select.value)) return; writeLayer('重新绑定造型目标', layer, (a) => { const op = find(a).operation; op.targets = [...new Set(op.targets.map((id) => id === target ? select.value : id))]; if (op.stamps) op.stamps.forEach((s) => { if (s.branch === target) s.branch = select.value; }); }); }; entry.append(select); targets.append(entry); });
      });
      row.append(tools, targets);
      if (!editableLayer(layer)) { row.title = '旧工程单元枝内部造型只读保留；在枝条工作台编辑样式'; row.querySelectorAll('input,select,button:not([data-focus]):not([data-compare])').forEach(control => control.disabled = true); }
      row.querySelector('span').textContent = `${index + 1} · ${layer.operation.targets.length} 目标${missing ? ` · ${missing} 缺失` : ''}`; stack.append(row);
    }
    const bake = document.createElement('button'); bake.textContent = '合并可见造型与雕刻层'; bake.disabled = !layers.some((l) => l.enabled) || requiresRetainedLayers(layers); bake.title = '可继续编辑，较早记录自动折叠；挂接与粗细操作保留原始记录'; bake.onclick = () => $('bakeSculptLayers').click(); stack.append(bake); window.lucide?.createIcons({ nodes: [stack] });
  }
  function cast(e) { const r = canvas.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera); }
  function hitPoint(e, plane) { cast(e); const p = ray.ray.intersectPlane(plane, new THREE.Vector3()); return p ? modelRoot.worldToLocal(p) : null; }
  function begin(e) {
    if (!mode || e.button !== 0) return false;
    if (!session || api.getAsset().group.userData.pending_rebuild) return true;
    cast(e); root.updateWorldMatrix(true, true);
    const hit = ray.intersectObjects(handles.children)[0];
    if (!hit && !(mode === 'GUIDE' && drawing)) return true;
    const p = hit ? hit.object.getWorldPosition(new THREE.Vector3()) : modelRoot.localToWorld(session.guide[0].clone());
    const key = $('guidePlane').value;
    const normal = mode === 'GUIDE' && drawing && key !== 'VIEW' ? new THREE.Vector3(...{ XZ: [0, -1, 0], XY: [0, 0, 1], YZ: [1, 0, 0] }[key]).transformDirection(modelRoot.matrixWorld) : camera.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, p), point = hitPoint(e, plane);
    if (!point) return true;
    selectedNode = hit?.object.userData.node ?? 0;
    drag = { pointer: e.pointerId, plane, start: point, nodes: (mode === 'CAGE' ? session.cage.nodes : mode === 'GUIDE' ? session.guide : [voidSphere.position]).map((p) => p.clone()), stroke: drawing ? [point] : null };
    controls.enabled = false; canvas.setPointerCapture(e.pointerId); return true;
  }
  function move(e) {
    if (!mode) return false;
    if (!drag) return true;
    const p = hitPoint(e, drag.plane); if (!p) return true;
    if (drag.stroke) {
      if (p.distanceTo(drag.stroke.at(-1)) > 0.01 && drag.stroke.length < 256) drag.stroke.push(p);
      if (drag.stroke.length > 1) session.guide = new THREE.CatmullRomCurve3(drag.stroke).getPoints(6).map((p) => p.sub(drag.stroke[0]).add(session.anchor));
    } else if (mode === 'SPACE') { const center = drag.nodes[0].clone().add(p.sub(drag.start)); ['X', 'Y', 'Z'].forEach((a, i) => $('spaceCenter' + a).value = center.getComponent(i)); }
    else { const nodes = mode === 'CAGE' ? session.cage.nodes : session.guide; nodes[selectedNode].copy(drag.nodes[selectedNode]).add(p.sub(drag.start)); }
    preview(); return true;
  }
  function end(e) { if (!mode || e.button !== 0) return false; if (drag) { move(e); release(); drawing = false; $('guideDraw').classList.remove('active'); } return true; }
  $('openBranchCage').onclick = () => activate('CAGE'); $('openBranchGuide').onclick = () => activate('GUIDE');
  $('openBranchSpace').onclick = () => activate('SPACE'); $('openShapeStack').onclick = () => { api.setTool('SELECT'); context.setMode('STACK'); drawStack(); };
  for (const id of ['spaceVoid', 'spaceSeparate', 'spaceRadius', 'spaceClearance', 'spaceAmount', 'spaceMinOrder', 'spaceCenterX', 'spaceCenterY', 'spaceCenterZ']) $(id).oninput = () => { if ($(id).value !== '' && $(id).validity.valid) preview(); };
  for (const [id, screen] of [['spaceInspect', false], ['spaceInspectView', true]]) $(id).onclick = () => {
    if (!session) return; const bounds = canvas.getBoundingClientRect();
    const project = (point) => { const p = modelRoot.localToWorld(point.clone()).project(camera); return new THREE.Vector2(p.x * bounds.width / 2, p.y * bounds.height / 2); };
    const issues = inspectBranchSpacing([...session.updated.values()], screen ? 10 : +$('spaceClearance').value, screen ? project : null); $('spaceIssues').replaceChildren();
    if (!issues.length) $('spaceIssues').textContent = '未发现接近项';
    issues.slice(0, 30).forEach((issue) => { const b = document.createElement('button'); b.textContent = `${issue.a} / ${issue.b}`; b.title = screen ? '当前视角接近' : `间距约 ${issue.distance.toFixed(3)} m`; b.onclick = () => { const center = new THREE.Vector3(...issue.point); ['X', 'Y', 'Z'].forEach((a, i) => $('spaceCenter' + a).value = center.getComponent(i)); preview(); }; $('spaceIssues').append(b); });
  };
  $('deformApply').onclick = apply; $('deformCancel').onclick = cancel; $('deformReset').onclick = () => { release(); init(); $('deformationState').textContent = ''; };
  $('cageNode').onchange = () => { selectedNode = +$('cageNode').value; redraw(); };
  ['X', 'Y', 'Z'].forEach((a, index) => { $('cageOffset' + a).oninput = () => { const i = $('cageOffset' + a); if (!session || !i.validity.valid || i.value === '') return; session.cage.nodes[selectedNode].setComponent(index, session.cage.rest[selectedNode].getComponent(index) + +i.value); preview(); }; });
  ['cageSpread', 'cageStretch', 'cageTwist'].forEach((id) => { $(id).oninput = () => {
    if (!session) return; const { cage } = session, center = cage.box.getCenter(new THREE.Vector3()), axis = cage.rest[8].clone().sub(cage.rest[0]).normalize();
    cage.nodes = cage.rest.map((p, i) => { const d = p.clone().sub(center), along = axis.clone().multiplyScalar(d.dot(axis)); d.sub(along).multiplyScalar(+$('cageSpread').value).add(along.multiplyScalar(+$('cageStretch').value)); return d.applyAxisAngle(axis, +$('cageTwist').value * Math.PI / 180 * Math.floor(i / 4) / 2).add(center); }); preview();
  }; });
  ['deformLockRoot', 'deformFalloff', 'guideRoot', 'guideMiddle', 'guideTip', 'guideKeepLength'].forEach((id) => $(id).oninput = preview);
  $('guideDraw').onclick = () => { drawing = !drawing; $('guideDraw').classList.toggle('active', drawing); };
  $('guideFromBranch').onclick = () => init();
  window.addEventListener('blur', () => { if (drag) cancel(); });
  canvas.addEventListener('pointercancel', () => { if (drag) cancel(); });
  canvas.addEventListener('lostpointercapture', () => { if (drag) cancel(); });
  root.visible = false;
  return { root, handles, activate, deactivate, cancel, apply, begin, move, end, registerEditor(type, editor) { editors.set(type, editor); },
    get active() { return Boolean(mode); }, get dragging() { return Boolean(drag); }, get session() { return session; },
    get dirty() { return Boolean(mode && session) && session.originalOperation !== JSON.stringify(operation()); },
    refresh() { if (comparison && comparison.asset !== api.getAsset()) stopComparison(); if (session && (session.asset !== api.getAsset() || JSON.stringify([...session.selection]) !== JSON.stringify([...selected()]))) cancel(); drawStack(); },
    key(e) { if (!mode) return false; if (e.key === 'Escape') return cancel(); if (e.key === 'Enter' && !e.target.matches?.('input,select,textarea')) { apply(); return true; } return false; },
  };
}
