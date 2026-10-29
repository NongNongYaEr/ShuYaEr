import test from 'node:test';import assert from 'node:assert/strict';
import * as T from '../web/vendor/three.module.min.js';
import {importedTrunkFixture} from './imported-trunk-fixture.mjs';
import {readImportedTrunkGlb} from '../web/imported-trunk-glb.js';
import {prepareImportedTrunk,importedTrunkShape} from '../web/imported-trunk-runtime.js';
import {trunkCalibrationMatrix} from '../web/imported-trunk-data.js';
import {transformTrunkCalibration} from '../web/trunk-calibration-transform.js';
import {buildBranchAsset,disposeBranchAsset,normalizeSettings} from '../web/branch-kernel.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {evaluateRootScale} from '../web/branch-root-scale.js';
import {createSculptSnapshot,sampleLine,lineTangent} from '../web/tree-sculpt.js';
import {createGpuMeshPreview} from '../web/gpu-edit-preview.js';
const bytes=await importedTrunkFixture();
test('model G/R/S changes the calibration frame exactly, preserves the raw GLB and retains physical units after JSON reload',async()=>{
 const model=prepareImportedTrunk(await readImportedTrunkGlb(bytes)),source=JSON.stringify(model.primitives),matrix=trunkCalibrationMatrix(model.calibration),q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI/3);
 for(const delta of [{translation:new T.Vector3(.2,0,.3)},{rotation:q},{scale:new T.Vector3(2,2,2)}]){
  const after=transformTrunkCalibration(model,delta),expected=new T.Matrix4().compose(delta.translation||new T.Vector3(),delta.rotation||new T.Quaternion(),delta.scale||new T.Vector3(1,1,1)).multiply(matrix),actual=trunkCalibrationMatrix(after.calibration),cold=trunkCalibrationMatrix(JSON.parse(JSON.stringify(after)).calibration);
  for(let i=0;i<16;i++){assert(Math.abs(actual.elements[i]-expected.elements[i])<1e-9);assert.equal(actual.elements[i],cold.elements[i]);}assert.equal(JSON.stringify(after.primitives),source);assert.equal(after.source,model.source);if(delta.translation)assert.deepEqual(after.guides,model.guides,'mesh positioning must keep every control point stationary');
 }
 assert.throws(()=>transformTrunkCalibration(model,{scale:new T.Vector3(1,1,2)}),/等比/);assert.throws(()=>transformTrunkCalibration(model,{scale:new T.Vector3(10000,10000,10000)}),/1000 米/);assert.equal(JSON.stringify(model.primitives),source);
});
test('new whole-trunk scaling changes volume while Z scaling retains width; existing history keeps its previous semantics and preview matches rebuilt geometry',async()=>{
 const model=prepareImportedTrunk(await readImportedTrunkGlb(bytes)),height=model.guides[0].points.at(-1)[2];model.guides[0].points=Array.from({length:9},(_,i)=>[0,0,height*i/8]);const {shape,mount}=importedTrunkShape(model);mount.binding='FLEX';const settings=normalizeSettings({leaf_density:0,max_leaves:0,child_count:0,buds_enabled:false,fruit_enabled:false,junction_collar:false}),a=normalizeAuthoring({branch_shape:shape,imported_trunks:{version:1,assets:[model],mounts:[mount]}}),built=[];
 const build=authoring=>{const b=buildBranchAsset(settings,null,[],0,authoring);built.push(b);return b;},bounds=asset=>{const b=new T.Box3();asset.group.traverse(m=>{if(m.userData.imported_trunk){m.geometry.computeBoundingBox();b.union(m.geometry.boundingBox);}});return b.getSize(new T.Vector3());};
 try{const base=build(a),size=bounds(base),source=JSON.stringify(model),snapshot=createSculptSnapshot(base.masterBranches,base.authoring.overrides);
  for(const [scale,volume,ratios]of [[[2,2,2],true,[2,2,2]],[[1,1,2],true,[1,1,2]],[[2,2,2],false,[1,1,2]]]){
   const operation={type:'ROOT_SCALE',targets:[mount.guide_map.G0],scale,...(volume?{scale_trunk_volume:true}:{})},after=normalizeAuthoring({...a,sculpt_layers:[{id:'S',enabled:true,strength:1,operation,branches:{}}]}),asset=build(after),actual=bounds(asset);for(let i=0;i<3;i++)assert(Math.abs(actual.getComponent(i)/size.getComponent(i)-ratios[i])<2e-5,JSON.stringify({scale,volume,ratios,actual:actual.toArray(),before:size.toArray(),radius:asset.masterBranches[0].startRadius,was:base.masterBranches[0].startRadius,op:after.sculpt_layers[0].operation}));
   const cold=build(normalizeAuthoring(JSON.parse(JSON.stringify(after))));assert.deepEqual(bounds(cold),actual);
   const updated=new Map(evaluateRootScale(base.masterBranches,operation).map(b=>[b.id,b])),preview=createGpuMeshPreview(base,snapshot,{sampleLine,lineTangent,targets:new Set(operation.targets),rigidUnits:true}),beforeMeshes=[],afterMeshes=[];base.group.traverse(m=>{if(m.userData.imported_trunk)beforeMeshes.push(m);});asset.group.traverse(m=>{if(m.userData.imported_trunk)afterMeshes.push(m);});
   try{preview.update(updated);for(let n=0;n<beforeMeshes.length;n++){const mesh=afterMeshes[n];for(let v=0;v<mesh.geometry.attributes.position.count;v+=7)assert(preview.vertex(beforeMeshes[n],v).distanceTo(new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,v))<1e-5);}}finally{preview.restore();}
  }assert.equal(JSON.stringify(model),source);
 }finally{built.forEach(disposeBranchAsset);}
});

