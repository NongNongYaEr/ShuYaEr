import test from 'node:test';
import { createRuntimeTestDirectory } from './runtime-test-directory.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as k from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { captureBranchDuplicate } from '../web/branch-duplicate.js';
import { makeMountOperation } from '../web/branch-mount.js';
import { resolvePveExportPlan } from '../web/pve-export-plan.js';
import { legacyUnitInstances, makeLegacyUnitPlacement } from '../web/legacy-unit-placement.js';
import { validatePackage } from '../scripts/pve-package.mjs';
import * as T from 'three';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const load = (plant, name) => read(path.join('次枝资产/全植物次枝成品V1', plant, name + '.branchasset.json')).asset;
const layer = (id, operation, branches = {}) => ({ id, name: id, enabled: true, strength: 1, operation, branches });
const shape = (id, parent, points) => ({ id, parent, points, attach: .5, length: 2, start_radius: .08, end_radius: .03 });
function auditVariantPayload(result) {
  const bin = fs.readFileSync(path.join(result.output, 'whole.resolved.bin'));
  const readGlb = name => {
    const bytes = fs.readFileSync(path.join(result.output, name)), length = bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + length)), base = 28 + length;
    const accessor = id => {
      const a = json.accessors[id], view = json.bufferViews[a.bufferView];
      const components = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4 }[a.type];
      const size = {5123:2,5125:4,5126:4}[a.componentType], method = {5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType];
      return (index, component = 0) => bytes[method](base + (view.byteOffset || 0) + (a.byteOffset || 0)
        + index * (view.byteStride || components * size) + component * size);
    };
    return json.meshes.flatMap(mesh => mesh.primitives.map(primitive => ({
      count: json.accessors[primitive.indices].count, index: accessor(primitive.indices),
      position: accessor(primitive.attributes.POSITION), normal: accessor(primitive.attributes.NORMAL),
      uv: accessor(primitive.attributes.TEXCOORD_0) })));
  };
  for (const [instance, mount] of result.skeleton.foliage.entries()) {
    const source = result.manifest.units[mount.source_index];
    if (!source.variant_kind) continue;
    const up = new T.Vector3(...mount.up), face = new T.Vector3(...mount.face);
    const across = new T.Vector3().crossVectors(up, face).normalize();
    const transform = new T.Matrix4().makeBasis(across, up, face).scale(new T.Vector3().setScalar(mount.scale_m));
    transform.setPosition(...mount.position_m);
    const normals = new T.Matrix3().getNormalMatrix(transform);
    const triangles = readGlb(source.glb).flatMap(primitive => Array.from({length: primitive.count}, (_, index) => {
      const vertex = primitive.index(index), position = new T.Vector3(...[0,1,2].map(c => primitive.position(vertex,c))).applyMatrix4(transform);
      const normal = new T.Vector3(...[0,1,2].map(c => primitive.normal(vertex,c))).applyMatrix3(normals).normalize();
      return [position.x*100, -position.y*100, position.z*100, normal.x, -normal.y, normal.z,
        primitive.uv(vertex,0), 1-primitive.uv(vertex,1)];
    }));
    const actual = result.resolved.chunks.filter(chunk => chunk.instance_index === instance).flatMap(chunk =>
      Array.from({length:chunk.index_count}, (_, index) => {
        const vertex = bin.readUInt32LE(chunk.index_offset + index*4);
        return Array.from({length:8}, (_, c) => bin.readFloatLE(chunk.vertex_offset + vertex*48 + c*4));
      }));
    assert.equal(triangles.length, actual.length, 'variant contains every owned triangle once');
    for (let vertex = 0; vertex < actual.length; vertex++) for (let c = 0; c < 8; c++)
      assert.ok(Math.abs(triangles[vertex][c]-actual[vertex][c]) < (c < 3 ? .001 : c < 6 ? .0006 : 1e-6),
        `${mount.id} GLB/actual vertex ${vertex} component ${c}`);
  }
}

