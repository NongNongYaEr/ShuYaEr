import {flowIncompleteCholesky,recoverFlowSolve} from './flow-linear-solver.js';
import {createFlowEdgeMultiply} from './flow-edge-multiply.js';
// Least-squares integration of transported local derivatives on the unchanged
// source surface. One root fixes translation; no per-branch phase jumps.
export function integrateFlowCoordinates(mesh,p,topology,labels,component,field){
 const nodeMap=new Map(),nodes=[],vertexNode=new Int32Array(p.length/3).fill(-1),edges=new Map();
 for(let f=0;f<labels.length;f++)if(labels[f]===component){for(let c=0;c<3;c++){const v=mesh.indices[f*3+c],key=topology.vertices[v];if(!nodeMap.has(key)){nodeMap.set(key,nodes.length);nodes.push(v);}vertexNode[v]=nodeMap.get(key);}for(let c=0;c<3;c++){const a=vertexNode[mesh.indices[f*3+c]],b=vertexNode[mesh.indices[f*3+(c+1)%3]];if(a!==b)edges.set(a<b?a+','+b:b+','+a,[a,b]);}}
 const n=nodes.length;if(n<2)throw Error('枝干流向缺少相连表面。');let root=0;for(let i=1;i<n;i++)if(p[nodes[i]*3+1]<p[nodes[root]*3+1])root=i;
 const diagonal=new Float64Array(n),rhs=Array.from({length:3},()=>new Float64Array(n)),edgeList=[];
 const frame=v=>{const x=Array.from(field.across.subarray(v*3,v*3+3)),y=Array.from(field.growth.subarray(v*3,v*3+3));return[x,y,[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]]];};
 for(const [a,b]of edges.values()){const va=nodes[a],vb=nodes[b],d=[0,1,2].map(k=>p[vb*3+k]-p[va*3+k]),length=Math.hypot(...d);if(length<1e-10)continue;const weight=1/Math.max(length*length,1e-10),fa=frame(va),fb=frame(vb);edgeList.push([a,b,weight]);diagonal[a]+=weight;diagonal[b]+=weight;for(let k=0;k<3;k++){const desired=d.reduce((s,v,c)=>s+v*(fa[k][c]+fb[k][c])*.5,0)*weight;rhs[k][a]-=desired;rhs[k][b]+=desired;}}
 diagonal[root]=1;for(const b of rhs)b[root]=0;
 const multiply=createFlowEdgeMultiply(diagonal,edgeList,root);
 const solutions=[],iterations=[],relativeResidual=[],recovery=[];let preconditioner;
 for(let channel=0;channel<3;channel++){const b=rhs[channel],x=new Float64Array(n),r=new Float64Array(n),z=new Float64Array(n),direction=new Float64Array(n),ad=new Float64Array(n),offset=field.position[nodes[root]*3+channel];for(let i=0;i<n;i++)x[i]=field.position[nodes[i]*3+channel]-offset;x[root]=0;multiply(x,ad);let rz=0,bNorm=0;for(let i=0;i<n;i++){r[i]=b[i]-ad[i];z[i]=r[i]/diagonal[i];direction[i]=z[i];rz+=r[i]*z[i];bNorm+=b[i]*b[i];}let step=0,relative=Infinity;
  for(;step<768;step++){let residual=0;for(let i=0;i<n;i++)residual+=r[i]*r[i];relative=Math.sqrt(residual/Math.max(bNorm,1e-20));if(relative<5e-4)break;multiply(direction,ad);let denominator=0;for(let i=0;i<n;i++)denominator+=direction[i]*ad[i];if(!(denominator>1e-30))break;const alpha=rz/denominator;let next=0;for(let i=0;i<n;i++){x[i]+=alpha*direction[i];r[i]-=alpha*ad[i];z[i]=r[i]/diagonal[i];next+=r[i]*z[i];}const beta=next/rz;for(let i=0;i<n;i++)direction[i]=z[i]+beta*direction[i];rz=next;}
  if(!Number.isFinite(relative)||relative>5e-4){preconditioner||=flowIncompleteCholesky(diagonal,edgeList,root);const solved=recoverFlowSolve(multiply,b,x,preconditioner);recovery.push({channel,initialRelativeResidual:relative,iterations:solved.iterations,relativeResidual:solved.relativeResidual,restarts:solved.restarts});x.set(solved.x);relative=solved.relativeResidual;step+=solved.iterations;}for(let i=0;i<n;i++)x[i]+=offset;solutions.push(x);iterations.push(step);relativeResidual.push(relative);
 }
 for(let v=0;v<vertexNode.length;v++)if(vertexNode[v]>=0)for(let k=0;k<3;k++)field.position[v*3+k]=solutions[k][vertexNode[v]];
 return{method:'surface-edge-least-squares-pcg-v1',vertices:n,edges:edgeList.length,iterations,relativeResidual,...(recovery.length?{recovery:{preconditioner:preconditioner.summary,channels:recovery}}:{})};
}
