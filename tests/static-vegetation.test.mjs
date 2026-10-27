import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as T from 'three';
import * as k from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { planStaticVegetation, writeStaticUsd, STATIC_ASSEMBLY_LIMIT } from '../web/static-vegetation.js';
import { generateStaticVegetation, validateStaticVegetation, readStaticUsd, bakeSrgbTint } from '../scripts/static-vegetation-package.mjs';
import { packageTransaction, hash } from '../scripts/pve-package.mjs';

const pack = JSON.parse(fs.readFileSync(new URL('../web/assets/plants/ivy-v1.json', import.meta.url)));
function example(surface) {
  const settings = k.normalizeSettings({ object_name: '静态常春藤测试', seed: 45, max_leaves: 40, radial_segments: 4, max_triangles: 1000000, leaf_aspect: 1.3 });
  const authoring = normalizeAuthoring({ vine: { species: 'IVY', type: 'SINGLE', width: .25, length: .6, density: 1, foliage: 25 }, leaf_material: pack.leaf_material,
    attachment_layers: [{ id: 'leaves', type: 'LEAF', enabled: true, order_min: 0, order_max: 3, start: .1, end: 1 }],
    ...(surface ? { surface_growth: { mesh: { id: 'wall', position: [-1,0,0,1,0,0,1,0,2,-1,0,2], index: [0,1,2,0,2,3] }, growth_ruler: { bottom: .02, top: 1.8, leaf_budget: 40, coverage: .9, budget: 50 } } } : {}) }, settings.seed);
  const leaves = structuredClone(pack.leaf_meshes.slice(0, 2)); leaves[0].calibration = { scale: 1.4, rotation: 23, flip: true }; leaves[0].id = '中文/原型'; leaves[1].colorTint = '#a5bb55';
  return { format: 'ProceduralBranchProject', version: 4, settings, authoring, leaf_meshes: leaves };
}
function triangles(mesh, matrix, material) {
  const p = new T.Vector3(), n = new T.Vector3(), nm = new T.Matrix3().getNormalMatrix(matrix), out = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const triangle = [];
    for (let j = 0; j < 3; j++) { const v = mesh.indices[i + j]; triangle.push(...p.fromArray(mesh.positions, v * 3).applyMatrix4(matrix).toArray(), ...n.fromArray(mesh.normals, v * 3).applyMatrix3(nm).normalize().toArray(), ...mesh.uvs.slice(v * 2, v * 2 + 2)); }
    out.push({ material, data: triangle });
  }
  return out;
}
function sceneTriangles(asset) {
  const out = [];
  asset.group.updateWorldMatrix(true, true);
  asset.group.traverseVisible(m => { if (!m.isMesh) return; const a = m.geometry.attributes;
    out.push(...triangles({ positions: Array.from(a.position.array), normals: Array.from(a.normal.array), uvs: Array.from(a.uv.array), indices: Array.from(m.geometry.index.array) }, m.matrixWorld, m.material.name)); });
  return out;
}
function usdTriangles(usd, materials) {
  const out = [];
  for (const a of readStaticUsd(usd)) {
    for (const m of a.meshes.filter(m => m.name.startsWith('Base'))) out.push(...triangles(m, new T.Matrix4(), materials[m.material].name));
    for (let i = 0; i < a.nodes.prototypes.length; i++) {
      const m = a.meshes.find(m => m.name === 'Leaf_' + a.nodes.prototypes[i]), q = a.nodes.rotations.slice(i * 4, i * 4 + 4);
      const matrix = new T.Matrix4().compose(new T.Vector3(...a.nodes.positions.slice(i * 3, i * 3 + 3)), new T.Quaternion(q[1], q[2], q[3], q[0]).normalize(), new T.Vector3(...a.nodes.scales.slice(i * 3, i * 3 + 3)));
      out.push(...triangles(m, matrix, materials[m.material].name));
    }
  }
  return out;
}
function compareTriangles(actual, expected) {
  assert.equal(actual.length, expected.length);
  const cell = t => t.data.slice(0, 3).map(v => Math.floor(v * 100)), buckets = new Map();
  expected.forEach(t => { const key = [t.material, ...cell(t)].join(':'); if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(t); });
  for (const t of actual) {
    const at = cell(t); let found = false;
    for (let x = -1; x <= 1 && !found; x++) for (let y = -1; y <= 1 && !found; y++) for (let z = -1; z <= 1 && !found; z++) {
      const list = buckets.get([t.material, at[0]+x, at[1]+y, at[2]+z].join(':'));
      const i = list?.findIndex(v => v.data.every((value, k) => Math.abs(value - t.data[k]) < (k % 8 < 3 ? .000005 : .000025))) ?? -1;
      if (i >= 0) { list.splice(i, 1); found = true; }
    }
    assert.ok(found, 'USD triangle differs in position, winding, normal, UV or material: ' + t.data.slice(0, 3));
  }
}

