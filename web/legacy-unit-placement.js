import * as THREE from './vendor/three.module.min.js';
import { captureBranchShape, normalizeBranchShape, resolveInstanceShape } from './branch-workbench-data.js';
import { unitBranchIndex } from './unit-branch-boundary.js';
import { sampleLine, lineTangent } from './tree-sculpt.js';
import { INSTANCE_SCALE_MIN, INSTANCE_SCALE_MAX } from './assembly-scale.js';

const identity = new THREE.Quaternion();
const values = value => value == null ? [] : typeof value === 'string' ? [value] : [...value];
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,512}$/.test(value);
const finiteVector = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);
const provenance = branch => branch.sourceInstanceId || [...(branch.copiedLeaves || []), ...(branch.copiedOrgans || [])]
  .find(unit => unit.metadata?.sourceInstanceId)?.metadata.sourceInstanceId || '';
const sourceAsset = branch => branch.sourceAssetId || [...(branch.copiedLeaves || []), ...(branch.copiedOrgans || [])]
  .find(unit => unit.metadata?.sourceAssetId)?.metadata.sourceAssetId || '';

function graph(branches) {
  const byStable = new Map(branches.map(branch => [branch.stableId, branch])), byRuntime = new Map(branches.map(branch => [branch.id, branch]));
  const children = new Map();
  for (const branch of branches) {
    const parent = byRuntime.get(branch.parentId) || byStable.get(branch.parentId);
    if (!parent || parent === branch) continue;
    if (!children.has(parent.stableId)) children.set(parent.stableId, []);
    children.get(parent.stableId).push(branch);
  }
  const family = root => {
    const result = [], seen = new Set(), queue = [root];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const branch = queue[cursor]; if (!branch || seen.has(branch.stableId)) continue;
      seen.add(branch.stableId); result.push(branch); queue.push(...(children.get(branch.stableId) || []));
    }
    return result;
  };
  return { byStable, byRuntime, children, family };
}

/** Recover the intentionally unowned root of an old complete-model copy.
 * These are runtime annotations only: construction records and source aliases
 * remain untouched, and ordinary copied skeleton branches stay structural. */
export function legacyUnitBranches(authoring, branches = []) {
  const { children,byRuntime,byStable } = graph(branches), actual = new Set((authoring?.branch_instances || []).map(instance => instance.id)), recoveredBranches = new Map();
  return branches.map(branch => {
    const preserve = () => { recoveredBranches.set(branch.stableId,branch); return branch; };
    if (branch.instanceId || branch.unitOwner || !branch.copySnapshot) return preserve();
    const source = provenance(branch); if (!source) return preserve();
    const parent = byRuntime.get(branch.parentId) || byStable.get(branch.parentId), knownParent = recoveredBranches.get(parent?.stableId) || parent;
    if (knownParent?.copySnapshot && knownParent.unitOwner && provenance(knownParent) === source
      && knownParent.stableId.replace(/_\d+$/, '') === branch.stableId.replace(/_\d+$/, '')) {
      const next={...branch,unitOwner:knownParent.unitOwner}; recoveredBranches.set(branch.stableId,next); return next;
    }
    let queue = children.get(branch.stableId) || [], recovered = '';
    const visited = new Set([branch.stableId]);
    while (queue.length && !recovered) {
      const candidates = new Set(), next = [];
      for (const child of queue) {
        if (visited.has(child.stableId)) continue; visited.add(child.stableId);
        const owner = child.instanceId || child.unitOwner;
        if (owner && !actual.has(owner) && provenance(child) === source) candidates.add(owner);
        if (!owner) next.push(...(children.get(child.stableId) || []));
      }
      if (candidates.size === 1) recovered = [...candidates][0];
      else if (candidates.size > 1) break;
      queue = next;
    }
    const owner = recovered || `${branch.stableId.replace(/_\d+$/, '')}_${source}`;
    const next = identifier(owner) && !actual.has(owner) ? { ...branch, unitOwner: owner } : branch;
    recoveredBranches.set(branch.stableId,next); return next;
  });
}

/** Transient complete instances for geometry already baked into old DUPLICATE
 * layers. Never append these records to branch_instances or branch_library. */
