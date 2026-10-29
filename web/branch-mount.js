import * as THREE from './vendor/three.module.min.js';
import { descendants } from './branch-selection.js';
import { sampleLine, lineTangent } from './tree-sculpt.js';
import { cloneAxis } from './branch-axis.js';
import {transformLegacyRigidGeometry} from './legacy-unit-placement.js';
import {transportMountFrames} from './branch-mount-frame.js';
import {evaluateTrunkAttachment} from './imported-trunk-attachments.js';
import {projectTrunkSlide} from './imported-trunk-slide.js';
import {carrierTrunkAnchor} from './imported-trunk-data.js';

// A rigid edit in the existing layer stack. No sample geometry or material is copied.
export function branchMountTransform(branches, op, strength = 1) {
  const root = branches.find(b => b.stableId === op.root);
  const parent = branches.find(b => b.id === root?.parentId);
  if (!root || !parent || parent.stableId !== op.parent || root.unitOwner || root.instanceId) return null;
  const ids = descendants(branches, new Set([root.stableId]));
  const carrier = op.target_parent ? branches.find(b=>b.stableId===op.target_parent) : parent;
  if(!carrier||ids.has(carrier.stableId))return null;
  const sourceT = root.parentT, targetT = op.root_rotation ? sourceT : THREE.MathUtils.lerp(sourceT, op.attach, strength);
  const tangent = lineTangent(parent.points, sourceT);
  const frame = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...op.parent_tangent).normalize(), tangent);
  const rotation = frame.clone().multiply(new THREE.Quaternion(...op.rotation)).multiply(frame.clone().invert()).normalize();
  rotation.slerp(new THREE.Quaternion(), 1 - strength);
  const surfaceMove=!op.root_rotation&&carrier.importedTrunkSource&&(root.trunkCarrierAnchor||op.trunk_anchor);
  const source = op.root_rotation||root.trunkCarrierAnchor||surfaceMove ? root.points[0].clone() : sampleLine(parent.points, sourceT);
  let target = op.root_rotation ? source.clone() : sampleLine(carrier.points, targetT),anchor=null,surfaceFrame=null;
  if(surfaceMove){const {asset,mount}=carrier.importedTrunkSource;anchor=strength===1&&op.trunk_anchor?carrierTrunkAnchor(op.trunk_anchor,targetT):root.trunkCarrierAnchor?.origin==='AXIS'&&root.trunkCarrierAnchor.mount_id===mount.id?{...root.trunkCarrierAnchor,axis_t:targetT,guide_id:Object.keys(mount.guide_map).find(id=>mount.guide_map[id]===carrier.stableId)}:carrier===parent&&Math.abs(targetT-sourceT)<1e-10?root.trunkCarrierAnchor:carrierTrunkAnchor(projectTrunkSlide(branches,root,parent,carrier,targetT),targetT);surfaceFrame=evaluateTrunkAttachment(asset,mount,branches,anchor);if(anchor.origin==='AXIS'&&root.trunkCarrierAxisOffset)surfaceFrame.rotation.multiply(root.trunkCarrierAxisOffset);target=surfaceFrame.position;}
  const matrix = new THREE.Matrix4().makeTranslation(...target.toArray())
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation))
    .multiply(new THREE.Matrix4().makeTranslation(...source.clone().negate().toArray()));
  return {root,parent,carrier,ids,matrix,rotation,targetT:surfaceFrame?.guide.t??targetT,anchor,surfaceFrame};
}
export function evaluateBranchMount(branches,op,strength=1){
  const motion=branchMountTransform(branches,op,strength);if(!motion)return branches;const {root,parent,carrier,ids,matrix,rotation,targetT,anchor,surfaceFrame}=motion;
  return branches.map(b => {if(!ids.has(b.stableId))return carrier!==parent && (b===parent||b===carrier) ? {...b,children:b===parent?b.children.filter(id=>id!==root.id):[...new Set([...b.children,root.id])]} : b;
    const points=cloneAxis(b.points,p => p.clone().applyMatrix4(matrix));return { ...b,
    points,
    controlPoints: b.controlPoints.map(p => p.clone().applyMatrix4(matrix)),
    surfaceNormals: b.surfaceNormals?.map(p => p.clone().applyQuaternion(rotation)) || null,
    parentT: b === root ? targetT : b.parentT,
    parentId: b === root ? carrier.id : b.parentId,
    order: Math.min(3,Math.max(0,b.order + carrier.order - parent.order)),
    mountMatrix: matrix.clone().multiply(b.mountMatrix || new THREE.Matrix4()),
    mountFrames: b.mountFrames?.map(f => matrix.clone().multiply(f)),
    mountFrameBinding: undefined,...transportMountFrames({...b},points,matrix),
    ...((root.trunkCarrierAnchor||b.collarQuaternion)&&b.parentId>=0?{collarQuaternion:rotation.clone().multiply(b.collarQuaternion||new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),lineTangent(branches.find(p=>p.id===b.parentId).points,.7)))}:{}),
    ...(b===root&&surfaceFrame?{trunkCarrierAnchor:anchor,trunkCarrierApplied:new THREE.Matrix4().makeRotationFromQuaternion(surfaceFrame.rotation).setPosition(surfaceFrame.position)}:b===root&&root.trunkCarrierAnchor&&carrier!==parent&&!carrier.importedTrunkHost?{trunkCarrierAnchor:undefined,trunkCarrierApplied:undefined}:{}),
    ...(b.legacyRigidGeometry||b.copySnapshot?{legacyRigidGeometry:transformLegacyRigidGeometry(b,matrix,branches.find(p=>p.id===b.parentId))}:{}),
  };});
}

