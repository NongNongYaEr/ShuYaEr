import {buildFlowProjection} from './bark-flow-projection.js';
import {analyzeBanyanSurfaceBounded,applyBanyanDirections} from './bark-flow-banyan.js';
import {relaxFlowCoordinates} from './bark-flow-relax.js';
import {measureFlowDistortion} from './bark-flow-metric.js';
import {refineSurfaceFlow} from './bark-flow-surface.js';
import {integrateFlowCoordinates} from './flow-integration.js';
import {buildUvTopology} from './uv-topology.js';
import {validateBarkFlow,validateDirectionCorrections} from './bark-flow-rules.js';
const sub=(a,b)=>a.map((v,k)=>v-b[k]),add=(a,b)=>a.map((v,k)=>v+b[k]),mul=(a,t)=>a.map(v=>v*t),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>{const l=Math.hypot(...a);return l>1e-12?mul(a,1/l):[0,1,0];},mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t),smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export const normalizedPositions=mesh=>Float32Array.from(mesh.pos,(v,i)=>(v-mesh.min[i%3])/mesh.height);
export function flowComponents(mesh){const topology=buildUvTopology(mesh),labels=new Int32Array(topology.centers.length).fill(-1),groups=[];for(let f=0;f<labels.length;f++)if(labels[f]<0){const list=[f],id=groups.length;labels[f]=id;for(let i=0;i<list.length;i++)for(const h of topology.neighbors[list[i]])if(labels[h.face]<0){labels[h.face]=id;list.push(h.face);}groups.push(list);}return{topology,labels,groups};}
const point=(p,i)=>Array.from(p.subarray(i*3,i*3+3));
function rotate(v,a,b,fallback){const c=Math.max(-1,Math.min(1,dot(a,b))),axis=cross(a,b),s2=dot(axis,axis);if(c<-.999999)return sub(mul(fallback,2*dot(fallback,v)),v);if(s2<1e-20)return v.slice();return add(add(v,cross(axis,v)),mul(cross(axis,cross(axis,v)),1/(1+c)));}
function frame(y,x){y=unit(y);x=unit(sub(x,mul(y,dot(x,y))));if(Math.abs(dot(x,y))>.99)x=unit(cross(y,Math.abs(y[0])<.8?[1,0,0]:[0,0,1]));return{x,y,z:unit(cross(x,y))};}
function interpolate(a,b,t){return frame(mix(a.y,b.y,t),mix(a.x,b.x,t));}
function closest(p,a,b){const d=sub(b,a),t=Math.max(0,Math.min(1,dot(sub(p,a),d)/dot(d,d))),q=add(a,mul(d,t));return{t,q,d2:dot(sub(p,q),sub(p,q))};}
export function buildFlowBranches(record){
 const branches=[],byId=new Map();
 for(const guide of record.guides){const points=guide.points.map(p=>p.slice()),lengths=[0],frames=[];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+Math.hypot(...sub(points[i],points[i-1])));
  const tangents=points.map((p,i)=>unit(sub(points[Math.min(points.length-1,i+1)],points[Math.max(0,i-1)]))),parent=byId.get(guide.parent),attachment=parent?sampleBranch(parent,guide.attach*parent.length):null;
  if(parent&&Math.hypot(...sub(points[0],attachment.position))>1e-5)throw Error('子枝起点没有连接到父枝，不能连续传递流向。');
  let x=attachment?rotate(attachment.frame.x,attachment.frame.y,tangents[0],attachment.frame.x):[1,0,0];frames.push(frame(tangents[0],x));for(let i=1;i<points.length;i++){x=rotate(frames[i-1].x,frames[i-1].y,tangents[i],frames[i-1].x);frames.push(frame(tangents[i],x));}
  const branch={...guide,points,lengths,frames,length:lengths.at(-1),base:attachment?.arc||0,parentFrame:attachment?.frame||null};branches.push(branch);byId.set(guide.id,branch);
 }return branches;
}
export function sampleBranch(branch,s){s=Math.max(0,Math.min(branch.length,s));let i=0;while(i+2<branch.lengths.length&&branch.lengths[i+1]<s)i++;const t=(s-branch.lengths[i])/(branch.lengths[i+1]-branch.lengths[i]);return{position:mix(branch.points[i],branch.points[i+1],t),frame:interpolate(branch.frames[i],branch.frames[i+1],t),arc:branch.base+s};}
function segmentsTree(segments){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const s of segments)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],s.a[k],s.b[k]);hi[k]=Math.max(hi[k],s.a[k],s.b[k]);}if(segments.length<=8)return{lo,hi,segments};const extent=sub(hi,lo),axis=extent.indexOf(Math.max(...extent));segments.sort((a,b)=>a.a[axis]+a.b[axis]-b.a[axis]-b.b[axis]);const m=segments.length>>1;return{lo,hi,left:segmentsTree(segments.slice(0,m)),right:segmentsTree(segments.slice(m))};}
const boxDistance=(p,node)=>p.reduce((s,v,k)=>s+Math.max(node.lo[k]-v,0,v-node.hi[k])**2,0);
function nearest(p,node,best={d2:Infinity},exclude=-1){if(boxDistance(p,node)>best.d2)return best;if(node.segments){for(const s of node.segments){if(s.branch===exclude)continue;const hit=closest(p,s.a,s.b);if(hit.d2<best.d2)best={...hit,s};}return best;}const a=boxDistance(p,node.left),b=boxDistance(p,node.right);if(a<b){best=nearest(p,node.left,best,exclude);return nearest(p,node.right,best,exclude);}best=nearest(p,node.right,best,exclude);return nearest(p,node.left,best,exclude);}
const coordinates=(p,center,f,arc)=>{const radial=sub(p,center);return[dot(radial,f.x),arc+dot(radial,f.y),dot(radial,f.z)];};
export function buildBarkFlow(mesh,raw,{corrections=[],actualHeightMeters=10,transition=1,progress=()=>{},structureOnly=false,onStructure=null}={}){
 const record=validateBarkFlow(raw,mesh.sourceSHA256);if(!record)throw Error('请先生成并采用枝干流向。');if(!Number.isFinite(transition)||transition<0||transition>3)throw Error('分叉过渡无效。');corrections=validateDirectionCorrections(corrections);
 const {topology,labels,groups}=flowComponents(mesh);if(record.componentSeed>=labels.length)throw Error('流向锚点不属于当前模型。');const selected=labels[record.componentSeed],p=normalizedPositions(mesh),n=p.length/3,eligible=new Uint8Array(n),foreign=new Uint8Array(n);
 for(let f=0;f<labels.length;f++)for(let c=0;c<3;c++)(labels[f]===selected?eligible:foreign)[mesh.indices[f*3+c]]=1;
 const branches=buildFlowBranches(record),segments=[];for(const branch of branches)for(let i=0;i<branch.points.length-1;i++)segments.push({branch,i,a:branch.points[i],b:branch.points[i+1]});const tree=segmentsTree(segments),position=p.slice(),growth=new Float32Array(p.length),across=new Float32Array(p.length),branchIds=new Int32Array(n).fill(-1);let supported=0;
 for(let v=0;v<n;v++){growth[v*3+1]=1;across[v*3]=1;if(!eligible[v])continue;const point=Array.from(p.subarray(v*3,v*3+3)),hit=nearest(point,tree),branch=hit.s.branch,i=hit.s.i,s=branch.lengths[i]+hit.t*(branch.lengths[i+1]-branch.lengths[i]),sample=sampleBranch(branch,s);let f=sample.frame,q=coordinates(point,sample.position,f,sample.arc);
  if(branch.parentFrame&&transition>0){const weight=smooth(s/Math.max(branch.start_radius*2*transition,1e-8)),parentQ=coordinates(point,branch.points[0],branch.parentFrame,branch.base);q=mix(parentQ,q,weight);f=interpolate(branch.parentFrame,f,weight);}
  position.set(q,v*3);growth.set(f.y,v*3);across.set(f.x,v*3);branchIds[v]=branches.indexOf(branch);supported++;if(v%4096===0)progress(v/n*.8);
 }
 const result={position,growth,across,branchIds,summary:{algorithm:'branch-arc-parallel-transport-v1',branches:branches.length,segments:segments.length,components:groups.length,supportedVertices:supported,fallbackVertices:n-supported,transition}};
 if(record.version>=2){const trees=branches.map(branch=>segmentsTree(segments.filter(s=>s.branch===branch))),sample=(point,hit)=>{if(!hit.s)return null;const branch=hit.s.branch,s=branch.lengths[hit.s.i]+hit.t*(branch.lengths[hit.s.i+1]-branch.lengths[hit.s.i]),value=sampleBranch(branch,s),d=sub(point,value.position),radius=Math.hypot(dot(d,value.frame.x),dot(d,value.frame.z));return{...value,branch:branches.indexOf(branch),s,radius,distance:Math.sqrt(hit.d2),expectedRadius:branch.start_radius+(branch.end_radius-branch.start_radius)*s/branch.length};},read=(point,id)=>sample(point,nearest(point,trees[id])),readPair=point=>{const first=nearest(point,tree);return[sample(point,first),sample(point,nearest(point,tree,{d2:Infinity},first.s.branch))];};refineSurfaceFlow(mesh,record,result,{topology,labels,selected,p,branches,read,readPair,actualHeightMeters,transition,progress});}
 if(record.version===5){const analysis=analyzeBanyanSurfaceBounded(mesh,record,result,{topology,labels,selected,p,actualHeightMeters,shapeScaleCm:record.banyan.shapeScaleCm,progress:t=>progress(.45+t*.3)});applyBanyanDirections(mesh,p,topology,analysis,result,record.banyan.strength);result.banyanTypes=analysis.types;result.banyanDirections=analysis.directions;result.banyanConfidence=analysis.confidence;result.summary.banyan={...analysis.summary,diagnosticOnly:false,strength:record.banyan.strength,scope:'source-surface line constraints; geometric evidence is not semantic organ identity; coarse reference guides unchanged'};}
 // UV charting needs the source-surface line field, not the material's global
 // three-dimensional coordinate integration. Keep the material path unchanged.
 if(structureOnly){applyDirectionCorrections(mesh,p,topology,labels,result,corrections,actualHeightMeters);return result;}
 if(onStructure&&record.version===5){
  const structure=corrections.length?{...result,position:result.position.slice(),growth:result.growth.slice(),across:result.across.slice()}:result;
  if(corrections.length)applyDirectionCorrections(mesh,p,topology,labels,structure,corrections,actualHeightMeters);
  onStructure(structure);
 }
 result.summary.integration=integrateFlowCoordinates(mesh,p,topology,labels,selected,result);
 // An ambiguous original vertex can be shared with another face component.
 // Match its coordinate phase without joining that component's skeleton.
 result.summary.phaseAnchoredFallbackVertices=anchorFallbackCoordinates(mesh,p,labels,selected,eligible,result);
 applyDirectionCorrections(mesh,p,topology,labels,result,corrections,actualHeightMeters);
 if(record.version>=3){const before=measureFlowDistortion(mesh,p,result.position,f=>labels[f]===selected).summary;result.summary.relaxation=relaxFlowCoordinates(mesh,p,topology,labels,selected,result,{...(record.version>=4?{continuity:record.continuity.amount,normalizedRadius:record.continuity.radiusCm/100/actualHeightMeters}:{}),progress:t=>progress(.8+t*.19)});result.summary.coordinateDistortion={before,after:result.summary.relaxation.distortion};result.summary.algorithm='surface-metric-preserving-flow-v3';result.summary.projectionVersion=3;result.summary.phaseAnchoredFallbackVertices=anchorFallbackCoordinates(mesh,p,labels,selected,eligible,result);}

 if(record.version>=4){const projection=buildFlowProjection(mesh,p,topology,labels,result);result.projectionNormal=projection.projectionNormal;result.summary={...result.summary,algorithm:record.version===5?'banyan-surface-guided-flow-v5':'surface-continuous-bark-flow-v4',projectionVersion:4,projection:projection.summary,continuityOptions:{...record.continuity}};}
 const stretches=[];for(let f=0;f<mesh.indices.length/3;f++)for(let c=0;c<3;c++){const a=mesh.indices[f*3+c],b=mesh.indices[f*3+(c+1)%3],length=Math.hypot(...sub(point(p,a),point(p,b)));if(length>1e-8)stretches.push(Math.hypot(...sub(point(result.position,a),point(result.position,b)))/length);}stretches.sort((a,b)=>a-b);result.summary.coordinateEdgeStretch={edges:stretches.length,p99:stretches[Math.floor(stretches.length*.99)]||0,max:stretches.at(-1)||0,above8:stretches.filter(v=>v>8).length};progress(1);return result;
}
export const buildBarkStructure=(mesh,record,options={})=>buildBarkFlow(mesh,record,{...options,structureOnly:true});
function hitPoint(mesh,p,hit){if(hit.face*3+2>=mesh.indices.length)throw Error('方向校正面不属于当前模型。');const ids=[0,1,2].map(c=>mesh.indices[hit.face*3+c]);return{ids,p:[0,1,2].map(k=>ids.reduce((s,id,c)=>s+p[id*3+k]*hit.bary[c],0))};}
function applyDirectionCorrections(mesh,p,topology,labels,result,corrections,actualHeightMeters){
 if(!Number.isFinite(actualHeightMeters)||actualHeightMeters<.1||actualHeightMeters>200)throw Error('校正树高无效。');
 for(const guide of corrections){const start=hitPoint(mesh,p,guide.start),end=hitPoint(mesh,p,guide.end),radius=guide.radiusMeters/actualHeightMeters,delta=sub(end.p,start.p);if(Math.hypot(...delta)<1e-7)throw Error('方向校正两点过近。');const a=start.ids,weights=guide.start.bary,read=array=>[0,1,2].map(k=>a.reduce((s,id,c)=>s+array[id*3+k]*weights[c],0)),original=frame(read(result.growth),read(result.across)),normal=unit(read(mesh.normal)),projected=sub(delta,mul(normal,dot(delta,normal))),target=unit(projected);if(Math.hypot(...projected)<1e-7)throw Error('方向校正垂直于表面，请沿树皮选择第二点。');if(dot(target,original.y)<0)for(let k=0;k<3;k++)target[k]*=-1;const corrected=frame(target,rotate(original.x,original.y,target,original.x)),anchorQ=read(result.position),faces=[guide.start.face],seen=new Set(faces),vertices=new Set();
  for(let at=0;at<faces.length;at++){const f=faces[at];for(let c=0;c<3;c++)vertices.add(mesh.indices[f*3+c]);for(const edge of topology.neighbors[f])if(!seen.has(edge.face)){const e=topology.edges[edge.edge],d=closest(start.p,point(p,e.halves[0].ia),point(p,e.halves[0].ib)).d2;if(d<=radius*radius){seen.add(edge.face);faces.push(edge.face);}}}
  if(labels[guide.start.face]!==labels[guide.end.face])throw Error('校正两点不在同一相连表面，请改选。');
  for(const v of vertices){const pv=point(p,v),distance=Math.hypot(...sub(pv,start.p)),weight=smooth((1-distance/radius)/.75)*guide.strength;if(weight<=0)continue;const current=frame(point(result.growth,v),point(result.across,v)),f=interpolate(current,corrected,weight),q=coordinates(pv,start.p,corrected,0).map((x,k)=>x+anchorQ[k]);result.position.set(mix(point(result.position,v),q,weight),v*3);result.growth.set(f.y,v*3);result.across.set(f.x,v*3);}
 }
}

