// Temporary solid-volume analysis, deliberately independent of mesh topology.
// A bark cavity is not an extra control branch. Source geometry is never edited.
const neighbours=[];
for(let z=-1;z<=1;z++)for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)if(x||y||z)neighbours.push([x,y,z,Math.hypot(x,y,z)]);
const length=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
class Heap{
 constructor(){this.a=[];}
 push(id,cost){const a=this.a;let i=a.length;a.push([id,cost]);while(i){const p=(i-1)>>1;if(a[p][1]<=cost)break;a[i]=a[p];i=p;}a[i]=[id,cost];}
 pop(){const a=this.a,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1][1]<a[c][1])c++;if(a[c][1]>=last[1])break;a[i]=a[c];i=c;}a[i]=last;}return first;}
 get length(){return this.a.length;}
}

// Fill enclosed cross-section voids in the analysis volume. A hollow, open-ended
// trunk still has an exterior cross-section; it should have one editable axis.
export function fillTrunkSectionVoids(grid,shape){
 const steps=[1,shape[0],shape[0]*shape[1]];let filled=0;
 for(let axis=0;axis<3;axis++){
  const u=(axis+1)%3,v=(axis+2)%3,w=shape[u],h=shape[v],seen=new Uint8Array(w*h),queue=new Int32Array(w*h);
  for(let slice=1;slice<shape[axis]-1;slice++){
   const base=slice*steps[axis];seen.fill(0);let head=0,tail=0;
   const add=(x,y)=>{const j=x+y*w;if(!seen[j]&&!grid[base+x*steps[u]+y*steps[v]]){seen[j]=1;queue[tail++]=j;}};
   for(let x=0;x<w;x++){add(x,0);add(x,h-1);}for(let y=1;y<h-1;y++){add(0,y);add(w-1,y);}
   while(head<tail){const j=queue[head++],x=j%w,y=(j/w)|0;if(x)add(x-1,y);if(x+1<w)add(x+1,y);if(y)add(x,y-1);if(y+1<h)add(x,y+1);}
   for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const at=base+x*steps[u]+y*steps[v];if(!seen[x+y*w]&&!grid[at]){grid[at]=1;filled++;}}
  }
 }
 return filled;
}

function simplify(points,tolerance){
 if(points.length<=2)return points;
 const a=points[0],b=points.at(-1),d=b.map((v,k)=>v-a[k]),l=d.reduce((s,v)=>s+v*v,0);let max=0,at=0;
 for(let i=1;i<points.length-1;i++){const p=points[i],t=l?Math.max(0,Math.min(1,p.reduce((s,v,k)=>s+(v-a[k])*d[k],0)/l)):0,error=Math.hypot(...p.map((v,k)=>v-a[k]-d[k]*t));if(error>max){max=error;at=i;}}
 return max<=tolerance?[a,b]:[...simplify(points.slice(0,at+1),tolerance).slice(0,-1),...simplify(points.slice(at),tolerance)];
}

