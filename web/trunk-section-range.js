import {trunkSectionContext} from './trunk-section-reference.js';

export const TRUNK_RANGE_DEFAULTS=Object.freeze({radiusPercent:0,twist:0,strength:100,falloff:'SMOOTH',lockRoot:true,lockTip:true});
const near=(a,b)=>Math.abs(a-b)<1e-10;

export function trunkSectionRange(sections,selection={},options=TRUNK_RANGE_DEFAULTS){
  const items=trunkSectionContext(sections,'').items,start=items.find(s=>s.id===selection.startId),end=items.find(s=>s.id===selection.endId);
  const empty=reason=>({valid:false,reason,members:[],affected:[],weights:[],shadowed:[]});
  if(!start||!end)return empty('先明确选择靠根起圈和靠梢止圈');
  if(end.t-start.t<1e-10)return empty('起圈须在止圈的靠根侧，且位置不同');
  const members=items.filter(s=>(s.t>start.t||near(s.t,start.t))&&(s.t<end.t||near(s.t,end.t))),effective=[];
  for(const s of members){if(effective.length&&near(effective.at(-1).t,s.t))effective[effective.length-1]=s;else effective.push(s);}
  const active=new Set(effective.map(s=>s.id)),strength=Number(options.strength)/100;
  if(!Number.isFinite(strength)||strength<0||strength>1||!['SMOOTH','UNIFORM'].includes(options.falloff))return empty('影响强度须为 0–100%，并选择有效衰减方式');
  const weights=members.map(s=>{const locked=Boolean(options.lockRoot&&near(s.t,start.t)||options.lockTip&&near(s.t,end.t)),shadowed=!active.has(s.id),u=Math.max(0,Math.min(1,(s.t-start.t)/(end.t-start.t))),smooth=v=>v*v*(3-2*v),falloff=options.falloff!=='SMOOTH'?1:options.lockRoot&&options.lockTip?Math.sin(Math.PI*u)**2:options.lockRoot?smooth(u):options.lockTip?smooth(1-u):1,weight=locked||shadowed?0:strength*falloff;return{id:s.id,t:s.t,weight:weight<1e-12?0:weight,locked,shadowed};});
  return {valid:true,reason:'',start,end,members:members.map(s=>s.id),weights,affected:weights.filter(w=>w.weight>0).map(w=>w.id),shadowed:weights.filter(w=>w.shadowed).map(w=>w.id)};
}

// Recompute from a fixed gesture snapshot: changing a field never compounds
// another preview. Only existing radius/roll fields are authored on confirmation.
export function applyTrunkSectionRange(form,selection,options){
  const range=trunkSectionRange(form?.sections,selection,options),radius=Number(options?.radiusPercent),twist=Number(options?.twist);
  if(!range.valid)return {...range,form:null,changed:[],limited:[]};
  if(!Number.isFinite(radius)||radius< -80||radius>100||!Number.isFinite(twist)||twist< -90||twist>90)return {...range,valid:false,reason:'粗细增量须为 -80–100%，扭转增量须为 -90–90°',form:null,changed:[],limited:[]};
  const next=structuredClone(form),weights=new Map(range.weights.map(w=>[w.id,w.weight])),changed=[],limited=[];
  for(const section of next.sections){
    const weight=weights.get(section.id)||0;if(!weight)continue;
    const wanted=section.radius*(1+radius/100*weight),nextRadius=Math.max(.2,Math.min(3,wanted));
    const wantedRoll=section.roll+twist*weight,nextRoll=Math.max(-180,Math.min(180,wantedRoll));
    if(Math.abs(nextRadius-wanted)>1e-12||Math.abs(nextRoll-wantedRoll)>1e-12)limited.push(section.id);
    if(nextRadius===section.radius&&nextRoll===section.roll)continue;
    section.radius=nextRadius;section.roll=nextRoll;delete section.contour_capture;delete section.capture_error;changed.push(section.id);
  }
  return {...range,form:next,changed,limited};
}
