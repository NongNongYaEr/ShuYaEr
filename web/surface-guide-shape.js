import * as THREE from './vendor/three.module.min.js';

const V = p => new THREE.Vector3(...p);
export const NEW_GUIDE_BUNDLE = { count: 3, width: .45, follow: .8 };
export function normalizeGuideBundle(raw) {
  if (!raw) return null; // Old projects keep their exact single-vine geometry.
  const clamp = (v, fallback, lo, hi) => Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : fallback;
  return { count: Math.round(clamp(raw.count, 3, 1, 8)), width: clamp(raw.width, .45, 0, 3), follow: clamp(raw.follow, .8, 0, 1) };
}
export function guideColor(id) {
  let hash = 0; for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return ['#f5d970', '#7ed6b0', '#88bff6', '#efa5bd', '#bfaff5', '#edb781'][hash % 6];
}

// Reduce mouse samples, not the generated surface route. Keep the first/last point.
export function simplifyGuideAnchors(anchors, tolerance = .06, nav = null) {
  if (anchors.length < 3) return structuredClone(anchors);
  const keep = new Set([0, anchors.length - 1]);
  if (nav) for (let i = 1; i < anchors.length; i++) if (nav.faces[anchors[i - 1].face].normal.dot(nav.faces[anchors[i].face].normal) < .98) { keep.add(i - 1); keep.add(i); }
  const boundaries = [...keep].sort((a,b)=>a-b), stack = boundaries.slice(1).map((b,i)=>[boundaries[i],b]);
  while (stack.length) {
    const [a, b] = stack.pop(), line = new THREE.Line3(V(anchors[a].point), V(anchors[b].point));
    let best = tolerance * tolerance, index = -1;
    for (let i = a + 1; i < b; i++) {
      const p = V(anchors[i].point), distance = p.distanceToSquared(line.closestPointToPoint(p, true, new THREE.Vector3()));
      if (distance > best) { best = distance; index = i; }
    }
    if (index >= 0) { keep.add(index); stack.push([a, index], [index, b]); }
  }
  return [...keep].sort((a, b) => a - b).map(i => structuredClone(anchors[i]));
}

// Each strand gets its own stable identity. Offset via the surface walker so the
// strand cannot jump to the back of a wall or a disconnected piece of geometry.
export function expandGuideBundles(nav, guides, surface, walk, blocked) {
  const result = [];
  for (const guide of guides) {
    if (guide.enabled === false) continue;
    const bundle = normalizeGuideBundle(guide.bundle);
    if (!bundle || guide.type === 'EAVE') { result.push(guide); continue; }
    const offsets = bundle.count === 1 ? [0] : Array.from({ length: bundle.count }, (_, i) => (i / (bundle.count - 1) - .5) * bundle.width).sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
    for (let strand = 0; strand < offsets.length; strand++) {
      const offset = offsets[strand];
      const anchors = guide.anchors.map((a, i) => {
        const normal = nav.faces[a.face].normal;
        const tangent = guide.anchors.length > 1 ? V(guide.anchors[Math.min(i + 1, guide.anchors.length - 1)].point).sub(V(guide.anchors[Math.max(0, i - 1)].point)) : new THREE.Vector3(0, 0, guide.flow === 'DOWN' ? -1 : 1);
        const side = new THREE.Vector3().crossVectors(normal, tangent).normalize().multiplyScalar(Math.sign(offset));
        if (!offset || side.lengthSq() < .5) return a;
        const path = walk(nav, a, side, Math.abs(offset), blocked), end = path.at(-1);
        return end ? { face: end.nextFace ?? end.face, point: [...end.point] } : a;
      });
      result.push({ ...guide, id: strand ? `${guide.id}_T${strand + 1}` : guide.id, anchors,
        smoothRoute: true, wander: bundle.width * (1 - bundle.follow) * .35, bundle: null });
    }
  }
  return result;
}
