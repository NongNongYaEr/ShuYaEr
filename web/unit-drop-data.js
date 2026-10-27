import * as THREE from 'three';
import { geometryExtent } from './plant-unit-data.js';
import { captureUnit, nearestUnitT, unitFrame } from './unit-authoring.js';

// Card IDs in recovered old projects include the original source index. Never
// match by display name: two complete units may legitimately share a name.
export function droppedUnitSource(sources, pack, unit) {
  const exact = sources.findIndex(s => s.id === `${pack.id}:${unit.id}`);
  if (exact >= 0) return exact;
  const legacy = /^(leaf|organ):(\d+):(.+)$/.exec(unit.id);
  if (pack.id.startsWith('embedded:') && legacy && sources[+legacy[2]]?.id === legacy[3]) return +legacy[2];
  return sources.findIndex(s => s.id === unit.id);
}

export function droppedUnitPose(branch, point) {
  const t = nearestUnitT(branch, point), frame = unitFrame(branch, t);
  const local = point.clone().sub(frame.position).applyQuaternion(frame.quaternion.clone().invert());
  local.y = 0;
  if (local.lengthSq() < 1e-10) local.set(1, 0, 0);
  local.normalize().add(new THREE.Vector3(0, .35, 0)).normalize();
  return { unitT: t, position: frame.position, direction: local.applyQuaternion(frame.quaternion), normal: null, twist: 0 };
}

export function droppedUnitScale(source, settings, unit) {
  if (unit.role !== 'LEAF') return unit.size_m / geometryExtent(source.geometry).longest;
  const c = source.calibration || {}, angle = (c.rotation || 0) * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle), aspect = settings.leaf_aspect || 1;
  const position = source.geometry.position.slice();
  for (let i = 0; i < position.length; i += 3) {
    const x = position[i] * (c.flip ? -1 : 1), z = position[i + 2];
    position[i] = (x * cos + z * sin) * aspect;
    position[i + 2] = z * cos - x * sin;
  }
  return unit.size_m / (geometryExtent({ position }).longest * (c.scale || 1));
}

// Called on the captured, disposable next document only, after a valid drop.
// New sources are explicit-only, so importing one card cannot reseed the rest.
export function addDroppedUnit(doc, pack, unit, branch, point, id) {
  if (!branch || branch.unitOwner || branch.instanceId) throw Error('请拖到当前单元枝可编辑的木质枝干上');
  const kind = unit.role === 'LEAF' ? 'LEAF' : 'ORGAN';
  const sources = kind === 'LEAF' ? doc.leaf_meshes : doc.authoring.tree_organs.units;
  let index = droppedUnitSource(sources, pack, unit);
  let sourceId = `${pack.id}:${unit.id}`;
  if (kind === 'LEAF' && doc.authoring.foliage_unit?.mode === 'PINNATE') {
    sourceId += ':complete';
    if (index < 0 || !sources[index].manual_only) index = sources.findIndex(s => s.id === sourceId);
  }
  if (index < 0) {
    if (kind === 'ORGAN' && sources.length >= 24) throw Error('当前单元枝最多使用 24 款花果单元');
    if (kind === 'LEAF' && !sources.length && doc.settings.leaf_density > 0) throw Error('请先在装配面板应用真实叶片组合，再拖入新增单元');
    const geometry = structuredClone(unit.geometry);
    if (kind === 'LEAF') {
      const aspect = doc.settings.leaf_aspect || 1;
      for (let i = 0; i < geometry.position.length; i += 3) {
        geometry.position[i] /= aspect;
      }
      // The leaf renderer applies aspect to positions only. Keep the imported
      // normals for the final, compensated shape instead of skewing them twice.
    }
    index = sources.length;
    sources.push({ id: sourceId, name: unit.name, geometry, manual_only: true,
      ...(unit.colorTint ? { colorTint: unit.colorTint } : {}), weight: 1,
      ...(kind === 'LEAF' ? { calibration: { scale: unit.size_m / .1, rotation: 0, flip: false }, orderMin: 0, orderMax: 3, season: 'ANY' }
        : { role: unit.role, size: unit.size_m }) });
  }
  const p = { ...droppedUnitPose(branch, point), stableId: id, source: index, scale: droppedUnitScale(sources[index], doc.settings, unit) };
  const record = captureUnit(p, branch, sources, kind, true);
  doc.authoring.unit_editing.items.push(record);
  return record;
}
