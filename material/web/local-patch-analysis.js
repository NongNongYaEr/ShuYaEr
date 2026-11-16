import {buildBrushTopology} from './pixel-masks.js';
import {validateLocalPatches,validateLocalPatchSource,localPatchKey,LOCAL_PATCH_TYPES} from './local-patch-rules.js';
const point=(mesh,i)=>Array.from(mesh.pos.subarray(i*3,i*3+3)),sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=v=>{const length=Math.hypot(...v);if(!(length>1e-15))throw Error('局部细节锚点三角面退化，请换一个位置。');return v.map(x=>x/length);};
function edgeDistance2(p,a,b){const e=sub(b,a),d=sub(p,a),t=Math.max(0,Math.min(1,dot(d,e)/(dot(e,e)||1)));return d.reduce((s,v,k)=>s+(v-e[k]*t)**2,0);}
export function localPatchFrame(mesh,patch,actualHeightMeters){const vertices=[0,1,2].map(c=>point(mesh,mesh.indices[patch.anchor.face*3+c])),center=[0,1,2].map(k=>vertices.reduce((s,p,c)=>s+p[k]*patch.anchor.bary[c],0)),normal=unit(cross(sub(vertices[1],vertices[0]),sub(vertices[2],vertices[0]))),up=Math.abs(normal[1])<.95?[0,1,0]:[0,0,1],v=unit(up.map((x,k)=>x-normal[k]*dot(up,normal))),u=unit(cross(v,normal)),angle=patch.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),U=u.map((x,k)=>x*c+v[k]*s),V=v.map((x,k)=>x*c-u[k]*s),factor=actualHeightMeters/mesh.height;
 return{center,normal,U,V,halfWidth:patch.widthMeters/(2*factor),halfHeight:patch.heightMeters/(2*factor),depth:patch.depthMeters/factor,uniforms:{origin:[...center.map((x,k)=>(x-mesh.min[k])/mesh.height),patch.depthMeters/actualHeightMeters],u:[...U.map(x=>x*actualHeightMeters*2/patch.widthMeters),patch.roughness],v:[...V.map(x=>x*actualHeightMeters*2/patch.heightMeters),patch.depthMm*.001/actualHeightMeters],n:[...normal,patch.edgeMm*.001/actualHeightMeters],color:[...[1,3,5].map(i=>parseInt(patch.color.slice(i,i+2),16)/255),patch.opacity],shape:[LOCAL_PATCH_TYPES.indexOf(patch.type),patch.feather,patch.rings,patch.seed],channels:[+patch.channels.color,+patch.channels.roughness,+patch.channels.height,0]}};
}

function checkCancel(shouldCancel){
 if(shouldCancel())throw Object.assign(Error('局部细节计算已取消。'),{name:'AbortError'});
}

function triangleIntersectsBox(positions,a,b,c,limits){
 let aInside=true,bInside=true,cInside=true;
 for(let axis=0;axis<3;axis++){
  const x=positions[a+axis],y=positions[b+axis],z=positions[c+axis],limit=limits[axis];
  if(Math.min(x,y,z)>limit||Math.max(x,y,z)<-limit)return false;
  aInside&&=Math.abs(x)<=limit;
  bInside&&=Math.abs(y)<=limit;
  cInside&&=Math.abs(z)<=limit;
 }
 if(aInside||bInside||cInside)return true;

 // A triangle can cross the box with all its corners outside. Clip it to the
 // six box faces to distinguish crossings from overlapping bounding intervals.
 let polygon=[a,b,c].map(at=>positions.subarray(at,at+3));
 for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
  const next=[],limit=limits[axis];
  let previous=polygon.at(-1),previousDistance=sign*previous[axis]-limit;
  for(const current of polygon){
   const distance=sign*current[axis]-limit;
   if((previousDistance<=0)!==(distance<=0)){
    const t=previousDistance/(previousDistance-distance);
    next.push(previous.map((value,k)=>value+(current[k]-value)*t));
   }
   if(distance<=0)next.push(current);
   previous=current;
   previousDistance=distance;
  }
  if(!next.length)return false;
  polygon=next;
 }
 return true;
}

function collectBoxFaces(mesh,frame,positions,faceMasks,bit,allowed,visible,shouldCancel){
 const {center,U,V,normal}=frame;
 for(let vertex=0;vertex<mesh.pos.length/3;vertex++){
  if((vertex&1023)===0)checkCancel(shouldCancel);
  const at=vertex*3,x=mesh.pos[at]-center[0],y=mesh.pos[at+1]-center[1],z=mesh.pos[at+2]-center[2];
  positions[at]=x*U[0]+y*U[1]+z*U[2];
  positions[at+1]=x*V[0]+y*V[1]+z*V[2];
  positions[at+2]=x*normal[0]+y*normal[1]+z*normal[2];
 }
 const limits=[frame.halfWidth,frame.halfHeight,frame.depth].map(limit=>limit+mesh.height*2e-7);
 let affectedFaces=0,blockedFaces=0;
 for(let face=0;face<faceMasks.length;face++){
  if((face&1023)===0)checkCancel(shouldCancel);
  const at=face*3;
  if(!allowed(face)||!triangleIntersectsBox(positions,mesh.indices[at]*3,mesh.indices[at+1]*3,mesh.indices[at+2]*3,limits)){
   blockedFaces++;
   continue;
  }
  if(visible){faceMasks[face]|=bit;affectedFaces++;}
 }
 return{affectedFaces,blockedFaces,visitedFaces:faceMasks.length,projection:'planar box; any intersecting source face'};
}

