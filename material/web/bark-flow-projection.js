// Smooth projection orientation on the welded source surface. Coordinates and
// bark image detail remain untouched. Components never share normal votes.
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);return n>1e-20?a.map(v=>v/n):[0,0,0];};
const at=(a,i)=>Array.from(a.subarray(i*3,i*3+3));
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function flowProjectionWeights(normal,faceNormal=null){
 let w=normal.map((v,k)=>Math.abs(v)**5*(faceNormal?smooth(.45,.65,Math.abs(faceNormal[k])):1)),sum=w.reduce((a,b)=>a+b,0);
 if(sum<1e-8){w=(faceNormal||normal).map((v,k)=>Math.abs(v)**5*(faceNormal?smooth(.45,.65,Math.abs(faceNormal[k])):1));sum=w.reduce((a,b)=>a+b,0);}
 return sum>1e-20?w.map(v=>v/sum):[0,0,1];
}
export function buildFlowProjection(mesh,p,topology,labels,field){
 const supportedComponents=new Set();for(let f=0;f<labels.length;f++)if(field.faceBranch?.[f]>=0)supportedComponents.add(labels[f]);
 const normals=new Array(labels.length),votes=new Map(),vertexComponents=Array.from({length:p.length/3},()=>new Map());let degenerateFaces=0;
 for(let f=0;f<labels.length;f++){
  const ids=Array.from(mesh.indices.subarray(f*3,f*3+3)),points=ids.map(v=>at(p,v)),q=ids.map(v=>at(field.position,v)),n=cross(sub(q[1],q[0]),sub(q[2],q[0])),area=Math.hypot(...cross(sub(points[1],points[0]),sub(points[2],points[0])))/2;
  if(Math.hypot(...n)<1e-20||area<1e-20){degenerateFaces++;continue;}normals[f]=unit(n);
  for(let c=0;c<3;c++){
   const v=ids[c],a=unit(sub(points[(c+1)%3],points[c])),b=unit(sub(points[(c+2)%3],points[c])),angle=Math.acos(Math.max(-1,Math.min(1,dot(a,b)))),key=labels[f]+':'+topology.vertices[v];
   let vote=votes.get(key);if(!vote){vote={sum:[0,0,0],best:normals[f],bestWeight:0};votes.set(key,vote);}for(let k=0;k<3;k++)vote.sum[k]+=normals[f][k]*angle;
   if(angle>vote.bestWeight){vote.best=normals[f];vote.bestWeight=angle;}
   const comps=vertexComponents[v];comps.set(labels[f],(comps.get(labels[f])||0)+area);
  }
 }
 const projectionNormal=new Float32Array(p.length);let supportedVertices=0,ambiguousVertices=0;
 for(let v=0;v<vertexComponents.length;v++){
  const comps=vertexComponents[v];if(!comps.size)continue;if(comps.size>1)ambiguousVertices++;
  const preferred=[...comps].filter(([id])=>field.branchIds[v]>=0&&supportedComponents.has(id)),id=(preferred.length?preferred:[...comps]).sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0][0],vote=votes.get(id+':'+topology.vertices[v]),n=Math.hypot(...vote.sum)>1e-8?unit(vote.sum):vote.best;
  projectionNormal.set(n,v*3);supportedVertices++;
 }
 let length=0,oldTotal=0,newTotal=0,oldStrong=0,newStrong=0;const oldJumps=[],newJumps=[];
 for(let f=0;f<labels.length;f++)for(const h of topology.neighbors[f])if(h.face>f&&normals[f]&&normals[h.face]){
  const edge=topology.edges[h.edge].halves[0],a=edge.ia,b=edge.ib,w=Math.hypot(...sub(at(p,a),at(p,b))),n=unit(at(projectionNormal,a).map((v,k)=>v+projectionNormal[b*3+k]));
  const jump=(x,y)=>x.reduce((s,v,k)=>s+Math.abs(v-y[k]),0)/2,old=jump(flowProjectionWeights(normals[f]),flowProjectionWeights(normals[h.face])),next=jump(flowProjectionWeights(n,normals[f]),flowProjectionWeights(n,normals[h.face]));
  oldJumps.push(old);newJumps.push(next);length+=w;oldTotal+=w*old;newTotal+=w*next;if(old>.25)oldStrong+=w;if(next>.25)newStrong+=w;
 }
 oldJumps.sort((a,b)=>a-b);newJumps.sort((a,b)=>a-b);
 return{projectionNormal,summary:{method:'angle-weighted-component-projection-normals-v1',supportedVertices,ambiguousVertices,degenerateFaces,sourceUVIndependent:true,projectionGuard:[.45,.65],edgeTransitions:{edges:oldJumps.length,oldMean:oldTotal/Math.max(length,1e-20),newMean:newTotal/Math.max(length,1e-20),oldP95:oldJumps[Math.floor(oldJumps.length*.95)]||0,newP95:newJumps[Math.floor(newJumps.length*.95)]||0,oldStrongFraction:oldStrong/Math.max(length,1e-20),newStrongFraction:newStrong/Math.max(length,1e-20)},scope:'projection-weight continuity only; not a measure of bark realism or semantic branch accuracy'}};
}
