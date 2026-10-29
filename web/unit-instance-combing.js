import * as THREE from 'three';
import { resolveInstanceShape } from './branch-workbench-data.js';
import { evaluatedInstanceFrame, instanceFromMatrix } from './branch-instance-operations.js';
import { unitBranchIndex, mixedUnitPlacementParents } from './unit-branch-boundary.js';
import { brushFalloff } from './tree-sculpt.js';
import { INSTANCE_SCALE_MIN, INSTANCE_SCALE_MAX } from './assembly-scale.js';

const clamp = THREE.MathUtils.clamp;
const vector = value => value?.isVector3 ? value : new THREE.Vector3(...(Array.isArray(value) ? value : [0, 0, 0]));
const owns = (id, owner) => typeof id === 'string' && (id === owner || id.startsWith(owner + '.'));

// A captured legacy shape can contain the entire model. Placement snapshots
// own their mutable fields, while the source model remains read-only and shared.
function copyPlacement(instance) {
  const { shape, ...placement } = instance;
  const result = structuredClone(placement);
  if (Object.hasOwn(instance, 'shape')) result.shape = shape;
  return result;
}

function copyPreviewEntry(entry) {
  const result = {}, descriptor = { enumerable: true, configurable: true, writable: true, value: undefined };
  // Object spread would evaluate the previous entry's lazy samples getter on
  // every dab. Retain all other enumerable data (including symbol metadata).
  for (const key of Reflect.ownKeys(entry)) if (key !== 'samples' && Object.prototype.propertyIsEnumerable.call(entry, key)) {
    descriptor.value = entry[key]; Object.defineProperty(result, key, descriptor);
  }
  return result;
}
function lazySamples(entry, lines) {
  let initialized = false, samples;
  Object.defineProperty(entry, 'samples', { enumerable: true, configurable: true,
    get() { if (!initialized) { samples = lines.flat(); initialized = true; } return samples; },
    // This remains an ordinary writable preview field for external consumers.
    set(value) { samples = value; initialized = true; } });
  return entry;
}

// Prepared/advanced entries are immutable preview snapshots. Their carrier and
// evaluated matrix stay valid until the next entry replaces them. Do not search
// the entire runtime graph for the same carrier on every brush sample.
const placementContexts = new WeakMap(), updateFrames = new WeakMap();
function placementContext(entry, frame = null) {
  let context = placementContexts.get(entry);
  if (context?.instance === entry.instance && context.parent === entry.parent
    && context.shape === entry.shape && context.settings === entry.settings) return context;
  const parent = entry.parent || (entry.instance.parent ? entry.branches?.find(branch => branch.stableId === entry.instance.parent) : undefined);
  const carriers = parent ? [parent] : [];
  context = { instance: entry.instance, parent: entry.parent, carrier: parent, carriers, shape: entry.shape, settings: entry.settings,
    frame: frame || evaluatedInstanceFrame(entry.instance, entry.shape, carriers, entry.settings) };
  placementContexts.set(entry, context);
  return context;
}
function rotatedPlacement(entry, instance, frame, rotation) {
  const transform = new THREE.Matrix4().makeTranslation(...frame.position.toArray())
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation))
    .multiply(new THREE.Matrix4().makeTranslation(...frame.position.clone().negate().toArray()));
  return instanceFromMatrix(instance, entry.shape, placementContext(entry).carrier, transform.multiply(frame.matrix));
}
function placementDelta(entry, after) {
  const context = placementContext(entry);
  const frame = evaluatedInstanceFrame(after, entry.shape, context.carriers, entry.settings);
  context.inverse ||= context.frame.matrix.clone().invert();
  return { frame, matrix: frame.matrix.clone().multiply(context.inverse) };
}
const identityElements = new THREE.Matrix4().elements;

