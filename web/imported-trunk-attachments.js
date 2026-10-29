import * as T from './vendor/three.module.min.js';
import {evaluateTrunkAnchor,normalizeTrunkAttachment,trunkCalibrationMatrix,pointOnTrunkGuide} from './imported-trunk-data.js';
import {sampleLine,lineTangent} from './tree-sculpt.js';
import {createTrunkPose,deformTrunkVertices} from './imported-trunk-binding.js';
import {branchMountAt,transportMountFrames} from './branch-mount-frame.js';
import {cloneAxis,tangentAxis} from './branch-axis.js';

function faceBasis(geometry,triangle,matrix){
  const p=triangle.map(i=>new T.Vector3().fromArray(geometry.position,i*3).applyMatrix4(matrix)),x=p[1].clone().sub(p[0]).normalize(),z=new T.Vector3().crossVectors(x,p[2].clone().sub(p[0])).normalize();
  if(x.lengthSq()<.5||z.lengthSq()<.5)throw Error('树干挂点所在三角面已经退化');
  return new T.Matrix4().makeBasis(x,new T.Vector3().crossVectors(z,x).normalize(),z);
}
export function evaluateTrunkAttachment(asset,mount,branches,raw,frame=null,posed=null){
  const anchor=normalizeTrunkAttachment(raw);if(anchor.mount_id!==mount.id)throw Error('树干挂点引用了不同的实例');
  if(anchor.origin==='AXIS'){
    const rest=evaluateTrunkAnchor(asset,anchor),id=anchor.guide_id||rest.guide.id,t=anchor.axis_t??rest.guide.t,guide=asset.guides.find(g=>g.id===id),parent=branches.find(b=>b.stableId===mount.guide_map[id]);if(!parent||!guide)throw Error('枝干的控制线来源缺失');
    const position=sampleLine(parent.points,t),reference=pointOnTrunkGuide(guide.points,t).tangent,basis=branchMountAt(parent,t),rotation=basis?new T.Quaternion().setFromRotationMatrix(new T.Matrix4().extractRotation(basis)):new T.Quaternion(...(parent.trunkQuaternion||[0,0,0,1]));rotation.premultiply(new T.Quaternion().setFromUnitVectors(reference.clone().applyQuaternion(rotation).normalize(),lineTangent(parent.points,t))).normalize();
    const normal=rest.normal.clone().applyQuaternion(rotation).normalize();return {position,direction:normal.clone(),normal,rotation,guide:{id,t,point:position.clone()},rest,anchor_position:position.clone(),anchor};
  }
  const model=asset.primitives.find(p=>p.id===anchor.primitive_id);if(!model)throw Error('树干挂点网格已经缺失');
  const rest=evaluateTrunkAnchor(asset,anchor),result=posed||{pose:createTrunkPose(asset,mount,branches)},geometry=result.primitives?.get(anchor.primitive_id)||{index:model.geometry.index,position:Object.create(null)},currentGuides=asset.guides.map(g=>({...g,points:branches.find(b=>b.stableId===mount.guide_map[g.id])?.points}));
  if(!result.primitives)deformTrunkVertices(result.pose,anchor.primitive_id,anchor.triangle).forEach((p,n)=>p.toArray(geometry.position,anchor.triangle[n]*3));
  const current=evaluateTrunkAnchor(asset,anchor,{geometry,matrix:new T.Matrix4(),guides:currentGuides});
  const rotation=new T.Quaternion().setFromRotationMatrix(faceBasis(geometry,anchor.triangle,new T.Matrix4()).multiply(faceBasis(model.geometry,anchor.triangle,trunkCalibrationMatrix(asset.calibration)).invert())).normalize();
  const direction=(frame?.direction?new T.Vector3(...frame.direction):rest.normal.clone()).applyQuaternion(rotation).normalize();
  const offset=frame?.position?new T.Vector3(...frame.position).sub(rest.position).applyQuaternion(rotation):new T.Vector3();
  return {position:current.position.clone().add(offset),direction,normal:current.normal,rotation,guide:current.guide,rest,anchor_position:current.position,anchor};
}
export function trunkInstanceSurfaceFrame(instance,parent){
  if(!instance.trunk_anchor)return null;
  let surface=parent?.trunkAttachments?.get(instance.id);
  if(!surface||JSON.stringify(surface.anchor)!==JSON.stringify(normalizeTrunkAttachment(instance.trunk_anchor)))surface=parent?.trunkAttachmentEvaluator?.(instance.trunk_anchor);
  if(!surface)return null;
  const position=surface.anchor_position.clone(),direction=new T.Vector3(...(instance.frame?.direction||surface.rest.normal.toArray()));
  if(instance.frame?.position)position.add(new T.Vector3(...instance.frame.position).sub(surface.rest.position).applyQuaternion(surface.rotation));
  return {...surface,position,direction:direction.applyQuaternion(surface.rotation).normalize()};
}
export function trunkInstanceWorldMatrix(instance,parent){
  const surface=trunkInstanceSurfaceFrame(instance,parent);if(!surface)return null;
  return new T.Matrix4().makeRotationFromQuaternion(surface.rotation).setPosition(surface.anchor_position.clone().sub(surface.rest.position.clone().applyQuaternion(surface.rotation)));
}
// Evaluated anchors live only on the runtime graph. Saving preserves the fixed
// triangle reference and artist frame, never a second copy of posed geometry.
export function resolveTrunkAttachmentFrames(authoring,branches){
  const data=authoring.imported_trunks;if(!data)return;
  const byId=new Map(branches.map(b=>[b.stableId,b])),poses=new Map(),updates=[];
  for(const mount of data.mounts){const asset=data.assets.find(a=>a.id===mount.asset_id);for(const id of Object.values(mount.guide_map)){const parent=byId.get(id);if(!parent)continue;parent.trunkAttachmentEvaluator=anchor=>{if(!poses.has(mount.id))poses.set(mount.id,{pose:createTrunkPose(asset,mount,branches)});return evaluateTrunkAttachment(asset,mount,branches,anchor,null,poses.get(mount.id));};}}
  for(const instance of authoring.branch_instances||[]){
    if(!instance.trunk_anchor)continue;
    const mount=data.mounts.find(m=>m.id===instance.trunk_anchor.mount_id),asset=data.assets.find(a=>a.id===mount?.asset_id);
    if(!mount||!asset)throw Error('完整单元枝的树干挂接来源缺失：'+instance.id);
    if(!Object.values(mount.guide_map).includes(instance.parent))throw Error('完整单元枝的挂接骨架已改变，请重新挂接：'+instance.id);
    if(!poses.has(mount.id))poses.set(mount.id,{pose:createTrunkPose(asset,mount,branches)});
    const frame=evaluateTrunkAttachment(asset,mount,branches,instance.trunk_anchor,instance.frame,poses.get(mount.id)),parent=byId.get(instance.parent);
    if(!parent)throw Error('完整单元枝的挂接控制枝缺失');
    updates.push({parent,id:instance.id,frame});
  }
  for(const {parent,id,frame}of updates)(parent.trunkAttachments||=new Map()).set(id,frame);
}
export function captureTrunkCarrierMotion(authoring,branches){
 if(!authoring.imported_trunks)return null;
 const hosts=new Set(authoring.imported_trunks.mounts.flatMap(m=>Object.values(m.guide_map))),signature=()=>JSON.stringify(branches.filter(b=>hosts.has(b.stableId)).map(b=>[b.stableId,b.points.map(p=>p.toArray()),b.startRadius,b.endRadius]));
 const families=new Map(),byId=new Map(branches.map(b=>[b.id,b]));for(const root of branches.filter(b=>b.trunkCarrierAnchor)){const members=[],queue=[root.id];while(queue.length){const b=byId.get(queue.shift());if(!b)continue;members.push({...b});queue.push(...b.children);}families.set(root.stableId,members);}return {signature:signature(),current:signature,families,frames:new Map(branches.filter(b=>b.trunkCarrierApplied).map(b=>[b.stableId,(branchMountAt(b,0)||new T.Matrix4()).clone()]))};
}
export function followTrunkCarrierMotion(branches,before){
 if(!before||before.signature===before.current())return;
 const byId=new Map(branches.map(b=>[b.id,b]));for(const branch of branches){const previous=before.frames.get(branch.stableId);if(!previous||!branch.trunkCarrierApplied)continue;const motion=(branchMountAt(branch,0)||new T.Matrix4()).clone().multiply(previous.clone().invert());for(const old of before.families.get(branch.stableId)||[]){const current=byId.get(old.id);if(!current||old.points.length!==current.points.length||!old.points.every((p,i)=>p.clone().applyMatrix4(motion).distanceToSquared(current.points[i])<1e-12))continue;current.legacyRigidGeometry={baseline:old.legacyRigidGeometry?.baseline||old,matrix:motion.clone().multiply(old.legacyRigidGeometry?.matrix||new T.Matrix4())};current.trunkCarrierRigid=true;}branch.trunkCarrierApplied.premultiply(motion);}
}
export function resolveTrunkCarrierFrames(authoring,branches){
 const data=authoring.imported_trunks;if(!data)return;const poses=new Map(),byId=new Map(branches.map(b=>[b.id,b]));
 for(const root of branches.filter(b=>b.trunkCarrierAnchor)){
  const mount=data.mounts.find(m=>m.id===root.trunkCarrierAnchor.mount_id),asset=data.assets.find(a=>a.id===mount?.asset_id);if(!asset||!mount)throw Error('预制枝干的树干素材来源缺失');
  const parent=byId.get(root.parentId);if(!Object.values(mount.guide_map).includes(parent?.stableId))continue;
  if(root.trunkCarrierAnchor.origin!=='AXIS'&&!poses.has(mount.id))poses.set(mount.id,{pose:createTrunkPose(asset,mount,branches)});const frame=evaluateTrunkAttachment(asset,mount,branches,root.trunkCarrierAnchor,null,poses.get(mount.id));if(root.trunkCarrierAnchor.origin==='AXIS'&&root.trunkCarrierAxisOffset)frame.rotation.multiply(root.trunkCarrierAxisOffset);const desired=new T.Matrix4().makeRotationFromQuaternion(frame.rotation).setPosition(frame.position),delta=desired.clone().multiply(root.trunkCarrierApplied.clone().invert()),queue=[root.id],visited=new Set();
  delta.setPosition(new T.Vector3().setFromMatrixPosition(delta).add(frame.position).sub(root.points[0].clone().applyMatrix4(delta)));
  const rotation=new T.Quaternion().setFromRotationMatrix(delta),collars=new Map(branches.filter(b=>b.parentId>=0).map(b=>[b.id,b.collarQuaternion?.clone()||new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),tangentAxis(byId.get(b.parentId).points,.7))]));
  while(queue.length){const id=queue.shift(),b=byId.get(id);if(!b||visited.has(id))continue;visited.add(id);const old={...b},points=cloneAxis(b.points,p=>p.clone().applyMatrix4(delta)),frames=transportMountFrames(old,points,delta);b.points=points;b.controlPoints=b.controlPoints.map(p=>p.clone().applyMatrix4(delta));if(frames)Object.assign(b,frames);if(collars.has(id))b.collarQuaternion=rotation.clone().multiply(collars.get(id));const prior=old.legacyRigidGeometry;b.legacyRigidGeometry={baseline:prior?.baseline||old,matrix:delta.clone().multiply(prior?.matrix||new T.Matrix4())};b.trunkCarrierRigid=true;if(b.surfaceNormals)b.surfaceNormals=b.surfaceNormals.map(p=>p.clone().transformDirection(delta));queue.push(...b.children);}
  root.trunkCarrierApplied=desired;
 }
}
