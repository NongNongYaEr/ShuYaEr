import { relaxGuideRoute } from './surface-guide-routing.js';
import * as THREE from 'three';
import { guideColor } from './surface-guide-shape.js';
import { surfaceNavigation, surfaceRoute, walkSurface } from './surface-growth-geometry.js';
import { surfaceBlocked } from './surface-paint.js';
const V = p => new THREE.Vector3(...p);

export function buildGuideControls({ controls, surface, selected, mode, anchorsFor, editing, pointIndex, api, selectedIds = [selected] }) {
  for (const object of [...controls.children]) { object.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); controls.remove(object); }
  if (!surface || !['EDIT','CONTINUE'].includes(mode)) return;
  const nav = surfaceNavigation(surface.mesh), blocked = surfaceBlocked(surface);
  const pixelSize = (point, pixels) => api.camera.position.distanceTo(point) * 2 * Math.tan(api.camera.fov * Math.PI / 360) / Math.max(1, api.canvas.clientHeight) * pixels;
  function marker(point, color, data, diamond = false) {
    const dot = new THREE.Mesh(diamond ? new THREE.OctahedronGeometry(1) : new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color, depthTest: false, fog: false }));
    dot.position.copy(point); dot.userData = data; dot.renderOrder = 36;
    dot.onBeforeRender = () => dot.scale.setScalar(pixelSize(dot.position, 7)); dot.onBeforeRender(); controls.add(dot);
  }
  for (const g of surface.guides) {
    if (!selectedIds.includes(g.id)) continue;
    const chosen = g.id === selected, anchors = editing?.id === g.id ? editing.anchors : anchorsFor(g);
    const samples = [];
    for (let i = 1; i < anchors.length; i++) { const raw = surfaceRoute(nav, anchors[i - 1], anchors[i], blocked), part = g.bundle ? relaxGuideRoute(nav, raw) : raw; if (!part.length) break; samples.push(...(samples.length ? part.slice(1) : part)); }
    const lifted = a => V(a.point).addScaledVector(nav.faces[a.face].normal, .018);
    const points = (samples.length ? samples : anchors).map(lifted);
    if (points.length > 1) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: chosen ? '#ffdb69' : guideColor(g.id), transparent: true, opacity: chosen ? 1 : g.enabled === false ? .2 : .45, depthTest: false, fog: false }));
      line.userData.guide = g.id; line.renderOrder = 33; controls.add(line);
      if (chosen) {
        const index = Math.max(1, Math.floor(points.length / 2)), delta = points[index].clone().sub(points[index - 1]);
        if (delta.lengthSq() > 1e-9) { const arrow = new THREE.ArrowHelper(delta.normalize(), points[index], pixelSize(points[index], 30), '#ffdb69'); arrow.traverse(o => { o.raycast = () => {}; if (o.material) { o.material.depthTest = false; o.material.fog = false; } o.renderOrder = 35; }); controls.add(arrow); }
      }
    }
    if (!chosen || selectedIds.length !== 1 || mode !== 'EDIT') continue;
    anchors.forEach((a, i) => marker(lifted(a), g.locked ? '#999999' : i === pointIndex ? '#f89375' : '#f5d970', { guide: g.id, point: i }));
    if (g.type === 'EAVE' || samples.length < 2) continue;
    const width = editing?.id === g.id && editing.width !== undefined ? editing.width : g.bundle?.width || 0;
    const edges = [], stride = Math.max(1, Math.ceil(samples.length / 60));
    for (let i = 0; i < samples.length; i += stride) {
      const a = samples[i], normal = nav.faces[a.face].normal, tangent = V(samples[Math.min(i + 1, samples.length - 1)].point).sub(V(samples[Math.max(0, i - 1)].point));
      const side = new THREE.Vector3().crossVectors(normal, tangent).normalize();
      if (side.lengthSq() < .5) continue;
      edges.push({ a, normal, side, points: [-1, 1].map(sign => { const path = walkSurface(nav, { face: a.nextFace ?? a.face, point: a.point }, side.clone().multiplyScalar(sign), width / 2, blocked); return lifted(path.at(-1) || a); }) });
    }
    const middle = edges[Math.floor(edges.length / 2)];
    if (middle && !g.locked) { const ruler = new THREE.Line(new THREE.BufferGeometry().setFromPoints(middle.points), new THREE.LineBasicMaterial({color:'#ffd84c',depthTest:false,fog:false}));ruler.renderOrder=34;ruler.raycast=()=>{};controls.add(ruler); }
    if (middle && !g.locked) marker(middle.points[1], '#ffd84c', {guide:g.id,width:true,center:middle.a.point,side:middle.side.toArray(),normal:middle.normal.toArray()}, true);
  }
}
