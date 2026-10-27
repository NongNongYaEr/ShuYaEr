import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createTrunkSectionPresetStore } from '../web/trunk-section-preset-store.js';

const base = new URL(process.argv[2] || 'http://localhost:19916/');
const apiFetch = (url, options) => fetch(new URL(url, base), options);
const store = createTrunkSectionPresetStore({ fetch: apiFetch });
const id = 'section-preset-' + randomUUID().replaceAll('-', '');
const profile = [{ id: 'A', angle: 0, radius: .7 }, { id: 'a', angle: 120, radius: 1.7 }, { id: 'c', angle: 240, radius: 1.2 }];
function assertPresetClose(actual, expected) {
  // Windows PowerShell 5.1's JSON parser can round the last binary digit while
  // loading a decimal. Check the real contour with a far smaller tolerance than
  // the mesh's Float32 precision, and keep IDs/names/counts exact.
  assert.deepEqual({ ...actual, shape: undefined }, { ...expected, shape: undefined });
  for (const key of ['radius', 'oval', 'roll']) assert.ok(Math.abs(actual.shape[key] - expected.shape[key]) < 1e-12, key);
  assert.equal(actual.shape.profile?.length, expected.shape.profile?.length);
  for (let i = 0; i < (expected.shape.profile?.length || 0); i++) {
    assert.equal(actual.shape.profile[i].id, expected.shape.profile[i].id);
    for (const key of ['angle', 'radius']) assert.ok(Math.abs(actual.shape.profile[i][key] - expected.shape.profile[i][key]) < 1e-12, key);
  }
}
let saved;
try {
  await store.list(); assert.equal(store.kind, 'disk', '测试服务必须加载真实截面库接口');
  saved = await store.put({ id, name: '接口验收 · 三瓣截面', shape: { radius: 1.2, oval: .8, roll: 27, profile, t: .07, span: 1, buttresses: [{}] } });
  assert.deepEqual(saved.shape, { radius: 1.2, oval: .8, roll: 27, profile });
  const fresh = createTrunkSectionPresetStore({ fetch: apiFetch });
  assertPresetClose((await fresh.list()).find(item => item.id === id), saved);
  const outline = Array.from({ length: 8 }, (_, index) => ({ id: 'OUTLINE_' + index, angle: index * 45, radius: .7 + index * .1 }));
  const rawOutline = await apiFetch('/api/trunk-section-preset', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name: '接口验收 · 八点截面', shape: { radius: 1.2, oval: .8, roll: 27,
      profile: [...outline, { id: 'SEAM_DUPLICATE', angle: 360, radius: 3.9 }], t: .2, span: .1 } }),
  });
  assert.equal(rawOutline.status, 200);
  saved = (await rawOutline.json()).item;
  assert.deepEqual(saved.shape.profile, outline);
  assert.equal(saved.shape.t, undefined); assert.equal(saved.shape.span, undefined);
  assertPresetClose((await fresh.list()).find(item => item.id === id), saved);
  const invalid = await apiFetch('/api/trunk-section-preset', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: '../invalid', name: '无效', shape: {} }),
  });
  assert.equal(invalid.status, 400); assert.equal((await invalid.json()).success, false);
  const large = await apiFetch('/api/trunk-section-preset', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ' '.repeat(65537),
  });
  assert.equal(large.status, 400); assert.match((await large.json()).message, /64 KB/);
  assertPresetClose(await fresh.remove(id), saved);
  assert.equal((await store.list()).some(item => item.id === id), false);
  const artifactDir = path.resolve('.runtime/trunk-section-preset-api');
  await mkdir(artifactDir, { recursive: true });
  const result = { passed: true, backend: store.kind, base: base.href,
    diskSaveAndFreshRead: true, destinationPlacementExcluded: true,
    caseSensitiveProfileIdsPreserved: true, eightPointCurveAndSeamDeduplication: true,
    badIdRejected: true, bodyLimitVerified: true, removed: true };
  await writeFile(path.join(artifactDir, '验收.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  if (saved) await store.remove(id).catch(error => console.error('验收预设清理失败：', error.message));
}
