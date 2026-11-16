import {analyzeUV} from './uv-analysis.js';
import {packSourceOverlayUv} from './source-overlay-uv-repair.js';
import {verifySurfacePreserved} from './mesh-codec.js';

export const MAX_PROJECTION_RECOVERY_FACES=50000;
const slices=8;

// Make separate charts for connected faces with the same projection and depth
// slice. The packer will isolate any remaining folds before placing the charts.
function projectionSeed(mesh){
 const {pos,normal,indices}=mesh;
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(const vertex of indices){
  for(let axis=0;axis<3;axis++){
   const value=pos[vertex*3+axis];
   lo[axis]=Math.min(lo[axis],value);
   hi[axis]=Math.max(hi[axis],value);
  }
 }
 const scale=Math.max(...hi.map((v,axis)=>v-lo[axis]));
 if(!(scale>0&&Number.isFinite(scale)))throw Error('备用展开无法处理没有有效尺寸的网格。');

 const positions=[],normals=[],uv=[],sourceIndices=[];
 const corners=new Uint32Array(indices.length),faceGroups=new Uint32Array(indices.length/3);
 const byProjection=new Map();
 for(let face=0;face<faceGroups.length;face++){
  const offset=face*3,vertices=indices.subarray(offset,offset+3);
  const points=Array.from(vertices,id=>pos.subarray(id*3,id*3+3));
  const [a,b]=[points[1],points[2]].map(p=>Array.from(p,(value,axis)=>value-points[0][axis]));
  const area=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  let axis=0;
  for(let i=1;i<3;i++)if(Math.abs(area[i])>Math.abs(area[axis]))axis=i;
  if(!area[axis])throw Error('备用展开遇到退化面，请先清理退化面。');
  const positive=area[axis]>0;
  const depth=(points[0][axis]+points[1][axis]+points[2][axis])/3;
  const projection=axis*2+Number(positive);
  const depthSlice=Math.floor((depth-lo[axis])*slices/scale);
  faceGroups[face]=projection*(slices+1)+depthSlice;
  const uAxis=(axis+1)%3,vAxis=(axis+2)%3;
  const tiny=Math.abs(area[axis])/(scale*scale)<1e-8;
  for(let corner=0;corner<3;corner++){
   const vertex=vertices[corner],point=points[corner],key=vertex*6+projection;
   let target=tiny?undefined:byProjection.get(key);
   if(target===undefined){
    target=sourceIndices.length;
    if(!tiny)byProjection.set(key,target);
    positions.push(...point);
    normals.push(...normal.subarray(vertex*3,vertex*3+3));
    sourceIndices.push(vertex);
    if(tiny){
     // A dedicated small island keeps UV area representable for extremely
     // small faces after normalization and conversion to Float32.
     uv.push(.01+(corner===1?.002:0),.01+(corner===2?.002:0));
    }else{
     const u=(point[uAxis]-lo[uAxis])/scale,v=(point[vAxis]-lo[vAxis])/scale;
     uv.push(.02+.96*(positive?u:1-u),.02+.96*v);
    }
   }
   corners[offset+corner]=target;
  }
 }
 return {pos:Float32Array.from(positions),normal:Float32Array.from(normals),uv:Float32Array.from(uv),
  indices:corners,faceGroups,sourceIndices:Uint32Array.from(sourceIndices)};
}

export function packProjectionRecovery(mesh,{resolution,padding,onProgress=()=>{}}){
 if(mesh.indices.length/3>MAX_PROJECTION_RECOVERY_FACES)throw Error('备用展开最多处理 5 万面，请先分步减面。');
 const seed=projectionSeed(mesh);
 const result=packSourceOverlayUv(seed,{resolution,padding,deadline:Date.now()+45000,onProgress});
 result.sourceIndices=Uint32Array.from(result.sourceIndices,index=>seed.sourceIndices[index]);
 verifySurfacePreserved(mesh,result);
 const audit=analyzeUV(result);
 if(audit.zeroUvFaces||audit.outOfRangeFaces||audit.overlap>.001)throw Error('备用展开未通过 UV 检查。');
 const {sourceOverlayRepair,...packing}=result.packing;
 result.packing={...packing,method:'projection-recovery',projectionRecovery:{
  islands:audit.islands,separatedFaces:sourceOverlayRepair.separatedFaces
 }};
 return result;
}
