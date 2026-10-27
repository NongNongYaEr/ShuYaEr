import * as THREE from 'three';

export const referenceDefaults = mode => ({ human: mode !== 'BRANCH', ruler: mode === 'BRANCH', heightMark: mode !== 'BRANCH',
  visible: true, gridLabels: true, dimensions: true, grid: true, humanHeight: 1.75, rulerLength: .2, side: 'RIGHT', gap: mode === 'BRANCH' ? .06 : .5 });
export function normalizeReferencePreferences(raw, mode) {
  const defaults = referenceDefaults(mode), result = { ...defaults };
  for (const key of ['visible', 'gridLabels', 'human', 'ruler', 'heightMark', 'dimensions', 'grid']) if (typeof raw?.[key] === 'boolean') result[key] = raw[key];
  for (const [key, min, max] of [['humanHeight', .5, 3], ['gap', 0, 20]]) {
    const value = Number(raw?.[key]); if (Number.isFinite(value)) result[key] = Math.min(max, Math.max(min, value));
  }
  if ([.1, .2, .5, 1].includes(Number(raw?.rulerLength))) result.rulerLength = Number(raw.rulerLength);
  if (['LEFT', 'RIGHT'].includes(raw?.side)) result.side = raw.side;
  return result;
}
export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '—';
  const n = Math.abs(meters), [factor, unit] = n >= 1 ? [1, 'm'] : n >= .01 || n === 0 ? [100, 'cm'] : [1000, 'mm'];
  return `${Number((meters * factor).toFixed(2))} ${unit}`;
}
export function referenceGridStep(camera, distance, pixelHeight) {
  const span = camera.isOrthographicCamera ? (camera.top - camera.bottom) / camera.zoom
    : 2 * Math.max(.001, distance) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const desired = Math.max(.001, Math.min(100, span * 65 / Math.max(100, pixelHeight)));
  const decade = 10 ** Math.floor(Math.log10(desired)), ratio = desired / decade;
  return (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * decade;
}
// Asset-local bounds exclude camera overlays and the preview's wind rotation.
// Geometry/instance boxes are cached by Three; this does not materialize units.
export function referenceAssetBounds(group) {
  const result = new THREE.Box3(), transform = new THREE.Matrix4();
  group.updateWorldMatrix(true, true);
  const inverse = group.matrixWorld.clone().invert();
  group.traverse(object => {
    if (!object.isMesh || !object.geometry) return;
    let box;
    if (object.isInstancedMesh) { if (!object.boundingBox) object.computeBoundingBox(); box = object.boundingBox; }
    else { if (!object.geometry.boundingBox) object.geometry.computeBoundingBox(); box = object.geometry.boundingBox; }
    if (box) result.union(box.clone().applyMatrix4(transform.multiplyMatrices(inverse, object.matrixWorld)));
  });
  return result;
}
export function branchMeasuredLength(branch) {
  return branch.points.slice(1).reduce((sum, p, i) => sum + p.distanceTo(branch.points[i]), 0);
}

// An original, normalized silhouette. Feet are at z=0, head at z=1.
export function createHumanSilhouette() {
  const shape = new THREE.Shape();
  const outline = [[-.055,.885],[-.063,.85],[-.14,.817],[-.18,.68],[-.212,.53],[-.184,.515],[-.153,.63],[-.105,.735],[-.095,.57],[-.085,.49],[-.11,.29],[-.12,.055],[-.151,.019],[-.151,0],[-.065,0],[-.055,.05],[-.04,.29],[0,.465],[.04,.29],[.055,.05],[.065,0],[.151,0],[.151,.019],[.12,.055],[.11,.29],[.085,.49],[.095,.57],[.105,.735],[.153,.63],[.184,.515],[.212,.53],[.18,.68],[.14,.817],[.063,.85],[.055,.885]];
  outline.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y)); shape.closePath();
  const head = new THREE.Shape(); head.absellipse(0, .944, .043, .056, 0, Math.PI * 2, false, 0);
  return new THREE.ShapeGeometry([shape, head], 20).rotateX(Math.PI / 2);
}
