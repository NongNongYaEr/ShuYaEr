import {measureUvClearance} from './uv-clearance.js';
self.onmessage=({data})=>{try{const report=measureUvClearance(data.mesh,{onProgress:progress=>self.postMessage({id:data.id,progress})});self.postMessage({id:data.id,report});}catch(error){self.postMessage({id:data.id,error:error.message});}};
