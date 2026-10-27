import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createTrunkPresetStore, normalizeTrunkPreset, createTrunkPresetId } from '../web/trunk-preset-store.js';
import { TRUNK_DETAIL_COMBINATIONS } from '../web/trunk-detail-presets.js';
import { normalizeBarkMaterial } from '../web/bark-materials.js';

const id = 'trunk-preset-0123456789abcdef0123456789abcdef';
const detailShape = { version: 1, details: [{ id: 'SOURCE', type: 'KNOT', t: .9, angle: 310,
  strength: .3, height: .2, width: 50, branch_id: 'NO_SOURCE_BRANCH' }] };
const rgba = { width: 2, height: 1, pixels: Buffer.from([128, 64, 32, 255, 64, 32, 16, 255]).toString('base64'), name: '真实树皮.png' };
const barkShape = { style: 'IMPORTED', color: '#BAAABB', maps: { color: rgba, normal: rgba, roughness: rgba },
  scale_u_m: .8, scale_v_m: 1.1, direction: 'HORIZONTAL', owner_branch: 'NOT_SAVED' };
const response = data => ({ ok: true, status: 200, json: async () => structuredClone(data) });
function diskMock() {
  const records = new Map(), calls = []; let failure = null;
  return { records, calls, set failure(value) { failure = value; }, async fetch(url, options = {}) {
    const method = options.method || 'GET', parsed = new URL(url, 'http://localhost/'), kind = parsed.searchParams.get('kind');
    calls.push([url, method]);
    if (failure?.method === method) return { ok: false, status: failure.status || 500,
      json: async () => ({ success: false, message: failure.message || '磁盘读写失败' }) };
    if (method === 'GET') return response({ success: true, items: [...records.entries()]
      .filter(([key]) => key.startsWith(kind + ':')).map(([, item]) => item) });
    if (method === 'POST') {
      const item = JSON.parse(options.body); records.set(kind + ':' + item.id, item); return response({ success: true, item });
    }
    if (method === 'DELETE') {
      const key = kind + ':' + parsed.searchParams.get('id'), item = records.get(key) || null; records.delete(key);
      return response({ success: true, item });
    }
    return { status: 404 };
  } };
}
function memoryIndexedDB() {
  const libraries = new Map(); let opens = 0;
  return { get opens() { return opens; }, open(name) {
    opens++; const records = libraries.get(name) || new Map(); libraries.set(name, records);
    const database = { createObjectStore() {}, transaction() {
      const tx = { objectStore() { return { getAll: () => exec(() => [...records.values()]),
        get: key => exec(() => records.get(key)), put: item => exec(() => { records.set(item.id, structuredClone(item)); return item.id; }),
        delete: key => exec(() => records.delete(key)) }; } };
      function exec(fn) { const request = {}; queueMicrotask(() => { request.result = fn(); tx.oncomplete?.(); }); return request; }
      return tx;
    } };
    const request = { result: database }; queueMicrotask(() => { request.onupgradeneeded?.(); request.onsuccess?.(); }); return request;
  } };
}

test('generic detail, combination and RGBA bark records preserve shape without mutating sources', () => {
  for (const [kind, shape] of [['detail', detailShape], ['combination', TRUNK_DETAIL_COMBINATIONS[0].shape], ['bark', barkShape]]) {
    const raw = { id, name: '  我的预设  ', shape, updatedAt: 7, source_branch: 'REMOVE' }, before = structuredClone(raw);
    const item = normalizeTrunkPreset(kind, raw);
    assert.equal(item.name, '我的预设'); assert.equal(item.updatedAt, 7); assert.ok(!Object.hasOwn(item, 'source_branch'));
    assert.deepEqual(raw, before); assert.deepEqual(normalizeTrunkPreset(kind, item), item);
    if (kind === 'bark') {
      assert.deepEqual(item.shape.maps, { color: rgba, normal: rgba, roughness: rgba }); assert.ok(!Object.hasOwn(item.shape, 'owner_branch'));
      item.shape.maps.color.name = 'CHANGED'; assert.equal(raw.shape.maps.color.name, rgba.name);
    } else {
      assert.ok(item.shape.details.every(detail => !Object.hasOwn(detail, 'branch_id')));
      item.shape.details[0].strength = 1; assert.notEqual(raw.shape.details[0].strength, 1);
    }
  }
});

