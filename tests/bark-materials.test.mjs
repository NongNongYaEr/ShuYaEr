import test from 'node:test';
import assert from 'node:assert/strict';
import { unzlibSync } from 'fflate';
import { BARK_PRESETS, BARK_MAP_SLOTS, normalizeBarkMaterial, normalizeBarkMaterials, normalizeBarkPreset,
  barkMaterialForBranch, applyBarkMaterialAssignments, removeBarkMaterialAssignments, generateBarkTextureMaps,
  createBarkSurfaceMaterial, barkTextureFiles, barkBytesToBase64, barkBase64ToBytes } from '../web/bark-materials.js';

test('old engineering data receives no implicit bark assignment and invalid records cannot enter reserved branch keys', () => {
  assert.equal(normalizeBarkMaterials(undefined), null);
  assert.equal(barkMaterialForBranch({ workbench: {} }, 'ROOT'), null);
  const raw = JSON.parse('{"version":1,"branches":{"__proto__":{"color":"#ffffff"},"constructor":{},"ROOT":{"color":"#gggggg","roughness":8,"normal_strength":-1,"scale_u_m":0}}}');
  const clean = normalizeBarkMaterials(raw);
  assert.deepEqual(Object.keys(clean.branches), ['ROOT']);
  assert.equal(clean.branches.ROOT.color, '#78664c'); assert.equal(clean.branches.ROOT.roughness, 1); assert.equal(clean.branches.ROOT.normal_strength, 0); assert.equal(clean.branches.ROOT.scale_u_m, .02);
});

test('material applications are independent recipe snapshots and never modify complete-unit sources, instances or topology', () => {
  const authoring = { branch_library: [{ id: 'MODEL', sample: { authoring: { leaf_material: { color: 'original' } } } }], branch_instances: [{ asset_id: 'MODEL', scale: 1 }], branch_shape: { branches: [{ id: 'ROOT', points: [[0, 0, 0], [0, 0, 2]] }] }, workbench: { name: 'Keep' } };
  const protectedData = structuredClone([authoring.branch_library, authoring.branch_instances, authoring.branch_shape]), recipe = normalizeBarkMaterial(BARK_PRESETS[1]);
  applyBarkMaterialAssignments(authoring, recipe, ['ROOT']); recipe.color = '#ff0000';
  assert.equal(barkMaterialForBranch(authoring, 'ROOT').color, BARK_PRESETS[1].color); assert.equal(barkMaterialForBranch(authoring, 'OTHER'), null);
  applyBarkMaterialAssignments(authoring, BARK_PRESETS[3], [], { all: true });
  assert.equal(barkMaterialForBranch(authoring, 'FUTURE_BRANCH').color, BARK_PRESETS[3].color); assert.deepEqual(authoring.workbench.bark_materials.branches, {});
  applyBarkMaterialAssignments(authoring, BARK_PRESETS[2], ['ROOT']); assert.equal(barkMaterialForBranch(authoring, 'ROOT').style, 'VERTICAL');
  removeBarkMaterialAssignments(authoring, ['ROOT']); assert.equal(barkMaterialForBranch(authoring, 'ROOT'), null);
  assert.equal(barkMaterialForBranch(authoring, 'FUTURE_BRANCH').style, 'PALE');
  assert.equal(normalizeBarkMaterials(JSON.parse(JSON.stringify(authoring.workbench.bark_materials))).branches.ROOT, null);
  removeBarkMaterialAssignments(authoring, [], { all: true }); assert.equal(barkMaterialForBranch(authoring, 'ROOT'), null);
  assert.equal(authoring.workbench.name, 'Keep'); assert.deepEqual([authoring.branch_library, authoring.branch_instances, authoring.branch_shape], protectedData);
});

