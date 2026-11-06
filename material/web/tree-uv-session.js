const meshData=mesh=>({pos:mesh.pos,normal:mesh.normal,uv:mesh.uv,indices:mesh.indices,min:mesh.min,max:mesh.max,height:mesh.height,sourceSHA256:mesh.sourceSHA256});
export function createTreeUvSession(mesh,options,{source=mesh,setCancel=()=>{},onProgress=()=>{},workerFactory=()=>new Worker(new URL('./tree-uv-worker.js',import.meta.url),{type:'module'})}={}){
 const worker=workerFactory();let pending=null,serial=0,disposed=false;const abort=()=>Object.assign(Error('树形UV任务已取消。'),{name:'AbortError'});
 function dispose(error=abort()){if(disposed)return;disposed=true;worker.terminate();pending?.reject(error);pending=null;}
 worker.onmessage=({data})=>{if(disposed||!pending||data.id!==pending.id)return;if(data.progress!=null){onProgress(data.progress);return;}const p=pending;pending=null;if(data.error)p.reject(Error(data.error));else p.resolve(data.result);};worker.onerror=error=>dispose(Error(error.message||'树形UV工作线程失败。'));
 function request(operation,extra){if(disposed)return Promise.reject(abort());if(pending)return Promise.reject(Error('树形UV任务尚未结束。'));return new Promise((resolve,reject)=>{pending={id:++serial,resolve,reject};try{setCancel(()=>dispose());if(disposed)return;worker.postMessage({id:serial,operation,...extra});}catch(error){dispose(error);}});}
 return{prepare:()=>request('prepare',{mesh:meshData(mesh),source:meshData(source),options}),pack:nativeResult=>request('pack',{nativeResult}),dispose};
}
