import {flowFieldCacheKey,encodeFlowFieldCache,decodeFlowFieldCache} from './flow-field-cache.js';
export function createFlowFieldCacheClient(request){
 let infoPromise;
 const info=()=>infoPromise||(infoPromise=request('flow-cache/info').catch(()=>null));
 async function identity(mesh,doc){const i=await info();if(!i?.enabled||doc?.barkFlow?.version!==5)return null;const key=await flowFieldCacheKey(mesh,doc,i.algorithm);return key?{key,route:'flow-cache/'+mesh.sourceSHA256+'?key='+key+'&algorithm='+i.algorithm}:null;}
 return{
  async load(mesh,doc,current){try{const id=await identity(mesh,doc);if(!id||!current())return null;const bytes=await request(id.route,{binary:true});if(!current())return null;const field=decodeFlowFieldCache(bytes,mesh,doc.barkFlow,id.key);if(field)field.cacheHit=true;return field;}catch{return null;}},
  async save(mesh,doc,field,current){try{const id=await identity(mesh,doc);if(!id||!current())return false;const bytes=encodeFlowFieldCache(field,mesh,doc.barkFlow,id.key);if(!bytes||!current())return false;await request(id.route,{body:bytes});return current();}catch{return false;}}
 };
}
