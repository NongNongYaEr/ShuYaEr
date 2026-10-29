import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../web/vendor/three.module.min.js';
import {trunkSurfaceTangents} from '../web/trunk-surface-tangents.js';
import {readImportedTrunkGlb} from '../web/imported-trunk-glb.js';
import {prepareImportedTrunk,importedTrunkShape} from '../web/imported-trunk-runtime.js';
import {trunkPoseGeometry} from '../web/imported-trunk-binding.js';
import {buildBranchAsset,disposeBranchAsset,normalizeSettings,createProjectDocument} from '../web/branch-kernel.js';
import {normalizeAuthoring,migrateProjectDocument} from '../web/authoring-state.js';
import {importedTrunkFixture,unpackFixture,repackFixture} from './imported-trunk-fixture.mjs';

function surfaceFrame(normal,tangent){
  for(let i=0;i<normal.length/3;i++){
    const n=new T.Vector3().fromArray(normal,i*3),t=new T.Vector3().fromArray(tangent,i*4);
    assert(Math.abs(t.length()-1)<2e-6);assert(Math.abs(n.clone().normalize().dot(t))<2e-6);assert([1,-1].includes(tangent[i*4+3]));
  }
}
test('missing or parallel source frames are repaired without altering valid authored tangents or handedness',()=>{
  const normals=[1,0,0, 0,-1,0, 0,0,1, 1,1,1],source=[0,0,0,1, 0,-2,0,-1, 0,0,0,1, 2,2,2,-1],before=source.slice(),result=trunkSurfaceTangents(normals,source);
  surfaceFrame(normals,result);assert.deepEqual(source,before);assert.deepEqual(result.filter((_,i)=>i%4===3),[1,-1,1,-1]);assert.deepEqual(trunkSurfaceTangents(normals,source),result);
  const valid=new Float32Array([0,1,0,-1]);assert.equal(trunkSurfaceTangents([1,0,0],valid),valid);
  const mixed=new Float32Array([0,1,0,-1,0,0,0,1]),fixed=trunkSurfaceTangents([1,0,0,0,0,1],mixed);assert(fixed instanceof Float32Array);assert.deepEqual(Array.from(fixed.slice(0,4)),Array.from(valid));
  surfaceFrame(normals,trunkSurfaceTangents(normals));assert.deepEqual(trunkSurfaceTangents([0,0,0],[0,0,0,1]),[0,0,0,1]);
});

