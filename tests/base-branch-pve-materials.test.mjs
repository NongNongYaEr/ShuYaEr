import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildBranchAsset, disposeBranchAsset, normalizeSettings } from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { baseBranchShape, createBaseBranchAssembly } from '../web/base-branch-assembly.js';
import { createPVESkeleton } from '../web/pve-skeleton-export.js';
import { exportGlb } from '../web/glb-export.js';
import { exportResolvedAssembly } from '../scripts/export_branchforge_resolved_assembly.mjs';

globalThis.FileReader ||= class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend?.();
  }
};
const tool = fileURLToPath(new URL('../', import.meta.url));
const pack = JSON.parse(fs.readFileSync(new URL('../web/assets/models/base-branch-sample.plantunits.json', import.meta.url), 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');
const gltf = array => {
  const bytes = Buffer.from(array);
  return JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
};

test('static GLB, skinned GLB and resolved PVE separate base branch wood from attached foliage', async t => {
  const assembly = createBaseBranchAssembly(pack, pack.base_branches[0].id);
  const unit = assembly.units.find(item => item.role === 'LEAF');
  const settings = normalizeSettings({ object_name: 'Base branch atlas', leaf_density: 0, child_count: 0 });
  const authoring = normalizeAuthoring({
    base_branch_assembly: { ...assembly, placements: [
      { id: 'leaf', unit_id: unit.id, face: 0, barycentric: [.2, .3, .5], scale: 1 },
    ] },
    branch_shape: baseBranchShape(assembly),
  }, settings.seed);
  const asset = buildBranchAsset(settings, null, [], 0, authoring);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'base-branch-pve-materials-'));
  t.after(() => {
    disposeBranchAsset(asset);
    for (const entry of fs.readdirSync(output)) fs.unlinkSync(path.join(output, entry));
    fs.rmdirSync(output);
  });
  let wood, leaf;
  asset.group.traverse(mesh => {
    if (mesh.userData.base_branch_mesh) wood = mesh;
    if (mesh.userData.base_branch_unit_id === 'leaf') leaf = mesh;
  });
  const previewMaterial = wood.material;
  assert.equal(leaf.material, previewMaterial);
  const counts = [wood.geometry.index.count, leaf.geometry.index.count];
  for (const options of [{ singleMesh: true }, { rigAsset: asset }]) {
    const exported = gltf(await exportGlb(asset.group, options));
    const slots = ['M_UnitBark', 'M_UnitFoliage'];
    const indices = slots.map(name => exported.materials.findIndex(material => material.name === name));
    assert.ok(indices.every(index => index >= 0));
    assert.ok(indices[0] < indices[1]);
    assert.equal(exported.materials[indices[0]].alphaMode || 'OPAQUE', 'OPAQUE');
    assert.equal(exported.materials[indices[1]].alphaMode, 'MASK');
    const primitives = exported.meshes.flatMap(mesh => mesh.primitives);
    for (const [slot, materialIndex] of indices.entries()) {
      const parts = primitives.filter(primitive => primitive.material === materialIndex);
      assert.equal(parts.reduce((sum, primitive) => sum + exported.accessors[primitive.indices].count, 0), counts[slot]);
      if (options.rigAsset) assert.ok(parts.every(primitive => 'JOINTS_0' in primitive.attributes && 'WEIGHTS_0' in primitive.attributes));
    }
  }
  assert.equal(wood.material, previewMaterial);
  assert.equal(leaf.material, previewMaterial);
  assert.equal(previewMaterial.userData.base_branch_atlas_role, undefined);

  const remap = (u, v) => [.12 + u * .45, .4 + v * .45];
  const skeleton = createPVESkeleton({ ...asset, masterPlacements: [], placements: [] });
  await exportResolvedAssembly({
    tool, document: { settings, authoring, leaf_meshes: [] }, skeleton, output, sourceSha256: digest('fixture'),
    asset, atlas: { uv: (_material, u, v) => remap(u, v) },
  });
  const resolved = JSON.parse(fs.readFileSync(path.join(output, 'whole.resolved.json'), 'utf8'));
  const binary = fs.readFileSync(path.join(output, resolved.binary));
  assert.deepEqual(resolved.chunks.map(chunk => chunk.material_role), ['bark', 'foliage']);
  assert.deepEqual(resolved.chunks.map(chunk => chunk.index_count), counts);
  const [woodChunk, leafChunk] = resolved.chunks;
  const [material] = resolved.imported_trunk_materials.materials;
  assert.equal(material.name, 'M_UnitBark');
  assert.equal(material.alpha_mode, 'OPAQUE');
  assert.deepEqual(woodChunk.imported_trunk_material, { material_id: material.id, uv_policy: 'source_gltf_uv0_no_extra_flip' });
  assert.equal(leafChunk.imported_trunk_material, undefined);
  for (const [slot, source] of [['baseColor', assembly.material.color], ['normal', assembly.material.normal]]) {
    if (!source) continue;
    const expected = Buffer.from(source.split(',')[1], 'base64');
    assert.equal(material.maps[slot].sha256, digest(expected));
    assert.deepEqual(fs.readFileSync(path.join(output, material.maps[slot].file)), expected);
  }
  for (const [mesh, chunk] of [[wood, woodChunk], [leaf, leafChunk]]) {
    const uv = mesh.geometry.getAttribute('uv');
    for (let index = 0; index < chunk.index_count; index++) {
      const sourceVertex = mesh.geometry.index.getX(index);
      const exportVertex = binary.readUInt32LE(chunk.index_offset + index * 4);
      const u = uv.getX(sourceVertex), v = uv.getY(sourceVertex);
      const [expectedU, expectedV] = mesh === wood ? [u, v] : remap(u, v);
      const offset = chunk.vertex_offset + exportVertex * 48;
      assert.ok(Math.abs(binary.readFloatLE(offset + 24) - expectedU) < 1e-7);
      assert.ok(Math.abs(binary.readFloatLE(offset + 28) - (1 - expectedV)) < 1e-7);
    }
  }
});

