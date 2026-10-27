import * as THREE from 'three';
import { plantStore } from './plant-store.js';
import { normalizeLeafMaterial } from './leaf-material-data.js';
import { canEditLeafStyle, requireLeafStyleEditing, LEAF_STYLE_MESSAGE } from './leaf-style-boundary.js';
const $ = (id) => document.getElementById(id);
// Key by the immutable PNG itself; prefixing megabyte strings forces a new
// full-string hash for every material binding, even when its texture is cached.
const textures = {color:new Map(),normal:new Map()},textureOrder=new Map();
const textureReady = new WeakMap();
export async function waitForLeafTextures(group) {
  const pending=new Set();group?.traverse(object=>{if(!object.isMesh)return;for(const material of Array.isArray(object.material)?object.material:[object.material])for(const slot of ['map','normalMap']){const promise=textureReady.get(material?.[slot]);if(promise)pending.add(promise);}});
  await Promise.all(pending);
}
export function clearLeafTextureCache() {
  for(const texture of textureOrder.keys())texture.dispose();
  textures.color.clear();textures.normal.clear();textureOrder.clear();
}
export function applyLeafMaterial(material, raw) {
  const data = normalizeLeafMaterial(raw);
  for (const [key, slot] of [['color', 'map'], ['normal', 'normalMap']]) {
    if (!data[key]) { material[slot] = null; continue; }
    const cacheKey = data[key],cache=textures[key];
    if (!cache.has(cacheKey)) {
      let finish;const ready=new Promise(resolve=>{finish=resolve;});
      const texture = new THREE.TextureLoader().load(data[key],()=>finish(),undefined,()=>finish()); texture.colorSpace = key === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;textureReady.set(texture,ready);
      cache.set(cacheKey, texture);textureOrder.set(texture,{key,cacheKey});
      if(textureOrder.size>8){const [oldest,entry]=textureOrder.entries().next().value;oldest.dispose();textures[entry.key].delete(entry.cacheKey);textureOrder.delete(oldest);}
    }
    material[slot] = cache.get(cacheKey);
  }
  if (data.color) material.color.set(material.vegetationTint || '#ffffff');
  material.alphaTest = data.color ? data.cutoff : 0; material.roughness = data.roughness; material.needsUpdate = true;
}