export function traceTrunkMedialTree({grid,shape,origin,pitch,bounds,distance,solid,minRatio,toleranceFactor,includeRoots=false,notify=()=>{}}){
 const [nx,ny,nz]=shape,stride=nx*ny,total=grid.length,height=bounds.max[2]-bounds.min[2],offsets=neighbours.map(([x,y,z])=>x+y*nx+z*stride);
 const voxel=i=>[i%nx,Math.floor(i/nx)%ny,Math.floor(i/stride)];
 const world=i=>voxel(i).map((v,k)=>origin[k]+v*pitch);
 let root=-1,maxRadius=-1,maxDistance=0;
 for(const i of solid){maxDistance=Math.max(maxDistance,distance[i]);const z=world(i)[2];if(z>=bounds.min[2]+height*.04&&z<=bounds.min[2]+height*.15&&distance[i]>maxRadius){root=i;maxRadius=distance[i];}}
 if(root<0)root=solid.reduce((a,b)=>world(a)[2]<world(b)[2]?a:b);
 const rootPosition=world(root),floor=includeRoots?1:voxel(root)[2]-1,cost=new Float64Array(total).fill(Infinity),parent=new Int32Array(total).fill(-1),arc=new Float32Array(total),heap=new Heap();cost[root]=0;heap.push(root,0);
 const weight=new Float32Array(total);for(const i of solid)weight[i]=1+8*Math.pow(maxDistance/(distance[i]+1),1.5);
 let processed=0;
 while(heap.length){
  const [i,c]=heap.pop();if(cost[i]!==c)continue;processed++;
  for(let n=0;n<offsets.length;n++){const j=i+offsets[n];if(!grid[j]||Math.floor(j/stride)<floor)continue;const step=neighbours[n][3],next=c+step*(weight[i]+weight[j])*.5;if(next<cost[j]){cost[j]=next;parent[j]=i;arc[j]=arc[i]+step;heap.push(j,next);}}
  if(processed%16384===0)notify('沿木干中心追踪',.4+.3*processed/solid.length);
 }
 const candidates=solid.filter(i=>Number.isFinite(cost[i])).sort((a,b)=>arc[b]-arc[a]||distance[b]-distance[a]||a-b),covered=new Uint8Array(total),chosen=new Uint8Array(total),minimum=height*minRatio/pitch;
 let pruned=0,paths=0;chosen[root]=1;
 function cover(i){
  const [x,y,z]=voxel(i),r=Math.sqrt(distance[i])*1.6+2,rr=r*r,limit=Math.ceil(r);
  for(let dz=-limit;dz<=limit;dz++){const zz=z+dz;if(zz<0||zz>=nz)continue;for(let dy=-limit;dy<=limit;dy++){const yy=y+dy;if(yy<0||yy>=ny)continue;const remainder=rr-dz*dz-dy*dy;if(remainder<0)continue;const dx=Math.floor(Math.sqrt(remainder));for(let xx=Math.max(0,x-dx);xx<=Math.min(nx-1,x+dx);xx++)covered[xx+yy*nx+zz*stride]=1;}}
 }
 cover(root);
 for(const tip of candidates){
  if(covered[tip])continue;
  const chain=[];let at=tip,amount=0;
  while(at>=0&&!chosen[at]){chain.push(at);const p=parent[at];if(p>=0)amount+=length(voxel(at),voxel(p));at=p;}
  if(at<0)continue;
  const attachmentRadius=Math.sqrt(distance[at]);
  if(paths&&amount<Math.max(minimum,attachmentRadius*2.25)){for(const i of chain)cover(i);pruned++;continue;}
  for(const i of chain){chosen[i]=1;cover(i);}paths++;
  if(paths>256)throw Error('分叉候选过多，请提高短枝过滤后重新识别');
 }
 notify('整理主干与子枝',.82);
 const selected=solid.filter(i=>chosen[i]),children=new Map(selected.map(i=>[i,[]])),positions=new Map(selected.map(i=>[i,world(i)]));
 for(const i of selected)if(parent[i]>=0&&chosen[parent[i]])children.get(parent[i]).push(i);
 const ordered=selected.slice().sort((a,b)=>cost[b]-cost[a]),reach=new Map(),top=new Map(),continuation=new Map();
 for(const i of ordered){let r=0,t=positions.get(i)[2],best=-Infinity,main=-1;const p=positions.get(i),previous=positions.get(parent[i]),incoming=previous?p.map((v,k)=>v-previous[k]):[0,0,1],len=Math.hypot(...incoming);
  for(const j of children.get(i)){const q=positions.get(j),d=q.map((v,k)=>v-p[k]),edge=Math.hypot(...d),end=edge+(reach.get(j)||0),high=top.get(j)??q[2],dot=d.reduce((s,v,k)=>s+v*incoming[k],0)/(edge*len),score=end+Math.sqrt(distance[j])*pitch*2+height*.06*dot+(high-bounds.min[2])*.15;r=Math.max(r,end);t=Math.max(t,high);if(score>best){best=score;main=j;}}
  reach.set(i,r);top.set(i,t);continuation.set(i,main);
 }
 const guides=[];
 function build(start,first,owner='',attach=0){
  const nodes=[start];if(first!==undefined)nodes.push(first);let at=nodes.at(-1);while(continuation.get(at)>=0){at=continuation.get(at);nodes.push(at);}
  const id='G'+guides.length,points=[],forks=[];let chunk=[],pending=[];
  if(!owner)chunk.push([rootPosition[0],rootPosition[1],bounds.min[2]]);
  function finish(){
   for(let pass=0;pass<3;pass++){const old=chunk;chunk=old.map((p,i)=>i&&i<old.length-1?p.map((v,k)=>(old[i-1][k]+2*v+old[i+1][k])*.25):p);}
   for(const p of simplify(chunk,pitch*toleranceFactor)){if(!points.length||length(points.at(-1),p)>1e-10)points.push(p.slice());}
  }
  for(let n=0;n<nodes.length;n++){const i=nodes[n];chunk.push(positions.get(i));if(n===nodes.length-1||children.get(i).length>1){finish();if(children.get(i).length>1&&(n>0||!owner))forks.push({node:i,point:points.length-1});chunk=[positions.get(i)];}}
  if(points.length<2||length(points[0],points.at(-1))<pitch*.1)throw Error('候选控制枝过短，请调整识别设置');
  const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+length(points[i-1],points[i]));
  guides.push({id,parent:owner,attach:owner?attach:0,points,start_radius:Math.max(pitch*.5,Math.sqrt(distance[start])*pitch),end_radius:Math.max(pitch*.5,Math.sqrt(distance[nodes.at(-1)])*pitch)});
  for(const fork of forks)for(const child of children.get(fork.node))if(child!==continuation.get(fork.node))pending.push([fork.node,child,id,lengths[fork.point]/lengths.at(-1)]);
  for(const args of pending)build(...args);
 }
 build(root);
 return {guides,root:rootPosition,selected:selected.length,pruned,paths,processed};
}
