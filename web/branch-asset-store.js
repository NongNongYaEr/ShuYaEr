import {isPackageAsset,packAssets,readPackAsset} from './plant-pack-client.js';
export function shareBranchAssetMaterials(items) {
  const owners=[];
  for(const item of items){
    const material=item.sample?.authoring?.leaf_material;if(!material?.color)continue;
    const keys=Object.keys(material);
    const owner=owners.find(entry=>Object.keys(entry.material).length===keys.length&&keys.every(key=>entry.material[key]===material[key]));
    if(owner){item.sample.material_asset_id=owner.id;delete item.sample.authoring.leaf_material;}
    else owners.push({id:item.id,material});
  }
  return items;
}

// Desktop storage survives the host's changing localhost port. Static hosting
// keeps using the existing IndexedDB library.
export function createBranchAssetStore() {
  let connection, kind='browser', catalog=[], thumbnails=[];
  const summary=item=>({id:item.id,name:item.name,revision:item.revision,thumbnail:item.thumbnail,
    tags:item.sample?.authoring?.recipe?.tags||[],branches:item.shape?.branches?.length||0,
    leafCount:item.sample?.leaf_meshes?.length||0,organCount:item.sample?.authoring?.tree_organs?.units?.length||0});
  async function db(){return connection ||= new Promise((resolve,reject)=>{const r=indexedDB.open('branchforge-branch-assets',1);r.onupgradeneeded=()=>r.result.createObjectStore('assets',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function local(mode,fn){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('assets',mode),r=fn(tx.objectStore('assets'));tx.oncomplete=()=>resolve(r?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  async function request(url,options={}){const r=await fetch(url,{cache:'no-store',...options});if(r.status===404)return null;const data=await r.json();if(!r.ok||data.success===false)throw Error(data.message||'单元枝素材库读写失败');return data;}
  const applyThumbnail=item=>{const cached=thumbnails.find(t=>t.id===item?.id&&t.revision===item.revision);if(cached)Object.assign(item,{thumbnail:cached.thumbnail,thumbnail_revision:cached.thumbnail_revision,thumbnail_render_version:cached.thumbnail_render_version});return item;};
  async function refreshPackages(){const rows=await packAssets('branch');catalog=[...catalog.filter(a=>!isPackageAsset(a.id)),...rows];}
  const backend=request('/api/branch-assets').then(async data=>{if(!data)return false;if(!Array.isArray(data.items))throw Error('单元枝素材库响应无效');kind='disk';try{thumbnails=(await request('/api/branch-thumbnails'))?.items||[];}catch{}catalog=data.items.map(applyThumbnail);await refreshPackages();return true;});
  return {
    get kind(){return kind;},
    get catalog(){return catalog;},
    refreshPackages,
    async list(){
      const disk=await backend;
      // The global disk catalog can contain thousands of cards. Geometry and
      // atlases enter the current project only when a card is actually opened.
      const items=await local('readonly',s=>s.getAll());
      if(disk)for(const item of items)for(const version of [item,...(item.versions||[])]){
        const sample=version.sample;if(sample&&!sample.authoring?.leaf_material&&sample.material_asset_id){
          const material=items.find(a=>a.id===sample.material_asset_id)?.sample?.authoring?.leaf_material;
          if(material){sample.authoring={...sample.authoring,leaf_material:material};sample.material_asset_id='';}
        }
      }
      return shareBranchAssetMaterials(disk?items.filter(a=>!catalog.some(b=>a.id===b.id)):items);
    },
    async get(id){if(isPackageAsset(id))return readPackAsset(id);return applyThumbnail(await backend ? await request('/api/branch-asset?id='+encodeURIComponent(id))||await local('readonly',s=>s.get(id)):await local('readonly',s=>s.get(id)));},
    async cacheThumbnail(item){if(isPackageAsset(item.id))return;if(!await backend)return;await request('/api/branch-thumbnails',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.id,revision:item.revision,thumbnail:item.thumbnail})});thumbnails=[...thumbnails.filter(t=>t.id!==item.id),{id:item.id,revision:item.revision,thumbnail:item.thumbnail,thumbnail_revision:item.thumbnail_revision,thumbnail_render_version:item.thumbnail_render_version}];catalog=catalog.map(applyThumbnail);},
    async put(item){if(isPackageAsset(item.id))throw Error('包内原件使用固定版本，请另存为新素材');if(!await backend)return local('readwrite',s=>s.put(item));const result=await request('/api/branch-asset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item)});if(!result?.success)throw Error('单元枝素材库保存失败');catalog=[...catalog.filter(a=>a.id!==item.id),summary(item)];},
    async remove(id){if(isPackageAsset(id))throw Error('请在资源包管理中移除包登记；可另存副本后单独整理');if(await backend){const result=await request('/api/branch-asset?id='+encodeURIComponent(id),{method:'DELETE'});if(!result?.success)throw Error('单元枝素材库删除失败');catalog=catalog.filter(a=>a.id!==id);}await local('readwrite',s=>s.delete(id));}
  };
}
