/** Independent trunk study; never writes a source library or production project.
 * node --experimental-loader ./vendor-loader.mjs scripts/prepare-trunk-feasibility.mjs
 *   [--out .runtime/trunk-feasibility]
 * Each mode contains a strict PVE_Complete package and separate preview assets.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as kernel from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { resolvePveExportPlan } from '../web/pve-export-plan.js';
import { createTrunkFormPrototype } from '../web/trunk-form-prototype.js';
import { exportGlb } from '../web/glb-export.js';
import { generateFinalCompletePackage } from './pve-final-package.mjs';
import { exportResolvedAssembly } from './export_branchforge_resolved_assembly.mjs';
import { atlasKey, atlasUv } from './pve-merged-atlas.mjs';
import { validatePackage } from './pve-package.mjs';

const tool = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), option = name => { const i = args.indexOf(name); return i < 0 ? '' : args[i + 1] || ''; };
const destination = path.resolve(option('--out') || path.join(tool, '.runtime/trunk-feasibility'));
const runtimeRoot = path.join(tool, '.runtime'), relative = path.relative(runtimeRoot, destination);
assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), '试验输出必须在本开发目录 .runtime 子目录中');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const progress = (stage, detail) => console.log(JSON.stringify({ stage, detail }));
if (!globalThis.FileReader) globalThis.FileReader = class {
  async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend?.(); }
  async readAsDataURL(blob) { this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onloadend?.(); }
};

const labels = ['紧凑侧枝_深绿', '紧凑侧枝_混合', '紧凑侧枝_嫩绿', '短弯细梢_深绿', '短弯细梢_混合', '短弯细梢_嫩绿'];
const libraryFiles = labels.map(name => path.join(tool, '次枝资产/全植物次枝成品V1/香樟', `香樟_${name}_成品V1.branchasset.json`));
const libraryHashes = libraryFiles.map(file => sha(fs.readFileSync(file)));
const library = libraryFiles.map(file => read(file).asset);
assert.equal(new Set(library.map(item => item.id)).size, 6);
assert(library.every(item => item.sample?.leaf_meshes?.length && item.sample?.authoring), '需要六款真实完整香樟样本');
const sources = [...new Map(library.flatMap(item => item.sample.leaf_meshes).map(source => [source.id, source])).values()];
const commonOptions = { height: 5.2, baseRadius: .42, tipRadius: .14, seed: 17,
  radialSegments: 128, heightSegments: 96, lean: [.035, -.018] };
const axisStudy = createTrunkFormPrototype({ ...commonOptions, mode: 'GROOVED' });
const axis = axisStudy.axis.map(p => p.toArray());
axisStudy.geometry.dispose();
const vectors = axis.map(p => new THREE.Vector3(...p));
const pointAt = t => {
  const scaled = Math.max(0, Math.min(1, t)) * (vectors.length - 1), i = Math.min(vectors.length - 2, Math.floor(scaled));
  return vectors[i].clone().lerp(vectors[i + 1], scaled - i).toArray();
};
const lengthOf = points => points.slice(1).reduce((n, p, i) => n + new THREE.Vector3(...p).distanceTo(new THREE.Vector3(...points[i])), 0);
const branches = [{ id: 'ROOT', parent: '', points: axis, length: lengthOf(axis), start_radius: commonOptions.baseRadius, end_radius: commonOptions.tipRadius }];
for (let n = 0; n < 5; n++) {
  const attach = .33 + n * .115, root = pointAt(attach), angle = n * Math.PI * 2 / 5;
  const points = [root, [root[0] + Math.cos(angle) * .7, root[1] + Math.sin(angle) * .7, root[2] + .24],
    [root[0] + Math.cos(angle) * 1.55, root[1] + Math.sin(angle) * 1.55, root[2] + .58]];
  // Keep the synthetic supporting limb wider than the conservative native
  // probe's 1.7 cm unit-root assumption, including the most distal placement.
  // This does not change the six source models or their calibrated dimensions.
  branches.push({ id: 'HOST_' + (n + 1), parent: 'ROOT', attach, points, length: lengthOf(points), start_radius: .105 - n * .008, end_radius: .04 });
}
const instances = Array.from({ length: 24 }, (_, n) => {
  const item = library[n % 6], host = n % 6;
  return { id: `STUDY_${String(n + 1).padStart(2, '0')}`, asset_id: item.id, linked: true, pinned_revision: item.revision,
    parent: host ? `HOST_${host}` : 'ROOT', attach: host ? .22 + Math.floor(n / 6) * .2 : .47 + Math.floor(n / 6) * .12,
    scale: 1.65, radius_scale: 1, variation: 0, roll: (n * 47) % 360, angle: 48, azimuth: (n * 83) % 360 };
});
const settings = kernel.normalizeSettings({ ...library[0].sample.settings, object_name: '香樟主干可行性小样',
  length: commonOptions.height, base_radius: commonOptions.baseRadius, radial_segments: 32, leaf_density: 0,
  // Explicit shape branches never spawn procedural children. Two levels are
  // still needed for LOD0 to render the five order-1 HOST carriers.
  branch_levels: 2, child_count: 0, roughness: 0, max_triangles: 8000000, preview_lod: 0, export_lods: false });
const authoring = normalizeAuthoring({ branch_shape: { branches }, branch_library: library, branch_instances: instances,
  leaf_material: library[0].sample.authoring.leaf_material,
  recipe: { tags: ['WHOLE_PLANT', 'SAMPLE_FOLIAGE_FROM_LIBRARY', 'FOLIAGE_ON_INSTANCES_ONLY'] } }, settings.seed);
const projectFor = (mode, options) => ({ format: 'ProceduralBranchProject', version: 4, settings, authoring, leaf_meshes: sources,
  trunk_form_prototype: { version: 1, experimental: true, mode, options, structural_branch: 'ROOT',
    ...(mode === 'Refined' ? { fixed_geometry: 'trunk.fixed-geometry.json' } : {}),
    policy: 'Independent ROOT render mesh only; carriers and complete units unchanged; not a production authoring field' } });

function packageFilesCopy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  const manifest = read(path.join(from, 'complete_units.manifest.json'));
  const files = ['whole.pve-skeleton.json', 'complete_units.manifest.json', 'whole.resolved.json', 'whole.resolved.bin',
    'leaf_atlas_color.png', 'leaf_atlas_normal.png', 'validation.json', ...manifest.units.map(unit => unit.glb)];
  for (const name of files) if (fs.existsSync(path.join(from, name))) fs.copyFileSync(path.join(from, name), path.join(to, name));
}
function rootMesh(asset, plan) {
  assert(plan.structuralBranches.some(branch => branch.stableId === 'ROOT' && branch.parentId < 0), 'ROOT 必须是承重根，而非完整单元内部枝');
  const matches = [];
  asset.group.traverse(mesh => { if (mesh.isMesh && mesh.userData.category === 'branch' && mesh.userData.stable_id === 'ROOT') matches.push(mesh); });
  assert.equal(matches.length, 1, '实际 ROOT 网格必须单独存在；不能按所有树皮材质替换');
  assert.equal(matches[0].material.name, 'M_Bark');
  matches[0].name = 'PrototypeTrunk_ROOT';
  return matches[0];
}
function structuralMeshes(asset, plan) {
  const expected = new Set(['ROOT', ...Array.from({ length: 5 }, (_, n) => 'HOST_' + (n + 1))]);
  assert.deepEqual(new Set(plan.structuralBranches.map(b => b.stableId)), expected, '需要 ROOT 与五条真实承重侧枝');
  const meshes = new Map();
  asset.group.traverse(mesh => {
    if (!mesh.isMesh || mesh.userData.category !== 'branch' || !expected.has(mesh.userData.stable_id)) return;
    const id = mesh.userData.stable_id;
    assert(!meshes.has(id), '承重枝网格重复：' + id);
    const geometry = mesh.geometry;
    assert(geometry.getAttribute('position')?.count > 0 && geometry.index?.count > 0 && geometry.index.count % 3 === 0,
      '承重枝必须有实际三角网格：' + id);
    assert.equal(mesh.material?.name, 'M_Bark');
    meshes.set(id, mesh);
  });
  assert.deepEqual(new Set(meshes.keys()), expected, '承重骨架记录存在，但 ROOT / HOST 实际网格被过滤或丢失');
  return meshes;
}
function verifyStructuralChunks(folder, meshes) {
  const resolved = read(path.join(folder, 'whole.resolved.json'));
  const base = resolved.chunks.filter(chunk => chunk.instance_index === -1);
  assert.deepEqual(new Set(base.map(c => c.host_branch_id)), new Set(meshes.keys()), 'PVE 实际基座必须包含所有六条承重枝，不能只有 ROOT');
  for (const [id, mesh] of meshes) {
    assert(base.some(c => c.host_branch_id === id && c.material_role === 'bark'
      && c.vertex_count === mesh.geometry.getAttribute('position').count && c.index_count === mesh.geometry.index.count),
    'PVE 缺少实际承重枝皮网格（连接套环不能替代它）：' + id);
  }
  return { branch_ids: [...meshes.keys()], chunks: base.length,
    vertices: base.reduce((sum, c) => sum + c.vertex_count, 0), triangles: base.reduce((sum, c) => sum + c.index_count / 3, 0) };
}
function syntheticHostFit(skeleton) {
  const byId = new Map(skeleton.branches.map(b => [b.id, b]));
  const sourceById = new Map(library.map(item => [item.id, item]));
  const genericUnitRadiusM = .017; // Installed PVEWorkflow default: 1.7 cm.
  const samples = skeleton.foliage.map(instance => {
    const host = byId.get(instance.branch_id);
    assert(host?.points.length && instance.scale_m > 0);
    const position = new THREE.Vector3(...instance.position_m);
    // Match the native diagnostic's nearest saved skeleton point, rather than
    // claiming its fixed 1.7 cm assumption measures each source's exact skin.
    const nearest = host.points.reduce((best, point) => {
      const distance = position.distanceToSquared(new THREE.Vector3(...point.position_m));
      return !best || distance < best.distance ? { point, distance } : best;
    }, null).point;
    const sourceId = skeleton.foliage_sources[instance.source_index].id, source = sourceById.get(sourceId);
    assert(source, 'Unknown complete-unit source for synthetic fit');
    const root = source.shape.branches.find(b => !b.parent);
    return { instance_id: instance.id, host: host.id, host_t: instance.branch_t,
      nearest_host_radius_m: nearest.radius_m, generic_probe_unit_radius_m: genericUnitRadiusM * instance.scale_m,
      generic_probe_ratio: nearest.radius_m / (genericUnitRadiusM * instance.scale_m),
      authored_source_nominal_root_radius_m: root.start_radius * instance.scale_m };
  });
  const thinner = samples.filter(sample => sample.generic_probe_ratio < 1);
  assert.equal(thinner.length, 0, 'Synthetic carriers are thinner than the native probe assumption: ' + thinner.map(s => s.instance_id).join(', '));
  return { diagnostic: 'nearest skeleton sample / fixed 1.7cm unit-root radius times instance scale; not exact source-surface fit',
    samples: samples.length, expected_native_host_thinner_than_unit: 0,
    minimum_generic_probe_ratio: Math.min(...samples.map(sample => sample.generic_probe_ratio)),
    maximum_authored_source_nominal_root_radius_m: Math.max(...samples.map(sample => sample.authored_source_nominal_root_radius_m)),
    placements: samples };
}
function serializeFixedGeometry(geometry) {
  return { format: 'BranchForgeExperimentalFixedTrunk', version: 1, coordinate_system: 'right_handed_Z_up_meter',
    attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([name, a]) => [name, { itemSize: a.itemSize, values: Array.from(a.array) }])),
    index: Array.from(geometry.index.array), userData: geometry.userData };
}
function readFixedGeometry(file) {
  const data = read(file);
  assert.equal(data.format, 'BranchForgeExperimentalFixedTrunk');
  assert.equal(data.coordinate_system, 'right_handed_Z_up_meter');
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(data.attributes)) geometry.setAttribute(name, new THREE.Float32BufferAttribute(attribute.values, attribute.itemSize));
  geometry.setIndex(data.index); geometry.userData = data.userData;
  for (const name of ['position', 'normal', 'uv', 'tangent']) assert(geometry.hasAttribute(name), '固定主干丢失 ' + name);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  assert.equal(sha(Buffer.from(geometry.getAttribute('position').array.buffer)), sha(Buffer.from(new Float32Array(data.attributes.position.values).buffer)));
  return geometry;
}
function atlasFromManifest(manifest) {
  const data = manifest.merged_atlas;
  if (!data) return null;
  const regions = new Map(data.regions.map(region => [region.key, region]));
  return { ...data, uv(material, u, v) {
    const region = regions.get(atlasKey(material));
    assert(region, '实际叶花果材质必须来自原包图集');
    return atlasUv(region, data, u, v);
  } };
}
function fingerprints(folder) {
  const data = read(path.join(folder, 'whole.resolved.json')), bin = fs.readFileSync(path.join(folder, 'whole.resolved.bin'));
  return data.chunks.filter(c => !(c.instance_index === -1 && c.host_branch_id === 'ROOT')).map(c => ({
    owner: [c.instance_index, c.source_index, c.host_branch_id, c.material_role, c.color_linear],
    vertices: c.vertex_count, indices: c.index_count,
    hash: sha(bin.subarray(c.vertex_offset, c.index_offset + c.index_count * 4)) }));
}
async function preview(asset, atlas, folder) {
  const group = asset.group.clone(true), materials = [], geometries = [];
  group.name = 'TrunkFeasibility'; group.userData = { experimental: true, lod: 0 };
  try {
    group.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.geometry = mesh.geometry.clone(); geometries.push(mesh.geometry);
      const original = mesh.material;
      assert(!Array.isArray(original), '预览保持独立单材质网格');
      mesh.material = original.clone(); materials.push(mesh.material);
      const foliage = original.name === 'M_Leaf' || original.sampleLeafMaterial;
      if (foliage) {
        const source = original.sampleLeafMaterial || asset.authoring.leaf_material;
        if (source?.color) mesh.material.color.set(original.vegetationTint || '#ffffff');
        if (atlas) {
          const uv = mesh.geometry.getAttribute('uv');
          for (let n = 0; n < uv.count; n++) uv.setXY(n, ...atlas.uv(source, uv.getX(n), uv.getY(n)));
        }
      }
      // Keep geometry/UV and tint; the browser binds the shared atlas explicitly.
      // Node has no canvas/image runtime. No bark PBR textures are claimed here.
      for (const key of Object.keys(mesh.material)) if (mesh.material[key]?.isTexture) mesh.material[key] = null;
    });
    fs.writeFileSync(path.join(folder, 'preview.glb'), Buffer.from(await exportGlb(group, { singleMesh: false })));
  } finally { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); }
}

fs.mkdirSync(destination, { recursive: true });
const baselineFolder = path.join(destination, 'Baseline'), baselinePackage = path.join(baselineFolder, 'PVE_Complete');
fs.mkdirSync(baselinePackage, { recursive: true });
const baselineProject = projectFor('Baseline', commonOptions), baselineInput = path.join(baselineFolder, 'source.branch.json');
write(baselineInput, baselineProject);
await generateFinalCompletePackage({ tool, input: baselineInput, document: read(baselineInput), sourceBytes: fs.readFileSync(baselineInput),
  output: baselinePackage, progress });
const baselineValidation = validatePackage(baselinePackage, fs.readFileSync(baselineInput));
write(path.join(baselinePackage, 'validation.json'), baselineValidation);
const baselineManifest = read(path.join(baselinePackage, 'complete_units.manifest.json'));
const baselineSkeleton = read(path.join(baselinePackage, 'whole.pve-skeleton.json'));
assert.equal(baselineManifest.units.length, 6); assert.equal(baselineSkeleton.foliage.length, 24);
assert(baselineManifest.units.every(unit => unit.instance_count === 4 && !unit.variant_kind));
const nonRootBaseline = fingerprints(baselinePackage), results = [];
for (const mode of ['Baseline', 'Grooved', 'Buttress', 'Refined']) {
  progress('主干可行性小样', mode);
  const folder = path.join(destination, mode), packageFolder = path.join(folder, 'PVE_Complete');
  fs.mkdirSync(folder, { recursive: true });
  const options = { ...commonOptions, mode: mode.toUpperCase() };
  const input = path.join(folder, 'source.branch.json');
  if (mode !== 'Baseline') { packageFilesCopy(baselinePackage, packageFolder); write(input, projectFor(mode, options)); }
  const document = read(input), sourceBytes = fs.readFileSync(input);
  const localSources = document.leaf_meshes.map(source => ({ ...source, geometry: kernel.deserializeGeometry(source.geometry) }));
  let asset, study;
  try {
    asset = kernel.buildBranchAsset(kernel.normalizeSettings(document.settings), null, localSources, 0,
      normalizeAuthoring(document.authoring, document.settings.seed));
    const plan = resolvePveExportPlan(asset, asset.authoring), mesh = rootMesh(asset, plan);
    const supportMeshes = structuralMeshes(asset, plan);
    assert.equal(plan.units.length, 24); assert(plan.units.every(unit => !unit.variantRequired));
    const manifest = read(path.join(packageFolder, 'complete_units.manifest.json'));
    const skeleton = read(path.join(packageFolder, 'whole.pve-skeleton.json'));
    const atlas = atlasFromManifest(manifest);
    let geometrySource = 'production_ROOT_sweep', fixedGeometry = null;
    if (mode !== 'Baseline') {
      study = createTrunkFormPrototype(options);
      let geometry = study.geometry;
      if (mode === 'Refined') {
        fixedGeometry = 'trunk.fixed-geometry.json';
        write(path.join(folder, fixedGeometry), serializeFixedGeometry(geometry));
        geometry = readFixedGeometry(path.join(folder, fixedGeometry));
        assert.notEqual(geometry, study.geometry, 'Refined 必须从磁盘重新构造独立固定网格');
        geometrySource = 'fixed_mesh_serialized_and_reloaded';
      } else geometrySource = 'independent_parametric_skin';
      const color = [];
      for (let n = 0; n < geometry.getAttribute('position').count; n++) color.push(geometry.getAttribute('uv').getY(n), 0, 0, document.settings.health);
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 4));
      const old = mesh.geometry; mesh.geometry = geometry; old.dispose();
      asset.report = { ...asset.report, ...kernel.analyzeGroup(asset.group, asset.settings) };
      plan.units.forEach(unit => {
        const instance = skeleton.foliage.find(i => i.id === 'UNIT_' + unit.id);
        assert(instance, '缺少完整单元装配记录'); unit.source_index = instance.source_index;
      });
      const warnings = [];
      const resolved = await exportResolvedAssembly({ tool, document, skeleton, output: packageFolder,
        sourceSha256: sha(sourceBytes), asset, atlas, exportPlan: plan,
        onQualityWarnings: items => warnings.push(...items) });
      skeleton.resolved_assembly = resolved; manifest.resolved_assembly = resolved;
      manifest.source_whole_project = input; manifest.source_whole_sha256 = sha(sourceBytes);
      write(path.join(packageFolder, 'whole.pve-skeleton.json'), skeleton);
      write(path.join(packageFolder, 'complete_units.manifest.json'), manifest);
      const previous = read(path.join(packageFolder, 'validation.json'));
      write(path.join(packageFolder, 'validation.json'), { ...previous, resolved_assembly: resolved, quality_warnings: warnings });
    }
    const validation = validatePackage(packageFolder, sourceBytes);
    write(path.join(packageFolder, 'validation.json'), validation);
    const reloaded = read(path.join(packageFolder, 'whole.pve-skeleton.json'));
    assert.deepEqual(reloaded.branches, baselineSkeleton.branches, '承重骨架必须原样保留');
    assert.deepEqual(reloaded.foliage, baselineSkeleton.foliage, '完整单元挂接与变换必须原样保留');
    assert.deepEqual(reloaded.foliage_sources, baselineSkeleton.foliage_sources, '完整源模型不能拆类');
    assert.deepEqual(fingerprints(packageFolder), nonRootBaseline, '只准替换 ROOT；其它承重侧枝、连接套环和完整单元的实际几何必须逐字节保留');
    for (const unit of manifest.units) {
      const original = baselineManifest.units.find(item => item.id === unit.id);
      assert.equal(unit.glb_sha256, original.glb_sha256); assert.equal(sha(fs.readFileSync(path.join(packageFolder, unit.glb))), original.glb_sha256);
    }
    assert.equal(reloaded.complete_unit_assembly.leaf_instances, 0); assert.equal(reloaded.complete_unit_assembly.organ_instances, 0);
    await preview(asset, atlas, folder);
    fs.copyFileSync(path.join(packageFolder, 'leaf_atlas_color.png'), path.join(folder, 'leaf_atlas_color.png'));
    if (fs.existsSync(path.join(packageFolder, 'leaf_atlas_normal.png'))) fs.copyFileSync(path.join(packageFolder, 'leaf_atlas_normal.png'), path.join(folder, 'leaf_atlas_normal.png'));
    const resolvedMetadata = read(path.join(packageFolder, 'whole.resolved.json'));
    const structural_geometry = verifyStructuralChunks(packageFolder, supportMeshes), host_fit = syntheticHostFit(reloaded);
    const rootChunks = resolvedMetadata.chunks.filter(c => c.instance_index === -1 && c.host_branch_id === 'ROOT');
    assert.equal(rootChunks.length, 1, 'ROOT 新网格只应交付一次');
    const trunk = { modelName: 'PrototypeTrunk_ROOT', branchId: 'ROOT', geometrySource,
      vertices: mesh.geometry.getAttribute('position').count, triangles: mesh.geometry.index.count / 3,
      geometry_sha256: sha(Buffer.from(mesh.geometry.getAttribute('position').array.buffer)),
      ...(fixedGeometry ? { fixedGeometry, fixedGeometry_sha256: sha(fs.readFileSync(path.join(folder, fixedGeometry))) } : {}),
      material: 'M_Bark', barkPbrDelivered: false };
    const unitstats = { classes: 6, instances: 24, per_class_instances: 4, leaves: asset.masterPlacements.length,
      organs: asset.treeOrgans.length, leaf_instances: 0, organ_instances: 0, source_models_unchanged: true };
    const leafCutoffs = new Set();
    asset.group.traverse(object => { if (object.isMesh && (object.material?.name === 'M_Leaf' || object.material?.sampleLeafMaterial)) leafCutoffs.add(object.material.alphaTest || 0); });
    write(path.join(folder, 'prototype.json'), { format: 'BranchForgeTrunkFeasibility', version: 1, experimental: true, mode,
      // Retain original inputs for authoring; normalized parameters also round
      // trip exactly and let the preview reconstruct the delivered skin.
      options, parameters: study?.parameters || null, axis: study?.axis.map(p => p.toArray()) || axis,
      branches: reloaded.branches, unitstats, glb: 'preview.glb', atlas: 'leaf_atlas_color.png',
      leafCutoff: leafCutoffs.size === 1 ? [...leafCutoffs][0] : .42, leafCutoffs: [...leafCutoffs],
      structural_geometry, host_fit,
      pve: 'PVE_Complete/whole.pve-skeleton.json', source: 'source.branch.json', trunk,
      coordinate_system: 'software_Z_up_meter; preview_GLTF_Y_up_meter', preview_restore_rotation_x: Math.PI / 2,
      limitations: ['only_ROOT_skin_replaced', 'no_branch_junction_fusion', 'solid_star_section_no_holes_or_overhangs',
        'existing_bark_color_only_no_bark_PBR_delivery', 'not_production_authoring', 'UE_import_not_run_by_this_script'],
      validation: { ...validation, files: undefined } });
    results.push({ mode, pve: path.relative(destination, packageFolder), validated: validation.valid, trunk, unitstats, structural_geometry, host_fit });
  } finally {
    kernel.disposeBranchAsset(asset); localSources.forEach(source => source.geometry.dispose());
    if (study && mode === 'Refined') study.geometry.dispose();
  }
}
assert.deepEqual(libraryFiles.map(file => sha(fs.readFileSync(file))), libraryHashes, '正式素材库不得改写');
write(path.join(destination, '验收.json'), { passed: true, source_library_unchanged: true, modes: results });
console.log(JSON.stringify({ success: true, output: destination, modes: results.map(r => r.mode), classes: 6, instances: 24 }));
