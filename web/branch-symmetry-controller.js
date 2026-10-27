import * as THREE from 'three';
import { detachSymmetryGroup } from './branch-symmetry-edit.js';
import { descendants } from './branch-selection.js';

const $ = (id) => document.getElementById(id);
export function createBranchSymmetryEditor(api, context) {
  const editable = id => api.isEditable?.(id) !== false;
  const rejectUnit = () => api.toast('镜像与轮生仅调整承重骨架；单元枝请用 Shift+D 或结构枝组');
  const panel = document.createElement('div'); panel.id = 'symmetryContext';
  panel.innerHTML = `<label>联动组<select id="symmetryGroup"></select></label><div class="wb-row"><button id="symmetryNew"><i data-lucide="plus"></i>新建联动</button><button id="symmetrySelectSource"><i data-lucide="mouse-pointer-2"></i>选择源枝</button></div><label class="wb-check"><input id="symmetryEnabled" type="checkbox" checked>启用联动</label><label>排列<select id="symmetryType"><option value="MIRROR">镜像对生</option><option value="RADIAL">环绕轮生</option></select></label><div class="field-grid"><label>轴向<select id="symmetryAxis"><option>X</option><option selected>Y</option><option>Z</option></select></label><label>总数<input id="symmetryCount" type="number" min="2" max="8" step="1" value="3"></label></div><label>平面 / 排列角度（°）<input id="symmetryAngle" type="range" min="-180" max="180" step="1" value="0"></label><label>长度差异<input id="symmetryLength" type="range" min="0" max="0.5" step="0.01" value="0.08"></label><label>弯曲差异<input id="symmetryBend" type="range" min="0" max="0.5" step="0.01" value="0.05"></label><label>角度差异（°）<input id="symmetryVariation" type="range" min="0" max="45" step="1" value="5"></label><label>差异种子<input id="symmetrySeed" type="number" min="1" max="2147483646" step="1" value="1"></label><div id="symmetryStatus"></div><div class="wb-row"><button id="symmetryUnlink"><i data-lucide="unlink"></i>解除并保留造型</button><button id="symmetryRemove" title="移除联动复制枝"><i data-lucide="trash-2"></i></button></div>`;
  context.register('SYMMETRY', '联动对称', panel);
  const note = document.createElement('p'); note.className = 'vine-note'; note.textContent = '镜像承重骨架，不复制已安装单元枝；单元枝用 Shift+D 或结构枝组。'; panel.prepend(note);
  const button = document.createElement('button'); button.id = 'openBranchSymmetry'; button.title = '联动对称'; button.innerHTML = '<i data-lucide="flip-horizontal-2"></i>'; document.querySelector('.shaping-viewport-tools').append(button);
  const root = new THREE.Group(); root.name = 'SymmetryPlane'; api.modelRoot.add(root);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xd9b46a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })); root.add(plane);
  let selected = '', open = false;
  const current = () => api.getAuthoring().symmetry_groups.find((g) => g.id === selected);
  const fields = { symmetryEnabled: 'enabled', symmetryType: 'type', symmetryAxis: 'axis', symmetryCount: 'count', symmetryAngle: 'angle', symmetryLength: 'lengthVariation', symmetryBend: 'bendVariation', symmetryVariation: 'angleVariation', symmetrySeed: 'seed' };
  panel.querySelectorAll('input[type="range"]').forEach((input) => { const output = document.createElement('output'); output.htmlFor = input.id; input.before(output); });
  function refresh() {
    const groups = api.getAuthoring().symmetry_groups;
    if (!current()) selected = groups[0]?.id || '';
    root.visible = open && context.mode === 'SYMMETRY' && Boolean(current());
    if (api.isEditing()) return;
    $('symmetryGroup').replaceChildren(...groups.map((g) => new Option(g.name, g.id))); $('symmetryGroup').value = selected;
    const group = current(), branch = api.getAsset()?.masterBranches.find((b) => b.stableId === group?.source);
    const canEdit = Boolean(group && editable(group.source));
    for (const [id, key] of Object.entries(fields)) { const input = $(id); input.disabled = !canEdit; if (group) { if (input.type === 'checkbox') input.checked = group[key]; else input.value = group[key]; } }
    $('symmetryCount').disabled = !canEdit || group.type === 'MIRROR';
    panel.querySelectorAll('input[type="range"]').forEach((input) => input.previousElementSibling.textContent = input.value);
    ['symmetryUnlink', 'symmetryRemove'].forEach((id) => $(id).disabled = !canEdit); $('symmetrySelectSource').disabled = !group;
    const clones = api.getAsset()?.masterBranches.filter((b) => b.symmetryGroup === selected).length || 0;
    $('symmetryStatus').textContent = !group ? '未选择联动组' : !canEdit ? '旧单元枝内部联动只读保留；样式请在枝条工作台编辑' : branch ? `${group.source} · ${clones} 复制枝段` : '源枝缺失';
    if (branch && group.enabled) {
      const sourceCount = descendants(api.getAsset().masterBranches.filter((b) => !b.symmetryGroup && editable(b.stableId)), new Set([group.source])).size;
      if (clones < sourceCount * (group.type === 'MIRROR' ? 1 : group.count - 1)) $('symmetryStatus').textContent += ' · 已达 2200 枝段上限';
    }
    if (branch) { plane.position.copy(branch.points[0]); plane.scale.setScalar(Math.max(0.3, branch.length * 1.6)); const axis = new THREE.Vector3(...{ X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[group.axis]); axis.applyAxisAngle(group.axis === 'Z' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1), group.angle * Math.PI / 180); plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis); }
  }
  button.onclick = () => { if (api.getSelection() && !editable(api.getSelection())) return rejectUnit(); api.setTool('SELECT'); open = true; context.setMode('SYMMETRY'); refresh(); };
  $('symmetryGroup').onchange = () => { selected = $('symmetryGroup').value; refresh(); };
  $('symmetryNew').onclick = () => { const source = api.getSelection(); if (!source) return api.toast('请先选择源枝'); if (!editable(source)) return rejectUnit(); if (api.getAuthoring().symmetry_groups.length >= 12) return api.toast('最多 12 组联动'); selected = 'SYM_' + crypto.randomUUID().replaceAll('-', ''); api.transact('创建联动枝群', (a) => a.symmetry_groups.push({ id: selected, source, name: `联动 ${a.symmetry_groups.length + 1}`, type: 'MIRROR', protect_units: document.body.dataset.workbench === 'TREE' }), { bypassLayers: true }); };
  for (const [id, key] of Object.entries(fields)) {
    const input = $(id); input.oninput = () => { if (!current() || !editable(current().source) || input.value === '' || !input.validity.valid) return; api.begin(); api.preview((a) => { const g = a.symmetry_groups.find((g) => g.id === selected); g.protect_units = document.body.dataset.workbench === 'TREE'; g[key] = input.type === 'checkbox' ? input.checked : input.tagName === 'SELECT' ? input.value : +input.value; }); }; input.onchange = () => { api.commit(); refresh(); };
    if (input.type === 'range') input.addEventListener('input', () => input.previousElementSibling.textContent = input.value);
  }
  $('symmetrySelectSource').onclick = () => { if (current()) api.select(current().source); };
  $('symmetryRemove').onclick = () => current() && editable(current().source) && api.transact('移除联动枝群', (a) => a.symmetry_groups = a.symmetry_groups.filter((g) => g.id !== selected), { bypassLayers: true });
  $('symmetryUnlink').onclick = () => {
    if (api.getAsset().group.userData.pending_rebuild) return api.toast('模型更新后可解除联动');
    const group = current(); if (!group) return;
    if (!editable(group.source)) return rejectUnit();
    try { api.transact('解除联动并保留造型', (a) => detachSymmetryGroup(a, group, api.getAsset().masterBranches, api.getSettings()), { bypassLayers: true }); }
    catch (error) { api.toast(error.message, true); }
  };
  root.visible = false;
  return { root, refresh, deactivate() { open = false; root.visible = false; } };
}
