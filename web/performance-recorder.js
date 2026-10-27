// Opt-in local diagnostics. No document data, timers or observers when stopped.
export function summarizeDurations(values){
  const sorted=Array.from(values).filter(v=>Number.isFinite(v)&&v>=0).sort((a,b)=>a-b),n=sorted.length;
  const percentile=p=>n?sorted[Math.max(0,Math.ceil(n*p)-1)]:null;
  return {samples:n,p50_ms:percentile(.5),p95_ms:percentile(.95),max_ms:n?sorted[n-1]:null,total_ms:sorted.reduce((a,b)=>a+b,0)};
}

export function createPerformanceRecorder({capacity=4096,now=()=>performance.now(),Observer=globalThis.PerformanceObserver,onStart=()=>{},onStop=()=>{}}={}){
  const limit=Math.max(8,Math.min(16384,Math.trunc(Number(capacity))||4096)),metrics=new Map();
  let enabled=false,epoch=0,started=0,ended=0,label='',previousFrame=null,observer=null,counters={},events=[];
  const unmeasured=()=>({status:'not_measured',reason:'CPU submission and rAF intervals do not measure GPU execution time.'});let gpuTime=unmeasured();
  const validName=name=>typeof name==='string'&&name.length>0&&name.length<=100;
  function record(name,duration){
    if(!enabled||!validName(name)||!Number.isFinite(duration)||duration<0)return;
    let metric=metrics.get(name);if(!metric){if(metrics.size>=64)return;metric={values:new Float64Array(limit),count:0};metrics.set(name,metric);}
    metric.values[metric.count%limit]=duration;metric.count++;
  }
  function consume(entries){if(!enabled)return;for(const entry of entries)if(entry.startTime>=started)record('main.longtask',entry.duration);}
  function stopObserver(){if(observer){consume(observer.takeRecords());observer.disconnect();observer=null;}}
  const api={
    get enabled(){return enabled;},
    start(name='local-profile'){
      onStop();stopObserver();epoch++;enabled=true;started=now();ended=0;label=String(name).slice(0,120);previousFrame=null;counters={};events=[];metrics.clear();gpuTime=unmeasured();
      if(Observer?.supportedEntryTypes?.includes('longtask'))try{observer=new Observer(list=>consume(list.getEntries()));observer.observe({type:'longtask'});}catch{observer=null;}
      onStart();return epoch;
    },
    stop(){onStop();stopObserver();if(enabled)ended=now();enabled=false;epoch++;previousFrame=null;return api.snapshot();},
    gpuTime(values){if(enabled)gpuTime={...values};},
    record,
    frame(timestamp,visible=true){if(!enabled)return;if(!visible||!Number.isFinite(timestamp)){previousFrame=null;return;}if(previousFrame!==null&&timestamp>=previousFrame)record('frame.interval',timestamp-previousFrame);previousFrame=timestamp;},
    begin(name){
      if(!enabled||!validName(name))return null;const revision=epoch,time=now();let done=false;
      return {timings(prefix,values){if(!done&&enabled&&revision===epoch)api.timings(prefix,values);},end(metadata){if(done)return;done=true;if(!enabled||revision!==epoch)return;const duration=now()-time;record(name,duration);
        if(metadata){const safe=Object.fromEntries(Object.entries(metadata).slice(0,12).filter(([key,value])=>key.length<80&&(['string','number','boolean'].includes(typeof value)||value===null)).map(([key,value])=>[key,typeof value==='string'?value.slice(0,160):value]));events.push({name,duration_ms:duration,metadata:safe});if(events.length>64)events.shift();}
      }};
    },
    measure(name,run){const span=api.begin(name);try{return run();}finally{span?.end();}},
    timings(prefix,values){if(enabled)for(const [name,value]of Object.entries(values))record(prefix+'.'+name,value);},
    counters(values){if(enabled)counters=Object.fromEntries(Object.entries(values).filter(([,v])=>Number.isFinite(v)&&v>=0).slice(0,32));},
    snapshot({samples=false}={}){
      return {version:1,enabled,label,duration_ms:Math.max(0,(enabled?now():ended)-started),capacity:limit,
        metrics:Object.fromEntries([...metrics].map(([name,metric])=>{const retained=Math.min(metric.count,limit),values=Array.from({length:retained},(_,i)=>metric.values[(Math.max(0,metric.count-limit)+i)%limit]);return[name,{...summarizeDurations(values),observed_samples:metric.count,...(samples?{values_ms:values}:{})}];})),
        counters:{...counters},events:events.map(e=>({...e,metadata:{...e.metadata}})),
        gpu_time:{...gpuTime},
        longtask_supported:Boolean(Observer?.supportedEntryTypes?.includes('longtask'))};
    },
  };return api;
}
