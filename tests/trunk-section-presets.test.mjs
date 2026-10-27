import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  normalizeTrunkSectionPreset, normalizeTrunkSectionPresetShape,
} from '../web/trunk-section-presets.js';
import { createTrunkSectionPresetStore } from '../web/trunk-section-preset-store.js';

const id = 'section-preset-0123456789abcdef0123456789abcdef';
const profile = [{ id: 'p0', angle: 0, radius: .7 }, { id: 'p1', angle: 120, radius: 1.7 }, { id: 'p2', angle: 240, radius: 1.2 }];
const shape = { radius: 1.2, oval: .8, roll: 27, profile };

test('section presets copy only reusable shape and preserve bounded smooth-profile data', () => {
  const source = { id, name: '  三瓣截面  ', shape: {
    ...shape, id: 'old-section', t: .1, span: .8, groove_depth: .6, buttresses: [{ length: 6 }],
  }, updatedAt: 100, owner: 'old-tree' };
  const original = structuredClone(source), result = normalizeTrunkSectionPreset(source);
  assert.deepEqual(result, { id, name: '三瓣截面', shape, updatedAt: 100 });
  assert.deepEqual(source, original);
  result.shape.profile[0].radius = 3;
  assert.equal(source.shape.profile[0].radius, .7);
  assert.deepEqual(normalizeTrunkSectionPresetShape({ radius: 99, oval: 0, roll: -300, profile: profile.slice(0, 2) }), { radius: 3, oval: .25, roll: -180 });
  assert.throws(() => normalizeTrunkSectionPreset({ id: '../other', name: 'x', shape }), /ID/);
  assert.throws(() => normalizeTrunkSectionPreset({ id: id + '\n', name: 'x', shape }), /ID/);
  assert.throws(() => normalizeTrunkSectionPreset({ id, name: ' ', shape }), /名称/);
});

test('direct contour presets retain captured polar radii and version while excluding placement, details and legacy snapshots', async () => {
  const directShape = { geometry_version: 2, radius: 1.2, oval: .8, roll: 27,
    profile: profile.map((point, i) => ({ ...point, radius: [.02, 6.5, 1.2][i] })) };
  const raw = { ...directShape, t: .6, span: .2, contour_capture: { version: 1, relative_error: .004 },
    groove_depth: .5, legacy_form: { sections: [] } };
  assert.deepEqual(normalizeTrunkSectionPresetShape(raw), directShape);
  const disk = diskMock(), store = createTrunkSectionPresetStore({ fetch: disk.fetch, now: () => 123, createId: () => id });
  const saved = await store.put({ name: '直接轮廓', shape: raw });
  assert.deepEqual(saved.shape, directShape);
  const fresh = createTrunkSectionPresetStore({ fetch: disk.fetch });
  assert.deepEqual((await fresh.list())[0].shape, directShape);
});

function diskMock() {
  const records = new Map(), calls = [];
  let failWrite = false;
  return {
    records, calls, set failWrite(value) { failWrite = value; },
    async fetch(url, options = {}) {
      calls.push([url, options.method || 'GET']);
      if (url === '/api/trunk-section-presets') return { ok: true, status: 200, json: async () => ({ success: true, items: [...records.values()] }) };
      if (options.method === 'POST') {
        if (failWrite) return { ok: false, status: 500, json: async () => ({ success: false, message: '磁盘保存失败' }) };
        const item = JSON.parse(options.body); records.set(item.id, item);
        return { ok: true, status: 200, json: async () => ({ success: true, item }) };
      }
      if (options.method === 'DELETE') {
        const key = new URL(url, 'http://localhost/').searchParams.get('id');
        const item = records.get(key) || null; records.delete(key);
        return { ok: true, status: 200, json: async () => ({ success: true, item }) };
      }
      return { status: 404 };
    },
  };
}

