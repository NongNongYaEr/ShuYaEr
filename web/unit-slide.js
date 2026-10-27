import * as THREE from 'three';
import { projectedMountParameter } from './branch-mount-drag.js';
import { unitBranchT, unitFrame, nearestUnitT } from './unit-authoring.js';

// Keep the original local orientation/size; only the attachment travels.
// Sampling the visible carrier prevents free-space movement and preserves bends.
export function createUnitSlide(branch, record, { camera, modelRoot, bounds, branches = [branch] }) {
  const lengths = branch.points.slice(1).map((p, i) => p.distanceTo(branch.points[i]));
  const total = lengths.reduce((sum, value) => sum + value, 0);
  const projection = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse).multiply(modelRoot.matrixWorld);
  const project = p => {
    const v = new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(projection);
    return { x: bounds.left + (v.x / v.w + 1) * bounds.width / 2, y: bounds.top + (1 - v.y / v.w) * bounds.height / 2, z: v.z / v.w, w: v.w };
  };
  const origin=unitFrame(branch,record.t).position,anchor=project(origin);
  const carriers=branches.filter(b=>!b.unitOwner&&!b.instanceId&&b.points?.length>1).map(b=>{
    const lens=b.points.slice(1).map((p,i)=>p.distanceTo(b.points[i])),length=lens.reduce((a,b)=>a+b,0);
    const initial=b.stableId===branch.stableId?record.t:nearestUnitT(b,origin);
    return {branch:b,lengths:lens,total:length,path:b.points.map(project),initial,previous:unitBranchT(b,initial)};
  });
  let carrier=branch.stableId;
  function candidate(info,x,y){
    const parameter=projectedMountParameter(info.path,x,y,info.previous)*info.lengths.length,index=Math.min(info.lengths.length-1,Math.floor(parameter));
    const distance=info.lengths.slice(0,index).reduce((a,b)=>a+b,0)+info.lengths[index]*(parameter-index),t=THREE.MathUtils.clamp(distance/Math.max(info.total,1e-12),0,1);
    const position=project(unitFrame(info.branch,t).position);
    return {info,t,gap:position.w>0&&position.z>=-1&&position.z<=1?Math.hypot(position.x-x,position.y-y):Infinity};
  }
  return ({ start, pointer, point, numeric = '' }) => {
    const number = numeric.trim() && Number.isFinite(Number(numeric)) ? Number(numeric) : null;
    const target=point?project(point):{x:anchor.x+pointer.x-start.x,y:anchor.y+pointer.y-start.y};
    const dx=target.x-anchor.x,dy=target.y-anchor.y;
    if (total < 1e-10 || (number === null ? Math.hypot(dx, dy) < .01 : number === 0)) {carrier=branch.stableId;return { record, distance: 0, changed: false };}
    let chosen;
    if(number!==null){carrier=branch.stableId;chosen={info:carriers.find(c=>c.branch.stableId===branch.stableId),t:THREE.MathUtils.clamp(record.t+number/total,0,1)};}
    else {
      const candidates=carriers.map(info=>candidate(info,target.x,target.y));
      chosen=candidates.find(c=>c.info.branch.stableId===carrier)||candidates.find(c=>c.info.branch.stableId===branch.stableId);
      // A small capture zone plus hysteresis prevents branch crossings from flickering.
      const nearest=candidates.reduce((best,c)=>c.gap<best.gap?c:best,chosen);
      if(nearest.gap<=14&&nearest.gap+4<chosen.gap)chosen=nearest;
      carrier=chosen.info.branch.stableId;
    }
    const t=chosen.t,parent=chosen.info.branch.stableId;
    const changed=parent!==record.parent||Math.abs(t-record.t)>1e-10||record.offset.some(v=>Math.abs(v)>1e-10);
    return {record:changed?{...record,parent,t,offset:[0,0,0]}:record,distance:(t-chosen.info.initial)*chosen.info.total,changed};
  };
}
