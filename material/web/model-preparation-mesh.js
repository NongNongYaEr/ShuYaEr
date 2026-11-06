import {optimizationOptions} from './mesh-optimization.js';
export async function optimizePreparationMesh(original,options,{request,setCancel,current,repair,progress,workerFactory=()=>new Worker('./mesh-optimization-worker.js',{type:'module'})}){
 const worker=workerFactory(),pending=new Map();let sequence=0,job=null,ended=false;
 const abort=()=>Object.assign(Error('已取消模型准备。'),{name:'AbortError'}),check=()=>{if(ended||!current())throw abort();};
 const call=(kind,data={},transfer=[])=>new Promise((resolve,reject)=>{check();const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,kind,...data},transfer);});
 const release=()=>{if(job){const id=job;job=null;return request('mesh/jobs/'+id+'/release',{method:'POST',keepalive:true}).catch(()=>{});}};
 const stop=()=>{if(ended)return;ended=true;worker.terminate();for(const p of pending.values())p.reject(abort());pending.clear();release();};
 worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data);};worker.onerror=e=>{for(const p of pending.values())p.reject(Error(e.message||'高模读取失败。'));pending.clear();};setCancel(stop);
 try{
  const loaded=await call('load',{bytes:original.bytes,name:original.name},[original.bytes]);check();if(!await repair({normalRepair:loaded.info.normalRepair,geometryRepair:loaded.info.geometryRepair},original.name))throw abort();check();
  const settings=optimizationOptions({targetTriangles:options.target,actualHeightMeters:options.height,preserveUV:false}),started=await request('mesh/jobs?options='+encodeURIComponent(JSON.stringify({...settings,previewSource:false})),{body:loaded.input});
  job=started.id;if(ended||!current()){await release();throw abort();}
  for(;;){check();const state=await request('mesh/jobs/'+job);check();progress(state);if(state.state==='complete')break;if(state.state==='failed')throw Error(state.error);if(state.state==='cancelled')throw abort();await new Promise(r=>setTimeout(r,120));}
  const bytes=await request('mesh/jobs/'+job+'/result',{binary:true});check();await call('result',{bytes:bytes.buffer,options:settings,preview:false},[bytes.buffer]);check();
  const name=original.name.replace(/\.glb$/i,'')+'_准备模型.glb',result=await call('export',{name,adopt:false});check();return{bytes:result.bytes.buffer,name,metadata:result.metadata};
 }finally{await release();stop();}
}