for (const surface of [false, true]) test(`static USD ${surface ? 'surface' : 'hanging'}: reload every triangle including calibrated real leaves`, async () => {
  const document = example(surface), bytes = Buffer.from(JSON.stringify(document)), dir = fs.mkdtempSync(path.resolve('.runtime/static-test-'));
  const sources = document.leaf_meshes.map(s => ({ ...s, geometry: k.deserializeGeometry(s.geometry) })); let asset;
  try {
    const result = await generateStaticVegetation(dir, bytes), validation = validateStaticVegetation(dir, bytes);
    assert.equal(validation.valid, true); assert.equal(validation.ue_import_verified, false); assert.equal(result.leaves, result.shared_leaves + result.baked_leaves);
    asset = k.buildBranchAsset(document.settings, null, sources, 0, document.authoring, { resolveSources: true });
    const usd = fs.readFileSync(path.join(dir, 'vegetation.usda'), 'utf8'), manifest = JSON.parse(fs.readFileSync(path.join(dir, 'static_vegetation.manifest.json')));
    compareTriangles(usdTriangles(usd, manifest.materials), sceneTriangles(asset));
    assert.equal(manifest.prototypes[0].source_id, '中文/原型'); assert.equal(manifest.support_mesh_exported, false);
    assert.equal(manifest.summary.leaves, asset.masterPlacements.length);
    assert.ok(usd.includes('orientationsf')); assert.ok(!usd.includes('quath[]'));
    const first = hash(Buffer.from(usd)); await generateStaticVegetation(dir, bytes); assert.equal(hash(fs.readFileSync(path.join(dir, 'vegetation.usda'))), first);
    fs.appendFileSync(path.join(dir, 'vegetation.usda'), '\n# corrupted'); assert.throws(() => validateStaticVegetation(dir, bytes), /哈希/);
    assert.equal(JSON.stringify(document), bytes.toString());
  } finally { k.disposeBranchAsset(asset); sources.forEach(s => s.geometry.dispose()); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('shared calibrated prototypes are identical across different shapes and leaf sizes', () => {
  const a = example(true), b = structuredClone(a); b.authoring.surface_growth.growth_ruler.top = 1.35;
  b.settings.leaf_scale = .23; b.authoring.vine.leaf_size = .23;
  const plans = [a,b].map(d => {
    const sources = d.leaf_meshes.map(s => ({ ...s, geometry: k.deserializeGeometry(s.geometry) }));
    const asset = k.buildBranchAsset(d.settings,null,sources,0,d.authoring,{resolveSources:true});
    try { return planStaticVegetation(asset,sources); }
    finally { k.disposeBranchAsset(asset); sources.forEach(s=>s.geometry.dispose()); }
  });
  assert.deepEqual(plans[0].prototypes,plans[1].prototypes);
  assert.notDeepEqual(plans[0].instances,plans[1].instances);
});

test('individually deformed blades are baked, never forced back onto a shared shape', () => {
  const d = example(true), sources = d.leaf_meshes.map(s => ({ ...s, geometry: k.deserializeGeometry(s.geometry) }));
  const asset = k.buildBranchAsset(d.settings, null, sources, 0, d.authoring, { resolveSources: true });
  try {
    let target; asset.group.traverse(m => { if (m.isMesh && m.userData.category === 'leaf' && m.geometry.attributes.position.count > 1000) target = m; }); assert.ok(target);
    const attr = target.geometry.attributes.position, i = attr.count - 1; attr.setX(i, attr.getX(i) + .035);
    const plan = planStaticVegetation(asset, sources); assert.ok(plan.summary.baked_leaves > 0);
    compareTriangles(usdTriangles(writeStaticUsd(plan).text, plan.materials), sceneTriangles(asset));
  } finally { k.disposeBranchAsset(asset); sources.forEach(s => s.geometry.dispose()); }
});

test('large assemblies split below UE instance limit without duplicating the base or moving roots', () => {
  const mesh = { positions: [0,0,0,1,0,0,0,1,0], normals: [0,0,1,0,0,1,0,0,1], uvs: [0,0,1,0,0,1], indices: [0,1,2], material: 0 };
  const plan = { materials: [{ name: 'M', color: [1,1,1], roughness: .7, metalness: 0 }], baseMeshes: [mesh], prototypes: [mesh],
    instances: Array.from({ length: STATIC_ASSEMBLY_LIMIT + 1 }, (_, i) => ({ id: 'L'+i, prototype: 0, position: [0,0,i*.001], rotation: [1,0,0,0], scale: [1,1,1] })) };
  const usd = writeStaticUsd(plan), read = readStaticUsd(usd.text);
  assert.equal(read.length, 2); assert.equal(read[0].nodes.prototypes.length, STATIC_ASSEMBLY_LIMIT); assert.equal(read[1].nodes.prototypes.length, 1);
  assert.equal(read[1].meshes.filter(m => m.name.startsWith('Base')).length, 0); assert.equal(read[1].nodes.positions[2], STATIC_ASSEMBLY_LIMIT*.001);
});

test('zero alpha cutoff stays opaque in UE; positive cutoff remains masked rather than translucent', () => {
  const material = { name: 'M_Leaf', leaf: true, color: [1,1,1], roughness: .9, metalness: 0, color_texture: 'leaf_atlas_color.png', cutoff: 0 };
  const plan = { materials: [material], baseMeshes: [], prototypes: [], instances: [] };
  assert.ok(!writeStaticUsd(plan).text.includes('inputs:opacity.connect'));
  material.cutoff = .4;
  const masked = writeStaticUsd(plan).text;
  assert.ok(masked.includes('inputs:opacity.connect'));
  assert.ok(masked.includes('inputs:opacityThreshold = 0.4'));
});

test('texture tint is multiplied in linear space while retaining alpha and source pixels', () => {
  const pixels = Uint8Array.from([255,128,0,73,80,120,240,255]), before = [...pixels];
  const tinted = bakeSrgbTint(pixels, [.25,1,0]);
  assert.deepEqual([...tinted], [137,128,0,73,39,120,0,255]);
  assert.deepEqual([...pixels], before);
  assert.deepEqual([...bakeSrgbTint(pixels,[1,1,1])], before);
});

test('static transaction validates before publication, preserves old package, and retries without history', async () => {
  const dir = fs.mkdtempSync(path.resolve('.runtime/static-transaction-')), input = path.join(dir, 'source.branch.json'), output = path.join(dir, 'package'), statusPath = path.join(dir, 'status.json');
  fs.writeFileSync(input, JSON.stringify(example(false)));
  const options = { input, destination: output, statusPath, generate: generateStaticVegetation, validate: validateStaticVegetation,
    manifestName: 'static_vegetation.manifest.json', manifestFormat: 'BranchForgeStaticVegetation', entryName: 'vegetation.usda', initialStage: '生成实际藤蔓' };
  const digest = () => Object.fromEntries(fs.readdirSync(output).map(n => [n, hash(fs.readFileSync(path.join(output, n)))]));
  try {
    await packageTransaction(options); const original = digest();
    await assert.rejects(packageTransaction({ ...options, generate: async (out, bytes, progress) => { await generateStaticVegetation(out, bytes, progress); fs.appendFileSync(path.join(out, 'vegetation.usda'), '#bad'); } }), /哈希/);
    assert.deepEqual(digest(), original); assert.equal(JSON.parse(fs.readFileSync(statusPath)).state, 'failed');
    await packageTransaction(options); assert.deepEqual(digest(), original); const state = JSON.parse(fs.readFileSync(statusPath)); assert.equal(state.state, 'succeeded'); assert.equal(state.previous_dir, null); assert.ok(state.entry_path.endsWith('vegetation.usda'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
