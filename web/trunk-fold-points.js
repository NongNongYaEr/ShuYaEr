const TAU=Math.PI*2,deg=a=>(a*180/Math.PI%360+360)%360;
const distance=(a,b)=>Math.abs((a-b+540)%360-180),SAMPLES=1024;

/** Find crests, valleys and sharp shoulders in the resolved skin, rather than
 * in the sparse underlying recipe alone. The periodic bracket includes the seam. */
export function trunkFoldFeatures(field){
  if(typeof field!=='function')return [];
  const step=TAU/SAMPLES,values=Array.from({length:SAMPLES},(_,i)=>field(i*step));
  if(values.some(v=>!Number.isFinite(v)||v<=0))return [];
  const features=[];
  for(let i=0;i<SAMPLES;i++){
    const a=values[(i+SAMPLES-1)%SAMPLES],b=values[i],c=values[(i+1)%SAMPLES];
    const kind=b>a&&b>=c?'MAX':b<a&&b<=c?'MIN':null;if(!kind)continue;
    let low=(i-1)*step,high=(i+1)*step;
    for(let j=0;j<32;j++){const x=low+(high-low)/3,y=high-(high-low)/3;
      if((field(x)<field(y))===(kind==='MAX'))low=x;else high=y;
    }
    const angle=(low+high)/2;features.push({angle:deg(angle),kind,value:field(angle)});
  }
  features.sort((a,b)=>a.angle-b.angle);
  const radial=features.map((p,i,all)=>({...p,prominence:Math.min(Math.abs(p.value-all[(i+all.length-1)%all.length].value),Math.abs(p.value-all[(i+1)%all.length].value))/p.value}))
    .filter(p=>p.prominence>=.002);
  // A visibly sharp shoulder need not be a radial extremum (especially on a
  // long asymmetric flap). Include strong turns of the actual planar outline.
  const h=step*4,turn=a=>{
    const p=q=>{const r=field(q);return [r*Math.cos(q),r*Math.sin(q)];};
    const l=p(a-h),m=p(a),r=p(a+h),x=m[0]-l[0],y=m[1]-l[1],u=r[0]-m[0],v=r[1]-m[1];
    return Math.abs(Math.atan2(x*v-y*u,x*u+y*v));
  },turns=values.map((_,i)=>turn(i*step));
  for(let i=0;i<SAMPLES;i++){
    if(turns[i]<.3||turns[i]<=turns[(i+SAMPLES-1)%SAMPLES]||turns[i]<turns[(i+1)%SAMPLES])continue;
    let low=(i-1)*step,high=(i+1)*step;
    for(let j=0;j<24;j++){const x=low+(high-low)/3,y=high-(high-low)/3;if(turn(x)<turn(y))low=x;else high=y;}
    const a=(low+high)/2,angle=deg(a);
    if(!radial.some(p=>distance(p.angle,angle)<=.5))radial.push({angle,kind:'TURN',value:field(a),prominence:turn(a)/Math.PI});
  }
  return radial.sort((a,b)=>a.angle-b.angle);
}

