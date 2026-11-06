import {buildBrushTopology,connectedBrushFaces} from './pixel-masks.js';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,k)=>a.map(v=>v*k),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>{const length=Math.hypot(...a)||1;return a.map(v=>v/length);};
export function inverseMatrix(m){
 const rows=Array.from({length:4},(_,r)=>Array.from({length:8},(_,c)=>c<4?m[c*4+r]:+(c-4===r)));
 for(let i=0;i<4;i++){let best=i;for(let j=i+1;j<4;j++)if(Math.abs(rows[j][i])>Math.abs(rows[best][i]))best=j;[rows[i],rows[best]]=[rows[best],rows[i]];const d=rows[i][i];if(Math.abs(d)<1e-14)return null;for(let k=0;k<8;k++)rows[i][k]/=d;for(let j=0;j<4;j++)if(j!==i){const v=rows[j][i];for(let k=0;k<8;k++)rows[j][k]-=v*rows[i][k];}}
 return rows.map(row=>row.slice(4));
}
export function projectBrushPoint(p,vp,rect,model){
 const n=p.map((v,i)=>(v-model.min[i])/model.height),clip=Array.from({length:4},(_,i)=>vp[i]*n[0]+vp[4+i]*n[1]+vp[8+i]*n[2]+vp[12+i]),w=clip[3];if(w<=1e-9||Math.abs(clip[2]/w)>1.00001)return null;
 return[(clip[0]/w+1)*rect.width/2,(1-clip[1]/w)*rect.height/2];
}
export function brushRay(inverse,rect,model,x,y){
 if(!inverse||!rect.width||!rect.height)return null;const q=[(x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2],unproject=z=>{const v=[...q,z,1],p=inverse.map(row=>dot(row,v));return p.slice(0,3).map(v=>v/p[3]);},origin=unproject(-1),end=unproject(1),direction=unit(sub(end,origin));return{origin:origin.map((v,i)=>v*model.height+model.min[i]),direction,normalized:{origin,direction}};
}
function rayTriangle(ray,t){
 const e=sub(t.b,t.a),f=sub(t.c,t.a),h=cross(ray.direction,f),det=dot(e,h);if(Math.abs(det)<(t.rayEpsilon||1e-14))return null;const s=sub(ray.origin,t.a),u=dot(s,h)/det;if(u<0||u>1)return null;const q=cross(s,e),v=dot(ray.direction,q)/det;if(v<0||u+v>1)return null;const distance=dot(f,q)/det;return distance>=0?{distance,face:t.face,bary:[1-u-v,u,v],point:add(ray.origin,mul(ray.direction,distance))}:null;
}
function boxDistance(ray,box,limit){let lo=0,hi=limit;const epsilon=box.epsilon||1e-10;for(let i=0;i<3;i++){const d=ray.direction[i],v=ray.origin[i];if(Math.abs(d)<1e-14){if(v<box.min[i]-epsilon||v>box.max[i]+epsilon)return Infinity;continue;}let a=(box.min[i]-epsilon-v)/d,b=(box.max[i]+epsilon-v)/d;if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return Infinity;}return lo;}
function circleOnTriangle(t,center,radius,result){
 const ab=sub(t.b,t.a),ac=sub(t.c,t.a),normal=unit(cross(ab,ac));if(Math.hypot(...normal)<.5)return;const distance=dot(sub(center,t.a),normal),rr=radius*radius-distance*distance;if(rr<=radius*radius*1e-12)return;const c=sub(center,mul(normal,distance)),rho=Math.sqrt(rr),u=unit(ab),v=cross(normal,u),angles=[0,Math.PI*2],vertices=[t.a,t.b,t.c],eps=Math.max(radius,1e-6)*1e-7;
 const on=a=>add(c,add(mul(u,Math.cos(a)*rho),mul(v,Math.sin(a)*rho))),inside=p=>vertices.every((a,i)=>dot(cross(sub(vertices[(i+1)%3],a),sub(p,a)),normal)>=-eps);
 for(let i=0;i<3;i++){const a=vertices[i],edge=sub(vertices[(i+1)%3],a),delta=sub(a,center),A=dot(edge,edge),B=2*dot(delta,edge),C=dot(delta,delta)-radius*radius,D=B*B-4*A*C;if(A<1e-24||D<0)continue;for(const k of [(-B-Math.sqrt(D))/(2*A),(-B+Math.sqrt(D))/(2*A)])if(k>=0&&k<=1){const p=sub(add(a,mul(edge,k)),c),angle=Math.atan2(dot(p,v),dot(p,u));angles.push(angle<0?angle+Math.PI*2:angle);}}
 angles.sort((a,b)=>a-b);const unique=angles.filter((a,i)=>!i||a-angles[i-1]>1e-8);
 for(let i=1;i<unique.length;i++){const start=unique[i-1],end=unique[i];if(!inside(on((start+end)/2)))continue;const count=Math.max(1,Math.ceil((end-start)/(Math.PI/16)));for(let j=0;j<count;j++)result.push([on(start+(end-start)*j/count),on(start+(end-start)*(j+1)/count)]);}
}
// Preview uses the same connected-face sphere test as PixelMaskRasterizer.
// The BVH is derived view data, independent of UVs and material output.
export function createBrushGeometry(mesh,display=null){
 const point=i=>Array.from(mesh.pos.subarray(i*3,i*3+3)),triangles=Array.from({length:mesh.indices.length/3},(_,face)=>{const a=point(mesh.indices[face*3]),b=point(mesh.indices[face*3+1]),c=point(mesh.indices[face*3+2]),min=a.map((v,i)=>Math.min(v,b[i],c[i])),max=a.map((v,i)=>Math.max(v,b[i],c[i]));return{face,a,b,c,min,max,rayEpsilon:Math.max(1e-30,mesh.height*mesh.height*1e-12),center:min.map((v,i)=>(v+max[i])/2)};}),topology=buildBrushTopology(mesh);
 const pickTriangles=display?triangles.map(t=>{const p=i=>Array.from(display.positions.subarray(i*3,i*3+3)),a=p(display.indices[t.face*3]),b=p(display.indices[t.face*3+1]),c=p(display.indices[t.face*3+2]),min=a.map((v,i)=>Math.min(v,b[i],c[i])),max=a.map((v,i)=>Math.max(v,b[i],c[i]));return{face:t.face,a,b,c,min,max,center:min.map((v,i)=>(v+max[i])/2),rayEpsilon:1e-12};}):triangles;
 function build(ids){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const id of ids)for(let k=0;k<3;k++){min[k]=Math.min(min[k],pickTriangles[id].min[k]);max[k]=Math.max(max[k],pickTriangles[id].max[k]);}if(ids.length<=8)return{min,max,epsilon:(display?1:mesh.height)*1e-9,ids};const axis=[0,1,2].sort((a,b)=>(max[b]-min[b])-(max[a]-min[a]))[0];ids.sort((a,b)=>pickTriangles[a].center[axis]-pickTriangles[b].center[axis]);const mid=ids.length>>1;return{min,max,epsilon:(display?1:mesh.height)*1e-9,left:build(ids.slice(0,mid)),right:build(ids.slice(mid))};}
 const tree=build(triangles.map(t=>t.face));
 function pick(ray){if(!ray)return null;if(display)ray=ray.normalized||{origin:ray.origin.map((v,i)=>(v-display.min[i])/display.height),direction:ray.direction};let best=null;const visit=node=>{if(boxDistance(ray,node,best?.distance??Infinity)===Infinity)return;if(node.ids){for(const i of node.ids){const h=rayTriangle(ray,pickTriangles[i]);if(h&&(!best||h.distance<best.distance||h.distance===best.distance&&h.face<best.face))best=h;}}else{const a=boxDistance(ray,node.left,best?.distance??Infinity),b=boxDistance(ray,node.right,best?.distance??Infinity);if(a<b){visit(node.left);visit(node.right);}else{visit(node.right);visit(node.left);}}};visit(tree);if(best&&display){const triangle=triangles[best.face],normalPoint=best.point;best.point=[0,1,2].map(k=>triangle.a[k]*best.bary[0]+triangle.b[k]*best.bary[1]+triangle.c[k]*best.bary[2]);best.distance*=display.height;best.normalizedPoint=normalPoint;}return best;}
 function footprint(hit,{radiusMeters,hardness,actualHeightMeters,operation='paint'}){
  const stroke={face:hit.face,bary:hit.bary,radiusMeters,...(operation==='smooth'?{operation:'smooth'}:{})},{faces,center,radius}=connectedBrushFaces(topology,stroke,actualHeightMeters),outer=[],inner=[];
  for(const face of faces){circleOnTriangle(triangles[face],center,radius,outer);if(hardness>0)circleOnTriangle(triangles[face],center,radius*Math.min(.9999,hardness),inner);}return{outer,inner,center,radius,faces:faces.length};
 }
 return{pick,footprint,topology};
}
export function brushOperation(event={},selected='paint'){return event.ctrlKey?'erase':event.shiftKey?'smooth':selected;}