// A brush acts on a complete reusable model. Its internal curves, source version,
// dimensions and materials are never authoring targets for this operation.
export function prepareUnitCombEntries({ authoring, branches, settings, selection = [], scope = 'SELECTED', isLocked = () => false, sampleBranches = 'ROOT', placements = [], resolveShape = null }) {
  const instances = authoring.branch_instances || [], byId = new Map(instances.map(instance => [instance.id, instance]));
  const byBranch = new Map(branches.map(branch => [branch.stableId, branch]));
  const boundary = unitBranchIndex(branches, instances), ownedBranches = boundary.ownedBranches, children = new Map();
  const organPoints = new Map();
  if (sampleBranches === 'ALL' && placements.length) {
    const runtimeBranches = new Map(branches.map(branch => [branch.id, branch]));
    for (const placement of placements) {
      const stableId = placement.branchStableId || runtimeBranches.get(placement.branchId)?.stableId;
      const owner = boundary.owners.get(stableId)?.id || placement.sourceInstanceId || placement.instanceId || placement.unitOwner;
      if (!byId.has(owner) || !placement.position) continue;
      const position = vector(placement.position);
      if (!position.toArray().every(Number.isFinite)) continue;
      if (!organPoints.has(owner)) organPoints.set(owner, []);
      organPoints.get(owner).push(position.clone());
    }
  }
  const parentOwner = instance => boundary.owners.get(instance.parent)?.id
    || (!byBranch.has(instance.parent) ? instances.find(candidate => candidate.id !== instance.id && owns(instance.parent, candidate.id))?.id : undefined);
  const parentIds = new Map();
  for (const instance of instances) {
    const parentId = boundary.parents.get(instance.id) || parentOwner(instance); parentIds.set(instance.id, parentId);
    if (parentId) { if (!children.has(parentId)) children.set(parentId, []); children.get(parentId).push(instance.id); }
  }
  const arrayLocks = new Map((authoring.branch_arrays || []).map(group => [group.id, new Set(group.locked || [])]));
  const locked = new Set(instances.filter(instance => instance.assembly_locked
    || arrayLocks.get(instance.array_id)?.has(instance.id)
    || isLocked(instance, byBranch.get(instance.parent), ownedBranches.get(instance.id) || [])).map(instance => instance.id));
  const family = id => {
    const result = [], seen = new Set(), queue = [id];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor]; if (seen.has(current)) continue;
      seen.add(current); result.push(current); queue.push(...(children.get(current) || []));
    }
    return result;
  };
  const selected = new Set();
  for (const id of selection) {
    const owner = byId.has(id) ? id : boundary.owners.get(id)?.id || instances.find(instance => owns(id, instance.id))?.id;
    if (owner) selected.add(owner);
  }
  const families = new Map(), eligible = new Set();
  const mixedParents=mixedUnitPlacementParents(boundary);
  for (const instance of instances) {
    if (scope !== 'ALL' && scope !== 'TREE' && !selected.has(instance.id)) continue;
    const ids = family(instance.id); families.set(instance.id, ids);
    // Rotating a parent also transports its mounted children. Protect an explicit
    // child lock rather than moving it indirectly through the parent operation.
    if (!mixedParents.has(instance.id) && !ids.some(id => locked.has(id))) eligible.add(instance.id);
  }
  const libraryById = new Map((authoring.branch_library || []).map(item => [item.id, item]));
  const shapeCache = new Map(), entries = [];
  for (const instance of instances) {
    if (!eligible.has(instance.id)) continue;
    const visited = new Set([instance.id]); let ancestor = parentIds.get(instance.id), duplicate = false;
    while (ancestor && !visited.has(ancestor)) {
      if (eligible.has(ancestor)) { duplicate = true; break; }
      visited.add(ancestor); ancestor = parentIds.get(ancestor);
    }
    if (duplicate) continue;
    const source = libraryById.get(instance.asset_id);
    const reusable = instance.linked && source && (!instance.pinned_revision || instance.pinned_revision === source.revision
      || source.versions?.some(version => version.revision === instance.pinned_revision));
    const key = reusable ? `${instance.asset_id}:${instance.pinned_revision || 0}` : instance;
    if (!shapeCache.has(key)) shapeCache.set(key, resolveShape ? resolveShape(instance) : resolveInstanceShape(instance, authoring.branch_library || []));
    const shape = shapeCache.get(key), members = ownedBranches.get(instance.id) || [];
    if (!shape?.connector || !members.length) continue;
    const root = byBranch.get(boundary.roots.get(instance.id)) || members[0];
    const sampled = sampleBranches === 'ALL' ? members : [root];
    const branchLine = branch => {
      const count = Math.min(9, branch.points.length), points = branch.points;
      return Array.from({ length: count }, (_, index) => points[Math.round(index / (count - 1) * (points.length - 1))].clone());
    };
    const sampleLines = sampled.filter(branch => branch.points?.length > 1).map(branchLine);
    // Organ attachment points affect the entire owning model. Two equal points
    // form a point sample in the existing segment brush; they never become
    // independently editable geometry or authoring records.
    for (const point of organPoints.get(instance.id) || []) sampleLines.push([point, point.clone()]);
    const displayLines = sampleBranches === 'ALL' ? root.points?.length > 1 ? [branchLine(root)] : [] : sampleLines;
    const parent = byBranch.get(instance.parent), before = copyPlacement(instance);
    const frame = evaluatedInstanceFrame(before, shape, parent ? [parent] : [], settings);
    const longAxis = root.points.at(-1)?.clone().sub(frame.position);
    if (longAxis?.lengthSq() > 1e-12) longAxis.normalize();
    const entry = { id: instance.id, rootId: root.stableId, instance: before, shape, parent, settings, branches,
      frame, longAxis: longAxis?.lengthSq() > 1e-12 ? longAxis : null, samples: sampleLines.flat(), sampleLines, displayLines, sampleBranches: sampled, familyIds: families.get(instance.id),
      familyScales: families.get(instance.id).map(id => byId.get(id)?.scale ?? 1) };
    placementContext(entry, frame); entries.push(entry);
  }
  return entries;
}

