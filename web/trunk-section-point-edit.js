import {normalizeDirectTrunkSectionProfile,normalizeTrunkSectionProfile,refineDirectTrunkSectionProfile,sampleTrunkSectionProfile,updateDirectTrunkSectionTangents} from './trunk-form.js';

const wrap=angle=>(angle%360+360)%360;
const distance=(a,b)=>Math.abs(((a-b+540)%360+360)%360-180);
const normal=(profile,direct)=>direct?normalizeDirectTrunkSectionProfile(profile):normalizeTrunkSectionProfile(profile);

/** A new knot lies on the existing periodic contour. Existing knots, IDs and
 * positions are retained; only the local interpolation gains a control. */
export function insertTrunkSectionPoint(profile,angle,id,{direct=true,...options}={}){
  const points=normal(profile,direct);if(!points||points.length>=(direct?128:32)||!Number.isFinite(angle)||!id||points.some(p=>p.id===id))return null;
  angle=wrap(angle);if(points.some(p=>distance(p.angle,angle)<.2))return null;
 if(direct)return refineDirectTrunkSectionProfile(points,[{id,angle}],options);
  const radius=sampleTrunkSectionProfile(points,angle*Math.PI/180);
  return normal([...points,{id,angle,radius}],false);
}
export function insertTrunkSectionPointAfter(profile,selected,id,options){
  const points=normal(profile,options?.direct!==false),i=points?.findIndex(p=>p.id===selected)??-1;if(i<0)return null;
  const a=points[i].angle,b=points[(i+1)%points.length].angle;
  return insertTrunkSectionPoint(points,a+((b-a+360)%360)/2,id,options);
}
export function removeTrunkSectionPoint(profile,id,options){
 return removeTrunkSectionPoints(profile,[id],options);
}
export function removeTrunkSectionPoints(profile,ids,{direct=true,...options}={}){
  const points=normal(profile,direct);if(!points||points.length<=3)return null;
  const selected=new Set(ids);
  if(!selected.size||[...selected].some(id=>!points.some(p=>p.id===id))||points.length-selected.size<3)return null;
 const next=points.filter(p=>!selected.has(p.id));
 return direct?updateDirectTrunkSectionTangents(next,points,options):next;
}