export function legacyUnitInstances(authoring = {}, branches = []) {
  const annotated = legacyUnitBranches(authoring, branches), boundary = unitBranchIndex(annotated, authoring.branch_instances || []);
  const topology = graph(annotated), result = [];
  const duplicateIds = new Set((authoring.sculpt_layers || []).flatMap(layer => layer.operation?.type === 'DUPLICATE' ? (layer.operation.records || []).map(record => record.id) : []));
  for (const [owner, legacy] of boundary.legacyByInstance) {
    const root = topology.byStable.get(boundary.roots.get(owner)), members = boundary.ownedBranches.get(owner) || [];
    if (!root?.points?.length || root.points.length < 2 || !members.length) continue;
    if (!members.some(branch => branch.copySnapshot || duplicateIds.has(branch.stableId))) continue;
    const capture = captureBranchShape(members, root.stableId), origin = root.points[0], direction = lineTangent(root.points, 0);
    // Malformed old graphs may contain disconnected fragments under one owner.
    // Preserve them in the transient shape instead of silently dropping wood.
    const included = new Set(capture.source.ids), toLocal = new THREE.Quaternion().setFromUnitVectors(direction, new THREE.Vector3(1,0,0));
    const rawShape = structuredClone(capture.shape);
    for (const branch of members) if (!included.has(branch.stableId)) {
      rawShape.branches.push({ id: `B${rawShape.branches.length}`, parent: rawShape.branches[0].id, attach: branch.parentT,
        points: branch.points.map(point => point.clone().sub(origin).applyQuaternion(toLocal).toArray()),
        knots: (branch.controlPoints || branch.points).map(point => point.clone().sub(origin).applyQuaternion(toLocal).toArray()),
        length: branch.length, start_radius: branch.startRadius, end_radius: branch.endRadius, radius_profile: branch.radiusProfile, sections: branch.sections });
    }
    let shape = normalizeBranchShape(rawShape);
    if (!shape) continue;
    const parent = topology.byRuntime.get(root.parentId) || topology.byStable.get(root.parentId), sourceInstanceId = provenance(root)
      || members.map(provenance).find(Boolean) || '', sourceInstance = (authoring.branch_instances || []).find(instance => instance.id === sourceInstanceId);
    const assetId = sourceAsset(root) || members.map(sourceAsset).find(Boolean) || sourceInstance?.asset_id || '';
    const originalShape = sourceInstance && resolveInstanceShape(sourceInstance, authoring.branch_library || []);
    const reference = originalShape?.connector?.hang_direction;
    if (finiteVector(reference, 3) && root.mountMatrix) {
      const hang = new THREE.Vector3(...reference).transformDirection(root.mountMatrix).applyQuaternion(toLocal);
      if (hang.lengthSq() > 1e-12) shape = { ...shape, connector: { ...shape.connector, hang_direction: hang.normalize().toArray() } };
    }
    result.push({ ...legacy, legacyPlacement: true, kind: 'LEGACY_UNIT', legacyRootId: root.stableId,
      legacyBranchIds: [...capture.source.ids,...members.filter(branch=>!included.has(branch.stableId)).map(branch=>branch.stableId)], legacyParent: parent?.stableId || '',
      sourceAssetId: assetId, sourceInstanceId, asset_id: assetId, linked: false, pinned_revision: sourceInstance?.pinned_revision || 0,
      name: (authoring.branch_library || []).find(asset => asset.id === assetId)?.name || '旧完整单元枝', shape,
      // The captured shape already contains the carrier's evaluated scale and
      // roll. A world frame avoids applying that mount a second time.
      parent: '', attach: root.parentT || 0, scale: 1, radius_scale: 1, variation: 0, seed: 1, angle: 45, azimuth: 0, roll: 0,
      shootRole: root.shootRole || sourceInstance?.shootRole || 'ANY', assembly_manual: true,
      ...(root.assembly_locked || root.override?.assembly_locked ? { assembly_locked: true } : {}),
      frame: { position: origin.toArray(), direction: direction.toArray(), parent_position: null, parent_tangent: [0,0,1] },
      legacyParentFrame: parent ? { position: sampleLine(parent.points, root.parentT).toArray(), tangent: lineTangent(parent.points, root.parentT).toArray() } : null });
  }
  return result;
}

