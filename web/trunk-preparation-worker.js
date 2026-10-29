import {readImportedTrunkGlb} from './imported-trunk-glb.js';
import {prepareImportedTrunk} from './imported-trunk-runtime.js';
self.onmessage=async({data})=>{try{const model=prepareImportedTrunk(await readImportedTrunkGlb(data.bytes,{name:data.name}));model.name=model.name.slice(0,80);const root=model.guides[0],end=root.points[1];root.points=Array.from({length:9},(_,i)=>end.map(v=>v*i/8));self.postMessage({model});}catch(error){self.postMessage({error:error.message});}};
