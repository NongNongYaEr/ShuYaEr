const radians=a=>a*Math.PI/180,wrap=a=>(a%360+360)%360;

/** A fixed pivot from real selected positions. A single point uses the section
 * origin so rotating/scaling it remains meaningful; groups use their centroid. */
export function trunkSectionPointPivot(profile,ids,positionAt){
  const selected=new Set(ids),points=profile.filter(p=>selected.has(p.id)).map(positionAt);
  if(!points.length||points.some(p=>!p||![p.x,p.y].every(Number.isFinite)))return null;
  if(points.length===1)return {x:0,y:0,scope:'SECTION'};
  return {x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length,scope:'SELECTION'};
}

/** Rotate (degrees) or scale (log factor) original physical positions together.
 * Follow the connected valid interval from the last applied value, including
 * intermediate rotations: a large mouse step cannot jump through a neighbour.
 * The caller reuses the original surface compensation and layer evaluator. */
export function transformTrunkSectionPoints(profile,ids,{action,value=0,previous=0,pivot,positionAt,radiusFor,min=.001,max=64,gap=.2,accept=()=>true}={}){
  const copy=()=>profile.map(p=>({...p})),selected=new Set(ids);
  if(!['ROTATE','SCALE'].includes(action)||![value,previous,pivot?.x,pivot?.y].every(Number.isFinite)||typeof positionAt!=='function'||typeof radiusFor!=='function'||!profile.some(p=>selected.has(p.id)))return {profile:copy(),value:0,limited:false};
  const original=profile.map(p=>selected.has(p.id)?positionAt(p):null);
  if(original.some((p,i)=>selected.has(profile[i].id)&&(!p||![p.x,p.y].every(Number.isFinite))))return {profile:copy(),value:0,limited:false};
  const evaluate=v=>{
    if(Math.abs(v)<1e-12)return {profile:copy(),valid:true};
    const angle=radians(action==='ROTATE'?v:0),c=Math.cos(angle),s=Math.sin(angle),scale=action==='SCALE'?Math.exp(v):1;
    const next=profile.map((p,i)=>{
      const q=original[i];if(!q)return {...p};
      const dx=(q.x-pivot.x)*scale,dy=(q.y-pivot.y)*scale,x=pivot.x+dx*c-dy*s,y=pivot.y+dx*s+dy*c,a=Math.atan2(y,x);
      return {...p,angle:wrap(a*180/Math.PI),radius:radiusFor(p,a,Math.hypot(x,y))};
    });
    let turn=0;const valid=next.every((p,i)=>{
      const nextIndex=(i+1)%next.length,distance=wrap(next[nextIndex].angle-p.angle),originalGap=wrap(profile[nextIndex].angle-profile[i].angle);turn+=distance;
      return Number.isFinite(p.radius)&&p.radius>=min&&p.radius<=max&&distance>=Math.min(gap,originalGap/2)-1e-9;
    })&&Math.abs(turn-360)<1e-6&&accept(next);
    return {profile:next,valid};
  };
  let applied=previous,result=evaluate(previous);if(!result.valid){applied=0;result=evaluate(0);}
  const steps=Math.max(1,Math.ceil(Math.abs(value-applied)/(action==='ROTATE'?.5:.02))),start=applied;
  // UI increments are bounded. Reject pathological input rather than blocking
  // the editor in an unbounded sampling loop.
  if(steps>4096)return {profile:result.profile,value:applied,limited:true};
  for(let i=1;i<=steps;i++){
    const candidate=start+(value-start)*i/steps,next=evaluate(candidate);
    if(next.valid){applied=candidate;result=next;continue;}
    let low=applied,high=candidate;for(let j=0;j<32;j++){const middle=(low+high)/2,current=evaluate(middle);if(current.valid){low=middle;result=current;}else high=middle;}
    applied=low;return {profile:result.profile,value:applied,limited:true};
  }
  return {profile:result.profile,value:applied,limited:false};
}
