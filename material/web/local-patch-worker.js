import {compileLocalPatches} from './local-patch-analysis.js';
self.onmessage=({data})=>{try{const result=compileLocalPatches(data.mesh,data.patches,data.parts,{actualHeightMeters:data.actualHeightMeters,onProgress:progress=>self.postMessage({progress})});self.postMessage({done:true,result},[result.faceMasks.buffer]);}catch(error){self.postMessage({error:error.message});}};
