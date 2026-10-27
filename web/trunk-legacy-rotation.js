import * as THREE from './vendor/three.module.min.js';
import {interpolateSectionRing} from './trunk-section-interaction.js';

export const LEGACY_LOCAL_ROLL_LIMIT=3600;
const smooth=x=>{const u=Math.max(0,Math.min(1,x));return u*u*(3-2*u);};

/** Independent corrections over the untouched legacy weighted rotation.
 * Each basis is zero at the next authored circle and outside its old span. */
export function createLegacyRotationOffsetSampler(sections=[]){
  const keys=[];for(const s of [...sections].sort((a,b)=>a.t-b.t)){
    if(keys.length&&Math.abs(keys.at(-1).t-s.t)<1e-10)keys[keys.length-1]=s;else keys.push(s);
  }
  const controls=keys.map((s,i)=>({t:s.t,value:Number.isFinite(s.roll_offset)?s.roll_offset:0,
    left:Math.min(s.span||.18,i?s.t-keys[i-1].t:Infinity),right:Math.min(s.span||.18,i+1<keys.length?keys[i+1].t-s.t:Infinity)})).filter(s=>s.value);
  return t=>controls.reduce((sum,s)=>{const d=t-s.t,width=d<0?s.left:s.right;return sum+(Math.abs(d)<1e-10?s.value:width>0?s.value*smooth(1-Math.abs(d)/width):0);},0);
}

/** Resample the original rendered strips before rotating. Exact circle rows
 * preserve unselected outlines even when V1's original grid missed their t.
 * Existing vertices outside the correction keep their original positions. */
export function applyLegacyTrunkRotation(source,sections,{vertexLimit=250000}={}){
  if(!sections.some(s=>Number.isFinite(s.roll_offset)&&s.roll_offset!==0))return source;
  const rings=source.userData.radiusRings||[],position=source.getAttribute('position');
  if(rings.length<2||!position)return source;
  const count=rings[0].count,protectedTs=new Set([rings[0].t,rings.at(-1).t,...sections.map(s=>s.t)]),times=[];
  for(const t of [...new Set([...rings.map(r=>r.t),...protectedTs])].sort((a,b)=>a-b)){
    if(times.length&&t-times.at(-1)<1e-10){if(protectedTs.has(t))times[times.length-1]=t;}else times.push(t);
  }
  const maxRings=Math.max(protectedTs.size,Math.floor((vertexLimit-2)/count));
  // At a full budget an exact control row replaces the closest ordinary row.
  // It is sampled from the same original strips, never a regenerated contour.
  while(times.length>maxRings){let index=-1,best=Infinity;
    for(let i=1;i<times.length-1;i++)if(!protectedTs.has(times[i])){const distance=Math.min(...sections.map(s=>Math.abs(s.t-times[i])));if(distance<best){best=distance;index=i;}}
    if(index<0)break;times.splice(index,1);
  }
  const offsetAt=createLegacyRotationOffsetSampler(sections),existing=new Map(rings.map(r=>[r.t,r])),vertices=times.length*count+2,
    result=new THREE.BufferGeometry(),arrays={};
  for(const [key,attr] of Object.entries(source.attributes))if(key!=='normal'&&key!=='tangent')arrays[key]=new Float32Array(vertices*attr.itemSize);
  const attributes=Object.entries(arrays).map(([key,array])=>({key,array,attr:source.attributes[key],size:source.attributes[key].itemSize}));
  const rows=[],axis=new THREE.Vector3(),center=new THREE.Vector3(),p=new THREE.Vector3();
  for(let i=0;i<times.length;i++){
    const t=times[i],exact=existing.get(t),sample=exact||interpolateSectionRing(rings,t,position,{points:false});
    let low=0,high=rings.length-1;while(low<high){const mid=(low+high)>>1;if(rings[mid].t<t)low=mid+1;else high=mid;}
    const a=exact||rings[Math.max(0,low-1)],b=exact||rings[low],u=a===b?0:(t-a.t)/(b.t-a.t),angle=offsetAt(t)*Math.PI/180;
    const {pointAt,points,...frame}=sample;axis.fromArray(frame.tangent);center.fromArray(frame.center);
    for(let side=0;side<count;side++)for(const {key,array,attr,size} of attributes){
      const to=(i*count+side)*size,from=(a.offset+side)*size,next=(b.offset+side)*size;
      if(key==='position'){
        if(exact)p.fromBufferAttribute(position,exact.offset+side);else p.copy(pointAt(side));
        if(angle)p.sub(center).applyAxisAngle(axis,angle).add(center);p.toArray(array,to);
      }else for(let k=0;k<size;k++)array[to+k]=u?attr.array[from+k]+(attr.array[next+k]-attr.array[from+k])*u:attr.array[from+k];
    }
    const rotate=v=>new THREE.Vector3(...v).applyAxisAngle(axis,angle).toArray();
    rows.push({...frame,t,offset:i*count,count,roll:(frame.roll||0)+angle,rolledX:rotate(frame.rolledX),rolledY:rotate(frame.rolledY)});
  }
  for(const [key,array] of Object.entries(arrays)){
    const attr=source.attributes[key],size=attr.itemSize;
    for(let cap=0;cap<2;cap++)for(let k=0;k<size;k++)array[(vertices-2+cap)*size+k]=attr.array[(position.count-2+cap)*size+k];
    result.setAttribute(key,new THREE.BufferAttribute(array,size,attr.normalized));
  }
  const indices=new (vertices>65535?Uint32Array:Uint16Array)(times.length*count*6);let at=0;
  for(let row=0;row<times.length-1;row++)for(let side=0;side<count;side++){
    const next=(side+1)%count,a=row*count+side,b=row*count+next,c=(row+1)*count+next,d=(row+1)*count+side;
    indices[at++]=a;indices[at++]=b;indices[at++]=c;indices[at++]=a;indices[at++]=c;indices[at++]=d;
  }
  for(let cap=0;cap<2;cap++)for(let side=0;side<count;side++){
    const start=cap?(times.length-1)*count:0,next=(side+1)%count;
    indices[at++]=vertices-2+cap;indices[at++]=start+(cap?side:next);indices[at++]=start+(cap?next:side);
  }
  result.setIndex(new THREE.BufferAttribute(indices,1));result.userData={...source.userData,radiusRings:rows};
  if(source.userData.trunkMeshSampling)result.userData.trunkMeshSampling={...source.userData.trunkMeshSampling,rings:rows.length};
  result.computeVertexNormals();result.computeBoundingBox();return result;
}
