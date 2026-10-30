export function inspectSculptMesh(input,t,reference=input.position){
 const p=input.position,index=input.index,edges=new Map(),seen=new Uint8Array(t.representatives.length),bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];let fragments=0,degenerate=0,maxStretch=1,maxEdge=0;
 for(let i=0;i<p.length;i++) {const k=i%3;bounds[k]=Math.min(bounds[k],p[i]);bounds[k+3]=Math.max(bounds[k+3],p[i]);}
 for(let g=0;g<seen.length;g++)if(!seen[g]){fragments++;const queue=[g];seen[g]=1;for(let j=0;j<queue.length;j++)for(let k=t.edgesAt[queue[j]];k<t.edgesAt[queue[j]+1];k++){const n=t.edges[k];if(!seen[n]){seen[n]=1;queue.push(n);}}}
 for(let f=0;f<index.length;f+=3){const ids=[index[f],index[f+1],index[f+2]],u=[0,1,2].map(k=>p[ids[1]*3+k]-p[ids[0]*3+k]),v=[0,1,2].map(k=>p[ids[2]*3+k]-p[ids[0]*3+k]);if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-12)degenerate++;
  for(let i=0;i<3;i++){const a=ids[i],b=ids[(i+1)%3],g=t.groups[a],h=t.groups[b],key=g<h?g+':'+h:h+':'+g;edges.set(key,(edges.get(key)||0)+1);const len=Math.hypot(...[0,1,2].map(k=>p[a*3+k]-p[b*3+k])),old=Math.hypot(...[0,1,2].map(k=>reference[a*3+k]-reference[b*3+k]));maxEdge=Math.max(maxEdge,len);if(old>1e-10)maxStretch=Math.max(maxStretch,len/old);}
 }
 const size=[0,1,2].map(k=>bounds[k+3]-bounds[k]),diagonal=Math.hypot(...size);
 return {vertices:p.length/3,triangles:index.length/3,fragments,boundaryEdges:[...edges.values()].filter(n=>n===1).length,nonManifoldEdges:[...edges.values()].filter(n=>n>2).length,degenerate,maxStretch,maxEdge,sparse:maxEdge>diagonal*.2,size,bounds};
}
