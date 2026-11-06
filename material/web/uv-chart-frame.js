// Rigid chart rotations only: no welding, cutting or stretching of an island.
export function compactChartFrame(mesh,chart){
 const points=[...chart.vertices].map(i=>[mesh.uv[i*2]-chart.min[0],mesh.uv[i*2+1]-chart.min[1]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),half=list=>{const out=[];for(const p of list){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out;};
 const hull=half(points).slice(0,-1).concat(half(points.slice().reverse()).slice(0,-1));
 const original=(chart.max[0]-chart.min[0])*(chart.max[1]-chart.min[1]);let best=null,bestArea=original;
 for(let k=0;k<hull.length;k+=Math.max(1,Math.ceil(hull.length/64))){const a=hull[k],b=hull[(k+1)%hull.length],angle=Math.atan2(b[1]-a[1],b[0]-a[0]),c=Math.cos(angle),s=Math.sin(angle);let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const [u,v]of hull){const x=u*c+v*s,y=-u*s+v*c;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  const area=(x1-x0)*(y1-y0);if(area<bestArea*.995){bestArea=area;best={c,s,x0,y0,width:x1-x0,height:y1-y0};}
 }
 return best;
}
export function chartLocalUV(mesh,chart,index){const u=mesh.uv[index*2]-chart.min[0],v=mesh.uv[index*2+1]-chart.min[1],f=chart.frame;return f?[u*f.c+v*f.s-f.x0,-u*f.s+v*f.c-f.y0]:[u,v];}
