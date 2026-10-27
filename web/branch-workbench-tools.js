import * as THREE from 'three';
import { TransformControls } from './vendor/TransformControls.js';
import { curvePoints, profileValue } from './generator-data.js';
import { samplePoint, sampleTangent } from './branch-workbench-data.js';
import { resamplePolyline } from './v4-tools.js';
import { branchRadiusAt, sectionAt, normalizeSections } from './branch-shaping.js';

export function createWorkbenchTools(api) {
  const { canvas, camera, controls, modelRoot } = api;
  const root = new THREE.Group(); root.name = 'BranchWorkbenchHelpers'; modelRoot.add(root);
  const connector = new THREE.Object3D(); root.add(connector);
  const gizmo = new TransformControls(camera, canvas); gizmo.setSize(0.65); gizmo.enabled = false; root.add(gizmo.getHelper());
  const ring = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x76cce0, depthTest: false })); ring.renderOrder = 100; root.add(ring);
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.017, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffce65, depthTest: false })); handle.renderOrder = 101; root.add(handle);
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.3, 0xe8ba61); root.add(arrow);
  const sectionRings = new THREE.Group(); root.add(sectionRings);
  const stroke = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x79d5db, depthTest: false })); root.add(stroke);
  const reference = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })); root.add(reference);
  const ray = new THREE.Raycaster(); let tool = ''; let drag = null; let sectionT = 0.45; let planeName = 'XZ'; let imageKey = ''; let textureToken = 0;
  const getBranch = () => {
    const branches = api.getAsset()?.masterBranches || [], id = api.getSelection();
    // A selected unit is an explicit target. Never redirect an internal tool
    // to an unrelated skeleton branch when that target is protected.
    if (id) return branches.find(b => b.stableId === id && api.isEditable?.(id) !== false) || null;
    return branches.find(b => api.isEditable?.(b.stableId) !== false) || null;
  };
  const normal = () => new THREE.Vector3(...({ XZ: [0, -1, 0], XY: [0, 0, 1], YZ: [1, 0, 0] }[planeName]));
  function cast(event) { const rect = canvas.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera); }
  function point(event, plane) { cast(event); return ray.ray.intersectPlane(plane, new THREE.Vector3()); }
  function nominal(branch) { return branchRadiusAt(branch, api.getAsset().settings, sectionT, false) / Math.max(0.0001, profileValue(branch.radiusProfile, sectionT)); }
  function setSectionValue(key, value) {
    const branch = getBranch(); if (!branch) return;
    const sections = branch.sections?.length ? branch.sections.map((p) => ({ ...p })) : [0, 0.5, 1].map((t) => ({ t, radius: 1, oval: 1, roll: 0 }));
    let p = sections.find((p) => Math.abs(p.t - sectionT) < 0.006);
    if (!p) { if (sections.length >= 24) return; p = { ...sectionAt(sections, sectionT), t: sectionT }; sections.push(p); }
    p[key] = value;
    api.preview((a) => { a.overrides[branch.stableId] ||= {}; a.overrides[branch.stableId].sections = normalizeSections(sections); });
    refresh();
  }
  function setRadius(diameter) {
    const branch = getBranch(); if (!branch) return;
    if (branch.sections?.length) { setSectionValue('radius', diameter / 200 / Math.max(0.0001, branchRadiusAt(branch, api.getAsset().settings, sectionT, false))); return; }
    const points = curvePoints(branch.radiusProfile); const t = sectionT;
    const nearest = points.findIndex((p) => Math.abs(p[0] - t) < 0.015);
    const knot = [t, Math.max(0.03, Math.min(3, diameter / 200 / Math.max(0.0001, nominal(branch))))];
    if (nearest >= 0) points[nearest] = knot; else points.push(knot);
    points.sort((a, b) => a[0] - b[0]);
    api.preview((a) => { a.overrides[branch.stableId] ||= {}; a.overrides[branch.stableId].radius_profile = { points, interpolation: 'SMOOTH' }; });
  }
  function refresh() {
    if (drag && api.isEditable?.(drag.branch) === false) cancel();
    if (tool && !getBranch()) { tool = ''; gizmo.detach(); gizmo.enabled = false; api.onTool(''); }
    const enabled = (api.isBranch() || tool === 'SECTION') && Boolean(getBranch()); root.visible = enabled;
    ring.visible = handle.visible = enabled && tool === 'SECTION'; stroke.visible = Boolean(drag?.points);
    const shape = api.getAuthoring().branch_shape;
    arrow.visible = api.isBranch() && Boolean(shape);
    sectionRings.visible = enabled && tool === 'SECTION';
    if (shape) {
      arrow.position.fromArray(shape.connector.position); arrow.setDirection(new THREE.Vector3(...shape.connector.direction));
      if (!gizmo.dragging) { connector.position.copy(arrow.position); connector.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(...shape.connector.direction)); }
    }
    if (enabled && tool === 'SECTION') {
      const branch = getBranch(); if (branch) {
        const center = samplePoint(branch.points, sectionT); const tangent = sampleTangent(branch.points, sectionT);
        const radius = branchRadiusAt(branch, api.getAsset().settings, sectionT);
        const pts = ringPoints(branch, sectionT);
        ring.geometry.dispose(); ring.geometry = new THREE.BufferGeometry().setFromPoints(pts); handle.position.copy(pts[0]);
        api.onDiameter(radius * 200);
        sectionRings.children.forEach((o) => { o.geometry.dispose(); o.material.dispose(); }); sectionRings.clear();
        for (const section of branch.sections || []) {
          if (Math.abs(section.t - sectionT) < 0.006) continue;
          const points = ringPoints(branch, section.t);
          const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x578e9a, depthTest: false }));
          const marker = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 6), new THREE.MeshBasicMaterial({ color: 0x81bcc7, depthTest: false })); marker.position.copy(points[0]); marker.userData.sectionT = section.t; marker.renderOrder = 102;
          sectionRings.add(line, marker);
        }
      }
    }
    const metadata = api.getAuthoring().workbench;
    const ref = metadata?.references?.[planeName] || (metadata?.reference?.plane === planeName ? metadata.reference : null);
    reference.visible = enabled && Boolean(ref?.image) && ref.visible !== false;
    if ((ref?.image || '') !== imageKey) {
      imageKey = ref?.image || ''; const token = ++textureToken;
      reference.material.map?.dispose(); reference.material.map = null;
      if (imageKey) new THREE.TextureLoader().load(imageKey, (texture) => {
        if (token !== textureToken) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace; reference.material.map = texture; reference.material.needsUpdate = true; refresh();
      });
    }
    if (ref) {
      const n = new THREE.Vector3(...({ XZ: [0, -1, 0], XY: [0, 0, 1], YZ: [1, 0, 0] }[ref.plane] || [0, -1, 0]));
      reference.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      reference.position.set(ref.x || 0, ref.y || 0, ref.z || 0).addScaledVector(n, -0.08);
      reference.scale.set((ref.size || 2) * (ref.aspect || 1), ref.size || 2, 1); reference.material.opacity = ref.opacity ?? 0.45;
    }
  }
  function ringPoints(branch, t) {
    const center = samplePoint(branch.points, t); const tangent = sampleTangent(branch.points, t);
    const helper = Math.abs(tangent.z) > 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const x = new THREE.Vector3().crossVectors(helper, tangent).normalize(); const y = new THREE.Vector3().crossVectors(tangent, x).normalize();
    const section = sectionAt(branch.sections, t); const settings = api.getAsset().settings;
    const oval = section.oval * (settings.cross_section === 'OVAL' ? settings.oval_ratio : 1);
    const radius = branchRadiusAt(branch, settings, t);
    return Array.from({ length: 64 }, (_, i) => { const angle = i / 64 * Math.PI * 2; return x.clone().multiplyScalar(Math.cos(angle) * radius * oval).addScaledVector(y, Math.sin(angle) * radius / oval).applyAxisAngle(tangent, branch.phase + section.roll * Math.PI / 180).add(center); });
  }
  gizmo.addEventListener('mouseDown', () => { api.begin(); controls.enabled = false; });
  gizmo.addEventListener('objectChange', () => { if (!gizmo.dragging) return; api.preview((a) => { a.branch_shape.connector.position = connector.position.toArray(); a.branch_shape.connector.direction = new THREE.Vector3(1, 0, 0).applyQuaternion(connector.quaternion).toArray(); }); });
  gizmo.addEventListener('mouseUp', () => { controls.enabled = true; api.commit(); refresh(); });
  function activate(next) {
    if (next && !next.startsWith('CONNECT') && !getBranch()) return api.toast('单元枝样式请在枝条工作台编辑；整树中可用 G/R/S 调整整支');
    cancel(); tool = next; gizmo.detach(); gizmo.enabled = false;
    if (['CONNECT_MOVE', 'CONNECT_ROTATE'].includes(next) && api.isBranch()) { gizmo.setMode(next === 'CONNECT_MOVE' ? 'translate' : 'rotate'); gizmo.attach(connector); gizmo.enabled = true; }
    refresh(); api.onTool(tool);
  }
  function cancel() {
    if (!drag && !gizmo.dragging) return false;
    const pointerId = drag?.pointerId; drag = null;
    if (gizmo.dragging) { gizmo.reset(); gizmo.dragging = false; }
    controls.enabled = true; api.cancel(); if (pointerId != null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId); refresh(); return true;
  }
  function begin(event) {
    if ((!api.isBranch() && tool !== 'SECTION') || !tool || event.button !== 0) return false;
    if (tool.startsWith('CONNECT')) return true;
    const branch = getBranch(); if (!branch) return true;
    if (tool === 'SECTION') { cast(event); const hit = ray.intersectObjects(sectionRings.children).find((h) => h.object.userData.sectionT !== undefined); if (hit) { sectionT = hit.object.userData.sectionT; api.onSection?.(sectionT); refresh(); } }
    const center = samplePoint(branch.points, sectionT);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(tool === 'SECTION' ? camera.getWorldDirection(new THREE.Vector3()) : normal(), tool === 'SECTION' ? center : branch.points[0]);
    if (tool === 'SECTION') { cast(event); if (!ray.intersectObject(handle).length && !ray.intersectObject(ring).length) return true; }
    const p = point(event, plane); if (!p) return true;
    api.begin(); drag = { pointerId: event.pointerId, branch: branch.stableId, plane, center, baseline: structuredClone(api.getAuthoring()), branches: api.getAsset().masterBranches, points: tool === 'AXIS' ? [api.getAuthoring().curve_editor.lock_root ? branch.points[0].clone() : p] : null };
    if (tool === 'SECTION') {
      const rect = canvas.getBoundingClientRect(); const c = center.clone().project(camera); const h = handle.position.clone().project(camera);
      const axis = new THREE.Vector2((h.x - c.x) * rect.width / 2, -(h.y - c.y) * rect.height / 2);
      const pixels = axis.length(); drag.radius = branchRadiusAt(branch, api.getAsset().settings, sectionT);
      drag.units = pixels > 3 ? drag.radius / pixels : 2 * center.distanceTo(camera.position) * Math.tan(camera.fov * Math.PI / 360) / rect.height;
      drag.axis = pixels > 3 ? axis.normalize() : new THREE.Vector2(0, -1); drag.x = event.clientX; drag.y = event.clientY;
    }
    canvas.setPointerCapture(event.pointerId); controls.enabled = false; return true;
  }
  function move(event) {
    if (!drag) return tool.startsWith('CONNECT') && api.isBranch();
    if (api.isEditable?.(drag.branch) === false) { cancel(); return true; }
    const p = point(event, drag.plane); if (!p) return true;
    if (drag.points) {
      if (p.distanceTo(drag.points.at(-1)) > 0.012) drag.points.push(p);
      stroke.geometry.dispose(); stroke.geometry = new THREE.BufferGeometry().setFromPoints(drag.points); stroke.visible = true;
    } else setRadius(Math.max(0.0001, drag.radius + ((event.clientX - drag.x) * drag.axis.x + (event.clientY - drag.y) * drag.axis.y) * drag.units) * 200);
    return true;
  }
  function end(event) {
    if (!drag) return Boolean(tool) && (api.isBranch() || tool === 'SECTION');
    const current = drag; drag = null;
    if (current.points?.length > 2) {
      const knots = resamplePolyline(current.points.map((p) => p.toArray()), Math.min(24, Math.max(5, Math.round(current.points.length / 3))));
      api.previewCurve(current.branch, knots, current.baseline, current.branches);
    }
    controls.enabled = true; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    api.commit(); refresh(); return true;
  }
  return { root, handle, ring, sectionRings, connector, gizmo, reference, refresh, activate, begin, move, end, cancel, setRadius, setSectionValue, getBranch,
    get sectionT() { return sectionT; }, get tool() { return tool; },
    get active() { return Boolean(tool); }, get dragging() { return Boolean(drag) || gizmo.dragging; },
    setSection(t) { sectionT = Number(t); refresh(); }, setPlane(v) { planeName = v; refresh(); },
    view(plane) { planeName = plane; const center = new THREE.Box3().setFromObject(api.getAsset().group).getCenter(new THREE.Vector3()); const distance = Math.max(2, camera.position.distanceTo(controls.target)); controls.target.copy(center); camera.up.set(...(plane === 'XY' ? [0, 1, 0] : [0, 0, 1])); camera.position.copy(center).addScaledVector(normal(), distance); controls.update(); api.fit(); },
  };
}
