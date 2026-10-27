import * as THREE from 'three';
import { symmetryPreview } from './branch-symmetry.js';
import { SCULPT_TOOLS, createSculptSnapshot, advanceSculptSnapshot, regionWeights, deformTree, sculptOverrides, createMeshPreview } from './tree-sculpt.js';
import { rigidSculptInstances, sculptInstanceFrames } from './sculpt-instance-follow.js';
import { branchInstanceFrame } from './branch-kernel.js';
import { createSculptBrushWorkflow } from './sculpt-brush-workflow.js';

export function createSculptController({ canvas, camera, controls, getAsset, getAuthoring, getSelectedIds, getTool, getEditTargets, getUnitBrush = () => null, cancelUnitBrush = () => getUnitBrush()?.cancel(), showActiveBranches = () => {}, isBlocked = () => false, isVisible = () => true, transact, commitPreview, status }) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('sculptOverlay');
  const weightsGroup = $('sculptWeights');
  let stroke = null;
  let hover = null;
  let previewFrame = 0;
  let hoverFrame = 0;
  let hoverSnapshot = null;
  let shiftHeld = false;
  const feedback = document.createElement('div'); feedback.id = 'sculptFeedback'; feedback.className = 'sculpt-feedback'; feedback.hidden = true;
  feedback.innerHTML = '<strong></strong><span></span><small>黄：强影响 · 青：弱影响 · 紫：保护 · 橙：固定点</small>';
  canvas.parentElement.append(feedback);
  const weightLines = new Map(), pinMarkers = new Map();
  const brush = createSculptBrushWorkflow({canvas, controls, getTool,
    blocked: () => Boolean(stroke) || getUnitBrush()?.active || isBlocked() || !getAsset() || getAsset().group.userData.pending_rebuild || !$('busyOverlay').hidden,
    refresh: () => {if (hover) hoverAt(hover);}, hidePreview:hideFeedback, status});
  function hideFeedback() {overlay.setAttribute('hidden', ''); feedback.hidden = true; getUnitBrush()?.hide();}
  function preparedHover() {
    const asset=getAsset(),overrides=getAuthoring().overrides;
    if(!hoverSnapshot||hoverSnapshot.asset!==asset||hoverSnapshot.overrides!==overrides)
      hoverSnapshot={asset,overrides,snapshot:createSculptSnapshot(asset.masterBranches,overrides)};
    return hoverSnapshot.snapshot;
  }
  const numeric = (id, fallback, min, max) => THREE.MathUtils.clamp(Number($(id).value) || fallback, min, max);
  function settings(snapshot) {
    return {
      radius: numeric('sculptRadius', 160, 20, 700), strength: numeric('sculptStrength', 0.65, 0.05, 1),
      hardness: Number($('sculptHardness').value), flexibility: Number($('sculptFlexibility').value),
      preserveLength: Number($('sculptLength').value), scope: $('sculptScope').value,
      depthRange: numeric('sculptDepth', 1.5, 0.05, 30), protectTrunk: $('sculptProtectTrunk').checked,
      selectedOnly: true, selectedIds: getEditTargets([...snapshot.values()]),
      direction: $('sculptDirection').value,
      isVisible,
    };
  }
  function projection() {
    const asset = getAsset();
    const bounds = canvas.getBoundingClientRect();
    asset.group.updateWorldMatrix(true, true);
    camera.updateMatrixWorld();
    const localToView = camera.matrixWorldInverse.clone().multiply(asset.group.matrixWorld);
    const localToClip = camera.projectionMatrix.clone().multiply(localToView);
    const clipToLocal = localToClip.clone().invert();
    const cached = new WeakMap(), clip = localToClip.elements, view = localToView.elements;
    return {
      bounds,
      project(point) {
        if (cached.has(point)) return cached.get(point);
        const {x,y,z} = point, w = 1 / (clip[3]*x + clip[7]*y + clip[11]*z + clip[15]);
        const result = {x:((clip[0]*x + clip[4]*y + clip[8]*z + clip[12])*w*.5+.5)*bounds.width,
          y:(.5-(clip[1]*x + clip[5]*y + clip[9]*z + clip[13])*w*.5)*bounds.height,
          clip:(clip[2]*x + clip[6]*y + clip[10]*z + clip[14])*w,
          depth:-(view[2]*x + view[6]*y + view[10]*z + view[14])};
        cached.set(point,result); return result;
      },
      unproject(point, depth) { return new THREE.Vector3(point[0] / bounds.width * 2 - 1, -point[1] / bounds.height * 2 + 1, depth).applyMatrix4(clipToLocal); },
    };
  }
  function centerAt(snapshot, projection, point, radius, targets) {
    let closest = null;
    for (const branch of snapshot.values()) {
      if (!isVisible(branch.stableId) || !targets.has(branch.stableId)) continue;
      for (let i = 0; i < branch.points.length - 1; i += 1) {
        const a = projection.project(branch.points[i]);
        const b = projection.project(branch.points[i + 1]);
        if (a.clip < -1 || a.clip > 1 || b.clip < -1 || b.clip > 1) continue;
        const dx = b.x - a.x; const dy = b.y - a.y;
        const t = THREE.MathUtils.clamp(((point[0] - a.x) * dx + (point[1] - a.y) * dy) / Math.max(1e-6, dx * dx + dy * dy), 0, 1);
        const distance = Math.hypot(a.x + dx * t - point[0], a.y + dy * t - point[1]);
        if (distance > radius) continue;
        const depth = a.depth + (b.depth - a.depth) * t;
        if (!closest || (distance < 12 && closest.distance < 12 ? depth < closest.depth : distance < closest.distance)) {
          closest = { distance, depth, clip: a.clip + (b.clip - a.clip) * t };
        }
      }
    }
    if (!closest) return null;
    const center3d = projection.unproject(point, closest.clip);
    return { depth: closest.depth, clip: closest.clip, center3d,
      worldRadius: center3d.distanceTo(projection.unproject([point[0] + radius, point[1]], closest.clip)) };
  }
  const pointerPosition = (event, bounds) => [event.clientX - bounds.left, event.clientY - bounds.top];
  function showWeights(snapshot, weights, point, options, proj) {
    overlay.removeAttribute('hidden');
    overlay.style.left = `${canvas.offsetLeft}px`;
    overlay.style.top = `${canvas.offsetTop}px`;
    overlay.style.width = `${proj.bounds.width}px`;
    overlay.style.height = `${proj.bounds.height}px`;
    overlay.setAttribute('viewBox', `0 0 ${proj.bounds.width} ${proj.bounds.height}`);
    for (const [id, radius] of [['sculptOuter', options.radius], ['sculptInner', options.radius * options.hardness]]) {
      $(id).setAttribute('cx', point[0]); $(id).setAttribute('cy', point[1]); $(id).setAttribute('r', radius);
    }
    overlay.dataset.smoothing = String(Boolean(options.smoothing));
    const retained = new Set(), retainedPins = new Set();
    let count = 0;
    snapshot.forEach((branch) => {
      if (!isVisible(branch.stableId) || !options.selectedIds.has(branch.stableId)) return;
      const values = weights.get(branch.id) || [];
      if (values.some((value) => value > 0)) count += 1;
      for (let i = 1; i < branch.controlPoints.length; i += 1) {
        const weight = Math.max(values[i] || 0, values[i - 1] || 0);
        const masked = Math.max(branch.mask[i] || 0, branch.mask[i - 1] || 0);
        if (!weight && !masked) continue;
        const a = proj.project(branch.controlPoints[i - 1]); const b = proj.project(branch.controlPoints[i]);
        if (a.clip < -1 || a.clip > 1 || b.clip < -1 || b.clip > 1) continue;
        if (!weight && Math.min(Math.hypot(a.x-point[0],a.y-point[1]),Math.hypot(b.x-point[0],b.y-point[1])) > options.radius) continue;
        const key = `${branch.id}:${i}`; retained.add(key);
        let line = weightLines.get(key);
        if (!line) {line = document.createElementNS('http://www.w3.org/2000/svg', 'line'); weightLines.set(key,line); weightsGroup.append(line);}
        line.setAttribute('x1', a.x); line.setAttribute('y1', a.y); line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
        line.setAttribute('stroke', masked > 0.1 ? '#ce91d5' : `rgb(${Math.round(100 + weight * 145)}, ${Math.round(170 + weight * 25)}, ${Math.round(210 - weight * 130)})`);
        line.setAttribute('opacity', Math.max(masked * 0.8, weight * 0.85));
      }
      for (const i of new Set([0,...branch.pins])) {
        const p = proj.project(branch.controlPoints[i]);
        if (p.clip < -1 || p.clip > 1 || Math.hypot(p.x-point[0],p.y-point[1]) > options.radius) continue;
        const key = `${branch.id}:${i}`; retainedPins.add(key);
        let marker = pinMarkers.get(key);
        if (!marker) {marker = document.createElementNS('http://www.w3.org/2000/svg','circle'); marker.classList.add('sculpt-pin'); marker.setAttribute('r',4); pinMarkers.set(key,marker); weightsGroup.append(marker);}
        marker.setAttribute('cx',p.x); marker.setAttribute('cy',p.y);
      }
    });
    for (const [key,line] of weightLines) if (!retained.has(key)) {line.remove();weightLines.delete(key);}
    for (const [key,marker] of pinMarkers) if (!retainedPins.has(key)) {marker.remove();pinMarkers.delete(key);}
    $('sculptTargetCount').textContent = `${count} 根枝条`;
    feedback.hidden = false;
    feedback.style.left = `${canvas.offsetLeft + Math.max(8, Math.min(proj.bounds.width-285,point[0]+20))}px`;
    feedback.style.top = `${canvas.offsetTop + Math.max(8, Math.min(proj.bounds.height-72,point[1]+24))}px`;
    const names = {GRAB:'拉动',COMB:'保长梳理',SMOOTH_BRUSH:'平滑',PROTECT:'保护蒙版',RETRACT:'沿枝回缩'};
    feedback.querySelector('strong').textContent = `${options.smoothing ? '临时平滑 · 松开 Shift 恢复' : names[getTool()] || '枝干雕刻'} · ${count ? `${count} 根受影响` : '未命中可编辑枝干'}`;
    feedback.querySelector('span').textContent = `${options.scope === 'SURFACE' ? `表层 · 深度 ${options.depthRange} m` : options.scope === 'THROUGH' ? '穿透 · 前后枝干' : '空间球 · 三维范围'} · 半径 ${options.radius} px · 强度 ${Math.round(options.strength*100)}%`;
  }
  function hoverAt(event) {
    if (stroke || brush.adjusting || !SCULPT_TOOLS.has(getTool()) || !getAsset() || getAsset().group.userData.pending_rebuild || !$('busyOverlay').hidden) return;
    const unit = getUnitBrush();
    if (unit) { overlay.setAttribute('hidden', ''); feedback.hidden = true; if (getTool() === 'COMB') unit.hoverAt(event); return; }
    const snapshot = preparedHover();
    const proj = projection();
    const point = pointerPosition(event, proj.bounds);
    const options = settings(snapshot);
    options.smoothing = shiftHeld && getTool() !== 'PROTECT';
    if (options.smoothing) Object.assign(options,brush.smoothSettings());
    const center = centerAt(snapshot, proj, point, options.radius, options.selectedIds);
    if (center) Object.assign(options, center);
    const weights = center ? regionWeights(snapshot, proj.project, point, { ...options, ignoreMask: getTool() === 'PROTECT' }) : new Map();
    showWeights(snapshot, weights, point, options, proj);
  }
  function axisFor(options, proj) {
    if (options.direction !== 'VIEW') return new THREE.Vector3(options.direction === 'X' ? 1 : 0, options.direction === 'Y' ? 1 : 0, options.direction === 'Z' ? 1 : 0);
    return proj.unproject([0, 0], options.clip).sub(proj.unproject([0, 0], options.clip - 0.001)).normalize();
  }
  function compute(point, shift, invert, final = false) {
    const s = stroke;
    const computeStarted = performance.now();
    if (s.tool === 'RETRACT') invert = false;
    if (s.tool === 'PROTECT') shift = false;
    const continuous = ['COMB', 'SMOOTH_BRUSH', 'PROTECT'].includes(s.tool);
    if (Boolean(shift) !== Boolean(s.smoothing)) {
      s.smoothing = Boolean(shift);
      s.baseSnapshot = advanceSculptSnapshot(s.working,s.updated);
      s.working = s.baseSnapshot;
      s.start = s.last.slice(); s.lastSample = s.last.slice();
      s.options.center3d = s.proj.unproject(s.start, s.options.clip);
      s.weights = regionWeights(s.baseSnapshot, s.proj.project, s.start, s.options);
    }
    const applySample = (sample) => {
      const smooth = s.smoothing || (shift && s.tool !== 'PROTECT');
      const source = continuous || s.smoothing ? s.working : s.baseSnapshot;
      const options = { ...s.options, ...(smooth ? brush.smoothSettings() : {}), smoothing:smooth, center3d: s.proj.unproject(sample, s.options.clip), ignoreMask: s.tool === 'PROTECT' };
      const center = continuous || s.smoothing || s.tool === 'GUIDE' ? sample : s.start;
      const weights = continuous || s.smoothing || s.tool === 'GUIDE'
        ? regionWeights(source, s.proj.project, center, options) : s.weights;
      let delta = s.proj.unproject(sample, options.clip).sub(s.proj.unproject(continuous || s.smoothing ? s.lastSample : s.start, options.clip));
      if (s.options.direction !== 'VIEW') {
        const axis = axisFor(options, s.proj);
        const anchor = continuous || s.smoothing ? s.lastSample : s.start;
        delta = axis.multiplyScalar((anchor[1] - sample[1]) / options.radius * options.worldRadius);
      }
      if (s.tool === 'PROTECT') {
        source.forEach((branch) => {
          const values = weights.get(branch.id);
          if (!values?.some(w => w > 0)) return;
          branch.mask = branch.mask.map((value, i) => THREE.MathUtils.clamp(value + (invert ? -1 : 1) * (values?.[i] || 0) * options.strength * 0.2, 0, 1));
          s.masks.set(branch.stableId, branch.mask.slice());
        });
        s.updated = source;
      } else {
        if (s.tool === 'PUSH_PULL') delta = axisFor(options, s.proj).multiplyScalar((sample[1] - s.start[1]) / options.radius * options.worldRadius * (invert ? -1 : 1));
        options.retractAmount = Math.max(0, sample[1] - s.start[1]) / 200;
        options.signedDistance = (s.start[1] - sample[1]) / options.radius * (invert ? -1 : 1);
        options.axis = axisFor(options, s.proj);
        if (s.tool === 'GUIDE' && !smooth) {
          s.guide.push(s.proj.unproject(sample, options.clip));
          weights.forEach((values, id) => s.weights.set(id, values.map((value, i) => Math.max(value, s.weights.get(id)?.[i] || 0))));
          options.guide = s.guide;
          $('sculptGuide').setAttribute('points', s.guide.map((p) => { const projected = s.proj.project(p); return `${projected.x},${projected.y}`; }).join(' '));
        }
        s.updated = deformTree(source, s.tool === 'GUIDE' && !smooth ? s.weights : weights, delta, smooth ? 'SMOOTH_BRUSH' : s.tool, { ...options, center3d: ['SPREAD', 'TWIST_BRUSH'].includes(s.tool) ? s.options.center3d : options.center3d });
        if (continuous || s.smoothing) s.working = advanceSculptSnapshot(source,s.updated);
      }
      s.displayWeights = weights;
      s.lastSample = sample.slice();
    };
    if (continuous || s.smoothing || s.tool === 'GUIDE') {
      const spacing = 6;
      let distance = Math.hypot(point[0] - s.lastSample[0], point[1] - s.lastSample[1]);
      while (distance >= spacing) {
        const sample = [s.lastSample[0] + (point[0] - s.lastSample[0]) / distance * spacing, s.lastSample[1] + (point[1] - s.lastSample[1]) / distance * spacing];
        applySample(sample);
        distance = Math.hypot(point[0] - s.lastSample[0], point[1] - s.lastSample[1]);
      }
      if (final && distance > 0.01) applySample(point);
    } else applySample(point);
    s.last = point.slice();
    s.computeMs = performance.now() - computeStarted;
    if (!previewFrame) previewFrame = requestAnimationFrame(() => {
      previewFrame = 0;
      if (!stroke) return;
      const started = performance.now();
      s.preview?.update(symmetryPreview(s.updated, getAuthoring().symmetry_groups));
      showActiveBranches([...s.updated.values()], s.options.selectedIds);
      s.previewMs = performance.now() - started;
      showWeights(s.updated, s.displayWeights || s.weights, s.last, {...s.options,...(s.smoothing ? brush.smoothSettings() : {}),smoothing:s.smoothing}, s.proj);
    });
  }
  function releaseStroke(restore = true) {
    if (!stroke) return false;
    const s = stroke;
    stroke = null;
    cancelAnimationFrame(previewFrame); previewFrame = 0;
    if (restore) { s.preview?.restore(); showActiveBranches(); }
    if (canvas.hasPointerCapture?.(s.pointerId)) canvas.releasePointerCapture(s.pointerId);
    controls.enabled = true;
    hideFeedback();
    $('sculptGuide').setAttribute('points', '');
    if (restore) status('树势雕刻 · 已取消', 'ready');
    return true;
  }
  const cancel = () => {
    const released = releaseStroke(true), unit = cancelUnitBrush(), adjusted = brush.cancel();
    return Boolean(released || unit || adjusted);
  };
  const controller = {
    get active() { return Boolean(stroke) || brush.adjusting || Boolean(getUnitBrush()?.active); },
    get adjusting() {return brush.adjusting;},
    get debug() { return getUnitBrush()?.debug || (stroke ? { updated: stroke.updated, snapshot: stroke.snapshot, previewMs: stroke.previewMs, computeMs:stroke.computeMs, smoothing:stroke.smoothing } : null); },
    cancel,
    toolChanged(next) { cancel(); getUnitBrush()?.toolChanged(next); if (next) brush.switchTool(next); hoverSnapshot=null; hideFeedback(); $('sculptGuide').setAttribute('points', ''); },
    canSmoothBegin(event) {
      if (getUnitBrush()) return false;
      if (event.ctrlKey || !event.shiftKey || stroke || brush.adjusting || !SCULPT_TOOLS.has(getTool()) || getTool() === 'PROTECT'
        || isBlocked() || !getAsset() || getAsset().group.userData.pending_rebuild || !$('busyOverlay').hidden) return false;
      const snapshot = preparedHover(), proj = projection();
      return Boolean(centerAt(snapshot,proj,pointerPosition(event,proj.bounds),10,getEditTargets([...snapshot.values()])));
    },
    begin(event) {
      if (!SCULPT_TOOLS.has(getTool()) || event.button !== 0) return false;
      const unit = getUnitBrush();
      if (unit) return getTool() === 'COMB' ? unit.begin(event) : true;
      if (stroke) return true;
      const asset = getAsset();
      if (!asset || asset.group.userData.pending_rebuild || !$('busyOverlay').hidden) return true;
      if (!getEditTargets(asset.masterBranches).size) { status('请先选择可编辑枝条，或将作用范围切换为全树', 'ready'); return true; }
      const snapshot = preparedHover();
      const proj = projection();
      const point = pointerPosition(event, proj.bounds);
      const options = settings(snapshot);
      const center = centerAt(snapshot, proj, point, options.radius, options.selectedIds);
      if (!center) { status('树势雕刻 · 未命中枝条', 'ready'); return true; }
      Object.assign(options, center);
      options.rigidUnitFollowers = asset.isInstancedAssembly ? rigidSculptInstances(getAuthoring()) : new Set();
      for (const b of snapshot.values()) if (options.selectedIds.has(b.stableId)) options.rigidUnitFollowers.delete(b.instanceId);
      const weights = regionWeights(snapshot, proj.project, point, { ...options, ignoreMask: getTool() === 'PROTECT' });
      if (![...weights.values()].some((values) => values.some((w) => w > 0))) {
        status('树势雕刻 · 当前范围无可编辑枝条', 'ready'); return true;
      }
      stroke = { tool: getTool(), pointerId: event.pointerId, snapshot, baseSnapshot: snapshot, updated: snapshot, working: getTool()==='PROTECT'?createSculptSnapshot(asset.masterBranches,getAuthoring().overrides):snapshot,
        weights, options, proj, start: point, last: point, lastSample: point, masks: new Map(), guide: [options.center3d.clone()],
        preview: getTool() === 'PROTECT' ? null : createMeshPreview(asset, snapshot, {targets:options.selectedIds,rigidFollowers:true}) };
      stroke.smoothing = Boolean(event.shiftKey && getTool() !== 'PROTECT');
      controls.enabled = false;
      canvas.setPointerCapture(event.pointerId);
      showWeights(snapshot, weights, point, {...options,...(stroke.smoothing ? brush.smoothSettings() : {}),smoothing:stroke.smoothing}, proj);
      status(getTool() === 'COMB' ? '保长梳理 · 沿拖动方向弯曲，枝长与粗细保持，Esc 取消' : getTool() === 'RETRACT' ? '沿枝路回缩 · 向下拖动缩短，拖回起点恢复本笔，Esc 取消' : '树势雕刻 · 实时塑形', 'busy');
      return true;
    },
    move(event) {
      if (getUnitBrush()) {
        hover = { clientX:event.clientX, clientY:event.clientY };
        if (brush.adjusting) return true;
        if (getTool() === 'COMB') { if (getUnitBrush().active) return getUnitBrush().move(event); if (!hoverFrame) hoverFrame = requestAnimationFrame(() => {hoverFrame=0;hoverAt(hover);}); return true; }
        return false;
      }
      if (!stroke) {
        hover = { clientX: event.clientX, clientY: event.clientY };
        if (!hoverFrame) hoverFrame = requestAnimationFrame(() => { hoverFrame = 0; hoverAt(hover); });
        return SCULPT_TOOLS.has(getTool());
      }
      if (event.pointerId !== stroke.pointerId) return true;
      compute(pointerPosition(event, stroke.proj.bounds), event.shiftKey, event.altKey);
      return true;
    },
    end(event) {
      if (getUnitBrush()) return getTool() === 'COMB' ? getUnitBrush().end(event) : false;
      if (!stroke) return SCULPT_TOOLS.has(getTool()) && event.button === 0;
      if (event.pointerId !== stroke.pointerId || event.button !== 0) return true;
      compute(pointerPosition(event, stroke.proj.bounds), event.shiftKey, event.altKey, true);
      const completed = stroke;
      const updates = sculptOverrides(completed.snapshot, completed.updated, getAuthoring().overrides);
      const frames = completed.tool === 'PROTECT' ? new Map()
        : sculptInstanceFrames(getAsset(), completed.snapshot, completed.updated, updates, branchInstanceFrame);
      completed.preview?.update(symmetryPreview(completed.updated, getAuthoring().symmetry_groups));
      releaseStroke(false);
      if (completed.tool === 'PROTECT') {
        transact('已绘制枝条保护蒙版', (next) => completed.masks.forEach((mask, id) => { next.overrides[id] = { ...(next.overrides[id] || {}), sculpt_mask: mask }; }), { deferControls: true });
      } else if (Object.keys(updates).length || frames.size) {
        commitPreview(completed.preview, () => transact(`${completed.tool === 'COMB' ? '保长梳理' : '树势雕刻'}已调整 ${Object.keys(updates).length} 根枝条${frames.size ? `、${frames.size} 组单元枝` : ''}`, (next) => {
          Object.assign(next.overrides, updates);
          if(frames.size) getAuthoring().branch_instances.forEach((instance,index)=>{const frame=frames.get(instance.id);if(frame)next.branch_instances[index]=frame;});
          next.curve_editor.affect_children = true;
        }, { deferControls: true }));
        showActiveBranches([...completed.updated.values()], completed.options.selectedIds);
      } else { completed.preview?.restore(); showActiveBranches(); status('树势雕刻 · 未产生修改', 'ready'); }
      return true;
    },
    key(event) {
      if (event.key === 'Escape' && cancel()) return true;
      if (!SCULPT_TOOLS.has(getTool()) || event.target.matches?.('input, select, textarea, [contenteditable="true"]')) return false;
      if (['[', ']'].includes(event.key)) {
        if (stroke || getUnitBrush()?.active) return true;
        $('sculptRadius').value = THREE.MathUtils.clamp(Number($('sculptRadius').value) + (event.key === '[' ? -15 : 15), 20, 700);
        $('sculptRadius').dispatchEvent(new Event('input'));
        if (hover) hoverAt(hover);
        return true;
      }
      return false;
    },
  };
  canvas.addEventListener('pointerleave', () => { if (!stroke && !getUnitBrush()?.active) { cancelAnimationFrame(hoverFrame); hoverFrame = 0; hover = null; hideFeedback(); } });
  canvas.addEventListener('lostpointercapture', () => { if (stroke || getUnitBrush()?.active) cancel(); });
  window.addEventListener('blur', () => {shiftHeld=false;cancel();hideFeedback();});
  window.addEventListener('resize', () => { cancel(); hideFeedback(); });
  controls.addEventListener('change', () => { if (!stroke && !getUnitBrush()?.active) hideFeedback(); });
  for (const name of ['keydown','keyup']) window.addEventListener(name,event => {
    if (event.key !== 'Shift' || event.target?.isContentEditable || event.target?.matches?.('input,textarea,select') || document.querySelector('dialog[open]')) return;
    shiftHeld = name === 'keydown';
    if (stroke && stroke.tool !== 'PROTECT') compute(stroke.last,shiftHeld,false);
    else if (hover) hoverAt(hover);
  });
  document.querySelectorAll('#sculptPanel input, #sculptPanel select').forEach((input) => input.addEventListener('input', () => {
    if (!brush.adjusting) {releaseStroke(true);getUnitBrush()?.cancel();}
    const output = $(`${input.id}Value`);
    if (output) output.value = input.value;
    if (hover && !brush.restoring) hoverAt(hover);
  }));
  $('clearSculptMask').addEventListener('click', () => {
    cancel();
    if (getUnitBrush()) return status('单元枝按整支调整；内部保护蒙版在枝条工作台编辑', 'ready');
    const ids = getEditTargets(getAsset()?.masterBranches || []);
    if (!ids.size) return status('请先选择可编辑枝条', 'ready');
    transact('已清除范围内枝条保护蒙版', (next) => ids.forEach(id => { if (next.overrides[id]) next.overrides[id].sculpt_mask = []; }));
  });
  return controller;
}
