import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {encodePNG} from '../material/core/png-write.mjs';
import {buildUdimTrunkGlb} from '../web/trunk-udim-import.js';
import {readImportedTrunkGlb} from '../web/imported-trunk-glb.js';
import {validateImportedTrunk} from '../web/imported-trunk-data.js';
import {repackFixture,unpackFixture} from './imported-trunk-fixture.mjs';

function meshFixture(row){
 const positions=new Float32Array([0,0,0, 1,0,0, 0,1,0, 1,0,0, 2,0,0, 1,1,0, 0,1,0, 1,1,0, 0,2,0]);
 const uv=new Float32Array([0,0,1,0,0,1, 1,0,2,0,1,1, 0,row,1,row,0,row+1]);
 const bin=Buffer.concat([Buffer.from(positions.buffer),Buffer.from(uv.buffer)]);
 return repackFixture({bin,json:{asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],
  meshes:[{primitives:[{attributes:{POSITION:0,TEXCOORD_0:1}}]}],buffers:[{byteLength:bin.length}],
  bufferViews:[{buffer:0,byteLength:positions.byteLength},{buffer:0,byteOffset:positions.byteLength,byteLength:uv.byteLength}],
  accessors:[{bufferView:0,type:'VEC3',componentType:5126,count:9},{bufferView:1,type:'VEC2',componentType:5126,count:9}]}});
}
const tileIds=[1001,1002,1011];
const makeMap=(channel,tile,color)=>new File([encodePNG(2,2,Uint8Array.from([...color,...color,...color,...color]))],
 `树皮_${channel}.${tile}.png`,{type:'image/png'});
const tiles=tileIds.flatMap((tile,i)=>[
 makeMap('BaseColor',tile,[i===0?200:30,i===1?200:30,i===2?200:30,255]),
 makeMap('Normal',tile,[128,128,255,255]),
 makeMap('ORM',tile,[255,195,0,255])
]);

for(const row of [-1,1]){
 test(`UDIM row ${row}: tile edge triangles, PBR bytes, and UVs round trip as standard GLB`,async()=>{
  const source=meshFixture(row),before=await readImportedTrunkGlb(source);
  const converted=await buildUdimTrunkGlb(source,tiles);
  const model=validateImportedTrunk(await readImportedTrunkGlb(converted));
  assert.deepEqual(model.source.udimTiles,tileIds);
  assert.equal(model.triangles,before.triangles);
  assert.deepEqual(model.primitives.flatMap(p=>p.geometry.position),before.primitives[0].geometry.position);
  for(const [i,primitive] of model.primitives.entries()){
   assert.deepEqual(primitive.geometry.uv,[0,0,1,0,0,1]);
   const mat=model.materials[primitive.material];
   assert.equal(mat.name,'UDIM '+tileIds[i]);
   for(const [j,role] of ['baseColor','normal','metallicRoughness'].entries()){
    const image=model.images[mat[role].image];
    assert.equal(image.name,tiles[i*3+j].name);
    assert.deepEqual(Buffer.from(image.data.split(',')[1],'base64'),Buffer.from(await tiles[i*3+j].arrayBuffer()));
    assert.equal(mat[role].sampler.wrapS,33071);
   }
   assert.equal(mat.occlusion.image,mat.metallicRoughness.image);
  }
  const glb=unpackFixture(converted);
  delete glb.json.extras;
  const standard=await readImportedTrunkGlb(repackFixture(glb));
  assert.deepEqual(standard.materials,model.materials);
  assert.deepEqual(standard.primitives,model.primitives);
 });
}

test('missing, duplicate, and cross-tile input report actionable failures',async()=>{
 const source=meshFixture(-1);
 await assert.rejects(buildUdimTrunkGlb(source,tiles.filter(f=>f.name!=='树皮_BaseColor.1011.png')),/缺少 1011 的 BaseColor/);
 await assert.rejects(buildUdimTrunkGlb(source,[...tiles,tiles[0]]),/1001 有多张 BaseColor/);
 const broken=unpackFixture(source);
 broken.bin=Buffer.from(broken.bin);
 broken.bin.writeFloatLE(1.15,broken.json.bufferViews[1].byteOffset+8);
 await assert.rejects(buildUdimTrunkGlb(repackFixture(broken),tiles),/跨越瓦片/);
});

if(process.env.TREE_UDIM_FIXTURE){
 const fixture=[{name:'UDIM 验收树干.glb',base64:meshFixture(-1).toString('base64')}];
 for(const file of tiles)fixture.push({name:file.name,base64:Buffer.from(await file.arrayBuffer()).toString('base64')});
 fs.writeFileSync(process.env.TREE_UDIM_FIXTURE,JSON.stringify(fixture));
}
