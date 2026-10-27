import {TRUNK_DETAIL_DEFAULTS} from './trunk-details.js';

/** Next-stroke recipe only. Never transport an existing placement or path.
 * Physical dimensions are measured at the source, then solved at the new hit. */
export function captureTrunkDetailRecipe(detail,metric){
  if(!detail||!TRUNK_DETAIL_DEFAULTS[detail.type])return null;
  const recipe={strength:detail.strength,width:detail.width,height:detail.height,seed:detail.seed,...(detail.profile?{profile:structuredClone(detail.profile)}:{})},sizes={};
  for(const field of ['width','height']){const value=metric?.measure(detail,field);if(Number.isFinite(value)&&value>0)sizes[field]=value;}
  return {type:detail.type,tool:detail.path?.length>1?'PATH':'POINT',recipe,sizes};
}
