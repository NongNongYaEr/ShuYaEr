import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {TRUNK_MAIN_PRESETS,TRUNK_CHILD_PRESETS} from '../web/trunk-shape-catalog.js';
import {TRUNK_DETAIL_PRESETS,TRUNK_DETAIL_COMBINATIONS,applyTrunkDetailPreset} from '../web/trunk-detail-presets.js';
import {TRUNK_DETAIL_PROFILES,normalizeTrunkDetailProfile} from '../web/trunk-detail-profile.js';
import {normalizeTrunkSectionPresetShape} from '../web/trunk-section-presets.js';
import {createDirectTrunkForm,createDirectTrunkSectionProfileSampler} from '../web/trunk-form.js';
import {applyWholeTrunkContour} from '../web/trunk-whole-contour.js';
import {createTrunkFormPreviewGeometry,normalizeSettings} from '../web/branch-kernel.js';
import {BARK_PRESETS,DEFAULT_BARK_PRESET,normalizeBarkMaterial,generateBarkTextureMaps,createBarkSurfaceMaterial,barkTextureFiles} from '../web/bark-materials.js';
import {libraryBarkCatalog} from '../web/library-bark.js';
import {filterTrunkPresetRecords} from '../web/trunk-preset-library-ui.js';
import {createPveBarkExporter} from '../scripts/pve-bark-materials.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),shapePresets=[...TRUNK_MAIN_PRESETS,...TRUNK_CHILD_PRESETS];
const branch={id:0,stableId:'ROOT',parentId:-1,order:0,length:3,startRadius:.3,endRadius:.2,points:[[0,0,0],[.1,0,1],[.6,0,3]].map(p=>new THREE.Vector3(...p)),sections:[],children:[],phase:.1,windPhase:0,windStiffness:1},settings=normalizeSettings({radial_segments:12,adaptive_tessellation:false,groove_depth:0,twist:0,section_roll:0,surface_roughness:0});

test('the expansion adds 34 distinct reusable presets while retaining existing built-in identities and ordering',()=>{
 assert.equal(TRUNK_MAIN_PRESETS.length,8);assert.equal(TRUNK_CHILD_PRESETS.length,6);assert.equal(TRUNK_DETAIL_PRESETS.length,12);assert.equal(TRUNK_DETAIL_COMBINATIONS.length,12);assert.equal(TRUNK_DETAIL_PROFILES.length,11);assert.equal(BARK_PRESETS.length,11);
 assert.equal(BARK_PRESETS[6].id,DEFAULT_BARK_PRESET.id);assert.deepEqual(TRUNK_DETAIL_PRESETS.slice(0,6).map(p=>p.id),['builtin-groove','builtin-ridge','builtin-knot','builtin-scar','builtin-flare','builtin-wrinkle']);
 const signatures=new Set();for(const record of shapePresets){const clean=normalizeTrunkSectionPresetShape(record.shape),sample=createDirectTrunkSectionProfileSampler(clean.profile);assert.equal(clean.profile.length,record.shape.profile.length);assert.ok(clean.profile.every(p=>p.radius>.4&&p.radius<3));assert.equal('t'in clean,false);assert.equal('sections'in clean,false);assert.equal('buttresses'in clean,false);signatures.add(JSON.stringify([clean.oval,Array.from({length:128},(_,i)=>Number(sample(i*Math.PI/64).toFixed(5)))]));if(clean.profile_scope==='FINAL')assert.equal(clean.profile_coarse.length,10);else assert.ok(clean.profile.length>=7&&clean.profile.length<=12);}
 assert.equal(signatures.size,14);assert.equal(new Set(shapePresets.map(p=>p.id)).size,14);
});

test('all new circle shapes build finite closed indexed skins within interactive budgets without mutating their source',()=>{
 for(const record of shapePresets){const before=JSON.stringify(record),form=createDirectTrunkForm({geometry_version:2,sections:[{...record.shape,id:'ONE',t:.4,span:.25},{...record.shape,id:'TWO',t:.7,span:.25}]}),g=createTrunkFormPreviewGeometry(branch,settings,form,0,{vertexLimit:48000});
  try{assert.ok(g.attributes.position.count<=48000);assert.ok(g.attributes.position.array.every(Number.isFinite));assert.ok(g.attributes.normal.array.every(Number.isFinite));assert.ok(g.attributes.uv.array.every(Number.isFinite));assert.ok(g.index.array.every(i=>i<g.attributes.position.count));assert.equal(g.userData.barkSurface.version,1);assert.equal(JSON.stringify(record),before);}finally{g.dispose();}}
});

test('new child presets compensate source grooves within the existing fitting limit and keep a separate editable main set',()=>{
 const source=createDirectTrunkForm({geometry_version:2,groove_depth:.15,groove_count:5,sections:[{id:'TARGET',t:.5,radius:1,oval:1,roll:0,span:.2}]}),section=source.sections[0],before=JSON.stringify(source);
 for(const p of TRUNK_CHILD_PRESETS){const r=applyWholeTrunkContour(source,section,p.shape);assert.ok(r.relative_error<.01,p.id+' fit '+r.relative_error);assert.ok(r.profile.length<=128);assert.equal(r.profile_coarse.length,10);}assert.equal(JSON.stringify(source),before);
});

