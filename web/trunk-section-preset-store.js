import {
  TRUNK_SECTION_PRESET_LIMIT, TRUNK_SECTION_PRESET_ID,
  normalizeTrunkSectionPreset, createTrunkSectionPresetId,
} from './trunk-section-presets.js';

// Desktop libraries live on disk so they survive the host's changing port.
// A genuinely unavailable route (404) permits the static browser fallback;
// failed writes never silently switch storage or claim to have saved on disk.
export function createTrunkSectionPresetStore({
  fetch: requestFetch = globalThis.fetch,
  indexedDB: localDatabase = globalThis.indexedDB,
  now = () => Date.now(), createId = createTrunkSectionPresetId,
} = {}) {
  let probe, connection, kind = 'pending', warnings = [];
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const sorted = items => items.sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name, 'zh-CN'));

  async function request(url, options = {}) {
    if (!requestFetch) return null;
    const response = await requestFetch(url, { cache: 'no-store', ...options });
    if (response.status === 404) return null;
    const data = await response.json();
    if (!response.ok || data?.success === false) throw Error(data?.message || '截面预设库读写失败');
    return data;
  }
  function itemsFrom(data) {
    if (!Array.isArray(data?.items) || data.items.length > TRUNK_SECTION_PRESET_LIMIT) throw Error('截面预设库响应无效');
    warnings = Array.isArray(data.warnings) ? data.warnings.map(String) : [];
    return sorted(data.items.map(item => normalizeTrunkSectionPreset(item, { now: now() })));
  }
  function backend() {
    return probe ||= request('/api/trunk-section-presets').then(data => {
      if (data) { itemsFrom(data); kind = 'disk'; return true; }
      kind = 'browser'; return false;
    });
  }
  function db() {
    if (!localDatabase) throw Error('当前浏览器不支持截面预设存储，请在桌面版中保存');
    return connection ||= new Promise((resolve, reject) => {
      const request = localDatabase.open('branchforge-trunk-section-presets', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('presets', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || Error('截面预设库无法打开'));
      request.onblocked = () => reject(Error('截面预设库正在被其他页面使用，请关闭旧页面后重试'));
    });
  }
  async function local(mode, action) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('presets', mode);
      const operation = action(transaction.objectStore('presets'));
      transaction.oncomplete = () => resolve(operation?.result);
      transaction.onerror = transaction.onabort = () => reject(transaction.error || Error('截面预设库读写失败'));
    });
  }
  function assertId(id) {
    if (!TRUNK_SECTION_PRESET_ID.test(String(id || ''))) throw Error('截面预设 ID 无效');
    return String(id);
  }

  return {
    get kind() { return kind; },
    get backend() {
      return kind === 'disk' ? '本机截面预设库 · 重启后保留'
        : kind === 'browser' ? '当前浏览器预设库 · 更换地址后独立'
          : '截面预设库尚未连接';
    },
    get warnings() { return [...warnings]; },
    async list() {
      if (await backend()) {
        const data = await request('/api/trunk-section-presets');
        if (!data) throw Error('本机截面预设库不可用，请重启软件后重试');
        return clone(itemsFrom(data));
      }
      const items = await local('readonly', store => store.getAll());
      warnings = [];
      return clone(itemsFrom({ items: items || [] }));
    },
    async put(raw) {
      const item = normalizeTrunkSectionPreset({ ...raw, updatedAt: now() }, {
        id: raw?.id || createId(), now: now(),
      });
      if (await backend()) {
        const data = await request('/api/trunk-section-preset', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item),
        });
        if (!data?.item) throw Error('截面预设保存失败，请重试');
        const saved = normalizeTrunkSectionPreset(data.item, { now: now() });
        if (saved.id !== item.id) throw Error('截面预设保存结果不匹配');
        return clone(saved);
      }
      const existing = await local('readonly', store => store.getAll());
      if (existing.length >= TRUNK_SECTION_PRESET_LIMIT && !existing.some(record => record.id === item.id)) {
        throw Error('截面预设库已达 500 项，请先移除不需要的预设');
      }
      await local('readwrite', store => store.put(item));
      return clone(item);
    },
    async remove(rawId) {
      const id = assertId(rawId);
      if (await backend()) {
        const data = await request('/api/trunk-section-preset?id=' + encodeURIComponent(id), { method: 'DELETE' });
        if (!data?.success) throw Error('截面预设删除失败，请重试');
        return data.item ? clone(normalizeTrunkSectionPreset(data.item, { now: now() })) : null;
      }
      const previous = await local('readonly', store => store.get(id));
      await local('readwrite', store => store.delete(id));
      return previous ? clone(normalizeTrunkSectionPreset(previous, { now: now() })) : null;
    },
  };
}
