import * as THREE from 'three';
import { VINE_PRESETS, normalizeVine, vinePreset } from './vine-data.js';
import { plantStore } from './plant-store.js';
import { createFloweringWorkspace } from './flowering-workspace.js';
import { createSurfaceGrowthWorkspace } from './surface-growth-workspace.js';
import { createVegetationWorkspace } from './vegetation-workspace.js';

const $ = (id) => document.getElementById(id);
const poseFields = [['leaf_size_variation', '大小差异（±比例）', 0, .8, .01], ['leaf_direction_variation', '朝向偏转（°）', 0, 60, 1], ['leaf_twist', '旋转变化（±°）', 0, 90, 1]];
const fields = [
  ['width', '覆盖宽度（m）', .1, 12, .05], ['length', '垂落长度（m）', .15, 10, .05],
  ['depth', '覆盖厚度（m）', .02, 1, .01], ['density', '藤束密度（束/m）', 1, 14, 1],
  ['leaf_size', '叶片大小（m）', .02, .6, .01], ['foliage', '叶片繁茂度', 0, 100, 1],
  ['variation', '长短错落', 0, 1, .05], ['natural', '自然变化', 0, 1, .05],
];
export function createVineWorkspace(api) {
  let library = [], loading = false, drag = null;
  const store = plantStore('vines');
  const panel = document.createElement('section'); panel.id = 'vinePanel'; panel.className = 'parameter-section vine-panel';
  panel.innerHTML = `<h2>藤蔓植物</h2><p class="vine-intro">选样式，调范围。沿用你的叶片与贴图。</p><div class="vine-presets">${Object.entries(VINE_PRESETS).map(([key, p]) => `<button data-vine-preset="${key}" type="button"><span class="vine-glyph vine-${key.toLowerCase()}">♧</span><strong>${p.label}</strong><small>${p.caption}</small></button>`).join('')}</div>
    <div class="field-grid">${fields.map(([key, label, min, max, step]) => `<label>${label}<input id="vine_${key}" type="number" min="${min}" max="${max}" step="${step}" value="${vinePreset('EDGE')[key]}"></label>`).join('')}</div>
    <div class="wb-row"><button id="vineReroll">换个藤形</button><button id="vineLeavesReroll">只换叶片排列</button></div>
    <label class="wb-check"><input id="vineReference" type="checkbox" checked>显示参考墙与尺寸手柄</label><p class="vine-note">拖绿色球调宽，拖金色球调长；参考墙不导出。</p>
    <div class="wb-row"><button id="vineLeafResources">选择叶片 / 贴图</button><button id="vineFront">正面观察</button></div>
    <details><summary>局部精修</summary><div class="vine-tools"><button data-vine-tool="GRAB">拉动藤束</button><button data-vine-tool="PRUNE">修剪</button><button data-vine-tool="LEAF_ERASE">擦除叶片</button><button data-vine-tool="LEAF_ADD">补叶</button></div><div class="wb-row"><button id="vineLock">固定所选藤形</button><button id="vineUnlock">解除固定</button></div><p class="vine-note">先选藤条再固定，可保留它及子枝的当前走势。调整拓扑或宽度可能改变连接位置。</p><label>藤径半径（m）<input id="vine_stem" type="number" min=".0012" max=".025" step=".0005" value=".004"></label></details>
    <details open><summary>藤蔓素材库</summary><label>素材名称<input id="vineAssetName" maxlength="80" value="岩壁垂挂"></label><div class="wb-row"><button id="vineSave">保存新素材</button><button id="vineExport">导出 FBX</button></div><select id="vineLibrary" aria-label="藤蔓素材"></select><div class="wb-row"><button id="vineOpen">打开素材</button><button id="vineDelete">删除素材</button></div></details><p id="vineStats" class="vine-note"></p>`;
  document.querySelector('[data-page="structure"]').prepend(panel);
  const poses = document.createElement('details'); poses.open = true; poses.id = 'vineLeafPose';
  poses.innerHTML = `<summary>叶片自然变化</summary><div class="field-grid">${poseFields.map(([key, label, min, max, step]) => `<label>${label}<input id="vine_${key}" type="number" min="${min}" max="${max}" step="${step}"></label>`).join('')}</div><button id="vineLeafPoseReroll">只换叶片姿态</button><p class="vine-note">0.22 表示大小上下浮动 22%；偏转围绕原生长方向。设为 0 可关闭对应随机变化；换姿态保留藤形和生长位置。</p>`;
  $('vineReroll').parentElement.before(poses);
  const root = new THREE.Group(); root.name = '藤蔓参考辅助'; api.scene.add(root);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x6d736c, roughness: 1, transparent: true, opacity: .25, depthWrite: false })); root.add(wall);
  const handles = ['width', 'length'].map((key, i) => { const mesh = new THREE.Mesh(new THREE.SphereGeometry(.055, 16, 10), new THREE.MeshBasicMaterial({ color: i ? 0xe7c66b : 0x7bd3ab, depthTest: false })); mesh.userData.key = key; mesh.renderOrder = 12; root.add(mesh); return mesh; });
  const safe = (action) => async () => { if (loading) return; loading = true; try { await action(); } catch (e) { api.toast(e.message, true); } finally { loading = false; refresh(); } };
  const apply = (change) => api.transact('调整藤蔓', (a) => { a.vine = normalizeVine({ ...a.vine, ...change }); }, { bypassLayers: true });
  for (const [key] of [...fields, ...poseFields, ['stem']]) {
    const input = $('vine_' + key);
    input.addEventListener('input', () => { if (!input.value || !input.validity.valid) return; api.begin(); api.preview((a) => { a.vine = normalizeVine({ ...a.vine, [key]: +input.value }); }); });
    input.addEventListener('change', () => { api.commit(); refresh(); });
  }
  panel.querySelectorAll('[data-vine-preset]').forEach((b) => b.onclick = () => apply({ ...vinePreset(b.dataset.vinePreset), species: api.getAuthoring().vine.species, leaf_preset: api.getAuthoring().vine.leaf_preset, leaf_size: api.getAuthoring().vine.leaf_size, foliage: api.getAuthoring().vine.foliage, ...Object.fromEntries([...poseFields.map(([key]) => key), 'leaf_pose_seed'].map(key => [key, api.getAuthoring().vine[key]])) }));
  $('vineReference').onchange = () => apply({ reference: $('vineReference').checked });
  const roll = (key) => api.transact('生成藤蔓变体', (a) => { a.seeds[key] = a.seeds[key] % 2147483000 + 101; }, { bypassLayers: true });
  $('vineReroll').onclick = () => roll('shape'); $('vineLeavesReroll').onclick = () => roll('foliage');
  $('vineLeafPoseReroll').onclick = () => apply({ leaf_pose_seed: api.getAuthoring().vine.leaf_pose_seed % 2147483000 + 101 });
  $('vineLeafResources').onclick = () => { document.querySelector('[data-tab="foliage"]').click(); const t = $('leafResourcePanel').querySelector('.parameter-group-toggle'); if (t?.getAttribute('aria-expanded') === 'false') t.click(); document.querySelector('.parameter-scroll').scrollTop = 0; };
  $('vineExport').onclick = () => { document.querySelector('[data-tab="output"]').click(); $('outputPath').focus(); api.toast('设置输出位置后，点击导出 FBX；支持现有批量变体与 LOD'); };
  $('vineFront').onclick = () => { api.camera.position.copy(api.controls.target).add(new THREE.Vector3(0, -5, .1)); api.camera.up.set(0, 0, 1); api.fit(); };
  panel.querySelectorAll('[data-vine-tool]').forEach((b) => b.onclick = () => api.setTool(b.dataset.vineTool));
  function lock(value) {
    const selected = api.getSelection(), branches = api.getAsset().masterBranches;
    if (!selected) return api.toast('请先在视口或层级列表中选择藤条');
    const ids = new Set([selected]); for (const b of branches) if (ids.has(branches.find((p) => p.id === b.parentId)?.stableId)) ids.add(b.stableId);
    api.transact(value ? '固定藤形' : '解除固定', (a) => { for (const b of branches.filter((b) => ids.has(b.stableId))) { a.overrides[b.stableId] ||= {}; a.overrides[b.stableId].locked = value; a.overrides[b.stableId].frozen_points = value ? b.points.map((p) => p.toArray()) : []; } }, { bypassLayers: true });
  }
  $('vineLock').onclick = () => lock(true); $('vineUnlock').onclick = () => lock(false);
  const list = () => { const selected = $('vineLibrary').value; $('vineLibrary').replaceChildren(...library.map((a) => new Option(a.name, a.id))); if (library.some((a) => a.id === selected)) $('vineLibrary').value = selected; $('vineOpen').disabled = $('vineDelete').disabled = !library.length; };
  $('vineSave').onclick = safe(async () => { await api.flush(); const doc = api.capture(); delete doc.history; delete doc.future; const item = { id: crypto.randomUUID(), name: $('vineAssetName').value.trim() || '藤蔓素材', document: doc }; await store.put(item); library.push(item); list(); $('vineLibrary').value = item.id; api.toast('已保存藤蔓素材，包含叶片与贴图'); });
  $('vineOpen').onclick = safe(async () => { const item = library.find((a) => a.id === $('vineLibrary').value); if (item) { await api.open(item.document); $('vineAssetName').value = item.name; } });
  $('vineDelete').onclick = safe(async () => { const id = $('vineLibrary').value; if (!id) return; await store.remove(id); library = library.filter((a) => a.id !== id); list(); });
  store.list().then((items) => { library = items; list(); }).catch((e) => api.toast(`藤蔓素材库不可用：${e.message}`, true));
  const raycaster = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function ray(e) { const r = api.canvas.getBoundingClientRect(); raycaster.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2), api.camera); }
  api.canvas.addEventListener('pointerdown', (e) => { if (!root.visible || e.button !== 0) return; ray(e); const hit = raycaster.intersectObjects(handles)[0]; if (!hit) return; e.preventDefault(); e.stopImmediatePropagation(); api.begin(); drag = { key: hit.object.userData.key, id: e.pointerId }; api.controls.enabled = false; api.canvas.setPointerCapture(e.pointerId); }, true);
  api.canvas.addEventListener('pointermove', (e) => { if (!drag) return; e.stopImmediatePropagation(); ray(e); const p = raycaster.ray.intersectPlane(plane, new THREE.Vector3()); if (!p) return; api.preview((a) => { const bush = a.flowering.enabled && a.flowering.style === 'BUSH'; a.vine = normalizeVine({ ...a.vine, [drag.key]: drag.key === 'width' ? (bush ? p.x * 2 : p.x) : (bush ? p.z : -p.z) }); }); refresh(); }, true);
  const end = (cancel = false) => { if (!drag) return; const id = drag.id; drag = null; api.controls.enabled = true; if (api.canvas.hasPointerCapture(id)) api.canvas.releasePointerCapture(id); cancel ? api.cancel() : api.commit(); refresh(); };
  api.canvas.addEventListener('pointerup', (e) => { if (drag) { e.stopImmediatePropagation(); end(); } }, true);
  api.canvas.addEventListener('pointercancel', () => end(true), true); api.canvas.addEventListener('lostpointercapture', () => end(true), true);
  window.addEventListener('blur', () => end(true));
  function refresh() {
    flowering.refresh();
    surface.refresh();
    plants.refresh();
    const attached = !!api.getAuthoring().surface_growth?.enabled;
    const v = api.getAuthoring().vine; root.visible = api.isActive() && !!v?.reference && !attached && !api.getAuthoring().vegetation.enabled;
    if (!v) return;
    for (const [key] of [...fields, ...poseFields, ['stem']]) if (document.activeElement !== $('vine_' + key)) $('vine_' + key).value = v[key];
    $('vineReference').checked = v.reference;
    panel.querySelectorAll('[data-vine-preset]').forEach((b) => { b.classList.toggle('active', b.dataset.vinePreset === v.type); b.setAttribute('aria-pressed', String(b.dataset.vinePreset === v.type)); });
    $('vine_width').disabled = $('vine_density').disabled = v.type === 'SINGLE'; handles[0].visible = v.type !== 'SINGLE';
    for (const key of ['width', 'length', 'depth', 'density', 'variation', 'natural']) if (attached) $('vine_' + key).disabled = true; else if (!['width', 'density'].includes(key)) $('vine_' + key).disabled = false;
    if (attached) panel.querySelector('.vine-presets').hidden = true;
    $('plantKind').disabled = attached || api.getAuthoring().vegetation.enabled;
    wall.scale.set(v.type === 'SINGLE' ? .65 : v.width + .2, .12, v.length + .3); wall.position.set(v.type === 'SINGLE' ? 0 : v.width / 2, .14, -v.length / 2);
    handles[0].position.set(v.width, 0, .06); handles[1].position.set(v.type === 'SINGLE' ? 0 : v.width / 2, 0, -v.length);
    const bush = api.getAuthoring().flowering.enabled && api.getAuthoring().flowering.style === 'BUSH'; wall.visible = !bush;
    const lengthLabel = $('vine_length').closest('label'), lengthCaption = lengthLabel.querySelector('.parameter-scrub') || lengthLabel.firstChild;
    lengthCaption.textContent = bush ? '灌丛高度（m）' : '垂落长度（m）';
    if (bush) { handles[0].position.set(v.width / 2, 0, v.length * .5); handles[1].position.set(0, 0, v.length); }
    const size = Math.max(.6, Math.min(2, v.width / 3)); handles.forEach((h) => h.scale.setScalar(size));
    const asset = api.getAsset(); $('vineStats').textContent = `${asset?.branches.length || 0} 枝段 · ${asset?.placements.length || 0} 叶片 · 叶片上限 ${api.getSettings().max_leaves} · ${attached ? '保留承载模型坐标' : `${bush ? '根部' : '顶部左端'}为摆放原点`}`;
  }
  const flowering = createFloweringWorkspace(api, panel);
  const surface = createSurfaceGrowthWorkspace(api, panel);
  const plants = createVegetationWorkspace(api, document.getElementById('surfaceGrowthPanel'));
  return { refresh, root, flowering, surface, plants, cancel: () => { end(true); flowering.cancel(); surface.cancel(); }, key(e) { if (surface.key(e) || flowering.key(e)) return true; if (e.key === 'Escape' && drag) { end(true); return true; } return false; } };
}