test('resolved PVE can share one original atlas material without changing wood and foliage geometry roles', async t => {
  const assembly = createBaseBranchAssembly(pack, pack.base_branches[0].id);
  const unit = assembly.units.find(item => item.role === 'LEAF');
  const settings = normalizeSettings({ object_name: 'Shared base branch atlas', leaf_density: 0, child_count: 0 });
  const authoring = normalizeAuthoring({
    base_branch_assembly: { ...assembly, placements: [
      { id: 'leaf', unit_id: unit.id, face: 0, barycentric: [.2, .3, .5], scale: 1 },
    ] },
    branch_shape: baseBranchShape(assembly),
  }, settings.seed);
  const asset = buildBranchAsset(settings, null, [], 0, authoring);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'base-branch-pve-shared-atlas-'));
  t.after(() => {
    disposeBranchAsset(asset);
    for (const entry of fs.readdirSync(output)) fs.unlinkSync(path.join(output, entry));
    fs.rmdirSync(output);
  });
  const meshByRole = {};
  asset.group.traverse(mesh => {
    if (mesh.userData.base_branch_mesh) meshByRole.bark = mesh;
    if (mesh.userData.base_branch_unit_id === 'leaf') meshByRole.foliage = mesh;
  });
  assert.equal(meshByRole.bark.material, meshByRole.foliage.material);
  meshByRole.bark.material.sampleLeafMaterial = { ...assembly.material, merge_unit_materials: true };

  await exportResolvedAssembly({
    tool, document: { settings, authoring, leaf_meshes: [] },
    skeleton: createPVESkeleton({ ...asset, masterPlacements: [], placements: [] }), output,
    sourceSha256: digest('shared atlas fixture'), asset,
    atlas: { uv: () => assert.fail('shared material must sample its own source atlas UV') },
  });
  const resolved = JSON.parse(fs.readFileSync(path.join(output, 'whole.resolved.json'), 'utf8'));
  const binary = fs.readFileSync(path.join(output, resolved.binary));
  assert.deepEqual(resolved.chunks.map(chunk => chunk.material_role), ['bark', 'foliage']);
  assert.equal(resolved.imported_trunk_materials.materials.length, 1);
  const [material] = resolved.imported_trunk_materials.materials;
  assert.match(material.id, /^unit-atlas-[a-f0-9]{24}$/);
  assert.equal(material.name, 'M_UnitAtlas');
  assert.equal(material.unit_atlas_role, 'shared');
  assert.equal(material.alpha_mode, 'OPAQUE');
  for (const chunk of resolved.chunks) {
    const mesh = meshByRole[chunk.material_role], uv = mesh.geometry.getAttribute('uv');
    assert.deepEqual(chunk.imported_trunk_material, { material_id: material.id, uv_policy: 'source_gltf_uv0_no_extra_flip' });
    assert.equal(chunk.index_count, mesh.geometry.index.count);
    for (let index = 0; index < chunk.index_count; index++) {
      const sourceVertex = mesh.geometry.index.getX(index);
      const exportVertex = binary.readUInt32LE(chunk.index_offset + index * 4);
      const offset = chunk.vertex_offset + exportVertex * 48;
      assert.ok(Math.abs(binary.readFloatLE(offset + 24) - uv.getX(sourceVertex)) < 1e-7);
      assert.ok(Math.abs(binary.readFloatLE(offset + 28) - (1 - uv.getY(sourceVertex))) < 1e-7);
    }
  }
});