test('disk libraries use isolated classifications and survive new store instances with matching records', async () => {
  const disk = diskMock(), originals = [];
  for (const [kind, shape] of [['detail', detailShape], ['combination', TRUNK_DETAIL_COMBINATIONS[1].shape], ['bark', barkShape]]) {
    const store = createTrunkPresetStore(kind, { fetch: disk.fetch, now: () => 222, createId: () => id });
    assert.deepEqual(await store.list(), []); assert.equal(store.kind, 'disk'); assert.match(store.backend, /本机.*重启后保留/);
    const input = { name: kind, shape }, before = structuredClone(input), saved = await store.put(input); originals.push(saved);
    assert.deepEqual(input, before); assert.equal(saved.updatedAt, 222); assert.equal(saved.id, id);
    const fresh = createTrunkPresetStore(kind, { fetch: disk.fetch }); assert.deepEqual(await fresh.list(), [saved]);
    const removed = await fresh.remove(id); assert.deepEqual(removed, saved); assert.deepEqual(await store.list(), []);
  }
  assert.equal(disk.records.size, 0); assert.equal(originals[2].shape.maps.color.pixels, rgba.pixels);
});

test('disk save/read failures, network errors and lost routes never silently switch to browser storage', async () => {
  const indexedDB = memoryIndexedDB(), disk = diskMock(), store = createTrunkPresetStore('detail', {
    fetch: disk.fetch, indexedDB, now: () => 8, createId: () => id });
  await store.list(); disk.failure = { method: 'POST', message: '磁盘满了' };
  await assert.rejects(store.put({ name: '细节', shape: detailShape }), /磁盘满了/);
  assert.equal(store.kind, 'disk'); assert.equal(indexedDB.opens, 0); assert.equal(disk.records.size, 0);
  disk.failure = { method: 'GET', message: '库损坏' }; await assert.rejects(store.list(), /库损坏/); assert.equal(indexedDB.opens, 0);
  const offline = createTrunkPresetStore('detail', { indexedDB, fetch: async () => { throw Error('网络错误'); } });
  await assert.rejects(offline.list(), /网络错误/); assert.equal(indexedDB.opens, 0);
  let reads = 0;
  const disappeared = createTrunkPresetStore('detail', { indexedDB, fetch: async () => ++reads === 1
    ? response({ success: true, items: [] }) : { status: 404 } });
  await assert.rejects(disappeared.list(), /本机预设库不可用/); assert.equal(disappeared.kind, 'disk'); assert.equal(indexedDB.opens, 0);
});

test('genuine 404 allows labelled browser persistence, with independent detail/combination/bark databases', async () => {
  const indexedDB = memoryIndexedDB(), fetch = async () => ({ status: 404 });
  const store = createTrunkPresetStore('detail', { indexedDB, fetch, createId: () => id, now: () => 333 });
  const saved = await store.put({ name: '浏览器细节', shape: detailShape });
  assert.equal(store.kind, 'browser'); assert.match(store.backend, /当前浏览器.*更换地址后独立/);
  const fresh = createTrunkPresetStore('detail', { indexedDB, fetch }); assert.deepEqual(await fresh.list(), [saved]);
  assert.deepEqual(await createTrunkPresetStore('combination', { indexedDB, fetch }).list(), []);
  assert.deepEqual(await createTrunkPresetStore('bark', { indexedDB, fetch }).list(), []);
  assert.deepEqual(await fresh.remove(id), saved); assert.deepEqual(await store.list(), []);
});

test('invalid kind, strict IDs, names, future detail versions and prototype data are guarded before requests', async () => {
  for (const kind of ['../bark', '__proto__', 'constructor', 'BARK', '', undefined]) {
    assert.throws(() => createTrunkPresetStore(kind), /类型/);
    assert.throws(() => normalizeTrunkPreset(kind, { id, name: 'x', shape: detailShape }), /类型/);
  }
  for (const invalid of [id + '\n', id + 'a', '../escape', '__proto__', 'constructor']) {
    assert.throws(() => normalizeTrunkPreset('detail', { id: invalid, name: 'x', shape: detailShape }), /ID/);
    const disk = diskMock(), store = createTrunkPresetStore('detail', { fetch: disk.fetch });
    await assert.rejects(store.remove(invalid), /ID/); assert.equal(disk.calls.length, 0);
  }
  assert.throws(() => normalizeTrunkPreset('detail', { id, name: ' ', shape: detailShape }), /名称/);
  assert.throws(() => normalizeTrunkPreset('detail', { id, name: 'x', shape: { version: 9, details: detailShape.details } }), /版本/);
  const pollution = JSON.parse('{"id":"' + id + '","name":"安全","shape":{"details":[{"type":"KNOT","__proto__":{"polluted":true}}]},"__proto__":{"polluted":true}}');
  const clean = normalizeTrunkPreset('detail', pollution); assert.equal({}.polluted, undefined);
  assert.ok(!Object.hasOwn(clean, '__proto__')); assert.ok(!Object.hasOwn(clean.shape.details[0], '__proto__'));
  assert.match(createTrunkPresetId(), /^trunk-preset-[a-f0-9]{32}$/);
});

