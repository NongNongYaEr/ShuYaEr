import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeAuthoring, migrateProjectDocument } from '../web/authoring-state.js';
import { compileGenerationPlan } from '../web/v4-tools.js';
import { canUpdateSupports, equalGeometry } from '../web/support-update.js';
import { createTrunkFormPreset, createTrunkSectionProfile, normalizeTrunkForms, createDirectTrunkForm, isDirectTrunkForm } from '../web/trunk-form.js';
import { buildBranchAsset, disposeBranchAsset, deserializeGeometry, createProjectDocument, createTrunkFormPreviewGeometry, DEFAULT_SETTINGS, normalizeSettings } from '../web/branch-kernel.js';
import { createPVESkeleton } from '../web/pve-skeleton-export.js';
import { createTrunkMeshPreset } from '../web/trunk-mesh-density.js';

const source = JSON.parse(fs.readFileSync(new URL('../次枝资产/全植物次枝成品V1/香樟/香樟_短弯细梢_混合_成品V1.branchasset.json', import.meta.url), 'utf8')).asset;
const assets = [], geometries = [];
test.afterEach(() => {
  assets.splice(0).forEach(disposeBranchAsset);
  geometries.splice(0).forEach(geometry => geometry.dispose());
});
function fixture() {
  const leaves = source.sample.leaf_meshes.map(item => {
    const geometry = deserializeGeometry(item.geometry); geometries.push(geometry);
    return { ...item, geometry };
  });
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, leaf_density: 0, petiole_length: 0, max_triangles: 8000000, collision_avoidance: false });
  const authoring = normalizeAuthoring({
    branch_shape: { branches: [{ id: 'ROOT', parent: '', points: [[0, 0, 0], [.15, -.1, 1], [.5, .05, 2], [.9, .2, 3]], length: 3.2, start_radius: .3, end_radius: .16 }] },
    branch_library: [source], branch_instances: Array.from({ length: 4 }, (_, n) => ({
      id: 'UNIT_' + n, asset_id: source.id, linked: true, parent: 'ROOT', attach: .2 + n * .18,
      scale: .7 + n * .1, angle: 60, azimuth: n * 72, seed: 42, variation: 0,
      ...(n === 1 ? { assembly_refined: true, frame: { position: [.2, .1, 1.2], direction: [.7, .2, -.4], parent_tangent: [0, 0, 1], parent_position: [.1, 0, 1] } } : {}),
    })),
    recipe: { tags: ['WHOLE_PLANT', 'SAMPLE_FOLIAGE_FROM_LIBRARY', 'FOLIAGE_ON_INSTANCES_ONLY', 'REAL_TREE_LEAVES'] },
    tree_organs: { ...source.sample.authoring.tree_organs, mode: 'LEAVES' },
  }, 42);
  const build = (a = authoring) => { const asset = buildBranchAsset(settings, null, leaves, 0, a, { instanced: true }); assets.push(asset); return asset; };
  return { authoring, settings, leaves, build };
}
const surface = asset => { let mesh; asset.group.traverse(object => { if (object.userData.category === 'branch' && object.userData.stable_id === 'ROOT') mesh = object; }); return mesh; };
const sampleBuffers = asset => { const records = []; asset.group.traverse(object => { if (object.isInstancedMesh) records.push([object, object.geometry, object.material, Array.from(object.instanceMatrix.array)]); }); return records; };
function assertSamplesUnchanged(records) {
  for (const [mesh, geometry, material, matrix] of records) {
    assert.equal(mesh.geometry, geometry); assert.equal(mesh.material, material);
    assert.deepEqual(Array.from(mesh.instanceMatrix.array), matrix); assert.ok(mesh.parent);
  }
}
function withForm(authoring, preset = 'NATURAL') {
  const next = normalizeAuthoring(authoring);
  next.workbench = { ...next.workbench, trunk_forms: { version: 1, branches: { ROOT: createTrunkFormPreset(preset) } } };
  return normalizeAuthoring(next);
}

