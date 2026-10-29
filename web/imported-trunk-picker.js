import * as T from './vendor/three.module.min.js';
import {trunkSurfaceAnchor,evaluateTrunkAnchor,pointOnTrunkGuide,trunkCalibrationMatrix,normalizeTrunkAttachment} from './imported-trunk-data.js';
import {carrierTrunkAnchor} from './imported-trunk-data.js';
import {evaluateTrunkAttachment} from './imported-trunk-attachments.js';
import {nearestParameter,sampleLine,lineTangent} from './tree-sculpt.js';
export function pickImportedTrunkAttachment(asset,authoring,intersection){
 const mesh=intersection?.object;if(!mesh?.userData.imported_trunk)return null;
 const data=authoring.imported_trunks,mount=data?.mounts.find(m=>m.id===mesh.userData.trunk_mount_id),model=data?.assets.find(a=>a.id===mount?.asset_id);if(!mount||!model)throw Error('树干表面缺少固定素材来源');
 const face=intersection.faceIndex;if(!Number.isInteger(face))return null;const g=mesh.geometry,indices=[0,1,2].map(i=>g.index.getX(face*3+i)),vertices=indices.map(i=>new T.Vector3().fromBufferAttribute(g.attributes.position,i)),point=mesh.worldToLocal(intersection.point.clone()),bary=T.Triangle.getBarycoord(point,...vertices,new T.Vector3());if(!bary)return null;
 const weights=bary.toArray().map(v=>T.MathUtils.clamp(v,0,1)),sum=weights.reduce((a,b)=>a+b,0);if(sum<.5)return null;weights.forEach((v,i)=>weights[i]=v/sum);
 const raw=trunkSurfaceAnchor(model,mesh.userData.trunk_primitive_id,face,weights,{offset:-.003}),rest=evaluateTrunkAnchor(model,raw),anchor={...raw,mount_id:mount.id,guide_id:rest.guide.id},sourceGuide=model.guides.find(g=>g.id===rest.guide.id),parent=pointOnTrunkGuide(sourceGuide.points,rest.guide.t),frame={position:rest.position.toArray(),direction:rest.normal.toArray(),parent_tangent:parent.tangent.toArray(),parent_position:parent.position.toArray()};
 // Picking already provides the displayed triangle. Evaluate only its three
 // vertices, rather than skinning a high-resolution trunk on every mouse move.
 const local=vertices.map(v=>asset.group.worldToLocal(mesh.localToWorld(v.clone()))),normal=new T.Vector3().crossVectors(local[1].clone().sub(local[0]),local[2].clone().sub(local[0])).normalize(),position=new T.Vector3();local.forEach((v,i)=>position.addScaledVector(v,weights[i]));position.addScaledVector(normal,raw.offset_m);
 const basis=points=>{const x=points[1].clone().sub(points[0]).normalize(),z=new T.Vector3().crossVectors(x,points[2].clone().sub(points[0])).normalize();return new T.Matrix4().makeBasis(x,new T.Vector3().crossVectors(z,x),z);},primitive=model.primitives.find(p=>p.id===raw.primitive_id),matrix=trunkCalibrationMatrix(model.calibration),restVertices=raw.triangle.map(i=>new T.Vector3().fromArray(primitive.geometry.position,i*3).applyMatrix4(matrix)),rotation=new T.Quaternion().setFromRotationMatrix(basis(local).multiply(basis(restVertices).invert())).normalize();
 return {parent:mount.guide_map[rest.guide.id],attach:rest.guide.t,trunk_anchor:anchor,frame,surface_frame:{position,direction:normal},surface_binding:{anchor_position:position,rotation,rest,anchor:normalizeTrunkAttachment(anchor)}};
}
export function pickImportedTrunkCarrier(asset,authoring,intersection){
 const hit=pickImportedTrunkAttachment(asset,authoring,intersection);if(!hit)return null;const parent=asset.masterBranches.find(b=>b.stableId===hit.parent),t=nearestParameter(parent.points,hit.surface_frame.position),anchor=carrierTrunkAnchor({...hit.trunk_anchor,axis_t:t},t),mount=authoring.imported_trunks.mounts.find(m=>m.id===anchor.mount_id),model=authoring.imported_trunks.assets.find(a=>a.id===mount.asset_id),frame=evaluateTrunkAttachment(model,mount,asset.masterBranches,anchor);
 return {...hit,attach:t,trunk_anchor:anchor,frame:{...hit.frame,parent_position:sampleLine(parent.points,t).toArray(),parent_tangent:lineTangent(parent.points,t).toArray()},surface_frame:{position:frame.position,direction:frame.normal},surface_binding:{anchor_position:frame.position,rotation:frame.rotation,rest:frame.rest,anchor}};
}