test('invalid response items and mismatched save IDs cannot masquerade as success', async () => {
  const tooMany = createTrunkPresetStore('detail', { fetch: async () => response({ success: true, items: Array(501).fill({}) }) });
  await assert.rejects(tooMany.list(), /响应无效/);
  const invalidItems = createTrunkPresetStore('detail', { fetch: async () => response({ success: true, items: [{ id: '__proto__' }] }) });
  await assert.rejects(invalidItems.list(), /ID/);
  const mismatch = createTrunkPresetStore('detail', { createId: () => id, fetch: async (url, options) => options?.method === 'POST'
    ? response({ success: true, item: { ...JSON.parse(options.body), id: 'trunk-preset-fedcba9876543210fedcba9876543210' } })
    : response({ success: true, items: [] }) });
  await assert.rejects(mismatch.put({ name: '细节', shape: detailShape }), /不匹配/);
});

test('actual PowerShell streamed reader rejects declared and chunked oversize bodies, invalid paths and kinds', { skip: process.platform !== 'win32' }, () => {
  const runtime = path.resolve('.runtime'); mkdirSync(runtime, { recursive: true });
  const directory = mkdtempSync(path.join(runtime, 'trunk-preset-guard-')), file = path.join(directory, 'guard.ps1');
  const quote = v => "'" + v.replaceAll("'", "''") + "'";
  writeFileSync(file, '\ufeff' + `
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$script:AppDir=${quote(path.resolve('.'))}
$env:BRANCHFORGE_SESSION_TEST_DIR=${quote(directory)}
. (Join-Path $script:AppDir 'scripts/trunk-preset-server.ps1')
$script:TrunkPresetBodyLimit=8
$results=@{}
foreach($length in @(9,-1)) {
  $bytes=New-Object byte[] 9
  $request=[pscustomobject]@{ContentLength64=$length;InputStream=(New-Object IO.MemoryStream(,$bytes))}
  $rejected=$false
  try { Read-TrunkPresetRequest $request | Out-Null } catch { $rejected=$_.Exception.Message -like '*24 MB*' }
  $request.InputStream.Dispose()
  $results[([string]$length)]=$rejected
}
$invalid=$false
try { Get-TrunkPresetPath 'detail' '../escape' | Out-Null } catch { $invalid=$true }
$invalidKind=$false
try { Get-TrunkPresetFolder '__proto__' | Out-Null } catch { $invalidKind=$true }
$newline=$false
try { Get-TrunkPresetPath 'detail' (${quote(id)} + [char]10) | Out-Null } catch { $newline=$true }
$results.invalid=$invalid;$results.invalidKind=$invalidKind;$results.newline=$newline
$results | ConvertTo-Json -Compress
`);
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { '-1': true, '9': true, invalid: true, invalidKind: true, newline: true });
});

test('desktop PowerShell invokes the real Node shape validator through a file URI and freshly reads RGBA records', { skip: process.platform !== 'win32' }, () => {
  const runtime = path.resolve('.runtime'); mkdirSync(runtime, { recursive: true });
  const directory = mkdtempSync(path.join(runtime, 'trunk-preset-node-')), folder = path.join(directory, 'trunk-presets', 'bark');
  mkdirSync(folder, { recursive: true });
  const raw = { format: 'BranchForgeTrunkPreset', version: 1, kind: 'bark', id, name: '真实RGBA树皮', shape: barkShape, updatedAt: 77 };
  const diskFile = path.join(folder, id + '.trunkpreset.json'), before = JSON.stringify(raw);
  writeFileSync(diskFile, before);
  writeFileSync(path.join(folder, 'wrong-name.trunkpreset.json'), before);
  const quote = v => "'" + v.replaceAll("'", "''") + "'", file = path.join(directory, 'read.ps1');
  writeFileSync(file, '\ufeff' + `
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$script:AppDir=${quote(path.resolve('.'))}
$env:BRANCHFORGE_SESSION_TEST_DIR=${quote(directory)}
. (Join-Path $script:AppDir 'scripts/trunk-preset-server.ps1')
Get-TrunkPresetCatalog 'bark' | ConvertTo-Json -Depth 16 -Compress
`);
  for (let i = 0; i < 2; i++) {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const catalog = JSON.parse(result.stdout.trim()); assert.equal(catalog.success, true);
    assert.deepEqual(catalog.items, [normalizeTrunkPreset('bark', raw)]);
    assert.equal(catalog.warnings.length, 1); assert.match(catalog.warnings[0], /文件 ID 不匹配/);
    assert.equal(readFileSync(diskFile, 'utf8'), before);
  }
});