// One continuous dab. The caller advances entries between dabs, so each drag
// turns the current pose gradually towards the drag direction around its root.
export function unitCombOrientationState(entry, { orientation = 'DRAG', downDirection = new THREE.Vector3(0, 0, -1) } = {}) {
  if (orientation !== 'DOWN' && orientation !== 'ROLL') return { orientation: 'DRAG' };
  const down = vector(downDirection).clone();
  if (down.lengthSq() < 1e-12 || !down.toArray().every(Number.isFinite)) return { orientation, skipReason: 'INVALID_GRAVITY' };
  down.normalize();
  let axis = entry.longAxis?.clone();
  if (!axis) {
    const root = entry.shape.branches?.find(branch => !branch.parent) || entry.shape.branches?.[0];
    if (root?.points?.length) axis = vector(root.points.at(-1)).clone().sub(vector(entry.shape.connector.position)).transformDirection(entry.frame.matrix);
  }
  if (!axis || axis.lengthSq() < 1e-12) return { orientation, skipReason: 'MISSING_AXIS' };
  axis.normalize();
  if (orientation === 'DOWN') return { orientation, axis, down, targetRotation: new THREE.Quaternion().setFromUnitVectors(axis, down) };
  const rawHang = entry.shape.connector?.hang_direction;
  if (!Array.isArray(rawHang) || rawHang.length < 3 || !rawHang.slice(0, 3).every(value => Number.isFinite(Number(value)))) return { orientation, skipReason: 'MISSING_REFERENCE' };
  const reference = vector(rawHang).clone().transformDirection(entry.frame.matrix);
  const side = reference.clone().addScaledVector(axis, -reference.dot(axis));
  const targetSide = down.clone().addScaledVector(axis, -down.dot(axis));
  if (side.lengthSq() < 1e-12) return { orientation, skipReason: 'PARALLEL_REFERENCE' };
  if (targetSide.lengthSq() < 1e-12) return { orientation, skipReason: 'PARALLEL_GRAVITY' };
  side.normalize(); targetSide.normalize();
  const angle = Math.atan2(axis.dot(new THREE.Vector3().crossVectors(side, targetSide)), clamp(side.dot(targetSide), -1, 1));
  return { orientation, axis, down, reference, targetRotation: new THREE.Quaternion().setFromAxisAngle(axis, angle) };
}

