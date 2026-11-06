import {sourceRotation,rotationNeighborhoods,smoothRotations,quaternionDirection} from './bark-flow-continuity.js';
import {createFlowEdgeMultiply} from './flow-edge-multiply.js';
// Local/global intrinsic metric relaxation. Coordinates alone are optimized;
// source positions, connectivity, UVs and recorded branch ownership stay intact.
import {triangleFlowMetric,triangleFlowJacobian,measureFlowDistortion} from './bark-flow-metric.js';
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const at=(a,i)=>Array.from(a.subarray(i*3,i*3+3));
export function relaxFlowCoordinates(mesh,p,topology,labels,component,field,{steps=16,guidance=.08,continuity=0,normalizedRadius=.018,progress=()=>{}}={}){
 if(!Number.isFinite(continuity)||continuity<0||continuity>1)throw Error('衔接平滑强度无效。');
 const nodeMap=new Map(),vertices=[],map=new Int32Array(p.length/3).fill(-1),faces=[],original=field.position.slice();
 for(let f=0;f<labels.length;f++)if(labels[f]===component){const ids=Array.from(mesh.indices.subarray(f*3,f*3+3));for(const v of ids){const key=topology.vertices[v];if(!nodeMap.has(key)){nodeMap.set(key,vertices.length);vertices.push(v);}map[v]=nodeMap.get(key);}const metric=triangleFlowMetric(p,p,ids);if(metric)faces.push({ids,nodes:ids.map(v=>map[v]),metric,sourceFace:f});}
 const n=vertices.length,edges=[],diagonal=new Float64Array(n),rhs=Array.from({length:3},()=>new Float64Array(n));
 let root=0;for(let i=1;i<n;i++)if(p[vertices[i]*3+1]<p[vertices[root]*3+1])root=i;
 for(const face of faces){const m=face.metric,coords=[[0,0],[m.length,0],[m.u,m.h]],target=field=>{const x=[0,0,0],y=[0,0,0];for(const v of face.ids){const a=at(field.across,v),b=at(field.growth,v),c=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];for(let k=0;k<3;k++){x[k]+=dot([a,b,c][k],m.x)/3;y[k]+=dot([a,b,c][k],m.y)/3;}}return[x,y];};face.target=target(field);face.edges=[];
  for(let c=0;c<3;c++){const d=(c+1)%3,a=face.nodes[c],b=face.nodes[d],dx=coords[d][0]-coords[c][0],dy=coords[d][1]-coords[c][1],w=m.area/Math.max(dx*dx+dy*dy,1e-20);edges.push([a,b,w]);diagonal[a]+=w;diagonal[b]+=w;face.edges.push({a,b,dx,dy,w});}
 }
 diagonal[root]=1;
 const multiply=createFlowEdgeMultiply(diagonal,edges,root);
 let neighborhoods=null;if(continuity>0){try{neighborhoods=rotationNeighborhoods(mesh,p,topology,faces,{radius:normalizedRadius});}catch(error){if(error.code!=='FLOW_NEIGHBORHOOD_BUDGET')throw error;const maxVisits=Math.floor(1000000/faces.length);if(maxVisits<1)throw error;neighborhoods=rotationNeighborhoods(mesh,p,topology,faces,{radius:normalizedRadius,maxVisits});Object.assign(neighborhoods.summary,{budgetLimited:true,requestedMaxVisits:96,effectiveMaxVisits:maxVisits});}}
 const iterations=[],residuals=[];
 for(let outer=0;outer<steps;outer++){
  for(const b of rhs)b.fill(0);
  if(continuity>0){
   const rotations=faces.map(face=>{const m=triangleFlowJacobian(field.position,face.ids,face.metric),a=m.j0,b=m.j1,aa=dot(a,a),bb=dot(b,b),ab=dot(a,b),s=Math.sqrt(Math.max(aa*bb-ab*ab,1e-24)),t=Math.sqrt(aa+bb+2*s),det=(aa+s)*(bb+s)-ab*ab;let x,y;if(det>1e-16){x=a.map((v,k)=>t*((bb+s)*v-ab*b[k])/det);y=b.map((v,k)=>t*((aa+s)*v-ab*a[k])/det);}else [x,y]=face.target;return sourceRotation(face.metric,x,y);});
   const regular=smoothRotations(rotations,neighborhoods,continuity);
   for(let i=0;i<faces.length;i++){const face=faces[i],x=quaternionDirection(regular[i],face.metric.x).map((v,k)=>v*(1-guidance)+face.target[0][k]*guidance),y=quaternionDirection(regular[i],face.metric.y).map((v,k)=>v*(1-guidance)+face.target[1][k]*guidance);for(const e of face.edges)for(let k=0;k<3;k++){const d=(x[k]*e.dx+y[k]*e.dy)*e.w;rhs[k][e.a]-=d;rhs[k][e.b]+=d;}}
  }else{
  for(const face of faces){const m=triangleFlowJacobian(field.position,face.ids,face.metric),a=m.j0,b=m.j1,aa=dot(a,a),bb=dot(b,b),ab=dot(a,b),s=Math.sqrt(Math.max(aa*bb-ab*ab,1e-24)),t=Math.sqrt(aa+bb+2*s),det=(aa+s)*(bb+s)-ab*ab;
   // Polar factor J (J^T J)^(-1/2); deterministic source-frame fallback for
   // a rank-deficient initial map, never division by a collapsed singular value.
   let x,y;if(det>1e-16){x=a.map((v,k)=>t*((bb+s)*v-ab*b[k])/det);y=b.map((v,k)=>t*((aa+s)*v-ab*a[k])/det);}else [x,y]=face.target;
   x=x.map((v,k)=>v*(1-guidance)+face.target[0][k]*guidance);y=y.map((v,k)=>v*(1-guidance)+face.target[1][k]*guidance);
   for(const e of face.edges)for(let k=0;k<3;k++){const d=(x[k]*e.dx+y[k]*e.dy)*e.w;rhs[k][e.a]-=d;rhs[k][e.b]+=d;}
  }
  }
  let total=0,worst=0;
  for(let k=0;k<3;k++){const b=rhs[k],offset=original[vertices[root]*3+k],x=Float64Array.from(vertices,v=>field.position[v*3+k]-offset),r=new Float64Array(n),z=new Float64Array(n),d=new Float64Array(n),ad=new Float64Array(n);x[root]=0;b[root]=0;multiply(x,ad);let rz=0,bn=0;for(let i=0;i<n;i++){r[i]=b[i]-ad[i];z[i]=r[i]/diagonal[i];d[i]=z[i];rz+=r[i]*z[i];bn+=b[i]*b[i];}let relative=Infinity,step=0;
   for(;step<768;step++){let rr=0;for(let i=0;i<n;i++)rr+=r[i]*r[i];relative=Math.sqrt(rr/Math.max(bn,1e-24));if(relative<5e-4)break;multiply(d,ad);let den=0;for(let i=0;i<n;i++)den+=d[i]*ad[i];if(!(den>1e-30))break;const alpha=rz/den;let next=0;for(let i=0;i<n;i++){x[i]+=alpha*d[i];r[i]-=alpha*ad[i];z[i]=r[i]/diagonal[i];next+=r[i]*z[i];}const beta=next/rz;for(let i=0;i<n;i++)d[i]=z[i]+beta*d[i];rz=next;}
   if(!Number.isFinite(relative)||relative>5e-4)throw Error('树皮坐标保形求解未收敛；原材质未改变。');total+=step;worst=Math.max(worst,relative);for(let v=0;v<map.length;v++)if(map[v]>=0)field.position[v*3+k]=x[map[v]]+offset;
  }
  iterations.push(total);residuals.push(worst);progress((outer+1)/steps);
 }
 return{method:'surface-local-global-metric-v1',steps,guidance,...(neighborhoods?{continuity,neighborhoods:neighborhoods.summary}:{}),iterations,relativeResidual:residuals,distortion:measureFlowDistortion(mesh,p,field.position,f=>labels[f]===component).summary};
}
