import * as THREE from 'three';
import { interpolateSectionRing } from './trunk-section-interaction.js';
import { trunkRingAngleSegment } from './trunk-mesh-density.js';
import { TRUNK_DETAIL_SIZE_LIMITS } from './trunk-details.js';

const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/** Centimetres are an editing view over the existing angular/axial recipe.
 * Use the BASE contour to avoid feeding a detail's displacement into its size.
 * The axial measure follows the evaluated centerline, not endpoint distance. */
export function createTrunkDetailSizeMetric(geometry,worldMatrix=new THREE.Matrix4()) {
  const rings=geometry?.userData.radiusRings,positions=geometry?.getAttribute('position');
  if(!Array.isArray(rings)||rings.length<2||!positions||!worldMatrix?.isMatrix4||!worldMatrix.elements.every(Number.isFinite)||Math.abs(worldMatrix.determinant())<1e-12)return null;
  if(!interpolateSectionRing(rings,.5,positions))return null;
  const matrix=worldMatrix.clone(),centres=rings.map(r=>new THREE.Vector3(...r.center).applyMatrix4(matrix)),distances=[0];
  for(let i=1;i<centres.length;i++)distances.push(distances[i-1]+centres[i].distanceTo(centres[i-1]));
  if(!Number.isFinite(distances.at(-1))||distances.at(-1)<1e-10)return null;
  const sections=new Map();
  function distanceAt(t){
    const value=clamp(t,rings[0].t,rings.at(-1).t);let low=0,high=rings.length-1;
    while(low+1<high){const mid=(low+high)>>1;if(rings[mid].t<=value)low=mid;else high=mid;}
    return THREE.MathUtils.lerp(distances[low],distances[high],(value-rings[low].t)/(rings[high].t-rings[low].t));
  }
  function sectionAt(t){
    const value=clamp(t,0,1);if(sections.has(value))return sections.get(value);
    const ring=interpolateSectionRing(rings,value,positions);if(!ring)return null;
    const points=ring.points.map(p=>p.clone().applyMatrix4(matrix)),lookup={...ring,angleOffset:0};
    const lengths=[0];for(let i=0;i<points.length;i++)lengths.push(lengths[i]+points[i].distanceTo(points[(i+1)%points.length]));
    const arcAt=angle=>{const cycle=Math.floor(angle/TAU),value=angle-cycle*TAU,total=lengths.at(-1);if(value<1e-12)return cycle*total;if(TAU-value<1e-12)return(cycle+1)*total;const {i,u}=trunkRingAngleSegment(lookup,value);return cycle*total+THREE.MathUtils.lerp(lengths[i],lengths[i+1],u);};
    const result={arcAt};if(sections.size>=256)sections.clear();sections.set(value,result);return result;
  }
  function measure(detail,field,parameter=detail[field]){
    if(![detail?.t,detail?.angle,parameter].every(Number.isFinite)||parameter<=0)return null;
    if(field==='height')return (distanceAt(detail.t+parameter/2)-distanceAt(detail.t-parameter/2))*100;
    if(field!=='width')return null;
    const section=sectionAt(detail.t);if(!section)return null;
    const centre=((detail.angle*Math.PI/180)%TAU+TAU)%TAU,start=centre-parameter*Math.PI/360,end=centre+parameter*Math.PI/360;
    return (section.arcAt(end)-section.arcAt(start))*100;
  }
  function limits(detail,field){const range=TRUNK_DETAIL_SIZE_LIMITS[field];if(!range)return null;return{min:measure(detail,field,range[0]),max:measure(detail,field,range[1])};}
  function solve(detail,field,centimetres){
    if(!Number.isFinite(centimetres)||centimetres<=0)return null;
    const range=TRUNK_DETAIL_SIZE_LIMITS[field],bounds=limits(detail,field);
    if(!range||!bounds||![bounds.min,bounds.max].every(Number.isFinite)||bounds.max<1e-10)return null;
    const target=clamp(centimetres,bounds.min,bounds.max);let low=range[0],high=range[1];
    for(let i=0;i<36;i++){const mid=(low+high)/2;if(measure(detail,field,mid)<target)low=mid;else high=mid;}
    const value=(low+high)/2,actual=measure(detail,field,value);
    return{value,actual,limited:Math.abs(target-centimetres)>1e-6,min:bounds.min,max:bounds.max};
  }
  return{measure,limits,solve,length:distances.at(-1)*100};
}
