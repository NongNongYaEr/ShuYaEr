export function createGeometryJobClient({createWorker=()=>new Worker(new URL('./trunk-geometry.worker.js',import.meta.url),{type:'module'}),timeoutMs=30000}={}){
  let worker=null,active=null,sequence=0;const stats={submitted:0,completed:0,cancelled:0,launches:0,lastBackend:null,lastComputeMs:null};
  function finish(error,value){const job=active;if(!job)return;active=null;clearTimeout(job.timer);if(error)stats.lastError=error.message;error?job.reject(error):job.resolve(value);}
  function terminate(){worker?.terminate();worker=null;}
  const api={
    run(job){api.cancel();const id=++sequence;return new Promise((resolve,reject)=>{
      try{if(!worker){worker=createWorker();const launched=worker;stats.launches++;worker.onmessage=event=>{if(launched!==worker||event.data.id!==active?.id)return;if(event.data.error){finish(Error(event.data.error));return;}stats.completed++;stats.lastBackend=event.data.backend||null;stats.lastComputeMs=event.data.compute_ms??null;finish(null,event.data);};worker.onerror=event=>{event.preventDefault?.();if(launched!==worker)return;finish(Error(event.message||'后台几何失败'));terminate();};worker.onmessageerror=()=>{if(launched!==worker)return;finish(Error('后台几何传输失败'));terminate();};}
        active={id,resolve,reject,timer:setTimeout(()=>{finish(Error('后台几何计算超时'));terminate();},timeoutMs)};stats.submitted++;worker.postMessage({id,job});
      }catch(error){if(active)finish(error);else reject(error);terminate();}
    });},
    cancel(){if(active){stats.cancelled++;finish(new DOMException('后台几何已取消','AbortError'));terminate();}},
    dispose(){api.cancel();terminate();},get stats(){return {...stats,active:Boolean(active)};},
  };return api;
}
