import {isPackageAsset,packAssets,readPackAsset} from './plant-pack-client.js';
import {savePlantUnitThumbnail} from './plant-unit-thumbnails.js';
// A separate database avoids blocking existing plant-library tabs on upgrade.
export function createPlantUnitStore() {
  const ready = new Promise((resolve, reject) => {
    const r = indexedDB.open('branchforge-plant-units', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('packs', { keyPath: 'id' }); r.result.createObjectStore('summaries', { keyPath: 'id' }); };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  async function read(store, id) {
    const db = await ready;
    return new Promise((resolve, reject) => { const r = id == null ? db.transaction(store).objectStore(store).getAll() : db.transaction(store).objectStore(store).get(id);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  }
  async function write(pack, removeId, thumbnail = '', expectedRevision) {
    const db = await ready;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['packs', 'summaries'], 'readwrite');
      const packs = tx.objectStore('packs');
      let conflict = null;
      const put = () => {
        packs.put(pack);
        tx.objectStore('summaries').put({ id: pack.id, name: pack.name, count: pack.units.length + (pack.base_branches?.length || 0), revision: pack.revision, local: true,...(thumbnail?{thumbnail}:{}) });
      };
      if (removeId) { for (const s of ['packs', 'summaries']) tx.objectStore(s).delete(removeId); }
      else if (expectedRevision == null) put();
      else {
        const current = packs.get(pack.id);
        current.onsuccess = () => {
          const revision = current.result ? Number(current.result.revision) || 1 : 0;
          if (revision === expectedRevision) put();
          else { conflict = Error('套装已有新版，请读取库中新版后重试。'); tx.abort(); }
        };
      }
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(conflict || tx.error || Error('素材保存失败'));
    });
  }
  let kind = 'browser';
  const backend = fetch('/api/plant-units', { cache: 'no-store' }).then(async response => {
    if (response.status === 404) return false;
    if (!response.ok) throw Error('电脑素材库读取失败，请重新启动软件');
    const data = await response.json();
    if (!data.success || !Array.isArray(data.items)) throw Error('电脑素材库响应无效');
    kind = 'disk'; return true;
  });
  async function diskJson(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    if (response.status === 404) return null;
    const data = await response.json();
    if (!response.ok || data.success === false) throw Error(data.message || '电脑素材库保存失败');
    return data;
  }
  async function stored(id) {
    if (await backend) {
      const primary = await diskJson('/api/plant-unit?id=' + encodeURIComponent(id));
      return {pack: primary || await read('packs', id), expectedRevision: primary ? Number(primary.revision) || 1 : 0};
    }
    const pack = await read('packs', id);
    return {pack, expectedRevision: pack ? Number(pack.revision) || 1 : 0};
  }
  return {
    get kind() { return kind; },
    async list() {
      if (!await backend) return read('summaries');
      const data = await diskJson('/api/plant-units');
      const merged = new Map((await read('summaries')).map(item => [item.id, item]));
      for (const item of data.items) merged.set(item.id, item);
      for(const item of await packAssets('units'))merged.set(item.id,item);
      return [...merged.values()];
    },
    async get(id) { return isPackageAsset(id) ? readPackAsset(id) : (await stored(id)).pack; },
    async getForWrite(id) {
      if (isPackageAsset(id)) throw Error('包内原件使用固定版本，请另存新套装');
      return stored(id);
    },
    async put(pack,{thumbnail='', expectedRevision}={}) {
      if(isPackageAsset(pack.id))throw Error('包内原件使用固定版本，请另存新套装');
      if (!await backend) return write(pack,undefined,thumbnail,expectedRevision);
      const headers = { 'Content-Type': 'application/json' };
      if (expectedRevision != null) headers['X-BranchForge-Expected-Revision'] = String(expectedRevision);
      const result = await diskJson('/api/plant-unit', { method: 'POST', headers, body: JSON.stringify(pack) });
      if (!result?.success) throw Error('电脑素材库接口不可用，请重新启动软件');
      if(thumbnail){try{await savePlantUnitThumbnail(pack.id,thumbnail);}catch(error){return {thumbnailError:error.message};}}
    },
  };
}