test('per-carrier precision changes preserve complete-unit shared meshes, materials, transforms and PVE fields',()=>{
  const f=fixture(),before=withForm(f.authoring),asset=f.build(before),original=surface(asset).geometry.clone();geometries.push(original);
  const records=sampleBuffers(asset),skeleton=createPVESkeleton(asset,f.leaves),next=normalizeAuthoring(before);
  const form=createDirectTrunkForm(next.workbench.trunk_forms.branches.ROOT);
  form.mesh=createTrunkMeshPreset();form.details=[{id:'SMALL_SCAR',type:'SCAR',t:.5039,angle:1.875,width:8,height:.02,strength:.2,seed:1}];
  next.workbench.trunk_forms.branches.ROOT=form;
  assert.equal(canUpdateSupports(before,next,new Set(['ROOT'])),true);
  assert.equal(asset.updateSupportingBranches(f.settings,next),true);
  assertSamplesUnchanged(records);assert.deepEqual(next.branch_library,before.branch_library);assert.deepEqual(next.branch_instances,before.branch_instances);
  assert.deepEqual(createPVESkeleton(asset,f.leaves),skeleton);
  const cold=f.build(normalizeAuthoring(JSON.parse(JSON.stringify(next))));
  assert.ok(equalGeometry(surface(cold).geometry,surface(asset).geometry));
  assert.equal(asset.updateSupportingBranches(f.settings,before),true);
  assert.ok(equalGeometry(surface(asset).geometry,original));assertSamplesUnchanged(records);
});

test('trunk authoring is copied and preserved by project normalization while absent legacy data stays absent', () => {
  const previous = normalizeAuthoring({ workbench: { sample_layout: 'SHARED_SAMPLE' } });
  assert.equal(Object.hasOwn(previous.workbench, 'trunk_forms'), false);
  const raw = withForm(previous, 'BUTTRESS');
  raw.workbench.trunk_forms.branches.ROOT.sections = [{ id: 'RING_A', t: .4, radius: 1.4, oval: .8, roll: 30, span: .12 }];
  const copy = normalizeAuthoring(raw), normalized = structuredClone(copy.workbench.trunk_forms);
  raw.workbench.trunk_forms.branches.ROOT.buttresses[0].length = 5;
  assert.deepEqual(copy.workbench.trunk_forms, normalized, 'normalized snapshots own their local controls');
  const document = migrateProjectDocument(JSON.parse(JSON.stringify({ format: 'ProceduralBranchProject', version: 4, settings: { seed: 42 }, authoring: copy })));
  assert.deepEqual(document.authoring.workbench.trunk_forms, normalized);
  assert.equal(document.authoring.workbench.sample_layout, 'SHARED_SAMPLE');
});

test('surface recipe changes request geometry generation and interface-only changes remain NONE', () => {
  const authoring = normalizeAuthoring(), settings = normalizeSettings(DEFAULT_SETTINGS), before = { authoring, settings };
  const empty = normalizeAuthoring({ ...authoring, workbench: { trunk_forms: normalizeTrunkForms() } });
  assert.equal(compileGenerationPlan(before, { settings, authoring: empty }).scope, 'NONE');
  const next = withForm(authoring);
  assert.equal(compileGenerationPlan(before, { settings, authoring: next }).scope, 'TOPOLOGY');
  const changed = normalizeAuthoring(next); changed.workbench.trunk_forms.branches.ROOT.sections.push({ id: 'RING', t: .6, radius: 1.3, oval: 1, roll: 0, span: .2 });
  assert.equal(compileGenerationPlan({ settings, authoring: next }, { settings, authoring: changed }).scope, 'TOPOLOGY');
  const ui = normalizeAuthoring(next); ui.workbench.active_trunk_form_control = 'RING';
  assert.equal(compileGenerationPlan({ settings, authoring: next }, { settings, authoring: ui }).scope, 'NONE');
});

test('support shortcut accepts carrier forms but rejects unit internals and unrelated workbench changes', () => {
  const f = fixture(), next = withForm(f.authoring), ids = new Set(['ROOT']);
  assert.equal(canUpdateSupports(f.authoring, next, ids), true);
  const illegal = normalizeAuthoring(next);
  illegal.workbench.trunk_forms.branches['UNIT_0.' + source.shape.branches[0].id] = createTrunkFormPreset('BUTTRESS');
  assert.equal(canUpdateSupports(f.authoring, illegal, ids), false);
  const metadata = normalizeAuthoring(next); metadata.workbench.sample_layout = 'INSTANCE_SEEDED';
  assert.equal(canUpdateSupports(f.authoring, metadata, ids), false);
});

