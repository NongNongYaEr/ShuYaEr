import {createDirectTrunkSectionProfileSampler,refineDirectTrunkSectionProfile,updateDirectTrunkSectionTangents,updateTrunkSectionJoinTangents} from './trunk-form.js';
import {trunkSectionChildPoints} from './trunk-section-layers.js';
import {trunkFoldFeatures} from './trunk-fold-points.js';

const rad=a=>a*Math.PI/180,wrap=a=>(a%360+360)%360;
const distance=(a,b)=>Math.abs((a-b+540)%360-180);
const excluded=(angle,ranges)=>ranges.some(p=>wrap(angle-p.start)>1e-6&&wrap(angle-p.start)<wrap(p.end-p.start)-1e-6);

/** Display handles are an exact subdivision of the existing curve. Merely
 * entering/focusing this layer never authors a topology or geometry change. */
export function createTrunkChildEditLayer(section,{surfaceAt=()=>1,count=64,densify=false,anchors=[]}={}){
 const source=trunkSectionChildPoints(section),ranges=section.profile_exclusions||[],options={surfaceAt,exclusions:ranges},sample=createDirectTrunkSectionProfileSampler(source,options),points=source.map(p=>({...p}));
  const features=trunkFoldFeatures(a=>sample(a)*surfaceAt(a)),ids=new Set(points.map(p=>p.id));
  function add(angle,prefix,identity){
    if(points.length>=128||excluded(angle,ranges)||points.some(p=>distance(p.angle,angle)<=.5))return false;
    let id=identity||prefix+'_'+Math.round(angle*10000);if(identity&&ids.has(id))return false;while(ids.has(id))id+='_N';ids.add(id);
    points.push({id,angle});points.sort((a,b)=>a.angle-b.angle);return true;
  }
  // Selected display-only handles keep their angle and identity while the
  // whole circle slides. This remains UI subdivision, never a hidden edit.
  for(const p of anchors)if(p?.id&&Number.isFinite(p.angle))add(p.angle,'ANCHOR',p.id);
  for(const f of [...features].sort((a,b)=>b.prominence-a.prominence))add(f.angle,'FOLD_'+f.kind);
  if(densify||!source.some(p=>Number.isFinite(p.tangent))){
    const target=Math.max(32,Math.min(128,count));
    while(points.length<target){
      const gaps=points.map((p,i)=>({angle:wrap(p.angle+wrap(points[(i+1)%points.length].angle-p.angle)/2),width:wrap(points[(i+1)%points.length].angle-p.angle)}))
        .filter(p=>p.width>1&&!excluded(p.angle,ranges)).sort((a,b)=>b.width-a.width);
      if(!gaps.length||!add(gaps[0].angle,'CHILD'))break;
    }
  }
 const extras=points.filter(p=>!source.some(q=>q.id===p.id)),profile=refineDirectTrunkSectionProfile(source,extras,options);
  return {profile,originalCount:source.length,added:extras.length,featureCount:features.length,
    unmatched:features.filter(f=>!excluded(f.angle,ranges)&&!profile.some(p=>distance(p.angle,f.angle)<=.5)).length};
}

/** Suppress the deleted arc as an editing choice, so automatic preparation
 * cannot resurrect it on another layer, after undo/redo or after reload. */
export function excludeRemovedTrunkChildren(section,before,after){
 const remaining=new Set(after.map(p=>p.id)),removed=before.filter(p=>!remaining.has(p.id)),ranges=section.profile_exclusions||[],result=[];
 for(const [i,p] of after.entries()){
  const end=after[(i+1)%after.length].angle,width=wrap(end-p.angle),middle=wrap(p.angle+width/2),inside=a=>wrap(a-p.angle)>1e-6&&wrap(a-p.angle)<width-1e-6;
  const deleted=removed.some(q=>inside(q.angle)),old=ranges.filter(r=>excluded(middle,[r]));
  if(deleted||old.length)result.push({start:p.angle,end,...(deleted||old.some(r=>r.join==='SMOOTH')?{join:'SMOOTH'}:{})});
 }return result;
}

/** Upgrade only on an explicit repair action; loading old exclusions remains
 * read-only and preserves their previous geometry. */
export function reconnectRemovedTrunkChildren(section,{surfaceAt=()=>1}={}){
 const ranges=section.profile_exclusions||[],points=trunkSectionChildPoints(section),ids=new Set();
 for(const range of ranges.filter(r=>r.join!=='SMOOTH'))for(const p of points)if(distance(p.angle,range.start)<1e-5||distance(p.angle,range.end)<1e-5)ids.add(p.id);
 if(!ids.size)return null;
 const exclusions=ranges.map(r=>({...r,join:'SMOOTH'}));
 return {...section,profile:updateTrunkSectionJoinTangents(updateDirectTrunkSectionTangents(points,points,{changedIds:[...ids]}),points,{surfaceAt,exclusions,changedIds:[...ids]}),profile_exclusions:exclusions};
}
