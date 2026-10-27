import {createTrunkSectionProfile,normalizeTrunkSectionProfile,normalizeDirectTrunkSectionProfile,createDirectTrunkSectionProfileSampler,stabilizeDirectTrunkSectionTangents} from './trunk-form.js';

export const TRUNK_MAIN_POINT_COUNT=10;
export const TRUNK_MAIN_POINT_LIMIT=32;
const rad=a=>a*Math.PI/180,wrap=a=>(a%360+360)%360;
const mainProfile=raw=>normalizeTrunkSectionProfile(raw,{points:TRUNK_MAIN_POINT_LIMIT,min:.001,max:64,tangents:true});

/** These are editing controls, not another mesh or another surface recipe.
 * The existing section.profile remains the resolved, exportable contour. */
export function trunkSectionMainPoints(section){
  const stored=mainProfile(section?.profile_coarse);if(stored)return stored;
  const sample=createDirectTrunkSectionProfileSampler(section?.profile);
  return createTrunkSectionProfile(TRUNK_MAIN_POINT_COUNT).map((p,i)=>({id:'MAIN_'+(i+1),angle:p.angle,radius:sample(rad(p.angle))}));
}

export function trunkSectionChildPoints(section){
  return normalizeDirectTrunkSectionProfile(section?.profile)||Array.from({length:64},(_,i)=>({id:'CHILD_'+(i+1),angle:i*360/64,radius:1}));
}

/** Preserve the fine displacement relative to the main curve. Angular edits
 * transport child points within the same periodic parent interval; identities
 * and local ordering survive crossing the 0/360 seam. Topology edits leave
 * child angles alone and only update their underlying main shape. */
export function rebaseTrunkSectionChildren(fine,before,after,{surfaceAt=()=>1,exclusions=[]}={}){
  const old=mainProfile(before),next=mainProfile(after),points=normalizeDirectTrunkSectionProfile(fine)||trunkSectionChildPoints();
  if(!old||!next)return points;
  if(JSON.stringify(old)===JSON.stringify(next))return points;
  const oldSample=createDirectTrunkSectionProfileSampler(old),nextSample=createDirectTrunkSectionProfileSampler(next),byId=new Map(next.map(p=>[p.id,p]));
  if(next.length>old.length&&next.every(p=>Number.isFinite(p.tangent))&&old.every(p=>{const q=byId.get(p.id);return q&&Math.abs(q.angle-p.angle)<1e-10&&q.radius===p.radius;})
    &&next.every(p=>Math.abs(nextSample(rad(p.angle))-oldSample(rad(p.angle)))<1e-11&&Math.abs(p.tangent-oldSample.derivative(rad(p.angle)))<1e-8))return points;
  const start=next.findIndex(p=>p.id===old[0].id),sameOrder=old.length===next.length&&start>=0&&old.every((p,i)=>next[(start+i)%next.length].id===p.id);
  const moved=sameOrder&&old.some(p=>Math.abs(((byId.get(p.id).angle-p.angle+540)%360)-180)>1e-9);
  const fineSample=createDirectTrunkSectionProfileSampler(points,{exclusions,surfaceAt}),back=angle=>{
    if(!moved)return angle;
    let i=next.findLastIndex(p=>p.angle<=angle);if(i<0)i=next.length-1;
    const a=next[i],b=next[(i+1)%next.length],u=wrap(angle-a.angle)/wrap(b.angle-a.angle);
    const oa=old.find(p=>p.id===a.id),ob=old.find(p=>p.id===b.id);return wrap(oa.angle+u*wrap(ob.angle-oa.angle));
  },rebasedAt=angle=>{const from=back(angle);return fineSample(rad(from))*nextSample(rad(angle))/Math.max(.001,oldSample(rad(from)))
    *(moved?surfaceAt(rad(from))/Math.max(.001,surfaceAt(rad(angle))):1);};
  const rebased=points.map(p=>{
    let angle=p.angle;
    if(moved){
      let i=old.findLastIndex(q=>q.angle<=p.angle);if(i<0)i=old.length-1;
      const a=old[i],b=old[(i+1)%old.length],u=wrap(p.angle-a.angle)/wrap(b.angle-a.angle),na=byId.get(a.id),nb=byId.get(b.id);
      angle=wrap(na.angle+u*wrap(nb.angle-na.angle));
    }
    const radius=p.radius*nextSample(rad(angle))/Math.max(.001,oldSample(rad(p.angle)))*(moved?surfaceAt(rad(p.angle))/Math.max(.001,surfaceAt(rad(angle))):1);
    const h=.0001,tangent=(rebasedAt(wrap(angle+h))-rebasedAt(wrap(angle-h)))/(2*rad(h));
    return {id:p.id,angle,radius,...(Number.isFinite(p.tangent)?{tangent}:{})};
  });
  if(rebased.some(p=>!Number.isFinite(p.radius)||p.radius<.001||p.radius>64))return null;
  const result=normalizeDirectTrunkSectionProfile(rebased);
  return result?.length===points.length?stabilizeDirectTrunkSectionTangents(result):null;
}

