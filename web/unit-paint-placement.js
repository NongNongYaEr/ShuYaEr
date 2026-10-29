import * as T from './vendor/three.module.min.js';
import {axisTime} from './branch-axis.js';
import {sampleLine,lineTangent} from './tree-sculpt.js';
import {branchRadiusAt} from './branch-shaping.js';
import {resolveInstanceShape} from './branch-workbench-data.js';
import {completeInstanceMatrix} from './branch-instance-matrix.js';
import {branchInstanceFrame} from './branch-kernel.js';

const tau=Math.PI*2,golden=Math.PI*(3-Math.sqrt(5)),clamp=T.MathUtils.clamp;
const phase=id=>[...id].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261)/0xffffffff*tau;
// Stable world-space radial frame; no camera vector enters the saved direction.
export function unitPaintRadialDirection(branch,t,spacing=.15,attempt=0){
 const tangent=lineTangent(branch.points,t),reference=Math.abs(tangent.z)<.9?new T.Vector3(0,0,1):new T.Vector3(0,1,0),x=reference.cross(tangent).normalize(),y=tangent.clone().cross(x),angle=phase(branch.stableId)+Math.floor(t*Math.max(.001,branch.length||1)/Math.max(.01,spacing))*golden+attempt*golden;
 return x.multiplyScalar(Math.cos(angle)).addScaledVector(y,Math.sin(angle)).normalize();
}

export function unitPaintPlacement(instance,branch,position,direction,settings){
 const tangent=lineTangent(branch.points,instance.attach),radial=direction.clone().addScaledVector(tangent,-direction.dot(tangent));if(radial.lengthSq()<1e-10)radial.copy(unitPaintRadialDirection(branch,instance.attach));radial.normalize();
 const radius=Math.max(.001,branchRadiusAt(branch,settings,instance.attach));
 return {parent:instance.parent,position:position.clone(),direction:direction.clone(),clearance:position.clone().addScaledVector(radial,radius)};
}
export function unitPaintPlacementOccupancy(authoring,branches,settings){
 const byId=new Map(branches.map(b=>[b.stableId,b]));return (authoring.branch_instances||[]).flatMap(i=>{const b=byId.get(i.parent);if(!b)return [];const shape=resolveInstanceShape(i,authoring.branch_library||[]);
  const matrix=shape?.connector?completeInstanceMatrix(i,shape,b,settings,branchInstanceFrame):null,position=matrix?new T.Vector3(...shape.connector.position).applyMatrix4(matrix):sampleLine(b.points,i.attach),direction=matrix?new T.Vector3(...shape.connector.direction).transformDirection(matrix):unitPaintRadialDirection(b,i.attach);
  return [unitPaintPlacement(i,b,position,direction,settings)];});
}
export function acceptsUnitPaintPlacement(candidate,occupied,spacing){return candidate?.clearance?.toArray().every(Number.isFinite)&&Number.isFinite(spacing)&&spacing>0&&!occupied.some(p=>p.parent===candidate.parent&&p.clearance.distanceToSquared(candidate.clearance)<spacing*spacing-1e-12);}

// One closest candidate per carrier in the actual brush circle, including the
// back of the tree. The explicit carrier pool has already resolved isolation.
export function unitPaintAxisCandidates(screen,point,radius){
 const result=[];for(const entry of screen){let nearest=null;for(let n=1;n<entry.points.length;n++){const a=entry.points[n-1],b=entry.points[n];if(a.z< -1||a.z>1||b.z< -1||b.z>1)continue;const dx=b.x-a.x,dy=b.y-a.y,u=clamp(((point[0]-a.x)*dx+(point[1]-a.y)*dy)/Math.max(1e-12,dx*dx+dy*dy),0,1),distance=Math.hypot(a.x+dx*u-point[0],a.y+dy*u-point[1]),parameter=a.depth>0&&b.depth>0?u*a.depth/((1-u)*b.depth+u*a.depth):u;if(distance<=radius&&(!nearest||distance<nearest.distance))nearest={parent:entry.branch.stableId,attach:clamp(axisTime(entry.branch.points,n-1)+(axisTime(entry.branch.points,n)-axisTime(entry.branch.points,n-1))*parameter,.02,.98),distance};}if(nearest)result.push(nearest);}
 return result.sort((a,b)=>a.distance-b.distance||a.parent.localeCompare(b.parent));
}
