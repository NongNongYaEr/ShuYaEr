// Immutable geometry analysis used by explicit v5 candidates. Types describe
// geometric evidence, not organ labels. The separate application step writes
// only the caller's private direction field; guides and source mesh stay intact.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],clamp=x=>Math.max(0,Math.min(1,x));
const unit=v=>{const n=Math.hypot(...v);return n>1e-14?mul(v,1/n):[0,0,0];},at=(p,v)=>[p[v*3],p[v*3+1],p[v*3+2]];
const tangent=(n,v)=>unit(sub(v,mul(n,dot(n,v))));
function basis(n,reference){let x=tangent(n,reference);if(Math.hypot(...x)<.5)x=tangent(n,Math.abs(n[0])<.8?[1,0,0]:[0,0,1]);return[x,unit(cross(n,x))];}
function solve(A,b){const m=A.map((r,i)=>[...r,b[i]]),scale=Math.max(...A.flat().map(Math.abs),1e-30);for(let c=0;c<3;c++){let p=c;for(let i=c+1;i<3;i++)if(Math.abs(m[i][c])>Math.abs(m[p][c]))p=i;if(Math.abs(m[p][c])<scale*1e-9)return null;[m[c],m[p]]=[m[p],m[c]];const d=m[c][c];for(let k=c;k<4;k++)m[c][k]/=d;for(let i=0;i<3;i++)if(i!==c){const d=m[i][c];for(let k=c;k<4;k++)m[i][k]-=d*m[c][k];}}return m.map(r=>r[3]);}
export function fitBanyanAxis(normal,samples,radius,reference=[0,1,0]){
 const [x,y]=basis(normal,reference),A=Array.from({length:3},()=>[0,0,0]),B=[0,0,0],rows=[];
 const addRow=(u,v,t,b,w)=>{
  B[0]+=w*u*b;A[0][0]+=w*u*u;A[0][1]+=w*u*v;A[0][2]+=w*u*t;
  B[1]+=w*v*b;A[1][0]+=w*v*u;A[1][1]+=w*v*v;A[1][2]+=w*v*t;
  B[2]+=w*t*b;A[2][0]+=w*t*u;A[2][1]+=w*t*v;A[2][2]+=w*t*t;
 };
 for(const s of samples){const u=dot(s.delta,x),v=dot(s.delta,y),d2=u*u+v*v;if(d2<1e-16||s.distance>radius||dot(normal,s.normal)<-.25)continue;
  const w=s.area*Math.exp(-2*(s.distance/radius)**2)/Math.max(d2,radius*radius*.0025),dn=sub(s.normal,normal),bx=dot(dn,x),by=dot(dn,y);rows.push(u,v,bx,by,w);addRow(u,v,0,bx,w);addRow(0,u,v,by,w);
 }
 const count=rows.length/5,q=count>=6&&solve(A,B);if(!q||q.some(v=>!Number.isFinite(v)))return null;const[a,b,c]=q,d=Math.hypot(a-c,2*b),l0=(a+c-d)/2,l1=(a+c+d)/2,low=Math.abs(l0)<=Math.abs(l1)?l0:l1,high=Math.abs(l0)>Math.abs(l1)?l0:l1;
 let v=Math.abs(b)>1e-12?[b,low-a]:Math.abs(a-low)<Math.abs(c-low)?[1,0]:[0,1];v=unit([v[0],v[1],0]);let direction=add(mul(x,v[0]),mul(y,v[1]));if(dot(direction,reference)<0)direction=mul(direction,-1);
 let error=0,energy=0;for(let i=0;i<rows.length;i+=5){const u=rows[i],v=rows[i+1],bx=rows[i+2],by=rows[i+3],w=rows[i+4];error+=w*((u*q[0]+v*q[1]+0*q[2])-bx)**2;energy+=w*bx*bx;error+=w*((0*q[0]+u*q[1]+v*q[2])-by)**2;energy+=w*by*by;}const residual=Math.sqrt(error/Math.max(energy,1e-20)),anisotropy=clamp((Math.abs(high)-Math.abs(low))/Math.max(Math.abs(high)+Math.abs(low),1e-8)),signal=clamp(Math.abs(high)*radius/.12),confidence=anisotropy*signal*clamp(1-residual/.8)*clamp(count*2/32);
 return{direction:unit(direction),confidence,anisotropy,residual,low,high,samples:count};
}
export function transportBanyanDirection(v,from,to){const c=Math.max(-1,Math.min(1,dot(from,to))),axis=cross(from,to);if(c<-.9999)return null;return tangent(to,add(add(v,cross(axis,v)),mul(cross(axis,cross(axis,v)),1/(1+c))));}
export function banyanLineMean(n,reference,items){const[x,y]=basis(n,reference);let a=0,b=0,total=0;for(const[v,w]of items){if(!(w>0))continue;const d=tangent(n,v);if(Math.hypot(...d)<.5)continue;const u=dot(d,x),t=dot(d,y);a+=w*(u*u-t*t);b+=w*2*u*t;total+=w;}if(!total)return{direction:x,coherence:0};const angle=Math.atan2(b,a)/2;let direction=add(mul(x,Math.cos(angle)),mul(y,Math.sin(angle)));if(dot(direction,reference)<0)direction=mul(direction,-1);return{direction,coherence:Math.hypot(a,b)/total};}
const lineMean=banyanLineMean;
class Heap{constructor(){this.a=[];}push(v){let i=this.a.length;this.a.push(v);while(i){const p=(i-1)>>1;if(this.a[p][0]<=v[0])break;this.a[i]=this.a[p];i=p;}this.a[i]=v;}pop(){const a=this.a,v=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1][0]<a[c][0])c++;if(a[c][0]>=last[0])break;a[i]=a[c];i=c;}a[i]=last;}return v;}get length(){return this.a.length;}}
function nearestGuide(p,guide){let best=null,length=0;for(let i=1;i<guide.points.length;i++){const a=guide.points[i-1],b=guide.points[i],d=sub(b,a),l=Math.hypot(...d),t=clamp(dot(sub(p,a),d)/(l*l)),q=add(a,mul(d,t)),distance=Math.hypot(...sub(p,q));if(!best||distance<best.distance)best={point:q,axis:mul(d,1/l),distance,arc:length+t*l};length+=l;}return best;}
export function analyzeBanyanSurface(mesh,record,field,{topology,labels,selected,p,actualHeightMeters=10,shapeScaleCm=35,iterations=12,maxNeighbors=256,maxEntries=4500000,progress=()=>{}}){
 if(!Number.isFinite(actualHeightMeters)||actualHeightMeters<.1||actualHeightMeters>200||!Number.isFinite(shapeScaleCm)||shapeScaleCm<5||shapeScaleCm>200)throw Error('榕根诊断的物理尺寸无效。');
 if(!Number.isInteger(iterations)||iterations<0||iterations>48||!Number.isInteger(maxNeighbors)||maxNeighbors<4||maxNeighbors>512||!Number.isInteger(maxEntries)||maxEntries<1)throw Error('榕根诊断预算无效。');
 const count=mesh.indices.length/3;if(count>250000||field.growth.length!==mesh.pos.length||field.faceBranch?.length!==count)throw Error('榕根诊断需要匹配源表面的已分析流向。');
 const radius=shapeScaleCm/100/actualHeightMeters,faces=new Array(count),types=new Int8Array(count).fill(-1),confidence=new Float32Array(count),directions=new Float32Array(count*3),previousDirections=new Float32Array(count*3),fiberDirections=new Float32Array(count*3),branchStats=record.guides.map(()=>({area:0,radial:0,alignment:0,fiberArea:0,axisTangent:0,bins:new Float64Array(8),faces:0}));
 let totalArea=0;for(let f=0;f<count;f++)if(labels[f]===selected){const ids=Array.from(mesh.indices.subarray(f*3,f*3+3)),points=ids.map(v=>at(p,v)),n=cross(sub(points[1],points[0]),sub(points[2],points[0])),area=Math.hypot(...n)/2;if(area<1e-16)continue;const center=[0,1,2].map(k=>points.reduce((s,v)=>s+v[k]/3,0)),old=unit(ids.reduce((v,id)=>add(v,at(field.growth,id)),[0,0,0]));faces[f]={ids,center,normal:unit(n),area,old};totalArea+=area;}
 // Smooth analysis normals on source adjacency, with a crease guard. The source
 // vertex normals remain untouched and are never used as a texture signal.
 for(let pass=0;pass<2;pass++){const normals=faces.map((a,f)=>{if(!a)return null;const n=mul(a.normal,a.area);let sum=n;for(const h of topology.neighbors[f]||[]){const b=faces[h.face];if(b&&dot(a.normal,b.normal)>.5)sum=add(sum,mul(b.normal,b.area*.5));}return unit(sum);});for(let f=0;f<count;f++)if(faces[f])faces[f].normal=normals[f];}
 let entries=0,truncated=0,maxVisited=0;const anchors=new Array(count),edges=faces.map((a,f)=>a?topology.neighbors[f].filter(h=>faces[h.face]).map(h=>{const b=faces[h.face],length=Math.hypot(...sub(a.center,b.center)),bend=1-dot(a.normal,b.normal);return{face:h.face,length,weight:Math.sqrt(a.area*b.area)/Math.max(length,1e-8)*Math.exp(-5*bend)};}):[]);
 for(let f=0;f<count;f++){const a=faces[f];if(!a)continue;const queue=new Heap(),distance=new Map([[f,0]]),samples=[];queue.push([0,f]);while(queue.length&&samples.length<maxNeighbors){const[d,j]=queue.pop();if(distance.get(j)!==d)continue;const b=faces[j];samples.push({delta:sub(b.center,a.center),normal:b.normal,area:b.area,distance:d});for(const e of edges[j]){const next=d+e.length;if(next<=radius*2&&dot(a.normal,faces[e.face].normal)>-.25&&next<(distance.get(e.face)??Infinity)){distance.set(e.face,next);queue.push([next,e.face]);}}}
  const capped=queue.length>0;entries+=samples.length;maxVisited=Math.max(maxVisited,samples.length);if(entries>maxEntries)throw Object.assign(Error('榕根表面邻域超过预算；已采用材质保持。'),{code:'BANYAN_NEIGHBORHOOD_BUDGET',entries,maxEntries,maxNeighbors});if(capped)truncated++;
  const main=nearestGuide(a.center,record.guides[0]);let macro=tangent(a.normal,main.axis);if(Math.hypot(...macro)<.2)macro=tangent(a.normal,sub(a.center,main.point));if(Math.hypot(...macro)<.2)macro=basis(a.normal,[0,1,0])[0];
  const fine=fitBanyanAxis(a.normal,samples,radius,macro),coarse=fitBanyanAxis(a.normal,samples,radius*2,macro);let fiber=fine&&coarse?fine.confidence>=coarse.confidence?fine:coarse:fine||coarse;const stability=fine&&coarse?Math.abs(dot(fine.direction,coarse.direction))**4:.65;
  const evidence=fiber?fiber.confidence*stability*(capped?.7:1):0,original=tangent(a.normal,a.old),branch=field.faceBranch[f],guide=record.guides[branch],hit=guide?nearestGuide(a.center,guide):null;
  a.macro=macro;a.original=Math.hypot(...original)>.5?original:macro;a.fiber=fiber?.direction||macro;a.evidence=evidence;a.stability=stability;a.capped=capped;
  previousDirections.set(a.original,f*3);fiberDirections.set(a.fiber,f*3);
  if(hit){const s=branchStats[branch],radial=unit(sub(a.center,hit.point)),[x,y]=basis(hit.axis,[1,0,0]),angle=Math.atan2(dot(radial,y),dot(radial,x)),bin=Math.min(7,Math.floor((angle+Math.PI)/(Math.PI*2)*8));s.area+=a.area;s.faces++;s.axisTangent+=a.area*clamp(1-Math.abs(dot(a.normal,hit.axis)));s.radial+=a.area*clamp(Math.abs(dot(radial,a.normal)));s.bins[bin]+=a.area;if(evidence>.1){s.fiberArea+=a.area;s.alignment+=a.area*Math.abs(dot(a.fiber,a.original));}}
  if(f%256===0)progress(f/count*.7);
 }
 const support=branchStats.map((s,i)=>{if(!s.area)return{branch:i,score:0,faces:0};const coverage=s.bins.reduce((n,a)=>n+(a>s.area*.025),0)/8,alignment=s.fiberArea?s.alignment/s.fiberArea:1,score=clamp(s.radial/s.area)*clamp((coverage-.25)/.5)*clamp((s.axisTangent/s.area-.5)/.35)*clamp((alignment-.35)/.55);return{branch:i,score,coverage,alignment,radial:s.radial/s.area,area:s.area,faces:s.faces};});
 for(let f=0;f<count;f++){const a=faces[f];if(!a)continue;const branch=field.faceBranch[f],score=support[branch]?.score||0,tube=score*(a.evidence>.1?clamp((Math.abs(dot(a.fiber,a.original))-.35)/.55):1),fiber=a.evidence;
  // A reliable pipe stays anchored; unsupported transverse axes give way to
  // independent multi-scale surface evidence and the macro stem reference.
  const weights={tube:4*tube,shape:3*fiber,macro:.25+(1-fiber)*(1-tube)*.65};anchors[f]=[[a.original,weights.tube],[a.fiber,weights.shape],[a.macro,weights.macro]];const mean=lineMean(a.normal,a.macro,anchors[f]);directions.set(mean.direction,f*3);a.tube=tube;
 }
 let current=directions;for(let pass=0;pass<iterations;pass++){const next=current.slice();for(let f=0;f<count;f++){const a=faces[f];if(!a)continue;const neighbors=[];let total=0;for(const e of edges[f]){const b=faces[e.face],v=transportBanyanDirection(at(current,e.face),b.normal,a.normal);if(v){neighbors.push([v,e.weight]);total+=e.weight;}}const strength=.65*(1-a.tube*.85);const items=[...anchors[f],...neighbors.map(([v,w])=>[v,strength*w/Math.max(total,1e-20)])];next.set(lineMean(a.normal,a.macro,items).direction,f*3);}current=next;progress(.7+.3*(pass+1)/iterations);}
 const blendWeight=new Float32Array(count),areas={tube:0,surface:0,ridge:0,junction:0},counts={tube:0,surface:0,ridge:0,junction:0},changes=[],bands=[{name:'lower',lo:0,hi:.3},{name:'middle',lo:.3,hi:.65},{name:'upper',lo:.65,hi:Infinity}].map(v=>({...v,area:0,change:0,over30:0}));let changedArea=0;
 for(let f=0;f<count;f++){const a=faces[f];if(!a)continue;const mean=lineMean(a.normal,a.macro,anchors[f]),angle=Math.acos(Math.min(1,Math.abs(dot(at(current,f),a.original))))*180/Math.PI;let type=a.tube>.65?0:a.evidence>.4&&a.stability>.7?2:mean.coherence<.45?3:1;types[f]=type;confidence[f]=clamp(Math.max(a.tube,a.evidence)*mean.coherence);blendWeight[f]=clamp(1-a.tube*1.1)*(.5+.5*mean.coherence);const name=['tube','surface','ridge','junction'][type];areas[name]+=a.area;counts[name]++;changes.push([angle,a.area]);if(angle>30)changedArea+=a.area;const band=bands.find(b=>a.center[1]>=b.lo&&a.center[1]<b.hi);if(band){band.area+=a.area;band.change+=angle*a.area;if(angle>30)band.over30+=a.area;}}
 directions.set(current);return{directions,previousDirections,fiberDirections,types,confidence,blendWeight,summary:{algorithm:'banyan-multiscale-surface-line-prototype-v1',diagnosticOnly:true,shapeScaleCm,coarseScaleCm:shapeScaleCm*2,iterations,neighborhoods:{entries,maxEntries,maxVisited,maxNeighbors,truncatedFaces:truncated},support,counts,bands:bands.map(b=>({name:b.name,meanUnorientedChangeDegrees:b.change/Math.max(b.area,1e-20),over30DegreesAreaFraction:b.over30/Math.max(b.area,1e-20)})),areaFractions:Object.fromEntries(Object.entries(areas).map(([k,v])=>[k,v/totalArea])),changedOver30DegreesAreaFraction:changedArea/totalArea,meanUnorientedChangeDegrees:changes.reduce((s,[a,w])=>s+a*w,0)/totalArea,scope:'geometric evidence classes, not semantic ground truth; unchanged guides and adopted material'}};
}

