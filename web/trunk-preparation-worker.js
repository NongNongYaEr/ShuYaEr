import {readImportedTrunkGlb} from './imported-trunk-glb.js';
import {prepareImportedTrunk} from './imported-trunk-runtime.js';
import {buildUdimTrunkGlb} from './trunk-udim-import.js';
self.onmessage=async({data})=>{
 try{
  const bytes=data.tiles?.length?await buildUdimTrunkGlb(data.bytes,data.tiles):data.bytes;
  const model=prepareImportedTrunk(await readImportedTrunkGlb(bytes,{name:data.name}));
  model.name=model.name.slice(0,80);
  const root=model.guides[0],end=root.points[1];
  root.points=Array.from({length:9},(_,i)=>end.map(v=>v*i/8));
  self.postMessage({model});
 }catch(error){self.postMessage({error:error.message});}
};
