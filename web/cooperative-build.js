// The synchronous reference and responsive editor drive the same operations.
// Cancellation closes the iterator so its owned, unpublished resources unwind.
export function finishBuildSteps(steps){
  let result;while(!(result=steps.next()).done){}return result.value;
}

function yieldToUi(){
  // Boosted scheduler.yield continuations can run ahead of timers/rendering in
  // an occluded WebView. A normal message task gives those callbacks a turn
  // without imposing nested setTimeout's minimum delay on every small batch.
  if(typeof window!=='undefined'&&typeof MessageChannel==='function')return new Promise(resolve=>{
    const channel=new MessageChannel();channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};channel.port2.postMessage(null);
  });
  return new Promise(resolve=>setTimeout(resolve,0));
}
export async function runBuildSteps(steps,{shouldAbort=()=>false,yieldControl=yieldToUi,budgetMs=8,now=()=>performance.now(),onSlice=()=>{},drainOnError=false}={}){
  let completed=false,start=now(),stage='prepare',needsCheck=true;
  const check=()=>{if(shouldAbort()){const error=new Error('Model build superseded');error.name='AbortError';throw error;}};
  try{
    for(;;){
      // Authored inputs can change while we yield, not between synchronous
      // iterator steps. Avoid re-reading the full UI for every mesh/vertex job.
      if(needsCheck){check();needsCheck=false;}
      const result=steps.next();stage=result.value?.stage||stage;
      if(result.done){completed=true;onSlice({stage,ms:now()-start,done:true});return result.value;}
      if(now()-start>=budgetMs){onSlice({stage,ms:now()-start,done:false});await yieldControl();start=now();needsCheck=true;}
    }
  }finally{if(!completed){if(drainOnError)finishBuildSteps(steps);else steps.return();}}
}