const effects = new Set(['TURN', 'ALIGN', 'SPREAD', 'SCALE', 'JITTER']);
const effectOf = options => effects.has(options.effect) ? options.effect : 'TURN';
const validVector = value => {
  if (value == null) return null;
  const result = vector(value).clone();
  return result.toArray().every(Number.isFinite) ? result : null;
};
function actualAxis(entry) {
  if (entry.longAxis?.lengthSq() > 1e-12) return entry.longAxis.clone().normalize();
  const root = entry.shape.branches?.find(branch => !branch.parent) || entry.shape.branches?.[0];
  const axis = root?.points?.length ? vector(root.points.at(-1)).clone().sub(vector(entry.shape.connector.position)).transformDirection(entry.frame.matrix) : null;
  return axis?.lengthSq() > 1e-12 ? axis.normalize() : null;
}
function hashFraction(value) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash ^= hash >>> 16; hash = Math.imul(hash, 0x7feb352d); hash ^= hash >>> 15;
  return (hash >>> 0) / 4294967296;
}

// These targets describe a complete instance, never a wood/leaf/fruit part.
// A controller can also call this for hover eligibility without starting a pen.
export function unitCombEffectState(entry, options = {}) {
  const effect = effectOf(options);
  if (effect === 'TURN') return { effect, ...unitCombOrientationState(entry, options) };
  if (effect === 'SCALE') {
    const percent = Number(options.sizeLimitPercent ?? 20);
    if (!Number.isFinite(percent) || percent < 0) return { effect, skipReason: 'INVALID_SIZE_LIMIT' };
    const scales = entry.familyScales || [entry.instance.scale];
    const minRatio = Math.max(...scales.map(scale => INSTANCE_SCALE_MIN / scale));
    const maxRatio = Math.min(...scales.map(scale => INSTANCE_SCALE_MAX / scale));
    const desired = options.sizeMode === 'SHRINK' ? 1 - percent / 100 : 1 + percent / 100;
    return { effect, targetScaleRatio: clamp(desired, minRatio, maxRatio) };
  }
  const axis = actualAxis(entry);
  if (!axis) return { effect, skipReason: 'MISSING_AXIS' };
  if (effect === 'ALIGN') {
    const sample = validVector(options.sampleDirection);
    if (!sample || sample.lengthSq() < 1e-12) return { effect, skipReason: 'MISSING_SAMPLE_DIRECTION' };
    return { effect, axis, targetRotation: new THREE.Quaternion().setFromUnitVectors(axis, sample.normalize()) };
  }
  const degrees = Number(options.angleLimitDegrees ?? 25);
  if (!Number.isFinite(degrees) || degrees < 0) return { effect, skipReason: 'INVALID_ANGLE_LIMIT' };
  const radians = THREE.MathUtils.degToRad(Math.min(180, degrees));
  if (effect === 'SPREAD') {
    const center = validVector(options.centerPoint);
    if (!center) return { effect, skipReason: 'MISSING_CENTER' };
    const radial = entry.frame.position.clone().sub(center);
    if (radial.lengthSq() < 1e-12) return { effect, skipReason: 'CENTER_AT_ROOT' };
    radial.normalize(); if (options.spreadMode === 'IN') radial.negate();
    const target = new THREE.Quaternion().setFromUnitVectors(axis, radial), angle = target.angleTo(new THREE.Quaternion());
    return { effect, axis, targetRotation: new THREE.Quaternion().slerp(target, angle > 0 ? Math.min(1, radians / angle) : 0) };
  }
  const seed = Number.isFinite(Number(options.seed)) ? Number(options.seed) : 1;
  const azimuth = hashFraction(`${entry.id}:${seed}:axis`) * Math.PI * 2;
  const helper = Math.abs(axis.z) < .9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const first = new THREE.Vector3().crossVectors(axis, helper).normalize(), second = new THREE.Vector3().crossVectors(axis, first);
  const rotationAxis = first.multiplyScalar(Math.cos(azimuth)).addScaledVector(second, Math.sin(azimuth));
  const angle = radians * (.5 + hashFraction(`${entry.id}:${seed}:angle`) * .5);
  return { effect, axis, targetRotation: new THREE.Quaternion().setFromAxisAngle(rotationAxis, angle) };
}

