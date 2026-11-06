import {paintMaterial,validatePaintBrush,PAINT_BRUSH_DEFAULTS} from './material-paint.js';

// Brush resources contain a material and a tip, never a destination layer or mask.
export const MATERIAL_BRUSHES=Object.freeze([
 {id:'moss-dense',name:'细密苔藓',description:'细密叶簇，连续覆盖；叠笔增加覆盖。',tip:'tuft-v1',flow:.65,spacing:.18,scatter:.06,hardness:.65},
 {id:'moss-soft',name:'柔边苔藓',description:'柔和过渡，低流量逐层刷厚。',tip:'soft-v1',flow:.35,spacing:.12,scatter:.04,hardness:.25},
 {id:'moss-scatter',name:'零散苔簇',description:'较疏的印章与散布；使用同一套苔藓材质。',tip:'tuft-v1',flow:.5,spacing:.45,scatter:.3,hardness:.8},
].map(v=>Object.freeze(v)));
export function materialBrush(id='moss-dense'){
 const preset=MATERIAL_BRUSHES.find(p=>p.id===id);if(!preset)throw Error('材质笔刷不存在。');
 const {tip,flow,spacing,scatter,hardness}=preset;
 return {version:1,id:preset.id,name:preset.name,material:paintMaterial({density:.4,clumpCm:2.5,tileCm:35}),brush:validatePaintBrush({...PAINT_BRUSH_DEFAULTS,tip,presetId:preset.id,flow,spacing,scatter,hardness})};
}
const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
// A broken tuft perimeter with a solid centre. Leaf pores belong to the material,
// not to a permanent low-frequency mask. Rotation/seed are frozen per stamp.
export function brushTipAlpha(x,y,brush,seed=0){
 const rho=Math.hypot(x,y);if(rho>=1)return 0;
 if(!brush.tip)return smooth((1-rho)/Math.max(.03,1-brush.hardness));
 if(brush.tip==='soft-v1')return smooth((1-rho)/Math.max(.03,1-brush.hardness));
 const angle=Math.atan2(y,x),phase=(seed%997)*.017;
 const rim=.88+.045*Math.sin(angle*11+phase)+.035*Math.sin(angle*19-phase*1.7)+.025*Math.sin(angle*31+phase*.7);
 return smooth((rim-rho)/Math.max(.04,(1-brush.hardness)*.7));
}
