export const isPackageAsset=id=>/^PACK_[a-f0-9]{64}$/.test(String(id));
let cached=null,pending=null;
export async function packRequest(url,options={}){const r=await fetch(url,{cache:'no-store',...options});const data=await r.json();if(!r.ok||data.success===false)throw Error(data.message||'资源包操作失败');return data;}
const post=(url,value)=>packRequest(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
export async function packLibrary(force=false){if(force)cached=null;if(cached)return cached;if(!pending)pending=packRequest('/api/plant-packs/library').then(data=>cached=data).finally(()=>pending=null);return pending;}
export async function packAssets(type,dependencies=false){if(typeof document==='undefined')return [];try{return (await packLibrary()).assets.filter(a=>a.type===type&&(dependencies||a.primary)&&a.packages.some(p=>!p.archived&&(dependencies||p.primary)));}catch(error){if(!error.message.includes('JSON'))throw error;return [];}}
export async function packChanged(){cached=null;await packLibrary(true);document.dispatchEvent(new Event('plantpack-library-changed'));}
export async function packJob(id,{progress=()=>{},signal}={}){
  for(;;){const s=await packRequest('/api/plant-packs/job?id='+id);progress(s);if(s.state==='complete')return {...s.result,jobId:id};if(s.state==='failed'||s.state==='cancelled')throw Error(s.message||s.phase);if(signal?.aborted){await packRequest('/api/plant-packs/cancel?id='+id,{method:'POST'});throw Error('任务已取消');}await new Promise(r=>setTimeout(r,220));}
}
export async function runPackJob(value,options={}){const {id}=await post('/api/plant-packs/start',value);options.started?.(id);return packJob(id,options);}
export async function uploadPackData(value,type,{signal}={}){const blob=value instanceof Blob?value:new Blob([JSON.stringify(value)],{type:'application/json'});return packRequest('/api/plant-packs/upload?type='+type,{method:'POST',body:blob,signal});}
export async function readPackAsset(id){const job=await runPackJob({action:'resolve',id});return packRequest('/api/plant-packs/asset?id='+job.jobId);}
export async function packAssetSummary(id){return (await packLibrary()).assets.find(a=>a.id===id);}
