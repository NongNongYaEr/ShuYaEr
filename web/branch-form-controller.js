import * as THREE from 'three';
import { buildBranchAsset, disposeBranchAsset } from './branch-kernel.js';
import { normalizeShapeOperation } from './shape-operation-data.js';
import { sampleLine, nearestParameter } from './tree-sculpt.js';
import { descendants } from './branch-selection.js';

const $ = (id) => document.getElementById(id);
const slider = (id, label, value, min, max, step) => `<label>${label}<output for="${id}">${value}</output><input id="${id}" type="range" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
export function createBranchFormTools(api, context, deformation) {
  const { canvas, camera, controls, modelRoot } = api;
  const panel = document.createElement('div'); panel.id = 'branchFormContext';
  panel.innerHTML = `<strong id="formTarget"></strong><div id="poseOptions"><label>姿态模式<select id="poseMode"><option value="BEND">整枝弯曲</option><option value="HINGE">单段弯折</option><option value="TWIST">渐进扭转</option></select></label><label class="wb-check"><input id="poseLockMiddle" type="checkbox">固定中段之前</label>${slider('posePivot', '固定段末端', 0.4, 0, 0.85, 0.01)}${slider('poseFalloff', '影响衰减', 1, 0.2, 3, 0.1)}<label class="wb-check"><input id="poseKeepLength" type="checkbox" checked>保持控制段长度</label><div class="field-grid">${['X', 'Y', 'Z'].map((a) => `<label>末梢 ${a} 偏移<input id="poseOffset${a}" type="number" min="-30" max="30" step="any" value="0"></label>`).join('')}</div>${slider('poseTwist', '扭转角度（°）', 0, -180, 180, 1)}</div><div id="volumeOptions"><div class="form-brush-modes" role="group" aria-label="体积画笔">${[['INFLATE', 'plus', '增粗'], ['DEFLATE', 'minus', '收细'], ['FLATTEN', 'minimize-2', '压扁'], ['SMOOTH', 'waves', '粗细平滑']].map(([mode, icon, label]) => `<button data-volume-mode="${mode}" title="${label}" aria-label="${label}"><i data-lucide="${icon}"></i></button>`).join('')}</div>${slider('volumeWidth', '沿枝范围', 0.15, 0.02, 0.6, 0.01)}${slider('volumeAmount', '笔迹强度', 0.3, 0.01, 1, 0.01)}<label class="wb-check"><input id="volumeKeepRoot" type="checkbox" checked>保护根部截面</label>${slider('volumeT', '沿枝位置', 0.5, 0, 1, 0.01)}<div class="wb-row"><button id="volumeStamp"><i data-lucide="paintbrush"></i>应用一笔</button><button id="volumeUndo" title="撤回上一笔"><i data-lucide="undo-2"></i></button></div><span id="volumeCount"></span></div><label class="wb-check"><input id="formCompare" type="checkbox">显示调整前</label><div class="wb-row form-actions"><button id="formApply"><i data-lucide="check"></i>应用造型</button><button id="formReset" title="重置预览"><i data-lucide="rotate-ccw"></i></button><button id="formCancel" title="取消造型"><i data-lucide="x"></i></button></div>`;
  context.register('FORM', '枝条精修', panel);
  const toolbar = document.createElement('div'); toolbar.className = 'shaping-viewport-tools'; toolbar.innerHTML = '<button id="openBranchPose" title="枝段姿态手柄"><i data-lucide="bone"></i></button><button id="openBranchVolume" title="体积造型画笔"><i data-lucide="paintbrush"></i></button>'; document.querySelector('.viewport-tool-rail').append(toolbar);
  const root = new THREE.Group(); root.name = 'BranchFormHelpers'; modelRoot.add(root);
  const handles = new THREE.Group(); root.add(handles);
  const cursor = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({ color: 0x78c9d3, transparent: true, opacity: 0.2, wireframe: true, depthWrite: false })); root.add(cursor); root.visible = false;
  const ray = new THREE.Raycaster(); let session = null, drag = null, ghost = null, timer = null, brush = 'INFLATE', lastStamp = null;
  const editable = id => api.isEditable?.(id) !== false;
  function disposeGhost() { if (ghost) { root.remove(ghost.group); disposeBranchAsset(ghost); ghost = null; } }
  function clearHandles() { for (const h of handles.children) { h.geometry.dispose(); h.material.dispose(); } handles.clear(); }
  function operation() {
    return normalizeShapeOperation(session.type === 'POSE' ? { ...session.op, protect_units: document.body.dataset.workbench === 'TREE', mode: $('poseMode').value, lockMiddle: $('poseLockMiddle').checked, pivot: +$('posePivot').value, falloff: +$('poseFalloff').value, preserveLength: $('poseKeepLength').checked, offset: ['X', 'Y', 'Z'].map((a) => +$('poseOffset' + a).value), twist: +$('poseTwist').value }
      : { ...session.op, protect_units: document.body.dataset.workbench === 'TREE', keepRoots: $('volumeKeepRoot').checked });
  }
  function documentForPreview() {
    const a = structuredClone(session.authoring), layer = a.sculpt_layers.find((l) => l.id === session.id);
    if (layer) { layer.operation = operation(); layer.enabled = true; }
    else a.sculpt_layers.push({ id: 'FORM_PREVIEW', name: 'preview', enabled: true, strength: 1, branches: {}, operation: operation() });
    return a;
  }
  function fields() {
    panel.querySelectorAll('input[type="range"]').forEach((i) => i.previousElementSibling.textContent = i.value);
    panel.querySelectorAll('[data-volume-mode]').forEach((b) => b.classList.toggle('active', b.dataset.volumeMode === brush));
    if (session) { $('volumeCount').textContent = `${session.op.stamps?.length || 0} / 256 笔`; $('volumeUndo').disabled = !session.op.stamps?.length; }
  }
  function draw() {
    if (!session) return; clearHandles(); const b = session.branch, size = Math.max(0.015, b.length * 0.023), op = operation();
    const add = (p, color, index) => { const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 14, 10), new THREE.MeshBasicMaterial({ color, depthTest: false })); mesh.position.copy(p); mesh.userData.handle = index; mesh.renderOrder = 115; handles.add(mesh); };
    if (session.type === 'POSE') {
      const pivot = op.lockMiddle ? Math.min(b.controlPoints.length - 2, Math.round(op.pivot * (b.controlPoints.length - 1))) : 0;
      add(b.controlPoints[0], 0xcf9270, 0); if (pivot) add(b.controlPoints[pivot], 0xe6c566, 1);
      add(b.controlPoints.at(-1).clone().add(new THREE.Vector3(...op.offset)), 0x7dd1dd, 2);
      const points = ghost?.masterBranches.find((v) => v.stableId === b.stableId)?.points || b.points;
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x78c9d3, depthTest: false })); handles.add(line);
      if (op.mode !== 'TWIST') { const target = b.controlPoints.at(-1).clone().add(new THREE.Vector3(...op.offset)), tether = new THREE.Line(new THREE.BufferGeometry().setFromPoints([points.at(-1), target]), new THREE.LineDashedMaterial({ color: 0x78c9d3, dashSize: size, gapSize: size * 0.6, transparent: true, opacity: 0.65, depthTest: false })); tether.computeLineDistances(); handles.add(tether); }
    }
    cursor.visible = session.type === 'VOLUME'; if (cursor.visible) { cursor.position.copy(sampleLine(b.points, +$('volumeT').value)); cursor.scale.setScalar(Math.max(0.02, b.length * +$('volumeWidth').value * 0.35)); }
    fields();
  }
  function rebuild() {
    clearTimeout(timer); timer = null; if (!session) return;
    if (session.op.targets.some(id => !editable(id))) { cancel(); return; }
    try { const built = buildBranchAsset({ ...api.getSettings(), leaf_density: 0 }, null, [], 0, documentForPreview(), { skeletonOnly: api.getAsset()?.skeletonOnly === true }); disposeGhost(); ghost = built; root.add(ghost.group); session.asset.group.visible = $('formCompare').checked; ghost.group.visible = !$('formCompare').checked; draw(); }
    catch (error) { cancel(); api.toast(error.message, true); }
  }
  function preview() { if (!session) return; fields(); clearTimeout(timer); timer = setTimeout(rebuild, 60); }
  function open(type, id = '') {
    api.setTool('SELECT'); const a = api.getAuthoring(), existing = a.sculpt_layers.find((l) => l.id === id);
    const targets = existing?.operation.targets || [...api.getSelections()];
    if (!targets.length) return api.toast('请先选择枝条');
    if ([...targets, ...Object.keys(existing?.branches || {}), ...(existing?.operation.stamps || []).map(s => s.branch)].some(id => !editable(id))) return api.toast('单元枝只调整整支 G/R/S；内部造型请在枝条工作台编辑');
    if (api.getAsset().group.userData.pending_rebuild) return api.toast('模型更新后可精修');
    let input = api.getAsset().masterBranches;
    if (existing) { const built = buildBranchAsset({ ...api.getSettings(), leaf_density: 0 }, null, [], 0, { ...a, symmetry_groups: [], sculpt_layers: a.sculpt_layers.slice(0, a.sculpt_layers.indexOf(existing)) }, { skeletonOnly: api.getAsset()?.skeletonOnly === true }); input = built.masterBranches; disposeBranchAsset(built); }
    const branch = input.find((b) => targets.includes(b.stableId) && !b.symmetryGroup); if (!branch) return api.toast('造型目标缺失，请重新绑定');
    const op = existing?.operation || normalizeShapeOperation({ type, targets, stamps: [] });
    session = { id, type, op: structuredClone(op), original: structuredClone(op), branch, authoring: structuredClone(a), asset: api.getAsset(), visibility: api.getAsset().group.visible, ids: new Set([...descendants(input, new Set(targets))].filter(editable)) };
    session.helpers = (api.selectionHelpers || []).map((helper) => [helper, helper.visible]); session.helpers.forEach(([helper]) => helper.visible = false);
    $('poseOptions').hidden = type !== 'POSE'; $('volumeOptions').hidden = type !== 'VOLUME'; $('formCompare').checked = false; $('formTarget').textContent = `${targets.length} 个目标 · ${branch.stableId}`;
    if (type === 'POSE') { $('poseMode').value = op.mode; $('poseLockMiddle').checked = op.lockMiddle; $('posePivot').value = op.pivot; $('poseFalloff').value = op.falloff; $('poseKeepLength').checked = op.preserveLength; $('poseTwist').value = op.twist; ['X', 'Y', 'Z'].forEach((v, i) => $('poseOffset' + v).value = op.offset[i]); }
    else $('volumeKeepRoot').checked = op.keepRoots;
    context.setMode('FORM'); $('shapingContextTitle').textContent = type === 'POSE' ? '枝段姿态' : '体积造型'; $('openBranchPose').classList.toggle('active', type === 'POSE'); $('openBranchVolume').classList.toggle('active', type === 'VOLUME'); root.visible = true; rebuild();
  }
  function release() { const id = drag?.id; drag = null; lastStamp = null; controls.enabled = true; if (id != null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); }
  function cancel() { if (!session) return false; release(); clearTimeout(timer); timer = null; session.asset.group.visible = session.visibility; session.helpers.forEach(([helper, visible]) => helper.visible = visible); session = null; disposeGhost(); clearHandles(); root.visible = false; $('openBranchPose').classList.remove('active'); $('openBranchVolume').classList.remove('active'); if (context.mode === 'FORM') context.setMode(''); return true; }
  function apply() { if (!session || drag) return; if (session.op.targets.some(id => !editable(id))) { cancel(); return; } const op = operation(), id = session.id, type = session.type; cancel(); api.transact('保存枝条精修', (a) => { const layer = a.sculpt_layers.find((l) => l.id === id); if (layer) { layer.operation = op; layer.enabled = true; } else a.sculpt_layers.push({ id: 'FORM_' + crypto.randomUUID().replaceAll('-', ''), name: type === 'POSE' ? '枝段姿态' : '体积笔迹', enabled: true, strength: 1, branches: {}, operation: op }); }, { bypassLayers: true }); context.setMode('STACK'); }
  function cast(event) { const r = canvas.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((event.clientX - r.x) / r.width * 2 - 1, -(event.clientY - r.y) / r.height * 2 + 1), camera); }
  function hitBranch(event) { cast(event); const meshes = []; (ghost || session?.asset)?.group.traverse((o) => { if (o.isMesh && o.visible && o.userData.category === 'branch' && session.ids.has(o.userData.stable_id)) meshes.push(o); }); const hit = ray.intersectObjects(meshes)[0]; if (!hit) return null; const b = (ghost || session.asset).masterBranches.find((b) => b.stableId === hit.object.userData.stable_id); return { b, t: nearestParameter(b.points, modelRoot.worldToLocal(hit.point.clone())) }; }
  function stamp(hit, force = false) { if (!session || !hit || !editable(hit.b.stableId) || session.op.stamps.length >= 256) return; if (!force && lastStamp?.branch === hit.b.stableId && Math.abs(lastStamp.t - hit.t) < +$('volumeWidth').value * 0.25) return; const item = { branch: hit.b.stableId, t: hit.t, width: +$('volumeWidth').value, amount: +$('volumeAmount').value, mode: brush }; session.op.stamps.push(item); lastStamp = item; $('volumeT').value = hit.t; session.branch = hit.b; preview(); }
  function begin(e) {
    if (!session || e.button !== 0) return false; if ($('formCompare').checked) return true;
    if (session.type === 'VOLUME') { const hit = hitBranch(e); if (hit) { drag = { id: e.pointerId }; controls.enabled = false; canvas.setPointerCapture(e.pointerId); stamp(hit, true); } return true; }
    cast(e); root.updateWorldMatrix(true, true); const hit = ray.intersectObjects(handles.children).find((h) => h.object.userData.handle === 2); if (!hit) return true;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), hit.object.getWorldPosition(new THREE.Vector3()));
    const p = ray.ray.intersectPlane(plane, new THREE.Vector3()); if (!p) return true;
    drag = { id: e.pointerId, plane, start: modelRoot.worldToLocal(p), offset: new THREE.Vector3(...operation().offset) }; controls.enabled = false; canvas.setPointerCapture(e.pointerId); return true;
  }
  function move(e) {
    if (!session) return false;
    if (session.type === 'VOLUME') { const hit = hitBranch(e); if (drag) stamp(hit); else if (hit) { cursor.position.copy(sampleLine(hit.b.points, hit.t)); cursor.scale.setScalar(Math.max(0.02, hit.b.length * +$('volumeWidth').value * 0.35)); } return true; }
    if (!drag) return true; cast(e); const p = ray.ray.intersectPlane(drag.plane, new THREE.Vector3()); if (p) { const offset = modelRoot.worldToLocal(p).sub(drag.start).add(drag.offset); ['X', 'Y', 'Z'].forEach((v, i) => $('poseOffset' + v).value = +offset.getComponent(i).toFixed(4)); preview(); } return true;
  }
  function end(e) { if (!session || e.button !== 0) return false; if (drag) { move(e); release(); rebuild(); } return true; }
  panel.querySelectorAll('#poseOptions input, #poseOptions select, #volumeKeepRoot').forEach((input) => input.oninput = () => { if (input.value !== '' && input.validity.valid) preview(); });
  for (const id of ['volumeWidth', 'volumeAmount', 'volumeT']) $(id).oninput = () => { fields(); draw(); };
  panel.querySelectorAll('[data-volume-mode]').forEach((b) => b.onclick = () => { brush = b.dataset.volumeMode; fields(); });
  $('volumeStamp').onclick = () => stamp({ b: session.branch, t: +$('volumeT').value }, true);
  $('volumeUndo').onclick = () => { session.op.stamps.pop(); preview(); };
  $('formCompare').onchange = () => { if (!session) return; session.asset.group.visible = $('formCompare').checked; if (ghost) ghost.group.visible = !$('formCompare').checked; };
  $('formApply').onclick = apply; $('formCancel').onclick = () => { cancel(); context.setMode(''); }; $('formReset').onclick = () => { const { type, id } = session; open(type, id); };
  $('openBranchPose').onclick = () => open('POSE'); $('openBranchVolume').onclick = () => open('VOLUME');
  deformation.registerEditor('POSE', (id) => open('POSE', id)); deformation.registerEditor('VOLUME', (id) => open('VOLUME', id));
  for (const event of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => { if (drag) { cancel(); context.setMode(''); } }); window.addEventListener('blur', () => { if (drag) cancel(); });
  return { open, cancel, begin, move, end, apply, root, handles, get dirty() { return !!session && JSON.stringify(operation()) !== JSON.stringify(session.original); }, get pending() { return Boolean(timer); }, get active() { return Boolean(session); }, get session() { return session; }, get ghost() { return ghost; }, refresh() { if (session && (session.asset !== api.getAsset() || session.op.targets.some(id => !editable(id)) || [...api.getSelections()].some(id => !editable(id)))) cancel(); }, key(e) { if (!session) return false; if (e.key === 'Escape') { cancel(); context.setMode(''); return true; } if (e.key === 'Enter' && !e.target.matches?.('input,select,textarea')) { apply(); return true; } return false; } };
}
