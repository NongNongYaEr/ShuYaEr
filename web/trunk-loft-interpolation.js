/** Shape-preserving cubic interpolation along the trunk. The same tangent at
 * each authored circle joins both sides without overshooting either contour. */
export function trunkLoftValue(keys,index,u,read){
 const end=keys.length-1,a=keys[index],b=keys[index+1],height=b.t-a.t,y0=read(a),y1=read(b);
 const slope=i=>{
  if(i===0)return (read(keys[1])-read(keys[0]))/(keys[1].t-keys[0].t);
  if(i===end)return (read(keys[end])-read(keys[end-1]))/(keys[end].t-keys[end-1].t);
  const h0=keys[i].t-keys[i-1].t,h1=keys[i+1].t-keys[i].t,
   d0=(read(keys[i])-read(keys[i-1]))/h0,d1=(read(keys[i+1])-read(keys[i]))/h1;
  if(!d0||!d1||Math.sign(d0)!==Math.sign(d1))return 0;
  const w0=2*h1+h0,w1=h1+2*h0;return (w0+w1)/(w0/d0+w1/d1);
 };
 const u2=u*u,u3=u2*u,value=(2*u3-3*u2+1)*y0+(u3-2*u2+u)*height*slope(index)
  +(-2*u3+3*u2)*y1+(u3-u2)*height*slope(index+1);
 return Math.max(Math.min(y0,y1),Math.min(Math.max(y0,y1),value));
}