function collectConnectedFaces(mesh,patch,frame,topology,normals,faceMasks,bit,allowed,visible,shouldCancel){
 const radius2=Math.hypot(frame.halfWidth,frame.halfHeight,frame.depth)**2;
 const cos=Math.cos(patch.maxBendDegrees*Math.PI/180),visited=new Uint8Array(faceMasks.length),queue=[patch.anchor.face];
 visited[patch.anchor.face]=1;
 let affectedFaces=0,blockedFaces=0;
 const accepts=face=>{
  if(!allowed(face)||!normals[face]||dot(normals[face],frame.normal)<cos)return false;
  const positions=[0,1,2].map(c=>sub(point(mesh,mesh.indices[face*3+c]),frame.center));
  for(const [axis,limit]of [[frame.U,frame.halfWidth],[frame.V,frame.halfHeight],[frame.normal,frame.depth]]){
   const distances=positions.map(p=>dot(p,axis));
   if(Math.min(...distances)>limit+mesh.height*2e-7||Math.max(...distances)<-limit-mesh.height*2e-7)return false;
  }
  return true;
 };
 for(let at=0;at<queue.length;at++){
  if((at&255)===0)checkCancel(shouldCancel);
  const face=queue[at];
  if(!accepts(face)){blockedFaces++;continue;}
  if(visible){faceMasks[face]|=bit;affectedFaces++;}
  for(const edge of topology.neighbors[face])if(edge.opposed&&!visited[edge.face]&&edgeDistance2(frame.center,edge.a,edge.b)<=radius2*(1+1e-6)){
   visited[edge.face]=1;
   queue.push(edge.face);
  }
 }
 return{affectedFaces,blockedFaces,visitedFaces:queue.length,projection:'bounded planar; opposed manifold shared edges only'};
}

export function compileLocalPatches(mesh,raw,parts={groups:[]},{actualHeightMeters=10,onProgress=()=>{},shouldCancel=()=>false,projectedIds=new Set()}={}){
 const document=validateLocalPatches(raw,mesh.sourceSHA256,parts);
 validateLocalPatchSource(document,mesh);
 if(!Number.isFinite(actualHeightMeters)||actualHeightMeters<.1||actualHeightMeters>200||!(mesh.height>0))throw Error('局部细节需要有效模型与校准树高。');
 if(mesh.indices.length/3>250000)throw Error('局部细节暂支持25万三角面以内的树，请先制作工作副本。');
 const baseKey=localPatchKey(document,actualHeightMeters,parts);
 const boxIds=document.patches.filter(patch=>projectedIds.has(patch.id)).map(patch=>patch.id);
 const key=boxIds.length?JSON.stringify([baseKey,'planar-box-v1',boxIds]):baseKey;
 const faceMasks=new Uint8Array(mesh.indices.length/3),descriptors=[],stats=[];
 if(!document.patches.length)return{kind:'source-local-patch-compilation',version:1,sourceSHA256:mesh.sourceSHA256,key,faceMasks,descriptors,stats,affectedFaces:0};
 const projected=boxIds.length?new Float64Array(mesh.pos.length):null;
 let topology,normals;
 if(boxIds.length<document.patches.length){
  topology=buildBrushTopology(mesh);
  normals=Array.from({length:faceMasks.length},(_,face)=>{
   const p=[0,1,2].map(c=>point(mesh,mesh.indices[face*3+c]));
   const n=cross(sub(p[1],p[0]),sub(p[2],p[0])),length=Math.hypot(...n);
   return length>mesh.height**2*1e-14?n.map(v=>v/length):null;
  });
 }
 const partSets=new Map(parts.groups.map(g=>[g.id,new Set(g.faces)]));
 for(const [index,patch]of document.patches.entries()){
  checkCancel(shouldCancel);
  const frame=localPatchFrame(mesh,patch,actualHeightMeters);
  descriptors.push({id:patch.id,enabled:patch.enabled,...frame.uniforms});
  const target=patch.partId?partSets.get(patch.partId):null;
  const protectedFaces=new Set(patch.protectPartIds.flatMap(id=>[...partSets.get(id)]));
  const allowed=face=>(!target||target.has(face))&&!protectedFaces.has(face);
  if(!allowed(patch.anchor.face))throw Error('锚点不在目标部位内，或位于保护部位，请重新定位。');
  const visible=patch.enabled&&patch.opacity>0&&Object.values(patch.channels).some(Boolean),bit=1<<index;
  const faces=projectedIds.has(patch.id)
   ?collectBoxFaces(mesh,frame,projected,faceMasks,bit,allowed,visible,shouldCancel)
   :collectConnectedFaces(mesh,patch,frame,topology,normals,faceMasks,bit,allowed,visible,shouldCancel);
  stats.push({id:patch.id,...faces,cutGeometryWarning:patch.type==='cut'?'年轮只适用于已有端面；不会切断或生成端面几何。':null});
  onProgress((index+1)/document.patches.length);
 }
 return{kind:'source-local-patch-compilation',version:1,sourceSHA256:mesh.sourceSHA256,key,faceMasks,descriptors,stats,affectedFaces:faceMasks.reduce((s,v)=>s+!!v,0)};
}
