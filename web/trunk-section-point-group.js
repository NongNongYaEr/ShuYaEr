const circularDistance=(a,b)=>Math.abs(((a-b+540)%360+360)%360-180);

/** Selection is a UI set of existing identities, never a saved contour. */
export function selectTrunkSectionPoints(profile,selected,ids,mode='REPLACE'){
  const valid=new Set(profile.map(p=>p.id)),hits=new Set(ids.filter(id=>valid.has(id)));
  const next=mode==='ADD'||mode==='SUBTRACT'?new Set(selected.filter(id=>valid.has(id))):new Set();
  for(const id of hits){if(mode==='SUBTRACT')next.delete(id);else next.add(id);}
  return profile.filter(p=>next.has(p.id)).map(p=>p.id);
}

/** Overlapping soft regions use their maximum weight, not repeated pulls. */
export function trunkSectionPointWeights(profile,ids,{smooth=false,reach=18}={}){
  const selected=new Set(ids),angles=profile.filter(p=>selected.has(p.id)).map(p=>p.angle);
  return profile.map(p=>{
    if(selected.has(p.id))return 1;
    if(!smooth||!Number.isFinite(reach)||reach<=0)return 0;
    let weight=0;
    for(const angle of angles){const distance=circularDistance(p.angle,angle);if(distance<reach)weight=Math.max(weight,(1+Math.cos(distance/reach*Math.PI))/2);}
    return weight;
  });
}

/** One physical radial increment, compensated by each original surface radius.
 * Angles, IDs and unselected distant controls stay exact, including the seam. */
export function pullTrunkSectionPoints(profile,ids,{delta,radiusAt,smooth=false,reach=18,min=.001,max=64}={}){
  const weights=trunkSectionPointWeights(profile,ids,{smooth,reach});
  if(!Number.isFinite(delta)||!delta||typeof radiusAt!=='function')return profile.map(p=>({...p}));
  return profile.map((p,i)=>{
    if(!weights[i])return {...p};
    const surface=radiusAt(p.angle*Math.PI/180);
    if(!Number.isFinite(surface)||surface<=0)return {...p};
    return {...p,radius:Math.max(min,Math.min(max,p.radius*(surface+delta*weights[i])/surface))};
  });
}

/** Translate actual section-plane positions together, retaining the periodic
 * order required by the saved radial contour. Stop the entire group at the
 * first angular/radius boundary; never independently distort its spacing. */
export function moveTrunkSectionPoints(profile,ids,{dx=0,dy=0,positionAt,radiusFor,min=.001,max=64,gap=.2}={}){
  const copy=()=>profile.map(p=>({...p})),selected=new Set(ids);
  if(!profile.length||!selected.size||![dx,dy].every(Number.isFinite)||!dx&&!dy||typeof positionAt!=='function'||typeof radiusFor!=='function')return {profile:copy(),fraction:0};
  const original=profile.map(p=>selected.has(p.id)?positionAt(p):null);
  if(original.some((p,i)=>selected.has(profile[i].id)&&(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))))return {profile:copy(),fraction:0};
  const evaluate=fraction=>{
    const angles=[],next=profile.map((p,i)=>{
      const q=original[i];if(!q){angles.push(p.angle);return {...p};}
      const x=q.x+dx*fraction,y=q.y+dy*fraction,size=Math.hypot(x,y),raw=Math.atan2(y,x)*180/Math.PI;
      const angle=p.angle+((raw-p.angle+540)%360+360)%360-180,radius=radiusFor(p,angle*Math.PI/180,size);
      angles.push(angle);return {...p,angle:(angle%360+360)%360,radius};
    });
    const valid=next.every((p,i)=>Number.isFinite(p.radius)&&p.radius>=min&&p.radius<=max&&angles[(i+1)%angles.length]+(i===angles.length-1?360:0)-angles[i]>=Math.min(gap,(profile[(i+1)%profile.length].angle+(i===profile.length-1?360:0)-profile[i].angle)/2)-1e-9);
    return {profile:next,valid};
  };
  // For translating points, each ordering boundary is a linear cross-product
  // constraint along this ray. Search only the connected interval from zero.
  let fraction=1,result=evaluate(1);
  if(!result.valid){let low=0,high=1;for(let i=0;i<36;i++){const middle=(low+high)/2;if(evaluate(middle).valid)low=middle;else high=middle;}fraction=low;result=evaluate(low);}
  if(fraction<1e-10)return {profile:copy(),fraction:0};
  return {profile:result.profile,fraction};
}