test('real complete exporter resolves structural copies, refined and nested units, mixed materials and exact ownership', { timeout: 180000 }, t => {
  const camphor = load('香樟', '香樟_短弯细梢_混合_成品V1');
  const photinia = load('红叶石楠', '红叶石楠_短弯细梢_混合_成品V1');
  const sources = [...new Map([camphor, photinia].flatMap(item => item.sample.leaf_meshes).map(source => [source.id, source])).values()];
  const organs = [...new Map([camphor, photinia].flatMap(item => item.sample.authoring.tree_organs.units).map(source => [source.id, source])).values()];
  const authoring = normalizeAuthoring({
    branch_shape: { branches: [shape('ROOT', '', [[0,0,0],[0,0,4]]), shape('A', 'ROOT', [[0,0,2],[1,0,2.6],[2,0,2.8]])] },
    branch_library: [camphor, photinia], branch_instances: [
      { id: 'IA', parent: 'A', asset_id: camphor.id, linked: true, attach: .7, scale: 2, variation: 0 },
      { id: 'IB', parent: 'ROOT', asset_id: photinia.id, linked: true, attach: .8, scale: 2, variation: 0 }],
    tree_organs: { units: organs, amount: 0 }, leaf_material: camphor.sample.authoring.leaf_material,
    recipe: { tags: ['SAMPLE_FOLIAGE_FROM_LIBRARY', 'FOLIAGE_ON_INSTANCES_ONLY'] }
  });
  const settings = k.normalizeSettings({ ...camphor.sample.settings, object_name: 'PVE final graph regression',
    leaf_density: 0, max_triangles: 8000000, preview_lod: 0 });
  const localSources = sources.map(source => ({ ...source, geometry: k.deserializeGeometry(source.geometry) }));
  const assets = [], folder = createRuntimeTestDirectory(t, 'pve-final-graph-');
  const build = () => { const asset = k.buildBranchAsset(settings, null, localSources, 0, authoring); assets.push(asset); return asset; };
  const exportPackage = (name, document) => {
    const input = path.join(folder, name + '.branch.json'), output = path.join(folder, name + '_PVE_Complete');
    fs.writeFileSync(input, JSON.stringify({ format: 'ProceduralBranchProject', version: 4, ...document }));
    const result = spawnSync(process.execPath, ['--experimental-loader', './tests/vendor-loader.mjs',
      './scripts/export-pve-complete-units.mjs', '--tool', '.', '--project', input, '--out', output, '--geometry'],
      { encoding: 'utf8', timeout: 150000, maxBuffer: 4000000, windowsHide: true });
    fs.writeFileSync(path.join(folder, name + '.log'), result.stdout + result.stderr);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const validation = validatePackage(output, fs.readFileSync(input));
    return { output, validation, manifest: read(path.join(output, 'complete_units.manifest.json')),
      resolved: read(path.join(output, 'whole.resolved.json')), skeleton: read(path.join(output, 'whole.pve-skeleton.json')) };
  };
  try {
    const original = build(), before = JSON.stringify(authoring);
    const baseline = exportPackage('baseline', { settings, authoring, leaf_meshes: sources });
    assert.equal(baseline.skeleton.kind, 'whole_plant', 'final assembled graph keeps the whole-plant UE contract without a recipe tag');
    assert.equal(baseline.skeleton.connector, null);
    assert.equal(baseline.manifest.units.length, 2, 'ordinary rigid instances retain original source class count');
    assert.deepEqual(baseline.manifest.units.map(unit => unit.id).sort(), [camphor.id, photinia.id].sort());
    assert.equal(baseline.resolved.summary.triangles, original.report.triangles);
    assert.equal(baseline.resolved.summary.branches, original.masterBranches.length);
    assert.equal(baseline.resolved.summary.leaves, original.masterPlacements.length);
    assert.equal(baseline.resolved.summary.organs, original.treeOrgans.length);
    assert.equal(JSON.stringify(authoring), before, 'export leaves authored project untouched');
    const normalParentId='IA.'+camphor.shape.branches.find(branch=>!branch.parent).id;
    authoring.branch_instances.push({...authoring.branch_instances[1],id:'NORMAL_NESTED',parent:normalParentId,attach:.8,scale:.6});
    const normalNested=build(),normalPlan=resolvePveExportPlan(normalNested,authoring);
    assert.equal(normalPlan.units.length,3,'normal nested installation retains each complete source instance');
    assert.ok(normalPlan.units.every(unit=>!unit.variantRequired),'normal nested assembly never changes source model content');
    const normalDelivery=exportPackage('normal_nested_mixed',{settings,authoring,leaf_meshes:sources});
    assert.equal(normalDelivery.manifest.units.length,2,'normal mixed plant assembly reuses its two complete models');
    assert.equal(normalDelivery.skeleton.foliage.length,3);
    assert.equal(normalDelivery.skeleton.foliage.find(unit=>unit.id==='UNIT_NORMAL_NESTED').parent_unit_id,'UNIT_IA');
    for(const field of ['triangles','branches','leaves','organs'])assert.equal(normalDelivery.resolved.summary[field],field==='triangles'?normalNested.report.triangles:field==='branches'?normalNested.masterBranches.length:field==='leaves'?normalNested.masterPlacements.length:normalNested.treeOrgans.length,'independent nested mixed '+field);
    assert.ok(normalDelivery.resolved.summary.organs>0,'real nested flowers retained');
    for(const source of normalDelivery.manifest.units)assert.equal(source.glb_sha256,baseline.manifest.units.find(unit=>unit.id===source.id).glb_sha256);
    authoring.branch_instances=authoring.branch_instances.filter(instance=>instance.id!=='NORMAL_NESTED');
    for (const [token, attach] of [['COPY_A', .3], ['COPY_B', .6]]) {
      authoring.sculpt_layers.push(layer(token, captureBranchDuplicate(original, new Set(['A']), token, localSources)));
      const copied = build(), root = copied.masterBranches.find(branch => branch.stableId === token + '_0');
      authoring.sculpt_layers.push(layer(token + '_MOVE', makeMountOperation(copied.masterBranches, root,
        { target_parent: 'ROOT', attach, azimuth: 0, elevation: 0 }, { azimuth: 0, elevation: 0 })));
    }
    const sampleRootId = camphor.shape.branches.find(branch => !branch.parent).id;
    const rootId = 'IA.' + sampleRootId, rootBranch = original.masterBranches.find(branch => branch.stableId === rootId);
    authoring.sculpt_layers.push(layer('REFINE', null, { [rootId]: { parent: 'A',
      deltas: rootBranch.points.map((_, index, points) => [0, .07 * index / (points.length - 1), 0]),
      knot_deltas: rootBranch.controlPoints.map((_, index, points) => [0, .07 * index / (points.length - 1), 0]) } }));
    authoring.branch_instances.push({ ...authoring.branch_instances[1], id: 'NESTED', parent: rootId, attach: .8, scale: .6 });
    const edited = build(), finalPlan = resolvePveExportPlan(edited, edited.authoring);
    assert.equal(finalPlan.structuralBranches.length, 4, 'copies become final structural branches');
    assert.equal(finalPlan.units.length, 4, 'nested unit belongs only to outer complete branch');
    assert.ok(finalPlan.units.find(unit => unit.id === 'IA').nested);
    const result = exportPackage('edited', { settings, authoring, leaf_meshes: sources });
    assert.equal(result.skeleton.branches.length, 4);
    assert.equal(result.skeleton.foliage.length, 4);
    assert.equal(result.resolved.summary.triangles, edited.report.triangles);
    assert.equal(result.resolved.summary.branches, edited.masterBranches.length);
    assert.equal(result.resolved.summary.leaves, edited.masterPlacements.length);
    assert.equal(result.resolved.summary.organs, edited.treeOrgans.length);
    assert.ok(result.manifest.merged_atlas.regions.length >= 2, 'mixed real plant atlas retained');
    assert.equal(result.skeleton.foliage.filter(unit => unit.id.includes('NESTED')).length, 0);
    assert.ok(result.manifest.units.some(unit => unit.variant_kind === 'final_complete_unit'));
    auditVariantPayload(result);
    const copiedSources = result.skeleton.foliage.filter(unit => unit.id.startsWith('UNIT_COPY')).map(unit => unit.source_index);
    assert.equal(new Set(copiedSources).size, 1, 'equal complete copied content deduplicates despite different attachment');
    assert.ok(result.skeleton.foliage.find(unit => unit.id === 'UNIT_IB'));
    const beforePhotinia = baseline.manifest.units.find(unit => unit.id === photinia.id);
    const afterPhotinia = result.manifest.units.find(unit => unit.id === photinia.id);
    assert.equal(afterPhotinia.glb_sha256, beforePhotinia.glb_sha256, 'untouched authored source GLB remains byte-identical');
    assert.equal(afterPhotinia.triangles, beforePhotinia.triangles);
    const expectedIB = original.masterBranches.filter(branch => branch.instanceId === 'IB');
    for (const branch of expectedIB) assert.deepEqual(edited.masterBranches.find(item => item.stableId === branch.stableId).points.map(p => p.toArray()), branch.points.map(p => p.toArray()));
    authoring.sculpt_layers.push(layer('DIRECT_UNIT_COPY', captureBranchDuplicate(original, new Set([rootId]), 'DIRECT_UNIT', localSources)));
    const directCopy = build(), directPlan = resolvePveExportPlan(directCopy, directCopy.authoring);
    const copiedUnit = directPlan.units.find(unit => unit.id === 'DIRECT_UNIT_IA');
    assert.ok(copiedUnit, 'a snapshot of an installed root restores complete ownership from provenance');
    assert.equal(directPlan.structuralBranches.length, 4, 'installed root snapshot never becomes a loose structural branch');
    assert.equal(copiedUnit.branches.length, camphor.shape.branches.length);
    const direct = exportPackage('direct_root_snapshot', { settings, authoring, leaf_meshes: sources });
    assert.equal(direct.skeleton.branches.length, 4);
    assert.equal(direct.skeleton.foliage.length, 5);
    assert.equal(direct.resolved.summary.triangles, directCopy.report.triangles);
    assert.equal(direct.resolved.summary.leaves, directCopy.masterPlacements.length);
    auditVariantPayload(direct);
    // Genuine old copies can have no remaining registry instances and an
    // intentionally empty global palette. Their untextured wood/leaf tint and
    // explicitly textured source flowers must both retain the actual saved
    // appearance; a missing BASE atlas must not borrow either plant's image.
    const legacyAuthoring = normalizeAuthoring({ ...authoring, branch_instances: [],
      sculpt_layers: [layer('OLD_ONLY',captureBranchDuplicate(original,new Set([rootId,'IB.'+photinia.shape.branches.find(branch=>!branch.parent).id]),'OLD_ONLY',localSources))],
      symmetry_groups: [], leaf_material: {} },settings.seed);
    const legacyAsset=k.buildBranchAsset(settings,null,localSources,0,legacyAuthoring);assets.push(legacyAsset);
    const legacySource=JSON.stringify(legacyAuthoring),legacyPlan=resolvePveExportPlan(legacyAsset,legacyAuthoring);
    assert.equal(legacyPlan.units.length,2);assert.ok(legacyPlan.units.every(unit=>unit.variantRequired));
    const legacyPackage=exportPackage('old_only_empty_base',{settings,authoring:legacyAuthoring,leaf_meshes:sources});
    assert.equal(legacyPackage.skeleton.complete_unit_assembly.leaf_instances,0);
    assert.equal(legacyPackage.skeleton.complete_unit_assembly.organ_instances,0);
    assert.equal(legacyPackage.skeleton.foliage.length,2);
    assert.ok(legacyPackage.manifest.merged_atlas.regions.some(region=>region.untextured),'exact untextured BASE surface has an explicitly registered atlas region');
    for(const field of ['triangles','branches','leaves','organs'])assert.equal(legacyPackage.resolved.summary[field],field==='triangles'?legacyAsset.report.triangles:field==='branches'?legacyAsset.masterBranches.length:field==='leaves'?legacyAsset.masterPlacements.length:legacyAsset.treeOrgans.length,'legacy complete '+field);
    assert.ok(legacyPackage.resolved.summary.organs>0,'real saved flower geometry and atlas remain inside the complete old model');
    assert.equal(JSON.stringify(legacyAuthoring),legacySource,'export never assigns a generic or another plant atlas to the editable source');
    auditVariantPayload(legacyPackage);
    // Whole-unit strokes must move the complete model in the assembly only.
    // This real flower/leaf fixture catches world-axis tangent regeneration,
    // lost roll, scale baked into vertices, and unstable variant file names.
    let movedAuthoring=structuredClone(legacyAuthoring),movedAsset=legacyAsset;
    for(const [stroke,angle,scale] of [[0,.43,1],[1,-.28,1.3]]) {
      const virtual=legacyUnitInstances(movedAuthoring,movedAsset.masterBranches);
      const entries=virtual.map(instance=>({id:instance.id,instance,rootId:instance.legacyRootId}));
      const updates=entries.map(entry=>{
        const pivot=movedAsset.masterBranches.find(b=>b.stableId===entry.rootId).points[0];
        return {id:entry.id,matrix:new T.Matrix4().compose(pivot,new T.Quaternion().setFromAxisAngle(new T.Vector3(1,2,3).normalize(),angle),new T.Vector3().setScalar(scale))
          .multiply(new T.Matrix4().makeTranslation(...pivot.clone().negate().toArray()))};
      });
      const operation=makeLegacyUnitPlacement(entries,updates,{authoring:movedAuthoring,branches:movedAsset.masterBranches});
      assert.equal(operation.records.length,2);
      movedAuthoring=normalizeAuthoring(JSON.parse(JSON.stringify({...movedAuthoring,sculpt_layers:[...movedAuthoring.sculpt_layers,layer('RIGID_'+stroke,operation)]})),settings.seed);
      movedAsset=k.buildBranchAsset(settings,null,localSources,0,movedAuthoring);assets.push(movedAsset);
      const moved=exportPackage('legacy_rigid_'+stroke,{settings,authoring:movedAuthoring,leaf_meshes:sources});
      assert.deepEqual(moved.manifest.units.map(u=>[u.id,u.glb_sha256]),legacyPackage.manifest.units.map(u=>[u.id,u.glb_sha256]),'rotation/scale after fresh JSON reload reuses byte-identical complete models');
      assert.notDeepEqual(moved.skeleton.foliage,legacyPackage.skeleton.foliage,'the placement still changes');
      assert.equal(moved.manifest.model_reuse.stable_placement_instances,2);
      auditVariantPayload(moved);
    }
    // Before provenance fields existed, the snapshot owner was saved but the
    // original FIN instance could disappear after regenerating the assembly.
    const orphaned=structuredClone(legacyAuthoring);
    for(const record of orphaned.sculpt_layers[0].operation.records){
      record.owner ||= 'OLD_ONLY_'+record.sourceInstanceId;
      delete record.sourceAssetId;delete record.sourceInstanceId;delete record.sourceBranchId;
      for(const leaf of [...record.leaves,...record.organs]){
        delete leaf.metadata.sourceAssetId;delete leaf.metadata.sourceInstanceId;
      }
    }
    const orphanAsset=k.buildBranchAsset(settings,null,localSources,0,orphaned);assets.push(orphanAsset);
    const orphanBefore=JSON.stringify(orphaned),orphanPlan=resolvePveExportPlan(orphanAsset,orphaned);
    assert.equal(orphanPlan.units.length,2);
    assert.ok(orphanPlan.units.every(unit=>unit.sourceRecovery==='snapshot_geometry'&&unit.variantRequired));
    const orphanPackage=exportPackage('old_missing_provenance',{settings,authoring:orphaned,leaf_meshes:sources});
    assert.equal(orphanPackage.manifest.legacy_snapshot_recovery.count,2);
    assert.equal(orphanPackage.skeleton.complete_unit_assembly.leaf_instances,0);
    assert.equal(orphanPackage.skeleton.complete_unit_assembly.organ_instances,0);
    for(const field of ['triangles','branches','leaves','organs'])assert.equal(orphanPackage.resolved.summary[field],field==='triangles'?orphanAsset.report.triangles:field==='branches'?orphanAsset.masterBranches.length:field==='leaves'?orphanAsset.masterPlacements.length:orphanAsset.treeOrgans.length);
    assert.equal(JSON.stringify(orphaned),orphanBefore);
    auditVariantPayload(orphanPackage);
    const missingLibrary=structuredClone(original.authoring);missingLibrary.branch_library=[];
    assert.throws(()=>resolvePveExportPlan(original,missingLibrary),/无法恢复完整素材工程/,'ordinary missing sources must not be guessed or converted to snapshot variants');
    fs.writeFileSync(path.join(folder, '验收.json'), JSON.stringify({ passed: true, baseline: baseline.validation, normal_nested_mixed:normalDelivery.validation,
      refined: result.validation, direct_snapshot: direct.validation, legacy_empty_base:legacyPackage.validation,
      unchanged_source_classes: 2, final_unit_count: 4 }, null, 2));
    console.log('完整枝导出实测记录: ' + folder);
  } finally { assets.forEach(k.disposeBranchAsset); localSources.forEach(source => source.geometry.dispose()); }
});