function fixedStrokeUpdate(entry, options, state, motion, influence, force) {
  // Transient state is returned, never attached to the author's instance. A new
  // pen starts from fresh prepare entries, so each pen can add another bounded
  // edit. No target is redrawn randomly or inferred from an already edited axis.
  const stroke = entry.stroke?.effect === state.effect ? entry.stroke : {
    effect: state.effect, progress: 0, instance: copyPlacement(entry.instance), frame: placementContext(entry).frame,
    targetRotation: state.targetRotation?.clone(), targetScaleRatio: state.targetScaleRatio,
  };
  const step = motion.length() / Math.max(.01, Number(options.worldRadius) || 1) * force * influence * 2;
  // Size direction may change with Alt during the same pen. Integrate a signed
  // amount from the original placement: changing direction never resets the
  // baseline or jumps to a different fixed target, and the whole pen stays capped.
  const sizeProgress = state.effect === 'SCALE'
    ? clamp((stroke.sizeProgress ?? 0) + step * (options.sizeMode === 'SHRINK' ? -1 : 1), -1, 1) : null;
  const progress = state.effect === 'SCALE' ? Math.abs(sizeProgress) : Math.min(1, stroke.progress + step);
  if (state.effect === 'SCALE' ? sizeProgress === (stroke.sizeProgress ?? 0) : progress === stroke.progress) return null;
  const totalRotation = new THREE.Quaternion().slerp(stroke.targetRotation || new THREE.Quaternion(), progress);
  const after = state.effect === 'SCALE' ? copyPlacement(stroke.instance)
    : rotatedPlacement(entry, stroke.instance, stroke.frame || evaluatedInstanceFrame(stroke.instance, entry.shape, placementContext(entry).carriers, entry.settings), totalRotation);
  const family = entry.familyScales || [stroke.instance.scale];
  const sizeRatio = state.effect === 'SCALE' ? clamp(1 + Number(options.sizeLimitPercent ?? 20) / 100 * sizeProgress,
    Math.max(...family.map(scale => INSTANCE_SCALE_MIN / scale)), Math.min(...family.map(scale => INSTANCE_SCALE_MAX / scale))) : 1;
  after.scale = state.effect === 'SCALE' ? stroke.instance.scale * sizeRatio : stroke.instance.scale;
  after.radius_scale = stroke.instance.radius_scale;
  const before = copyPlacement(entry.instance), { matrix, frame } = placementDelta(entry, after);
  if (matrix.elements.every((value, index) => Math.abs(value - identityElements[index]) < 1e-13)) return null;
  const rotation = new THREE.Quaternion().setFromRotationMatrix(matrix.clone().extractRotation(matrix));
  const update = { id: entry.id, before, after, shape: entry.shape, rotation, matrix, weight: influence, effect: state.effect,
    orientation: options.orientation || 'DRAG', familyIds: entry.familyIds, stroke: { ...stroke, progress, ...(sizeProgress !== null ? { sizeProgress } : {}) } };
  updateFrames.set(update, frame); return update;
}