test('surface preset, contour, section slide/twist and one buttress update only carrier mesh and retain exact complete-unit sources and placements', () => {
  const f = fixture(), asset = f.build(), mesh = surface(asset), originalGeometry = mesh.geometry.clone(); geometries.push(originalGeometry);
  const buffers = sampleBuffers(asset), sourceBefore = JSON.stringify(asset.authoring.branch_library), instancesBefore = structuredClone(asset.authoring.branch_instances);
  const originalSkeleton = createPVESkeleton(asset, f.leaves);
  let next = withForm(f.authoring, 'BUTTRESS'), releases = 0;
  for (const edit of [() => {}, form => { form.sections.push({ id: 'RING', t: .5, radius: 1.3, oval: 1.2, roll: 25, span: .16 }); },
    form => { form.sections[0].profile = createTrunkSectionProfile().map((point, n) => ({ ...point, radius: .5 + n / 4 })); },
    form => { form.sections[0].t = .31; form.sections[0].roll = -43; },
    form => { form.buttresses[0].angle += 18; form.buttresses[0].length += .4; }]) {
    next = normalizeAuthoring(next); edit(next.workbench.trunk_forms.branches.ROOT);
    assert.equal(asset.updateAssemblyTransforms(f.settings, next, { beforeCommit: () => { throw new Error('surface must not use matrix-only commit'); } }), false);
    assert.equal(asset.updateSupportingBranches(f.settings, next, { beforeCommit: () => releases++ }), true);
    assert.equal(surface(asset), mesh); assert.equal(equalGeometry(mesh.geometry, originalGeometry), false);
    assertSamplesUnchanged(buffers); assert.equal(JSON.stringify(next.branch_library), sourceBefore);
    assert.deepEqual(next.branch_instances, instancesBefore);
    assert.deepEqual(createPVESkeleton(asset, f.leaves), originalSkeleton, 'legacy PVE skeleton, hierarchy and foliage retain their established contract');
    assert.equal(asset.report.support_update.updated_samples, 0);
    const cold = f.build(normalizeAuthoring(JSON.parse(JSON.stringify(next))));
    assert.equal(equalGeometry(surface(cold).geometry, mesh.geometry), true);
    assert.deepEqual(createPVESkeleton(cold, f.leaves), originalSkeleton);
  }
  assert.equal(releases, 5);
  const disabled = normalizeAuthoring(next); disabled.workbench.trunk_forms.branches.ROOT.enabled = false;
  assert.equal(asset.updateSupportingBranches(f.settings, disabled), true);
  assert.equal(equalGeometry(surface(asset).geometry, originalGeometry), true, 'disabled recipe returns exact legacy geometry');
  assertSamplesUnchanged(buffers);
  assert.equal(asset.updateSupportingBranches(f.settings, next), true);
  assert.equal(asset.updateSupportingBranches(f.settings, normalizeAuthoring(f.authoring)), true);
  assert.equal(equalGeometry(surface(asset).geometry, originalGeometry), true, 'undoing authoring restores exact old carrier');
  assertSamplesUnchanged(buffers);
});

test('saving a complete project to disk and reading it afresh reconstructs trunk controls and geometry without editing source library', () => {
  const f = fixture(), next = withForm(f.authoring, 'BUTTRESS');
  next.workbench.trunk_forms.branches.ROOT.sections.push({ id: 'DISK_RING', t: .38, radius: 1.25, oval: .9, roll: -17, span: .13,
    profile: createTrunkSectionProfile().map((point, n) => ({ ...point, radius: .5 + n / 4 })) });
  next.workbench.trunk_forms.branches.ROOT.buttresses[2].height = .42;
  const asset = f.build(next), folder = new URL('../.runtime/trunk-state-pipeline/', import.meta.url), path = new URL('roundtrip.branch.json', folder);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path, JSON.stringify(createProjectDocument(asset, f.leaves, next)));
  const fresh = migrateProjectDocument(JSON.parse(fs.readFileSync(path, 'utf8'))), rebuilt = f.build(fresh.authoring);
  assert.deepEqual(fresh.authoring.workbench.trunk_forms, normalizeTrunkForms(next.workbench.trunk_forms));
  assert.deepEqual(fresh.authoring.branch_instances, asset.authoring.branch_instances);
  assert.deepEqual(fresh.authoring.branch_library, asset.authoring.branch_library);
  assert.equal(equalGeometry(surface(rebuilt).geometry, surface(asset).geometry), true);
  assert.deepEqual(createPVESkeleton(rebuilt, f.leaves), createPVESkeleton(asset, f.leaves));
  assert.equal(rebuilt.report.compiled_samples, 1);
});