export function normalizeLegacyUnitPlacement(raw) {
  if (raw?.type !== 'UNIT_PLACEMENT') return null;
  const records = [], seen = new Set();
  for (const item of (Array.isArray(raw.records) ? raw.records : raw.root ? [raw] : []).slice(0,1600)) {
    if (!identifier(item?.root) || !identifier(item.owner) || seen.has(item.root) || !finiteVector(item.rotation,4)) continue;
    const rotation = new THREE.Quaternion(...item.rotation); if (rotation.lengthSq() < 1e-12) continue; rotation.normalize();
    const scale = Number(item.scale ?? 1); if (!Number.isFinite(scale) || scale < INSTANCE_SCALE_MIN || scale > INSTANCE_SCALE_MAX) continue;
    const tangent = finiteVector(item.parent_tangent,3) ? new THREE.Vector3(...item.parent_tangent) : new THREE.Vector3(0,0,1);
    if (tangent.lengthSq() < 1e-12) continue; tangent.normalize();
    const targets = [...new Set(values(item.targets).filter(identifier))].slice(0,16000);
    if (!targets.includes(item.root)) continue;
    seen.add(item.root);
    records.push({ owner: item.owner, root: item.root, parent: identifier(item.parent) ? item.parent : '',
      attach: THREE.MathUtils.clamp(Number(item.attach) || 0,0,1), parent_tangent: tangent.toArray(), rotation: rotation.toArray(), scale, targets,
      sourceAssetId: identifier(item.sourceAssetId) ? item.sourceAssetId : '', sourceInstanceId: identifier(item.sourceInstanceId) ? item.sourceInstanceId : '' });
  }
  return records.length ? { type: 'UNIT_PLACEMENT', targets: [...new Set(records.flatMap(record => record.targets))], records } : null;
}

function protectedFamily(family, boundary, authoring, { excluded = [], locked = [], isLocked } = {}, topology) {
  const excludedIds = new Set(values(excluded)), lockedIds = new Set(values(locked)), members = new Set(family.map(branch => branch.stableId));
  const owners = new Set(family.map(branch => boundary.owners.get(branch.stableId)?.id).filter(Boolean));
  for (const id of [...excludedIds, ...lockedIds]) if (members.has(id) || owners.has(boundary.ownerOf(id)?.id || id)) return true;
  for (const branch of family) if (branch.assembly_locked || branch.override?.assembly_locked) return true;
  for (const owner of owners) {
    const instance = boundary.byInstance.get(owner) || boundary.legacyByInstance.get(owner);
    if (!instance) continue;
    if (instance.assembly_locked || (authoring?.branch_arrays || []).some(array => array.id === instance.array_id && array.locked?.includes(owner))) return true;
    const owned = boundary.ownedBranches.get(owner) || [], root = boundary.byBranch.get(boundary.roots.get(owner));
    const parent = boundary.byBranch.get(instance.parent || instance.legacyParent) || topology?.byRuntime.get(root?.parentId) || boundary.byBranch.get(root?.parentId);
    if (isLocked?.(instance,parent,owned)) return true;
  }
  return false;
}

/** Updates must contain the accumulated rigid matrix from the pen baseline,
 * rather than only its final dab. Translation/shear/nonuniform scale is rejected. */
