// Source-space height ranges: independent of UV layout and material recipe.
// These are height bands, not inferred roots, trunk or branch anatomy.
export function validateScope(scope){
  if(scope==null)return null;
  if(scope.kind!=='height'||![scope.min,scope.max,scope.feather].every(Number.isFinite)||scope.min<0||scope.max>1||scope.min>=scope.max||scope.feather<0||scope.feather>.25)throw Error('图层高度范围无效。');
  return{kind:'height',min:scope.min,max:scope.max,feather:scope.feather};
}
export function scopeWeight(scope,height){
  if(!scope)return 1;
  if(height<scope.min||height>scope.max)return 0;
  const fade=distance=>{const t=Math.min(1,Math.max(0,distance/scope.feather));return t*t*(3-2*t);};
  // Feather goes inward; the tree's bottom/top stay opaque at a boundary of 0/1.
  if(!scope.feather)return 1;
  return Math.min(scope.min===0?1:fade(height-scope.min),scope.max===1?1:fade(scope.max-height));
}
export function scopeLabel(scope,meters=10){return scope?`${(scope.min*100).toFixed(0)}–${(scope.max*100).toFixed(0)}% · ${(scope.min*meters).toFixed(2)}–${(scope.max*meters).toFixed(2)}m`:'全树';}
export const SCOPE_PRESETS={all:null,bottom:{kind:'height',min:0,max:.25,feather:.03},middle:{kind:'height',min:.25,max:.65,feather:.03},top:{kind:'height',min:.65,max:1,feather:.03}};