export function combUnitInstance(entry, options = {}) {
  return combWithState(entry, options);
}
function combWithState(entry, options, preparedState = null) {
  const { delta, weight = 1, strength = 0.65, worldRadius = 1, orientation = 'DRAG', downDirection } = options;
  const motion = vector(delta), influence = clamp(Number(weight) || 0, 0, 1), force = clamp(Number(strength) || 0, 0, 1);
  if (!motion.toArray().every(Number.isFinite) || motion.lengthSq() < 1e-16 || influence <= 0 || force <= 0) return null;
  const state = preparedState || unitCombEffectState(entry, options);
  if (state.skipReason) return null;
  if (state.effect !== 'TURN') return fixedStrokeUpdate(entry, options, state, motion, influence, force);
  const target = state.targetRotation || new THREE.Quaternion().setFromUnitVectors(entry.frame.direction.clone().normalize(), motion.clone().normalize());
  const turn = Math.min(0.25, motion.length() / Math.max(0.01, Number(worldRadius) || 1) * force * 2) * influence;
  const rotation = new THREE.Quaternion().slerp(target, turn);
  if (Math.abs(rotation.w) > 1 - 1e-14) return null;
  const before = copyPlacement(entry.instance);
  const after = rotatedPlacement(entry, before, placementContext(entry).frame, rotation);
  // Recovering a local frame may introduce floating-point scale noise. Size and
  // thickness are deliberately exact saved values, never a brush side effect.
  after.scale = before.scale; after.radius_scale = before.radius_scale;
  const { matrix, frame } = placementDelta(entry, after);
  const update = { id: entry.id, before, after, shape: entry.shape, rotation, matrix, weight: influence, orientation: state.orientation, effect: 'TURN', familyIds: entry.familyIds };
  updateFrames.set(update, frame); return update;
}

function nearestBrushPoint(a, b, center, project, sphere, radius, worldRadius) {
  let alpha;
  if (sphere) {
    const edge = b.clone().sub(a);
    alpha = clamp(center.world.clone().sub(a).dot(edge) / Math.max(1e-12, edge.lengthSq()), 0, 1);
    // Radius <= 0 has historical falloff semantics; leave that edge case on the
    // exact path. Normal spatial brushes can reject a distant segment first.
    if (radius > 0 && Number.isFinite(radius) && a.clone().lerp(b, alpha).distanceToSquared(center.world) > Math.max(1e-6, worldRadius) ** 2 * (1 + 1e-12)) return null;
  } else {
    const pa = project(a), pb = project(b);
    if (pa.visible === false || pb.visible === false || pa.clip < -1 || pa.clip > 1 || pb.clip < -1 || pb.clip > 1) return null;
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    alpha = clamp(((center.x - pa.x) * dx + (center.y - pa.y) * dy) / Math.max(1e-12, dx * dx + dy * dy), 0, 1);
    const x = pa.x + dx * alpha - center.x, y = pa.y + dy * alpha - center.y;
    // Projective cameras preserve lines. The closest point on the projected
    // segment is a conservative bound; preserve the existing exact 3D lerp and
    // projection for survivors, including its perspective/depth behavior.
    if (x * x + y * y > Math.max(1e-6, radius) ** 2 * (1 + 1e-12)) return null;
  }
  // A lerp hit is ephemeral. Endpoints can use the controller's projection
  // cache, but retaining this temporary point in a WeakMap never saves work.
  const point = a.clone().lerp(b, alpha), projected = project(point, false);
  if (projected.visible === false || projected.clip < -1 || projected.clip > 1) return null;
  return { point, projected };
}

