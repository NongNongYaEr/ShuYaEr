import * as T from './vendor/three.module.min.js';
import {sampleLine} from './tree-sculpt.js';
import {normalizeAssemblySlots} from './branch-assembly.js';
import {applyAssemblyScale} from './assembly-scale.js';

// Arc-length spacing is measured in the displayed model's local metre space,
// independent of mouse event count, frame rate, source model size or LOD.
export function unitPaintOccupied(authoring,branches){
 const byId=new Map(branches.map(b=>[b.stableId,b]));
 return (authoring.branch_instances||[]).flatMap(i=>{const b=byId.get(i.parent);return b?[sampleLine(b.points,i.attach)]:[];});
}
export function acceptsUnitPaintPoint(point,occupied,spacing){
 return point?.toArray().every(Number.isFinite)&&Number.isFinite(spacing)&&spacing>0
   && !occupied.some(p=>p.distanceToSquared(point)<spacing*spacing-1e-12);
}
export function unitPaintRole(t,role='AUTO'){return ['MATURE','MIXED','YOUNG'].includes(role)?role:t<.4?'MATURE':t<.8?'MIXED':'YOUNG';}
export function sampleUnitPaintStroke(previous,point,step=6){
 if(!previous)return {points:[point.slice()],last:point.slice()};
 const dx=point[0]-previous[0],dy=point[1]-previous[1],distance=Math.hypot(dx,dy),count=Math.floor((distance+1e-9)/step);
 if(!count)return {points:[],last:previous};
 const points=Array.from({length:count},(_,n)=>[previous[0]+dx/distance*step*(n+1),previous[1]+dy/distance*step*(n+1)]);
 return {points,last:points.at(-1)};
}
export function commitPaintedUnits(authoring,item,instances){
 if(!item?.sample||!authoring.branch_library.some(a=>a.id===item.id&&a.revision===item.revision))throw Error('当前单元枝素材版本已改变，请重新选择');
 const ids=new Set(authoring.branch_instances.map(i=>i.id));
 if(instances.some(i=>ids.has(i.id)))throw Error('本笔单元枝身份已存在，请重新绘制');
 const slots=normalizeAssemblySlots(authoring.workbench?.assembly_slots,authoring.branch_library);
 for(const i of instances){if(!slots[i.shootRole].includes(item.id))slots[i.shootRole].push(item.id);}
 authoring.workbench={...authoring.workbench,assembly_slots:slots};
 authoring.branch_instances.push(...instances.map(i=>({...i,assembly_manual:true})));
 if(authoring.workbench.assembly_scale)applyAssemblyScale(authoring);
}