test('disk preset save, fresh store reload and delete use actual API state rather than an in-memory catalog', async () => {
  const disk = diskMock();
  const store = createTrunkSectionPresetStore({ fetch: disk.fetch, now: () => 999, createId: () => id });
  assert.deepEqual(await store.list(), []);
  assert.equal(store.kind, 'disk'); assert.match(store.backend, /重启后保留/);
  const saved = await store.put({ name: '三瓣截面', shape: { ...shape, t: .1, span: .8 } });
  assert.deepEqual(saved, { id, name: '三瓣截面', shape, updatedAt: 999 });
  const fresh = createTrunkSectionPresetStore({ fetch: disk.fetch });
  assert.deepEqual(await fresh.list(), [saved]);
  assert.deepEqual(await fresh.remove(id), saved);
  assert.deepEqual(await store.list(), []);
  assert.deepEqual(disk.calls.filter(call => call[1] !== 'GET').map(call => call[1]), ['POST', 'DELETE']);
});

test('disk write failures and invalid IDs do not silently fall back to browser storage', async () => {
  const disk = diskMock(), store = createTrunkSectionPresetStore({ fetch: disk.fetch, now: () => 123, createId: () => id });
  await store.list(); disk.failWrite = true;
  await assert.rejects(store.put({ name: '三瓣', shape }), /磁盘保存失败/);
  assert.equal(store.kind, 'disk'); assert.equal(disk.records.size, 0);
  const count = disk.calls.length;
  await assert.rejects(store.remove('../escape'), /ID/);
  assert.equal(disk.calls.length, count);
});

function memoryIndexedDB() {
  const records = new Map();
  const database = {
    createObjectStore() {},
    transaction() {
      const transaction = { objectStore() { return {
        getAll() { return execute(() => [...records.values()]); },
        get(key) { return execute(() => records.get(key)); },
        put(item) { return execute(() => { records.set(item.id, structuredClone(item)); return item.id; }); },
        delete(key) { return execute(() => records.delete(key)); },
      }; } };
      function execute(fn) {
        const operation = {};
        queueMicrotask(() => { operation.result = fn(); transaction.oncomplete?.(); });
        return operation;
      }
      return transaction;
    },
  };
  return { open() { const request = { result: database }; queueMicrotask(() => { request.onupgradeneeded?.(); request.onsuccess?.(); }); return request; } };
}

test('404 endpoint uses an explicitly labelled browser library and persists across store instances', async () => {
  const indexedDB = memoryIndexedDB(), fetch = async () => ({ status: 404 });
  const store = createTrunkSectionPresetStore({ fetch, indexedDB, now: () => 123, createId: () => id });
  const saved = await store.put({ name: '浏览器截面', shape });
  assert.equal(store.kind, 'browser'); assert.match(store.backend, /更换地址后独立/);
  const fresh = createTrunkSectionPresetStore({ fetch, indexedDB });
  assert.deepEqual(await fresh.list(), [saved]);
  assert.deepEqual(await fresh.remove(id), saved); assert.deepEqual(await store.list(), []);
});

