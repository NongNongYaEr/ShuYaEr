const abort=()=>Object.assign(Error('遮罩更新已被替换或取消。'),{name:'AbortError'});
// At most one active and one newest queued request; pointer movement cannot build an unbounded queue.
export class PixelMaskSession{
  constructor(source,working,{workerFactory=()=>new Worker('./pixel-mask-worker.js',{type:'module'})}={}){this.source=source;this.working=working;this.worker=workerFactory();this.initial=true;this.serial=0;this.disposed=false;this.worker.onmessage=({data})=>{if(!this.active||data.id!==this.active.id)return;const p=this.active;this.active=null;if(data.error)p.reject(Error(data.error));else p.resolve(data);this.flush();};this.worker.onerror=e=>this.dispose(Error(e.message||'像素遮罩计算失败。'));}
  request(options){if(this.disposed)return Promise.reject(abort());this.queued?.reject(abort());return new Promise((resolve,reject)=>{this.queued={id:++this.serial,options:structuredClone(options),resolve,reject};this.flush();});}
  flush(){if(this.disposed||this.active||!this.queued)return;this.active=this.queued;this.queued=null;const {id,options}=this.active,mesh=m=>({pos:m.pos,uv:m.uv,indices:m.indices});this.worker.postMessage({id,...options,...(this.initial?{source:mesh(this.source),working:mesh(this.working)}:{})});this.initial=false;}
  dispose(error=abort()){if(this.disposed)return;this.disposed=true;this.worker.terminate();this.active?.reject(error);this.queued?.reject(error);this.active=this.queued=null;}
}
