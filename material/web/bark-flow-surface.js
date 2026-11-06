// Experimental source-surface assignment. No UV adjacency, geometry edits or
// stochastic labels. Confidence is a geometric heuristic, not a probability.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const n=Math.hypot(...v);return n>1e-20?v.map(x=>x/n):[0,0,0];};
const clamp=x=>Math.max(0,Math.min(1,x));
const at=(a,i)=>Array.from(a.subarray(i*3,i*3+3));
class Heap{
 constructor(){this.a=[];}
 push(v){const a=this.a;let i=a.length;a.push(v);while(i){const p=(i-1)>>1;if(a[p][0]<=v[0])break;a[i]=a[p];i=p;}a[i]=v;}
 pop(){const a=this.a,v=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1][0]<a[c][0])c++;if(a[c][0]>=last[0])break;a[i]=a[c];i=c;}a[i]=last;}return v;}
 get length(){return this.a.length;}
}
function tensorSolve(A,b){
 const m=A.map((v,i)=>[...v,b[i]]),scale=Math.max(...A.flat().map(Math.abs),1e-30);
 for(let c=0;c<3;c++){let p=c;for(let i=c+1;i<3;i++)if(Math.abs(m[i][c])>Math.abs(m[p][c]))p=i;
  if(Math.abs(m[p][c])<scale*1e-8)return null;[m[c],m[p]]=[m[p],m[c]];const d=m[c][c];for(let k=c;k<4;k++)m[c][k]/=d;
  for(let i=0;i<3;i++)if(i!==c){const q=m[i][c];for(let k=c;k<4;k++)m[i][k]-=q*m[c][k];}
 }return m.map(v=>v[3]);
}
export function surfaceFiberDirection(normal,axis,samples,radius){
 const projected=unit(sub(axis,normal.map(v=>v*dot(axis,normal))));if(Math.hypot(...projected)<.5)return null;
 const across=unit(cross(normal,projected)),A=Array.from({length:3},()=>[0,0,0]),B=[0,0,0];
 const add=(r,y,w)=>{for(let i=0;i<3;i++){B[i]+=w*r[i]*y;for(let j=0;j<3;j++)A[i][j]+=w*r[i]*r[j];}};
 let used=0;for(const s of samples){const x=dot(s.delta,projected),y=dot(s.delta,across),d2=x*x+y*y;if(d2<1e-20||d2>radius*radius)continue;
  const w=s.area*Math.exp(-d2/(radius*radius*.5))/Math.max(d2,1e-20);add([x,y,0],dot(s.dn,projected),w);add([0,x,y],dot(s.dn,across),w);used++;
 }
 const q=used>=3&&tensorSolve(A,B);if(!q||q.some(v=>!Number.isFinite(v)))return null;
 const [a,b,c]=q,delta=Math.hypot(a-c,2*b),l0=(a+c-delta)/2,l1=(a+c+delta)/2;
 const anisotropy=clamp(Math.abs(Math.abs(l1)-Math.abs(l0))/Math.max(Math.abs(l0)+Math.abs(l1),1e-8));
 const low=Math.abs(l0)<=Math.abs(l1)?l0:l1;
 let v=Math.abs(b)>1e-10?[b,low-a]:Math.abs(a-low)<Math.abs(c-low)?[1,0]:[0,1];const length=Math.hypot(...v);if(length<1e-12)return null;v=v.map(x=>x/length);
 let direction=projected.map((x,k)=>x*v[0]+across[k]*v[1]);if(dot(direction,projected)<0)direction=direction.map(x=>-x);
 const alignment=Math.abs(dot(direction,projected));return{direction,confidence:anisotropy*clamp((alignment-.25)/.75),anisotropy,used};
}

