export const WIND_PRESETS=Object.freeze({
 BREEZE:{name:'微风',strength:.25,gust:.2,turbulence:.15,trunk:.2,branch:.45,unit:.2},
 NATURAL:{name:'自然风',strength:.5,gust:.45,turbulence:.3,trunk:.35,branch:.65,unit:.35},
 STRONG:{name:'强风',strength:.85,gust:.7,turbulence:.45,trunk:.5,branch:.8,unit:.5},
});
const finite=(v,d)=>Number.isFinite(Number(v))?Number(v):d,clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export function normalizeWindPreview(raw={}){
 const number=(k,d,a=0,b=1)=>clamp(finite(raw[k],d),a,b);
 return {preset:WIND_PRESETS[raw.preset]?raw.preset:'NATURAL',strength:number('strength',.5),direction:((finite(raw.direction,0)%360)+360)%360,
  gust:number('gust',.45),turbulence:number('turbulence',.3),trunk:number('trunk',.35),branch:number('branch',.65),unit:number('unit',.35),speed:number('speed',1,.25,2),seed:Math.trunc(number('seed',1,0,2147483646)),showDirection:raw.showDirection!==false};
}
