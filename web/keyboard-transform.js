import * as THREE from 'three';

// A modal gesture computes every preview from its initial state, never cumulatively.
export function keyboardTransformDelta({ mode, axis = '', numeric = '', start, pointer, center, camera, modelRoot, bounds, uniform = false, scaleRange = [.01, 100] }) {
  const origin = modelRoot.localToWorld(center.clone()), projected = origin.clone().project(camera);
  const worldAt = (x, y) => new THREE.Vector3((x - bounds.left) / bounds.width * 2 - 1, 1 - (y - bounds.top) / bounds.height * 2, projected.z).unproject(camera);
  const right = worldAt(bounds.left + bounds.width / 2 + 1, bounds.top + bounds.height / 2).sub(worldAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2));
  const up = worldAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2 - 1).sub(worldAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2));
  const dx = pointer.x - start.x, dy = pointer.y - start.y;
  const translation = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(1, 1, 1);
  const value = numeric.trim() && Number.isFinite(Number(numeric)) ? Number(numeric) : null;
  const direction = axis ? new THREE.Vector3(...({ X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[axis])) : camera.getWorldDirection(new THREE.Vector3()).negate();
  let amount = 0;
  if (mode === 'translate') {
    const displacement = right.clone().multiplyScalar(dx).addScaledVector(up, -dy);
    if (axis) {
      const unit = direction.clone().add(origin).project(camera);
      const sx = (unit.x - projected.x) * bounds.width / 2, sy = -(unit.y - projected.y) * bounds.height / 2;
      amount = value ?? (sx * sx + sy * sy > 4 ? (dx * sx + dy * sy) / (sx * sx + sy * sy) : -dy * up.length());
      displacement.copy(direction).multiplyScalar(amount);
    } else if (value !== null) { displacement.copy(right).normalize().multiplyScalar(value); amount = value; }
    else amount = displacement.length();
    translation.copy(modelRoot.worldToLocal(origin.clone().add(displacement))).sub(center);
  } else if (mode === 'rotate') {
    const cx = bounds.left + (projected.x + 1) * bounds.width / 2, cy = bounds.top + (1 - projected.y) * bounds.height / 2;
    const a = new THREE.Vector2(start.x - cx, start.y - cy), b = new THREE.Vector2(pointer.x - cx, pointer.y - cy);
    amount = value ?? (a.length() > 25 && b.length() > 5 ? THREE.MathUtils.radToDeg(Math.atan2(a.y * b.x - a.x * b.y, a.dot(b))) : (dx - dy) * .5);
    const localAxis = direction.transformDirection(modelRoot.matrixWorld.clone().invert());
    rotation.setFromAxisAngle(localAxis, THREE.MathUtils.degToRad(amount));
  } else {
    amount = THREE.MathUtils.clamp(value ?? Math.exp((dx - dy) / 180), ...scaleRange);
    if (axis && !uniform) scale[axis.toLowerCase()] = amount; else scale.setScalar(amount);
  }
  return { translation, rotation, scale, amount };
}

