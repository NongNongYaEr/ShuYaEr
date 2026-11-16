import {addManualDecal, adoptScatterPlacements, duplicateManualDecal, isManualDecalPlacement, makeManualDecal, manualDecalPartFaces, manualDecalPlacements, removeManualDecal, replaceManualDecal} from './manual-decal-rules.js';
import {fitManualDecal} from './manual-decal-fit.js';
import {SURFACE_DECAL_STYLES} from './surface-decal-styles.js';

const commands = [
 ['move', '移动', 'G'], ['rotate', '旋转', 'R'],
 ['scale', '缩放', 'S'], ['duplicate', '复制', 'Shift+D'],
 ['width', '宽度', 'S → X'], ['height', '高度', 'S → Y'], ['depth', '深度', 'S → Z'],
];
const scaleAxes = {
 width:{key:'x',property:'widthMeters',min:.005,max:3},
 height:{key:'y',property:'heightMeters',min:.005,max:3},
 depth:{key:'z',property:'depthMeters',min:.001,max:.5},
};
const scaleModeByKey = new Map(Object.entries(scaleAxes).map(([mode, axis]) => [axis.key, mode]));
const instructions = {
 add: '在树表面点击放置 · Esc 取消',
 move: '沿树表面移动 · 点击或 Enter 确认 · Esc 取消',
 rotate: '移动鼠标旋转 · 点击或 Enter 确认 · Esc 取消',
 scale: '移动鼠标缩放 · X 宽度 / Y 高度 / Z 深度 · 点击或 Enter 确认',
 width: '沿贴花 X 轴调宽度 · 点击或 Enter 确认 · Esc 取消',
 height: '沿贴花 Y 轴调高度 · 点击或 Enter 确认 · Esc 取消',
 depth: '沿贴花法线调深度 · 点击或 Enter 确认 · Esc 取消',
 duplicate: '点击树表面确认副本位置 · Esc 取消',
};
const followsSurface = mode => ['add', 'move', 'duplicate'].includes(mode);
const isScaling = mode => mode === 'scale' || Object.hasOwn(scaleAxes, mode);
const showsDimensions = mode => mode === 'add' || isScaling(mode);
const sameAnchor = (a, b) => a.face === b.face && a.bary.every((weight, i) => Math.abs(weight - b.bary[i]) < 1e-8);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rotation = value => ((value + 180) % 360 + 360) % 360 - 180;
const stampSizes = {
 burl:[.18,.20], 'branch-scar':[.13,.16], 'healed-wound':[.12,.15], 'insect-holes':[.06,.09],
 'bark-fissure':[.085,.135], 'peeling-bark':[.10,.15], 'small-knot':[.055,.075], 'double-knot':[.21,.15],
 'canker-callus':[.14,.16], 'pruned-cut':[.12,.12], 'split-scar':[.12,.16], 'lightning-scar':[.10,.16],
 'woodpecker-holes':[.095,.14], 'beetle-gallery':[.09,.13], 'termite-tracks':[.09,.13],
 'crack-web':[.11,.14], 'cross-split':[.17,.10], 'frost-crack':[.07,.19], 'water-streak':[.07,.21],
};

export function makeFittedDecalProjection(d, effect, source, hit, {previous, geometry} = {}) {
 const style = SURFACE_DECAL_STYLES[effect.params.burlStyle]?.id;
 const [width, height] = stampSizes[style] ?? [.14,.14];
 const size = Math.min(1, d.actualHeightMeters * .2 / Math.max(width, height));
 const widthMeters = Math.max(.005, width * size), heightMeters = Math.max(.005, height * size);
 const base = makeManualDecal(d, {...effect, manualDecal:null}, hit, {
  widthMeters, heightMeters,
  rotation:previous?.rotation ?? 0,
  depthMeters:clamp(Math.min(widthMeters, heightMeters) * .25, .004, .035),
 });
 return {...base, ...fitManualDecal(source, base.anchor, d.actualHeightMeters, base, geometry)};
}

const previewSize = point => point
 ? `${(point.widthMeters * 100).toFixed(1)} × ${(point.heightMeters * 100).toFixed(1)} cm · 深度 ${(point.depthMeters * 1000).toFixed(1)} mm`
 : '';