export function refineSurfaceFlow(mesh,record,field,{topology,labels,selected,p,branches,read,readPair,actualHeightMeters,transition,progress=()=>{}}){
 const count=mesh.indices.length/3;if(count>250000)throw Error('表面走势实验当前支持25万三角面以内。');
 const options=record.surface,faces=Array(count),faceBranch=new Int32Array(count).fill(-1),confidence=new Float32Array(count),seedBins=new Map(),nearestIds=new Int32Array(count).fill(-1);
 let volume=0;for(let f=0;f<count;f++)if(labels[f]===selected){const v=[0,1,2].map(k=>at(p,mesh.indices[f*3+k]));volume+=dot(v[0],cross(v[1],v[2]));}const orientation=volume<0?-1:1;
 let eligibleCount=0;const allowedVertices=new Uint8Array(field.branchIds.length);
 for(let f=0;f<count;f++)if(labels[f]===selected){
  const ids=[0,1,2].map(k=>mesh.indices[f*3+k]),v=ids.map(i=>at(p,i)),n=cross(sub(v[1],v[0]),sub(v[2],v[0])),area=Math.hypot(...n)/2;
  if(area<1e-20)continue;const center=[0,1,2].map(k=>v.reduce((sum,q)=>sum+q[k]/3,0)),normal=unit(n).map(v=>v*orientation),pair=readPair(center);
  const unary=hit=>{const radius=Math.max(hit.expectedRadius,1e-5),radial=unit(sub(center,hit.position)),alignment=clamp(dot(radial,normal)),tip=hit.distance>hit.radius+radius*.1?(hit.distance-hit.radius)/radius:0;
   return Math.abs(hit.radius/radius-1)*.55+(1-alignment)*.8+tip*.7+Math.abs(dot(hit.frame.y,normal))*.4;};
  const ranked=pair.filter(Boolean).map(hit=>({hit,cost:unary(hit)})).sort((a,b)=>a.cost-b.cost||a.hit.branch-b.hit.branch);
  const best=ranked[0],margin=ranked[1]?clamp((ranked[1].cost-best.cost)/(ranked[1].cost+.15)):1;
  for(const v of ids)allowedVertices[v]=1;faces[f]={ids,center,normal,area,margin,unary:branch=>unary(read(center,branch))};nearestIds[f]=pair[0].branch;eligibleCount++;
  // Sparse, spatially spread reliable seeds; not every nearest-axis face is fixed.
  if(best.cost<1.3){const branch=branches[best.hit.branch],bin=Math.min(3,Math.floor(best.hit.s/Math.max(branch.length,1e-8)*4)),angle=Math.floor((Math.atan2(dot(sub(center,best.hit.position),best.hit.frame.z),dot(sub(center,best.hit.position),best.hit.frame.x))+Math.PI)/(Math.PI/2))%4,key=best.hit.branch+':'+bin+':'+angle,quality=best.cost+(1-margin)*.3,old=seedBins.get(key);
   if(!old||quality<old.quality)seedBins.set(key,{face:f,branch:best.hit.branch,quality});
  }
 }
 if(!seedBins.size)throw Error('未找到可靠的枝干归属种子；请改用原流向或补充方向约束。');
 const costs=new Float64Array(count).fill(Infinity),secondCosts=new Float64Array(count).fill(Infinity),secondIds=new Int32Array(count).fill(-1),heap=new Heap();
 const offer=(f,branch,cost)=>{if(faceBranch[f]===branch){if(cost>=costs[f])return;costs[f]=cost;}
  else if(secondIds[f]===branch){if(cost>=secondCosts[f])return;secondCosts[f]=cost;}
  else if(cost<costs[f]){secondCosts[f]=costs[f];secondIds[f]=faceBranch[f];costs[f]=cost;faceBranch[f]=branch;}
  else if(cost<secondCosts[f]){secondCosts[f]=cost;secondIds[f]=branch;}else return;
  if(secondCosts[f]<costs[f]){[costs[f],secondCosts[f]]=[secondCosts[f],costs[f]];[faceBranch[f],secondIds[f]]=[secondIds[f],faceBranch[f]];}
  heap.push([cost,f,branch]);
 };
 for(const seed of seedBins.values())offer(seed.face,seed.branch,seed.quality*.0002);
 let updates=0;const maxUpdates=Math.max(count*64,1024);
 while(heap.length){const [cost,f,branch]=heap.pop();if(!((faceBranch[f]===branch&&cost===costs[f])||(secondIds[f]===branch&&cost===secondCosts[f])))continue;
  if(++updates>maxUpdates)throw Error('表面走势传播超过预算，请降低识别细度；当前材质未改变。');
  const a=faces[f];for(const h of topology.neighbors[f]){const b=faces[h.face];if(!b)continue;const delta=sub(b.center,a.center),step=Math.hypot(...delta),bend=1-clamp(dot(a.normal,b.normal)),concave=Math.max(0,-dot(sub(b.normal,a.normal),unit(delta)));
   offer(h.face,branch,cost+Math.max(step,1e-8)*(1+.7*Math.min(b.unary(branch),5)+options.barrier*concave+1.5*bend));
  }
 }
 progress(.45);
 const votes=new Map(),faceDirections=new Array(count);let changedFaces=0,uncertainFaces=0,fiberFaces=0,truncatedNeighborhoods=0;
 const radius=options.fiberRadiusCm/100/actualHeightMeters;
 for(let f=0;f<count;f++){const face=faces[f],branch=faceBranch[f];if(!face||branch<0)continue;
  const best=read(face.center,branch),radiusAt=Math.max(best.expectedRadius,1e-4),gap=Number.isFinite(secondCosts[f])?clamp((secondCosts[f]-costs[f])/Math.max(radiusAt*.35,1e-5)):1;
  confidence[f]=clamp((.55*gap+.45*face.margin)/(1+face.unary(branch)*.5));if(confidence[f]<.3)uncertainFaces++;if(branch!==nearestIds[f])changedFaces++;
  let direction=best.frame.y;
  if(options.fiberStrength>0){const queue=[f],seen=new Set(queue),samples=[];let i=0;
   for(;i<queue.length&&i<48;i++){const j=queue[i],other=faces[j];if(j!==f)samples.push({delta:sub(other.center,face.center),dn:sub(other.normal,face.normal),area:other.area});
    for(const h of topology.neighbors[j])if(faces[h.face]&&faceBranch[h.face]===branch&&!seen.has(h.face)&&Math.hypot(...sub(faces[h.face].center,face.center))<=radius){seen.add(h.face);queue.push(h.face);}
   }if(i<queue.length)truncatedNeighborhoods++;
   const fiber=surfaceFiberDirection(face.normal,direction,samples,radius);if(fiber&&fiber.confidence>.15){const amount=options.fiberStrength*fiber.confidence*.65;direction=unit(direction.map((v,k)=>v*(1-amount)+fiber.direction[k]*amount));fiberFaces++;}
  }faceDirections[f]=direction;
  for(const v of face.ids){const key=topology.vertices[v];let vote=votes.get(key);if(!vote){vote={labels:new Map(),directions:[0,0,0],weight:0,confidence:0};votes.set(key,vote);}vote.labels.set(branch,(vote.labels.get(branch)||0)+face.area);for(let k=0;k<3;k++)vote.directions[k]+=direction[k]*face.area;vote.weight+=face.area;vote.confidence+=confidence[f]*face.area;}
 }
 const vertexConfidence=new Float32Array(mesh.pos.length/3);let supported=0;
 for(let v=0;v<field.branchIds.length;v++){const vote=allowedVertices[v]&&votes.get(topology.vertices[v]);if(!vote)continue;const branch=[...vote.labels].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0][0],point=at(p,v),hit=read(point,branch),axis=hit.frame.y,y=Math.hypot(...vote.directions)>1e-12?unit(vote.directions):axis;
  // Rotate the transported cross direction into the refined axis without a spin.
  const rotation=cross(axis,y),c=dot(axis,y);let x=hit.frame.x;if(c>-.9999)x=x.map((q,k)=>q+cross(rotation,x)[k]+cross(rotation,cross(rotation,x))[k]/(1+c));
  x=unit(sub(x,y.map(q=>q*dot(x,y))));const z=unit(cross(x,y)),d=sub(point,hit.position);let q=[dot(d,x),branches[branch].base+hit.s+dot(d,y),dot(d,z)];
  if(branches[branch].parentFrame&&transition>0){const b=branches[branch],t=clamp(hit.s/Math.max(b.start_radius*2*transition,1e-8)),w=t*t*(3-2*t),parent=b.parentFrame,delta=sub(point,b.points[0]),parentQ=[dot(delta,parent.x),b.base+dot(delta,parent.y),dot(delta,parent.z)];q=q.map((value,k)=>parentQ[k]*(1-w)+value*w);}
  field.position.set(q,v*3);field.growth.set(y,v*3);field.across.set(x,v*3);field.branchIds[v]=branch;vertexConfidence[v]=vote.confidence/vote.weight;supported++;
 }
 field.faceBranch=faceBranch;field.faceConfidence=confidence;field.confidence=vertexConfidence;
 field.summary={...field.summary,algorithm:'surface-geodesic-fiber-flow-v2',supportedVertices:supported,fallbackVertices:field.branchIds.length-supported,surfaceAssignment:{algorithm:'bounded-two-label-source-geodesic-v1',seedFaces:seedBins.size,orientation,seededBranches:new Set([...seedBins.values()].map(s=>s.branch)).size,eligibleFaces:eligibleCount,assignedFaces:faceBranch.reduce((n,v)=>n+(v>=0),0),changedFromNearestFaces:changedFaces,uncertainFaces,updates,maxUpdates,fiberFaces,truncatedNeighborhoods,fiberRadiusCm:options.fiberRadiusCm,fiberStrength:options.fiberStrength,barrier:options.barrier,confidence:'heuristic cost margin, not calibrated probability',unsupported:'non-main or ambiguous manifold components remain fallback; not semantic organ recognition'}};
 progress(.8);return field;
}
