import {normalizeDirectTrunkSectionProfile,createDirectTrunkSectionProfileSampler,trunkFormRadialScale,trunkSectionEllipseRadius} from './trunk-form.js';
import {createTrunkDetailSampler} from './trunk-details.js';
const TAU=Math.PI*2,rad=a=>a*Math.PI/180;
export const WHOLE_CONTOUR_LIMIT=128;

/** A radial pull on the resolved surface. Neighbours receive a smooth,
 * periodic falloff; the original base recipe supplies effect compensation. */
export function pullWholeTrunkContour(profile,{angle,delta,radiusAt,reach=18,single=false}={}){
  if(!Number.isFinite(angle)||!Number.isFinite(delta)||typeof radiusAt!=='function')return structuredClone(profile);
  return profile.map(p=>{
    const distance=Math.abs(((p.angle-angle+540)%360+360)%360-180);
    const weight=single?(distance<1e-8?1:0):distance<reach?(1+Math.cos(distance/reach*Math.PI))/2:0;
    if(!weight||!delta)return {...p};
    const surface=radiusAt(rad(p.angle));if(!Number.isFinite(surface)||surface<=0)return {...p};
    return {...p,radius:Math.max(.001,Math.min(64,p.radius*(surface+delta*weight)/surface))};
  });
}

/** The base contour still owns authoring. FINAL editing projects its control
 * points onto the resolved surface and compensates for the existing effects. */
