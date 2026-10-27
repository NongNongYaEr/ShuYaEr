import {trunkSectionMainPoints,trunkSectionChildPoints,editTrunkSectionLayer} from './trunk-section-layers.js';
import {createTrunkSectionProfile,normalizeTrunkSectionProfile,normalizeDirectTrunkSectionProfile} from './trunk-form.js';

/** Copy only shape controls. Position, ring dimensions and independent surface
 * recipes always belong to the destination. The clipboard is session UI data. */
export function captureTrunkContour(section,{direct=true,main=true}={}){
  if(!section)return null;
  if(!direct)return {direct:false,scope:'BASE',main:(section.profile||createTrunkSectionProfile(8)).map(p=>({...p}))};
  return {direct:true,scope:main?'BASE':'FINAL',main:trunkSectionMainPoints(section),...(!main?{fine:trunkSectionChildPoints(section),...(section.profile_exclusions?{exclusions:structuredClone(section.profile_exclusions)}:{})}:{})};
}
export function pasteTrunkContour(section,shape,{direct=true,idFor=(kind,index)=>kind+'_'+index}={}){
  if(!section||!shape||shape.direct!==direct||!Array.isArray(shape.main)||shape.main.length<3||shape.main.length>32)return null;
  if(direct&&shape.scope!=='BASE'&&(shape.scope!=='FINAL'||!Array.isArray(shape.fine)||shape.fine.length<3||shape.fine.length>128))return null;
  const copy=(points,kind)=>points?.map((p,i)=>({...p,id:idFor(kind,i)}));
  if(!direct){const profile=normalizeTrunkSectionProfile(copy(shape.main,'COPY'));return profile?.length===shape.main?.length?{...section,profile}:null;}
  const coarse=normalizeTrunkSectionProfile(copy(shape.main,'MAIN'),{points:32,min:.001,max:64,tangents:true});if(coarse?.length!==shape.main?.length)return null;
  if(shape.scope==='BASE')return editTrunkSectionLayer(section,coarse,{main:true});
  const fine=normalizeDirectTrunkSectionProfile(copy(shape.fine,'CHILD'));if(fine?.length!==shape.fine?.length)return null;
  const next={...section,profile_coarse:coarse,profile:fine};delete next.profile_exclusions;if(shape.exclusions)next.profile_exclusions=structuredClone(shape.exclusions);return next;
}
