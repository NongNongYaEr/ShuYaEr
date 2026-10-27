import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as T from 'three';
import { createRequire } from 'node:module';
import * as k from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { createPVESkeleton } from '../web/pve-skeleton-export.js';
import { exportVineComplete } from '../scripts/export-pve-vine.mjs';
import { validatePackage } from '../scripts/pve-package.mjs';
const { fingerprintScene, fingerprintBinary, collapseVineFingerprint } = createRequire(import.meta.url)('./pve-geometry-audit.cjs');
globalThis.FileReader ||= class { async readAsArrayBuffer(b) { this.result=await b.arrayBuffer();this.onloadend?.(); } };
const pack=JSON.parse(fs.readFileSync(new URL('../web/assets/plants/ivy-v1.json',import.meta.url)));
const tool=path.resolve('.');
for(const surface of [false,true]) test(`complete vine unit: ${surface?'surface':'hanging'}, baked real geometry, no loose leaves`,async()=>{
 const output=fs.mkdtempSync(path.resolve('.runtime/pve-vine-test-'));
 const settings=k.normalizeSettings({object_name:'常春藤测试',seed:45,max_leaves:120,radial_segments:4,max_triangles:1000000});
 const authoring=normalizeAuthoring({vine:{species:'IVY',type:'SINGLE',width:.25,length:.6,density:1,foliage:25},leaf_material:pack.leaf_material,
  attachment_layers:[{id:'leaves',type:'LEAF',enabled:true,order_min:0,order_max:3,start:.1,end:1}],
  ...(surface?{surface_growth:{mesh:{id:'wall',position:[-1,0,0,1,0,0,1,0,2,-1,0,2],index:[0,1,2,0,2,3]},
   growth_ruler:{bottom:.02,top:1.8,leaf_budget:120,coverage:.9,budget:50}}}:{})},settings.seed);
 const document={format:'ProceduralBranchProject',version:4,settings,authoring,leaf_meshes:structuredClone(pack.leaf_meshes)};
 if(!surface)document.leaf_meshes=document.leaf_meshes.slice(0,2);
 document.leaf_meshes[0].id='../叶片类';document.leaf_meshes[0].calibration={scale:1.4,rotation:23,flip:true};
 const bytes=Buffer.from(JSON.stringify(document)),sources=document.leaf_meshes.map(s=>({...s,geometry:k.deserializeGeometry(s.geometry)}));
 let asset;
 try {
  const result=await exportVineComplete({tool,input:'test.branch.json',document,sourceBytes:bytes,output,progress(){}});
  const validation=validatePackage(output,bytes);assert.equal(validation.valid,true);assert.equal(result.sources,1);assert.equal(result.units,1);assert.equal(result.leaf_sources,sources.length);
  asset=k.buildBranchAsset(settings,null,sources,0,authoring,{resolveSources:true});
  const read=name=>JSON.parse(fs.readFileSync(path.join(output,name)));
  const skeleton=read('whole.pve-skeleton.json'),r=read('whole.resolved.json'),m=read('complete_units.manifest.json'),detail=m.vine_detail.data;
  assert.equal(fs.existsSync(path.join(output,'whole.vine-detail.json')),false);
  assert.equal(validation.files['whole.vine-detail.json'],undefined);
  fs.writeFileSync(path.join(output,'whole.vine-detail.json'),JSON.stringify(detail));
  assert.throws(()=>validatePackage(output,bytes),/约定之外的文件.*whole.vine-detail/);
  fs.unlinkSync(path.join(output,'whole.vine-detail.json'));
  const expected=createPVESkeleton(asset,sources);assert.deepEqual(detail,expected);
  const host=skeleton.branches[0].id;assert.deepEqual(skeleton.branches,[expected.branches.find(b=>b.id===host)]);
  assert.equal(skeleton.complete_unit_assembly.leaf_instances,0);assert.equal(skeleton.complete_unit_assembly.organ_instances,0);
  assert.equal(skeleton.complete_unit_assembly.baked_unit_leaves,expected.foliage.length);assert.match(skeleton.foliage[0].id,/^UNIT_/);
  assert.deepEqual(fingerprintBinary(r,fs.readFileSync(path.join(output,'whole.resolved.bin'))),collapseVineFingerprint(fingerprintScene(asset,T,true),host,skeleton.foliage[0].id));
  // Independently inspect the actual complete GLB: every non-host triangle and
  // every calibrated leaf are baked, with the same pivot/orientation as its instance.
  const glb=fs.readFileSync(path.join(output,m.units[0].glb)),length=glb.readUInt32LE(12),json=JSON.parse(glb.toString('utf8',20,20+length)),bin=28+length;
  const primitives=json.meshes.flatMap(mesh=>mesh.primitives),positionAccessor=primitives[0].attributes.POSITION;
  assert.ok(primitives.every(p=>p.attributes.POSITION===positionAccessor));
  const a=json.accessors[positionAccessor],view=json.bufferViews[a.bufferView],start=bin+(view.byteOffset||0)+(a.byteOffset||0),stride=view.byteStride||12;
  const up=new T.Vector3(...skeleton.foliage[0].up),face=new T.Vector3(...skeleton.foliage[0].face),across=new T.Vector3().crossVectors(up,face).normalize();
  const matrix=new T.Matrix4().makeBasis(across,up,face).transpose().multiply(new T.Matrix4().makeTranslation(...skeleton.foliage[0].position_m.map(v=>-v)));
  let vertices=0,triangles=0;
  asset.group.updateWorldMatrix(true,true);
  asset.group.traverseVisible(mesh=>{
   if(!mesh.isMesh||mesh.userData.stable_id===host)return;
   const g=mesh.geometry;triangles+=g.index.count/3;
   for(let v=0;v<g.attributes.position.count;v++){
    const p=new T.Vector3().fromBufferAttribute(g.attributes.position,v).applyMatrix4(mesh.matrixWorld).applyMatrix4(matrix);
    p.toArray().forEach((value,c)=>assert.ok(Math.abs(value-glb.readFloatLE(start+vertices*stride+c*4))<1e-6));vertices++;
   }
  });
  assert.equal(vertices,a.count);assert.equal(triangles,m.units[0].triangles);
  if(surface)assert.ok(json.materials.some(v=>v.name==='M_Bark'));
  assert.ok(json.materials.some(v=>v.name==='M_Leaf'));assert.equal(detail.foliage_sources[0].id,'../叶片类');
  assert.equal(r.summary.triangles,asset.report.triangles);assert.ok(r.summary.leaves>0);assert.equal(validation.support_mesh_exported,false);assert.ok(validation.atlas.width>1);
  // Reproduce the user's rejected package contract: cannot pass by loose-leaf metadata.
  const original=fs.readFileSync(path.join(output,'whole.pve-skeleton.json'));
  skeleton.complete_unit_assembly.leaf_instances=expected.foliage.length;
  fs.writeFileSync(path.join(output,'whole.pve-skeleton.json'),JSON.stringify(skeleton));
  assert.throws(()=>validatePackage(output,bytes),/仍包含独立叶片/);fs.writeFileSync(path.join(output,'whole.pve-skeleton.json'),original);
  const prior=fs.readFileSync(path.join(output,'whole.resolved.bin'));
  await exportVineComplete({tool,input:'test.branch.json',document,sourceBytes:bytes,output,progress(){}});assert.deepEqual(fs.readFileSync(path.join(output,'whole.resolved.bin')),prior);
  assert.equal(JSON.stringify(document),bytes.toString());
 }finally{
  k.disposeBranchAsset(asset);sources.forEach(s=>s.geometry.dispose());
  const runtimeRoot=path.resolve(tool,'.runtime'),cleanupTarget=path.resolve(output);
  assert.equal(path.dirname(cleanupTarget),runtimeRoot,'cleanup must stay in this workspace .runtime');
  assert.ok(path.basename(cleanupTarget).startsWith('pve-vine-test-'),'cleanup must target a vine test temporary directory');
  fs.rmSync(cleanupTarget,{recursive:true,force:true,maxRetries:12,retryDelay:250});
 }
});
test('vine export rejects missing material before producing a partial success',async()=>{
 const document={settings:{seed:1},authoring:{vine:{species:'IVY'}},leaf_meshes:pack.leaf_meshes};
 await assert.rejects(exportVineComplete({tool,document,sourceBytes:Buffer.from('{}'),output:'.runtime',progress(){}}),/共享图集/);
});
