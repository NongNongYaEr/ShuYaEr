// Collect rapid UI edits without copying authoring state on every input event.
// A continuous drag still runs at maxWait; the last batch has its own promise,
// so export/close callers can wait for the final authored values.
export function coalescedUpdate(run,{delay=35,maxWait=80}={}){
 let batch=null,disposed=false;
 function flush(){const b=batch;if(!b)return;clearTimeout(b.timer);batch=null;if(disposed){b.resolve();return;}Promise.resolve().then(run).then(b.resolve,b.reject);}
 return{
  queue(){if(disposed)return Promise.resolve();if(!batch){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});batch={resolve,reject,promise,start:performance.now(),timer:null};}clearTimeout(batch.timer);batch.timer=setTimeout(flush,Math.max(0,Math.min(delay,maxWait-(performance.now()-batch.start))));return batch.promise;},
  flush,dispose(){disposed=true;if(batch){clearTimeout(batch.timer);batch.resolve();batch=null;}}
 };
}