test('expanded strokes and combinations allocate fresh detail identities and roundtrip the explicit profile without touching the catalog',()=>{
 for(const p of [...TRUNK_DETAIL_PRESETS,...TRUNK_DETAIL_COMBINATIONS]){const before=JSON.stringify(p);let i=0;const a=applyTrunkDetailPreset(p,{t:.4,angle:55,height:.5,width:120,idFactory:()=>('A_'+i++)}),b=applyTrunkDetailPreset(p,{idFactory:()=>('B_'+i++)});assert.ok(a.length>0&&a.length<=4);assert.equal(new Set([...a,...b].map(d=>d.id)).size,a.length+b.length);for(const d of a){assert.ok(d.height>0&&d.width>0);assert.ok(d.path.every(v=>v.t>=0&&v.t<=1));if(d.profile)assert.deepEqual(normalizeTrunkDetailProfile(d.profile),d.profile);}assert.equal(JSON.stringify(p),before);}
 for(const p of TRUNK_DETAIL_PROFILES)assert.deepEqual(normalizeTrunkDetailProfile(p.shape),p.shape);
});

test('category, tags, layer scope and favourites intersect without leaking UI metadata into shape recipes',()=>{
 const records=shapePresets.map(p=>({...p,scope:p.shape.profile_scope==='FINAL'?'FINAL':'BASE'}));assert.equal(filterTrunkPresetRecords(records,{category:'根盘板根',scope:'BASE'}).length,3);assert.deepEqual(filterTrunkPresetRecords(records,{query:'坡地',category:'根盘板根'}).map(p=>p.id),['builtin-main-root-slope']);assert.equal(filterTrunkPresetRecords(records,{category:'根盘板根',scope:'FINAL'}).length,1);assert.equal(filterTrunkPresetRecords(records,{query:'细沟',mode:'FAVORITES'},{favorites:['builtin-child-fine-cracks']}).length,1);assert.equal(normalizeTrunkSectionPresetShape(records[0].shape).category,undefined);
});

test('four library bark presets retain original source hashes, exact prepared PBR pixels, closed edges and independent texture sources',()=>{
 const sources=[],materials=[];try{for(const r of libraryBarkCatalog){assert.equal(sha(fs.readFileSync(r.source)),r.source_sha256);assert.deepEqual(normalizeBarkMaterial(JSON.parse(JSON.stringify(r.preset))).style,r.style);const maps=generateBarkTextureMaps(r.preset,512),m=createBarkSurfaceMaterial(r.preset,{continuousBark:true});materials.push(m);sources.push(m.map.source);assert.equal(m.color.getHexString(),'ffffff');for(const [slot,map]of Object.entries(maps)){assert.equal(sha(map.data),r.rgba_sha256[slot]);for(let j=0;j<512;j++)for(let c=0;c<4;c++){assert.equal(map.data[(j*512)*4+c],map.data[(j*512+511)*4+c]);assert.equal(map.data[j*4+c],map.data[(511*512+j)*4+c]);}}const again=createBarkSurfaceMaterial(r.preset);materials.push(again);assert.equal(again.map.source,m.map.source);}assert.equal(new Set(sources).size,4);assert.equal(new Set(materials.filter((_,i)=>i%2===0).map(m=>sha(m.map.image.data))).size,4);}
 finally{for(const m of materials){for(const key of ['map','normalMap','roughnessMap'])m[key].dispose();m.dispose();}}
});

test('offline PVE bindings export all four exact three-map sets through existing fields and physical UV transforms',()=>{
 const directory=fs.mkdtempSync(path.resolve('.runtime/preset-bark-pve-')),collector=createPveBarkExporter(directory),materials=[];
 try{for(const r of libraryBarkCatalog){const m=createBarkSurfaceMaterial(r.preset,{branch:{startRadius:.6},continuousBark:true,referencePerimeter:5});materials.push(m);const binding=collector.binding(m);assert.ok(binding.material_id);assert.equal(binding.texture_transforms.color.repeat[0],Math.round(5/r.preset.scale_u_m));}
  const result=collector.finish();assert.equal(result.materials.length,4);for(let i=0;i<4;i++)for(const file of barkTextureFiles(libraryBarkCatalog[i].preset)){const map=result.materials[i].maps[file.key];assert.equal(map.width,512);assert.deepEqual(fs.readFileSync(path.join(directory,map.file)),Buffer.from(file.bytes));assert.equal(map.color_space,file.key==='color'?'srgb':'linear');}assert.equal(result.setup.ue_material_application_verified,false);
 }finally{for(const m of materials){for(const key of ['map','normalMap','roughnessMap'])m[key].dispose();m.dispose();}}
});
