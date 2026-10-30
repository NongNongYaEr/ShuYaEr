// Geometry analysis runs once in a worker. Coincident UV/hard-normal seams move
// together, while each original vertex keeps its own UV and normal fan.
export function sculptTopology(position,index){
 const count=position.length/3,groups=new Uint32Array(count),keys=new Map(),representatives=[];
 let min=Infinity,max=-Infinity;for(const n of position){min=Math.min(min,n);max=Math.max(max,n);}const epsilon=Math.max(1e-8,(max-min)*1e-7);
 for(let i=0;i<count;i++){const k=[0,1,2].map(a=>Math.round(position[i*3+a]/epsilon)).join(',');let g=keys.get(k);if(g===undefined){g=representatives.length;keys.set(k,g);representatives.push(i);}groups[i]=g;}
 const size=representatives.length,memberCounts=new Uint32Array(size),edgeCounts=new Uint32Array(size),faceCounts=new Uint32Array(size);
 for(const g of groups)memberCounts[g]++;
 for(let f=0;f<index.length;f+=3)for(let a=0;a<3;a++){const g=groups[index[f+a]];faceCounts[g]++;edgeCounts[g]+=2;}
 const offsets=counts=>{const o=new Uint32Array(counts.length+1);for(let i=0;i<counts.length;i++)o[i+1]=o[i]+counts[i];return o;};
 const membersAt=offsets(memberCounts),edgesAt=offsets(edgeCounts),facesAt=offsets(faceCounts),members=new Uint32Array(count),edges=new Uint32Array(index.length*2),faces=new Uint32Array(index.length),mc=membersAt.slice(),ec=edgesAt.slice(),fc=facesAt.slice();
 for(let i=0;i<count;i++)members[mc[groups[i]]++]=i;
 const faceNormals=new Float64Array(index.length),normalSums=new Float64Array(position.length);
 for(let f=0;f<index.length;f+=3){const a=index[f],b=index[f+1],c=index[f+2],u=[0,1,2].map(k=>position[b*3+k]-position[a*3+k]),v=[0,1,2].map(k=>position[c*3+k]-position[a*3+k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];faceNormals.set(n,f);
  for(let k=0;k<3;k++){const id=index[f+k],g=groups[id];faces[fc[g]++]=f/3;for(let j=0;j<3;j++)if(j!==k)edges[ec[g]++]=groups[index[f+j]];for(let j=0;j<3;j++)normalSums[id*3+j]+=n[j];}
 }
 const boxes=[],children=[],parents=[],faceLeaf=new Uint32Array(index.length/3),ordered=[];
 const build=(ids,parent=-1)=>{const node=children.length/2;children.push(-1,0);parents.push(parent);const box=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];for(const f of ids)for(let k=0;k<3;k++)for(let a=0;a<3;a++){const v=position[index[f*3+k]*3+a];box[a]=Math.min(box[a],v);box[a+3]=Math.max(box[a+3],v);}boxes.push(...box);
  if(ids.length<=16){children[node*2]=-ordered.length-1;children[node*2+1]=ids.length;for(const f of ids){ordered.push(f);faceLeaf[f]=node;}}else{const lengths=[0,1,2].map(a=>box[a+3]-box[a]),axis=lengths.indexOf(Math.max(...lengths)),centroid=f=>(position[index[f*3]*3+axis]+position[index[f*3+1]*3+axis]+position[index[f*3+2]*3+axis])/3;ids.sort((a,b)=>centroid(a)-centroid(b));const mid=ids.length>>1;children[node*2]=build(ids.slice(0,mid),node);children[node*2+1]=build(ids.slice(mid),node);}return node;};
 build(Array.from({length:index.length/3},(_,i)=>i));
 return {groups,representatives:Uint32Array.from(representatives),membersAt,members,edgesAt,edges,facesAt,faces,faceNormals,normalSums,bvhBounds:Float32Array.from(boxes),bvhChildren:Int32Array.from(children),bvhParents:Int32Array.from(parents),bvhFaces:Uint32Array.from(ordered),faceLeaf};
}
