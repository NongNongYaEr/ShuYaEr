import {packUvCharts} from './uv-constraints.js';
import {packSourceOverlayUv} from './source-overlay-uv-repair.js';
self.onmessage=({data})=>{try{const pack=data.options.repairSourceOverlap?packSourceOverlayUv:packUvCharts,result=pack(data.mesh,{...data.options,onProgress:progress=>self.postMessage({progress})});self.postMessage({done:true,result},[result.pos.buffer,result.normal.buffer,result.uv.buffer,result.indices.buffer,result.sourceIndices.buffer,result.chartIds.buffer,result.tangent.buffer]);}catch(e){self.postMessage({error:e.message});}};
