import {buildBrushTopology} from './pixel-masks.js';
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],sub=(a,b)=>a.map((v,k)=>v-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const l=Math.hypot(...v);return l>1e-20?v.map(x=>x/l):[0,0,0];};
function solve(a,b){
 const m=a.map((row,i)=>[...row,b[i]]),scale=Math.max(...a.flat().map(Math.abs),1e-30);
 for(let c=0;c<3;c++){let p=c;for(let r=c+1;r<3;r++)if(Math.abs(m[r][c])>Math.abs(m[p][c]))p=r;if(Math.abs(m[p][c])<scale*1e-10)return null;[m[c],m[p]]=[m[p],m[c]];const d=m[c][c];for(let j=c;j<4;j++)m[c][j]/=d;for(let r=0;r<3;r++)if(r!==c){const f=m[r][c];for(let j=c;j<4;j++)m[r][j]-=f*m[c][j];}}
 return m.map(row=>row[3]);
}
// A normal-derivative tensor fit, with area weights and opposed manifold corners.
// Legacy curvature remains in surface-curvature.js; this never rewrites old rules.
export function buildStableCurvature(mesh,{topology=buildBrushTopology(mesh)}={}){
 const count=mesh.indices.length,parent=Int32Array.from({length:count},(_,i)=>i),find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;},join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;};
 for(let f=0;f<count/3;f++)for(const h of topology.neighbors[f])if(h.opposed&&h.face>f){join(f*3+h.edge,h.face*3+(h.otherEdge+1)%3);join(f*3+(h.edge+1)%3,h.face*3+h.otherEdge);}
 const groups=new Map(),mapping=new Int32Array(count);
 for(let i=0;i<count;i++){const key=find(i);if(!groups.has(key))groups.set(key,{id:groups.size,p:Array.from(mesh.pos.subarray(mesh.indices[i]*3,mesh.indices[i]*3+3)),n:[0,0,0],area:0,neighbors:new Set()});mapping[i]=groups.get(key).id;}
 const vertices=[...groups.values()];let degenerateFaces=0;
 for(let f=0;f<count/3;f++){const v=[0,1,2].map(k=>vertices[mapping[f*3+k]]),n=cross(sub(v[1].p,v[0].p),sub(v[2].p,v[0].p)),area=Math.hypot(...n)/2;if(area<1e-24){degenerateFaces++;continue;}for(let k=0;k<3;k++){v[k].area+=area/3;for(let j=0;j<3;j++)v[k].n[j]+=n[j];v[k].neighbors.add(v[(k+1)%3].id);v[k].neighbors.add(v[(k+2)%3].id);}}
 for(const v of vertices)v.n=unit(v.n);
 const mean=new Float64Array(vertices.length);let unsupportedVertices=0;
 for(const v of vertices){const t=unit(Math.abs(v.n[1])<.9?[v.n[2],0,-v.n[0]]:[0,v.n[2],-v.n[1]]),b=cross(v.n,t),A=Array.from({length:3},()=>[0,0,0]),B=[0,0,0];
  const add=(row,rhs,w)=>{for(let i=0;i<3;i++){B[i]+=w*row[i]*rhs;for(let j=0;j<3;j++)A[i][j]+=w*row[i]*row[j];}};
  for(const id of v.neighbors){const u=vertices[id],d=sub(u.p,v.p),dn=sub(u.n,v.n),x=dot(d,t),y=dot(d,b),d2=x*x+y*y;if(d2<1e-24)continue;const w=Math.max(u.area,1e-24)/d2;add([x,y,0],dot(dn,t),w);add([0,x,y],dot(dn,b),w);}
  const tensor=solve(A,B);if(tensor&&tensor.every(Number.isFinite))mean[v.id]=(tensor[0]+tensor[2])/2;else unsupportedVertices++;
 }
 return{vertices,mapping,mean,metadata:{algorithm:'area-weighted-normal-derivative-tensor-v1',sourceSHA256:mesh.sourceSHA256,topologyVertices:vertices.length,unsupportedVertices,degenerateFaces,sign:'positive convex / negative concave',dataOrigin:'geometric estimate; not bark microcurvature'}};
}
export function sampleStableCurvature(field,mesh,{actualHeightMeters=10,radiusMeters=.18,maxVisits=2048}={}){
 if(!(actualHeightMeters>0&&radiusMeters>0))throw Error('稳定曲率的物理尺度无效。');const radius=radiusMeters/actualHeightMeters*mesh.height,filtered=new Float64Array(field.vertices.length);let truncatedVertices=0,maxVisited=0;
 for(const v of field.vertices){const queue=[v.id],seen=new Set(queue);let sum=0,weight=0,at=0;
  for(;at<queue.length&&at<maxVisits;at++){const u=field.vertices[queue[at]],d2=dot(sub(u.p,v.p),sub(u.p,v.p)),w=u.area*Math.exp(-d2/Math.max(radius*radius*.5,1e-24));sum+=field.mean[u.id]*w;weight+=w;
   for(const id of u.neighbors)if(!seen.has(id)){seen.add(id);const d=sub(field.vertices[id].p,v.p);if(dot(d,d)<=radius*radius)queue.push(id);}
  }
  if(at<queue.length)truncatedVertices++;maxVisited=Math.max(maxVisited,at);filtered[v.id]=weight>0?sum/weight:field.mean[v.id];
 }
 const signed=Float32Array.from(field.mapping,id=>filtered[id]*radius),convex=Float32Array.from(signed,v=>Math.min(1,Math.max(0,v))),concave=Float32Array.from(signed,v=>Math.min(1,Math.max(0,-v)));
 return{signed,convex,concave,metadata:{...field.metadata,actualHeightMeters,radiusMeters,maxVisited,truncatedVertices,confidence:truncatedVertices||field.metadata.unsupportedVertices?'limited':'supported',neighborhood:'connected surface within physical Euclidean radius; bounded visits recorded, never joins disconnected components'}};
}
