// A bounded IC(0) preconditioner for a failed Jacobi-PCG solve. It changes only
// the preconditioner: the pinned graph, RHS and acceptance residual stay intact.
export function flowIncompleteCholesky(diagonal,edges,root,{maxWork=8000000}={}){
 if(!Number.isInteger(maxWork)||maxWork<1||maxWork>8000000)throw Error('树皮坐标预处理预算无效。');
 const n=diagonal.length;if(n>250002||edges.length>750000)throw Error('树皮坐标求解规模超出范围。');
 const graph=Array.from({length:n},()=>new Map());
 for(const[a,b,w]of edges){if(a===b||a===root||b===root)continue;if(!(w>0&&Number.isFinite(w)))throw Error('树皮坐标权重无效。');graph[a].set(b,(graph[a].get(b)||0)+w);graph[b].set(a,(graph[b].get(a)||0)+w);}
 // Reverse Cuthill-McKee is deterministic and avoids an unfavorable imported
 // vertex order turning the sparse factor into a poor long-chain smoother.
 const degree=graph.map(row=>row.size),seeds=Array.from({length:n},(_,i)=>i).sort((a,b)=>degree[a]-degree[b]||a-b),seen=new Uint8Array(n),order=[];
 for(const seed of seeds)if(!seen[seed]){const queue=[seed];seen[seed]=1;for(let at=0;at<queue.length;at++){const neighbors=Array.from(graph[queue[at]].keys()).filter(i=>!seen[i]).sort((a,b)=>degree[a]-degree[b]||a-b);for(const i of neighbors)if(!seen[i]){seen[i]=1;queue.push(i);}}for(let i=queue.length-1;i>=0;i--)order.push(queue[i]);}
 const inverse=new Int32Array(n),scale=Float64Array.from(diagonal,v=>{if(!(v>0&&Number.isFinite(v)))throw Error('树皮坐标包含未连接节点。');return Math.sqrt(v);});for(let i=0;i<n;i++)inverse[order[i]]=i;
 const columns=[],values=[],pivot=new Float64Array(n);let work=0,nonzeros=0,minPivot=Infinity,compensated=0;
 for(let i=0;i<n;i++){
  const old=order[i],entries=Array.from(graph[old],([v,w])=>[inverse[v],-w/scale[old]/scale[v]]).filter(([j])=>j<i).sort((a,b)=>a[0]-b[0]),cols=Int32Array.from(entries,e=>e[0]),row=new Float64Array(entries.length);
  let square=0;for(let q=0;q<cols.length;q++){
   const j=cols[q],otherCols=columns[j],other=values[j];let a=0,b=0,sum=0;
   while(a<q&&b<otherCols.length){if(++work>maxWork)throw Error('树皮坐标预处理超出预算。');if(cols[a]===otherCols[b]){sum+=row[a]*other[b];a++;b++;}else if(cols[a]<otherCols[b])a++;else b++;}
   row[q]=(entries[q][1]-sum)/pivot[j];square+=row[q]*row[q];
  }
  // Compensation is confined to M=L L^T, never the original linear system.
  let d=1-square;if(d<1e-10){d=1e-10;compensated++;}if(!Number.isFinite(d)||row.some(v=>!Number.isFinite(v)))throw Error('树皮坐标预处理无效。');pivot[i]=Math.sqrt(d);minPivot=Math.min(minPivot,pivot[i]);columns.push(cols);values.push(row);nonzeros+=cols.length;
 }
 const temporary=new Float64Array(n);
 return{summary:{method:'equilibrated-rcm-ic0-v1',vertices:n,nonzeros,work,maxWork,minPivot,compensated},apply(r,out){
  for(let i=0;i<n;i++){let value=r[order[i]]/scale[order[i]];for(let q=0;q<columns[i].length;q++)value-=values[i][q]*temporary[columns[i][q]];temporary[i]=value/pivot[i];}
  for(let i=n-1;i>=0;i--){temporary[i]/=pivot[i];for(let q=0;q<columns[i].length;q++)temporary[columns[i][q]]-=values[i][q]*temporary[i];}
  for(let i=0;i<n;i++)out[order[i]]=temporary[i]/scale[order[i]];
 }};
}

export function recoverFlowSolve(multiply,b,initial,precondition,{maxIterations=768,tolerance=5e-4,rhsFloor=1e-20}={}){
 const n=b.length,x=Float64Array.from(initial),r=new Float64Array(n),z=new Float64Array(n),d=new Float64Array(n),ad=new Float64Array(n);let bn=0;for(const v of b)bn+=v*v;
 const residual=()=>{multiply(x,ad);let rr=0;for(let i=0;i<n;i++){r[i]=b[i]-ad[i];rr+=r[i]*r[i];}return Math.sqrt(rr/Math.max(bn,rhsFloor));};
 let relative=residual(),iterations=0,restarts=0;if(relative<=tolerance)return{x,iterations,relativeResidual:relative,restarts};
 precondition.apply(r,z);d.set(z);let rz=0;for(let i=0;i<n;i++)rz+=r[i]*z[i];
 for(;iterations<maxIterations;){
  multiply(d,ad);let den=0;for(let i=0;i<n;i++)den+=d[i]*ad[i];if(!(den>0&&Number.isFinite(den)&&rz>0&&Number.isFinite(rz)))break;
  const alpha=rz/den;let rr=0;for(let i=0;i<n;i++){x[i]+=alpha*d[i];r[i]-=alpha*ad[i];rr+=r[i]*r[i];}iterations++;
  relative=Math.sqrt(rr/Math.max(bn,rhsFloor));let restart=false;
  if(relative<=tolerance){relative=residual();if(relative<=tolerance)return{x,iterations,relativeResidual:relative,restarts};restart=true;restarts++;}
  precondition.apply(r,z);let next=0;for(let i=0;i<n;i++)next+=r[i]*z[i];const beta=restart?0:next/rz;for(let i=0;i<n;i++)d[i]=z[i]+beta*d[i];rz=next;
 }
 relative=residual();if(!Number.isFinite(relative)||relative>tolerance)throw Error('树皮坐标稳健求解未收敛；原材质未改变。');return{x,iterations,relativeResidual:relative,restarts};
}