export function bindKeyboardTransform({ canvas, camera, modelRoot, controls, start }) {
  let active = null, last = null, swallow = null, blockContext = false, frame = 0;
  const hud = document.createElement('div');
  hud.id = 'keyboardTransformHint'; hud.hidden = true;
  hud.style.cssText = 'position:fixed;z-index:80;pointer-events:none;background:#14231eed;border:1px solid #d7bd62;color:#f4e4a9;padding:10px 14px;border-radius:6px;max-width:650px;white-space:pre-line;font-size:13px';
  document.body.append(hud);
  const consume = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  function render() {
    if (!active) return;
    if (!active.adapter.valid()) { finish(false); return; }
    modelRoot.updateWorldMatrix(true, false); camera.updateMatrixWorld();
    const bounds = canvas.getBoundingClientRect();
    const delta = keyboardTransformDelta({ ...active, center: active.adapter.center, camera, modelRoot, bounds, uniform: active.adapter.uniform, scaleRange: active.adapter.scaleRange });
    const result=active.adapter.update(delta,{start:active.start,pointer:active.pointer,numeric:active.numeric});
    if(result?.amount!==undefined)delta.amount=result.amount;
    const label = { translate: 'G 移动', rotate: 'R 旋转', scale: 'S 缩放', radius: 'Alt+S 粗细' }[active.mode];
    const axis = active.adapter.axisLabel || (active.adapter.alongBranch ? '吸附枝干 '+(result?.carrier||'') : active.mode === 'scale' && active.adapter.uniform ? '等比' : active.axis || (active.mode === 'translate' ? '视图平面' : active.mode === 'rotate' ? '视图轴' : '等比'));
    hud.textContent = `${label} · ${active.adapter.label} · ${axis} · ${active.mode==='scale'||active.adapter.alongBranch?delta.amount.toFixed(3):active.numeric || delta.amount.toFixed(3)}${active.mode === 'translate' ? ' m' : active.mode === 'rotate' ? '°' : ' 倍'}\n移动鼠标或输入数值 · ${active.adapter.hint || (active.adapter.alongBranch?'拖到目标枝干切换挂接 / 数值沿原枝':'X/Y/Z 约束轴')} · 左键/Enter 确认 · 右键/Esc 取消${active.mode==='scale' && active.adapter.uniform ? '\n叶花果保持单元比例，S 只做等比缩放。' : ''}`;
    hud.style.left = bounds.left + 24 + 'px'; hud.style.top = bounds.bottom - 112 + 'px'; hud.hidden = false;
  }
  function finish(commit) {
    if (!active) return false;
    cancelAnimationFrame(frame);frame=0;
    if(commit&&active.numeric&&(!Number.isFinite(Number(active.numeric))||(['scale','radius'].includes(active.mode)&&Number(active.numeric)<=0))){hud.textContent+='\n请输入有效数值（缩放须大于 0），或 Esc 取消';return true;}
    if(commit)render();if(!active)return true;
    const a = active; active = null; hud.hidden = true; delete canvas.dataset.keyboardTransform;
    controls.enabled = a.controlsEnabled;
    if (commit && a.adapter.valid()) a.adapter.commit(); else a.adapter.cancel();
    return true;
  }
  function begin(mode,{axis=''}={}) {
    if(active||document.querySelector('dialog[open]'))return false;
    const adapter=start(mode);if(!adapter)return false;
    const r=canvas.getBoundingClientRect(),initial=last||{x:r.left+r.width/2,y:r.top+r.height/2};
    active={adapter,mode:mode==='duplicate'?'translate':mode,axis,numeric:'',start:initial,pointer:initial,controlsEnabled:controls.enabled};
    controls.enabled=false;canvas.dataset.keyboardTransform=mode;render();return true;
  }
  document.addEventListener('duplicate-selection',()=>begin('duplicate'));
  window.addEventListener('keydown', e => {
    const typing = e.isComposing || e.target?.isContentEditable || e.target?.matches?.('input,textarea,select');
    if (active) {
      if (typing || document.querySelector('dialog[open]')) { finish(false); return; }
      if (['Control','Meta','Alt','Shift'].includes(e.key)) {consume(e);return;}
      if (e.ctrlKey || e.metaKey || e.altKey && active.mode!=='radius') { finish(false); if (e.key.toLowerCase() === 'z') consume(e); return; }
      consume(e);
      if (e.key === 'Escape') return void finish(false);
      if (e.key === 'Enter') return void finish(true);
      const key = e.key.toUpperCase();
      if (['X', 'Y', 'Z'].includes(key)) {if(!active.adapter.alongBranch&&!active.adapter.lockAxes)active.axis = active.axis === key ? '' : key;}
      else if (/^[0-9.\-+]$/.test(e.key)) {const next=active.numeric+e.key;if(/^[+-]?(?:[0-9]*\.?[0-9]*)$/.test(next))active.numeric=next;}
      else if (e.key === 'Backspace') active.numeric = active.numeric.slice(0, -1);
      else return;
      render(); return;
    }
    if(!typing && e.shiftKey && e.key.toLowerCase()==='d' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat){if(begin('duplicate'))consume(e);return;}
    if (typing || e.ctrlKey || e.metaKey || e.altKey && e.key.toLowerCase()!=='s' || e.shiftKey || e.repeat || document.querySelector('dialog[open]')) return;
    const mode = e.altKey ? 'radius' : { g: 'translate', r: 'rotate', s: 'scale' }[e.key.toLowerCase()]; if (!mode) return;
    if(begin(mode))consume(e);
  }, true);
  window.addEventListener('pointermove', e => {
    if (e.target === canvas || active) last = { x: e.clientX, y: e.clientY };
    if (!active) return;
    consume(e); active.pointer = { x: e.clientX, y: e.clientY }; if(!frame)frame=requestAnimationFrame(()=>{frame=0;render();});
  }, true);
  window.addEventListener('pointerdown', e => {
    if(e.target===canvas)last={x:e.clientX,y:e.clientY};
    if (!active) return;
    if (e.target !== canvas) { finish(false); return; }
    consume(e); swallow = e.pointerId;
    if (e.button === 2) { blockContext = true; finish(false); }
    else if (e.button === 0) finish(true);
  }, true);
  window.addEventListener('pointerup', e => { if (swallow === e.pointerId) { swallow = null; consume(e); } }, true);
  canvas.addEventListener('contextmenu', e => { if (blockContext || active) { consume(e); blockContext = false; finish(false); } }, true);
  canvas.addEventListener('wheel', e => { if (active) consume(e); }, { capture: true, passive: false });
  window.addEventListener('blur', () => finish(false));
  window.addEventListener('resize', () => finish(false));
  return { begin, cancel: () => finish(false), get active() { return Boolean(active); } };
}
