import {axisTimes,axisTime,cloneAxis,normalizeAxisTimes,withAxisTimes} from './branch-axis.js';
import * as THREE from './vendor/three.module.min.js';
import { appendBranchDuplicate } from './branch-duplicate.js';
import { sampleLine, lineTangent } from './tree-sculpt.js';
import { evaluateShapeOperation } from './shape-operation-geometry.js';
import { sectionAt } from './branch-shaping.js';
import {finishBuildSteps} from './cooperative-build.js';
import {legacyGeometryForCurve} from './legacy-curve-geometry.js';
import {transportMountFrames} from './branch-mount-frame.js';

export function generationSlots(points, rule) {
  const distances = [0]; points.slice(1).forEach((point, i) => distances.push(distances.at(-1) + point.distanceTo(points[i])));
  const distanceAt = (t) => { const cursor = t * (points.length - 1), i = Math.min(points.length - 2, Math.floor(cursor)); return distances[i] + (distances[i + 1] - distances[i]) * (cursor - i); };
  const parameterAt = (d) => { let i = distances.findIndex((value) => value >= d); if (i <= 0) return i < 0 ? 1 : 0; return (i - 1 + (d - distances[i - 1]) / Math.max(1e-12, distances[i] - distances[i - 1])) / (points.length - 1); };
  const span = Math.max(0, rule.end - rule.start);
  if (!span || !rule.enabled) return [];
  if (rule.mode === 'BEND') {
    const slots = []; let previous = -Infinity;
    for (let i = 1; i < points.length - 1; i++) {
      const t = i / (points.length - 1);
      if (t < rule.start || t > rule.end || distances[i] - previous < rule.spacing) continue;
      const a = points[i].clone().sub(points[i - 1]); const b = points[i + 1].clone().sub(points[i]);
      if (a.lengthSq() < 1e-12 || b.lengthSq() < 1e-12) continue;
      if (THREE.MathUtils.radToDeg(a.angleTo(b)) < rule.threshold) continue;
      slots.push({ t, azimuth: slots.length * 2.399963 + THREE.MathUtils.degToRad(rule.rotation) }); previous = distances[i];
      if (slots.length >= 40) break;
    }
    return slots;
  }
  if (rule.mode === 'INTERVAL') {
    const start = distanceAt(rule.start), end = distanceAt(rule.end);
    return Array.from({ length: Math.min(80, Math.floor((end - start) / rule.spacing + 1e-9) + 1) }, (_, i) => ({ t: parameterAt(start + i * rule.spacing), azimuth: i * 2.399963 + THREE.MathUtils.degToRad(rule.rotation) }));
  }
  const count = rule.mode === 'WHORLED' ? Math.min(120, rule.layers * rule.per_layer)
    : rule.count;
  return Array.from({ length: count }, (_, index) => {
    const level = rule.mode === 'WHORLED' ? Math.floor(index / rule.per_layer) : index;
    const levels = rule.mode === 'WHORLED' ? rule.layers : count;
    return { t: rule.start + span * (levels === 1 ? 0.5 : level / (levels - 1)),
      azimuth: THREE.MathUtils.degToRad(rule.rotation) + (rule.mode === 'WHORLED' ? (index % rule.per_layer) / rule.per_layer * Math.PI * 2 + level * 0.5 : index * 2.399963) };
  });
}
const vectors = (values) => values.map((p) => new THREE.Vector3(...p));
const sampledVectors = (values,times) => {
  const points=vectors(values),valid=normalizeAxisTimes(times,points.length);
  return valid?withAxisTimes(points,valid):points;
};
export function applySculptLayers(branches, layers, overrides = {}, suppressed = []) {
  return finishBuildSteps(applySculptLayerSteps(branches,layers,overrides,suppressed));
}
export function* applySculptLayerSteps(branches, layers, overrides = {}, suppressed = []) {
  for (const layer of layers) {
    if (!layer.enabled || !layer.strength) continue;
    if (layer.operation) {
      if(layer.operation.type==='DUPLICATE'){appendBranchDuplicate(branches,layer.operation,overrides,suppressed);yield {stage:'sculpt-layers'};continue;}
      const updated = evaluateShapeOperation(branches, layer.operation, layer.strength, overrides);
      for(let i=0;i<branches.length;i++){
        const b=branches[i],next=updated[i];
        if(next!==b&&(b.legacyRigidGeometry||b.copySnapshot)&&!['MOUNT','CONTROL_CURVE','UNIT_PLACEMENT'].includes(layer.operation.type)&&next.legacyRigidGeometry===b.legacyRigidGeometry)
          updated[i]={...next,legacyRigidGeometry:legacyGeometryForCurve(b,next)};
      }
      branches.forEach((b,i)=>{const points=updated[i].points;if(axisTimes(b.points)&&!axisTimes(points)&&points.length===b.points.length)withAxisTimes(points,axisTimes(b.points),b.points.axisCuts);});
      branches.forEach((b, i) => { b.points = updated[i].points; b.controlPoints = updated[i].controlPoints; b.sections = updated[i].sections; if (layer.operation.type === 'QUICK') b.length = updated[i].length; });
      branches.forEach((b,i) => { b.mountFrames = updated[i].mountFrames; b.radiusEdits = updated[i].radiusEdits; });
      if(layer.operation.type==='UNIT_PLACEMENT')branches.forEach((b,i)=>{
        if(updated[i]===b)return;
        for(const key of ['length','startRadius','endRadius','parentRadius','skeletonRadius','junction','mountMatrix','surfaceNormals','copiedLeaves','copiedOrgans','collarQuaternion','legacyRigidGeometry'])b[key]=updated[i][key];
        delete b.mountFrameBinding;
      });
      if (['ROOT_SCALE','POINT_ROTATE','POINT_SCALE','CONTROL_CURVE'].includes(layer.operation.type) || layer.operation.protect_units === true) branches.forEach((b,i) => {
        b.length = updated[i].length; b.mountMatrix = updated[i].mountMatrix; b.surfaceNormals = updated[i].surfaceNormals;
        if (layer.operation.protect_units === true) b.mountFrameBinding = updated[i].mountFrameBinding;
        if (updated[i].collarQuaternion) b.collarQuaternion = updated[i].collarQuaternion;
        if (updated[i].legacyRigidGeometry) b.legacyRigidGeometry = updated[i].legacyRigidGeometry;
        if(layer.operation.type==='CONTROL_CURVE'){b.controlDriven=updated[i].controlDriven;b.legacyRigidGeometry=updated[i].legacyRigidGeometry;}
      });
      if (layer.operation.type === 'MOUNT') branches.forEach((b,i) => {
        b.parentT = updated[i].parentT; b.mountMatrix = updated[i].mountMatrix; b.surfaceNormals = updated[i].surfaceNormals;
        b.parentId = updated[i].parentId; b.children = updated[i].children; b.order = updated[i].order;
        b.legacyRigidGeometry=updated[i].legacyRigidGeometry;b.mountFrameBinding=updated[i].mountFrameBinding;
      });
      branches.forEach((b,i)=>{b.legacyRigidGeometry=updated[i].legacyRigidGeometry;});
      yield {stage:'sculpt-layers'};continue;
    }
    const before = new Map(branches.map((branch) => [branch.id, cloneAxis(branch.points)]));
    const mountedBefore=new Map(branches.filter(b=>b.mountFrames?.length||b.mountMatrix||b.mountFrameBinding).map(b=>[b.id,{...b}]));
    const done = new Set(); const byId = new Map(branches.map((b) => [b.id, b]));
    function visit(branch) {
      if (done.has(branch.id)) return; done.add(branch.id);
      const parent = byId.get(branch.parentId); if (parent) visit(parent);
      const entry = layer.branches[branch.stableId];
      const valid = entry && entry.parent === (parent?.stableId || '');
      const legacyBefore=(branch.legacyRigidGeometry||branch.copySnapshot)?{...branch,points:before.get(branch.id)}:null;
      if (valid) {
        const delta = sampledVectors(entry.deltas,entry.sample_times); const knots = vectors(entry.knot_deltas?.length >= 2 ? entry.knot_deltas : entry.deltas);
        const oldPoints = branch.points; const oldKnots = branch.controlPoints;
        branch.points = cloneAxis(delta, (p, i) => sampleLine(oldPoints, axisTime(delta,i)).addScaledVector(p,layer.strength));
        if(axisTimes(branch.points))withAxisTimes(branch.points,axisTimes(branch.points),oldPoints.axisCuts);
        branch.controlPoints = knots.map((_, i) => sampleLine(oldKnots, i / (knots.length - 1)));
        branch.controlPoints.forEach((p, i) => p.addScaledVector(sampleLine(knots, i / (branch.controlPoints.length - 1)), layer.strength));
        branch.layerIds = [...(branch.layerIds || []), layer.id];
        if (entry.sections?.length) { const previous = branch.sections; branch.sections = entry.sections.map((s) => { const before = sectionAt(previous, s.t); return { t: s.t, ...Object.fromEntries(['radius', 'oval', 'roll'].map((key) => [key, THREE.MathUtils.lerp(before[key], s[key], layer.strength)])) }; }); }
      }
      if (!parent) {if(legacyBefore&&valid)branch.legacyRigidGeometry=legacyGeometryForCurve(legacyBefore,branch);if(valid&&mountedBefore.has(branch.id))Object.assign(branch,transportMountFrames(mountedBefore.get(branch.id),branch.points));return;}
      if (!valid && parent.points.length === before.get(parent.id).length && parent.points.every((p, i) => p.equals(before.get(parent.id)[i]))) return;
      const oldParent = before.get(parent.id); const origin = before.get(branch.id)[0];
      const oldAttach = sampleLine(oldParent, branch.parentT); const newAttach = sampleLine(parent.points, branch.parentT);
      const rotation = new THREE.Quaternion().setFromUnitVectors(lineTangent(oldParent, branch.parentT), lineTangent(parent.points, branch.parentT));
      const offset = origin.clone().sub(oldAttach).applyQuaternion(rotation);
      const target = newAttach.add(offset);
      if (valid) {
        target.addScaledVector(new THREE.Vector3(...(entry.root_offset || [0, 0, 0])), layer.strength);
        const correction = target.sub(branch.points[0]);
        [...branch.points, ...branch.controlPoints].forEach((p) => p.add(correction));
      } else {
        branch.points=cloneAxis(branch.points,p=>p.clone().sub(origin).applyQuaternion(rotation).add(target));
        branch.controlPoints=branch.controlPoints.map(p=>p.clone().sub(origin).applyQuaternion(rotation).add(target));
      }
      if(legacyBefore)branch.legacyRigidGeometry=entry?.sections?.length?undefined:legacyGeometryForCurve(legacyBefore,branch);
      if(mountedBefore.has(branch.id)){const m=valid?null:new THREE.Matrix4().makeRotationFromQuaternion(rotation);if(m)m.setPosition(target.clone().sub(origin.clone().applyQuaternion(rotation)));Object.assign(branch,transportMountFrames(mountedBefore.get(branch.id),branch.points,m));}
    }
    branches.forEach(visit);
    yield {stage:'sculpt-layers'};
  }
}

