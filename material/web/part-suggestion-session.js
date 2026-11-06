import {validatePartSuggestions} from './part-suggestion-state.js';
export function runPartSuggestionWorker(mesh,options,{setCancel=()=>{},onProgress=()=>{},workerFactory=()=>new Worker(new URL('./part-suggestion-worker.js',import.meta.url),{type:'module'})}={}){
 const worker=workerFactory();return new Promise((resolve,reject)=>{let settled=false;function finish(error,result){if(settled)return;settled=true;worker.terminate();if(error)reject(error);else resolve(result);}
 worker.onmessage=({data})=>{if(settled)return;if(data.error)finish(Error(data.error));else if(data.done){try{finish(null,validatePartSuggestions(data.result,mesh.sourceSHA256,mesh.indices.length/3));}catch(error){finish(error);}}else if(data.progress)onProgress(data.progress);};worker.onerror=error=>finish(Error(error.message||'部位建议线程失败。'));
 try{setCancel(()=>finish(Object.assign(Error('部位建议已取消。'),{name:'AbortError'})));if(!settled)worker.postMessage({mesh:{pos:mesh.pos,indices:mesh.indices,min:mesh.min,height:mesh.height,sourceSHA256:mesh.sourceSHA256},options});}catch(error){finish(error);}
 });
}
