import * as THREE from 'three';
import { descendants } from './branch-selection.js';
import { sampleLine } from './tree-sculpt.js';
import { projectedMountParameter, slideMountParameter, mountDistanceAt } from './branch-mount-drag.js';
import { cloneAxis } from './branch-axis.js';

// Attachment parameters remain polyline parameters, matching existing PVE data.
export function createBranchCarrierSlide(branches, root, {camera, modelRoot, bounds, excludeSubtree=true}) {
  const parent=branches.find(b=>b.id===root.parentId), family=excludeSubtree?descendants(branches,new Set([root.stableId])):new Set();
  if(!parent)return null;
  const projection=camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse).multiply(modelRoot.matrixWorld);
  const project=p=>{const v=new THREE.Vector4(p.x,p.y,p.z,1).applyMatrix4(projection);return {x:bounds.left+(v.x/v.w+1)*bounds.width/2,y:bounds.top+(1-v.y/v.w)*bounds.height/2,z:v.z/v.w,w:v.w};};
  const anchor=project(sampleLine(parent.points,root.parentT));
  // Local subdivisions have explicit parameter times. Screen picking must keep
  // them so its attachment is sampled at the same visible location afterwards.
  const carriers=branches.filter(b=>!family.has(b.stableId)&&!b.unitOwner&&!b.instanceId&&!b.symmetryGroup&&b.points.length>1).map(b=>({b,path:cloneAxis(b.points,project)}));
  let carrier=parent;
  return ({start,pointer,numeric=''})=>{
    const n=numeric.trim()&&Number.isFinite(Number(numeric))?Number(numeric):null;
    const dx=pointer.x-start.x,dy=pointer.y-start.y;
    if(n!==null||Math.hypot(dx,dy)<2){carrier=parent;return {parent,attach:n===null?root.parentT:slideMountParameter(parent.points,root.parentT,n)};}
    const x=anchor.x+dx,y=anchor.y+dy;
    const candidates=carriers.map(({b,path})=>{const attach=projectedMountParameter(path,x,y,b===parent?root.parentT:.5),p=project(sampleLine(b.points,attach));return {parent:b,attach,gap:p.w>0&&Math.abs(p.z)<=1?Math.hypot(p.x-x,p.y-y):Infinity};});
    let chosen=candidates.find(c=>c.parent===carrier)||candidates.find(c=>c.parent===parent);
    const nearest=candidates.reduce((a,b)=>b.gap<a.gap?b:a,chosen);
    if(nearest.gap<=16&&nearest.gap+4<chosen.gap)chosen=nearest;
    carrier=chosen.parent;
    return {...chosen,distance:mountDistanceAt(carrier.points,chosen.attach)-(carrier===parent?mountDistanceAt(parent.points,root.parentT):0)};
  };
}