export function captureSculptLayer(layer, branches, overrides) {
  const byStable = new Map(branches.map((b) => [b.stableId, b]));
  const byId = new Map(branches.map((b) => [b.id, b]));
  const samplesFor = (override, branch) => {
    if (!override?.curve_knots?.length) return cloneAxis(branch.points);
    const knots = vectors(override.curve_knots);
    if (override.curve_samples && JSON.stringify(override.curve_reference_knots) === JSON.stringify(override.curve_knots)) return sampledVectors(override.curve_samples,override.curve_sample_times);
    return knots.length >= 3 ? new THREE.CatmullRomCurve3(knots, false, 'centripetal', 0.5).getPoints(branch.points.length - 1)
      : branch.points.map((_, i) => sampleLine(knots, i / (branch.points.length - 1)));
  };
  for (const [id, override] of Object.entries(overrides)) {
    const before = byStable.get(id);
    if (!before || !override.curve_knots || override.curve_knots.length < 2) continue;
    const samples = samplesFor(override, before);
    const changed = samples.some((p, i) => p.distanceTo(sampleLine(before.points, axisTime(samples,i))) > 1e-7)
      || override.curve_knots.some((p,i)=>new THREE.Vector3(...p).distanceTo(sampleLine(before.controlPoints,i/(override.curve_knots.length-1)))>1e-7);
    if (!changed) continue;
    const old = layer.branches[id];
    const delta = (target, source, previous, times) => {
      const oldDelta=previous?.length>=2?sampledVectors(previous,times):null;
      return target.map((p, i) => {
        const t = axisTime(target,i);
        return p.clone().sub(sampleLine(source,t)).add(oldDelta?sampleLine(oldDelta,t):new THREE.Vector3()).toArray();
      });
    };
    const parent = byId.get(before.parentId), rootOffset = new THREE.Vector3(...(old?.root_offset || [0, 0, 0]));
    if (parent) {
      const parentTarget = samplesFor(overrides[parent.stableId], parent);
      const rotation = new THREE.Quaternion().setFromUnitVectors(lineTangent(parent.points, before.parentT), lineTangent(parentTarget, before.parentT));
      const previousOffset = before.points[0].clone().sub(sampleLine(parent.points, before.parentT)).applyQuaternion(rotation);
      const nextOffset = samples[0].clone().sub(sampleLine(parentTarget, before.parentT));
      rootOffset.applyQuaternion(rotation).add(nextOffset.sub(previousOffset));
    }
    layer.branches[id] = { parent: parent?.stableId || '', root_offset: rootOffset.toArray(),
      ...(axisTimes(samples)?{sample_times:[...axisTimes(samples)]}:{}),
      deltas: delta(samples, before.points, old?.deltas,old?.sample_times), knot_deltas: delta(vectors(override.curve_knots), before.controlPoints, old?.knot_deltas) };
  }
}
