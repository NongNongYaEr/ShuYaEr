import { normalizeTrunkDetailPresetShape } from './trunk-detail-presets.js';
import { normalizeBarkMaterial } from './bark-materials.js';
import { normalizeTrunkDetailProfile } from './trunk-detail-profile.js';
import { normalizeTrunkRootPresetShape } from './trunk-root-presets.js';
import {packageOrigins} from './asset-origins.js';

export const TRUNK_PRESET_LIMIT = 500;
export const TRUNK_PRESET_ID = /^trunk-preset-[a-f0-9]{32}(?![\s\S])/;
export const TRUNK_PRESET_KINDS = ['detail', 'combination', 'bark', 'profile', 'root'];
const labels = { detail: '细节预设', combination: '细节组合', bark: '树干材质',profile:'细节轮廓',root:'板根形状' };
export function assertTrunkPresetKind(kind) {
  if (!TRUNK_PRESET_KINDS.includes(kind)) throw Error('预设库类型无效');
  return kind;
}
export function createTrunkPresetId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return 'trunk-preset-' + uuid.replaceAll('-', '').toLowerCase();
  return 'trunk-preset-' + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
export function normalizeTrunkPreset(kind, raw, { now = Date.now(), id = raw?.id } = {}) {
  assertTrunkPresetKind(kind);
  if (!TRUNK_PRESET_ID.test(String(id || ''))) throw Error('预设 ID 无效');
  const name = String(raw?.name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!name || name.length > 80) throw Error('预设名称须为 1–80 字');
  if (!raw?.shape || typeof raw.shape !== 'object' || Array.isArray(raw.shape)) throw Error('预设内容无效');
  const stamp = Number(raw.updatedAt);
  const profile=kind==='profile'?normalizeTrunkDetailProfile(raw.shape):null;
  if(kind==='profile'&&!profile)throw Error('细节轮廓内容无效或版本不受支持');
  return { id: String(id), name,...(raw.package_origins?.length?{package_origins:packageOrigins(raw.package_origins)}:{}),
    shape: kind === 'root'?normalizeTrunkRootPresetShape(raw.shape):kind === 'profile'?profile:kind === 'bark' ? normalizeBarkMaterial(raw.shape) : normalizeTrunkDetailPresetShape(raw.shape),
    updatedAt: Number.isSafeInteger(stamp) && stamp >= 0 ? stamp : Math.max(0, Math.trunc(now)) };
}

// Disk libraries survive changing desktop ports. Only a missing route permits
// browser fallback; errors must remain visible instead of pretending to save.
export function createTrunkPresetStore(libraryKind, {
  fetch: requestFetch = globalThis.fetch, indexedDB: localDatabase = globalThis.indexedDB,
  now = () => Date.now(), createId = createTrunkPresetId,
} = {}) {
  assertTrunkPresetKind(libraryKind);
  const label = labels[libraryKind], query = '?kind=' + libraryKind;
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  let probe, connection, backendKind = 'pending', warnings = [];
  const normalize = raw => normalizeTrunkPreset(libraryKind, raw, { now: now() });
  async function request(url, options = {}) {
    if (!requestFetch) return null;
    const response = await requestFetch(url, { cache: 'no-store', ...options });
    if (response.status === 404) return null;
    const data = await response.json();
    if (!response.ok || data?.success === false) throw Error(data?.message || label + '库读写失败');
    return data;
  }
  function itemsFrom(data) {
    if (!Array.isArray(data?.items) || data.items.length > TRUNK_PRESET_LIMIT) throw Error(label + '库响应无效');
    warnings = Array.isArray(data.warnings) ? data.warnings.map(String) : [];
    return data.items.map(normalize).sort((a,b) => b.updatedAt-a.updatedAt || a.name.localeCompare(b.name, 'zh-CN'));
  }
  function backend() {
    return probe ||= request('/api/trunk-presets' + query).then(data => {
      if (data) { itemsFrom(data); backendKind = 'disk'; return true; }
      backendKind = 'browser'; return false;
    });
  }
  function db() {
    if (!localDatabase) throw Error('当前浏览器不支持预设存储，请在桌面版中保存');
    return connection ||= new Promise((resolve,reject) => {
      const req = localDatabase.open('branchforge-trunk-presets-' + libraryKind, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('presets', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || Error(label + '库无法打开'));
      req.onblocked = () => reject(Error('预设库正在被其他页面使用，请关闭旧页面后重试'));
    });
  }
  async function local(mode, action) {
    const database = await db();
    return new Promise((resolve,reject) => {
      const tx = database.transaction('presets', mode), op = action(tx.objectStore('presets'));
      tx.oncomplete = () => resolve(op?.result);
      tx.onerror = tx.onabort = () => reject(tx.error || Error(label + '库读写失败'));
    });
  }
  return {
    get kind() { return backendKind; },
    get backend() { return backendKind === 'disk' ? '本机' + label + '库 · 重启后保留'
      : backendKind === 'browser' ? '当前浏览器' + label + '库 · 更换地址后独立' : label + '库尚未连接'; },
    get warnings() { return [...warnings]; },
    async list() {
      if (await backend()) {
        const data = await request('/api/trunk-presets' + query);
        if (!data) throw Error('本机预设库不可用，请重启软件后重试');
        return clone(itemsFrom(data));
      }
      return clone(itemsFrom({ items: await local('readonly', s => s.getAll()) || [] }));
    },
    async put(raw) {
      const item = normalizeTrunkPreset(libraryKind, { ...raw, updatedAt: now() }, { id: raw?.id || createId(), now: now() });
      if (await backend()) {
        const data = await request('/api/trunk-preset' + query, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) });
        if (!data?.item) throw Error(label + '保存失败，请重试');
        const saved = normalize(data.item);
        if (saved.id !== item.id) throw Error('预设保存结果不匹配');
        return clone(saved);
      }
      const existing = await local('readonly', s => s.getAll());
      if (existing.length >= TRUNK_PRESET_LIMIT && !existing.some(x => x.id === item.id)) throw Error('预设库已达 500 项，请先移除不需要的预设');
      await local('readwrite', s => s.put(item));
      return clone(item);
    },
    async remove(id) {
      if (!TRUNK_PRESET_ID.test(String(id || ''))) throw Error('预设 ID 无效');
      if (await backend()) {
        const data = await request('/api/trunk-preset' + query + '&id=' + encodeURIComponent(id), { method: 'DELETE' });
        if (!data?.success) throw Error(label + '删除失败，请重试');
        return data.item ? clone(normalize(data.item)) : null;
      }
      const previous = await local('readonly', s => s.get(id));
      await local('readwrite', s => s.delete(id));
      return previous ? clone(normalize(previous)) : null;
    },
  };
}
