import * as THREE from 'three';
import { buildBranchAsset, disposeBranchAsset } from './branch-kernel.js';
import { planBranchStroke } from './branch-stroke-data.js';
import { sampleLine, nearestParameter } from './tree-sculpt.js';
import { normalizeLocalBranchOptions, planLocalBranches } from './local-branch-data.js';
import { createBranchClickTool } from './branch-click-tool.js';

const $ = (id) => document.getElementById(id);
export function createBranchStroke(api, context) {
  const editable = id => api.isEditable?.(id) !== false;
  const editableSelection = () => ![...(api.getSelections?.() || [api.getSelection()].filter(Boolean))].some(id => !editable(id));
  const rejectUnit = () => api.toast('单元枝样式请在枝条工作台编辑；整树请选择承重骨架加枝');
  const panel = document.createElement('div'); panel.id = 'branchStrokeContext'; panel.className = 'continuous-tool';
  panel.innerHTML = `<label>画枝方式<select id="strokeMode"><option value="EXTEND">枝梢续画</option><option value="FORK">沿枝分叉</option></select></label><label>绘制平面<select id="strokePlane"><option value="VIEW">当前视图</option><option value="XZ">前视 XZ</option><option value="XY">俯视 XY</option><option value="YZ">侧视 YZ</option></select></label><div class="field-grid"><label>分叉位置<input id="strokeAttach" type="number" min="0.02" max="0.98" step="any" value="0.6"></label><label>长度（m，0 自由）<input id="strokeLength" type="number" min="0" max="12" step="0.05" value="0"></label></div><label>末端粗度倍率<input id="strokeTaper" type="range" min="0.05" max="1" step="0.01" value="0.25"></label><label>分叉根部粗度<input id="strokeRadius" type="range" min="0.1" max="1" step="0.05" value="0.55"></label><label>笔迹平滑<input id="strokeSmooth" type="range" min="0" max="1" step="0.05" value="0.5"></label><label>起始方向衔接<input id="strokeAlign" type="range" min="0" max="1" step="0.05" value="0.6"></label><label class="wb-check"><input id="strokeContinuous" type="checkbox" checked>连续绘制</label><label class="wb-check"><input id="strokeCompare" type="checkbox">显示调整前</label><span id="strokeState">待绘制</span><div class="wb-row form-actions"><button id="strokeApply" disabled><i data-lucide="check"></i>应用笔迹</button><button id="strokeReset" title="重画本笔"><i data-lucide="rotate-ccw"></i></button><button id="strokeCancel" title="结束绘制"><i data-lucide="x"></i></button></div>`;
  panel.querySelector('#strokeMode').add(new Option('选中枝增减下级', 'FILL'));
  panel.querySelector('#strokeMode').add(new Option('直接点击加枝', 'CLICK'));
  panel.querySelector('#strokeMode option[value="FORK"]').textContent = '画新枝（可带下级）';
  const local = document.createElement('fieldset'); local.id = 'localBranchFields';
  local.innerHTML = `<legend>局部下级分枝</legend><label class="wb-check"><input id="localBranchEnabled" type="checkbox" checked>新枝自动带下级分枝</label><div class="field-grid">
    <label>每枝下级数量<input id="localBranchCount" type="number" min="0" max="12" step="1" value="4"></label>
    <label>生成层数<select id="localBranchLevels"><option value="1">一层</option><option value="2">两层</option></select></label>
    <label>生长起点（%）<input id="localBranchStart" type="number" min="2" max="98" step="1" value="25"></label>
    <label>生长终点（%）<input id="localBranchEnd" type="number" min="2" max="98" step="1" value="90"></label>
    <label>长度比例<input id="localBranchLength" type="number" min="0.1" max="0.9" step="0.05" value="0.45"></label>
    <label>挂接处粗度比例<input id="localBranchRadius" type="number" min="0.1" max="0.8" step="0.05" value="0.5"></label>
    <label>展开角度（°）<input id="localBranchAngle" type="number" min="10" max="100" step="5" value="45"></label>
    <label>末端粗度比例<input id="localBranchTaper" type="number" min="0.02" max="1" step="0.01" value="0.15"></label>
    <label>自然变化<input id="localBranchVariation" type="number" min="0" max="0.7" step="0.05" value="0.2"></label>
    <label>变化种子<input id="localBranchSeed" type="number" min="1" max="2147483646" step="1" value="1"></label></div>
    <button id="localBranchReseed" type="button">换一组变化</button><p class="hint">只预览承重骨架。第二层每枝生成上层数量的一半（向上取整）。数量设 0 可移除本配置未编辑的分枝；手工编辑和已有挂接受保护。确认后配置随工程保存，重新选中母枝可继续调整。</p>`;
  panel.querySelector('#strokeState').before(local);
  const clickFields=document.createElement('div');clickFields.id='clickBranchFields';clickFields.hidden=true;
  clickFields.innerHTML=`<p class="hint">直接在树干或承重枝上单击，每次添加一束。新枝从点击的一侧向外生长。可连续点击不同母枝；中键转动视角，Esc 退出，Ctrl+Z 撤销。</p><div class="field-grid"><label>新枝长度 / 母枝<input id="clickBranchLength" type="number" min="0.1" max="1" step="0.05" value="0.45"></label><label>新枝展开角度（°）<input id="clickBranchAngle" type="number" min="10" max="100" step="5" value="45"></label><label>环绕偏转（°）<input id="clickBranchAzimuth" type="number" min="-180" max="180" step="5" value="0"></label></div>`;
  local.before(clickFields);
  context.register('STROKE', '画枝与局部增减', panel);
  const button = document.createElement('button'); button.id = 'openBranchStroke'; button.title = '连续画枝与分叉'; button.innerHTML = '<i data-lucide="spline"></i>'; document.querySelector('.viewport-tool-rail').append(button);
  const localButton = document.createElement('button'); localButton.id = 'openLocalBranches'; localButton.title = '点击加枝：开启后直接点击母枝，可自动带下级分枝'; localButton.innerHTML = '<i data-lucide="git-branch-plus"></i>'; document.querySelector('.viewport-tool-rail').append(localButton);
  const root = new THREE.Group(); root.name = 'BranchStrokePreview'; api.modelRoot.add(root);
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.025, 14, 10), new THREE.MeshBasicMaterial({ color: 0xe6c568, depthTest: false })); marker.renderOrder = 130; root.add(marker);
  const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7ed0d8, depthTest: false })); line.renderOrder = 130; root.add(line);
  const ray = new THREE.Raycaster(); let session = null, drag = null, ghost = null, timer = null, continuing = null;
  const localFields = { count: 'Count', levels: 'Levels', start: 'Start', end: 'End', length: 'Length', radius: 'Radius', angle: 'Angle', taper: 'Taper', variation: 'Variation', seed: 'Seed' };
  function localOptions() { return Object.fromEntries(Object.entries(localFields).map(([key, suffix]) => [key, +$('localBranch' + suffix).value / (['start','end'].includes(key) ? 100 : 1)])); }
  function drawClick() {
    clickFields.hidden=false;local.hidden=false;$('localBranchEnabled').closest('label').hidden=false;
    for(const id of ['strokePlane','strokeAttach','strokeLength','strokeSmooth','strokeAlign','strokeContinuous','strokeCompare'])$(id).closest('label').hidden=true;
    for(const id of ['strokeTaper','strokeRadius']){$(id).closest('label').hidden=false;$(id).disabled=false;}
    local.querySelectorAll('input:not(#localBranchEnabled),select,button').forEach(i=>i.disabled=!$('localBranchEnabled').checked);
    $('strokeApply').hidden=true;$('strokeReset').hidden=true;
  }
  let clickScopeHidden=false;
  // The click tool has its own raycast. Exclude protected legacy manual
  // descendants as well as ordinary unit-owned wood, with stable asset identity.
  const clickAssets = new WeakMap();
  const clickTool=createBranchClickTool({...api,getAsset(){const asset=api.getAsset();if(!asset)return asset;let filtered=clickAssets.get(asset);if(!filtered){filtered={...asset};clickAssets.set(asset,filtered);}filtered.masterBranches=asset.masterBranches.filter(b=>editable(b.stableId));return filtered;}},{
    open(){ clickScopeHidden=$('branchEditScopeBar').hidden;$('branchEditScopeBar').hidden=true;$('strokeMode').value='CLICK';drawClick();context.setMode('STROKE');localButton.classList.add('active');$('strokeState').textContent='点击加枝已开启 · 直接点击任意承重枝干，无需预先选中'; },
    close(){ $('branchEditScopeBar').hidden=clickScopeHidden;localButton.classList.remove('active');clickFields.hidden=true;$('strokeApply').hidden=false;if(context.mode==='STROKE')context.setMode(''); },
    status(text){$('strokeState').textContent=text;},
    options(){
      if([...panel.querySelectorAll('input[type="number"]')].some(i=>!i.disabled&&i.getClientRects().length&&(i.value===''||!i.validity.valid)))throw new Error('请输入有效参数');
      return {length:+$('clickBranchLength').value,angle:+$('clickBranchAngle').value,azimuth:+$('clickBranchAzimuth').value,radius:+$('strokeRadius').value,taper:+$('strokeTaper').value,children:$('localBranchEnabled').checked?localOptions():null};
    },
  });
  function loadLocalOptions() {
    const saved = session.authoring.local_branch_groups?.find(g => g.root === session.branch.stableId), values = saved || normalizeLocalBranchOptions();
    for (const [key, suffix] of Object.entries(localFields)) $('localBranch' + suffix).value = +(values[key] * (['start','end'].includes(key) ? 100 : 1)).toFixed(5);
    session.groupId = saved?.id || 'LOCAL_' + crypto.randomUUID().replaceAll('-', '');
  }
  function options() { return { mode: $('strokeMode').value, attach: +$('strokeAttach').value, length: +$('strokeLength').value, taper: +$('strokeTaper').value, radius: +$('strokeRadius').value, smooth: +$('strokeSmooth').value, align: +$('strokeAlign').value, normal: { XZ: [0, 1, 0], XY: [0, 0, 1], YZ: [1, 0, 0] }[$('strokePlane').value] || session?.normal }; }
  function anchor() { return sampleLine(session.branch.points, options().mode === 'EXTEND' ? 1 : options().attach); }
  function clearGhost() { if (ghost) { root.remove(ghost.group); disposeBranchAsset(ghost); ghost = null; } }
  function draw() { if (!session) return; const fill = options().mode === 'FILL'; marker.visible = !fill; marker.position.copy(anchor()); marker.scale.setScalar(Math.max(0.6, session.branch.length * 0.65)); line.geometry.dispose(); line.geometry = new THREE.BufferGeometry().setFromPoints(session.raw);
    clickFields.hidden=true;$('strokeApply').hidden=false;$('strokeCompare').closest('label').hidden=false;
    for (const id of ['strokePlane','strokeAttach','strokeLength','strokeTaper','strokeRadius','strokeSmooth','strokeAlign','strokeContinuous']) $(id).closest('label').hidden = fill;
    $('strokeAttach').disabled = options().mode !== 'FORK'; $('strokeRadius').disabled = options().mode !== 'FORK';
    local.hidden = options().mode === 'EXTEND'; $('localBranchEnabled').closest('label').hidden = fill;
    local.querySelectorAll('input:not(#localBranchEnabled),select,button').forEach(i => i.disabled = !fill && !$('localBranchEnabled').checked);
    $('strokeApply').textContent = fill ? '确认局部配置' : options().mode === 'EXTEND' ? '确认续画' : '确认新增枝条'; $('strokeReset').hidden = fill;
  }
  function rebuild() {
    clearTimeout(timer); timer = null; if (!session) return; draw();
    if (!editable(session.branch.stableId)) { cancel(); rejectUnit(); return; }
    if (session.authoring !== api.getAuthoring()) { cancel(); api.toast('工程已变化，请重新选择枝条调整'); return; }
    if (session.raw.length < 2 && options().mode !== 'FILL') { clearGhost(); session.planned = null; session.asset.group.visible = session.visibility; $('strokeApply').disabled = true; return; }
    try {
      if ([...panel.querySelectorAll('input[type="number"]')].some(i => !i.disabled && i.getClientRects().length && (i.value === '' || !i.validity.valid))) throw new Error('请输入有效参数');
      let planned;
      if (options().mode === 'FILL') planned = planLocalBranches(session.authoring, session.asset.masterBranches, session.branch.stableId, localOptions(), session.groupId);
      else {
        planned = planBranchStroke(session.authoring, api.getSettings(), session.asset.masterBranches, session.branch.stableId, session.raw, options(), session.id);
        if (options().mode === 'FORK' && $('localBranchEnabled').checked) {
          const skeleton = buildBranchAsset({ ...api.getSettings(), leaf_density: 0 }, null, [], 0, planned.authoring, { skeletonOnly: true });
          try { planned = { ...planned, ...planLocalBranches(planned.authoring, skeleton.masterBranches, planned.targetId, localOptions(), session.groupId) }; }
          finally { disposeBranchAsset(skeleton); }
        }
      }
      clearGhost();
      const built = buildBranchAsset({ ...api.getSettings(), leaf_density: 0 }, null, [], 0, planned.authoring, { skeletonOnly: true });
      // Budget or hidden ancestors must never silently turn a partial preview into success.
      if (planned.created?.some(id => !built.masterBranches.some(b => b.stableId === id))) { disposeBranchAsset(built); throw new Error('部分分枝无法生成，请减少数量并检查母枝是否隐藏或已删除'); }
      ghost = built; root.add(ghost.group); session.planned = planned;
      session.asset.group.visible = $('strokeCompare').checked; ghost.group.visible = !$('strokeCompare').checked;
      $('strokeApply').disabled = false;
      $('strokeState').textContent = planned.stats ? `局部骨架预览：新增 ${planned.stats.added}、移除 ${planned.stats.removed}、保护 ${planned.stats.protected}，本配置共 ${planned.stats.total} 根 · 待确认` : '笔迹预览 · 待确认';
    }
    catch (error) { clearGhost(); session.planned = null; session.asset.group.visible = session.visibility; $('strokeApply').disabled = true; $('strokeState').textContent = error.message; }
  }
  function preview() { if(clickTool.active){drawClick();return;}clearTimeout(timer); timer = setTimeout(rebuild, 90); draw(); }
  function open(branchId = '', mode = '') {
    cancel();
    if (branchId ? !editable(branchId) : !editableSelection()) return rejectUnit();
    if(mode==='CLICK'||(!mode&&$('strokeMode').value==='CLICK')){clickTool.open();return;}
    api.setTool('SELECT'); const asset = api.getAsset(), b = asset?.masterBranches.find((b) => b.stableId === (branchId || api.getSelection()) && !b.symmetryGroup);
    if (!b || asset.group.userData.pending_rebuild) return api.toast('请先选择已生成的枝条');
    if (!editable(b.stableId) || b.instanceId || b.unitOwner) return rejectUnit();
    if (mode) $('strokeMode').value = mode;
    session = { id: 'M' + crypto.randomUUID().replaceAll('-', ''), branch: b, asset, authoring: api.getAuthoring(), raw: [], planned: null, visibility: asset.group.visible, helpers: (api.selectionHelpers || []).map((h) => [h, h.visible]) }; session.helpers.forEach(([h]) => h.visible = false);
    loadLocalOptions();
    root.visible = true; context.setMode('STROKE'); button.classList.add('active'); $('strokeCompare').checked = false; $('strokeApply').disabled = true; $('strokeState').textContent = '待绘制'; draw();
    localButton.classList.add('active'); if (options().mode === 'FILL') rebuild();
  }
  function release() { const id = drag?.id; drag = null; api.controls.enabled = true; if (id != null && api.canvas.hasPointerCapture(id)) api.canvas.releasePointerCapture(id); }
  function cancel() { const clicked=clickTool.cancel();continuing = null; sessionSelect = null; if (!session) return clicked; release(); clearTimeout(timer); timer = null; session.asset.group.visible = session.visibility; session.helpers.forEach(([h, v]) => h.visible = v); session = null; clearGhost(); line.geometry.dispose(); line.geometry = new THREE.BufferGeometry(); root.visible = false; button.classList.remove('active'); localButton.classList.remove('active'); if (context.mode === 'STROKE') context.setMode(''); return true; }
  function apply(continueDrawing = $('strokeContinuous').checked) {
    if (!session || drag) return false; rebuild(); if (!session.planned) return false;
    const { authoring, targetId } = session.planned, mode = options().mode, parent = session.branch.stableId;
    cancel(); api.transact(mode === 'FILL' ? '更新局部分枝配置' : '新增枝条与下级分枝', a => {
      a.manual_branches = authoring.manual_branches; a.local_branch_groups = authoring.local_branch_groups;
      a.sculpt_layers = authoring.sculpt_layers; a.active_sculpt_layer = authoring.active_sculpt_layer; a.topology = authoring.topology;
    }, { bypassLayers: true });
    if (continueDrawing && mode !== 'FILL') continuing = mode === 'FORK' ? parent : targetId;
    else sessionSelect = targetId;
    return true;
  }
  let sessionSelect = null;
  function cast(e) { const r = api.canvas.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((e.clientX - r.x) / r.width * 2 - 1, -(e.clientY - r.y) / r.height * 2 + 1), api.camera); }
  function begin(e) {
    if(clickTool.active)return clickTool.begin(e);
    if (!session || e.button !== 0) return false; if ($('strokeCompare').checked) return true; cast(e);
    if (options().mode === 'FILL') return true;
    if (options().mode === 'FORK') { const meshes = []; session.asset.group.traverse((o) => { if (o.isMesh && o.userData.stable_id === session.branch.stableId) meshes.push(o); }); const hit = ray.intersectObjects(meshes)[0]; if (hit) $('strokeAttach').value = +THREE.MathUtils.clamp(nearestParameter(session.branch.points, api.modelRoot.worldToLocal(hit.point.clone())), 0.02, 0.98).toFixed(3); }
    const origin = anchor(), key = $('strokePlane').value, normal = key === 'VIEW' ? api.camera.getWorldDirection(new THREE.Vector3()) : new THREE.Vector3(...{ XZ: [0, 1, 0], XY: [0, 0, 1], YZ: [1, 0, 0] }[key]).transformDirection(api.modelRoot.matrixWorld);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, api.modelRoot.localToWorld(origin.clone())), point = ray.ray.intersectPlane(plane, new THREE.Vector3()); if (!point) return true;
    session.normal = normal.clone().transformDirection(api.modelRoot.matrixWorld.clone().invert()).toArray(); drag = { id: e.pointerId, plane, shift: origin.clone().sub(api.modelRoot.worldToLocal(point)) }; session.raw = [origin]; session.planned = null; clearGhost(); session.asset.group.visible = session.visibility; api.canvas.setPointerCapture(e.pointerId); api.controls.enabled = false; $('strokeState').textContent = '绘制中'; $('strokeApply').disabled = true; draw(); return true;
  }
  function move(e) { if(clickTool.active)return clickTool.move(e);if (!session) return false; if (drag) { cast(e); const p = ray.ray.intersectPlane(drag.plane, new THREE.Vector3()); if (p) { api.modelRoot.worldToLocal(p).add(drag.shift); if (session.raw.length < 256 && p.distanceTo(session.raw.at(-1)) > 0.006) { session.raw.push(p); draw(); } } } return true; }
  function end(e) { if(clickTool.active)return clickTool.end(e);if (!session || e.button !== 0) return false; if (drag) { move(e); release(); rebuild(); } return true; }
  panel.querySelectorAll('input:not(#strokeCompare):not(#strokeContinuous),select').forEach((i) => i.oninput = preview);
  $('strokeMode').oninput = () => { const mode=$('strokeMode').value;if(mode==='CLICK'){cancel();if(!editableSelection())return rejectUnit();clickTool.open();return;}if(clickTool.active){const id=clickTool.lastBranch;cancel();open(id,mode);return;}if (session) { session.raw = []; session.planned = null; loadLocalOptions(); rebuild(); } };
  $('localBranchReseed').onclick = () => { $('localBranchSeed').value = (+$('localBranchSeed').value % 2147483646) + 1; preview(); };
  localButton.onclick = () => {if(clickTool.active)cancel();else{cancel();if(!editableSelection())return rejectUnit();clickTool.open();}};
  $('strokeCompare').onchange = () => { if (session) { session.asset.group.visible = $('strokeCompare').checked; if (ghost) ghost.group.visible = !$('strokeCompare').checked; } };
  $('strokeApply').onclick = () => apply(); $('strokeCancel').onclick = cancel; $('strokeReset').onclick = () => { if (!session) return; session.raw = []; session.planned = null; clearGhost(); session.asset.group.visible = session.visibility; $('strokeState').textContent = '待绘制'; rebuild(); }; button.onclick = () => open();
  for (const name of ['pointercancel', 'lostpointercapture']) api.canvas.addEventListener(name, () => { if (drag) cancel(); }); window.addEventListener('blur', () => { if (drag) cancel(); }); root.visible = false;
  return { open, apply, cancel, begin, move, end, root, marker, get active() { return !!session||clickTool.active; }, get clicking(){return clickTool.active;}, get dirty() { return !!session && (session.raw.length > 0 || options().mode === 'FILL'); }, get pending() { return !!timer; }, get session() { return session; }, get ghost() { return ghost; }, refresh() { clickTool.refresh();if (session && session.asset !== api.getAsset()) cancel(); if (!api.getAsset()?.group.userData.pending_rebuild) { if (sessionSelect) { const id = sessionSelect; sessionSelect = null; api.select(id); } if (continuing) { const id = continuing; continuing = null; open(id); } } }, key(e) { if(clickTool.key(e))return true;if (!session) return false; if (e.key === 'Escape') { cancel(); return true; } if (e.key === 'Enter' && !e.target.matches?.('input,select,textarea')) { apply(); return true; } return false; } };
}