export function makeLegacyUnitPlacement(entries = [], updates = [], options = {}) {
  const byEntry = new Map(entries.map(entry => [entry.id,entry])), records = [], contexts = new Map();
  for (const update of updates) {
    const entry = byEntry.get(update.id), instance = entry?.instance || entry;
    if (!instance?.legacyPlacement) continue;
    const branches = options.branches || entry.branches || [];
    if (!contexts.has(branches)) {
      const annotated = legacyUnitBranches(options.authoring || {},branches);
      contexts.set(branches,{topology:graph(annotated),boundary:unitBranchIndex(annotated,options.authoring?.branch_instances || [])});
    }
    const {topology,boundary} = contexts.get(branches);
    const root = topology.byStable.get(entry.rootId || instance.legacyRootId); if (!root) continue;
    const family = topology.family(root);
    if (instance.assembly_locked || protectedFamily(family,boundary,options.authoring,options,topology)) continue;
    const matrix = update.matrix?.isMatrix4 ? update.matrix : finiteVector(update.matrix,16) ? new THREE.Matrix4().fromArray(update.matrix) : null;
    if (!matrix || !matrix.elements.every(Number.isFinite) || matrix.determinant() <= 0) continue;
    const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), dimensions = new THREE.Vector3(); matrix.decompose(position,rotation,dimensions);
    const scale = dimensions.x;
    if (scale < INSTANCE_SCALE_MIN || scale > INSTANCE_SCALE_MAX || Math.abs(scale-dimensions.y) > 1e-7*Math.max(1,scale) || Math.abs(scale-dimensions.z) > 1e-7*Math.max(1,scale)) continue;
    const composed = new THREE.Matrix4().compose(position,rotation,dimensions);
    if (matrix.elements.some((value,index) => Math.abs(value-composed.elements[index]) > 1e-7*Math.max(1,Math.abs(value)))) continue;
    if (root.points[0].clone().applyMatrix4(matrix).distanceTo(root.points[0]) > 1e-6) continue;
    if (rotation.angleTo(identity) < 1e-12 && Math.abs(scale-1) < 1e-12) continue;
    const parent = topology.byRuntime.get(root.parentId) || topology.byStable.get(root.parentId);
    records.push({ owner: instance.id, root: root.stableId, parent: parent?.stableId || '', attach: root.parentT,
      parent_tangent: parent ? lineTangent(parent.points,root.parentT).toArray() : [0,0,1], rotation: rotation.toArray(), scale,
      targets: family.map(branch => branch.stableId), sourceAssetId: instance.sourceAssetId || '', sourceInstanceId: instance.sourceInstanceId || '' });
  }
  return normalizeLegacyUnitPlacement({ type: 'UNIT_PLACEMENT',records });
}

const scaledUnits = (items, scale) => items?.map(item => ({ ...item, offset: item.offset?.map(value => value*scale),
  ...(Number.isFinite(item.scale) ? { scale: item.scale*scale } : {}), ...(Number.isFinite(item.base_scale) ? { base_scale: item.base_scale*scale } : {}) }));

// Runtime only. Regenerating a tube in a new world frame changes its initial
// ring roll and can change bark UVs at the minimum tiling denominator. Keep
// the original sweep inputs and compose complete-model motions around them.
export function transformLegacyRigidGeometry(branch, matrix, parent = null) {
  const previous = branch.legacyRigidGeometry;
  let baseline = previous?.baseline;
  if (!baseline) {
    baseline = { points: branch.points.map(point => point.clone()) };
    for (const key of ['length','startRadius','endRadius','parentRadius','parentId','order','phase','windPhase','windStiffness']) baseline[key]=branch[key];
    for (const key of ['radiusProfile','sections','skeletonRadius','radiusEdits','junction']) if (branch[key] != null) baseline[key]=structuredClone(branch[key]);
    // Preserve whether adaptive tessellation was skipped for surface normals.
    if (branch.surfaceNormals) baseline.surfaceNormals=true;
  }
  const collarParent=previous?.collarParent || (parent?.points?.length>1
    ? {points:parent.points.map(point=>point.clone()),surfaceNormals:Boolean(parent.surfaceNormals)} : null);
  return { baseline, matrix: matrix.clone().multiply(previous?.matrix || new THREE.Matrix4()), collarParent };
}

/** Evaluate against the current root and parent tangent, transporting the whole
 * complete model exactly once. This returns runtime geometry, never source data. */