export function wholeTrunkContourKnots(section,count=64){
  const source=section?.profile||[],sample=createDirectTrunkSectionProfileSampler(source);
  count=Math.max(32,Math.min(128,Math.round(count)));
  const angles=[...new Set([...source.map(p=>p.angle),...Array.from({length:count},(_,i)=>i*360/count)])].sort((a,b)=>a-b);
  // Existing knots are always retained, even on an already complex contour.
  while(angles.length>128){let at=-1,gap=Infinity;for(let i=0;i<angles.length;i++){if(source.some(p=>Math.abs(p.angle-angles[i])<1e-8))continue;const width=(angles[(i+1)%angles.length]-angles[(i+angles.length-1)%angles.length]+360)%360;if(width<gap){gap=width;at=i;}}if(at<0)break;angles.splice(at,1);}
  const ids=new Set(source.map(p=>p.id));
  return normalizeDirectTrunkSectionProfile(angles.map((angle,i)=>{const old=source.find(p=>Math.abs(p.angle-angle)<1e-8);let id=old?.id||'WHOLE_'+i;if(!old){while(ids.has(id))id+='_N';ids.add(id);}return{id,angle,radius:sample(rad(angle))};}));
}
export function wholeTrunkSurfaceSampler(form,section,settings={}){
  const detail=createTrunkDetailSampler(form.details),offset=rad((settings.twist||0)+(settings.section_roll||0))*section.t;
  return angle=>trunkFormRadialScale(form,section.t,angle)*detail(section.t,angle-offset);
}
function captureField(field,initial=[]){
  const candidates=Array.from({length:2048},(_,i)=>i*360/2048);
  const samples=candidates.map(a=>field(rad(a))),extrema=candidates.filter((_,i)=>{
    const a=samples[(i+samples.length-1)%samples.length],b=samples[i],c=samples[(i+1)%samples.length];
    return b>a&&b>=c||b<a&&b<=c;
  });
  // Reuse must fit a new quotient, so a fully sampled source preset cannot
  // consume the entire destination budget before error refinement begins.
  let angles=[...new Set([...(initial.length<=64?initial:[]),...extrema,...Array.from({length:32},(_,i)=>i*360/32)])].sort((a,b)=>a-b);
  if(angles.length>128)angles=Array.from({length:128},(_,i)=>i*360/128);
  let profile,error=0,redistributed=0,best=null;
  while(true){profile=normalizeDirectTrunkSectionProfile(angles.map((angle,i)=>({id:'WHOLE_'+i,angle,radius:field(rad(angle))})));const sample=createDirectTrunkSectionProfileSampler(profile);let worst=null;error=0;
    for(let i=0;i<candidates.length;i++){const angle=candidates[i],expected=samples[i],relative=Math.abs(sample(rad(angle))-expected)/Math.max(.001,expected);if(relative>error){error=relative;worst=angle;}}
    if(!best||error<best.relative_error)best={profile,relative_error:error};
    if(error<=.005||worst===null||angles.some(a=>Math.abs(a-worst)<1e-8))break;
    if(angles.length>=128){
      if(error<=.009||redistributed++>=16)break;
      // Trade a redundant knot for the largest unresolved error. This keeps
      // the same point budget when source and destination grooves differ.
      let remove=-1,cost=Infinity;
      for(let i=0;i<angles.length;i++){
        const reduced=createDirectTrunkSectionProfileSampler(profile.filter((_,j)=>j!==i));
        const a=angles[(i+angles.length-1)%angles.length],b=angles[i],c=angles[(i+1)%angles.length];
        const probes=[b,(a+((b-a+360)%360)/2)%360,(b+((c-b+360)%360)/2)%360];
        let local=0;for(const angle of probes){const expected=field(rad(angle));local=Math.max(local,Math.abs(reduced(rad(angle))-expected)/Math.max(.001,expected));}
        if(local<cost){cost=local;remove=i;}
      }
      if(remove<0||cost>=error*.85)break;angles.splice(remove,1);
    }
    angles.push(worst);angles.sort((a,b)=>a-b);
  }
  return best;
}
export function captureWholeTrunkContour(form,section,settings={},options={}){
  const surface=wholeTrunkSurfaceSampler(form,section,settings),base=createDirectTrunkSectionProfileSampler(section.profile,{exclusions:section.profile_exclusions,surfaceAt:options.surfaceAt|| (a=>surface(a)*trunkSectionEllipseRadius(section.oval,a))});
  const result=captureField(a=>base(a)*surface(a),(section.profile||[]).map(p=>p.angle));
  return{shape:{geometry_version:2,profile_scope:'FINAL',radius:section.radius,oval:section.oval,roll:section.roll,profile:result.profile,
    ...(section.profile_exclusions?{profile_exclusions:section.profile_exclusions.map(({join,...range})=>range)}:{}),
    ...(section.profile_coarse?{profile_coarse:section.profile_coarse.map(p=>({...p,radius:p.radius*surface(rad(p.angle))}))}:{})},relative_error:result.relative_error};
}
export function applyWholeTrunkContour(form,section,shape,settings={}){
  const desired=createDirectTrunkSectionProfileSampler(shape.profile),surface=wholeTrunkSurfaceSampler(form,section,settings);
  const result=captureField(a=>desired(a)/Math.max(.001,surface(a)),(shape.profile||[]).map(p=>p.angle));
  if(shape.profile_coarse)result.profile_coarse=shape.profile_coarse.map(p=>({...p,radius:p.radius/Math.max(.001,surface(rad(p.angle)))}));
  return result;
}
export const WHOLE_TRUNK_CONTOUR_PRESETS=Object.freeze([
  {id:'builtin-whole-shallow',name:'整圈 · 浅褶',count:8,depth:.18},
  {id:'builtin-whole-deep',name:'整圈 · 深窄褶',count:10,depth:.46},
  {id:'builtin-whole-irregular',name:'整圈 · 不规则褶',count:7,depth:.32,irregular:true},
].map(item=>({id:item.id,name:item.name,shape:{geometry_version:2,profile_scope:'FINAL',radius:1,oval:1,roll:0,
  profile:Array.from({length:96},(_,i)=>{const angle=i*360/96,a=rad(angle),warp=item.irregular ? .09*Math.sin(a*3):0;
    return{id:'WHOLE_'+i,angle,radius:1-item.depth*Math.pow(Math.max(0,Math.cos((a+warp)*item.count)),2)+(item.irregular ? .14*Math.sin(a*2):0)};})}})));
