import { createTrunkDetail, normalizeTrunkDetails } from './trunk-details.js';
import { applyTrunkDetailPreset } from './trunk-detail-presets.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), wrap=v=>(v%360+360)%360;
const signed=(a,b)=>((b-a+540)%360)-180;

/** Move the entire group once; retain paths, identities and unselected layers. */
export function transformTrunkDetailSelection(details, ids, { t=0, angle=0, scale=1 }={}) {
  const chosen=details.filter(d=>ids.has(d.id));
  if(!chosen.length)return structuredClone(details);
  const ts=chosen.flatMap(d=>[d.t,...d.path.map(p=>p.t)]);
  const low=Math.min(...ts),high=Math.max(...ts),centreT=(low+high)/2,reference=chosen[0].angle;
  const angles=chosen.flatMap(d=>[d.angle,...d.path.map(p=>p.angle)]).map(a=>signed(reference,a));
  const centreAngle=reference+(Math.min(...angles)+Math.max(...angles))/2;
  const requested=Number.isFinite(scale)&&scale>0?scale:1;
  const factor=Math.min(requested,centreT>low?centreT/(centreT-low):Infinity,high>centreT?(1-centreT)/(high-centreT):Infinity);
  const scaledTs=ts.map(value=>centreT+(value-centreT)*factor),move=clamp(Number.isFinite(t)?t:0,-Math.min(...scaledTs),1-Math.max(...scaledTs));
  const placement=p=>({...p,t:centreT+(p.t-centreT)*factor+move,angle:wrap(centreAngle+signed(centreAngle,p.angle)*factor+(Number.isFinite(angle)?angle:0))});
  return normalizeTrunkDetails(details.map(d=>ids.has(d.id)?{...placement(d),width:d.width*factor,height:d.height*factor,path:d.path.map(placement)}:d));
}

/** Stable IDs throughout one placement preview; preserve spacing near ends. */
export function placeTrunkDetailPreset(shape, position, ids) {
  let index=0;
  const items=applyTrunkDetailPreset(shape,{t:.5,angle:position.angle,idFactory:()=>ids[index++]});
  return transformTrunkDetailSelection(items,new Set(ids),{t:position.t-.5});
}

/** Redrawing a stroke changes only its authored surface placement and path. */
export function redrawTrunkDetail(detail, position) {
  return createTrunkDetail(detail.type,{...structuredClone(detail),...position,path:[]});
}

/** A point drag owns exactly one path sample; preserve neighbours and pressure.
 * Reject a coincident neighbour rather than silently merging authored nodes. */
export function moveTrunkDetailPathPoint(detail,index,position) {
  if(!Number.isInteger(index)||index<0||index>=detail?.path?.length||![position?.t,position?.angle].every(Number.isFinite))return null;
  const point={...detail.path[index],t:clamp(position.t,0,1),angle:wrap(position.angle)};
  if([detail.path[index-1],detail.path[index+1]].some(p=>p&&Math.abs(p.t-point.t)<1e-8&&Math.abs(signed(p.angle,point.angle))<1e-8))return null;
  const result=structuredClone(detail);result.path[index]=point;
  if(index===0){result.t=point.t;result.angle=point.angle;}
  return result;
}
