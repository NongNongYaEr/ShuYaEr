import {analyzeBarkFlow} from './bark-flow-analysis.js';
import {buildBarkFlow} from './bark-flow.js';
import {rememberBanyanSampling} from './bark-flow-banyan.js';
import {captureBarkStructure,bindBarkStructure} from './bark-structure-cache.js';
self.onmessage=({data})=>{try{
 const flow=data.flow||analyzeBarkFlow(data.mesh,data.options,p=>self.postMessage({progress:p.progress*.65,phase:p.phase}));
 const options={corrections:data.corrections,actualHeightMeters:data.actualHeightMeters||10,transition:data.transition??1};let snapshot=null;
 const field=buildBarkFlow(data.mesh,flow,{...options,...(data.includeStructure?{onStructure:value=>snapshot=captureBarkStructure(data.mesh,value,data.corrections)}:{}),progress:p=>self.postMessage({progress:data.flow?p:.65+p*.35,phase:flow.version===5?'分析榕根表面与保形坐标':'传递枝干纹理坐标'})}),saved=rememberBanyanSampling(flow,field);
 if(snapshot)field.structureCache=bindBarkStructure(data.mesh,saved,snapshot,options);
 self.postMessage({done:true,flow:saved,field},[...Object.values(field).filter(v=>ArrayBuffer.isView(v)).map(v=>v.buffer),...(snapshot?[snapshot.uvDirections.buffer,snapshot.banyanTypes.buffer]:[])]);
 }catch(error){self.postMessage({error:error.message});}};
