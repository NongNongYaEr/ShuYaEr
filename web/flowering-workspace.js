import * as THREE from 'three';
import { normalizeFlowering, BLOOM_STATES, FLOWERING_STYLES } from './flowering-data.js';
import { parseObjLeaf, serializeGeometry } from './branch-kernel.js';
import { normalizeLeafMaterial } from './leaf-material-data.js';
import { canEditLeafStyle, requireLeafStyleEditing, LEAF_STYLE_MESSAGE } from './leaf-style-boundary.js';
import { plantStore } from './plant-store.js';
import { loadBougainvilleaAssets, loadIvyAssets, needsBougainvilleaAssets, withBougainvilleaAssets, withIvyAssets } from './builtin-plant-assets.js';
const $ = (id) => document.getElementById(id);
const poseFields = [['size_variation', '大小差异（±比例）', 0, .8, .01], ['direction_variation', '朝向偏转（°）', 0, 60, 1], ['twist_variation', '旋转变化（±°）', 0, 90, 1]];
const fields = [['amount', '花量', 0, 1, .01], ['size', '花序大小（m）', .03, .5, .01], ['grouping', '花团聚集', 0, 1, .01], ['outer', '外层偏好', 0, 1, .01], ['start', '开花起点', 0, 1, .01], ['end', '开花终点', 0, 1, .01]];
export function createFloweringWorkspace(api, panel) {
  let erasing = false, stroke = null, library = [], busy = false;
  const header = document.createElement('div'); header.className = 'plant-kind'; header.innerHTML = '<label>植物类型<select id="plantKind"><option value="VINE">绿叶藤蔓</option><option value="IVY">常春藤</option><option value="BOUGAINVILLEA">三角梅</option></select></label><button id="ivyBuiltin" hidden>恢复内置常春藤叶片</button>';
  panel.querySelector('.vine-intro').after(header);
  const section = document.createElement('div'); section.id = 'floweringPanel';
  section.innerHTML = `<div class="bloom-styles">${Object.entries(FLOWERING_STYLES).map(([key, label]) => `<button data-bloom-style="${key}">${label}</button>`).join('')}</div><div class="bloom-states">${Object.entries(BLOOM_STATES).map(([key, v]) => `<button data-bloom-state="${key}">${v.label}</button>`).join('')}</div><div class="field-grid">${fields.map(([key, label, min, max, step]) => `<label>${label}<input id="bloom_${key}" type="number" min="${min}" max="${max}" step="${step}" value="${normalizeFlowering()[key]}"></label>`).join('')}</div><div class="wb-row"><button id="bloomReroll">只换花团</button><button id="bloomResources">花序素材 / 贴图</button></div><details><summary>花区与细节</summary><div class="field-grid"><label>节点间距（m）<input id="bloom_node_spacing" type="number" min=".035" max=".3" step=".005" value=".075"></label><label>花序上限<input id="bloom_max_count" type="number" min="0" max="2000" step="50" value="900"></label><label>苞片颜色<input id="bloom_color" type="color" value="#d9328d"></label></div><label class="wb-check"><input id="bloom_core" type="checkbox" checked>内置花序显示小管状花</label><p class="vine-note">开花范围沿每根枝条计算；节点间距同时影响叶与花。</p><div class="vine-tools"><button data-flower-region="1.7">所选枝群多花</button><button data-flower-region=".35">所选枝群少花</button><button data-flower-region="0">所选枝群无花</button><button id="bloomRegionReset">恢复所选花区</button><button id="bloomRegionLock">固定所选花区</button><button id="bloomRegionRange">应用范围到所选</button></div><div class="wb-row"><button id="bloomErase">擦除花序</button><button id="bloomRestore">恢复擦除的花序</button></div></details><p id="bloomStats" class="vine-note"></p>`;
  header.after(section);
  const poses = document.createElement('details'); poses.open = true; poses.id = 'bloomPose';
  poses.innerHTML = `<summary>花序自然变化</summary><div class="field-grid">${poseFields.map(([key, label, min, max, step]) => `<label>${label}<input id="bloom_${key}" type="number" min="${min}" max="${max}" step="${step}"></label>`).join('')}</div><button id="bloomPoseReroll">只换花序姿态</button><p class="vine-note">整组花序围绕花柄根部变化，保留花区与花量；0 关闭对应随机项。</p>`;
  $('bloomReroll').parentElement.before(poses);
  const assets = document.createElement('section'); assets.id = 'flowerResourcePanel'; assets.className = 'parameter-section leaf-resources';
  assets.innerHTML = `<h2>花序资源与贴图</h2><p class="vine-note">单独使用整组花序 OBJ，保留原 UV。内置花序由三片苞片和三朵小管状花组成。</p><label>OBJ 生长轴<select id="flowerAxis"><option>Y</option><option>Z</option><option>X</option></select></label><div class="wb-row"><button id="flowerImport">导入整组花序 OBJ</button><button id="flowerBuiltin">使用内置花序</button></div><input id="flowerObj" type="file" accept=".obj" hidden><p id="flowerSourceName" class="vine-note"></p><label class="wb-check"><input id="flowerSharedAtlas" type="checkbox">导入花序共用叶片图集与材质</label><div class="wb-row"><button id="flowerColorLoad">花序颜色 / 透明图</button><button id="flowerNormalLoad">花序法线图</button></div><input id="flowerColorFile" type="file" accept="image/png,image/jpeg,image/webp" hidden><input id="flowerNormalFile" type="file" accept="image/png,image/jpeg,image/webp" hidden><img id="flowerTexturePreview" alt="花序贴图" hidden><p id="flowerTextureStatus" class="vine-note"></p><div class="field-grid"><label>透明裁切<input id="flowerCutoff" type="number" min="0" max="1" step=".05" value=".4"></label><label>粗糙度<input id="flowerRoughness" type="number" min="0" max="1" step=".05" value=".72"></label></div><button id="flowerClearMaps">清除花序贴图</button><label>花序套装名称<input id="flowerAssetName" value="三角梅花序" maxlength="80"></label><button id="flowerSave">保存共享花序套装</button><select id="flowerLibrary" aria-label="花序套装"></select><div class="wb-row"><button id="flowerUse">使用花序套装</button><button id="flowerDelete">删除库中套装</button></div>`;
  document.querySelector('[data-page="foliage"]').prepend(assets);
  assets.querySelector('.vine-note').textContent = '内置成品套装含五款绿叶、完整花序和统一扩色贴图。也可导入自己的花序 OBJ。';
  $('flowerBuiltin').textContent = '使用简化花序';
  const builtinButton = document.createElement('button'); builtinButton.id = 'bougainvilleaBuiltin';
  builtinButton.textContent = '恢复内置三角梅花叶套装';
  assets.querySelector('.vine-note').after(builtinButton);
  const store = plantStore('flowers');
  const editable = () => { const allowed = requireLeafStyleEditing(api); if (!allowed) refresh(); return allowed; };
  const apply = (change, label = '调整开花规则') => { if (editable()) api.transact(label, (a) => { a.flowering = normalizeFlowering({ ...a.flowering, ...change }); }, { bypassLayers: true }); };
  const safe = (fn) => async () => { if (busy) return; busy = true; try { await fn(); } catch (e) { api.toast(e.message, true); } finally { busy = false; refresh(); } };
  async function installBuiltin(recommendedSize = false, kind = 'BOUGAINVILLEA') {
    if (!editable()) return;
    await api.flush();
    const current = api.getAuthoring();
    $('plantKind').disabled = $('ivyBuiltin').disabled = builtinButton.disabled = true;
    builtinButton.textContent = '正在载入内置花叶…';
    try {
      const pack = await (kind === 'IVY' ? loadIvyAssets() : loadBougainvilleaAssets());
      if (!api.isActive() || api.getAuthoring() !== current) return;
      await api.applyPlantAssets((kind === 'IVY' ? withIvyAssets : withBougainvilleaAssets)(api.capture(), pack, recommendedSize));
      api.toast(kind === 'IVY' ? '已使用内置常春藤：六款叶片混合，共用扩色图集' : '已使用内置三角梅：五款绿叶 + 完整花序，共用扩色图集');
    } finally {
      $('plantKind').disabled = false; builtinButton.textContent = '恢复内置三角梅花叶套装';
    }
  }
  builtinButton.onclick = safe(() => installBuiltin());
  $('ivyBuiltin').onclick = safe(() => installBuiltin(false, 'IVY'));
  $('plantKind').onchange = safe(async () => {
    if (!editable()) return;
    const kind = $('plantKind').value, enabled = kind === 'BOUGAINVILLEA'; cancel();
    if (kind === 'IVY') await installBuiltin(true, 'IVY');
    else if (enabled && (api.getAuthoring().vine.leaf_preset === 'IVY_V1' || needsBougainvilleaAssets(api.getAuthoring().flowering))) await installBuiltin(true);
    else api.transact('切换植物类型', (a) => { a.flowering = normalizeFlowering({ ...a.flowering, enabled }); a.vine.species = 'GENERIC'; if (enabled) a.vine.type = 'EDGE'; }, { bypassLayers: true });
  });
  section.querySelectorAll('[data-bloom-style]').forEach((b) => b.onclick = () => apply({ style: b.dataset.bloomStyle }));
  section.querySelectorAll('[data-bloom-state]').forEach((b) => b.onclick = () => { const { amount, grouping } = BLOOM_STATES[b.dataset.bloomState]; apply({ amount, grouping }); });
  for (const [key] of [...fields, ...poseFields, ['node_spacing'], ['max_count']]) { const el = $('bloom_' + key); el.oninput = () => { if (!editable() || el.value === '' || !el.validity.valid) return; api.begin(); api.preview((a) => { a.flowering = normalizeFlowering({ ...a.flowering, [key]: +el.value }); }); }; el.onchange = () => { if (editable()) api.commit(); refresh(); }; }
  $('bloom_color').oninput = () => { if (!editable()) return; api.begin(); api.preview((a) => { a.flowering.color = $('bloom_color').value; }); }; $('bloom_color').onchange = () => { if (editable()) api.commit(); };
  $('bloom_core').onchange = () => apply({ core: $('bloom_core').checked });
  $('bloomReroll').onclick = () => apply({ seed: api.getAuthoring().flowering.seed % 2147483000 + 101 }, '更换花团');
  $('bloomPoseReroll').onclick = () => apply({ pose_seed: api.getAuthoring().flowering.pose_seed % 2147483000 + 101 }, '更换花序姿态');
  $('bloomResources').onclick = () => { document.querySelector('[data-tab="foliage"]').click(); const t = assets.querySelector('.parameter-group-toggle'); if (t?.getAttribute('aria-expanded') === 'false') t.click(); assets.scrollIntoView({ block: 'start' }); };
  const targets = () => { const branches = api.getAsset().masterBranches, ids = new Set(api.getSelections?.() || [api.getSelection()]); ids.delete(null); for (const b of branches) if (ids.has(branches.find((p) => p.id === b.parentId)?.stableId)) ids.add(b.stableId); return [...ids]; };
  const region = (fn) => { if (!editable()) return; const ids = targets(); if (!ids.length) return api.toast('先在视口或层级树选择枝条'); api.transact('编辑开花枝群', (a) => ids.forEach((id) => fn(a.flowering, id)), { bypassLayers: true }); };
  section.querySelectorAll('[data-flower-region]').forEach((b) => b.onclick = () => region((f, id) => { f.regions[id] = { ...f.regions[id], amount: +b.dataset.flowerRegion }; }));
  $('bloomRegionReset').onclick = () => region((f, id) => delete f.regions[id]);
  $('bloomRegionLock').onclick = () => region((f, id) => { f.regions[id] = { ...f.regions[id], seed: f.regions[id]?.seed ?? f.seed }; });
  $('bloomRegionRange').onclick = () => region((f, id) => { f.regions[id] = { ...f.regions[id], start: f.start, end: f.end }; });
  $('bloomRestore').onclick = () => apply({ removed: [] }, '恢复花序');
  $('flowerImport').onclick = () => { if (editable()) $('flowerObj').click(); };
  $('flowerObj').onchange = safe(async () => { const file = $('flowerObj').files[0]; $('flowerObj').value = ''; if (!file || !editable()) return; const owner = api.getAuthoring(); if (!/\.obj$/i.test(file.name) || file.size > 10000000) throw new Error('请选择不超过 10 MB 的 OBJ'); const g = parseObjLeaf(await file.text(), file.name, $('flowerAxis').value); try { if (!editable() || api.getAuthoring() !== owner) return; const source = { name: file.name, geometry: serializeGeometry(g) }; if (!normalizeFlowering({ source }).source) throw new Error('花序网格过大或无效（最多 5 万顶点 / 6 万三角面）'); apply({ source }, '导入花序'); } finally { g.dispose(); } });
  $('flowerBuiltin').onclick = () => apply({ source: null, shared_atlas: false, asset_preset: 'PROCEDURAL', material: normalizeLeafMaterial() }, '使用简化花序');
  $('flowerSharedAtlas').onchange = () => apply({ shared_atlas: $('flowerSharedAtlas').checked });
  for (const [button, input, key] of [['flowerColorLoad', 'flowerColorFile', 'color'], ['flowerNormalLoad', 'flowerNormalFile', 'normal']]) {
    $(button).onclick = () => { if (editable()) $(input).click(); }; $(input).onchange = safe(async () => { const file = $(input).files[0]; $(input).value = ''; if (!file || !editable()) return; const owner = api.getAuthoring(); if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20000000) throw new Error('请选择不超过 20 MB 的 PNG/JPEG/WebP'); const bitmap = await createImageBitmap(file), canvas = document.createElement('canvas'), scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height)); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); if (!editable() || api.getAuthoring() !== owner) return; apply({ material: { ...api.getAuthoring().flowering.material, [key]: canvas.toDataURL('image/png'), [key + '_name']: file.name } }, '绑定花序贴图'); });
  }
  for (const [id, key] of [['flowerCutoff', 'cutoff'], ['flowerRoughness', 'roughness']]) { $(id).oninput = () => { if (!editable() || $(id).value === '' || !$(id).validity.valid) return; api.begin(); api.preview((a) => { a.flowering.material = normalizeLeafMaterial({ ...a.flowering.material, [key]: +$(id).value }); }); }; $(id).onchange = () => { if (editable()) api.commit(); }; }
  $('flowerClearMaps').onclick = () => apply({ material: normalizeLeafMaterial() });
  function list() { const selected = $('flowerLibrary').value; $('flowerLibrary').replaceChildren(...library.map((a) => new Option(a.name, a.id))); if (library.some((a) => a.id === selected)) $('flowerLibrary').value = selected; $('flowerUse').disabled = !library.length || !canEditLeafStyle(api); $('flowerDelete').disabled = !library.length; }
  $('flowerSave').onclick = safe(async () => { await api.flush(); const f = api.getAuthoring().flowering, item = { id: crypto.randomUUID(), name: $('flowerAssetName').value.trim() || '三角梅花序', source: f.source, shared_atlas: f.shared_atlas, material: f.material, color: f.color }; await store.put(item); library.push(item); list(); $('flowerLibrary').value = item.id; api.toast('已保存共享花序套装'); });
  $('flowerUse').onclick = () => { const item = library.find((a) => a.id === $('flowerLibrary').value); if (item) apply({ source: item.source, material: item.material, shared_atlas: item.shared_atlas, color: item.color }, '应用花序套装'); };
  $('flowerDelete').onclick = safe(async () => { const id = $('flowerLibrary').value; await store.remove(id); library = library.filter((a) => a.id !== id); list(); });
  store.list().then((items) => { library = items; list(); }).catch((e) => api.toast(`花序库不可用：${e.message}`, true));
  const raycaster = new THREE.Raycaster();
  function erase(e) {
    if (!canEditLeafStyle(api)) return;
    const a = api.getAsset(), rect = api.canvas.getBoundingClientRect(); raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2), api.camera);
    const meshes = []; a.group.traverse((o) => { if (o.isMesh && o.visible && o.userData.category === 'flower') meshes.push(o); });
    const hit = raycaster.intersectObjects(meshes)[0]; if (!hit?.face) return;
    const uv = hit.object.geometry.attributes.uv1, i = hit.face.a, element = a.elements[Math.floor(uv.getX(i) * a.lookupTexture.width) + Math.floor(uv.getY(i) * a.lookupTexture.height) * a.lookupTexture.width];
    if (!element?.type.startsWith('FLOWER')) return;
    stroke.add(element.id); api.preview((auth) => { auth.flowering.removed = [...new Set([...auth.flowering.removed, ...stroke])]; });
  }
  $('bloomErase').onclick = () => { if (!editable()) return; erasing = !erasing; api.setTool('SELECT'); refresh(); };
  api.canvas.addEventListener('pointerdown', (e) => { if (!erasing || !api.isActive() || e.button !== 0) return; e.preventDefault(); e.stopImmediatePropagation(); api.begin(); stroke = new Set(); api.controls.enabled = false; api.canvas.setPointerCapture(e.pointerId); erase(e); }, true);
  api.canvas.addEventListener('pointermove', (e) => { if (!stroke) return; e.stopImmediatePropagation(); erase(e); }, true);
  api.canvas.addEventListener('pointerup', (e) => { if (!stroke) return; e.stopImmediatePropagation(); stroke = null; api.commit(); api.controls.enabled = true; if (api.canvas.hasPointerCapture(e.pointerId)) api.canvas.releasePointerCapture(e.pointerId); }, true);
  function cancel() { if (stroke) api.cancel(); stroke = null; erasing = false; api.controls.enabled = true; refresh(); }
  api.canvas.addEventListener('pointercancel', cancel); window.addEventListener('blur', () => { if (stroke) cancel(); });
  function refresh() {
    const allowed = canEditLeafStyle(api);
    for (const id of ['flowerImport','flowerBuiltin','flowerSharedAtlas','flowerColorLoad','flowerNormalLoad','flowerClearMaps','flowerCutoff','flowerRoughness','flowerUse']) { $(id).disabled = !allowed || (id === 'flowerUse' && !library.length); $(id).title = allowed ? '' : LEAF_STYLE_MESSAGE; }
    builtinButton.disabled = busy || !api.isActive();
    const f = api.getAuthoring().flowering || normalizeFlowering(), ivy = api.getAuthoring().vine?.species === 'IVY'; section.hidden = !f.enabled; $('plantKind').value = f.enabled ? 'BOUGAINVILLEA' : ivy ? 'IVY' : 'VINE';
    $('ivyBuiltin').hidden = !ivy || f.enabled; $('ivyBuiltin').disabled = busy || !api.isActive();
    panel.querySelector('.vine-presets').hidden = f.enabled;
    for (const [key] of [...fields, ...poseFields, ['node_spacing'], ['max_count'], ['color']]) if (document.activeElement !== $('bloom_' + key)) $('bloom_' + key).value = f[key];
    $('bloom_core').checked = f.core; $('bloom_core').disabled = !!f.source;
    section.querySelectorAll('[data-bloom-style]').forEach((b) => b.classList.toggle('active', b.dataset.bloomStyle === f.style));
    $('bloomErase').classList.toggle('active', erasing);
    $('flowerSourceName').textContent = f.source?.name || '内置：三片苞片 + 三朵小管状花'; $('flowerSharedAtlas').checked = f.shared_atlas; $('flowerSharedAtlas').disabled = !allowed || !f.source;
    const m = f.material, preview = $('flowerTexturePreview'); preview.hidden = !m.color; if (m.color && preview.getAttribute('src') !== m.color) preview.src = m.color;
    $('flowerTextureStatus').textContent = f.shared_atlas && f.source ? '共用叶片图集与 M_Leaf；独立花序贴图暂不使用' : [m.color_name || '未绑定花序颜色贴图', m.normal_name].filter(Boolean).join(' · ');
    if (!allowed || document.activeElement !== $('flowerCutoff')) $('flowerCutoff').value = m.cutoff; if (!allowed || document.activeElement !== $('flowerRoughness')) $('flowerRoughness').value = m.roughness;
    $('bloomStats').textContent = `${api.getAsset()?.blooms?.length || 0} 组花序 · ${Object.keys(f.regions).length} 个局部花区 · ${f.removed.length} 组已擦除${api.getAsset()?.report.flower_budget_limited ? ' · 已按面数预算减量' : ''}`;
  }
  return { refresh, cancel, key(e) { if (e.key === 'Escape' && (erasing || stroke)) { cancel(); return true; } return false; }, get erasing() { return erasing; } };
}
