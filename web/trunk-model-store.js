import {normalizeImportedTrunks} from './imported-trunk-runtime.js';
async function request(url,options={}){const response=await fetch(url,{cache:'no-store',...options}),value=await response.json();if(!response.ok||value.success===false)throw Error(value.message||'树干素材保存失败');return value;}
export function createTrunkModelStore(){return {
 async list(){return (await request('/api/trunk-models')).items;},
 async get(id,revision=null){const model=await request('/api/trunk-model?id='+encodeURIComponent(id)+(revision==null?'':'&revision='+revision));normalizeImportedTrunks({version:1,assets:[model],mounts:[]});return model;},
 async put(model,{expectedRevision=0,thumbnail=''}={}){return (await request('/api/trunk-model',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,expectedRevision,thumbnail})})).item;}
};}