test('built-in bark textures are deterministic, distinct, non-flat color/normal/roughness pixels without a browser decoder', () => {
  const signatures = new Set();
  for (const preset of BARK_PRESETS) {
    const maps = generateBarkTextureMaps(preset, 64); assert.deepEqual(maps, generateBarkTextureMaps(preset, 64));
    signatures.add(Buffer.from(maps.color.data).toString('base64'));
    for (const slot of BARK_MAP_SLOTS) { assert.equal(maps[slot].data.length, 64 * 64 * 4); for (let i = 3; i < maps[slot].data.length; i += 4) assert.equal(maps[slot].data[i], 255); }
    assert.ok(new Set(maps.color.data).size > 15); assert.ok(new Set(maps.normal.data).size > 20); assert.ok(new Set(maps.roughness.data).size > 3);
    for (let i = 0; i < maps.normal.data.length; i += 4) assert.ok(maps.normal.data[i + 2] >= 128, 'normal faces outward');
  }
  assert.equal(signatures.size, BARK_PRESETS.length);
  const first = generateBarkTextureMaps(BARK_PRESETS[0], 64), expected = first.color.data[0]; first.color.data[0] ^= 255;
  assert.equal(generateBarkTextureMaps(BARK_PRESETS[0], 64).color.data[0], expected, 'cached pixels are independent of mutable callers');
});

test('three.js materials use physical dimensions, normal strength, correct color spaces and three exportable textures', () => {
  const recipe = normalizeBarkMaterial({ ...BARK_PRESETS[2], scale_u_m: .4, scale_v_m: .7, normal_strength: 1.3, direction: 'HORIZONTAL' }), material = createBarkSurfaceMaterial(recipe, { branch: { startRadius: .2 }, settings: { bark_tiling: 2 }, size: 32 });
  assert.equal(material.normalScale.x, 1.3); assert.equal(material.normalScale.y, 1.3); assert.equal(material.roughness, recipe.roughness);
  assert.equal(material.map.colorSpace, 'srgb'); assert.equal(material.normalMap.colorSpace, ''); assert.equal(material.roughnessMap.colorSpace, '');
  for (const map of [material.map, material.normalMap, material.roughnessMap]) { assert.ok(map.isDataTexture); assert.ok(map.userData.branchforge_export); assert.equal(map.rotation, Math.PI / 2); assert.ok(Math.abs(map.repeat.x - Math.PI) < 1e-10); assert.ok(Math.abs(map.repeat.y - 2.4 / 2 / .7) < 1e-10); map.dispose(); }
  assert.deepEqual(material.userData.bark_material, recipe); material.dispose();
});

test('imported RGBA is retained across normalization, personal preset reload, texture generation and actual PNG export', () => {
  const data = new Uint8Array([220, 50, 10, 255, 10, 40, 210, 255, 30, 220, 50, 255, 90, 100, 110, 255]);
  const recipe = normalizeBarkMaterial({ style: 'IMPORTED', color: '#ffffff', maps: { color: { width: 2, height: 2, pixels: barkBytesToBase64(data), name: 'my.png' } } });
  const record = normalizeBarkPreset({ id: 'bark-' + 'a'.repeat(32), name: '自备树皮', recipe, updatedAt: 10 });
  assert.deepEqual(normalizeBarkPreset(JSON.parse(JSON.stringify(record))), record);
  assert.deepEqual(normalizeBarkPreset({ id: 'trunk-preset-' + 'a'.repeat(32), name: record.name, shape: recipe, updatedAt: 10 }).recipe, record.recipe);
  assert.deepEqual(generateBarkTextureMaps(record.recipe, 16).color.data, data);
  const file = barkTextureFiles(record.recipe, 'test')[0], bytes = barkBase64ToBytes(file.base64), view = new DataView(bytes.buffer), chunks = []; let offset = 8;
  assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]); assert.equal(view.getUint32(16), 2); assert.equal(view.getUint32(20), 2);
  while (offset < bytes.length) { const length = view.getUint32(offset), type = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8)); if (type === 'IDAT') chunks.push(bytes.slice(offset + 8, offset + 8 + length)); offset += length + 12; }
  const stream = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0)); let cursor = 0; for (const chunk of chunks) { stream.set(chunk, cursor); cursor += chunk.length; }
  const rows = unzlibSync(stream); assert.deepEqual(rows.slice(1, 9), data.slice(0, 8)); assert.deepEqual(rows.slice(10, 18), data.slice(8));
  const invalid = normalizeBarkMaterial({ maps: { color: { width: 2, height: 2, pixels: 'AAAA' } } }); assert.equal(invalid.maps, undefined);
});
