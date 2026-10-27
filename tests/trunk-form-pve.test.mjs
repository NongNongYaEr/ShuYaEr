import {refineDirectTrunkSectionProfile,updateTrunkSectionJoinTangents,trunkSectionEllipseRadius} from '../web/trunk-form.js';
import {removeTrunkSectionPoints} from '../web/trunk-section-point-edit.js';
import {prepareTrunkRootBase,trunkRootBaseSection} from '../web/trunk-root-base.js';
import * as THREE from 'three';
import {excludeRemovedTrunkChildren} from '../web/trunk-child-edit-layer.js';
import {wholeTrunkSurfaceSampler} from '../web/trunk-whole-contour.js';
import test from 'node:test';
import { createRuntimeTestDirectory } from './runtime-test-directory.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { normalizeSettings } from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { createTrunkFormPreset, createTrunkSectionProfile, createDirectTrunkForm } from '../web/trunk-form.js';
import { createTrunkMeshPreset } from '../web/trunk-mesh-density.js';
import {TRUNK_DETAIL_PROFILES} from '../web/trunk-detail-profile.js';
import {WHOLE_TRUNK_CONTOUR_PRESETS} from '../web/trunk-whole-contour.js';
import {trunkSectionMainPoints,editTrunkSectionLayer} from '../web/trunk-section-layers.js';
import { TRUNK_DETAIL_COMBINATIONS } from '../web/trunk-detail-presets.js';
import { placeTrunkDetailPreset, redrawTrunkDetail, moveTrunkDetailPathPoint } from '../web/trunk-detail-edit.js';
import { validatePackage, hash } from '../scripts/pve-package.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const names = ['紧凑侧枝_深绿', '紧凑侧枝_混合', '紧凑侧枝_嫩绿', '短弯细梢_深绿', '短弯细梢_混合', '短弯细梢_嫩绿'];