// Keep every previously successful analysis exact. A dense failed case gets one
// bounded retry with a uniform face allowance; neither radius nor entry cap is
// raised. A source/scale-bound plan lets UV preparation and project reload use
// the same allowance directly instead of repeating the failed first attempt.
export function analyzeBanyanSurfaceBounded(mesh,record,field,context){
 const maxEntries=context.maxEntries??4500000,requestedMaxNeighbors=context.maxNeighbors??256,selectedFaces=context.labels.reduce((n,id)=>n+(id===context.selected),0),effectiveMaxNeighbors=Math.min(requestedMaxNeighbors-1,Math.floor(maxEntries/Math.max(1,selectedFaces))),actualHeightMeters=context.actualHeightMeters??10,shapeScaleCm=context.shapeScaleCm??35,hint=record.summary?.banyanSampling;
 const plan={version:1,sourceSHA256:mesh.sourceSHA256,faces:mesh.indices.length/3,selectedFaces,actualHeightMeters,shapeScaleCm,maxEntries,requestedMaxNeighbors,effectiveMaxNeighbors};
 const reusable=/^[a-f0-9]{64}$/.test(mesh.sourceSHA256||'')&&effectiveMaxNeighbors>=4&&hint&&Object.entries(plan).every(([k,v])=>hint[k]===v);let visible=0;const progress=value=>{visible=Math.max(visible,value);context.progress?.(visible);};
 const run=cap=>analyzeBanyanSurface(mesh,record,field,{...context,maxNeighbors:cap,progress});
 const finish=(result,firstEntries,reusedPlan)=>{Object.assign(result.summary.neighborhoods,{budgetLimited:true,requestedMaxNeighbors,effectiveMaxNeighbors,attempts:reusedPlan?1:2,firstAttemptEntries:firstEntries,totalSampleEntries:firstEntries+result.summary.neighborhoods.entries,maxTotalSampleEntries:reusedPlan?maxEntries:2*maxEntries+requestedMaxNeighbors,reusedPlan,plan});return result;};
 if(reusable)return finish(run(effectiveMaxNeighbors),0,true);
 try{return run(requestedMaxNeighbors);}catch(error){if(error.code!=='BANYAN_NEIGHBORHOOD_BUDGET'||effectiveMaxNeighbors<4||effectiveMaxNeighbors>=requestedMaxNeighbors)throw error;return finish(run(effectiveMaxNeighbors),error.entries,false);}
}
export function rememberBanyanSampling(flow,field){
 if(flow.version!==5)return flow;const n=field.summary?.banyan?.neighborhoods,old=flow.summary&&typeof flow.summary==='object'&&!Array.isArray(flow.summary)?flow.summary:{};
 if(!n?.budgetLimited&&!old.banyanSampling)return flow;const summary={...old};if(n?.budgetLimited&&n.plan)summary.banyanSampling={...n.plan};else delete summary.banyanSampling;return{...flow,summary};
}

