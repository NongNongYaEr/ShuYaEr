const position=(mesh,i)=>Array.from(mesh.pos.subarray(i*3,i*3+3));
const distance=(a,b)=>Math.hypot(...a.map((v,c)=>v-b[c]));
export function buildUvTopology(mesh){
  const points=[],pointMap=new Map(),vertices=new Uint32Array(mesh.pos.length/3),edges=[],edgeMap=new Map(),faceEdges=new Uint32Array(mesh.indices.length),centers=[];
  const used=new Uint8Array(vertices.length);for(const i of mesh.indices){if(used[i])continue;used[i]=1;const p=position(mesh,i),key=p.join(',');if(!pointMap.has(key)){pointMap.set(key,points.length);points.push(p);}vertices[i]=pointMap.get(key);}
  for(let f=0;f<mesh.indices.length/3;f++){
    const ids=[0,1,2].map(c=>mesh.indices[f*3+c]);centers.push([0,1,2].map(k=>ids.reduce((s,i)=>s+mesh.pos[i*3+k]/3,0)));
    for(let c=0;c<3;c++){const ia=ids[c],ib=ids[(c+1)%3],a=vertices[ia],b=vertices[ib],key=a<b?a+','+b:b+','+a;let id=edgeMap.get(key);if(id==null){id=edges.length;edgeMap.set(key,id);edges.push({id,a,b,halves:[],center:points[a].map((v,k)=>(v+points[b][k])*.5),length:distance(points[a],points[b])});}edges[id].halves.push({face:f,edge:c,ia,ib,a,b});faceEdges[f*3+c]=id;}
  }
  const neighbors=centers.map(()=>[]);for(const e of edges){e.manifold=e.a!==e.b&&e.halves.length===2&&e.halves[0].a===e.halves[1].b&&e.halves[0].b===e.halves[1].a;if(e.manifold){const [a,b]=e.halves;neighbors[a.face].push({face:b.face,edge:e.id});neighbors[b.face].push({face:a.face,edge:e.id});}}
  return{mesh,points,vertices,edges,faceEdges,centers,neighbors};
}
export function resolveCutEdge(topology,mark){
  if(!Number.isInteger(mark?.face)||mark.face<0||mark.face>=topology.centers.length||!Number.isInteger(mark.edge)||mark.edge<0||mark.edge>2)throw Error('指定接缝不属于当前源模型。');
  const edge=topology.edges[topology.faceEdges[mark.face*3+mark.edge]];if(!edge.manifold)throw Error('该边已是边界或存在歧义，不能指定为内部接缝。');return edge;
}
export const edgeMark=edge=>({face:edge.halves[0].face,edge:edge.halves[0].edge});
export function validateGuideSource(topology,rules){for(const mark of rules?.seams||[])resolveCutEdge(topology,mark);for(const f of rules?.protectedFaces||[])if(!Number.isInteger(f)||f<0||f>=topology.centers.length)throw Error('UV保护范围不属于当前源模型。');return true;}
export function uvEdgeContinuous(mesh,edge,tolerance=1e-8){if(!edge.manifold)return false;const [a,b]=edge.halves;return[0,1].every(k=>Math.abs(mesh.uv[mesh.indices[a.face*3+a.edge]*2+k]-mesh.uv[mesh.indices[b.face*3+(b.edge+1)%3]*2+k])<=tolerance&&Math.abs(mesh.uv[mesh.indices[a.face*3+(a.edge+1)%3]*2+k]-mesh.uv[mesh.indices[b.face*3+b.edge]*2+k])<=tolerance);}
export function nearestCutEdge(topology,hit){
  const ids=[0,1,2].map(c=>topology.mesh.indices[hit.face*3+c]),p=[0,1,2].map(k=>ids.reduce((s,i,c)=>s+topology.mesh.pos[i*3+k]*hit.bary[c],0));let best=null,closest=Infinity;
  for(let c=0;c<3;c++){const e=topology.edges[topology.faceEdges[hit.face*3+c]];const a=topology.points[e.a],b=topology.points[e.b],delta=b.map((v,k)=>v-a[k]),length2=delta.reduce((s,v)=>s+v*v,0),t=Math.max(0,Math.min(1,delta.reduce((s,v,k)=>s+v*(p[k]-a[k]),0)/(length2||1))),d=distance(p,a.map((v,k)=>v+delta[k]*t));if(d<closest){closest=d;best=e;}}
  return best?.manifold?best:null;
}
class Heap{constructor(){this.a=[];}push(v){const a=this.a;let i=a.length;a.push(v);while(i){const j=(i-1)>>1;if(a[j][0]<=v[0])break;a[i]=a[j];i=j;}a[i]=v;}pop(){const a=this.a,v=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1][0]<a[c][0])c++;if(a[c][0]>=last[0])break;a[i]=a[c];i=c;}a[i]=last;}return v;}get length(){return this.a.length;}}
export function shortestCutPath(topology,start,end,{protectedFaces=[],uvMesh=topology.mesh}={}){
  const protectedSet=new Set(protectedFaces),blocked=e=>e.manifold&&e.halves.every(h=>protectedSet.has(h.face))&&uvEdgeContinuous(uvMesh,e),dist=new Float64Array(topology.edges.length).fill(Infinity),previous=new Int32Array(dist.length).fill(-1),heap=new Heap();if(blocked(start)||blocked(end))throw Error('接缝不能穿过受保护岛的内部。');dist[start.id]=0;heap.push([0,start.id]);
  while(heap.length){const [d,id]=heap.pop();if(d!==dist[id])continue;if(id===end.id)break;const e=topology.edges[id];for(const h of e.halves)for(let c=0;c<3;c++){const j=topology.faceEdges[h.face*3+c],next=topology.edges[j];if(j===id||!next.manifold||blocked(next))continue;const cost=distance(e.center,next.center),nd=d+Math.max(cost,1e-12);if(nd<dist[j]){dist[j]=nd;previous[j]=id;heap.push([nd,j]);}}}
  if(!Number.isFinite(dist[end.id]))throw Error('所选边之间没有可用的相连表面路径。');const path=[];for(let id=end.id;id>=0;id=previous[id]){path.push(edgeMark(topology.edges[id]));if(id===start.id)break;if(path.length>4096)throw Error('接缝路径过长，请分段标记。');}return path.reverse();
}
// Constrained region growth: never merge the two faces of a marked edge.
// Distance-ordered unions keep adjacent seam-side bands together before growing away from them.
export function partitionCutFaces(topology,active,seamIds,weights){
  const n=topology.centers.length,parent=Int32Array.from({length:n},(_,i)=>i),sizes=new Uint32Array(n).fill(1),blocked=Array(n),rings=new Int32Array(n).fill(0x7fffffff),queue=new Uint32Array(n);let end=0;
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  for(const id of seamIds){const e=topology.edges[id],[a,b]=e.halves.map(h=>h.face);if(!active[a]||!active[b])continue;(blocked[a]||=new Set()).add(b);(blocked[b]||=new Set()).add(a);for(const f of [a,b])if(rings[f]){rings[f]=0;queue[end++]=f;}}
  for(let at=0;at<end;at++){const f=queue[at];for(const h of topology.neighbors[f])if(active[h.face]&&rings[h.face]===0x7fffffff&&!seamIds.has(h.edge)){rings[h.face]=rings[f]+1;queue[end++]=h.face;}}
  const candidates=topology.edges.filter(e=>e.manifold&&!seamIds.has(e.id)&&e.halves.every(h=>active[h.face]));candidates.sort((a,b)=>{const af=a.halves.map(h=>h.face),bf=b.halves.map(h=>h.face);return Math.max(...af.map(f=>rings[f]))-Math.max(...bf.map(f=>rings[f]))||distance(topology.centers[af[0]],topology.centers[af[1]])-distance(topology.centers[bf[0]],topology.centers[bf[1]])||a.id-b.id;});
  for(const e of candidates){let a=find(e.halves[0].face),b=find(e.halves[1].face);if(a===b||weights[a]!==weights[b]||blocked[a]?.has(b))continue;if(sizes[a]<sizes[b])[a,b]=[b,a];if(blocked[b])for(const old of blocked[b]){const other=find(old);if(other===a)throw Error('接缝分区约束发生冲突。');blocked[other]?.delete(b);(blocked[other]||=new Set()).add(a);(blocked[a]||=new Set()).add(other);}blocked[b]=null;parent[b]=a;sizes[a]+=sizes[b];}
  const labels=new Int32Array(n).fill(-1),roots=new Map();for(let f=0;f<n;f++)if(active[f]){const r=find(f);if(!roots.has(r))roots.set(r,roots.size);labels[f]=roots.get(r);}return{labels,count:roots.size};
}
export function guideLinePositions(topology,uvMesh,{seams=[],protectedFaces=[]}={}){
  const marked=new Set(seams.map(m=>resolveCutEdge(topology,m).id)),protect=new Set(protectedFaces),protectedLines=[],seamLines=[];let min=[Infinity,Infinity,Infinity],maxY=-Infinity;for(const i of uvMesh.indices){for(let k=0;k<3;k++)min[k]=Math.min(min[k],uvMesh.pos[i*3+k]);maxY=Math.max(maxY,uvMesh.pos[i*3+1]);}const height=Math.max(maxY-min[1],1e-8);
  let omitted=0;function add(e,array){if(array===protectedLines&&protectedLines.length/6>=100000-marked.size){omitted++;return;}const h=e.halves[0];for(const i of [h.ia,h.ib])for(let k=0;k<3;k++)array.push((topology.mesh.pos[i*3+k]-min[k])/height+topology.mesh.normal[i*3+k]*.0001);}
  for(const e of topology.edges){if(marked.has(e.id))add(e,seamLines);else if(e.halves.some(h=>protect.has(h.face))&&!(e.manifold&&e.halves.every(h=>protect.has(h.face))&&uvEdgeContinuous(uvMesh,e)))add(e,protectedLines);}
  return{positions:Float32Array.from([...protectedLines,...seamLines]),protectedVertices:protectedLines.length/3,omittedVisualEdges:omitted};
}
