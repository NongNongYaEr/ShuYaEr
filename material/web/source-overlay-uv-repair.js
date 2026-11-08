import {packUvCharts} from './uv-constraints.js';
import {assertUvClearance,measureUvClearance,strictUvCharts} from './uv-clearance.js';
import {verifySurfacePreserved} from './mesh-codec.js';

const MAX_OVERLAP_WITNESSES=2048;

export function packSourceOverlayUv(mesh,{resolution,padding,onProgress=()=>{}}){
 const original=measureUvClearance(mesh,{maxOverlapWitnesses:MAX_OVERLAP_WITNESSES});
 if(original.status!=='measured'||original.overlaps.truncated)
  throw Error('原 UV 存在无效坐标或过多重叠，无法用原岛排布准备效果工作 UV。');

 // Each reported same-chart overlap loses at least one of its faces from
 // that chart. Existing source UV coordinates remain available for sampling.
 const isolatedFaces=new Set(original.overlaps.witnesses.map(({faces})=>faces[1]));
 const {labels}=strictUvCharts(mesh,{isolatedFaces,faceGroups:mesh.faceGroups});
 onProgress(.2);
 const packed=packUvCharts(mesh,{resolution,padding,faceCharts:labels,quarterTurns:true,onProgress:p=>onProgress(.2+p*.65)});
 verifySurfacePreserved(mesh,packed);
 assertUvClearance(measureUvClearance(packed),{resolution,padding});
 packed.packing={...packed.packing,layoutMethod:packed.packing.method,method:'source-overlay-overlap-repair',sourceOverlayRepair:{separatedFaces:isolatedFaces.size,originalOverlapPairs:original.overlaps.count}};
 onProgress(1);
 return packed;
}
