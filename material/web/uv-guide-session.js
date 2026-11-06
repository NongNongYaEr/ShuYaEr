export function createGuideWorkerSession(mesh,options,{setCancel=()=>{},onProgress=()=>{},workerFactory=()=>new Worker('./uv-guide-worker.js',{type:'module'})}={}){
  const worker=workerFactory();let pending=null,serial=0,disposed=false;
  const abort=()=>Object.assign(Error('UV接缝任务已取消。'),{name:'AbortError'});
  function dispose(error=abort()){if(disposed)return;disposed=true;worker.terminate();pending?.reject(error);pending=null;}
  worker.onmessage=({data})=>{if(disposed||!pending||data.id!==pending.id)return;if(data.progress!=null){onProgress(data.progress);return;}const p=pending;pending=null;if(data.error)p.reject(Error(data.error));else p.resolve(data.result);};worker.onerror=e=>dispose(Error(e.message||'UV接缝工作线程失败。'));
  function request(operation,extra){if(disposed)return Promise.reject(abort());if(pending)return Promise.reject(Error('UV接缝任务尚未结束。'));setCancel(()=>dispose());return new Promise((resolve,reject)=>{pending={id:++serial,resolve,reject};try{worker.postMessage({id:serial,operation,...extra});}catch(e){dispose(e);}});}
  return{prepare:()=>request('prepare',{mesh:{pos:mesh.pos,normal:mesh.normal,uv:mesh.uv,indices:mesh.indices},options}),pack:nativeResult=>request('pack',{nativeResult}),dispose};
}
