import {buildUvTopology,uvEdgeContinuous} from './uv-topology.js';
import {strictUvCharts,measureUvClearance,clearanceAtResolution} from './uv-clearance.js';
import {analyzeUV} from './uv-analysis.js';


// Move chart boundaries into local empty space and smooth their displacements
// across interior UV nodes. Welds and cuts both remain exactly as supplied.
export function growUvBoundary(input,{resolution=2048,padding=3,onProgress=()=>{},
 targetCoverage=1,maxIterations=20,maxDurationMs=24000,strainCap=1.6,maxStretch=1.35,absCap=1.6,
 projectedMotion=false,densityBudget=null,p95Ceiling=Infinity,projectionPasses=0,boundaryStep=2.5}={}){
 if(!input?.indices?.length||input.indices.length>150000||!Number.isInteger(resolution)||resolution<1024||
  !Number.isInteger(padding)||padding<0||padding>48)return null;
 const old=analyzeUV(input,{resolution});
 if(old.summedUvTriangleArea>=targetCoverage||old.overlap||old.outOfRangeFaces||old.zeroUvFaces)return null;
 const p95Limit=Math.min(old.anisotropy.p95*1.15,Math.max(old.anisotropy.p95,p95Ceiling));
 const localDensityLimit=maxStretch*maxStretch;
 let conditionCap=absCap;
 const mesh={...input,uv:input.uv.slice()},step=boundaryStep,deadline=Date.now()+maxDurationMs;
 const {labels,count}=strictUvCharts(mesh),topology=buildUvTopology(mesh);
 const chartGroups=new Map(),nodes=[],vertexToNode=new Int32Array(mesh.uv.length/2).fill(-1),
  edges=new Map(),triangles=[];
 for(let f=0;f<labels.length;f++){
  const t=[];
  for(let k=0;k<3;k++){
   const c=f*3+k,i=mesh.indices[c],uv=mesh.uv.subarray(i*2,i*2+2),key=[labels[f],topology.vertices[i],...uv].join(',');
   let n=chartGroups.get(key);
   if(n==null){n=nodes.length;chartGroups.set(key,n);nodes.push({x:uv[0]*resolution,y:uv[1]*resolution,adj:new Set(),chart:labels[f],boundary:false});}
   if(vertexToNode[i]>=0&&vertexToNode[i]!==n)return null;
   vertexToNode[i]=n;t.push(n);
  }
  const [a,b,c]=t.map(i=>nodes[i]),x=b.x-a.x,y=b.y-a.y,z=c.x-a.x,w=c.y-a.y,d=x*w-y*z;
  if(!d)return null;
  let world=null;
  if(absCap){
   const [a,b,c]=[0,1,2].map(k=>mesh.pos.subarray(mesh.indices[f*3+k]*3,mesh.indices[f*3+k]*3+3));
   const u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),l=Math.hypot(...u),dot=u.reduce((s,u,k)=>s+u*v[k],0),
    cross=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);
   if(l>0&&cross>0){
    const b0=-dot/(cross*l),d0=l/cross,p=x/l,q=x*b0+z*d0,r=y/l,s=y*b0+w*d0,
     trace=(p*p+q*q+r*r+s*s)/Math.abs(p*s-r*q);
    world=[1/l,b0,d0,trace*1.00001];
   }
  }
  triangles.push({t,inv:[w/d,-z/d,-y/d,x/d],world,densityCap:Math.min(localDensityLimit,densityBudget?.faceLimits[f]??Infinity)});
  const sign=Math.sign(d);
  for(let k=0;k<3;k++){
   const a=t[k],b=t[(k+1)%3],key=a<b?a+','+b:b+','+a;
   if(!edges.has(key))edges.set(key,[]);
   edges.get(key).push({a,b,sign,chart:labels[f]});
   nodes[a].adj.add(b);nodes[b].adj.add(a);
  }
 }
 const boundary=[...edges.values()].filter(e=>e.length===1).map(e=>e[0]);
 for(const e of boundary)nodes[e.a].boundary=nodes[e.b].boundary=true;
 const n=nodes.length,current=new Float64Array(n*2),ref=new Float64Array(n*2),boundaryIds=[];
 for(let i=0;i<n;i++){
  current[2*i]=nodes[i].x;current[2*i+1]=nodes[i].y;
  if(nodes[i].boundary)boundaryIds.push(i);
 }
 ref.set(current);
 const neighbors=nodes.map((node,i)=>[...node.adj].map(j=>[j,1/Math.max(.1,Math.hypot(ref[2*i]-ref[2*j],ref[2*i+1]-ref[2*j+1]))]));
 const gap=2*padding+1+.045,border=padding+.54,neighborhood=gap+2*step,bucket=16;
 const delta=new Float64Array(n*2),next=new Float64Array(n*2),nx=new Float64Array(n*2),lim=new Float64Array(n),damp=new Float64Array(n);
 const halfplanes=projectedMotion?Array.from({length:n},()=>[]):null;
 const bins=Math.ceil(resolution/bucket)+2,key=(x,y)=>x+1+(y+1)*bins;
 // Axes of the segment-difference polygon and square gutter are sufficient
 // for the exact L-infinity separation of two disjoint line segments.
 function separatingAxis(e,q){
  let separation=-Infinity,normalX=0,normalY=0;
  function axis(nx,ny){
   const size=Math.abs(nx)+Math.abs(ny);
   if(!size)return;
   nx/=size;ny/=size;
   const a=e.ax*nx+e.ay*ny,b=e.bx*nx+e.by*ny,c=q.ax*nx+q.ay*ny,d=q.bx*nx+q.by*ny;
   const positive=Math.min(c,d)-Math.max(a,b),negative=Math.min(a,b)-Math.max(c,d);
   if(Math.max(positive,negative)<=separation)return;
   separation=Math.max(positive,negative);
   normalX=positive>=negative?nx:-nx;
   normalY=positive>=negative?ny:-ny;
  }
  axis(1,0);axis(0,1);axis(e.by-e.ay,e.ax-e.bx);axis(q.by-q.ay,q.ax-q.bx);
  return [separation,normalX,normalY];
 }
 // Keep the moved segment endpoints separated on an original separating axis.
 // Only motion toward the other segment consumes slack. Tangential motion remains free.
 function addMotionPlanes(edge,x,y,slack){
  // The rear endpoint can use its existing distance to the leading plane.
  // Each endpoint's limit still contains zero, so damping stays feasible.
  const span=projectionPasses?(edge.bx-edge.ax)*x+(edge.by-edge.ay)*y:0;
  halfplanes[edge.a].push(x,y,slack+Math.max(0,span));
  halfplanes[edge.b].push(x,y,slack+Math.max(0,-span));
 }
 function edgeCaps(){
  const grid=new Map(),samples=[];
  for(const {a,b,sign,chart} of boundary){
   const ax=current[2*a],ay=current[2*a+1],bx=current[2*b],by=current[2*b+1],
    minX=Math.min(ax,bx),maxX=Math.max(ax,bx),minY=Math.min(ay,by),maxY=Math.max(ay,by);
   samples.push({a,b,ax,ay,bx,by,minX,maxX,minY,maxY,chart});
   const id=samples.length-1;
   for(let x=Math.floor(minX/bucket);x<=Math.floor(maxX/bucket);x++)
    for(let y=Math.floor(minY/bucket);y<=Math.floor(maxY/bucket);y++){
     const k=key(x,y);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(id);
    }
   const x=(by-ay)*sign,y=(ax-bx)*sign;
   nx[2*a]+=x;nx[2*a+1]+=y;nx[2*b]+=x;nx[2*b+1]+=y;
  }
  for(const node of boundaryIds){
   const norm=Math.hypot(nx[2*node],nx[2*node+1]);
   if(norm){nx[2*node]/=norm;nx[2*node+1]/=norm;}
  }
  const tested=new Int32Array(samples.length);
  for(let id=0;id<samples.length;id++){
   const e=samples[id];
   for(let x=Math.floor((e.minX-neighborhood)/bucket);x<=Math.floor((e.maxX+neighborhood)/bucket);x++)
    for(let y=Math.floor((e.minY-neighborhood)/bucket);y<=Math.floor((e.maxY+neighborhood)/bucket);y++){
     const candidates=grid.get(key(x,y));if(!candidates)continue;
     for(const j of candidates){
      if(j<=id||tested[j]===id+1)continue;
      tested[j]=id+1;
      const q=samples[j];
      if(e.a===q.a||e.b===q.b||e.a===q.b||e.b===q.a)continue;
      const sep=e.chart===q.chart ? .055 : gap,wanted=sep+2*step;
      if(e.minX-q.maxX>wanted||q.minX-e.maxX>wanted||e.minY-q.maxY>wanted||q.minY-e.maxY>wanted)continue;
      const [dist,nxEdge,nyEdge]=separatingAxis(e,q);
      if(dist>=wanted)continue;
      const contribution=(node,sign)=>Math.max(0,(nxEdge*nx[2*node]+nyEdge*nx[2*node+1])*sign)*lim[node];
      const ca=contribution(e.a,1),cb=contribution(e.b,1),cc=contribution(q.a,-1),cd=contribution(q.b,-1);
      const front=Math.max(ca,cb),back=Math.max(cc,cd),closing=front+back,slack=Math.max(0,(dist-sep)*.92);
      if(halfplanes){
       // Reserve a nonnegative portion of the separation for each side.
       // Later strain limiting can shorten either displacement safely.
       const share=closing>0?.15+.7*front/closing:.5;
       addMotionPlanes(e,nxEdge,nyEdge,slack*share);
       addMotionPlanes(q,-nxEdge,-nyEdge,slack*(1-share));
       continue;
      }
      if(closing<=slack)continue;
      const scale=slack/closing;
      if(ca>0)lim[e.a]*=scale;
      if(cb>0)lim[e.b]*=scale;
      if(cc>0)lim[q.a]*=scale;
      if(cd>0)lim[q.b]*=scale;
     }
    }
  }
 }
 function projectStep(i,u,v){
  const rows=halfplanes[i],x=current[2*i],y=current[2*i+1];
  const minX=Math.min(0,border-x),minY=Math.min(0,border-y),
   maxX=Math.max(0,resolution-border-x),maxY=Math.max(0,resolution-border-y);
  let dx=step*u,dy=step*v;
  for(let pass=0;pass<8;pass++){
   dx=Math.min(maxX,Math.max(minX,dx));
   dy=Math.min(maxY,Math.max(minY,dy));
   for(let row=0;row<rows.length;row+=3){
    const a=rows[row],b=rows[row+1],excess=a*dx+b*dy-rows[row+2];
    if(excess<=1e-8)continue;
    const shift=excess/(a*a+b*b);
    dx-=a*shift;dy-=b*shift;
   }
  }
  // A short projection sweep can leave residual violations. Scaling toward
  // zero satisfies every plane because the original point is feasible.
  let fit=Math.min(1,step/Math.hypot(dx,dy));
  for(let row=0;row<rows.length;row+=3){
   const toward=rows[row]*dx+rows[row+1]*dy;
   if(toward>rows[row+2]+1e-8)fit=Math.min(fit,rows[row+2]/toward);
  }
  if(dx)fit=Math.min(fit,Math.max(0,dx>0?resolution-border-x:x-border)/Math.abs(dx));
  if(dy)fit=Math.min(fit,Math.max(0,dy>0?resolution-border-y:y-border)/Math.abs(dy));
  delta[2*i]=dx*fit;delta[2*i+1]=dy*fit;
 }
 function estimate(){
  nx.fill(0);lim.fill(step);delta.fill(0);
  if(halfplanes)for(const i of boundaryIds)halfplanes[i].length=0;
  edgeCaps();
  for(const i of boundaryIds){
   const x=current[2*i],y=current[2*i+1],norm=Math.hypot(nx[2*i],nx[2*i+1]);
   if(!norm)continue;
   const u=nx[2*i]/norm,v=nx[2*i+1]/norm;
   if(halfplanes){projectStep(i,u,v);continue;}
   const mov=Math.max(0,Math.min(lim[i],u>0?(resolution-border-x)/u:u<0?(border-x)/u:Infinity,
     v>0?(resolution-border-y)/v:v<0?(border-y)/v:Infinity));
   delta[2*i]=u*mov;delta[2*i+1]=v*mov;
  }
  for(let k=0;k<35;k++){
   next.set(delta);
   for(let i=0;i<n;i++)if(!nodes[i].boundary){
    let x=0,y=0,sum=0;
    for(const [j,w] of neighbors[i]){sum+=w;x+=delta[2*j]*w;y+=delta[2*j+1]*w;}
    next[2*i]=x/(sum||1);next[2*i+1]=y/(sum||1);
   }
   delta.set(next);
  }
 }
 // Repair projected triangle constraints by moving interior nodes only.
 // Boundary nodes retain their independently verified separation motion.
 function projectInterior(){
  for(let i=0;i<n*2;i++)next[i]=current[i]+delta[i];
  const ratioCap=conditionCap+1/conditionCap;
  function correct(a,b,c,x,y,z,w,excess){
   if(!(excess>0))return;
   const freeA=!nodes[a].boundary,freeB=!nodes[b].boundary,freeC=!nodes[c].boundary;
   if(!(freeA||freeB||freeC))return;
   const gx=-(x+z),gy=-(y+w);
   const norm=(freeA?gx*gx+gy*gy:0)+(freeB?x*x+y*y:0)+(freeC?z*z+w*w:0);
   if(norm<1e-20)return;
   const alpha=Math.min(.8*excess/norm,.35/Math.sqrt(norm));
   if(freeA){next[2*a]-=gx*alpha;next[2*a+1]-=gy*alpha;}
   if(freeB){next[2*b]-=x*alpha;next[2*b+1]-=y*alpha;}
   if(freeC){next[2*c]-=z*alpha;next[2*c+1]-=w*alpha;}
  }
  for(let pass=0;pass<projectionPasses;pass++){
   for(const {t:[a,b,c],inv:[i00,i01,i10,i11],world,densityCap} of triangles){
    if(nodes[a].boundary&&nodes[b].boundary&&nodes[c].boundary)continue;
    if(world){
     const [wa,wb,wd,baseCap]=world,cap=Math.max(baseCap,ratioCap);
     const x=next[2*b]-next[2*a],y=next[2*b+1]-next[2*a+1],
      z=next[2*c]-next[2*a],w=next[2*c+1]-next[2*a+1];
     const p=x*wa,q=x*wb+z*wd,r=y*wa,s=y*wb+w*wd;
     const det=p*s-r*q, signed=cap*Math.sign(det);
     const residual=p*p+q*q+r*r+s*s-cap*Math.abs(det);
     if(residual>0){
      const dp=2*p-signed*s,dq=2*q+signed*r,dr=2*r+signed*q,ds=2*s-signed*p;
      correct(a,b,c,dp*wa+dq*wb,dr*wa+ds*wb,dq*wd,ds*wd,residual);
     }
    }
    const x=next[2*b]-next[2*a],y=next[2*b+1]-next[2*a+1],
     z=next[2*c]-next[2*a],w=next[2*c+1]-next[2*a+1];
    const p=x*i00+z*i10,q=x*i01+z*i11,r=y*i00+w*i10,s=y*i01+w*i11;
    const det=p*s-r*q;
    const lower=1/localDensityLimit,upper=densityCap;
    if(det>upper||det<lower){
     const sign=det>upper?1:-1;
     const dp=s*sign,dq=-r*sign,dr=-q*sign,ds=p*sign;
     correct(a,b,c,dp*i00+dq*i01,dr*i00+ds*i01,dp*i10+dq*i11,dr*i10+ds*i11,Math.max(det-upper,lower-det));
    }
   }
  }
  for(let i=0;i<n;i++){
   if(nodes[i].boundary)continue;
   const dx=next[2*i]-current[2*i],dy=next[2*i+1]-current[2*i+1],s=Math.min(1,(step*1.5)/Math.max(1e-12,Math.hypot(dx,dy)));
   delta[2*i]=dx*s;delta[2*i+1]=dy*s;
  }
 }
 // Limit each triangle's cumulative deformation against the starting atlas.
 // For positive det(J), trace(JᵀJ)/det(J) equals k + 1/k for singular ratio k.
 function applyStrainLimit(){
  if(projectionPasses)projectInterior();
  damp.fill(1);
  const conditionLimit=conditionCap+1/conditionCap;
  let done=false;
  for(let pass=0;pass<125;pass++){
   for(let i=0;i<n;i++){
    next[2*i]=current[2*i]+delta[2*i]*damp[i];
    next[2*i+1]=current[2*i+1]+delta[2*i+1]*damp[i];
   }
   let bad=0;
   for(const {t:[a,b,c],inv:[a0,b0,c0,d0],world,densityCap} of triangles){
    const x=next[2*b]-next[2*a],y=next[2*b+1]-next[2*a+1],z=next[2*c]-next[2*a],w=next[2*c+1]-next[2*a+1],
     p=x*a0+z*c0,q=x*b0+z*d0,r=y*a0+w*c0,s=y*b0+w*d0,
     det=p*s-r*q,trace=p*p+q*q+r*r+s*s;
    let absOkay=true;
    if(world){
     const [a,b,d,originalCondition]=world,p=x*a,q=x*b+z*d,r=y*a,s=y*b+w*d;
     absOkay=p*p+q*q+r*r+s*s<=Math.abs(p*s-r*q)*Math.max(originalCondition,conditionLimit);
    }
    if(det>=1/localDensityLimit&&det<=densityCap&&trace<=det*(strainCap+1/strainCap)&&absOkay)continue;
    bad++;
    for(const i of [a,b,c])damp[i]=damp[i]>1e-8?damp[i]*.6:0;
   }
   if(!bad){done=true;break;}
  }
  return done;
 }

 function serialize(state){
  const uv=input.uv.slice();
  for(let i=0;i<uv.length/2;i++){
   const node=vertexToNode[i];
   if(node<0)continue;
   uv[2*i]=state[2*node]/resolution;
   uv[2*i+1]=state[2*node+1]/resolution;
  }
  return uv;
 }
 const baselineClearance=clearanceAtResolution(measureUvClearance(input),{resolution,padding});
 if(!baselineClearance.safe)return null;
 const wasJoined=topology.edges.map(edge=>uvEdgeContinuous(input,edge,0));
 let best=null,verified=0;
 for(let iter=1;iter<=maxIterations&&Date.now()<deadline;iter++){
  estimate();
  if(!applyStrainLimit())break;
  current.set(next);
  if(iter===1||iter%4===0||iter===maxIterations){
   mesh.uv=serialize(current);
   const diagnostic=analyzeUV(mesh,{resolution});
   const tighterCap=p95Limit*.999;
   if(iter===1&&diagnostic.anisotropy.p95>p95Limit&&tighterCap>1&&tighterCap<conditionCap){
    // Retry from the original atlas with a per-face cap just below the P95 limit.
    conditionCap=tighterCap;
    current.set(ref);
    iter--;
    continue;
   }
   const clearance=clearanceAtResolution(measureUvClearance(mesh),{resolution,padding});
   if(!clearance.safe||diagnostic.overlap||diagnostic.outOfRangeFaces||diagnostic.zeroUvFaces||
    (clearance.gapPixels!=null&&clearance.gapPixels<clearance.requiredGapPixels)||clearance.borderPixels<clearance.requiredBorderPixels||
    diagnostic.mirroredFaces!==old.mirroredFaces||diagnostic.islands!==old.islands||
    diagnostic.anisotropy.p95>p95Limit||
    topology.edges.some((edge,index)=>uvEdgeContinuous(mesh,edge,0)!==wasJoined[index]))break;
   if(diagnostic.summedUvTriangleArea>(best?.diagnostic.summedUvTriangleArea??old.summedUvTriangleArea)+1e-8){
    const density=densityBudget?.audit(mesh);
    if(!densityBudget||density){best={uv:mesh.uv,diagnostic,clearance,density};verified=iter;}
   }
   onProgress(iter/maxIterations);
   if(best?.diagnostic.summedUvTriangleArea>=targetCoverage)break;
  }
 }
 if(!best)return null;
 const {diagnostic,clearance,density}=best,vertices=input.uv.length/2;
 const sourceIndices=Uint32Array.from({length:vertices},(_,index)=>index);
 const chartIds=Int32Array.from(vertexToNode,node=>node<0?-1:nodes[node].chart);
 onProgress(1);
 return {...mesh,uv:best.uv,sourceIndices,chartIds,tangent:new Float32Array(vertices*4),
  atlas:{...input.atlas,charts:count,width:resolution,height:resolution,packedUtilization:0},
  packing:{method:'uv-boundary-growth',resolution,padding,pinnedIslands:[],relativeDensityWeights:{},requiresMikk:true,
   ...(density?{densityBudget:density}:{}),
   boundaryGrowth:{before:old.summedUvTriangleArea,after:diagnostic.summedUvTriangleArea,islands:count,
    gapPixels:clearance.gapPixels,beforeP95:old.anisotropy.p95,afterP95:diagnostic.anisotropy.p95,
    maxRelativeCondition:strainCap,maxRelativeDensity:maxStretch,absoluteConditionCap:conditionCap||null,
    ...(projectedMotion?{projectedMotion:true}:{}),
    ...(projectionPasses?{interiorProjection:true}:{}),iterations:verified}}};
}
