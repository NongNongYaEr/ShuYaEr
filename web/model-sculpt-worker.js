import {sculptTopology} from './model-sculpt-topology.js';
self.onmessage=({data})=>{try{const topology=sculptTopology(data.position,data.index);self.postMessage({topology},Object.values(topology).map(a=>a.buffer));}catch(error){self.postMessage({error:error.message});}};
