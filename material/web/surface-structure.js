// Source-space evidence shared by distribution tasks. Only opposed manifold
// adjacency is used: nearby roots and UV seams cannot become new connections.
import {buildStableCurvature} from './stable-curvature.js';
const clamp=x=>Math.max(0,Math.min(1,x));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
class DistanceHeap {
 constructor(){this.items=[];}
 push(id,value){const a=this.items;let i=a.length;a.push([id,value]);while(i){const p=(i-1)>>1;if(a[p][1]<=value)break;a[i]=a[p];i=p;}a[i]=[id,value];}
 pop(){const a=this.items,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1][1]<a[c][1])c++;if(a[c][1]>=last[1])break;a[i]=a[c];i=c;}a[i]=last;}return first;}
}
export const STRUCTURE_DIRECTIONS=[[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
export function buildSurfaceStructure(mesh,{base=buildStableCurvature(mesh),topology,actualHeightMeters=10}={}){
 if(!(actualHeightMeters>0&&mesh.height>0)||!Number.isFinite(actualHeightMeters))throw Error('表面结构物理尺度无效。');
 const {vertices,mapping}=base,scale=actualHeightMeters/mesh.height,n=vertices.length,edgeSources=new Set(),faceCount=mesh.indices.length/3;
 if(!topology)throw Error('表面结构需要已校验的邻接数据。');
 let openEdges=0;
 for(let face=0;face<faceCount;face++)for(let edge=0;edge<3;edge++)if(!topology.neighbors[face].some(h=>h.edge===edge&&h.opposed)){
  openEdges++;edgeSources.add(mapping[face*3+edge]);edgeSources.add(mapping[face*3+(edge+1)%3]);
 }
 const boundary=new Float64Array(n).fill(Infinity),heap=new DistanceHeap();
 for(const id of edgeSources){boundary[id]=0;heap.push(id,0);}
 let relaxed=0;
 while(heap.items.length){const[id,d]=heap.pop();if(d!==boundary[id])continue;for(const next of vertices[id].neighbors){const value=d+distance(vertices[id].p,vertices[next].p)*scale;if(value<boundary[next]){boundary[next]=value;heap.push(next,value);relaxed++;}}}
 const planar=new Float32Array(n),components=new Int32Array(n).fill(-1);let componentCount=0;
 for(const v of vertices){let weight=0,total=0;for(const id of v.neighbors){const u=vertices[id],w=Math.max(u.area,1e-24);weight+=w*Math.max(0,dot(v.n,u.n));total+=w;}planar[v.id]=clamp((weight/Math.max(total,1e-24)-.8)/.2);
  if(components[v.id]>=0)continue;const queue=[v.id];components[v.id]=componentCount;for(let at=0;at<queue.length;at++)for(const id of vertices[queue[at]].neighbors)if(components[id]<0){components[id]=componentCount;queue.push(id);}componentCount++;
 }
 return{base,scale,boundary,planar,components,flows:new Map(),metadata:{algorithm:'connected-surface-evidence-v1',sourceSHA256:mesh.sourceSHA256,actualHeightMeters,vertices:n,components:componentCount,openEdges,boundaryVertices:edgeSources.size,distanceRelaxations:relaxed,boundaryMetric:'shortest path along opposed-manifold mesh edges in meters',endgrainEvidence:'normal alignment and local planarity candidates; not semantic endcap recognition',origin:'source geometry; independent of UV and material color'}};
}
// A directed downhill graph transports incident surface area. It is a static
// runoff tendency, not a fluid simulation. Strict potential descent forbids loops.
export function surfaceRunoff(structure,direction=0){
 if(!Number.isInteger(direction)||!STRUCTURE_DIRECTIONS[direction])throw Error('导流朝向无效。');
 if(structure.flows.has(direction))return structure.flows.get(direction);
 const {vertices,mean}=structure.base,axis=STRUCTURE_DIRECTIONS[direction],n=vertices.length,potential=Float64Array.from(vertices,v=>dot(v.p,axis)),accum=Float64Array.from(vertices,v=>Math.max(v.area,1e-24)),order=Array.from({length:n},(_,i)=>i).sort((a,b)=>potential[b]-potential[a]||a-b);
 let transported=0;
 for(const id of order){const v=vertices[id];let best=-1,score=0;for(const next of v.neighbors){const drop=potential[id]-potential[next];if(drop<=1e-12)continue;const length=distance(v.p,vertices[next].p),cavity=clamp(-mean[next]*length),candidate=drop/Math.max(length,1e-12)*(1+cavity*.5);if(candidate>score){score=candidate;best=next;}}if(best>=0){accum[best]+=accum[id];transported++;}}
 const flow=Float32Array.from(accum,(a,id)=>clamp(Math.log1p(Math.max(0,a/Math.max(vertices[id].area,1e-24)-1))/Math.log(65)));
 const result={values:flow,metadata:{algorithm:'surface-downhill-area-accumulation-v1',direction,transportedVertices:transported,semantics:'static along-surface runoff tendency; no weather or fluid inference'}};
 while(structure.flows.size>=2)structure.flows.delete(structure.flows.keys().next().value);structure.flows.set(direction,result);return result;
}
export function sampleSurfaceStructure(structure,face,a,b,c,{direction=0,flow=false}={}){
 const ids=[structure.base.mapping[face*3],structure.base.mapping[face*3+1],structure.base.mapping[face*3+2]],weights=[a,b,c],interpolate=values=>ids.reduce((sum,id,k)=>weights[k]>1e-12?sum+values[id]*weights[k]:sum,0);
 return{boundaryMeters:interpolate(structure.boundary),planarity:interpolate(structure.planar),...(flow?{flow:interpolate(surfaceRunoff(structure,direction).values)}:{})};
}
