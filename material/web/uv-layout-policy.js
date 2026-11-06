import {strictUvCharts} from './uv-clearance.js';
export const DEFAULT_UV_PADDING=3;
export function uvLayoutOutput(output,padding=DEFAULT_UV_PADDING){
 if(!Number.isInteger(padding)||padding<0||padding>32)throw Error('UV每侧扩色需在0–32像素内。');
 return {...output,padding};
}
export function preparationUvMode({sameSource,hasWorking,diagnostic,sameOutput,clearanceSafe}){
 if(!sameSource||!hasWorking||!diagnostic||diagnostic.zeroUvFaces||diagnostic.outOfRangeFaces||diagnostic.overlap>.001)return 'tree';
 return sameOutput&&clearanceSafe?'reuse':'repack';
}
export function assertUvIslandsPreserved(before,after){
 if(before.indices.length!==after.indices.length)throw Error('排布改变了面数，候选已拒绝。');
 const a=strictUvCharts(before),b=strictUvCharts(after),forward=new Map(),reverse=new Map();
 for(let face=0;face<a.labels.length;face++){const x=a.labels[face],y=b.labels[face];if(forward.has(x)&&forward.get(x)!==y||reverse.has(y)&&reverse.get(y)!==x)throw Error('排布改变了UV岛分组，候选已拒绝，当前UV保留。');forward.set(x,y);reverse.set(y,x);}
 return {before:a.count,after:b.count};
}
