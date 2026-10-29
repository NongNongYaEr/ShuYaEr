import * as THREE from 'three';
import { descendants } from './branch-selection.js';
import { sampleLine } from './tree-sculpt.js';
import { projectedMountParameter, slideMountParameter, mountDistanceAt } from './branch-mount-drag.js';
import { cloneAxis } from './branch-axis.js';
import {pickImportedTrunkAttachment,pickImportedTrunkCarrier} from './imported-trunk-picker.js';
import {evaluateTrunkAttachment} from './imported-trunk-attachments.js';

// Attachment parameters remain polyline parameters, matching existing PVE data.
export function createBranchCarrierSlide(branches, root, {camera, modelRoot, bounds, excludeSubtree=true,asset=null,authoring=null}) {
  const parent=branches.find(b=>b.id===root.parentId), family=excludeSubtree?descendants(branches,new Set([root.stableId])):new Set();
  if(!parent)return null;
  const projection=camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse).multiply(modelRoot.matrixWorld);
  const project=p=>{const v=new THREE.Vector4(p.x,p.y,p.z,1).applyMatrix4(projection);return {x:bounds.left+(v.x/v.w+1)*bounds.width/2,y:bounds.top+(1-v.y/v.w)*bounds.height/2,z:v.z/v.w,w:v.w};};
  const anchor=project(root.trunkCarrierAnchor?root.points[0]:sampleLine(parent.points,root.parentT));
  // Local subdivisions have explicit parameter times. Screen picking must keep
  // them so its attachment is sampled at the same visible location afterwards.
  const carriers=branches.filter(b=>!family.has(b.stableId)&&!b.unitOwner&&!b.instanceId&&!b.symmetryGroup&&b.points.length>1).map(b=>({b,path:cloneAxis(b.points,project)}));
  let carrier=parent;
  const ray=new THREE.Raycaster(),meshes=[];if(asset&&authoring)asset.group.traverse(o=>{if(o.isMesh&&o.visible&&o.userData.imported_trunk)meshes.push(o);});
  const originalInstance=authoring?.branch_instances?.find(i=>i.id===root.instanceId),anchorBinding=originalInstance?.trunk_anchor||root.trunkCarrierAnchor;
  function numericSurface(distance){const data=authoring.imported_trunks,mount=data.mounts.find(m=>m.id===anchorBinding.mount_id),model=data.assets.find(a=>a.id===mount?.asset_id);if(!model||!mount)return null;const frame=evaluateTrunkAttachment(model,mount,branches,anchorBinding,originalInstance?.frame),attach=slideMountParameter(parent.points,root.parentT,distance),point=frame.position.clone().add(sampleLine(parent.points,attach)).sub(sampleLine(parent.points,root.parentT)),normal=frame.normal.clone().transformDirection(modelRoot.matrixWorld),world=point.clone().applyMatrix4(modelRoot.matrixWorld),span=Math.max(.1,new THREE.Box3().setFromObject(asset.group).getSize(new THREE.Vector3()).length());ray.set(world.clone().addScaledVector(normal,span),normal.clone().negate());const hits=ray.intersectObjects(meshes,false).sort((a,b)=>a.point.distanceToSquared(world)-b.point.distanceToSquared(world));for(const hit of hits){const target=pickImportedTrunkAttachment(asset,authoring,hit);if(target?.parent===parent.stableId&&target.trunk_anchor.mount_id===anchorBinding.mount_id)return {...target,parent,distance};}return null;}
  return ({start,pointer,numeric=''})=>{
    const n=numeric.trim()&&Number.isFinite(Number(numeric))?Number(numeric):null;
    const dx=pointer.x-start.x,dy=pointer.y-start.y;
    if(n!==null&&anchorBinding?.origin==='AXIS'){const attach=slideMountParameter(parent.points,root.parentT,n);return Math.abs(attach-root.parentT)>1e-10?{parent,attach,trunk_anchor:{...anchorBinding,axis_t:attach},distance:n}:{parent,attach:root.parentT,distance:0,blocked:true};}
    if(n!==null&&anchorBinding&&meshes.length)return Math.abs(n)>1e-10?numericSurface(n)||{parent,attach:root.parentT,distance:0,blocked:true}:{parent,attach:root.parentT,distance:0,blocked:true};
    if(n!==null||Math.hypot(dx,dy)<2){carrier=parent;return {parent,attach:n===null?root.parentT:slideMountParameter(parent.points,root.parentT,n)};}
    const x=anchor.x+dx,y=anchor.y+dy;
    if(meshes.length){ray.setFromCamera(new THREE.Vector2((x-bounds.left)/bounds.width*2-1,1-(y-bounds.top)/bounds.height*2),camera);const hit=ray.intersectObjects(meshes,false)[0];if(hit){const target=(root.instanceId||root.unitOwner?pickImportedTrunkAttachment:pickImportedTrunkCarrier)(asset,authoring,hit),branch=branches.find(b=>b.stableId===target?.parent);if(branch)return {...target,parent:branch,distance:0};}}
    const candidates=carriers.map(({b,path})=>{const attach=projectedMountParameter(path,x,y,b===parent?root.parentT:.5),p=project(sampleLine(b.points,attach));return {parent:b,attach,gap:p.w>0&&Math.abs(p.z)<=1?Math.hypot(p.x-x,p.y-y):Infinity};});
    let chosen=candidates.find(c=>c.parent===carrier)||candidates.find(c=>c.parent===parent);
    const nearest=candidates.reduce((a,b)=>b.gap<a.gap?b:a,chosen);
    if(nearest.gap<=16&&nearest.gap+4<chosen.gap)chosen=nearest;
    if(anchorBinding&&authoring.imported_trunks.mounts.some(m=>Object.values(m.guide_map).includes(chosen.parent.stableId)))return {parent,attach:root.parentT,distance:0,blocked:true};
    carrier=chosen.parent;
    return {...chosen,distance:mountDistanceAt(carrier.points,chosen.attach)-(carrier===parent?mountDistanceAt(parent.points,root.parentT):0)};
  };
}
