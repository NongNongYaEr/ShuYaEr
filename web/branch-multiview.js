import * as THREE from 'three';
import { copy } from './branch-workbench-data.js';

const planes = { XZ: { normal: [0, -1, 0], up: [0, 0, 1], label: '前视' }, XY: { normal: [0, 0, 1], up: [0, 1, 0], label: '俯视' }, YZ: { normal: [1, 0, 0], up: [0, 0, 1], label: '侧视' } };
export function createBranchMultiview(api) {
  const host = api.canvas.parentElement; const panes = []; let enabled = false, fittedAsset = null, editing = null;
  window.addEventListener('tree-duck-viewport-background',()=>{for(const pane of panes)pane.renderer.setClearColor(window.treeDuckAppearance.viewportBackground,1);});
  const referenceRoot = new THREE.Group(); api.scene.add(referenceRoot);
  const ui = document.createElement('div'); ui.className = 'multiview-switch';
  ui.innerHTML = `<button id="toggleBranchMultiview" title="四视图" aria-label="四视图"><i data-lucide="panels-top-left"></i></button><button id="fitBranchMultiview" title="适应所有视图" aria-label="适应所有视图"><i data-lucide="scan"></i></button>`;
  host.append(ui);
  for (const [key, plane] of Object.entries(planes)) {
    const div = document.createElement('div'); div.className = `orthographic-pane plane-${key}`; div.hidden = true;
    const label = document.createElement('span'); label.textContent = `${plane.label} · 正交`; label.className = 'orthographic-label'; div.append(label);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = api.renderer.toneMapping; renderer.toneMappingExposure = api.renderer.toneMappingExposure;
    renderer.setClearColor(window.treeDuckAppearance?.viewportBackground||'#0b100d', 1);
    renderer.domElement.dataset.orthoPlane = key; div.append(renderer.domElement); host.append(div);
    const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 2000); camera.up.fromArray(plane.up); camera.layers.enable(30);
    const reference = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })); reference.layers.set(30); reference.visible = false; referenceRoot.add(reference);
    const pane = { key, plane, div, renderer, camera, center: new THREE.Vector3(), span: 3, reference, image: '', token: 0 }; panes.push(pane);
    const canvas = renderer.domElement;
    const project = (p) => { const r = canvas.getBoundingClientRect(); const v = p.clone().project(camera); return new THREE.Vector2(r.left + (v.x + 1) * r.width / 2, r.top + (1 - v.y) * r.height / 2); };
    function world(e, origin) { const r = canvas.getBoundingClientRect(); const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera); return ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...plane.normal), origin), new THREE.Vector3()); }
    canvas.onpointerdown = (e) => {
      if (editing || api.isEditing() || api.busy()) return;
      if (e.button === 1) { e.preventDefault(); editing = { pane, type: 'PAN', pointer: e.pointerId, x: e.clientX, y: e.clientY, center: pane.center.clone() }; canvas.setPointerCapture(e.pointerId); return; }
      if (e.button !== 0) return;
      let branch = api.getAsset()?.masterBranches.find((b) => b.stableId === api.getSelection());
      if (branch && api.isEditable?.(branch.stableId) === false) branch = null;
      let pointIndex = branch?.controlPoints.findIndex((p) => project(p).distanceTo(new THREE.Vector2(e.clientX, e.clientY)) < 13) ?? -1;
      if (pointIndex < 0) {
        let closest = 12; let picked = null; const click = new THREE.Vector2(e.clientX, e.clientY);
        for (const b of (api.getAsset()?.branches || []).filter((b) => api.isEditable?.(b.stableId) !== false)) for (let i = 1; i < b.points.length; i++) { const a = project(b.points[i - 1]), c = project(b.points[i]); const d = c.clone().sub(a); const t = Math.max(0, Math.min(1, click.clone().sub(a).dot(d) / Math.max(0.0001, d.lengthSq()))); const distance = a.addScaledVector(d, t).distanceTo(click); if (distance < closest) { closest = distance; picked = b; } }
        if (picked) api.select(picked.stableId); return;
      }
      const authoring = api.getAuthoring(); if ((pointIndex === 0 && authoring.curve_editor.lock_root) || authoring.overrides[branch.stableId]?.pinned_points.includes(pointIndex)) return;
      const origin = branch.controlPoints[pointIndex].clone(); const pointer = world(e, origin); if (!pointer) return;
      api.begin(); editing = { pane, type: 'POINT', pointer: e.pointerId, branch: branch.stableId, pointIndex, points: branch.controlPoints.map((p) => p.toArray()), origin, start: pointer, baseline: copy(authoring), branches: api.getAsset().masterBranches };
      canvas.setPointerCapture(e.pointerId); e.preventDefault();
    };
    canvas.onpointermove = (e) => {
      if (editing?.pane !== pane) return;
      if (editing.type === 'PAN') { const ratio = pane.span / camera.zoom / canvas.clientHeight; const right = new THREE.Vector3().crossVectors(new THREE.Vector3(...plane.up), new THREE.Vector3(...plane.normal)); pane.center.copy(editing.center).addScaledVector(right, -(e.clientX - editing.x) * ratio).addScaledVector(camera.up, (e.clientY - editing.y) * ratio); updateCamera(pane); return; }
      if (api.isEditable?.(editing.branch) === false) { cancel(); return; }
      const p = world(e, editing.origin); if (!p) return; const knots = copy(editing.points); knots[editing.pointIndex] = editing.origin.clone().add(p.sub(editing.start)).toArray();
      api.previewCurve(editing.branch, knots, editing.baseline, editing.branches);
    };
    canvas.onpointerup = (e) => { if (editing?.pane !== pane) return; if (editing.type === 'POINT' && api.isEditable?.(editing.branch) === false) { cancel(); return; } const wasPoint = editing.type === 'POINT'; editing = null; if (wasPoint) api.commit(); if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); };
    canvas.onpointercancel = cancel; canvas.onlostpointercapture = () => { if (editing?.pane === pane) cancel(); };
    canvas.addEventListener('wheel', (e) => { if (editing) return; e.preventDefault(); camera.zoom = Math.max(0.1, Math.min(30, camera.zoom * Math.exp(-e.deltaY * 0.001))); updateCamera(pane); }, { passive: false });
    canvas.oncontextmenu = (e) => { e.preventDefault(); cancel(); };
  }
  function updateCamera(pane) { const w = Math.max(1, pane.renderer.domElement.clientWidth), h = Math.max(1, pane.renderer.domElement.clientHeight); pane.camera.left = -pane.span * w / h / 2; pane.camera.right = -pane.camera.left; pane.camera.top = pane.span / 2; pane.camera.bottom = -pane.camera.top; pane.camera.position.copy(pane.center).addScaledVector(new THREE.Vector3(...pane.plane.normal), 100); pane.camera.lookAt(pane.center); pane.camera.updateProjectionMatrix(); pane.camera.updateMatrixWorld(); }
  function fit() { const asset = api.getAsset(); if (!asset) return; const box = new THREE.Box3().setFromObject(asset.group); if (box.isEmpty()) return; const size = box.getSize(new THREE.Vector3()); for (const p of panes) { const aspect = Math.max(0.2, p.div.clientWidth / Math.max(1, p.div.clientHeight)); const width = p.key === 'YZ' ? size.y : size.x; const height = p.key === 'XY' ? size.y : size.z; p.span = Math.max(0.3, height, width / aspect) * 1.3; p.center.copy(box.getCenter(new THREE.Vector3())); p.camera.zoom = 1; updateCamera(p); } fittedAsset = asset; }
  function setEnabled(value) { cancel(); enabled = value; host.classList.toggle('multiview', enabled); panes.forEach((p) => { p.div.hidden = !enabled; }); ui.firstElementChild.classList.toggle('active', enabled); ui.firstElementChild.setAttribute('aria-pressed', String(enabled)); if (enabled && !fittedAsset) fit(); }
  ui.firstElementChild.onclick = () => setEnabled(!enabled); ui.lastElementChild.onclick = () => { api.fit(); fit(); };
  function cancel() { if (!editing) return false; const current = editing; editing = null; if (current.type === 'POINT') api.cancel(); else { current.pane.center.copy(current.center); updateCamera(current.pane); } const c = current.pane.renderer.domElement; if (c.hasPointerCapture(current.pointer)) c.releasePointerCapture(current.pointer); return true; }
  window.addEventListener('blur', cancel);
  function refreshReference(pane) {
    const workbench = api.getAuthoring().workbench; const ref = workbench?.references?.[pane.key] || (workbench?.reference?.plane === pane.key ? workbench.reference : null);
    const image = ref?.image || '';
    if (image !== pane.image) { pane.image = image; const token = ++pane.token; pane.reference.material.map?.dispose(); pane.reference.material.map = null; if (image.startsWith('data:image/')) new THREE.TextureLoader().load(image, (t) => { if (token !== pane.token) { t.dispose(); return; } t.colorSpace = THREE.SRGBColorSpace; pane.reference.material.map = t; pane.reference.material.needsUpdate = true; }); }
    pane.reference.userData.enabled = Boolean(ref?.image) && ref.visible !== false;
    if (ref) { pane.reference.position.set(ref.x || 0, ref.y || 0, ref.z || 0).addScaledVector(new THREE.Vector3(...pane.plane.normal), -0.08); pane.reference.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...pane.plane.normal)); pane.reference.scale.set((ref.size || 2) * (ref.aspect || 1), ref.size || 2, 1); pane.reference.material.opacity = ref.opacity ?? 0.45; }
  }
  return { panes, fit, cancel, get enabled() { return enabled; }, get dragging() { return Boolean(editing); },
    render() { if (!enabled || !api.getAsset()) return; if (!fittedAsset) fit(); for (const p of panes) { const canvas = p.renderer.domElement; const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight); if (canvas.width !== Math.round(w * p.renderer.getPixelRatio()) || canvas.height !== Math.round(h * p.renderer.getPixelRatio())) { p.renderer.setSize(w, h, false); updateCamera(p); } refreshReference(p); }
      const reference = api.reference(); const wasVisible = reference.visible; reference.visible = false;
      const fog = api.scene.fog; api.scene.fog = null;
      try { for (const p of panes) { panes.forEach((q) => { q.reference.visible = q === p && q.reference.userData.enabled; }); p.renderer.render(api.scene, p.camera); } }
      finally { panes.forEach((p) => { p.reference.visible = false; }); reference.visible = wasVisible; api.scene.fog = fog; }
    },
    serialize() { return { enabled, cameras: Object.fromEntries(panes.map((p) => [p.key, { center: p.center.toArray(), span: p.span, zoom: p.camera.zoom }])) }; },
    restore(state) { fittedAsset = null; setEnabled(Boolean(state?.enabled)); for (const p of panes) { const c = state?.cameras?.[p.key]; if (c?.center?.length === 3 && c.center.every(Number.isFinite)) { p.center.fromArray(c.center); p.span = Math.max(0.1, Math.min(100, Number(c.span) || 3)); p.camera.zoom = Math.max(0.1, Math.min(30, Number(c.zoom) || 1)); updateCamera(p); } } },
  };
}
