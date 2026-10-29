import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRuntimeTestDirectory} from './runtime-test-directory.mjs';
import {readImportedTrunkGlb} from '../web/imported-trunk-glb.js';
import {prepareImportedTrunk,importedTrunkShape} from '../web/imported-trunk-runtime.js';
import {trunkSurfaceAnchor,evaluateTrunkAnchor} from '../web/imported-trunk-data.js';
import {normalizeSettings} from '../web/branch-kernel.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {spawnSync} from 'node:child_process';
import {validatePackage} from '../scripts/pve-package.mjs';
import {validatePVESkeleton} from '../web/pve-skeleton-export.js';
const tool=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// GLTFExporter runs in the browser in the application; provide its Blob reader
// when exercising that same exporter from this Node integration test.
globalThis.FileReader||=class{async readAsArrayBuffer(blob){this.result=await blob.arrayBuffer();this.onloadend?.();}async readAsDataURL(blob){this.result='data:'+blob.type+';base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onloadend?.();}};
async function model(){return prepareImportedTrunk(await readImportedTrunkGlb(fs.readFileSync(path.join(tool,'web/assets/models/QiaoDunTest.glb'))));}
async function deliver(t,document){
 const directory=createRuntimeTestDirectory(t,'imported-trunk-pve-'),output=path.join(directory,'package'),input=path.join(directory,'input.branch.json'),status=path.join(directory,'status.json'),sourceBytes=Buffer.from(JSON.stringify({format:'ProceduralBranchProject',...document}));fs.writeFileSync(input,sourceBytes);
 const run=spawnSync(process.execPath,['--experimental-loader','./vendor-loader.mjs',path.join(tool,'scripts/export-pve-complete-units.mjs'),'--tool',tool,'--project',input,'--out',output,'--geometry','--status',status],{cwd:tool,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
 assert.equal(run.status,0,run.stderr+'\n'+run.stdout);const result=JSON.parse(fs.readFileSync(status,'utf8'));assert.equal(result.state,'succeeded');const checked=validatePackage(output,sourceBytes),read=name=>JSON.parse(fs.readFileSync(path.join(output,name),'utf8'));fs.writeFileSync(path.join(directory,'proof.json'),JSON.stringify({result,checked,entry:'desktop CLI --geometry'}));return {result,checked,skeleton:read('whole.pve-skeleton.json'),resolved:read('whole.resolved.json'),manifest:read('complete_units.manifest.json')};
}
test('desktop CLI exports a bare textured imported trunk with an empty unit library',async t=>{
 const asset=await model(),{shape,mount}=importedTrunkShape(asset),settings=normalizeSettings({object_name:'纯外部树干',leaf_density:0,max_leaves:0,child_count:0,buds_enabled:false,fruit_enabled:false,branch_levels:3}),authoring=normalizeAuthoring({branch_shape:shape,imported_trunks:{version:1,assets:[asset],mounts:[mount]},recipe:{tags:['WHOLE_PLANT','FOLIAGE_ON_INSTANCES_ONLY']}}),document={version:4,settings,authoring,leaf_meshes:[]},proof=await deliver(t,document);
 assert.equal(proof.skeleton.version,3);assert.deepEqual(proof.skeleton.foliage,[]);assert.deepEqual(proof.skeleton.foliage_sources,[]);assert.equal(proof.manifest.max_relative_radius_error,0);assert.equal(proof.manifest.p95_relative_radius_error,0);assert.equal(proof.result.sources,0);assert.equal(proof.resolved.chunks.reduce((sum,c)=>sum+c.index_count/3,0),asset.triangles);assert(proof.resolved.imported_trunk_materials.materials[0].maps.baseColor);
 const bad=structuredClone(proof.skeleton);bad.required_capabilities.push('future_unsupported');assert.equal(validatePVESkeleton(bad).valid,false);const broken=structuredClone(proof.skeleton);broken.imported_trunks.mounts[0].guide_map.G0='missing';assert.equal(validatePVESkeleton(broken).valid,false);
});
test('desktop CLI exports deformed surface attachments as two reusable complete instances',async t=>{
 const file=path.join(tool,'次枝资产/全植物次枝成品V1/香樟/香樟_短弯细梢_混合_成品V1.branchasset.json'),unit=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')).asset,asset=await model(),height=asset.guides[0].points.at(-1)[2];asset.guides[0].points=Array.from({length:7},(_,i)=>[0,0,height*i/6]);const {shape,mount}=importedTrunkShape(asset);mount.binding='FLEX';shape.branches[0].points=shape.branches[0].points.map(p=>[p[2]*p[2]/height*.15,p[1],p[2]]);shape.branches[0].knots=shape.branches[0].points;
 const instances=[12,57].map((face,i)=>{const anchor=trunkSurfaceAnchor(asset,asset.primitives[0].id,face,[.2,.3,.5],{offset:-.005,guideId:'G0'}),hit=evaluateTrunkAnchor(asset,anchor);return {id:'SURFACE_'+i,asset_id:unit.id,linked:true,pinned_revision:unit.revision,parent:mount.guide_map.G0,attach:hit.guide.t,scale:.5,variation:0,seed:i+1,roll:i*45,trunk_anchor:{...anchor,mount_id:mount.id},frame:{position:hit.position.toArray(),direction:hit.normal.toArray(),parent_position:hit.guide.point.toArray(),parent_tangent:[0,0,1]}};});
 const settings=normalizeSettings({...unit.sample.settings,object_name:'外部树干完整枝',leaf_density:0,max_leaves:0,child_count:0,buds_enabled:false,fruit_enabled:false,branch_levels:3}),authoring=normalizeAuthoring({branch_shape:shape,branch_library:[unit],branch_instances:instances,leaf_material:unit.sample.authoring.leaf_material,imported_trunks:{version:1,assets:[asset],mounts:[mount]},recipe:{tags:['WHOLE_PLANT','SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']}}),proof=await deliver(t,JSON.parse(JSON.stringify({version:4,settings,authoring,leaf_meshes:unit.sample.leaf_meshes})));
 assert.equal(proof.skeleton.foliage.length,2);assert.equal(proof.skeleton.foliage_sources.length,1);assert.equal(proof.skeleton.complete_unit_assembly.leaf_instances,0);assert.equal(proof.skeleton.complete_unit_assembly.organ_instances,0);assert(proof.result.max_root_error_m<1e-6);assert.equal(proof.manifest.units[0].instance_count,2);assert(!proof.manifest.units[0].variant_kind,'surface deformation created private unit geometry');
});

test('desktop CLI still rejects a structural-only project with neither imported trunk nor complete units',t=>{
 const directory=createRuntimeTestDirectory(t,'imported-trunk-pve-'),input=path.join(directory,'input.branch.json'),output=path.join(directory,'package'),status=path.join(directory,'status.json');
 const settings=normalizeSettings({leaf_density:0,max_leaves:0,child_count:0,buds_enabled:false,fruit_enabled:false}),authoring=normalizeAuthoring({branch_shape:{version:1,branches:[{id:'MAIN',parent:null,points:[[0,0,0],[0,0,1]],knots:[[0,0,0],[0,0,1]],length:1,start_radius:.1,end_radius:.02,attach:0}]}});
 fs.writeFileSync(input,JSON.stringify({format:'ProceduralBranchProject',version:4,settings,authoring,leaf_meshes:[]}));
 const run=spawnSync(process.execPath,['--experimental-loader','./vendor-loader.mjs',path.join(tool,'scripts/export-pve-complete-units.mjs'),'--project',input,'--out',output,'--geometry','--status',status],{cwd:tool,encoding:'utf8',timeout:180000});
 assert.notEqual(run.status,0);const result=JSON.parse(fs.readFileSync(status,'utf8'));assert.equal(result.state,'failed');assert.match(result.detail,/没有可交付的完整成品枝实例/);assert.equal(fs.existsSync(output),false);
 fs.writeFileSync(path.join(directory,'proof.json'),JSON.stringify({passed:true,detail:result.detail}));
});
