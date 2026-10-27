import * as THREE from './vendor/three.module.min.js';
import {axisTime,axisSegment,withAxisTimes,sampleAxis,nearestAxis} from './branch-axis.js';
import {mountDistanceAt,slideMountParameter} from './branch-mount-drag.js';

// Split at the actual anchor, then finish the bend within the nearest control
// spacing. Parameters retain their meaning for radii, mounts and PVE delivery.
export function pointCornerPlan(branch,index,rotation,strength=1){
  const before=branch.points,knots=branch.controlPoints,t=nearestAxis(before,knots[index]),start=mountDistanceAt(before,t);
  const left=mountDistanceAt(before,nearestAxis(before,knots[index-1])),right=mountDistanceAt(before,nearestAxis(before,knots[index+1]));
  const width=Math.max(1e-9,Math.min(start-left,right-start,mountDistanceAt(before,1)-start));
  const end=slideMountParameter(before,t,width),cuts=[...(before.axisCuts||[]),...knots.map(p=>nearestAxis(before,p)),t,end,...Array.from({length:5},(_,i)=>slideMountParameter(before,t,width*(i+1)/6))];
  const times=[...before.map((_,i)=>axisTime(before,i)),...cuts].sort((a,b)=>a-b).filter((v,i,a)=>!i||v-a[i-1]>1e-10);
  const points=withAxisTimes([sampleAxis(before,times[0])],times,cuts),frames=[],q=new THREE.Quaternion(...rotation).normalize();
  for(let i=0;i<times.length-1;i++){
    const a=sampleAxis(before,times[i]),b=sampleAxis(before,times[i+1]);
    if(times[i+1]<=t+1e-12){points.push(b);frames.push(new THREE.Matrix4());continue;}
    const distance=(mountDistanceAt(before,times[i])+mountDistanceAt(before,times[i+1]))*.5-start,u=Math.max(0,Math.min(1,distance/width));
    const turn=new THREE.Quaternion().slerp(q,u*u*(3-2*u)*strength),matrix=new THREE.Matrix4().makeTranslation(...points[i].toArray()).multiply(new THREE.Matrix4().makeRotationFromQuaternion(turn)).multiply(new THREE.Matrix4().makeTranslation(...a.clone().negate().toArray()));
    points.push(points[i].clone().add(b.sub(a).applyQuaternion(turn)));frames.push(matrix);
  }
  const indexAt=t=>axisSegment(points,t).index,at=t=>frames[indexAt(t)];
  const distances=[0];for(let i=1;i<before.length;i++)distances.push(distances.at(-1)+before[i].distanceTo(before[i-1]));
  const turnAt=value=>{const {index,u}=axisSegment(before,value),d=distances[index]+(distances[index+1]-distances[index])*u,x=Math.max(0,Math.min(1,(d-start)/width));return new THREE.Quaternion().slerp(q,x*x*(3-2*x)*strength);};
  withAxisTimes(points,times,cuts,{source:before,turnAt,turnDescriptor:{distances,start,width,rotation:q.toArray(),strength},start:Math.min(t,before.axisDeformation?.start??t)});
  return {points,frames,at,indexAt,controlPoints:knots.map((p,i)=>i<=index?p.clone():p.clone().applyMatrix4(at(nearestAxis(before,p)))),fixed:times.findIndex(v=>Math.abs(v-t)<1e-9),start:t,end,width};
}