export function createLeafResources(api) {
  const store = plantStore('leaves'); let library = [], busy = false;
  const section = document.createElement('section'); section.id = 'leafResourcePanel'; section.className = 'parameter-section leaf-resources';
  section.innerHTML = `<h2>共享叶片与贴图</h2><p class="vine-note">树、树枝、藤蔓共用叶片套装。保留原 UV；一套网格使用同一张图集。</p><div class="wb-row"><button id="leafResourceImport">导入叶片 OBJ</button><button id="leafTextureLoad">颜色 / 透明贴图</button></div><div class="wb-row"><button id="leafNormalLoad">法线贴图</button><button id="leafTextureClear">清除贴图</button></div><input id="leafTextureInput" type="file" accept="image/png,image/jpeg,image/webp" hidden><input id="leafNormalInput" type="file" accept="image/png,image/jpeg,image/webp" hidden><img id="leafTexturePreview" alt="叶片颜色贴图预览" hidden><p id="leafTextureStatus" class="vine-note"></p><div class="field-grid"><label>透明裁切<input id="leafCutoff" type="number" min="0" max="1" step=".05" value=".4"></label><label>粗糙度<input id="leafRoughness" type="number" min="0" max="1" step=".05" value=".72"></label></div><label>叶片套装名称<input id="leafResourceName" value="常用叶片" maxlength="80"></label><button id="leafResourceSave">保存为共享叶片套装</button><select id="leafResourceList" aria-label="共享叶片套装"></select><div class="wb-row"><button id="leafResourceUse">替换当前叶片套装</button><button id="leafResourceDelete">删除库中套装</button></div>`;
  document.querySelector('[data-page="foliage"]').prepend(section);
  const safe = (fn) => async () => { if (busy) return; busy = true; try { await fn(); } catch (e) { api.toast(e.message, true); } finally { busy = false; refresh(); } };
  const editable = () => { const allowed = requireLeafStyleEditing(api); if (!allowed) refresh(); return allowed; };
  $('leafResourceImport').onclick = () => { if (editable()) $('leafInput').click(); };
  $('leafTextureLoad').onclick = () => { if (editable()) $('leafTextureInput').click(); }; $('leafNormalLoad').onclick = () => { if (editable()) $('leafNormalInput').click(); };
  for (const [id, key] of [['leafTextureInput', 'color'], ['leafNormalInput', 'normal']]) $(id).onchange = safe(async () => {
    const file = $(id).files[0]; $(id).value = ''; if (!file) return;
    if (!editable()) return; const owner = api.getAuthoring();
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20000000) throw new Error('请选择不超过 20 MB 的 PNG、JPEG 或 WebP');
    const bitmap = await createImageBitmap(file), canvas = document.createElement('canvas'), scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const png = canvas.toDataURL('image/png');
    if (!editable() || api.getAuthoring() !== owner) return;
    api.transact('绑定叶片贴图', (a) => { a.leaf_material = normalizeLeafMaterial({ ...a.leaf_material, [key]: png, [key + '_name']: file.name }); }, { bypassLayers: true });
    api.toast('已绑定贴图，预览与工程均保留；最大边长 2048');
  });
  $('leafTextureClear').onclick = () => { if (editable()) api.transact('清除叶片贴图', (a) => { a.leaf_material = normalizeLeafMaterial(); }, { bypassLayers: true }); };
  for (const [id, key] of [['leafCutoff', 'cutoff'], ['leafRoughness', 'roughness']]) {
    $(id).oninput = () => { if (!editable() || !$(id).value || !$(id).validity.valid) return; api.begin(); api.preview((a) => { a.leaf_material = normalizeLeafMaterial({ ...a.leaf_material, [key]: +$(id).value }); }); }; $(id).onchange = () => { if (editable()) api.commit(); };
  }
  function list() { const selected = $('leafResourceList').value; $('leafResourceList').replaceChildren(...library.map((a) => new Option(a.name, a.id))); if (library.some((a) => a.id === selected)) $('leafResourceList').value = selected; $('leafResourceUse').disabled = !library.length || !canEditLeafStyle(api); $('leafResourceDelete').disabled = !library.length; }
  $('leafResourceSave').onclick = safe(async () => { await api.flush(); const item = { id: crypto.randomUUID(), name: $('leafResourceName').value.trim() || '常用叶片', meshes: api.capture().leaf_meshes, material: api.getAuthoring().leaf_material }; await store.put(item); library.push(item); list(); $('leafResourceList').value = item.id; api.toast('叶片套装已保存，可在任意工作区选择使用'); });
  $('leafResourceUse').onclick = safe(async () => { if (!editable()) return; const item = library.find((a) => a.id === $('leafResourceList').value); if (item) { await api.replaceLeaves(item.meshes, item.material); api.toast('已替换当前叶片套装'); } });
  $('leafResourceDelete').onclick = safe(async () => { const id = $('leafResourceList').value; if (!id) return; await store.remove(id); library = library.filter((a) => a.id !== id); list(); });
  store.list().then((items) => { library = items; list(); }).catch((e) => api.toast(`叶片库不可用：${e.message}`, true));
  function refresh() {
    const allowed = canEditLeafStyle(api);
    for (const id of ['leafResourceImport','leafTextureLoad','leafNormalLoad','leafTextureClear','leafCutoff','leafRoughness','leafResourceUse']) { $(id).disabled = !allowed || (id === 'leafResourceUse' && !library.length); $(id).title = allowed ? '' : LEAF_STYLE_MESSAGE; }
    const m = api.getAuthoring().leaf_material || normalizeLeafMaterial(), img = $('leafTexturePreview'); img.hidden = !m.color; if (m.color && img.getAttribute('src') !== m.color) img.src = m.color;
    $('leafTextureStatus').textContent = [m.color_name || '未绑定颜色贴图', m.normal_name ? '法线：' + m.normal_name : ''].filter(Boolean).join(' · ');
    if (!allowed || document.activeElement !== $('leafCutoff')) $('leafCutoff').value = m.cutoff;
    if (!allowed || document.activeElement !== $('leafRoughness')) $('leafRoughness').value = m.roughness;
  }
  return { refresh };
}