test('desktop helper saves legacy and direct shapes, reloads in a fresh PowerShell process and bounds streamed requests', { skip: process.platform !== 'win32' }, () => {
  const runtime = path.resolve('.runtime'); mkdirSync(runtime, { recursive: true });
  const directory = mkdtempSync(path.join(runtime, 'section-preset-server-'));
  const input = path.join(directory, 'input.json');
  const raw = { id, name: '  三瓣截面  ', shape: { ...shape, t: .7, span: 1, buttresses: [{}] }, updatedAt: 1 };
  writeFileSync(input, JSON.stringify(raw));
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const common = `\n$ErrorActionPreference='Stop'\n[Console]::OutputEncoding=[Text.Encoding]::UTF8\n$script:AppDir=${quote(path.resolve('.'))}\n$env:BRANCHFORGE_SESSION_TEST_DIR=${quote(directory)}\n. (Join-Path $script:AppDir 'scripts/trunk-section-preset-server.ps1')\n`;
  const saveScript = path.join(directory, 'save.ps1');
  writeFileSync(saveScript, '\ufeff' + common + `
function Write-AtomicText([string]$Path,[string]$Text) {
  $parent=Split-Path -Parent $Path
  [IO.Directory]::CreateDirectory($parent) | Out-Null
  [IO.File]::WriteAllText($Path,$Text,(New-Object Text.UTF8Encoding($false)))
}
$raw=Get-Content -LiteralPath ${quote(input)} -Raw -Encoding UTF8 | ConvertFrom-Json
$item=Save-TrunkSectionPreset $raw
$script:TrunkSectionPresetLimit=1
$raw.id='section-preset-fedcba9876543210fedcba9876543210'
$limitRejected=$false
try { Save-TrunkSectionPreset $raw | Out-Null } catch { $limitRejected=$_.Exception.Message -like '*500*' }
$raw.id=${quote(id)}
$replacement=Save-TrunkSectionPreset $raw
$invalidRejected=$false
try { Get-TrunkSectionPresetPath '../escape' | Out-Null } catch { $invalidRejected=$true }
$bytes=New-Object byte[] 65537
$request=[pscustomobject]@{ContentLength64=-1;InputStream=(New-Object IO.MemoryStream(,$bytes))}
$oversizeRejected=$false
try { Read-TrunkSectionPresetRequest $request | Out-Null } catch { $oversizeRejected=$_.Exception.Message -like '*64 KB*' }
$request.InputStream.Dispose()
@{item=$replacement;limitRejected=$limitRejected;invalidRejected=$invalidRejected;oversizeRejected=$oversizeRejected} | ConvertTo-Json -Depth 10 -Compress
`);
  function run(file) {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout.trim());
  }
  const saved = run(saveScript);
  assert.equal(saved.invalidRejected, true); assert.equal(saved.oversizeRejected, true); assert.equal(saved.limitRejected, true);
  assert.deepEqual(saved.item.shape, shape); assert.equal(saved.item.name, '三瓣截面');
  assert.ok(saved.item.updatedAt > 1);
  const diskFile = path.join(directory, 'trunk-section-presets', id + '.sectionpreset.json');
  assert.equal(JSON.parse(readFileSync(diskFile, 'utf8')).format, 'BranchForgeTrunkSectionPreset');
  const reloadScript = path.join(directory, 'reload.ps1');
  writeFileSync(reloadScript, '\ufeff' + common + `
$before=Get-TrunkSectionPresetCatalog
$removed=Remove-TrunkSectionPreset ${quote(id)}
$after=Get-TrunkSectionPresetCatalog
@{before=$before;removed=$removed;after=$after} | ConvertTo-Json -Depth 10 -Compress
`);
  const reloaded = run(reloadScript);
  assert.deepEqual(reloaded.before.items, [saved.item]); assert.deepEqual(reloaded.removed, saved.item);
  assert.deepEqual(reloaded.after.items, []); assert.deepEqual(reloaded.before.warnings, []);

  const directShape = { geometry_version: 2, ...shape,
    profile: profile.map((point, i) => ({ ...point, radius: [.02, 6.5, 1.2][i],tangent:(i-1)*.14,join_tangent:i*.08 })),
    profile_coarse:profile.map((point,i)=>({...point,id:'MAIN_'+i,radius:[.03,5.1,1.3][i],tangent:i*.12})),
    profile_exclusions:[{start:240,end:0,join:'SMOOTH'},{start:20,end:40}] };
  writeFileSync(input, JSON.stringify({ ...raw, shape: directShape }));
  const directSaved = run(saveScript);
  assert.deepEqual(directSaved.item.shape, directShape, 'PowerShell preserves the same direct contour range as the browser');
  assert.equal(JSON.parse(readFileSync(diskFile, 'utf8')).version, 2, 'old desktop helpers reject a new contour instead of silently clipping it');
  const directReloaded = run(reloadScript);
  assert.deepEqual(directReloaded.before.items, [directSaved.item]);
  assert.deepEqual(directReloaded.removed, directSaved.item);
  assert.deepEqual(directReloaded.after.items, []);
  assert.deepEqual(directReloaded.before.warnings, []);
});
