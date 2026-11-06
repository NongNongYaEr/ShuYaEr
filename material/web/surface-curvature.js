// Signed geometric estimate, not a curvature map inferred from albedo/normal RGB.
// Only complete, opposed manifold edges join UV-duplicated corners.
import {buildBrushTopology} from './pixel-masks.js';
export function estimateSurfaceCurvature(mesh,{actualHeightMeters=10,radiusMeters=.1,topology=buildBrushTopology(mesh)}={}){
 if(!Number.isFinite(actualHeightMeters)||actualHeightMeters<=0||!Number.isFinite(radiusMeters)||radiusMeters<=0)throw Error('曲率物理尺度无效。');
 const count=mesh.indices.length,parent=Int32Array.from({length:count},(_,i)=>i),find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;},join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;};
 for(let f=0;f<count/3;f++)for(const h of topology.neighbors[f])if(h.opposed&&h.face>f){join(f*3+h.edge,h.face*3+(h.otherEdge+1)%3);join(f*3+(h.edge+1)%3,h.face*3+h.otherEdge);}
 const groups=new Map(),mapping=new Int32Array(count);for(let i=0;i<count;i++){const r=find(i);let g=groups.get(r);if(!g){g={id:groups.size,p:Array.from(mesh.pos.subarray(mesh.indices[i]*3,mesh.indices[i]*3+3)),n:[0,0,0],neighbors:new Set()};groups.set(r,g);}mapping[i]=g.id;}
 const vertices=[...groups.values()];for(let f=0;f<count/3;f++){const v=[0,1,2].map(c=>vertices[mapping[f*3+c]]),a=v[0].p,b=v[1].p,c=v[2].p,ab=b.map((x,k)=>x-a[k]),ac=c.map((x,k)=>x-a[k]),n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];for(let k=0;k<3;k++){for(let j=0;j<3;j++)v[k].n[j]+=n[j];v[k].neighbors.add(v[(k+1)%3].id);v[k].neighbors.add(v[(k+2)%3].id);}}
 for(const v of vertices){const l=Math.hypot(...v.n);v.n=v.n.map(x=>l>1e-20?x/l:0);}
 const radius=radiusMeters/actualHeightMeters*mesh.height,raw=new Float64Array(vertices.length);let supported=0;
 for(const v of vertices){let numerator=0,denominator=0;for(const id of v.neighbors){const d=v.p.map((x,k)=>x-vertices[id].p[k]),d2=d.reduce((s,x)=>s+x*x,0);if(d2<1e-24)continue;numerator+=d.reduce((s,x,k)=>s+x*v.n[k],0);denominator+=d2;}if(denominator>1e-24){raw[v.id]=2*numerator/denominator;supported++;}}
 // Radius-limited neighborhoods never cross disconnected or merely touching surfaces.
 const filtered=new Float64Array(vertices.length);for(const v of vertices){const queue=[v.id],seen=new Set(queue);let sum=0,weights=0;for(let at=0;at<queue.length&&at<128;at++){const u=vertices[queue[at]],d2=u.p.reduce((s,x,k)=>s+(x-v.p[k])**2,0),w=Math.exp(-d2/Math.max(radius*radius*.5,1e-24));sum+=raw[u.id]*w;weights+=w;for(const id of u.neighbors)if(!seen.has(id)&&seen.size<256){seen.add(id);const p=vertices[id].p;if(p.reduce((s,x,k)=>s+(x-v.p[k])**2,0)<=radius*radius)queue.push(id);}}filtered[v.id]=sum/Math.max(weights,1e-24);}
 const convex=new Float32Array(count),concave=new Float32Array(count),signed=new Float32Array(count);for(let i=0;i<count;i++){const k=filtered[mapping[i]]*radius;signed[i]=k;convex[i]=Math.min(1,Math.max(0,k));concave[i]=Math.min(1,Math.max(0,-k));}
 return{convex,concave,signed,metadata:{algorithm:'opposed-manifold-corner-mean-curvature-estimate-v1',sourceSHA256:mesh.sourceSHA256,actualHeightMeters,radiusMeters,corners:count,supportedVertices:supported,topologyVertices:vertices.length,sign:'positive convex / negative concave, relative to oriented geometric normals',dataOrigin:'geometric estimate; not bark microcurvature',maxNeighborhood:128}};
}
