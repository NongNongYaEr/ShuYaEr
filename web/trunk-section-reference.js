import * as THREE from 'three';

// Navigation retains every authored identity, including coincident sections.
// A reference at a shared position uses the last key, like the direct sampler.
export function trunkSectionContext(sections, id) {
  const items = (Array.isArray(sections) ? sections : []).filter(s => s && Number.isFinite(s.t) && typeof s.id === 'string').slice().sort((a, b) => a.t - b.t);
  const index = items.findIndex(s => s.id === id), current = items[index];
  let root = null, tip = null;
  if (current) for (const item of items) {
    if (Math.abs(item.t - current.t) < 1e-10) continue;
    if (item.t < current.t) root = item;
    else if (!tip || Math.abs(item.t - tip.t) < 1e-10) tip = item;
  }
  return { items, index, previous: items[index - 1] || null, next: index < 0 ? items[0] || null : items[index + 1] || null,
    root, tip, coincident: current ? items.filter(s => Math.abs(s.t - current.t) < 1e-10).length : 0 };
}

// Flatten each ring in its own unrolled carrier frame. This removes bending
// foreshortening but preserves physical size, section roll and surface detail.
export function trunkSectionOutline(ring, points) {
  const vector = value => value?.isVector3 ? value.clone() : Array.isArray(value) && value.length >= 3 ? new THREE.Vector3(...value) : null;
  const center = vector(ring?.center), x = vector(ring?.x), y = vector(ring?.y);
  if (!center || !x || !y || ![center, x, y].every(v => v.toArray().every(Number.isFinite)) || x.lengthSq() < 1e-12) return null;
  x.normalize(); y.addScaledVector(x, -y.dot(x));
  if (y.lengthSq() < 1e-12 || !Array.isArray(points) || points.length < 3) return null;
  y.normalize();
  const outline = [];
  for (const point of points) {
    const value = vector(point);
    if (!value || !value.toArray().every(Number.isFinite)) return null;
    value.sub(center); outline.push({ x: value.dot(x), y: value.dot(y) });
  }
  return outline;
}

// Only two reference outlines are retained per live geometry. View changes and
// hover reuse them; a rebuilt or updated position buffer invalidates the entry.
export function createTrunkSectionReferenceCache() {
  const geometries = new WeakMap();
  return (geometry, references, ringAt, ringData) => {
    if (!geometry) return [];
    const position = geometry.getAttribute('position'), rings = geometry.userData.radiusRings;
    let cache = geometries.get(geometry);
    if (!cache || cache.position !== position || cache.version !== position?.version || cache.rings !== rings) {
      cache = { position, version: position?.version, rings, outlines: new Map() }; geometries.set(geometry, cache);
    }
    const wanted = references.filter(r => r.section).slice(0, 2), keep = new Set(wanted.map(r => r.section.t));
    for (const t of cache.outlines.keys()) if (!keep.has(t)) cache.outlines.delete(t);
    return wanted.flatMap(({ side, section }) => {
      if (!cache.outlines.has(section.t)) {
        const ring = ringAt(section.t, geometry);
        cache.outlines.set(section.t, ring ? trunkSectionOutline(ring, ringData(ring, geometry)) : null);
      }
      const outline = cache.outlines.get(section.t);
      return outline ? [{ side, id: section.id, t: section.t, outline }] : [];
    });
  };
}
