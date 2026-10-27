import {validateBranchPrefab} from './branch-prefab-data.js';

const refKey='$prefab_resource',resourceId=/^r-[a-f0-9]{64}$/;
const dependencyKeys=new Set(['geometry','sampleLeafMaterial','leaf_material','libraryEntry','leafEntry','organEntry']);
const uid=()=> 'prefab-'+crypto.randomUUID().replaceAll('-','');
export const emptyPrefabAssets=()=>({version:1,items:[],resources:{}});
export function normalizePrefabAssets(value){
  if(value==null)return emptyPrefabAssets();
  if(value.version!==1||!Array.isArray(value.items)||!value.resources||typeof value.resources!=='object'||Array.isArray(value.resources))throw Error('工程预制资源表无效');
  const ids=new Set();
  for(const item of value.items){
    if(!item.id||ids.has(item.id)||!item.counts||!Number.isInteger(item.revision)||!Array.isArray(item.versions)||!item.versions.length)throw Error('工程预制身份或版本无效');ids.add(item.id);
    if(!item.versions.some(v=>v.revision===item.revision))throw Error('工程预制当前版本缺失');
    for(const v of item.versions)if(!resourceId.test(v.root)||!Object.hasOwn(value.resources,v.root))throw Error('工程预制依赖缺失');
  }
  return value;
}
export function normalizePrefabInstances(value){
  if(value==null)return [];
  if(!Array.isArray(value)||value.some(i=>!i?.id||!i.root||!i.definitionId||!Number.isInteger(i.revision)||!i.members||typeof i.members!=='object'||Array.isArray(i.members)))throw Error('工程预制实例登记无效');
  return value;
}
// Large materials, source models and entire definitions are immutable resources.
// History stores small item lists; project serialization includes each resource once.
export async function packPrefab(prefab){
  validateBranchPrefab(prefab);const resources={};
  async function intern(value){const bytes=new TextEncoder().encode(JSON.stringify(value)),hash=await crypto.subtle.digest('SHA-256',bytes),id='r-'+Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');resources[id]??=value;return {[refKey]:id};}
  async function walk(value,key=''){
    if(value==null||typeof value!=='object')return value;
    if(Array.isArray(value)){
      if(!value.some(x=>x&&typeof x==='object'))return value;
      const entryKey={library:'libraryEntry',leaf_meshes:'leafEntry',organ_units:'organEntry'}[key]||'';
      const result=[];for(const x of value)result.push(await walk(x,entryKey));return result;
    }
    const result={};for(const [k,v]of Object.entries(value))result[k]=await walk(v,k);
    return dependencyKeys.has(key)?intern(result):result;
  }
  const packed=await walk(prefab),root=(await intern(packed))[refKey];return {root,resources};
}
export function unpackPrefab({root,resources}){
  const visiting=new Set(),cache=new Map();
  function read(id){if(!resourceId.test(id)||!Object.hasOwn(resources,id))throw Error('预制依赖缺失：'+id);if(visiting.has(id))throw Error('预制依赖循环');if(cache.has(id))return cache.get(id);visiting.add(id);const value=walk(resources[id]);visiting.delete(id);cache.set(id,value);return value;}
  function walk(value){if(!value||typeof value!=='object')return value;if(Object.hasOwn(value,refKey)){if(Object.keys(value).length!==1)throw Error('预制依赖引用无效');return read(value[refKey]);}if(Array.isArray(value))return value.map(walk);return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,walk(v)]));}
  return validateBranchPrefab(read(root));
}
export function prefabRevision(item,revision=item?.revision){const v=item?.versions.find(v=>v.revision===revision);if(!v)throw Error('预制版本已不存在');return v;}
export function projectPrefab(assets,id,revision){const item=assets.items.find(p=>p.id===id);return unpackPrefab({root:prefabRevision(item,revision).root,resources:assets.resources});}
export function addProjectPrefab(assets,packed,{name,thumbnail,counts,source=null}={}){
  if(source){const existing=assets.items.find(p=>p.versions.some(v=>v.source?.versionId===source.versionId));if(existing){const revision=existing.versions.find(v=>v.source?.versionId===source.versionId).revision;return {assets:existing.hidden?{...assets,items:assets.items.map(p=>p===existing?{...p,hidden:false}:p)}:assets,item:existing,revision};}}
  const item={id:uid(),name:String(name||'预制枝干').slice(0,80),thumbnail,counts,revision:1,hidden:false,createdAt:Date.now(),versions:[{revision:1,root:packed.root,source}]};
  return {assets:{version:1,items:[...assets.items,item],resources:{...assets.resources,...packed.resources}},item,revision:1};
}
export function editProjectPrefab(assets,id,patch){const items=assets.items.map(p=>p.id===id&&!Object.entries(patch).every(([key,value])=>p[key]===value)?{...p,...patch,id:p.id,versions:p.versions,revision:p.revision}:p);return items.every((p,n)=>p===assets.items[n])?assets:{...assets,items};}
export function portablePrefabAssets(assets){
  const resources={},seen=new Set();
  function walk(v){if(!v||typeof v!=='object')return;if(Object.hasOwn(v,refKey)){include(v[refKey]);return;}for(const x of Object.values(v))walk(x);}
  function include(id){if(seen.has(id))return;if(!Object.hasOwn(assets.resources,id))throw Error('保存失败：预制依赖缺失');seen.add(id);resources[id]=assets.resources[id];walk(resources[id]);}
  for(const p of assets.items)for(const v of p.versions)include(v.root);
  return {version:1,items:assets.items,resources};
}
export function prefabArchive(packed,item,{familyId=uid(),revision=1,id=uid()}={}){return {kind:'branchforge-prefab-archive',version:1,id,familyId,revision,name:item.name,thumbnail:item.thumbnail,counts:item.counts,createdAt:Date.now(),...packed};}
export function readPrefabArchive(value){return value?.kind==='branchforge-prefab-archive'?unpackPrefab(value):validateBranchPrefab(value);}
export function libraryPrefabSummary(value){return {id:value.id,familyId:value.familyId||value.id,revision:value.revision||1,name:value.name,thumbnail:value.thumbnail,counts:value.counts,createdAt:value.createdAt,archived:!!value.archived,favorite:!!value.favorite,category:value.category||'',tags:value.tags||''};}
export function latestPrefabVersions(items){const groups=new Map();for(const item of items){const id=item.familyId||item.id;if(!groups.has(id)||(groups.get(id).revision||1)<(item.revision||1))groups.set(id,item);}return [...groups.values()];}
