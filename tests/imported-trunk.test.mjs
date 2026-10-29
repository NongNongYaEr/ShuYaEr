import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import * as T from '../web/vendor/three.module.min.js';
import {readImportedTrunkGlb} from '../web/imported-trunk-glb.js';
import {validateImportedTrunk,defaultTrunkCalibration,trunkCalibrationMatrix,setTrunkPhysicalLength,trunkDimensions,defaultTrunkGuides,validateTrunkGuides,partitionTrunkGeometry,trunkSurfaceAnchor,evaluateTrunkAnchor} from '../web/imported-trunk-data.js';
import {importedTrunkFixture,unpackFixture,repackFixture} from './imported-trunk-fixture.mjs';
import {prepareImportedTrunk,importedTrunkShape} from '../web/imported-trunk-runtime.js';
import {buildBranchAsset,disposeBranchAsset,normalizeSettings,createProjectDocument} from '../web/branch-kernel.js';
import {normalizeAuthoring,migrateProjectDocument} from '../web/authoring-state.js';
const fixture=await importedTrunkFixture(),read=()=>readImportedTrunkGlb(fixture,{name:'分叉与树洞.glb'});
test('foreign multi-material GLB preserves source bytes, transformed geometry, UVs, mirrored winding and the hole mesh',async()=>{
 const asset=await read();validateImportedTrunk(asset);assert.equal(asset.primitives.length,3);assert.equal(new Set(asset.primitives.map(p=>p.material)).size,2);assert(asset.primitives.some(p=>p.name==='树洞边缘'));assert.equal(asset.source.sha256,crypto.createHash('sha256').update(fixture).digest('hex'));assert(Buffer.from(asset.source.glb_base64,'base64').equals(fixture));
 for(const p of asset.primitives){const g=p.geometry;for(let at=0;at<g.index.length;at+=3){const [a,b,c]=g.index.slice(at,at+3).map(i=>new T.Vector3().fromArray(g.position,i*3)),normal=new T.Vector3().fromArray(g.normal,g.index[at]*3);const cross=new T.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a));if(cross.lengthSq()>1e-12)assert(cross.dot(normal)>-1e-7,'mirrored face disagrees with transformed normal');}}
});
test('real bundled GLB retains its embedded image and material instead of becoming a reference-only surface',async()=>{
 const bytes=fs.readFileSync(new URL('../web/assets/models/QiaoDunTest.glb',import.meta.url)),asset=await readImportedTrunkGlb(bytes,{name:'QiaoDunTest.glb'});validateImportedTrunk(asset);assert.equal(asset.triangles,416);assert.equal(asset.images.length,1);assert(asset.materials.some(m=>m.baseColor));assert(asset.primitives.every(p=>p.geometry.tangent.every(Number.isFinite)));
});
test('trunk physical calibration has an independent metre scale and partitioning preserves source triangles and UVs',async()=>{
 const asset=await read(),before=JSON.stringify(asset.primitives);asset.calibration=defaultTrunkCalibration(asset);const original=trunkDimensions(asset);asset.calibration=setTrunkPhysicalLength(asset,12);const scaled=trunkDimensions(asset);assert(Math.abs(scaled.height-12)<1e-5);assert(Math.abs(scaled.width/original.width-12/original.height)<1e-6);asset.guides=defaultTrunkGuides(asset);const parts=partitionTrunkGeometry(asset);assert.equal(parts.reduce((n,p)=>n+p.geometry.index.length/3,0),asset.triangles);assert.equal(JSON.stringify(asset.primitives),before);
 for(const [pi,part]of parts.entries()){const src=asset.primitives[pi].geometry;for(let i=0;i<src.index.length;i++){const a=src.index[i],b=part.geometry.index[i];assert.deepEqual(part.geometry.uv.slice(b*2,b*2+2),src.uv.slice(a*2,a*2+2));}assert(part.owners.every(id=>id==='G0'));}
 assert.throws(()=>setTrunkPhysicalLength(asset,0));assert.throws(()=>trunkCalibrationMatrix({...asset.calibration,tip:asset.calibration.base}));
});
test('surface anchors retain barycentric position, surface offset and fixed topology across serialization',async()=>{
 const asset=await read();asset.calibration=defaultTrunkCalibration(asset);asset.guides=defaultTrunkGuides(asset);const p=asset.primitives[0],anchor=trunkSurfaceAnchor(asset,p.id,18,[.2,.3,.5],{offset:.03}),first=evaluateTrunkAnchor(asset,anchor),saved=JSON.parse(JSON.stringify({asset,anchor})),restored=evaluateTrunkAnchor(saved.asset,saved.anchor);assert(first.position.distanceTo(restored.position)<1e-12);assert(Math.abs(first.normal.length()-1)<1e-7);const without=evaluateTrunkAnchor(asset,{...anchor,offset_m:0});assert(Math.abs(first.position.distanceTo(without.position)-.03)<1e-8);assert.throws(()=>evaluateTrunkAnchor({...asset,revision:2},anchor));const changed=structuredClone(p.geometry);changed.index[anchor.face*3]=9999;assert.throws(()=>evaluateTrunkAnchor(asset,anchor,{geometry:changed}));assert.throws(()=>trunkSurfaceAnchor(asset,p.id,18,[1,1,1]));
});
test('invalid source references, external images, unsupported compression and cyclic control structure are rejected',async()=>{
 await assert.rejects(()=>readImportedTrunkGlb(fixture.subarray(0,fixture.length-1)));
 for(const change of [o=>{o.json.images=[{uri:'file:///private/texture.png'}];},o=>{o.json.extensionsRequired=['KHR_draco_mesh_compression'];},o=>{o.json.accessors[0].count=6000000;},o=>{o.json.nodes[0].children=[0];}]){const o=unpackFixture(fixture);change(o);await assert.rejects(()=>readImportedTrunkGlb(repackFixture(o)));}
 assert.throws(()=>validateTrunkGuides([{id:'G0',parent:'G0',attach:0,points:[[0,0,0],[0,0,1]],start_radius:1,end_radius:1}]));
});
test('normal tree construction and project reload use the foreign mesh as the structural host without adding a duplicate swept trunk',async()=>{
 const model=prepareImportedTrunk(await read()),{shape,mount}=importedTrunkShape(model),settings=normalizeSettings({leaf_density:0,max_leaves:0,child_count:0,buds_enabled:false,fruit_enabled:false,branch_levels:3,junction_collar:true}),authoring=normalizeAuthoring({branch_shape:shape,imported_trunks:{version:1,assets:[model],mounts:[mount]},recipe:{tags:['WHOLE_PLANT','FOLIAGE_ON_INSTANCES_ONLY']}});
 let asset,reloaded;try{asset=buildBranchAsset(settings,null,[],0,authoring);assert.equal(asset.report.triangles,model.triangles);const objects=[];asset.group.traverse(o=>{if(o.isMesh)objects.push(o);});assert.equal(objects.length,model.primitives.length);assert(objects.every(o=>o.userData.imported_trunk));assert.equal(asset.masterBranches.length,model.guides.length);assert.equal(asset.report.invalid_vertices,0);assert.equal(asset.report.missing_normals,0);assert.equal(asset.report.missing_tangents,0);
  const doc=migrateProjectDocument(JSON.parse(JSON.stringify(createProjectDocument(asset,[],authoring))));reloaded=buildBranchAsset(doc.settings,null,[],0,doc.authoring);assert.equal(reloaded.report.triangles,model.triangles);const before=[],after=[];asset.group.traverse(o=>{if(o.isMesh)before.push(Array.from(o.geometry.attributes.position.array));});reloaded.group.traverse(o=>{if(o.isMesh)after.push(Array.from(o.geometry.attributes.position.array));});assert.deepEqual(before,after);
 }finally{disposeBranchAsset(asset);disposeBranchAsset(reloaded);}
});
