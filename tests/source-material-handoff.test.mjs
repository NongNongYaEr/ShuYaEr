import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importedTrunkFixture,repackFixture,unpackFixture} from './imported-trunk-fixture.mjs';
import {readImportedTrunkGlb,readTrunkGlbData} from '../web/imported-trunk-glb.js';
import {prepareImportedTrunk} from '../web/imported-trunk-runtime.js';
import {materialHandoffGlb} from '../web/material-handoff-glb.js';
import {attachMaterialCheckpoint,digest} from '../web/trunk-material-workflow.js';
import {withTrunkWeightEdits,trunkWeightRepairs} from '../web/trunk-weight-data.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1uoAAAAASUVORK5CYII=','base64');
async function fixture(alphaMode='OPAQUE',inlineMime='image/png'){
 const {json,bin}=unpackFixture(await importedTrunkFixture());
 json.images=[{bufferView:json.bufferViews.length,mimeType:'image/png'},{uri:'data:'+inlineMime+';base64,'+png.toString('base64')}];
 json.bufferViews.push({buffer:0,byteOffset:bin.length,byteLength:png.length});
 json.buffers[0].byteLength=bin.length+png.length;
 json.samplers=[{wrapS:33648,wrapT:33071}];
 json.textures=[{source:0,sampler:0},{source:1}];
 json.materials[0].alphaMode=alphaMode;
 json.materials[0].pbrMetallicRoughness.baseColorTexture={index:0,extensions:{KHR_texture_transform:{offset:[.1,.2],scale:[2,3],rotation:.2}}};
 json.materials[1].pbrMetallicRoughness.baseColorTexture={index:1};
 json.extensionsUsed=['KHR_texture_transform'];
 const attributes=json.meshes[0].primitives[0].attributes;
 attributes.TEXCOORD_1=attributes.TEXCOORD_0;
 return prepareImportedTrunk(await readImportedTrunkGlb(repackFixture({json,bin:Buffer.concat([bin,png])})));
}

test('原材质交接保留贴图字节、材质槽和网格身份，并使用当前校准造型',async()=>{
 const source=await fixture(),geometry=source.primitives[0].geometry;
 const position=geometry.position.slice();position[0]+=.125;
 const edited={...source,calibration:{...source.calibration,scale:.75},primitives:[{...source.primitives[0],geometry:{...geometry,position}},...source.primitives.slice(1)]};
 const {bytes}=await materialHandoffGlb(edited,{preserveMaterials:true});
 const {json,bin,bv}=readTrunkGlbData(bytes),returned=await readImportedTrunkGlb(bytes,{preservePrimitiveIds:true});
 for(const record of json.images){
  assert.equal(record.uri,undefined);
  const image=bv(record.bufferView);
  assert.deepEqual(Buffer.from(bin.subarray(image.byteOffset,image.byteOffset+image.byteLength)),png);
 }
 assert.deepEqual(returned.primitives.map(p=>[p.id,p.material]),source.primitives.map(p=>[p.id,p.material]));
 assert.deepEqual(returned.materials,source.materials);
 assert.deepEqual(returned.primitives[0].geometry.uv1,geometry.uv1);
 const preview=await readImportedTrunkGlb((await materialHandoffGlb(edited)).bytes);
 assert.ok(Math.abs(returned.primitives[0].geometry.position[0]-preview.primitives[0].geometry.position[0])<1e-6);
 assert.notEqual(position[0],geometry.position[0]);
});

test('叠加结果的工作UV可变化，位置与索引一致才沿用逐点权重',async()=>{
 const source=await fixture(),{id,geometry}=source.primitives[0],vertex=geometry.index[0];
 const previous=withTrunkWeightEdits(source,new Map([[id,new Map([[vertex,'@']])]])).model;
 const {bytes}=await materialHandoffGlb(previous,{preserveMaterials:true});
 const parsed=await readImportedTrunkGlb(bytes,{preservePrimitiveIds:true});
 parsed.primitives[0].geometry.uv[0]+=.1;
 const bundle=new Uint8Array([1,2,3]);
 const metadata={sessionId:'draft',projectId:'project',inputId:'input',bundle,bundleSHA256:await digest(bundle),preparation:'overlay'};
 const result=await attachMaterialCheckpoint(parsed,previous,metadata);
 assert.equal(result.material_workflow.needsSkeleton,false);
 assert.equal(trunkWeightRepairs(result).get(id).get(vertex),'@');
 const g=parsed.primitives[0].geometry,count=g.position.length/3;
 for(const [name,values] of Object.entries(g))if(name!=='index'){
  const size=values.length/count;
  values.push(...values.slice(vertex*size,(vertex+1)*size));
 }
 g.index[0]=count;
 const split=await attachMaterialCheckpoint(parsed,previous,metadata);
 assert.equal(split.material_workflow.needsSkeleton,false);
 assert.deepEqual([...trunkWeightRepairs(split).get(id)],[[vertex,'@'],[count,'@']]);
 parsed.primitives[0].geometry.position[0]+=.01;
 const changed=await attachMaterialCheckpoint(parsed,previous,metadata);
 assert.equal(changed.material_workflow.needsSkeleton,true);
 assert.deepEqual(changed.binding,{});
});

test('不支持的透明槽明确提示，并仍可走原有材质制作路径',async()=>{
 const source=await fixture('MASK');
 await assert.rejects(materialHandoffGlb(source,{preserveMaterials:true}),/标准不透明 PBR/);
 await assert.rejects(materialHandoffGlb(await fixture('OPAQUE','image/webp'),{preserveMaterials:true}),/含 WebP 贴图/);
 assert.ok((await materialHandoffGlb(source)).bytes.byteLength>0);
});
