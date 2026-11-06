// Preserve the original edge accumulation order and Float64 weights. The
// repeated PCG product reads packed arrays instead of allocating iterators and
// destructuring each edge on every iteration. Root-incident off-diagonals are
// excluded once, exactly as in the original Dirichlet matrix.
export function createFlowEdgeMultiply(diagonal,edges,root){
 let count=0;for(const [a,b]of edges)if(a!==root&&b!==root)count++;
 const from=new Uint32Array(count),to=new Uint32Array(count),weight=new Float64Array(count);
 let at=0;for(const[a,b,w]of edges)if(a!==root&&b!==root){from[at]=a;to[at]=b;weight[at++]=w;}
 return(x,out)=>{
  for(let i=0;i<diagonal.length;i++)out[i]=diagonal[i]*x[i];
  for(let i=0;i<count;i++){const a=from[i],b=to[i],w=weight[i];out[a]-=w*x[b];out[b]-=w*x[a];}
 };
}