/** Persist main controls only on an actual edit. Browsing either layer never
 * rewrites an existing project. Fine edits retain the independent main set. */
export function editTrunkSectionLayer(section,points,{main=false,source=section,surfaceAt}={}){
  if(!Array.isArray(points)||points.length>(main?TRUNK_MAIN_POINT_LIMIT:128))return null;
  const coarse=trunkSectionMainPoints(source),fine=trunkSectionChildPoints(source);
  if(main){
    const next=mainProfile(points);if(!next)return null;
    const children=rebaseTrunkSectionChildren(fine,coarse,next,{surfaceAt,exclusions:source.profile_exclusions});
    if(!children)return null;
    const result={...section,profile_coarse:next,profile:children};
    if(source.profile_exclusions&&coarse.length===next.length){
      const byId=new Map(next.map(p=>[p.id,p])),forward=angle=>{let i=coarse.findLastIndex(p=>p.angle<=angle);if(i<0)i=coarse.length-1;const a=coarse[i],b=coarse[(i+1)%coarse.length],na=byId.get(a.id),nb=byId.get(b.id);return na&&nb?wrap(na.angle+wrap(angle-a.angle)/wrap(b.angle-a.angle)*wrap(nb.angle-na.angle)):angle;};
      result.profile_exclusions=source.profile_exclusions.map(p=>({...p,start:forward(p.start),end:forward(p.end)}));
    }return result;
  }
  const next=normalizeDirectTrunkSectionProfile(points);if(!next)return null;
  const result={...section,profile_coarse:coarse,profile:next};
  if(source.profile_exclusions&&fine.length===next.length&&fine.every(p=>next.some(q=>q.id===p.id))){
    const byId=new Map(next.map(p=>[p.id,p])),forward=angle=>{let i=fine.findLastIndex(p=>p.angle<=angle+1e-8);if(i<0)i=fine.length-1;const a=fine[i],b=fine[(i+1)%fine.length],na=byId.get(a.id),nb=byId.get(b.id);return wrap(na.angle+wrap(angle-a.angle)/wrap(b.angle-a.angle)*wrap(nb.angle-na.angle));};
    result.profile_exclusions=source.profile_exclusions.map(p=>({...p,start:forward(p.start),end:forward(p.end)}));
  }return result;
}

export function resetTrunkSectionLayer(section,{main=false}={}){
  const coarse=trunkSectionMainPoints(section);
  if(main)return editTrunkSectionLayer(section,coarse.map(p=>({...p,radius:1})),{main:true});
  const sample=createDirectTrunkSectionProfileSampler(coarse);
  const reset=editTrunkSectionLayer(section,stabilizeDirectTrunkSectionTangents(trunkSectionChildPoints(section).map(({join_tangent,...p})=>({...p,radius:sample(rad(p.angle)),...(Number.isFinite(p.tangent)?{tangent:sample.derivative(rad(p.angle))}:{})}))));
  if(reset.profile_exclusions)reset.profile_exclusions=reset.profile_exclusions.map(({join,...range})=>range);
  return reset;
}