const fixture=await importedTrunkFixture();
function appendAttribute(o,values,width){
  const bytes=Buffer.alloc(values.length*4);values.forEach((v,i)=>bytes.writeFloatLE(v,i*4));
  const bufferView=o.json.bufferViews.push({buffer:0,byteOffset:o.bin.length,byteLength:bytes.length})-1;
  const accessor=o.json.accessors.push({bufferView,componentType:5126,count:values.length/width,type:'VEC'+width})-1;
  o.bin=Buffer.concat([o.bin,bytes]);o.json.buffers[0].byteLength=o.bin.length;return accessor;
}
for(const mode of ['missing UV','collapsed UV','zero tangent','parallel tangent'])test('GLB '+mode+' builds both original and flexible trees with every source triangle retained',async()=>{
  const o=unpackFixture(fixture);
  for(const mesh of o.json.meshes)for(const p of mesh.primitives){
    const count=o.json.accessors[p.attributes.POSITION].count;
    if(mode==='missing UV')delete p.attributes.TEXCOORD_0;
    if(mode==='collapsed UV')p.attributes.TEXCOORD_0=appendAttribute(o,new Array(count*2).fill(0),2);
    if(mode.includes('tangent')){
      const values=[];const a=o.json.accessors[p.attributes.NORMAL],view=o.json.bufferViews[a.bufferView];
      for(let i=0;i<count;i++){for(let j=0;j<3;j++)values.push(mode==='zero tangent'?0:o.bin.readFloatLE((view.byteOffset||0)+(a.byteOffset||0)+i*(view.byteStride||12)+j*4));values.push(1);}
      p.attributes.TANGENT=appendAttribute(o,values,4);
    }
  }
  const asset=prepareImportedTrunk(await readImportedTrunkGlb(repackFixture(o))),snapshot=JSON.stringify(asset);
  for(const p of asset.primitives)surfaceFrame(p.geometry.normal,p.geometry.tangent);
  for(const binding of ['PRESERVE','FLEX']){
    const {mount}=importedTrunkShape(asset);mount.binding=binding;
    const branches=asset.guides.map((g,i)=>({id:i,stableId:mount.guide_map[g.id],points:g.points.map(p=>new T.Vector3(...p)),startRadius:g.start_radius,endRadius:g.end_radius}));
    const result=trunkPoseGeometry(asset,mount,branches);
    for(const p of asset.primitives){const g=result.primitives.get(p.id);surfaceFrame(g.normal,g.tangent);assert.equal(g.uv,p.geometry.uv);assert.equal(g.index,p.geometry.index);}
    if(binding==='FLEX'){branches[0].points.at(-1).x+=.1;const bent=trunkPoseGeometry(asset,mount,branches);assert.notDeepEqual(bent.primitives.get(asset.primitives[0].id).position,result.primitives.get(asset.primitives[0].id).position);}
  }
  assert.equal(JSON.stringify(asset),snapshot);
});

test('already saved zero-tangent projects recover on build and cold reload while retaining their immutable source',async()=>{
  const model=prepareImportedTrunk(await readImportedTrunkGlb(fixture));
  for(const p of model.primitives)p.geometry.tangent=p.geometry.tangent.map((v,i)=>i%4===3?1:0);
  const source=JSON.stringify(model),{shape,mount}=importedTrunkShape(model),settings=normalizeSettings({leaf_density:0,max_leaves:0,child_count:0,buds_enabled:false,fruit_enabled:false,junction_collar:false}),authoring=normalizeAuthoring({branch_shape:shape,imported_trunks:{version:1,assets:[model],mounts:[mount]}});
  let built,cold;
  try{
    built=buildBranchAsset(settings,null,[],0,authoring);assert.equal(built.report.triangles,model.triangles);assert.equal(built.report.missing_tangents,0);
    const doc=migrateProjectDocument(JSON.parse(JSON.stringify(createProjectDocument(built,[],authoring))));cold=buildBranchAsset(doc.settings,null,[],0,doc.authoring);
    const buffers=b=>{const result=[];b.group.traverse(m=>{if(m.isMesh){surfaceFrame(m.geometry.attributes.normal.array,m.geometry.attributes.tangent.array);result.push(Array.from(m.geometry.attributes.position.array));}});return result;};
    assert.deepEqual(buffers(built),buffers(cold));assert.equal(JSON.stringify(model),source);assert.equal(JSON.stringify(doc.authoring.imported_trunks.assets[0]),source);
  }finally{disposeBranchAsset(built);disposeBranchAsset(cold);}
});

test('fallback frames do not hide invalid normals or broken control curves',async()=>{
  const model=prepareImportedTrunk(await readImportedTrunkGlb(fixture)),{mount}=importedTrunkShape(model),branches=model.guides.map((g,i)=>({id:i,stableId:mount.guide_map[g.id],points:g.points.map(p=>new T.Vector3(...p)),startRadius:g.start_radius,endRadius:g.end_radius}));
  model.primitives[0].geometry.normal.fill(0,0,3);model.primitives[0].geometry.tangent.fill(0,0,3);
  assert.throws(()=>trunkPoseGeometry(model,mount,branches),/无效表面/);
  branches[0].points[1].copy(branches[0].points[0]);assert.throws(()=>trunkPoseGeometry(model,mount,branches),/长度为零/);
});
