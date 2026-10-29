import {sampleLine} from './tree-sculpt.js';
import {unitPaintRadialDirection,unitPaintPlacement} from './unit-paint-placement.js';

const offsets=[0,-.025,.025,-.06,.06,-.12,.12,-.2,.2];
// The camera, carrier geometry and settings are fixed for this pen. Cache the
// same candidate set and its nearest occupancy distance; each addition only
// reduces distances. No DOM reads, repeated radial evaluation or array maps.
export function createDensityGapSearch(parent,settings,occupied,project){
 const byT=new Map(),used=occupied.filter(p=>p.parent===parent.stableId);
 const nearest=point=>{let best=Infinity;for(const p of used)best=Math.min(best,p.clearance.distanceToSquared(point));return best;};
 function candidates(t){if(byT.has(t))return byT.get(t);const position=sampleLine(parent.points,t),screen=project(position),values=[];
  for(let n=0;n<8;n++){const direction=unitPaintRadialDirection(parent,t,.1,n),placement=unitPaintPlacement({parent:parent.stableId,attach:t},parent,position,direction,settings);values.push({t,n,placement,gap:nearest(placement.clearance)});}
  const result={screen,values};byT.set(t,result);return result;
 }
 return {best(entries,hitIds,point,radius,depthLimit=Infinity){let result=null,gap=0;
  for(const entry of entries){if(!hitIds.has(entry.id))continue;for(const offset of offsets){const t=Math.max(.02,Math.min(.98,entry.instance.attach+offset)),{screen,values}=candidates(t);
   if(screen.behind||screen.z< -1||screen.z>1||screen.depth>depthLimit||Math.hypot(screen.x-point[0],screen.y-point[1])>radius)continue;
   for(const value of values)if(value.gap>gap){gap=value.gap;result=value;}
  }}return result&&gap>=.0001?result:null;
 },occupy(placement){used.push(placement);for(const {values}of byT.values())for(const value of values)value.gap=Math.min(value.gap,value.placement.clearance.distanceToSquared(placement.clearance));},get size(){return byT.size;}};
}
