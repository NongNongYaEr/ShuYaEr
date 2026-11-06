// UI-only preferences. These never enter a project, history, recipe or bake key.
export const STUDIO_LAYOUT_DEFAULTS={version:2,left:288,right:344,dock:224,font:14,collapsed:false,cards:'medium'};
const clamp=(v,a,b,f)=>Number.isFinite(v)?Math.max(a,Math.min(b,v)):f;
export function studioLayout(raw={}){return{version:2,left:clamp(raw.left,248,440,288),right:clamp(raw.right,300,520,344),dock:raw.version===1?224:clamp(raw.dock,184,360,224),font:[13,14,16].includes(raw.font)?raw.font:14,collapsed:raw.collapsed===true,cards:raw.cards==='large'?'large':'medium'};}
export function fitStudioLayout(raw,width,height){const v=studioLayout(raw),minimum={left:248,right:300,dock:184},viewport=width<1200?320:420,keys=['left','right','dock'],room=Math.max(0,width-viewport-keys.reduce((n,k)=>n+minimum[k],0)),extra=keys.reduce((n,k)=>n+v[k]-minimum[k],0),ratio=extra?Math.min(1,room/extra):1;return{...v,...Object.fromEntries(keys.map(k=>[k,Math.floor(minimum[k]+(v[k]-minimum[k])*ratio)]))};}
export function resizeStudioLayout(raw,edge,delta){const v=studioLayout(raw);if(edge==='left')v.left+=delta;if(edge==='right')v.right-=delta;if(edge==='dock')v.dock+=delta;return studioLayout(v);}