export function createDecalPointEditor(api) {
 let owner = null, selectedId = null, hoveredId = null, modal = null, dragPreview = null;
 const pointList = effect => effect ? manualDecalPlacements(effect) : [];
 const currentPoint = effect => pointList(effect).find(point => point.id === selectedId);
 const identity = (d, e) => d && e ? `${d.id}:${d.resources.source}:${e.id}` : null;
 const placementState = (d, e) => JSON.stringify([
  d.actualHeightMeters, e.params, e.enabled, e.scopeRef, e.manualDecal, e.manualDecals,
  d.surface.masks.find(mask => mask.id === e.maskRef),
  d.surface.areas.find(area => area.id === e.scopeRef), manualDecalPartFaces(d, e),
 ]);

 function drawGuide() {
  const renderer = api.renderer(), effect = api.effect(), d = api.document(), source = api.source();
  if (!renderer?.setDecalPointOverlay) return;
  const dragging = dragPreview && dragPreview.project === d?.id && dragPreview.source === source ? dragPreview.point : null;
  const points = dragging ? [] : pointList(effect);
  const preview = dragging ?? modal?.preview ?? null;
  if (showsDimensions(modal?.mode)) {
   const size = api.panel.querySelector('[data-decal-fit-size]'), text = previewSize(preview);
   if (size && size.textContent !== text) size.textContent = text;
  }
  if (!source || !d || (!dragging && renderer.mode !== -1) || (!points.length && !preview)) {
   renderer.setDecalPointOverlay(null);
   return;
  }
  const visible = effect?.enabled && effect.opacity > 0;
  const scaleAxis = dragging ? null : scaleAxes[modal?.mode]?.key ?? null;
  renderer.setDecalPointOverlay({
   points: visible ? points : points.map(point => ({...point, enabled:false})),
   selectedId, hoveredId, preview, source, actualHeightMeters: d.actualHeightMeters,
   scaleAxis, depthOnly:scaleAxis==='z',
  });
 }

 function previewLibraryDecal(effect, hit) {
  if (!effect || !hit) {
   if (!dragPreview) return;
   dragPreview = null;
  } else {
   const d = api.document(), source = api.source();
   const point = makeFittedDecalProjection(d, effect, source, hit, {geometry:api.renderer().decalPickCache?.geometry});
   dragPreview = {project:d.id, source, point};
  }
  drawGuide();
 }

 function refresh() {
  const d = api.document(), effect = api.effect(), next = identity(d, effect);
  if (owner !== next) {
   owner = next;
   selectedId = hoveredId = null;
   modal = null;
  }
  if (selectedId && !currentPoint(effect)) selectedId = null;
  if (modal && (api.busy() || api.locked(effect.id) || api.renderer().tool !== 'orbit' || api.renderer().mode !== -1 || modal.state !== placementState(d, effect))) modal = null;
  drawGuide();
 }

 function cancel(sync = true) {
  if (!modal) return false;
  modal = null;
  if (sync) api.changed();
  return true;
 }

 function getScatter(effect) {
  if (!effect.params.burlCount) return [];
  const placement = api.placement(effect.id);
  return placement?.result?.placements ?? null;
 }

 function change(effect, mutate) {
  if (api.busy() || api.locked(effect.id)) return;
  const before = selectedId;
  try {
   api.edit(effect.id, (d, e) => {
    if (identity(d, e) !== owner || api.locked(e.id)) throw Error('贴花图层已切换或锁定。');
    mutate(d, e);
   });
  } catch (error) {
   selectedId = before;
   api.notify(error.message, true);
   api.changed();
  }
 }

 function showSelection(focusRow) {
  const pick = api.panel.querySelector('[data-decal-select][aria-pressed=true]');
  if (!pick) return;
  const list = pick.closest('.studio-decal-list'), row = pick.getBoundingClientRect(), bounds = list.getBoundingClientRect();
  if (row.top < bounds.top) list.scrollTop -= bounds.top - row.top;
  if (row.bottom > bounds.bottom) list.scrollTop += row.bottom - bounds.bottom;
  if (focusRow) pick.focus({preventScroll:true});
 }

 function frameSelectionPoint(point) {
  const renderer = api.renderer();
  renderer.selectionPoint = renderer.decalPointScreen?.(point, api.source())?.point ?? null;
 }

 function select(id, focusRow = false) {
  const effect = api.effect(), point = pointList(effect).find(point => point.id === id);
  if (!point) return;
  cancel(false);
  selectedId = id;
  frameSelectionPoint(point);
  api.changed();
  showSelection(focusRow);
 }

 function start(mode, pointer = null) {
  const effect = api.effect(), d = api.document();
  if (!effect || api.busy() || api.locked(effect.id) || !api.source()) return;
  if (modal?.mode === mode) { cancel(); return; }
  const point = currentPoint(effect);
  if (mode !== 'add' && !point) return;
  const existing = isManualDecalPlacement(effect) ? null : getScatter(effect);
  if (!isManualDecalPlacement(effect) && !existing) {
   api.notify('请启用图层并等待散布完成，再添加点位。', true);
   return;
  }
  if (['add', 'duplicate'].includes(mode) && (existing ?? pointList(effect)).length >= api.remaining(effect.id)) {
   api.notify('表面贴花名额已满，请先减少其它贴花。', true);
   return;
  }
  api.prepare();
  const renderer = api.renderer();
  const center = point && renderer.decalPointScreen?.(point, api.source());
  const origin = pointer || (center && {clientX:center.x, clientY:center.y});
  const faces = followsSurface(mode) ? manualDecalPartFaces(d, effect) : null;
  hoveredId = null;
  modal = {mode, point, center, origin, pointer, existing, faces:faces && new Set(faces), state:placementState(d, effect), preview:followsSurface(mode) ? null : point};
  if (pointer && followsSurface(mode)) updatePreview(pointer);
  api.changed();
 }

 function updatePreview(pointer) {
  const {mode, point, origin, center, faces} = modal;
  modal.pointer = pointer;
  if (followsSurface(mode)) {
   const renderer = api.renderer();
   const hit = renderer.pick(pointer.clientX, pointer.clientY, {accelerated:true});
   if (!hit || faces && !faces.has(hit.face)) modal.preview = null;
   else if (mode === 'add') modal.preview = makeFittedDecalProjection(api.document(), api.effect(), api.source(), hit, {geometry:renderer.decalPickCache?.geometry});
   else modal.preview = {...point, id:mode === 'duplicate' ? undefined : point.id, anchor:{face:hit.face,bary:hit.bary}};
  } else {
   modal.origin ??= pointer;
   const start = origin ?? pointer;
   const dx = pointer.clientX - start.clientX, dy = pointer.clientY - start.clientY;
   const radius = center ? Math.hypot(start.clientX - center.x, start.clientY - center.y) : 0;
   if (mode === 'rotate') {
    const angle = radius >= 10 ? (Math.atan2(center.y - pointer.clientY, pointer.clientX - center.x) - Math.atan2(center.y - start.clientY, start.clientX - center.x)) * 180 / Math.PI : dx;
    modal.preview = {...point, rotation:rotation(point.rotation + angle)};
   } else {
    const ratio = radius >= 10 ? Math.hypot(pointer.clientX - center.x, pointer.clientY - center.y) / radius : Math.exp((dx - dy) * .01);
    const axis = scaleAxes[mode];
    if (axis) {
     const {property, min, max} = axis;
     modal.preview = {...point, [property]:clamp(point[property] * ratio, min, max)};
    } else {
     const factor = clamp(ratio, .005 / Math.min(point.widthMeters, point.heightMeters), 3 / Math.max(point.widthMeters, point.heightMeters));
     modal.preview = {
      ...point, widthMeters:clamp(point.widthMeters * factor, .005, 3), heightMeters:clamp(point.heightMeters * factor, .005, 3),
      depthMeters:clamp(point.depthMeters * factor, .001, .5),
     };
    }
   }
  }
  drawGuide();
 }

 function confirm() {
  const {mode, point, existing, preview} = modal;
  const effect = api.effect();
  if (!preview || !effect) {
   api.notify('请在可放置的树表面选择一个位置。', true);
   return;
  }
  modal = null;
  const sameSize = point && point.widthMeters === preview.widthMeters && point.heightMeters === preview.heightMeters && point.depthMeters === preview.depthMeters;
  if (mode === 'move' && sameAnchor(point.anchor, preview.anchor) || mode === 'rotate' && point.rotation === preview.rotation || isScaling(mode) && sameSize) {
   api.changed();
   return;
  }
  change(effect, (d, e) => {
   if (mode === 'add') {
    if (existing) adoptScatterPlacements(d, e, existing);
    selectedId = addManualDecal(d, e, preview.anchor, preview);
    e.enabled = true;
   } else if (mode === 'duplicate') {
    if (pointList(e).length >= api.remaining(e.id)) throw Error('表面贴花名额已满。');
    selectedId = duplicateManualDecal(e, point.id);
    replaceManualDecal(e, selectedId, {anchor:preview.anchor}, d.resources.source);
   } else {
    const {anchor, rotation, widthMeters, heightMeters, depthMeters} = preview;
    replaceManualDecal(e, point.id, {anchor, rotation, widthMeters, heightMeters, depthMeters}, d.resources.source);
   }
  });
  frameSelectionPoint(currentPoint(api.effect()));
  showSelection(false);
 }

 function remove() {
  const effect = api.effect(), point = currentPoint(effect);
  if (!point) return;
  change(effect, (_, e) => {
   const index = pointList(e).findIndex(p => p.id === point.id);
   const points = removeManualDecal(e, point.id);
   selectedId = points[Math.min(index, points.length - 1)]?.id ?? null;
  });
  frameSelectionPoint(currentPoint(api.effect()));
  showSelection(false);
 }

 function pointerAction(event) {
  const renderer = api.renderer();
  if (!api.effect() || api.busy() || event.altKey || event.ctrlKey || event.metaKey || renderer.tool !== 'orbit' || renderer.mode !== -1) return false;
  if (modal && event.button === 2) { cancel(); return true; }
  if (event.button !== 0) return false;
  if (modal) {
   updatePreview(event);
   confirm();
  } else {
   const id = renderer.pickDecalPoint?.(event.clientX, event.clientY);
   if (!id) return false;
   select(id);
  }
  renderer.canvas.focus({preventScroll:true});
  event.preventDefault();
  return true;
 }

 function pointerMotion(event) {
  const effect = api.effect(), renderer = api.renderer();
  if (!effect || api.busy() || event.buttons || event.altKey || renderer.tool !== 'orbit' || renderer.mode !== -1) return false;
  if (modal) {
   updatePreview(event);
   return true;
  }
  const id = pointList(effect).length ? renderer.pickDecalPoint?.(event.clientX, event.clientY) ?? null : null;
  if (hoveredId !== id) { hoveredId = id; drawGuide(); }
  return false;
 }

 function pointerLeave() {
  hoveredId = null;
  if (modal && followsSurface(modal.mode)) modal.preview = null;
  drawGuide();
 }

 function key(event, inViewport) {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (modal && event.key === 'Escape') return cancel();
  if (!inViewport && !event.target?.closest?.('[data-decal-points]')) return false;
  const effect = api.effect();
  if (!effect || api.busy() || api.locked(effect.id)) return false;
  const letter = event.key.toLowerCase();
  if (modal) {
   const constrainedMode = scaleModeByKey.get(letter);
   if (constrainedMode && !event.shiftKey && isScaling(modal.mode)) {
    if (!event.repeat) {
     modal.mode = modal.mode === constrainedMode ? 'scale' : constrainedMode;
     const pointer = modal.pointer ?? modal.origin;
     if (pointer) updatePreview(pointer);
     api.changed();
    }
    return true;
   }
   if (letter === 'enter' && !event.repeat) confirm();
   return ['enter','delete','g','r','s','d','b','e','f'].includes(letter);
  }
  if (!currentPoint(effect)) return false;
  if (event.key === 'Delete' && !event.shiftKey) {
   if (!event.repeat) remove();
   return true;
  }
  const mode = event.shiftKey ? (letter === 'd' ? 'duplicate' : null) : ({g:'move', r:'rotate', s:'scale'})[letter];
  if (!mode) return false;
  if (!event.repeat) start(mode, inViewport ? api.renderer().lastPointer : null);
  return true;
 }

 function render(pane, effect, {node, button, icon, field}) {
  const ordered = pointList(effect), scatter = isManualDecalPlacement(effect) ? null : getScatter(effect);
  const rack = node('section', null, 'studio-decal-points');
  rack.dataset.decalPoints = '';
  rack.dataset.decalTool = modal?.mode ?? 'idle';
  if (scaleAxes[modal?.mode]) rack.dataset.decalAxis = scaleAxes[modal.mode].key;
  const title = node('h4', '贴花点位');
  rack.append(title);
  const actions = node('div', null, 'studio-quick-actions');
  rack.append(actions);
  const add = button(actions, modal?.mode === 'add' ? '取消添加' : '添加点位', () => start('add'));
  add.dataset.decalAdd = '';
  add.title = '新增点位按贴花样式和落点表面设置初始尺寸与深度。';
  const hasSlots = (scatter ?? ordered).length < api.remaining(effect.id);
  add.disabled ||= !api.source() || !hasSlots || !isManualDecalPlacement(effect) && !scatter;
  if (modal?.mode === 'add') add.setAttribute('aria-pressed','true');
  if (!hasSlots) add.title = '表面贴花名额已满，隐藏点位也占用名额。';
  if (scatter?.length) {
   const adopt = button(actions, '编辑现有点位', () => {
    cancel(false);
    api.prepare();
    change(effect, (d, e) => { selectedId = adoptScatterPlacements(d, e, scatter)[0]?.id ?? null; });
   });
   adopt.dataset.decalEditExisting = '';
   if (hasSlots) add.title += ' 已有散布点会一起保留。';
  }
  if (isManualDecalPlacement(effect)) {
   title.textContent += ` · ${ordered.filter(point => point.enabled).length} / ${ordered.length} 显示`;
   const list = node('ul', null, 'studio-decal-list');
   for (const [index, point] of ordered.entries()) {
    const name = `点位 ${index + 1}`;
    const row = node('li', null, 'studio-decal-row');
    row.dataset.decalPointId = point.id;
    const choose = button(row, name, () => select(point.id, true), 'studio-decal-select');
    choose.dataset.decalSelect = '';
    choose.setAttribute('aria-pressed', String(point.id === selectedId));
    const eye = button(row, '', () => {
     cancel(false);
     change(effect, (d, e) => replaceManualDecal(e, point.id, {enabled:!point.enabled}, d.resources.source));
    }, 'studio-decal-eye');
    eye.append(icon(point.enabled ? 'eye' : 'hidden'));
    eye.dataset.decalEye = '';
    eye.title = eye.ariaLabel = `${point.enabled ? '隐藏' : '显示'}${name}`;
    eye.setAttribute('aria-pressed', String(point.enabled));
    list.append(row);
   }
   if (ordered.length) rack.append(list);
   const tools = node('div', null, 'studio-quick-actions studio-decal-tools');
   for (const [mode, label, shortcut] of commands) {
    const control = button(tools, `${label} ${shortcut}`, () => start(mode));
    control.dataset.decalTransform = mode;
    control.setAttribute('aria-pressed',String(modal?.mode === mode));
    control.disabled ||= !currentPoint(effect) || mode === 'duplicate' && !hasSlots;
   }
   const del = button(tools, '删除 Del', () => { cancel(false); remove(); });
   del.dataset.decalDelete = '';
   del.disabled ||= !currentPoint(effect);
   if (ordered.length) rack.append(tools);
   const point = currentPoint(effect);
   if (point) {
    const dimensions = node('div', null, 'studio-decal-dimensions');
    rack.append(dimensions);
    for (const [key, property, label, unit, scale, min, max] of [
     ['width','widthMeters','宽度','cm',100,.5,300], ['height','heightMeters','高度','cm',100,.5,300],
     ['depth','depthMeters','投射深度','mm',1000,1,500],
    ]) {
     const input = field(dimensions, label, point[property] * scale, value => {
      if (value / scale === point[property]) return;
      change(effect, (d, e) => replaceManualDecal(e, point.id, {[property]:value / scale}, d.resources.source));
     }, {min,max,step:.1,unit,slider:false,live:false});
     input.dataset.decalPointDimension = key;
     if (key === 'depth') input.title += ' mm · 控制沿落点法线的覆盖范围';
     input.disabled ||= !!modal;
    }
    const fit = button(dimensions, '按树面重设尺寸与深度', () => {
     const {widthMeters, heightMeters, depthMeters} = makeFittedDecalProjection(api.document(), effect, api.source(), point.anchor, {
      previous:point, geometry:api.renderer().decalPickCache?.geometry,
     });
     if (widthMeters === point.widthMeters && heightMeters === point.heightMeters && depthMeters === point.depthMeters) return;
     change(effect, (d, e) => replaceManualDecal(e, point.id, {widthMeters,heightMeters,depthMeters}, d.resources.source));
    });
    fit.dataset.decalRefit = '';
    fit.disabled ||= !!modal || !api.source();
   }
  }
  if (modal) rack.append(node('p', instructions[modal.mode], 'surface-note'));
  if (showsDimensions(modal?.mode)) {
   const size = node('p', previewSize(modal.preview), 'surface-note');
   size.dataset.decalFitSize = '';
   rack.append(size);
  }
  pane.append(rack);
 }

 return {refresh, render, select, previewLibraryDecal, cancel, pointerAction, pointerMotion, pointerLeave, key, get hint(){return instructions[modal?.mode];}, dispose:()=>api.renderer()?.setDecalPointOverlay?.(null)};
}