export function evaluateLegacyUnitPlacement(branches = [], raw, strength = 1, options = {}) {
  const operation = normalizeLegacyUnitPlacement(raw), amount = THREE.MathUtils.clamp(Number(strength) || 0,0,1);
  if (!operation || amount <= 0) return branches;
  const annotated = legacyUnitBranches(options.authoring || {},branches), topology = graph(annotated), boundary = unitBranchIndex(annotated,options.authoring?.branch_instances || []);
  const duplicateIds = new Set((options.authoring?.sculpt_layers || []).flatMap(layer => layer.operation?.type === 'DUPLICATE' ? (layer.operation.records || []).map(record => record.id) : []));
  const transformations = new Map(), blocked = new Set();
  const candidates = operation.records.flatMap(record => {
    const root = topology.byStable.get(record.root); if (!root || boundary.owners.get(root.stableId)?.id !== record.owner || boundary.byInstance.has(record.owner)
      || !(boundary.ownedBranches.get(record.owner) || []).some(branch => branch.copySnapshot || duplicateIds.has(branch.stableId))) return [];
    const family = topology.family(root), ids = new Set(family.map(branch => branch.stableId));
    if (record.targets.some(id => topology.byStable.has(id) && !ids.has(id)) || protectedFamily(family,boundary,options.authoring,options,topology)) { blocked.add(record.root); return []; }
    return [{record,root,family,ids}];
  });
  // A selected parent and child share one placement. A protected child must also
  // invalidate its ancestor rather than being silently carried by that ancestor.
  for (const candidate of candidates) {
    if ([...blocked].some(id => candidate.ids.has(id)) || candidates.some(other => other !== candidate && other.ids.has(candidate.root.stableId))) continue;
    const { record,root,family } = candidate, parent = topology.byStable.get(record.parent), q = new THREE.Quaternion().slerp(new THREE.Quaternion(...record.rotation),amount);
    if (parent?.points?.length > 1) {
      const follow = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...record.parent_tangent),lineTangent(parent.points,record.attach));
      q.premultiply(follow).multiply(follow.clone().invert());
    }
    const scale = 1+(record.scale-1)*amount, pivot = root.points[0], matrix = new THREE.Matrix4().compose(pivot,q,new THREE.Vector3().setScalar(scale))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z));
    for (const branch of family) transformations.set(branch.stableId,{matrix,q,scale});
  }
  if (!transformations.size) return branches;
  return branches.map(branch => {
    const transform = transformations.get(branch.stableId); if (!transform) return branch;
    const { matrix,q,scale } = transform, parent = topology.byRuntime.get(branch.parentId) || topology.byStable.get(branch.parentId);
    const next = { ...branch, points: branch.points.map(point => point.clone().applyMatrix4(matrix)),
      controlPoints: (branch.controlPoints || branch.points).map(point => point.clone().applyMatrix4(matrix)),
      mountMatrix: matrix.clone().multiply(branch.mountMatrix || new THREE.Matrix4()),
      legacyRigidGeometry: transformLegacyRigidGeometry(branch,matrix,parent) };
    if (parent?.points?.length > 1) {
      // Match addJunctionCollars' polyline-index tangent before this operation.
      // Recomputing it from the moved parent would discard the collar's roll,
      // especially at the outer root whose carrier did not move with the unit.
      const baseline = branch.collarQuaternion?.isQuaternion ? branch.collarQuaternion
        : new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),lineTangent(parent.points,.7));
      next.collarQuaternion = q.clone().multiply(baseline).normalize();
    }
    for (const key of ['length','startRadius','endRadius','parentRadius']) if (Number.isFinite(branch[key])) next[key]=branch[key]*scale;
    if (branch.skeletonRadius && Number.isFinite(branch.skeletonRadius.base)) next.skeletonRadius={...branch.skeletonRadius,base:branch.skeletonRadius.base*scale};
    if (branch.junction && Number.isFinite(branch.junction.length)) next.junction={...branch.junction,length:branch.junction.length*scale};
    if (branch.surfaceNormals) next.surfaceNormals=branch.surfaceNormals.map(normal=>normal.clone().applyQuaternion(q).normalize());
    if (branch.mountFrames) next.mountFrames=branch.mountFrames.map(frame=>matrix.clone().multiply(frame));
    if (branch.copiedLeaves) next.copiedLeaves=scaledUnits(branch.copiedLeaves,scale);
    if (branch.copiedOrgans) next.copiedOrgans=scaledUnits(branch.copiedOrgans,scale);
    delete next.mountFrameBinding;
    return next;
  });
}