test('legacy and direct bent trunk contours reach complete PVE packages while six reusable camphor models and all instance geometry remain exact', { timeout: 180000 }, t => {
  const library = names.map(name => read(path.join('次枝资产/全植物次枝成品V1/香樟', `香樟_${name}_成品V1.branchasset.json`)).asset);
  const sources = [...new Map(library.flatMap(item => item.sample.leaf_meshes).map(source => [source.id, source])).values()];
  const authoring = normalizeAuthoring({
    branch_shape: { branches: [{ id: 'ROOT', parent: '',
      points: [[0, 0, 0], [.12, -.1, 2], [.65, .2, 4], [1, .4, 6], [1.45, .25, 8]],
      length: 8.3, start_radius: .4, end_radius: .12 }] },
    branch_library: library,
    branch_instances: library.map((item, n) => ({ id: 'I' + n, asset_id: item.id, linked: true, pinned_revision: item.revision,
      parent: 'ROOT', attach: .16 + n * .135, scale: .8 + n * .1, angle: 65, azimuth: n * 59, roll: n * 17, seed: 321 + n, variation: 0,
      ...(n === 2 ? { assembly_refined: true, frame: { position: [.5, .1, 3.4], direction: [.7, .2, -.4], parent_tangent: [0, 0, 1], parent_position: [.4, .15, 3.4] } } : {}) })),
    leaf_material: library[0].sample.authoring.leaf_material,
    recipe: { tags: ['WHOLE_PLANT', 'SAMPLE_FOLIAGE_FROM_LIBRARY', 'FOLIAGE_ON_INSTANCES_ONLY'] },
  });
  const settings = normalizeSettings({ ...library[0].sample.settings, object_name: '香樟主干形体验收', leaf_density: 0, max_triangles: 8000000, preview_lod: 0 });
  const folder = createRuntimeTestDirectory(t, 'trunk-form-pve-');
  const exportPackage = (name, authored) => {
    const file = path.join(folder, name + '.branch.json'), out = path.join(folder, name + '_PVE_Complete');
    fs.writeFileSync(file, JSON.stringify({ format: 'ProceduralBranchProject', version: 4, settings, authoring: authored, leaf_meshes: sources }));
    const sourceBytes = fs.readFileSync(file);
    const cli = spawnSync(process.execPath, ['--experimental-loader', './tests/vendor-loader.mjs', './scripts/export-pve-complete-units.mjs',
      '--tool', '.', '--project', file, '--out', out, '--geometry'], { encoding: 'utf8', timeout: 60000, maxBuffer: 2000000, windowsHide: true });
    fs.writeFileSync(path.join(folder, name + '.log'), cli.stdout + cli.stderr);
    assert.equal(cli.status, 0, cli.stderr || cli.stdout);
    const validation = validatePackage(out, sourceBytes);
    assert.equal(validation.valid, true); assert.deepEqual(validation.errors, []);
    assert.equal(hash(fs.readFileSync(file)), hash(sourceBytes), 'CLI leaves authored project unchanged');
    return { out, validation, skeleton: read(path.join(out, 'whole.pve-skeleton.json')),
      manifest: read(path.join(out, 'complete_units.manifest.json')), resolved: read(path.join(out, 'whole.resolved.json')),
      binary: fs.readFileSync(path.join(out, 'whole.resolved.bin')) };
  };
  const baseline = exportPackage('baseline', authoring), changed = normalizeAuthoring(authoring);
  const form = createTrunkFormPreset('BUTTRESS');
  form.sections.push({ id: 'RING_MID', t: .48, radius: 1.35, oval: .85, roll: 30, span: .15,
    profile: createTrunkSectionProfile().map((point, n) => ({ ...point, radius: [.65, 1.1, 2.3, 1.4, .8, .35, 1.2, 1.7][n] })) });
  form.buttresses[1].angle += 18; form.buttresses[1].length += .45;
  changed.workbench = { ...changed.workbench, trunk_forms: { version: 1, branches: { ROOT: form } } };
  const edited = exportPackage('buttress_ring', normalizeAuthoring(JSON.parse(JSON.stringify(changed))));

  assert.deepEqual(edited.skeleton.branches, baseline.skeleton.branches, 'carrier centreline and legacy radii stay unchanged');
  assert.deepEqual(edited.skeleton.foliage, baseline.skeleton.foliage, 'all complete-instance transforms, mounts and source indexes stay unchanged');
  assert.deepEqual(edited.skeleton.foliage_sources, baseline.skeleton.foliage_sources);
  assert.equal(edited.manifest.units.length, 6); assert.equal(edited.skeleton.foliage.length, 6);
  assert.deepEqual(edited.manifest.units.map(unit => unit.id).sort(), library.map(unit => unit.id).sort());
  assert.equal(edited.skeleton.complete_unit_assembly.leaf_instances, 0);
  assert.equal(edited.skeleton.complete_unit_assembly.organ_instances, 0);
  assert.equal(edited.skeleton.complete_unit_assembly.source_mesh_count, 6);
  assert.equal(edited.skeleton.complete_unit_assembly.unit_count, 6);
  assert.ok(edited.skeleton.complete_unit_assembly.baked_unit_leaves > 0);
  for (const unit of edited.manifest.units) {
    const previous = baseline.manifest.units.find(item => item.id === unit.id);
    assert.equal(unit.glb_sha256, previous.glb_sha256, 'one existing source GLB reused: ' + unit.id);
    assert.equal(unit.triangles, previous.triangles); assert.equal(unit.instance_count, previous.instance_count); assert.ok(!unit.variant_kind);
    const bytes = fs.readFileSync(path.join(edited.out, unit.glb)), json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    assert.equal(json.meshes.length, 1); assert.equal(json.nodes.length, 1);
    assert.ok(json.meshes[0].primitives.length >= 2, 'whole unit GLB contains wood and leaf material groups');
  }
  const chunkBytes = (delivery, chunk) => delivery.binary.subarray(chunk.vertex_offset, chunk.index_offset + chunk.index_count * 4);
  const units = delivery => delivery.resolved.chunks.filter(chunk => chunk.instance_index >= 0).map(chunk => ({
    owner: [chunk.instance_index, chunk.source_index, chunk.host_branch_id, chunk.material_role],
    vertices: chunk.vertex_count, indices: chunk.index_count, color: chunk.color_linear, geometry: hash(chunkBytes(delivery, chunk)),
  }));
  assert.deepEqual(units(edited), units(baseline), 'world-space positions, normals, UVs, tangents and triangles of every complete instance are exact');
  const carriers = delivery => delivery.resolved.chunks.filter(chunk => chunk.instance_index === -1 && chunk.host_branch_id === 'ROOT');
  assert.ok(carriers(baseline).length > 0 && carriers(edited).length > 0);
  const carrierHash = delivery => hash(Buffer.concat(carriers(delivery).map(chunk => chunkBytes(delivery, chunk))));
  assert.notEqual(carrierHash(edited), carrierHash(baseline), 'actual resolved carrier geometry includes buttress and local ring changes');
  const lowBounds = delivery => {
    const bounds = { min: [Infinity, Infinity], max: [-Infinity, -Infinity] };
    for (const chunk of carriers(delivery)) for (let vertex = 0; vertex < chunk.vertex_count; vertex++) {
      const offset = chunk.vertex_offset + vertex * 48;
      if (delivery.binary.readFloatLE(offset + 8) > 1) continue;
      for (let axis = 0; axis < 2; axis++) {
        const value = delivery.binary.readFloatLE(offset + axis * 4);
        bounds.min[axis] = Math.min(bounds.min[axis], value); bounds.max[axis] = Math.max(bounds.max[axis], value);
      }
    }
    return bounds;
  };
  const oldBase = lowBounds(baseline), newBase = lowBounds(edited);
  assert.ok([0, 1].some(axis => newBase.max[axis] - newBase.min[axis] > (oldBase.max[axis] - oldBase.min[axis]) * 1.5), 'exported trunk base has larger visible buttress span');
  assert.equal(edited.resolved.summary.leaves, baseline.resolved.summary.leaves);
  assert.equal(edited.resolved.summary.organs, baseline.resolved.summary.organs);
  fs.writeFileSync(path.join(folder, '验收.json'), JSON.stringify({ passed: true, classes: 6, instances: 6,
    source_glb_hashes_unchanged: true, complete_instance_geometry_unchanged: true, complete_instance_transforms_unchanged: true,
    carrier_geometry_changed: true, local_profile_edited: true, baseline: baseline.validation, edited: edited.validation }, null, 2));
  console.log('主干形体完整 PVE 包验收: ' + folder);

  const localAuthoring=normalizeAuthoring(changed);
  localAuthoring.workbench.trunk_forms.branches.ROOT.sections[0].roll_offset=47;
  const local=exportPackage('legacy_independent_rotation',normalizeAuthoring(JSON.parse(JSON.stringify(localAuthoring))));
  assert.deepEqual(local.skeleton.branches,edited.skeleton.branches,'independent legacy rotation keeps PVE skeleton fields, coordinates and units');
  assert.deepEqual(local.skeleton.foliage,edited.skeleton.foliage);
  assert.deepEqual(units(local),units(edited),'independent legacy rotation preserves complete unit geometry and instance transforms');
  assert.deepEqual(local.manifest.units.map(u=>[u.id,u.glb_sha256]),edited.manifest.units.map(u=>[u.id,u.glb_sha256]));
  assert.notEqual(carrierHash(local),carrierHash(edited),'exported carrier mesh includes the saved independent legacy rotation');

  const directAuthoring = normalizeAuthoring(authoring), directForm = createDirectTrunkForm(form);
  directForm.sections.push({ id: 'DIRECT_SECOND', t: .72, radius: .95, oval: 1.1, roll: -12, span: .18,
    profile: createTrunkSectionProfile(12).map((point, i) => ({ ...point, radius: 1 + .12 * Math.cos(i * Math.PI / 3) })) });
  directAuthoring.workbench = { ...directAuthoring.workbench, trunk_forms: { version: 2, branches: { ROOT: directForm } } };
  const direct = exportPackage('direct_sections', normalizeAuthoring(JSON.parse(JSON.stringify(directAuthoring))));
  assert.deepEqual(direct.skeleton.branches, baseline.skeleton.branches, 'direct contours preserve the established PVE skeleton');
  assert.deepEqual(direct.skeleton.foliage, baseline.skeleton.foliage, 'direct contours preserve all whole-unit instance transforms');
  assert.deepEqual(direct.skeleton.foliage_sources, baseline.skeleton.foliage_sources);
  assert.equal(direct.skeleton.complete_unit_assembly.leaf_instances, 0);
  assert.equal(direct.skeleton.complete_unit_assembly.organ_instances, 0);
  assert.equal(direct.manifest.units.length, 6);
  for (const unit of direct.manifest.units) {
    const old = baseline.manifest.units.find(item => item.id === unit.id);
    assert.equal(unit.glb_sha256, old.glb_sha256, 'DIRECT reuses complete source model ' + unit.id);
    assert.equal(unit.instance_count, old.instance_count);
    assert.ok(!unit.variant_kind);
  }
  assert.deepEqual(units(direct), units(baseline), 'DIRECT keeps all resolved whole-unit geometry, UVs and materials exact');
  assert.notEqual(carrierHash(direct), carrierHash(baseline), 'resolved sidecar contains the actual direct-section trunk surface');
  assert.equal(direct.resolved.summary.leaves, baseline.resolved.summary.leaves);
  assert.equal(direct.resolved.summary.organs, baseline.resolved.summary.organs);
  const baseAuthoring=normalizeAuthoring(directAuthoring),baseForm=prepareTrunkRootBase(directForm).form,baseCircle=trunkRootBaseSection(baseForm);
  baseCircle.profile=createTrunkSectionProfile(64).map((p,i)=>({...p,radius:1+.12*Math.cos(i*Math.PI/16)}));
  baseCircle.profile_coarse=trunkSectionMainPoints(baseCircle);baseCircle.profile[5].radius*=1.015;
  baseAuthoring.workbench.trunk_forms.branches.ROOT=baseForm;
  const rootBase=exportPackage('root_base_points',normalizeAuthoring(JSON.parse(JSON.stringify(baseAuthoring))));
  assert.deepEqual(rootBase.skeleton.branches,baseline.skeleton.branches,'root circle keeps established skeleton coordinates, units and fields');
  assert.deepEqual(rootBase.skeleton.foliage,baseline.skeleton.foliage);
  assert.deepEqual(rootBase.skeleton.foliage_sources,baseline.skeleton.foliage_sources);
  assert.deepEqual(units(rootBase),units(baseline),'root point edits preserve complete-unit resolved geometry and transforms');
  assert.deepEqual(rootBase.manifest.units.map(u=>[u.id,u.glb_sha256]),baseline.manifest.units.map(u=>[u.id,u.glb_sha256]));
  assert.notEqual(carrierHash(rootBase),carrierHash(direct),'resolved carrier contains the edited base circle');
  assert.equal(rootBase.skeleton.complete_unit_assembly.leaf_instances,0);assert.equal(rootBase.skeleton.complete_unit_assembly.organ_instances,0);
  const horizontalAuthoring=normalizeAuthoring(baseAuthoring);horizontalAuthoring.workbench.trunk_forms.branches.ROOT.root_plane='HORIZONTAL';
  const horizontal=exportPackage('horizontal_root_plane',normalizeAuthoring(JSON.parse(JSON.stringify(horizontalAuthoring))));
  assert.deepEqual(horizontal.skeleton.branches,baseline.skeleton.branches,'root leveling preserves skeleton, units and axes');
  assert.deepEqual(horizontal.skeleton.foliage,baseline.skeleton.foliage);
  assert.deepEqual(horizontal.skeleton.foliage_sources,baseline.skeleton.foliage_sources);
  assert.deepEqual(units(horizontal),units(baseline),'horizontal root planes do not change any complete-unit vertices, UVs or transforms');
  assert.deepEqual(horizontal.manifest.units.map(u=>[u.id,u.glb_sha256]),baseline.manifest.units.map(u=>[u.id,u.glb_sha256]));
  assert.notEqual(carrierHash(horizontal),carrierHash(rootBase),'the resolved sidecar stores the actually leveled carrier');
  assert.equal(horizontal.resolved.coordinate_system,'UE_centimeter_X_negativeY_Z');
  const rootChunk=carriers(horizontal)[0];assert.ok(rootChunk.vertex_count>=64);
  // The delivery splits vertices and flips V. Identify the base by axial V=1,
  // rather than assuming its first vertices form a contiguous indexed ring.
  const rootZ=[];for(let i=0;i<rootChunk.vertex_count;i++){const at=rootChunk.vertex_offset+i*48;if(Math.abs(horizontal.binary.readFloatLE(at+28)-1)<1e-8)rootZ.push(horizontal.binary.readFloatLE(at+8));}
  assert.ok(rootZ.length>=64);
  assert.ok(Math.max(...rootZ)-Math.min(...rootZ)<1e-5,'the exported root-ring vertices are coplanar in UE centimeters');
  const cornerAuthoring=normalizeAuthoring(horizontalAuthoring);
  cornerAuthoring.sculpt_layers.push({id:'SLIDE_CLOSE',enabled:true,strength:1,branches:{},operation:{type:'POINT_SLIDE',root:'ROOT',targets:['ROOT'],point:2,attach:.255}},
    {id:'TIGHT_CORNER',enabled:true,strength:1,branches:{},operation:{type:'POINT_ROTATE',sampling_version:2,root:'ROOT',targets:['ROOT'],point:2,rotation:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.6).toArray()}});
  const corner=exportPackage('control_aligned_corner',normalizeAuthoring(JSON.parse(JSON.stringify(cornerAuthoring))));
  assert.equal(corner.resolved.coordinate_system,horizontal.resolved.coordinate_system);
  assert.deepEqual(corner.manifest.units.map(u=>[u.id,u.glb_sha256,u.instance_count]),horizontal.manifest.units.map(u=>[u.id,u.glb_sha256,u.instance_count]),'tight bends reuse each complete source GLB and its instance count');
  assert.equal(corner.skeleton.complete_unit_assembly.leaf_instances,0);assert.equal(corner.skeleton.complete_unit_assembly.organ_instances,0);
  assert.notEqual(carrierHash(corner),carrierHash(horizontal));
  const carrier=corner.skeleton.branches.find(b=>b.id==='ROOT');assert.ok(carrier.points.some(p=>Math.abs(p.t-.255)<1e-10),'PVE keeps the exact moved control parameter');
  assert.ok(carrier.points.filter(p=>p.t>=.255-1e-10&&p.t<=.26+1e-10).length>=6,'PVE retains the local transition samples');
  const sourceChunks=delivery=>delivery.resolved.chunks.filter(c=>c.instance_index>=0),oldChunks=sourceChunks(horizontal),newChunks=sourceChunks(corner);
  assert.equal(newChunks.length,oldChunks.length);
  for(let k=0;k<newChunks.length;k++){
    const a=oldChunks[k],b=newChunks[k];assert.deepEqual([a.instance_index,a.source_index,a.vertex_count,a.index_count],[b.instance_index,b.source_index,b.vertex_count,b.index_count]);
    for(let i=0;i<b.vertex_count;i++)for(const offset of [24,28])assert.equal(corner.binary.readFloatLE(b.vertex_offset+i*48+offset),horizontal.binary.readFloatLE(a.vertex_offset+i*48+offset),'source UVs stay exact');
    const distance=(delivery,chunk,i,j)=>Math.hypot(...[0,4,8].map(offset=>delivery.binary.readFloatLE(chunk.vertex_offset+i*48+offset)-delivery.binary.readFloatLE(chunk.vertex_offset+j*48+offset)));
    for(let i=1;i<Math.min(b.vertex_count,100);i++){const before=distance(horizontal,a,i-1,i),after=distance(corner,b,i-1,i);assert.ok(Math.abs(before-after)<Math.max(.002,before*2e-5),'each complete unit moves rigidly, keeping its geometry and scale');}
  }
  const nodeAuthoring=normalizeAuthoring(horizontalAuthoring),sourceRoot=nodeAuthoring.branch_shape.branches.find(b=>b.id==='ROOT'),nodeKnots=sourceRoot.knots.map(p=>[...p]);
  nodeKnots[1][0]+=.15;nodeKnots[2][1]+=.12;
  nodeAuthoring.sculpt_layers.push({id:'CONTROLLED',enabled:true,strength:1,branches:{},operation:{type:'CONTROL_CURVE',root:'ROOT',targets:['ROOT'],knots:nodeKnots,protect_units:true}});
  const controlled=exportPackage('control_driven_curve',normalizeAuthoring(JSON.parse(JSON.stringify(nodeAuthoring))));
  assert.equal(controlled.resolved.coordinate_system,horizontal.resolved.coordinate_system);
  assert.deepEqual(controlled.manifest.units.map(u=>[u.id,u.glb_sha256,u.instance_count]),horizontal.manifest.units.map(u=>[u.id,u.glb_sha256,u.instance_count]),'control curves keep complete model reuse and instance counts');
  assert.equal(controlled.skeleton.complete_unit_assembly.leaf_instances,0);assert.equal(controlled.skeleton.complete_unit_assembly.organ_instances,0);assert.notEqual(carrierHash(controlled),carrierHash(horizontal));
  const controlledRoot=controlled.skeleton.branches.find(b=>b.id==='ROOT');for(const p of nodeKnots)assert.ok(controlledRoot.points.some(q=>Math.hypot(...q.position_m.map((v,i)=>v-p[i]))<1e-7),'exported skeleton passes through each actual control');
  const controlledChunks=sourceChunks(controlled);assert.equal(controlledChunks.length,oldChunks.length);
  for(let k=0;k<controlledChunks.length;k++){
    const a=oldChunks[k],b=controlledChunks[k];assert.deepEqual([a.instance_index,a.source_index,a.vertex_count,a.index_count],[b.instance_index,b.source_index,b.vertex_count,b.index_count]);
    for(let i=0;i<b.vertex_count;i++)for(const offset of [24,28])assert.equal(controlled.binary.readFloatLE(b.vertex_offset+i*48+offset),horizontal.binary.readFloatLE(a.vertex_offset+i*48+offset));
    const distance=(delivery,chunk,i,j)=>Math.hypot(...[0,4,8].map(offset=>delivery.binary.readFloatLE(chunk.vertex_offset+i*48+offset)-delivery.binary.readFloatLE(chunk.vertex_offset+j*48+offset)));
    for(let i=1;i<Math.min(b.vertex_count,100);i++){const x=distance(horizontal,a,i-1,i),y=distance(controlled,b,i-1,i);assert.ok(Math.abs(x-y)<Math.max(.002,x*2e-5),'control curves move complete source units rigidly');}
  }
  fs.writeFileSync(path.join(folder,'控制点驱动PVE验收.json'),JSON.stringify({passed:true,source_glb_hashes_unchanged:true,source_uvs_unchanged:true,whole_units_rigid:true,skeleton_through_controls:true,coordinate_system:controlled.resolved.coordinate_system,validation:controlled.validation},null,2));
  fs.writeFileSync(path.join(folder, '直接截面验收.json'), JSON.stringify({ passed: true, classes: 6, instances: 6,
    source_glb_hashes_unchanged: true, complete_instance_geometry_unchanged: true, complete_instance_transforms_unchanged: true,
    direct_carrier_geometry_changed: true, validation: direct.validation }, null, 2));
  const refinedAuthoring=normalizeAuthoring(directAuthoring);
  refinedAuthoring.workbench.trunk_forms.branches.ROOT.mesh=createTrunkMeshPreset();
  refinedAuthoring.workbench.trunk_forms.branches.ROOT.sections.push({id:'WHOLE_WRINKLED_RING',t:.38,span:.18,...structuredClone(WHOLE_TRUNK_CONTOUR_PRESETS[2].shape)});
  const layeredRing=refinedAuthoring.workbench.trunk_forms.branches.ROOT.sections.at(-1),main=trunkSectionMainPoints(layeredRing);
  Object.assign(layeredRing,editTrunkSectionLayer(layeredRing,main.map((p,i)=>({...p,radius:p.radius*(i===2?1.06:1)})),{main:true}));
  Object.assign(layeredRing,editTrunkSectionLayer(layeredRing,layeredRing.profile.map((p,i)=>({...p,radius:p.radius*(i===5?1.015:1)}))));
  assert.equal(layeredRing.profile_coarse.length,10);assert.equal(layeredRing.profile.length,96);
  layeredRing.profile=refineDirectTrunkSectionProfile(layeredRing.profile);layeredRing.profile_exclusions=[{start:310,end:340}];
  assert.ok(normalizeAuthoring(refinedAuthoring).workbench.trunk_forms.branches.ROOT.sections.find(s=>s.id===layeredRing.id).profile.every(p=>Number.isFinite(p.tangent)));
  refinedAuthoring.workbench.trunk_forms.branches.ROOT.details=[{id:'SMALL_SCAR',type:'SCAR',t:.5039,angle:1.875,width:8,height:.02,strength:.2,seed:1},
    {id:'SMALL_WRINKLE',type:'WRINKLE',t:.61,angle:355,width:12,height:.025,strength:.09,seed:9}];
  for(const [index,id]of ['builtin-fine-crack','builtin-small-scar','builtin-knot-cluster'].entries()){
    const preset=TRUNK_DETAIL_COMBINATIONS.find(p=>p.id===id);
    refinedAuthoring.workbench.trunk_forms.branches.ROOT.details.push(...placeTrunkDetailPreset(preset.shape,{t:.25+index*.22,angle:355+index*70},preset.shape.details.map((_,i)=>'COMBO_'+index+'_'+i)));
  }
  const rewritten=redrawTrunkDetail(refinedAuthoring.workbench.trunk_forms.branches.ROOT.details[0],{t:.54,angle:7});
  rewritten.path=[{t:.5,angle:3,pressure:.8},{t:.54,angle:7,pressure:1},{t:.57,angle:11,pressure:.6}];
  rewritten.width=2.5;rewritten.height=.002;
  rewritten.profile=structuredClone(TRUNK_DETAIL_PROFILES.find(p=>p.id==='ROLLED_EDGE').shape);
  refinedAuthoring.workbench.trunk_forms.branches.ROOT.details[0]=moveTrunkDetailPathPoint(rewritten,1,{t:.545,angle:8});
  const refinedForm=refinedAuthoring.workbench.trunk_forms.branches.ROOT,beforeDeletion=layeredRing.profile;
  refinedForm.loft_interpolation='SMOOTH';
  layeredRing.profile=removeTrunkSectionPoints(beforeDeletion,beforeDeletion.filter(p=>p.angle>215&&p.angle<252).map(p=>p.id));
  layeredRing.profile_exclusions=excludeRemovedTrunkChildren(layeredRing,beforeDeletion,layeredRing.profile);
  const deletionSurface=wholeTrunkSurfaceSampler(refinedForm,layeredRing,settings);
  layeredRing.profile=updateTrunkSectionJoinTangents(layeredRing.profile,beforeDeletion,{exclusions:layeredRing.profile_exclusions,surfaceAt:a=>deletionSurface(a)*trunkSectionEllipseRadius(layeredRing.oval,a)});
  const normalizedJoined=normalizeAuthoring(refinedAuthoring).workbench.trunk_forms.branches.ROOT.sections.find(s=>s.id===layeredRing.id);
  assert.ok(normalizedJoined.profile_exclusions.some(r=>r.join==='SMOOTH'));
  assert.ok(normalizedJoined.profile.some(p=>Number.isFinite(p.join_tangent)));
  const refined=exportPackage('refined_mesh',normalizeAuthoring(JSON.parse(JSON.stringify(refinedAuthoring))));
  assert.deepEqual(refined.skeleton.branches,baseline.skeleton.branches,'mesh precision adds no bones or legacy radius fields');
  assert.deepEqual(refined.skeleton.foliage,baseline.skeleton.foliage,'mesh precision does not move whole units');
  assert.deepEqual(refined.skeleton.foliage_sources,baseline.skeleton.foliage_sources);
  assert.equal(refined.resolved.coordinate_system,'UE_centimeter_X_negativeY_Z');
  assert.deepEqual(refined.skeleton.coordinate_system,baseline.skeleton.coordinate_system);
  assert.deepEqual(units(refined),units(baseline),'refined carrier preserves resolved whole-unit bytes');
  assert.equal(refined.manifest.units.length,6);
  for(const unit of refined.manifest.units)assert.equal(unit.glb_sha256,baseline.manifest.units.find(u=>u.id===unit.id).glb_sha256,'refinement keeps source GLB '+unit.id);
  assert.equal(refined.skeleton.complete_unit_assembly.leaf_instances,0);
  assert.equal(refined.skeleton.complete_unit_assembly.organ_instances,0);
  assert.notEqual(carrierHash(refined),carrierHash(direct),'actual resolved geometry includes the extra detail triangles');
  assert.ok(carriers(refined).reduce((sum,c)=>sum+c.vertex_count,0)>carriers(direct).reduce((sum,c)=>sum+c.vertex_count,0));
  fs.writeFileSync(path.join(folder,'本枝精度PVE验收.json'),JSON.stringify({passed:true,classes:6,instances:6,
    source_glb_hashes_unchanged:true,complete_instance_geometry_unchanged:true,complete_instance_transforms_unchanged:true,
    skeleton_contract_unchanged:true,coordinate_system:refined.resolved.coordinate_system,actual_refined_geometry:true,deleted_surface_arc_reconnected:true,small_detail_combinations:true,redrawn_path:true,small_cm_recipe_ranges:true,edited_path_point:true,custom_detail_profile:true,whole_wrinkled_contour:true,validation:refined.validation},null,2));
});