// Store a full quaternion so all three rotation axes survive save/reload.
// A separate rigid layer keeps later position/angle edits from discarding roll.
export function makeMountRotationOperation(branches, root, delta, previous, merge = null) {
  const parent = branches.find(b => b.id === root.parentId);
  const tangent = lineTangent(parent.points,root.parentT);
  const reference = merge?.parent_tangent || tangent.toArray();
  const frame = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...reference).normalize(),tangent);
  const rotation = frame.clone().invert().multiply(delta).multiply(frame);
  if (merge) rotation.multiply(new THREE.Quaternion(...merge.rotation));
  return {type:'MOUNT',root_rotation:true,root:root.stableId,parent:parent.stableId,targets:[root.stableId],
    attach:root.parentT,source_attach:root.parentT,azimuth:previous.azimuth,elevation:previous.elevation,
    rotation:rotation.normalize().toArray(),parent_tangent:reference};
}

export function makeMountOperation(branches, root, values, previous, merge) {
  const parent = branches.find(b => b.id === root.parentId);
  const carrier = values.target_parent ? branches.find(b=>b.stableId===values.target_parent) : parent;
  const source_attach = merge?.source_attach ?? root.parentT;
  const from = lineTangent(parent.points, source_attach), to = lineTangent(carrier.points, values.attach);
  const parent_tangent = merge?.parent_tangent || from.toArray();
  const reference_direction = merge?.reference_direction || root.points.at(-1).clone().sub(root.points[0]).normalize().toArray();
  const base_azimuth = merge?.base_azimuth ?? previous.azimuth, base_elevation = merge?.base_elevation ?? previous.elevation;
  const frame = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...parent_tangent).normalize(),from);
  const transport = new THREE.Quaternion().setFromUnitVectors(from, to);
  const radial = new THREE.Vector3(...reference_direction).applyQuaternion(frame).applyQuaternion(transport);
  let hinge = new THREE.Vector3().crossVectors(to, radial).normalize();
  if (hinge.lengthSq() < 1e-8) hinge = new THREE.Vector3().crossVectors(to, Math.abs(to.x) < .9 ? new THREE.Vector3(1,0,0) : new THREE.Vector3(0,1,0)).normalize();
  const yaw = new THREE.Quaternion().setFromAxisAngle(to, THREE.MathUtils.degToRad(values.azimuth - base_azimuth));
  const bend = new THREE.Quaternion().setFromAxisAngle(hinge.applyQuaternion(yaw), THREE.MathUtils.degToRad(values.elevation - base_elevation));
  const world = bend.multiply(yaw).multiply(transport);
  const rotation = frame.clone().invert().multiply(world).multiply(frame);
  const operation={ type: 'MOUNT', targets: [root.stableId], root: root.stableId, parent: parent.stableId,
    ...values, source_attach, reference_direction, base_azimuth, base_elevation,
    rotation: rotation.normalize().toArray(), parent_tangent };
  if(operation.trunk_anchor)operation.trunk_anchor=carrierTrunkAnchor(operation.trunk_anchor,values.attach);
  else if(carrier.importedTrunkSource&&root.trunkCarrierAnchor){const mount=carrier.importedTrunkSource.mount;operation.trunk_anchor=root.trunkCarrierAnchor.origin==='AXIS'&&root.trunkCarrierAnchor.mount_id===mount.id?{...root.trunkCarrierAnchor,axis_t:values.attach,guide_id:Object.keys(mount.guide_map).find(id=>mount.guide_map[id]===carrier.stableId)}:carrier===parent&&Math.abs(values.attach-root.parentT)<1e-10?root.trunkCarrierAnchor:carrierTrunkAnchor(projectTrunkSlide(branches,root,parent,carrier,values.attach),values.attach);}
  return operation;
}

// Remove only the preceding mount from a preview snapshot when replacing it.
export function mountPreviewBase(branches, root, previous) {
  if (!previous) return branches;
  const parent = branches.find(b => b.id === root.parentId);
  const tangent = lineTangent(parent.points,previous.source_attach);
  const frame = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...previous.parent_tangent).normalize(),tangent);
  const q = frame.clone().multiply(new THREE.Quaternion(...previous.rotation)).multiply(frame.invert());
  const a = sampleLine(parent.points,previous.source_attach), b = sampleLine(parent.points,previous.attach);
  const inverse = new THREE.Matrix4().makeTranslation(...a.toArray()).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q.invert())).multiply(new THREE.Matrix4().makeTranslation(...b.negate().toArray()));
  const ids = descendants(branches,new Set([root.stableId]));
  return branches.map(item => {if(!ids.has(item.stableId))return item;const points=cloneAxis(item.points,p=>p.clone().applyMatrix4(inverse));return {...item,
    parentT: item.stableId === root.stableId ? previous.source_attach : item.parentT,
    points,controlPoints:item.controlPoints.map(p=>p.clone().applyMatrix4(inverse)),
    mountMatrix:inverse.clone().multiply(item.mountMatrix||new THREE.Matrix4()),...transportMountFrames({...item},points,inverse),
    ...(item.legacyRigidGeometry||item.copySnapshot?{legacyRigidGeometry:transformLegacyRigidGeometry(item,inverse)}:{})};});
}
