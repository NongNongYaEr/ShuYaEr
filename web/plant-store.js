// Shared library for reusable leaf sets, inflorescences and complete plant assets.
export function plantStore(storeName) {
  const connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('branchforge-plants', 2);
    request.onupgradeneeded = () => { for (const name of ['leaves', 'vines', 'flowers']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' }); };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); }; request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('请关闭其他旧版本窗口后重新打开，以升级共享素材库'));
  });
  async function run(mode, fn) { const db = await connection; return new Promise((resolve, reject) => { const tx = db.transaction(storeName, mode), request = fn(tx.objectStore(storeName)); tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
  return { list: () => run('readonly', (s) => s.getAll()), put: (v) => run('readwrite', (s) => s.put(v)), remove: (id) => run('readwrite', (s) => s.delete(id)) };
}