// Separate experiment: apply line constraints to a private field copy. The
// caller must still integrate, check distortion, and explicitly accept it.
export function applyBanyanDirections(mesh,p,topology,analysis,field,strength=1){
 if(!Number.isFinite(strength)||strength<0||strength>1)throw Error('榕根走势强度无效。');if(strength===0)return;
 const votes=new Map(),allowed=new Uint8Array(field.growth.length/3);for(let f=0;f<analysis.types.length;f++)if(analysis.types[f]>=0){const ids=Array.from(mesh.indices.subarray(f*3,f*3+3)),pts=ids.map(v=>at(p,v)),area=Math.hypot(...cross(sub(pts[1],pts[0]),sub(pts[2],pts[0])))/2;for(const v of ids){allowed[v]=1;const old=at(field.growth,v);let target=at(analysis.directions,f);if(dot(target,old)<0)target=mul(target,-1);const amount=strength*analysis.blendWeight[f],value=unit(add(mul(old,1-amount),mul(target,amount))),key=topology.vertices[v];let vote=votes.get(key);if(!vote){vote={sum:[0,0,0],reference:value};votes.set(key,vote);}if(dot(value,vote.reference)<0)vote.sum=sub(vote.sum,mul(value,area));else vote.sum=add(vote.sum,mul(value,area));}}
 for(let v=0;v<field.growth.length/3;v++){const vote=allowed[v]&&votes.get(topology.vertices[v]);if(!vote)continue;const y=unit(vote.sum),old=at(field.growth,v),x=at(field.across,v),c=dot(old,y),axis=cross(old,y);let next=c>-.9999?add(add(x,cross(axis,x)),mul(cross(axis,cross(axis,x)),1/(1+c))):x;next=unit(sub(next,mul(y,dot(next,y))));if(Math.hypot(...next)<.5)next=basis(y,[1,0,0])[0];field.growth.set(y,v*3);field.across.set(next,v*3);}
}
