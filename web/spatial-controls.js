import * as THREE from 'three';
import { TransformControls } from './vendor/TransformControls.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function createSpatialControls({ canvas, camera, controls, modelRoot, getAuthoring, getAsset, setTool, transact, begin, preview, commit, cancel, isEditing }) {
  const root = new THREE.Group(); root.name = '空间生长控制'; modelRoot.add(root);
  const proxy = new THREE.Object3D(); modelRoot.add(proxy);
  const gizmo = new TransformControls(camera); gizmo.setSize(0.8); gizmo.setSpace('world');
  const helper = gizmo.getHelper(); modelRoot.add(helper);
  const material = new THREE.LineBasicMaterial({ color: 0x5ac8c2, transparent: true, opacity: 0.8, depthTest: false });
  let target = '', mode = 'translate', drag = null, pointerId = null;
  const panel = document.createElement('section'); panel.id = 'spatialControlsPanel'; panel.className = 'parameter-section generator-workspace';
  panel.innerHTML = `<h2>空间生长控制</h2><div class="spatial-segments"><button data-spatial="envelope">包络</button><button data-spatial="attractor">吸引</button><button data-spatial="repeller">排斥</button></div>
    <div class="generator-toolbar"><button id="spatialMove" title="移动空间控制" aria-label="移动空间控制"><i data-lucide="move-3d"></i></button><button id="spatialScale" title="缩放作用范围" aria-label="缩放作用范围"><i data-lucide="scaling"></i></button><button id="spatialClose" title="退出空间控制" aria-label="退出空间控制"><i data-lucide="x"></i></button><span id="spatialTargetLabel">未选中空间控制</span></div>
    <label class="generator-field">包络形状<select id="spatialEnvelopeType"><option value="NONE">关闭</option><option value="SPHERE">椭球冠</option><option value="CONE">锥形冠</option><option value="FAN">扇形</option><option value="FLAT">平面化</option></select></label>
    <div id="spatialFields"></div>`;
  document.querySelector('[data-page="structure"]').prepend(panel);
  function readPosition(a) { const r = a[target]; return target === 'envelope' ? r.center : [r.x, r.y, r.z]; }
  function clear() { root.children.forEach((c) => c.geometry.dispose()); root.clear(); }
  function line(points) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material); l.renderOrder = 8; root.add(l); }
  function draw() {
    clear(); if (!target) return;
    const r = getAuthoring()[target], center = new THREE.Vector3(...readPosition(getAuthoring()));
    if (target === 'envelope') {
      const radius = (t) => r.radius * (r.type === 'SPHERE' ? Math.max(0.12, Math.sin(Math.PI * t)) : r.type === 'CONE' ? Math.max(0.08, 1 - t) : 1);
      const point = (t, angle) => new THREE.Vector3(radius(t) * Math.cos(angle), radius(t) * Math.sin(angle) * (['FAN', 'FLAT'].includes(r.type) ? r.flatness : 1), r.height * t).add(center);
      for (let j = 0; j <= 6; j++) line(Array.from({ length: 65 }, (_, i) => point(j / 6, i / 64 * Math.PI * 2)));
      for (let j = 0; j < 8; j++) line(Array.from({ length: 33 }, (_, i) => point(i / 32, j / 8 * Math.PI * 2)));
    } else {
      const radius = target === 'repeller' ? r.radius : 0.09;
      for (let axis = 0; axis < 3; axis++) line(Array.from({ length: 65 }, (_, i) => { const p = [0, 0, 0]; p[(axis + 1) % 3] = Math.cos(i / 64 * Math.PI * 2) * radius; p[(axis + 2) % 3] = Math.sin(i / 64 * Math.PI * 2) * radius; return new THREE.Vector3(...p).add(center); }));
    }
  }
  function fields() {
    const area = $('spatialFields'); area.replaceChildren(); if (!target) return;
    const r = getAuthoring()[target];
    if (target !== 'envelope') {
      const label = document.createElement('label'); label.className = 'generator-toolbar'; label.innerHTML = '<input type="checkbox">启用'; label.firstElementChild.checked = r.enabled;
      label.firstElementChild.onchange = (e) => transact('已切换空间作用', (a) => { a[target].enabled = e.target.checked; }); area.append(label);
    }
    const values = readPosition(getAuthoring());
    const definitions = [['x', '位置 X (m)', values[0], -20, 20, 0.05], ['y', '位置 Y (m)', values[1], -20, 20, 0.05], ['z', '位置 Z (m)', values[2], -20, 20, 0.05], ['strength', '作用强度', r.strength, 0, 1, 0.01]];
    if (target === 'envelope') definitions.push(['radius', '包络半径 (m)', r.radius, 0.1, 20, 0.05], ['height', '包络高度 (m)', r.height, 0.1, 20, 0.05], ['flatness', '平面宽度比例', r.flatness, 0.02, 1, 0.01]);
    if (target === 'repeller') definitions.push(['radius', '作用半径 (m)', r.radius, 0.05, 20, 0.05]);
    definitions.forEach(([key, name, value, min, max, step]) => {
      const label = document.createElement('label'); label.className = 'generator-field';
      label.innerHTML = `<span>${name}</span><input data-spatial-field="${key}" aria-label="${name}" type="number" min="${min}" max="${max}" step="${step}"><input data-spatial-range="${key}" aria-label="${name}滑条" type="range" min="${min}" max="${max}" step="${step}">`;
      const change = (a, value) => { if (target === 'envelope' && ['x', 'y', 'z'].includes(key)) a.envelope.center[['x', 'y', 'z'].indexOf(key)] = value; else a[target][key] = value; };
      label.querySelectorAll('input').forEach((input) => {
        input.value = value;
        input.oninput = () => { if (input.type === 'range') { preview((a) => change(a, Number(input.value))); label.querySelector('input[type=number]').value = input.value; draw(); } };
        input.onchange = () => { if (!input.validity.valid || input.value === '') return; if (input.type === 'range') commit(); else transact('已调整空间控制参数', (a) => change(a, Number(input.value))); refresh(); };
        input.onkeydown = (e) => { if (e.key === 'Escape') { cancel(); refresh(); } };
        input.onpointercancel = () => { cancel(); refresh(); };
      }); area.append(label);
    });
  }
  function refresh() {
    draw(); if (drag || isEditing()) return;
    $('spatialEnvelopeType').value = getAuthoring().envelope.type;
    $('spatialTargetLabel').textContent = { envelope: '包络范围', attractor: '生长吸引点', repeller: '排斥球' }[target] || '未选中空间控制';
    panel.querySelectorAll('[data-spatial]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.spatial === target)));
    $('spatialMove').disabled = !target; $('spatialScale').disabled = !target || target === 'attractor'; $('spatialClose').disabled = !target;
    $('spatialMove').classList.toggle('active', mode === 'translate'); $('spatialScale').classList.toggle('active', mode === 'scale');
    if (target) { proxy.position.fromArray(readPosition(getAuthoring())); proxy.scale.set(1, 1, 1); gizmo.setMode(mode); gizmo.attach(proxy); } else gizmo.detach();
    fields();
  }
  function release() { controls.enabled = true; const id = pointerId; pointerId = null; if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); }
  function cancelDrag() { if (!drag) return false; drag = null; gizmo.dragging = false; gizmo.axis = null; cancel(); release(); refresh(); return true; }
  function deactivate() { cancelDrag(); target = ''; gizmo.detach(); clear(); refresh(); }
  panel.querySelectorAll('[data-spatial]').forEach((b) => b.onclick = () => {
    const value = b.dataset.spatial; setTool('SELECT'); target = value; mode = 'translate';
    modelRoot.rotation.set(0, 0, 0);
    transact('已启用空间生长控制', (a) => { if (target === 'envelope') { if (a.envelope.type === 'NONE') a.envelope.type = 'SPHERE'; } else a[target].enabled = true; }); refresh();
  });
  $('spatialEnvelopeType').onchange = (e) => transact('已调整包络形状', (a) => { a.envelope.type = e.target.value; });
  $('spatialMove').onclick = () => { mode = 'translate'; refresh(); };
  $('spatialScale').onclick = () => { mode = 'scale'; refresh(); };
  $('spatialClose').onclick = deactivate;
  const pointer = (e, button = e.button) => { const rect = canvas.getBoundingClientRect(); return { x: (e.clientX - rect.left) / rect.width * 2 - 1, y: -(e.clientY - rect.top) / rect.height * 2 + 1, button }; };
  gizmo.addEventListener('mouseDown', () => { if (getAsset()?.group.userData.pending_rebuild) { gizmo.dragging = false; return; } begin(); drag = structuredClone(getAuthoring()[target]); controls.enabled = false; });
  gizmo.addEventListener('objectChange', () => {
    if (!drag) return;
    preview((a) => {
      const r = a[target];
      if (mode === 'translate') { const p = proxy.position.toArray().map((v) => clamp(v, -20, 20)); if (target === 'envelope') r.center = p; else [r.x, r.y, r.z] = p; }
      else if (target === 'envelope') {
        r.radius = clamp(drag.radius * Math.abs(proxy.scale.x), 0.1, 20);
        r.height = clamp(drag.height * Math.abs(proxy.scale.z), 0.1, 20);
        if (['FAN', 'FLAT'].includes(r.type)) r.flatness = clamp(drag.flatness * Math.abs(proxy.scale.y) / Math.max(0.01, Math.abs(proxy.scale.x)), 0.02, 1);
        else r.radius = clamp(drag.radius * Math.abs(gizmo.axis === 'Y' ? proxy.scale.y : proxy.scale.x), 0.1, 20);
      } else {
        const axis = ['X', 'Y', 'Z'].includes(gizmo.axis) ? gizmo.axis.toLowerCase() : 'x';
        r.radius = clamp(drag.radius * Math.abs(proxy.scale[axis]), 0.05, 20);
      }
    }); draw();
  });
  gizmo.addEventListener('mouseUp', () => { if (!drag) return; drag = null; gizmo.dragging = false; gizmo.axis = null; commit(); release(); refresh(); });
  canvas.addEventListener('lostpointercapture', () => cancelDrag()); window.addEventListener('blur', cancelDrag);
  refresh();
  return {
    refresh, deactivate, cancel: cancelDrag, get active() { return Boolean(target); }, get dragging() { return Boolean(drag); }, gizmo, proxy, root,
    begin(e) { if (!target || e.button !== 0) return false; helper.updateMatrixWorld(true); gizmo.pointerHover(pointer(e)); gizmo.pointerDown(pointer(e)); if (drag) { pointerId = e.pointerId; canvas.setPointerCapture(e.pointerId); } return true; },
    move(e) { if (!target) return false; if (drag) gizmo.pointerMove(pointer(e, -1)); else gizmo.pointerHover(pointer(e)); return true; },
    end(e) { if (!target || e.button !== 0) return false; gizmo.pointerUp(pointer(e)); release(); return true; },
  };
}
