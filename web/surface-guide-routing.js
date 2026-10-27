import * as THREE from './vendor/three.module.min.js';
const V = p => new THREE.Vector3(...p);

// Slide portals along their original shared edges. Every segment remains in its
// original triangle, including on folded walls; never smooth through the model.
export function relaxGuideRoute(nav, path) {
  const points = path.map(p => ({ ...p, point: [...p.point] }));
  for (let pass = 0; pass < 24; pass++) {
    let moved = 0;
    for (let j = 1; j < points.length - 1; j++) {
      const i = pass % 2 ? points.length - 1 - j : j, p = points[i];
      if (p.nextFace === undefined) continue;
      const face = nav.faces[p.face], edge = face.neighbors.indexOf(p.nextFace);
      if (edge < 0) continue;
      const a = nav.vertices[face.ids[edge]], b = nav.vertices[face.ids[(edge + 1) % 3]];
      const previous = V(points[i - 1].point), next = V(points[i + 1].point);
      const cost = t => { const q = a.clone().lerp(b, t); return q.distanceTo(previous) + q.distanceTo(next); };
      let lo = 0, hi = 1;
      for (let k = 0; k < 24; k++) { const u = lo + (hi - lo) / 3, v = hi - (hi - lo) / 3; if (cost(u) < cost(v)) hi = v; else lo = u; }
      const q = a.clone().lerp(b, (lo + hi) / 2);
      moved += q.distanceTo(V(p.point)); p.point = q.toArray();
    }
    if (moved < 1e-5) break;
  }
  return points;
}

export function guideRouteLength(path) {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += V(path[i].point).distanceTo(V(path[i - 1].point));
  return length;
}

// A mouse hit on a different side of an overhang must not produce a long tour
// around the model. The user can rotate the view and continue from the endpoint.
export function isLocalGuideRoute(path, first, last) {
  return path.length > 0 && guideRouteLength(path) <= V(first.point).distanceTo(V(last.point)) * 2 + .15;
}
