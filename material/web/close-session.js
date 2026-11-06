const requestPattern=/^[a-f0-9]{32}$/;
const aborted=()=>Object.assign(Error('关闭保存已取消。'),{name:'AbortError'});

// Tracks the whole operation, including its finally/restore work.
export class OperationTracker{
  pending=new Set();listeners=new Set();
  wrap(fn){const tracker=this;return function(...args){const token={};tracker.pending.add(token);let result;try{result=fn.apply(this,args);}catch(error){tracker.finish(token);throw error;}return Promise.resolve(result).finally(()=>tracker.finish(token));};}
  finish(token){this.pending.delete(token);if(!this.pending.size)for(const notify of [...this.listeners])notify();}
  wait(signal){if(signal?.aborted)return Promise.reject(aborted());if(!this.pending.size)return Promise.resolve();return new Promise((resolve,reject)=>{const cleanup=()=>{this.listeners.delete(done);signal?.removeEventListener('abort',cancel);},done=()=>{cleanup();resolve();},cancel=()=>{cleanup();reject(aborted());};this.listeners.add(done);signal?.addEventListener('abort',cancel,{once:true});});}
}

export class CloseCoordinator{
  constructor({operations,freeze,finishInput,cancelWork,flush,timeoutMs=12000}){Object.assign(this,{operations,freeze,finishInput,cancelWork,flush,timeoutMs});this.current=null;this.disposed=false;}
  prepare(requestId){
    if(this.disposed)return Promise.reject(aborted());
    if(!requestPattern.test(requestId))return Promise.reject(Error('关闭请求编号无效。'));
    if(this.current?.id===requestId)return this.current.promise;
    if(this.current)return Promise.reject(Error('已有关闭保存请求。'));
    const attempt={id:requestId,abort:new AbortController(),promise:null};this.current=attempt;
    attempt.promise=this.run(attempt);return attempt.promise;
  }
  async run(attempt){
    const signal=attempt.abort.signal;let timer,abortListener;
    try{
      // Flush a focused field and the final dab before disabling the editor.
      this.finishInput();this.freeze(true);this.cancelWork();
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(Error('关闭保存超时，结果尚未确认。请重试或继续编辑。'));attempt.abort.abort();},this.timeoutMs);abortListener=()=>reject(aborted());signal.addEventListener('abort',abortListener,{once:true});});
      const work=(async()=>{await this.operations.wait(signal);if(signal.aborted)throw aborted();const result=await this.flush(signal);if(signal.aborted||this.current!==attempt)throw aborted();return result;})();
      const result=await Promise.race([work,timeout]);
      return {...result,ok:true,requestId:attempt.id};
    }catch(error){if(this.current===attempt){this.current=null;this.freeze(false);}throw error;}
    finally{clearTimeout(timer);signal.removeEventListener('abort',abortListener);}
  }
  abort(requestId){const attempt=this.current;if(!attempt||attempt.id!==requestId)return false;this.current=null;attempt.abort.abort();this.freeze(false);return true;}
  dispose(){this.disposed=true;if(this.current)this.abort(this.current.id);}
}

// The desktop host sends JSON objects; replies are JSON strings to match the
// existing WebMessageReceived contract. A stale/aborted attempt never replies.
export function installCloseBridge(transport,coordinator){
  if(!transport)return()=>{};
  let disposed=false,active=null;
  const receive=event=>{const data=event.data;if(!data||data.topic!=='tree-material-lab'||!requestPattern.test(data.requestId))return;
    if(data.action==='abort-close'){if(active===data.requestId)active=null;coordinator.abort(data.requestId);return;}
    if(data.action!=='prepare-close'||active===data.requestId)return;
    if(active)return;
    active=data.requestId;
    coordinator.prepare(data.requestId).then(result=>{if(!disposed&&active===data.requestId)transport.postMessage(JSON.stringify({topic:'tree-material-lab',action:'close-ready',...result}));},error=>{if(!disposed&&active===data.requestId){transport.postMessage(JSON.stringify({topic:'tree-material-lab',action:'close-ready',requestId:data.requestId,ok:false,error:String(error.message||error).slice(0,2000)}));active=null;}});
  };
  transport.addEventListener('message',receive);
  return()=>{disposed=true;active=null;transport.removeEventListener('message',receive);coordinator.dispose();};
}
