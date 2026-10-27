export function createUnitPreparationStore(){
  let backend=null,db=null;
  async function database(){return db||=new Promise((resolve,reject)=>{const r=indexedDB.open('branchforge-unit-preparation',1);r.onupgradeneeded=()=>{r.result.createObjectStore('sources');r.result.createObjectStore('drafts',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function local(store,mode,fn){const d=await database();return new Promise((resolve,reject)=>{const tx=d.transaction(store,mode),r=fn(tx.objectStore(store));tx.oncomplete=()=>resolve(r?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  async function request(url,options){const r=await fetch(url,{cache:'no-store',...options});const value=await r.json();if(!r.ok||value.success===false)throw Error(value.message||'整理草稿保存失败');return value;}
  async function disk(){return backend??=fetch('/api/unit-preparation-drafts',{cache:'no-store'}).then(async r=>{if(r.status===404)return false;if(!r.ok)throw Error('整理草稿库暂不可用');return true;});}
  return {
    async putSource(id,file){if(await disk())await request('/api/unit-preparation-source?id='+id,{method:'POST',body:file});else await local('sources','readwrite',s=>s.put(file,id));},
    async source(id,name){if(await disk()){const r=await fetch('/api/unit-preparation-source?id='+id,{cache:'no-store'});if(!r.ok)throw Error('整理原始 GLB 已缺失');return new File([await r.blob()],name,{type:'model/gltf-binary'});}const blob=await local('sources','readonly',s=>s.get(id));if(!blob)throw Error('整理原始 GLB 已缺失');return new File([blob],name,{type:'model/gltf-binary'});},
    async list(){if(await disk())return (await request('/api/unit-preparation-drafts')).items;return (await local('drafts','readonly',s=>s.getAll())).map(d=>({id:d.id,name:d.name,sourceName:d.sourceName,count:d.units.length,updatedAt:d.updatedAt})).sort((a,b)=>b.updatedAt-a.updatedAt);},
    async get(id){return await disk()?request('/api/unit-preparation-draft?id='+id):local('drafts','readonly',s=>s.get(id));},
    async put(draft){const data=structuredClone(draft);if(await disk()){const result=await request('/api/unit-preparation-draft?id='+data.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {...data,...result};}data.revision=(data.revision||0)+1;data.updatedAt=Date.now();await local('drafts','readwrite',s=>s.put(data));return data;},
    async remove(id){if(await disk())return request('/api/unit-preparation-draft?id='+id,{method:'DELETE'});const draft=await local('drafts','readonly',s=>s.get(id));await local('drafts','readwrite',s=>s.delete(id));if(draft&&!(await local('drafts','readonly',s=>s.getAll())).some(d=>d.sourceId===draft.sourceId))await local('sources','readwrite',s=>s.delete(draft.sourceId));},
  };
}