test('direct section edits, read-only base preview and disk reload preserve whole units and an exact undo to the legacy carrier', () => {
  const f = fixture(), legacy = withForm(f.authoring, 'BUTTRESS');
  legacy.workbench.trunk_forms.branches.ROOT.sections.push({ id: 'OLD_RING', t: .37, radius: 1.2, oval: .8, roll: 18, span: .17,
    profile: createTrunkSectionProfile().map((point, i) => ({ ...point, radius: [1.2, 1, .9, .8, 1, 1.1, 1.2, 1.1][i] })) });
  const before = normalizeAuthoring(legacy), asset = f.build(before), original = surface(asset).geometry.clone(); geometries.push(original);
  const buffers = sampleBuffers(asset), skeleton = createPVESkeleton(asset, f.leaves);
  const next = normalizeAuthoring(before);
  next.workbench.trunk_forms.branches.ROOT = createDirectTrunkForm(before.workbench.trunk_forms.branches.ROOT);
  const authored = normalizeAuthoring(next), form = authored.workbench.trunk_forms.branches.ROOT;
  assert.equal(isDirectTrunkForm(form), true);
  assert.equal(authored.workbench.trunk_forms.version, 2);
  assert.deepEqual(form.legacy_form, before.workbench.trunk_forms.branches.ROOT);
  assert.equal(canUpdateSupports(before, authored, new Set(['ROOT'])), true);
  assert.equal(asset.updateSupportingBranches(f.settings, authored), true);
  assertSamplesUnchanged(buffers);
  assert.deepEqual(createPVESkeleton(asset, f.leaves), skeleton);
  assert.deepEqual(authored.branch_library, before.branch_library);
  assert.deepEqual(authored.branch_instances, before.branch_instances);

  const checkpoint = JSON.stringify(asset.authoring), carrierGeometry = surface(asset).geometry;
  const carrier = asset.masterBranches.find(branch => branch.stableId === 'ROOT');
  const preview = createTrunkFormPreviewGeometry(carrier, f.settings, form, 0, { view: 'BASE' }); geometries.push(preview);
  assert.equal(equalGeometry(preview, carrierGeometry), false, 'base preview omits explicit surface detail');
  assert.equal(surface(asset).geometry, carrierGeometry, 'read-only preview never replaces committed carrier geometry');
  assert.equal(JSON.stringify(asset.authoring), checkpoint);
  assertSamplesUnchanged(buffers);

  const folder = new URL('../.runtime/trunk-state-pipeline/', import.meta.url), file = new URL('direct-roundtrip.branch.json', folder);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(createProjectDocument(asset, f.leaves, authored)));
  const fresh = migrateProjectDocument(JSON.parse(fs.readFileSync(file, 'utf8'))), rebuilt = f.build(fresh.authoring);
  assert.deepEqual(fresh.authoring.workbench.trunk_forms, authored.workbench.trunk_forms);
  assert.equal(equalGeometry(surface(rebuilt).geometry, carrierGeometry), true);
  assert.deepEqual(createPVESkeleton(rebuilt, f.leaves), skeleton);
  assert.deepEqual(fresh.authoring.branch_library, before.branch_library);
  assert.deepEqual(fresh.authoring.branch_instances, before.branch_instances);

  assert.equal(asset.updateSupportingBranches(f.settings, before), true);
  assert.equal(equalGeometry(surface(asset).geometry, original), true, 'legacy recipe remains available for an exact undo');
  assertSamplesUnchanged(buffers);
});

test('mixed legacy and direct branch recipes survive project normalization and saved-document migration without upgrading other branches', () => {
  const legacy = createTrunkFormPreset('BUTTRESS'), direct = createDirectTrunkForm();
  direct.sections.push({ id: 'DIRECT_RING', t: .5, radius: 1.3, oval: 1.1, roll: -20, span: .18 });
  const authoring = normalizeAuthoring({ workbench: { trunk_forms: { version: 2, branches: { OLD: legacy, NEW: direct } } } });
  assert.deepEqual(authoring.workbench.trunk_forms.branches.OLD, legacy);
  assert.equal(Object.hasOwn(authoring.workbench.trunk_forms.branches.OLD, 'geometry_version'), false);
  const document = migrateProjectDocument(JSON.parse(JSON.stringify({ format: 'ProceduralBranchProject', version: 4, settings: { seed: 42 }, authoring })));
  assert.deepEqual(document.authoring.workbench.trunk_forms, authoring.workbench.trunk_forms);
  assert.equal(isDirectTrunkForm(document.authoring.workbench.trunk_forms.branches.NEW), true);
});
