import {computeRayAO} from './ray-ao.js';
self.onmessage=({data})=>{try{const result=computeRayAO(data,progress=>self.postMessage({progress}));self.postMessage({done:true,...result},[result.ao.buffer]);}catch(e){self.postMessage({error:e.message});}};
