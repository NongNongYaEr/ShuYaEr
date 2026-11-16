import {packUvCharts} from './uv-constraints.js';
import {packSourceOverlayUv} from './source-overlay-uv-repair.js';
import {packProjectionRecovery} from './uv-projection-recovery.js';
self.onmessage=({data})=>{
 try{
  let pack=packUvCharts;
  if(data.options.projectFromGeometry)pack=packProjectionRecovery;
  else if(data.options.repairSourceOverlap)pack=packSourceOverlayUv;
  const result=pack(data.mesh,{...data.options,onProgress:progress=>self.postMessage({progress})});
  self.postMessage({done:true,result},[result.pos.buffer,result.normal.buffer,result.uv.buffer,result.indices.buffer,result.sourceIndices.buffer,result.chartIds.buffer,result.tangent.buffer]);
 }catch(error){self.postMessage({error:error.message});}
};
