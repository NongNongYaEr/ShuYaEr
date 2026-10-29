import {portableBranch,publishPlant} from './plant-pack-data.js';
import {prefabRevision} from './prefab-project-data.js';

// Read only the pinned source library. Carrier records, geometry and materials
// remain immutable; dependency inspection never installs or updates an asset.
export function prefabDependencyLibrary(value){
  if(value?.kind!=='branchforge-prefab-archive')return value?.library||[];
  const cache=new Map(),visiting=new Set();
  function read(value){
    if(!value||typeof value!=='object')return value;
    if(value.$prefab_resource){const id=value.$prefab_resource;if(visiting.has(id))throw Error('预制依赖存在循环');if(cache.has(id))return cache.get(id);if(!Object.hasOwn(resources,id))throw Error('预制固定依赖缺失');visiting.add(id);const result=read(resources[id]);visiting.delete(id);cache.set(id,result);return result;}
    if(Array.isArray(value))return value.map(read);
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,read(v)]));
  }
  const resources=value.resources;if(!resources?.[value.root])throw Error('预制固定版本已缺失');
  return read(resources[value.root].library||[]);
}
function canonical(value){
  if(Array.isArray(value))return value.some(v=>v&&typeof v==='object')?value.map(canonical):value;
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.keys(value).filter(k=>k!=='package_origins'&&value[k]!==undefined).sort().map(k=>[k,canonical(value[k])]));
}
export async function branchDependencyIdentity(item,library=[],fallback=null){
  const portable=portableBranch(item,library,fallback);
  const model=v=>({revision:v.revision||1,shape:v.shape,sample:v.sample,leaf_source_ids:v.leaf_source_ids,organ_source_ids:v.organ_source_ids});
  const bytes=new TextEncoder().encode(JSON.stringify(canonical({...model(portable),versions:(portable.versions||[]).map(model)})));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
}
export async function trunkDependencyIdentity(item){const bytes=new TextEncoder().encode(JSON.stringify(canonical({id:item.id,revision:item.revision,source:item.source?.sha256,calibration:item.calibration,guides:item.guides,binding:item.binding||{}})));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}

// Separate explicit choices from required members. Removing one root cannot
// remove a shared dependency or a resource the user selected independently.
export async function resolveDependencySelection(keys,rows,dependencies){
  const items=new Map(rows.map(r=>[r.key,r])),requiredBy=new Map();
  for(const root of keys){
    if(!items.has(root))throw Error('所选资源已不存在，请刷新');
    const visited=new Set(),visiting=new Set();
    async function visit(key){
      if(visiting.has(key))throw Error('资源依赖存在循环');if(visited.has(key))return;
      visiting.add(key);
      for(const dependency of await dependencies(items.get(key))){
        if(!dependency?.key)throw Error('资源依赖身份缺失');items.set(dependency.key,dependency);
        if(!requiredBy.has(dependency.key))requiredBy.set(dependency.key,new Set());requiredBy.get(dependency.key).add(root);
        await visit(dependency.key);
      }
      visiting.delete(key);visited.add(key);
    }
    await visit(root);
  }
  return {items,requiredBy};
}

export function createResourceDependencyResolver(api){
  let loads=new Map(),modelKeys=new WeakMap();
  const once=(key,read)=>{const cache=loads;if(!cache.has(key))cache.set(key,Promise.resolve().then(read).catch(error=>{cache.delete(key);throw error;}));return cache.get(key);};
  async function resolve(keys,rows){
    const branches=api.branches(),byProject=new Map(branches.map(a=>[a.id,a]));
    const packageRows=new Map((api.library().assets||[]).map(a=>[a.key,{...a,key:'package:'+a.id,packageAlias:a.id,scope:'library',packageAsset:true}]));
    const byPackage=new Map([...packageRows.values()].map(a=>[a.key,a]));
    const identity=(item,library,fallback)=>{if(!modelKeys.has(item))modelKeys.set(item,branchDependencyIdentity(item,library,fallback));return modelKeys.get(item);};
    async function source(row){
      if(row.key.startsWith('project-branch:'))return byProject.get(row.id);
      if(row.key.startsWith('project-trunk:'))return api.trunks?.().find(a=>a.id===row.id);
      return once(row.key,()=>api.read(row));
    }
    async function snapshotMembers(owner,library,fallback){
      return Promise.all(library.map(async item=>{
        const revision=item.revision||1,signature=await identity(item,library,fallback);
        // Prefer project sources; compare the actual model as well as revision.
        // A renamed/reconciled source may have a different ID, never a guessed name.
        const candidates=rows.filter(r=>r.type==='branch'&&(r.revision||1)===revision&&(!owner.key.startsWith('project-')||r.key.startsWith('project-branch:'))).sort((a,b)=>Number(b.id===item.id)-Number(a.id===item.id));
        for(const row of candidates){
          if(!row.key.startsWith('project-branch:')&&row.id!==item.id&&row.originalId!==item.id)continue;
          try{const value=await source(row);if(value&&await identity(value,row.key.startsWith('project-branch:')?branches:library,api.leafMaterial?.())===signature)return row;}catch{
            // A missing or changed mutable catalog entry cannot invalidate the
            // complete fixed model already embedded in the selected prefab.
          }
        }
        // The original library may be removed or have a newer version. Present
        // the embedded fixed model instead of checking a different live model.
        return {key:'dependency:branch:'+item.id+':'+revision+':'+signature,id:item.id,type:'branch',revision,name:item.name||item.id,thumbnail:item.thumbnail||'',scope:owner.scope||'project',snapshot:true,inspection:portableBranch(item,library,fallback)};
      }));
    }
    async function dependencies(row){
      const packaged=byPackage.get(row.key);
      if(packaged)return (packaged.dependencies||[]).map(key=>{const target=packageRows.get(key);if(!target)throw Error('资源包的固定依赖缺失');return target;});
      if(row.type!=='prefab'&&row.type!=='plant')return [];
      let library,fallback,trunks=[];
      if(row.key.startsWith('project-prefab:')){
        const context=api.prefabs(),item=context.assets.items.find(p=>p.id===row.id);if(!item)throw Error('项目预制已不存在');
        const root=prefabRevision(item).root;library=await once('pinned-library:'+root,()=>prefabDependencyLibrary({kind:'branchforge-prefab-archive',root,resources:context.assets.resources}));
      }else{
        const value=await source(row);
        if(row.type==='prefab')library=prefabDependencyLibrary(value);
        else {const published=publishPlant(value);library=published.authoring?.branch_library||[];fallback=published.authoring?.leaf_material;trunks=published.authoring?.imported_trunks?.assets||[];}
      }
      const members=await snapshotMembers(row,library,fallback);
      for(const trunk of trunks){const signature=await trunkDependencyIdentity(trunk);let found=null;for(const candidate of rows.filter(r=>r.type==='trunk'&&(r.revision||1)===trunk.revision&&(r.id===trunk.id||r.originalId===trunk.id))){try{const value=await source(candidate);if(value&&await trunkDependencyIdentity(value)===signature){found=candidate;break;}}catch{}}
        members.push(found||{key:'dependency:trunk:'+trunk.id+':'+trunk.revision+':'+signature,id:trunk.id,type:'trunk',revision:trunk.revision,name:trunk.name,thumbnail:trunk.thumbnail||'',scope:row.scope||'project',snapshot:true,inspection:trunk});
      }return members;
    }
    return resolveDependencySelection(keys,rows,dependencies);
  }
  return {resolve,clear(){loads=new Map();modelKeys=new WeakMap();}};
}