test('mesh positioning against fixed guides survives normal construction and JSON reload in both binding modes',async()=>{
 const source=prepareImportedTrunk(await readImportedTrunkGlb(bytes)),height=source.guides[0].points.at(-1)[2];source.guides[0].points=Array.from({length:9},(_,i)=>[0,0,height*i/8]);const moved=transformTrunkCalibration(source,{translation:new T.Vector3(.15,0,.08)}),matrix=trunkCalibrationMatrix(moved.calibration),settings=normalizeSettings({leaf_density:0,max_leaves:0,child_count:0,buds_enabled:false,fruit_enabled:false}),snap=JSON.stringify(source);
 for(const mode of ['PRESERVE','FLEX']){const {shape,mount}=importedTrunkShape(moved);mount.binding=mode;const authoring={branch_shape:shape,imported_trunks:{version:1,assets:[moved],mounts:[mount]}};for(const value of [authoring,JSON.parse(JSON.stringify(authoring))]){const asset=buildBranchAsset(settings,null,[],0,normalizeAuthoring(value));try{asset.group.updateMatrixWorld(true);const meshes=[];asset.group.traverse(m=>{if(m.userData.imported_trunk)meshes.push(m);});assert.equal(meshes.length,moved.primitives.length);for(let n=0;n<meshes.length;n++){const m=meshes[n],raw=moved.primitives.find(p=>p.id===m.userData.trunk_primitive_id).geometry;for(let i=0;i<m.geometry.attributes.position.count;i+=5)assert(new T.Vector3().fromBufferAttribute(m.geometry.attributes.position,i).applyMatrix4(m.matrixWorld).distanceTo(new T.Vector3().fromArray(raw.position,m.userData.trunk_source_vertices[i]*3).applyMatrix4(matrix))<1e-5,JSON.stringify({mode,n,i,actual:new T.Vector3().fromBufferAttribute(m.geometry.attributes.position,i).applyMatrix4(m.matrixWorld).toArray(),expected:new T.Vector3().fromArray(raw.position,m.userData.trunk_source_vertices[i]*3).applyMatrix4(matrix).toArray(),data:m.userData}));}assert.deepEqual(asset.authoring.imported_trunks.assets[0].guides,source.guides);}finally{disposeBranchAsset(asset);}}}assert.equal(JSON.stringify(source),snap);
});
