// Runtime parameter locations for locally inserted carrier segments. JSON still
// stores the authored operation; PVE already supports an explicit t per point.
export const axisTimes=points=>points?.axisTimes||null;
export function normalizeAxisTimes(times,count){
  return Array.isArray(times)&&count>=2&&times.length===count&&times[0]===0&&times.at(-1)===1
    &&times.every((t,i)=>Number.isFinite(t)&&(!i||t>times[i-1]))?[...times]:null;
}
// Repeated projections can differ by a few ulps. They refer to one section,
// not two rings with a nearly zero-length strip between them.
export function uniqueAxisTimes(values){
  const result=[];for(const t of [...values].sort((a,b)=>a-b)){
    if(!result.length||t-result.at(-1)>1e-7)result.push(t);
    else if(t===1)result[result.length-1]=1;
  }return result;
}
export const axisTime=(points,i)=>axisTimes(points)?.[i]??i/(points.length-1);
export function axisSegment(points,t){
  const times=axisTimes(points),value=Math.max(0,Math.min(1,t));
  if(!times){const scaled=value*(points.length-1),index=Math.min(points.length-2,Math.floor(scaled));return {index,u:scaled-index};}
  let low=0,high=times.length-1;
  while(low<high){const mid=(low+high+1)>>1;if(times[mid]<=value)low=mid;else high=mid-1;}
  const index=Math.min(times.length-2,low);return {index,u:(value-times[index])/Math.max(1e-15,times[index+1]-times[index])};
}
export function withAxisTimes(points,times,cuts=[],deformation){
  Object.defineProperties(points,{axisTimes:{value:[...times],configurable:true},axisCuts:{value:uniqueAxisTimes(cuts),configurable:true},axisDeformation:{value:deformation,configurable:true}});return points;
}
export function cloneAxis(points,map){
  const result=points.map(map||((p)=>p.clone()));return axisTimes(points)?withAxisTimes(result,axisTimes(points),points.axisCuts,map?undefined:points.axisDeformation):result;
}
export function sampleAxis(points,t){const {index,u}=axisSegment(points,t);return points[index].clone().lerp(points[index+1],u);}
export function tangentAxis(points,t){const {index}=axisSegment(points,t),v=points[index+1].clone().sub(points[index]);return v.lengthSq()>1e-12?v.normalize():points[0].clone().set(0,0,1);}
export function nearestAxis(points,p){
  let distance=Infinity,parameter=0;
  for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],x=b.x-a.x,y=b.y-a.y,z=b.z-a.z,u=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y+(p.z-a.z)*z)/Math.max(1e-12,x*x+y*y+z*z))),dx=a.x+x*u-p.x,dy=a.y+y*u-p.y,dz=a.z+z*u-p.z,d=dx*dx+dy*dy+dz*dz;if(d<distance){distance=d;parameter=axisTime(points,i)+(axisTime(points,i+1)-axisTime(points,i))*u;}}
  return parameter;
}