function anchorFallbackCoordinates(mesh,p,labels,selected,eligible,result){
 let anchored=0;const fallbackEdges=new Map();for(let f=0;f<labels.length;f++)if(labels[f]!==selected)for(let c=0;c<3;c++){const a=mesh.indices[f*3+c],b=mesh.indices[f*3+(c+1)%3];if(!fallbackEdges.has(a))fallbackEdges.set(a,new Set());if(!fallbackEdges.has(b))fallbackEdges.set(b,new Set());fallbackEdges.get(a).add(b);fallbackEdges.get(b).add(a);}const visited=new Set();for(const start of fallbackEdges.keys())if(!visited.has(start)){const all=[start];visited.add(start);for(let i=0;i<all.length;i++)for(const v of fallbackEdges.get(all[i]))if(!visited.has(v)){visited.add(v);all.push(v);}const anchors=all.filter(v=>eligible[v]);if(!anchors.length)continue;for(const v of all)if(!eligible[v]){const pv=point(p,v),sum=[0,0,0];let total=0;for(const a of anchors){const w=1/Math.max(1e-12,sub(pv,point(p,a)).reduce((s,v)=>s+v*v,0));for(let k=0;k<3;k++)sum[k]+=(result.position[a*3+k]-p[a*3+k])*w;total+=w;}for(let k=0;k<3;k++)result.position[v*3+k]=p[v*3+k]+sum[k]/total;anchored++;}}
 return anchored;
}