export function evaluateUnitInstanceCombing(entries, options) {
  const { project, delta, radius = 160, hardness = 0.2, strength = 0.65, worldRadius = 1 } = options;
  const rawCenter = options.center || {}, center = Array.isArray(rawCenter) ? { x: rawCenter[0], y: rawCenter[1] } : { ...rawCenter };
  center.depth ??= options.depth;
  center.world = vector(center.world || center.center3d || options.center3d);
  const depthMode = options.depthMode || options.scope || 'SURFACE';
  const depthRadius = options.depthRadius ?? (options.depthRange ?? 1.5) / 2;
  const weights = new Map(), updates = [], matrices = new Map(), skipped = new Map();
  const motion = vector(delta), moving = motion.lengthSq() >= 1e-16 && motion.toArray().every(Number.isFinite)
    && clamp(Number(strength) || 0, 0, 1) > 0;
  for (const entry of entries) {
    let weight = 0;
    for (const line of entry.sampleLines || [entry.samples]) {
      for (let index = 1; index < line.length; index++) {
        const hit = nearestBrushPoint(line[index - 1], line[index], center, project, depthMode === 'SPHERE', radius, worldRadius);
        if (!hit) continue;
        const distance = depthMode === 'SPHERE' ? hit.point.distanceTo(center.world) / Math.max(1e-6, worldRadius) * radius
          : Math.hypot(hit.projected.x - center.x, hit.projected.y - center.y);
        const depthWeight = depthMode === 'SURFACE' && Number.isFinite(center.depth)
          ? brushFalloff(Math.abs(hit.projected.depth - center.depth), depthRadius, 0.75) : 1;
        weight = Math.max(weight, brushFalloff(distance, radius, clamp(hardness, 0, 1)) * depthWeight);
        if (weight >= 1) break;
      }
      if (weight >= 1) break;
    }
    const state = weight > 0 ? unitCombEffectState(entry, options) : null;
    if (state?.skipReason) { skipped.set(entry.id, state.skipReason); weight = 0; }
    weights.set(entry.id, weight);
    if (!(weight > 0) || !moving) continue;
    const update = combWithState(entry, { ...options, delta, weight, strength, worldRadius }, state);
    if (!update) continue;
    updates.push(update);
    for (const id of entry.familyIds || [entry.id]) matrices.set(id, update.matrix);
  }
  return { updates, matrices, weights, skipped };
}

// The default returns immutable snapshots. A controller may opt into mutable
// stroke-local points: the first update still copies prepared geometry. Pass one
// private WeakSet workspace throughout a pen to reuse its own entries; omitting
// workspace safely creates a new ownership set and copies again on each call.
// Commit the returned root records once through applyInstanceFamilyPlacement.
export function advanceUnitCombEntries(entries, updates, { inPlace = false, workspace = new WeakSet() } = {}) {
  if (!updates.length) return entries;
  const byId = new Map(updates.map(update => [update.id, update]));
  return entries.map(entry => {
    const update = byId.get(entry.id); if (!update) return entry;
    const reuse = inPlace && workspace.has(entry);
    let sampleLines, displayLines;
    if (reuse) {
      sampleLines = entry.sampleLines; displayLines = entry.displayLines;
      for (const line of sampleLines) for (const point of line) point.applyMatrix4(update.matrix);
      if (displayLines && displayLines !== sampleLines) for (const line of displayLines) for (const point of line) point.applyMatrix4(update.matrix);
    } else {
      sampleLines = entry.sampleLines.map(line => line.map(point => point.clone().applyMatrix4(update.matrix)));
      displayLines = entry.displayLines === entry.sampleLines ? sampleLines
        : entry.displayLines?.map(line => line.map(point => point.clone().applyMatrix4(update.matrix)));
    }
    const next = Object.assign(reuse ? entry : copyPreviewEntry(entry), { instance: copyPlacement(update.after), sampleLines, ...(displayLines ? { displayLines } : {}),
      ...(update.stroke ? { stroke: update.stroke } : {}),
      longAxis: entry.longAxis?.clone().transformDirection(update.matrix) || null,
      frame: { position: entry.frame.position.clone().applyMatrix4(update.matrix),
        direction: entry.frame.direction.clone().transformDirection(update.matrix), matrix: update.matrix.clone().multiply(entry.frame.matrix) } });
    placementContext(next, updateFrames.get(update));
    if (inPlace) workspace.add(next);
    return lazySamples(next, sampleLines);
  });
}
