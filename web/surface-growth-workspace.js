import { relaxGuideRoute, isLocalGuideRoute } from './surface-guide-routing.js';
import { simplifyGuideAnchors } from './surface-guide-shape.js';
import { createSurfaceWorkbenchLayout } from './surface-workbench-layout.js';
import { DISTRIBUTION } from './distribution-config.js';
import { loadSurfaceExample } from './surface-example.js';
import { createAppConfirm } from './app-confirm.js';
import { createGrowthRulerEditor } from './surface-growth-ruler-editor.js';
import { createSurfaceEditor } from './surface-editor.js';
import * as THREE from 'three';
import { importGrowthSurface } from './surface-growth-import.js';
import { surfaceNavigation, surfaceRoute } from './surface-growth-geometry.js';
import { snapEave, eaveRoute } from './surface-growth-eaves.js';
import { surfaceBlocked } from './surface-paint.js';
import { loadIvyAssets, withIvyAssets } from './builtin-plant-assets.js';

const $ = id => document.getElementById(id);
export function createSurfaceGrowthWorkspace(api, vinePanel) {
  const section = document.createElement('section'); section.id = 'surfaceGrowthPanel'; section.className = 'parameter-section vine-panel';
  section.innerHTML = `<h2>沿模型表面生长</h2><p class="vine-note">导入桥墩、屋檐或岩石；点起点向上生长，也可直接画路线。</p>
    <div class="field-grid"><label>模型单位<select id="surfaceUnits"><option value="1">米</option><option value=".01">厘米</option><option value=".001">毫米</option></select></label><label>OBJ 向上轴<select id="surfaceObjUp"><option>Z</option><option>Y</option></select></label></div>
    <button id="surfaceImport">导入承载模型 GLB / OBJ</button><input id="surfaceFile" type="file" accept=".glb,.obj" hidden><p id="surfaceName" class="vine-note">尚未导入模型</p>
    <div id="surfaceControls" hidden><label class="wb-check"><input id="surfaceEnabled" type="checkbox">启用贴面生长</label>
    <div class="vine-tools"><button data-surface-tool="REGION">刷生长区域</button><button data-surface-tool="ERASE_REGION">擦除生长区域</button><button data-surface-tool="ROOT">点起点 · 向上长</button><button data-surface-tool="DOWN">点起点 · 向下长</button><button data-surface-tool="DRAW">画走势 · 生成藤群</button><button data-surface-tool="EAVE">沿檐口画垂藤</button><button data-surface-tool="CONTINUE">续画所选路线</button><button data-surface-tool="BLOCK">刷禁生区</button><button data-surface-tool="UNBLOCK">擦除禁生区</button><button data-surface-tool="">结束操作 / 旋转观察</button></div>
    <p id="surfaceToolNote" class="vine-note"></p>
    <details open id="surfaceRegionPanel"><summary>区域植被</summary><label class="wb-check"><input id="surfaceRegionEnabled" type="checkbox">启用区域覆盖</label><div class="wb-row"><button data-region-style="FLAT">贴地铺开</button><button data-region-style="MOUND">团状隆起</button></div><div class="field-grid"><label>覆盖率<input id="region_coverage" type="number" min="0" max="1" step=".05"></label><label>覆盖厚度（m）<input id="region_height" type="number" min="0" max=".6" step=".02"></label><label>团块大小（m）<input id="region_clump" type="number" min=".15" max="3" step=".05"></label><label>边缘渐稀（m）<input id="region_fade" type="number" min="0" max="1.5" step=".05"></label><label>边缘垂落比例<input id="region_hang" type="number" min="0" max="1" step=".05"></label></div><div class="wb-row"><button id="surfaceRegionReroll">换一片分布</button><button id="surfaceRegionClear">清空生长区域</button></div><label class="wb-check"><input id="surfaceRegionOverlay" type="checkbox">显示绿色生长区域</label><p id="surfaceRegionStats" class="vine-note"></p><p class="vine-note">刷绿色区域后松开生成；红色禁生区优先。只在真实模型边缘垂落，长度沿用“檐口垂落”。新区域按笔刷实际范围记录，无需细分原文件。旧版整面区域保留原分布；新增区域可使用完整的主侧藤配置。</p></details>
    <div class="field-grid"><label>向上生长距离（m）<input id="surface_length" type="number" min=".1" max="15" step=".1"></label><label>侧藤铺展（m）<input id="surface_spread" type="number" min="0" max="2" step=".05"></label><label>分叉密度（枝/m）<input id="surface_density" type="number" min="0" max="12" step="1"></label><label>离面距离（m）<input id="surface_offset" type="number" min=".003" max=".1" step=".001"></label><label>笔刷半径（m）<input id="surfaceBrush" type="number" min=".01" max="2" step=".01" value=".12"></label><label>参考透明度<input id="surface_opacity" type="number" min=".1" max="1" step=".05"></label></div>
    <details open><summary>檐口垂落</summary><label class="wb-check"><input id="surfaceAutoHang" type="checkbox">攀爬到边缘后自动垂落</label><div class="field-grid"><label>垂落长度（m）<input id="surface_hang_length" type="number" min=".1" max="10" step=".1"></label><label>向外探出（m）<input id="surface_hang_reach" type="number" min=".05" max="2" step=".05"></label><label>垂藤密度（条/m）<input id="surface_hang_density" type="number" min="1" max="12" step="1"></label><label>长短错落<input id="surface_hang_variation" type="number" min="0" max=".8" step=".05"></label></div><p class="vine-note">沿檐口画线会吸附到附近 0.25m 内的边缘。先向外探出再下垂；遇到承载模型会截停。自动垂落需路线到达边缘。</p></details>
    <select id="surfaceGuides" aria-label="表面生长路线"></select><div class="wb-row"><button id="surfaceDeleteGuide">删除所选路线</button><button id="surfaceClearMask">清除禁生区</button></div>
    <div class="wb-row"><button id="surfaceFit">适应承载模型</button><button id="surfaceRemove">移除承载模型</button></div>
    <label class="wb-check"><input id="surfaceVisible" type="checkbox">显示承载模型</label><label class="wb-check"><input id="surfaceFlip" type="checkbox">反转贴面方向</label>
    <p class="vine-note">按住右键或退出工具后旋转观察。生长区和禁生区都支持精确笔刷。承载模型随工程保存，GLB / FBX 只导出植物，保留模型原点和位置。</p></div>`;
  vinePanel.before(section);
  const exampleButton = document.createElement('button'); exampleButton.id = 'surfaceExample'; exampleButton.textContent = '载入桥墩示例'; exampleButton.hidden = !DISTRIBUTION.surfaceExample;
  $('surfaceImport').before(exampleButton);
  const confirmExample = createAppConfirm('surfaceExampleConfirm');
  const brushBar = document.createElement('div'); brushBar.className = 'field-grid'; brushBar.append($('surfaceBrush').closest('label')); $('surfaceToolNote').after(brushBar);
  const root = new THREE.Group(); root.name = 'SurfaceReferenceOnly'; api.scene.add(root);
  const reference = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: '#9da59a', side: THREE.DoubleSide, transparent: true, opacity: .65, roughness: 1, depthWrite: false })); root.add(reference);
  const masks = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: '#ff5649', side: THREE.DoubleSide, transparent: true, opacity: .6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })); root.add(masks);
  const regionMask = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: '#69d884', side: THREE.DoubleSide, transparent: true, opacity: .25, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); root.add(regionMask);
  const routes = new THREE.Group(); routes.visible = false; root.add(routes);
  const stroke = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ffe680', depthTest: false })); stroke.renderOrder = 30; root.add(stroke);
  let editor = null, ruler = null, layout = null;
  let mode = '', drag = null, meshId = '', routeKey = '', maskKey = '', regionKey = '', regionArea = 0, busy = false;
  const regionTools = ['REGION', 'ERASE_REGION'], paintTools = ['BLOCK', 'UNBLOCK', ...regionTools];
  const ray = new THREE.Raycaster(), state = () => api.getAuthoring().surface_growth;
  const transact = (label, fn) => api.transact(label, a => { if (a.surface_growth) fn(a.surface_growth); }, { bypassLayers: true });
  function activate(value) {
    cancelStroke(); editor?.cancel();
    if (value) { api.setTool('SELECT'); if (!state()?.visible) transact('显示承载模型', s => { s.visible = true; }); }
    mode = value; layout?.showTool(value); refresh();
  }
  function release() { const id = drag?.id; drag = null; api.controls.enabled = true; if (id !== undefined && api.canvas.hasPointerCapture(id)) api.canvas.releasePointerCapture(id); }
  function cancelStroke() { editor?.clearPreview(); release(); stroke.geometry.dispose(); stroke.geometry = new THREE.BufferGeometry(); maskKey = ''; regionKey = ''; }
  function cancel() { ruler?.cancel(); editor?.cancel(); cancelStroke(); mode = ''; refresh(); }
  section.querySelectorAll('[data-surface-tool]').forEach(b => b.onclick = () => activate(b.dataset.surfaceTool));
  $('surfaceImport').onclick = () => $('surfaceFile').click();
  exampleButton.onclick = async () => {
    if (busy || !api.isActive()) return;
    const initialOwner = api.getAuthoring();
    if (state() && !await confirmExample({ title: '重新载入桥墩示例？', name: 'QiaoDunTest.glb', message: '将替换当前承载模型，并清空其生长路线和区域。', accept: '载入示例' })) return;
    if (!api.isActive() || api.getAuthoring() !== initialOwner) return;
    busy = true; exampleButton.disabled = true;
    try {
      await api.flush(); cancel(); const owner = api.getAuthoring();
      const surface = await loadSurfaceExample();
      const doc = withIvyAssets(api.capture(), await loadIvyAssets(), true);
      if (!api.isActive() || api.getAuthoring() !== owner) throw new Error('工作区已切换，请重新载入示例');
      doc.authoring.surface_growth = surface;
      await api.applyPlantAssets(doc); refresh(); fit(); activate('ROOT');
      api.toast('桥墩示例已载入，在模型表面点击即可种下常春藤');
    } catch (error) { api.toast(error.message, true); }
    finally { busy = false; exampleButton.disabled = false; }
  };
  $('surfaceFile').onchange = async () => {
    const file = $('surfaceFile').files[0]; $('surfaceFile').value = ''; if (!file || busy) return;
    busy = true; $('surfaceImport').disabled = true;
    try {
      await api.flush(); cancel(); const owner = api.getAuthoring();
      const s = await importGrowthSurface(file, { scale: +$('surfaceUnits').value, objUp: $('surfaceObjUp').value });
      let doc = api.capture();
      if (!doc.leaf_meshes?.length || doc.authoring.vine.species !== 'IVY') doc = withIvyAssets(doc, await loadIvyAssets(), true);
      if (!api.isActive() || api.getAuthoring() !== owner) throw new Error('工作区已切换，请重新导入承载模型');
      doc.authoring.surface_growth = s; doc.authoring.flowering.enabled = false;
      await api.applyPlantAssets(doc); refresh(); fit(); activate('ROOT');
      const toggle = section.querySelector('.parameter-group-toggle'); if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click();
      api.toast('已导入；在表面点击起点向上生长，或切换画路线');
    } catch (e) { api.toast(e.message, true); } finally { busy = false; $('surfaceImport').disabled = false; }
  };
  const fields = ['length', 'spread', 'density', 'offset', 'opacity', 'hang_length', 'hang_reach', 'hang_density', 'hang_variation'];
  for (const key of fields) {
    const el = $('surface_' + key);
    
    el.onchange = () => { if (!state() || el.value === '' || !el.validity.valid) return refresh(); transact('调整表面生长参数',s=>{s[key]=+el.value;}); };
  }
  $('surfaceEnabled').onchange = () => { const checked = $('surfaceEnabled').checked; cancel(); transact('切换贴面生长', s => { s.enabled = checked; }); };
  $('surfaceVisible').onchange = () => { const checked = $('surfaceVisible').checked; cancel(); transact('显示承载模型', s => { s.visible = checked; }); };
  $('surfaceFlip').onchange = () => transact('反转贴面方向', s => { s.flip = $('surfaceFlip').checked; });
  $('surfaceAutoHang').onchange = () => transact('切换到边缘自动垂落', s => { s.auto_hang = $('surfaceAutoHang').checked; });
  const regionFields = ['coverage', 'height', 'clump', 'fade', 'hang'];
  for (const key of regionFields) $('region_'+key).onchange=()=>{const input=$('region_'+key);if(input.value&&input.checkValidity())editor.mutate('调整当前区域',r=>{r[key]=+input.value;});else refresh();};
  $('surfaceRegionEnabled').onchange=()=>editor.mutate('切换当前区域',r=>{r.enabled=$('surfaceRegionEnabled').checked;});
  $('surfaceRegionOverlay').onchange=()=>transact('显示生长区域',s=>{editor.region(s).overlay=$('surfaceRegionOverlay').checked;});
  $('surfaceRegionClear').onclick=()=>{cancelStroke();editor.mutate('清空当前区域',r=>{r.faces=[];r.strokes=[];});};
  $('surfaceRegionReroll').onclick=()=>editor.mutate('更换当前区域分布',r=>{r.seed=r.seed%2147483000+101;});
  section.querySelectorAll('[data-region-style]').forEach(b=>b.onclick=()=>editor.mutate('切换区域形态',r=>{r.style=b.dataset.regionStyle;r.height=r.style==='MOUND'?.3:.08;}));
  $('surfaceDeleteGuide').onclick=()=>{const id=$('surfaceGuides').value;if(state()?.guides.find(g=>g.id===id)?.locked)return api.toast('当前路线已锁定');cancelStroke();transact('删除生长路线',s=>{s.guides=s.guides.filter(g=>g.id!==id);});};
  $('surfaceClearMask').onclick=()=>transact('清除禁生区',s=>{s.blocked=[];s.block_strokes=[];});
  $('surfaceRemove').onclick = () => { cancel(); api.transact('移除承载模型', a => { a.surface_growth = null; }, { bypassLayers: true }); };
  $('surfaceFit').onclick = () => fit();
  function fit() {
    if (!state()) return;
    // Shared fitting accounts for viewport aspect ratio, clipping and fog.
    api.fit(new THREE.Box3().setFromArray(state().mesh.position));
  }
  function hit(event) {
    const rect = api.canvas.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), api.camera);
    return ray.intersectObject(reference, false)[0];
  }
  function paint(h){editor.paint(h,drag,mode);}
  function drawMask(blocked, target = masks) {
    const s = state(); if (!s) return;
    const p = []; for (const f of blocked) for (let j = 0; j < 3; j++) { const i = s.mesh.index[f * 3 + j] * 3; p.push(...s.mesh.position.slice(i, i + 3)); }
    target.geometry.dispose(); target.geometry = new THREE.BufferGeometry(); target.geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  }
  function extend(h) {
    let a = { face: h.faceIndex, point: h.point.toArray() }; const previous = drag.anchors.at(-1), s = state(), nav = surfaceNavigation(s.mesh), blocked = new Set(s.blocked);
    if (drag.type === 'EAVE') { const snapped = snapEave(nav, a, blocked, s.flip); if (!snapped) return; a = { face: snapped.face, point: snapped.point }; }
    if (previous && new THREE.Vector3(...a.point).distanceTo(new THREE.Vector3(...previous.point)) < .02) return;
    if (drag.anchors.length >= 512) return;
    const path = previous ? (drag.type === 'EAVE' ? eaveRoute(nav, previous, a, blocked, s.flip) : relaxGuideRoute(nav, surfaceRoute(nav, previous, a, blocked))) : [a];
    if (!path.length || previous && !isLocalGuideRoute(path,previous,a)) { if(!drag.warned){api.toast('这里跨到了模型另一侧，请转动视角后从末端续画');drag.warned=true;} return; }
    drag.anchors.push(a);
    drag.preview.push(...path);
    stroke.geometry.dispose(); stroke.geometry = new THREE.BufferGeometry().setFromPoints(drag.preview.map(a => new THREE.Vector3(...a.point)));
  }
  api.canvas.addEventListener('pointerdown', event => {
    if (!mode || mode === 'EDIT' || !api.isActive() || !state()?.enabled || !state()?.visible || event.button !== 0 || busy) return;
    event.preventDefault(); event.stopImmediatePropagation(); const h = hit(event); if (!h) return;
    if(regionTools.includes(mode)&&!editor.canPaint())return api.toast('当前区域已锁定');
    if (mode === 'ROOT' || mode === 'DOWN') {
      if (state().guides.length >= 32) return api.toast('最多支持 32 条路线');
      if (surfaceBlocked(state()).has(h.faceIndex) || surfaceBlocked(state()).atPoint?.(h.faceIndex,h.point)) return api.toast('这里属于禁生区');
      transact('添加攀爬起点', s => { const id = 'G' + crypto.randomUUID().replaceAll('-', ''); s.guides.push({ id, name: `${mode==='DOWN'?'下垂':'攀爬'}藤群 ${s.guides.length + 1}`, flow:mode==='DOWN'?'DOWN':'UP', ...editor.recipe(), anchors: [{ face: h.faceIndex, point: h.point.toArray() }] }); }); return;
    }
    const guide = mode === 'CONTINUE' ? state().guides.find(g => g.id === $('surfaceGuides').value) : null;
    if(guide?.locked)return api.toast('当前路线已锁定');
    if (mode === 'CONTINUE' && !guide) return api.toast('请先选择需要续画的路线');
    if (['DRAW', 'EAVE'].includes(mode) && state().guides.length >= 32) return api.toast('最多支持 32 条路线');
    drag = { id: event.pointerId, anchors: guide ? structuredClone(editor.routeAnchors(guide)) : [], preview: [], type: guide?.type || (mode === 'EAVE' ? 'EAVE' : 'SURFACE'), guide: guide?.id, blocked: new Set(state().blocked), faces: new Set(state().region.faces) };
    api.controls.enabled = false; api.canvas.setPointerCapture(event.pointerId);
    if (paintTools.includes(mode)) paint(h); else extend(h);
  }, true);
  api.canvas.addEventListener('pointermove', event => { editor?.hover(event); if (!drag) return; event.preventDefault(); event.stopImmediatePropagation(); const h = hit(event); if (!h) return; if (paintTools.includes(mode)) paint(h); else extend(h); }, true);
  api.canvas.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.id) return; event.preventDefault(); event.stopImmediatePropagation();
    const done = drag, tool = mode; release(); stroke.geometry.dispose(); stroke.geometry = new THREE.BufferGeometry();
    if (paintTools.includes(tool)) editor.commitPaint(done,tool);
    else if (done.anchors.length > 1) transact('绘制生长路线', s => { const g = s.guides.find(g => g.id === done.guide); if (g) g.anchors = simplifyGuideAnchors(done.anchors,.06,surfaceNavigation(s.mesh)); else s.guides.push({ id: 'G' + crypto.randomUUID().replaceAll('-', ''), name: `${done.type === 'EAVE' ? '檐口' : '路线'} ${s.guides.length + 1}`, type: done.type, ...editor.recipe(), bundle:done.type==='EAVE'?null:editor.recipe().bundle, anchors: simplifyGuideAnchors(done.anchors,.06,surfaceNavigation(s.mesh)) }); });
    else api.toast(done.type === 'EAVE' ? '请沿檐口附近拖动；这里没有可用边缘或位于禁生区' : '请在表面拖动绘制路线');
    maskKey = ''; regionKey = '';
    if (!paintTools.includes(tool) && done.anchors.length > 1) activate('EDIT');
  }, true);
  for (const event of ['pointercancel', 'lostpointercapture']) api.canvas.addEventListener(event, () => { if (drag) { cancelStroke(); refresh(); } }, true);
  window.addEventListener('blur', () => { if (drag) { cancelStroke(); refresh(); } });
  function refresh() {
    const s = state(), active = api.isActive(); section.hidden = !active; root.visible = active && !!s?.enabled && !!s?.visible;
    if (!active || !s?.enabled) { if (drag) cancelStroke(); mode = ''; }
    $('surfaceControls').hidden = !s;
    $('surfaceName').textContent = s ? `${s.mesh.name} · ${(s.mesh.index.length / 3).toLocaleString()} 三角面 · ${s.guides.length} 条路线` : '尚未导入模型';
    section.querySelectorAll('[data-surface-tool]').forEach(b => { b.classList.toggle('active', mode === b.dataset.surfaceTool); b.disabled = !s?.enabled; });
    $('surfaceToolNote').textContent = { REGION: '拖动刷绿色生长区，松开后生成植被；下方可调整笔刷半径。', ERASE_REGION: '拖动擦除绿色区域；只影响区域植被，保留手绘路线。', DOWN: '点击顶部放起点，生成向下贴壁的藤群；右侧可调整宽度与走势。', ROOT: '点击表面放起点；按世界向上方向贴面延伸。', DRAW: '在表面拖动画走势；松开后自动进入控制点编辑。再点“画走势”新建下一束。', EAVE: '沿屋檐上缘拖动，自动吸附边缘并生成垂藤。可转动视角后续画。', CONTINUE: '从所选路线末端继续；檐口路线仍会沿边缘延伸。', EDIT:'点击路线选择，拖动黄点沿表面调整；Esc 取消，松手提交。', BLOCK: '拖动涂红禁止生长的面；默认不涂背面。', UNBLOCK: '拖动擦除红色禁生区。', '': '选择一个工具开始。Esc 结束当前操作。' }[mode];
    if (!s) {editor?.refresh();ruler?.refresh();layout?.refresh();return;}
    const region=editor?.region(s)||s.region;
    if (meshId !== s.mesh.id) { reference.geometry.dispose(); reference.geometry = new THREE.BufferGeometry(); reference.geometry.setAttribute('position', new THREE.Float32BufferAttribute(s.mesh.position, 3)); reference.geometry.setIndex(s.mesh.index); reference.geometry.computeVertexNormals(); meshId = s.mesh.id; maskKey = ''; routeKey = ''; regionKey = ''; }
    reference.material.opacity = s.opacity;
    for (const key of fields) if (document.activeElement !== $('surface_' + key)) $('surface_' + key).value = s[key];
    $('surfaceEnabled').checked = s.enabled; $('surfaceVisible').checked = s.visible; $('surfaceFlip').checked = s.flip;
    $('surfaceAutoHang').checked = s.auto_hang;
    for (const key of regionFields) if (document.activeElement !== $('region_' + key)) $('region_' + key).value = region[key];
    $('surfaceRegionEnabled').checked = region.enabled; $('surfaceRegionOverlay').checked = region.overlay;
    regionMask.visible = s.region.overlay || regionTools.includes(mode);
    section.querySelectorAll('[data-region-style]').forEach(b => { b.classList.toggle('active', b.dataset.regionStyle === region.style); b.setAttribute('aria-pressed', String(b.dataset.regionStyle === region.style)); });
    const rk = JSON.stringify(s.guides); if (rk !== routeKey) {
      routeKey = rk; routes.children.slice().forEach(o => { o.geometry.dispose(); o.material.dispose(); routes.remove(o); });
      for (const g of s.guides) {
        const marker = new THREE.Mesh(new THREE.SphereGeometry(.025, 10, 6), new THREE.MeshBasicMaterial({ color: '#b5f780', depthTest: false })); marker.position.fromArray(g.anchors[0].point); marker.renderOrder = 25; routes.add(marker);
      }
      const previousIds = new Set([...$('surfaceGuides').options].map(o=>o.value)); const added=s.guides.find(g=>!previousIds.has(g.id)); const selected = added?.id || $('surfaceGuides').value; $('surfaceGuides').replaceChildren(...s.guides.map(g => new Option(`${g.name} · ${g.type === 'EAVE' ? '檐口垂藤' : g.anchors.length === 1 ? (g.flow==='DOWN'?'向下贴壁':'向上攀爬') : '走势藤群'}`, g.id)));
      if (s.guides.some(g => g.id === selected)) $('surfaceGuides').value = selected; else if (s.guides.length) $('surfaceGuides').value = s.guides.at(-1).id;
    }
    editor?.refresh();ruler?.refresh();layout?.refresh();
  }
  editor = createSurfaceEditor({api,section,root,reference,regionMask,masks,state,transact,refresh,getMode:()=>mode,activate,cancel:cancelStroke});
  ruler = createGrowthRulerEditor({api,section,state,transact,refresh,endTools:cancel});
  layout=createSurfaceWorkbenchLayout({section,vinePanel,state,cancel,getMode:()=>mode});
  refresh();
  return { refresh, cancel, root, reference, fit, get active() { return !!mode; }, key(e) { if(ruler?.key(e)||editor?.key(e))return true; if (e.key === 'Escape' && (mode || drag)) { cancel(); return true; } return false; } };
}
