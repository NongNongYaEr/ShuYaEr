import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {encodePNG, exportTextures} from '../material/core/texture-export.mjs';
import {loadExportMesh} from '../material/core/export-mesh.mjs';
import {writeSourcePbrGLB} from '../material/core/source-pbr-glb.mjs';
import {parseSourcePbrGLB} from '../material/source-pbr.js';
import {encodeUvResult} from '../material/mesh-codec.js';
import {applyUvResult} from '../material/working-mesh.js';
import {bakedPreviewKey, inspectBakedManifest} from '../material/web/baked-preview.js';

const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const color = rgb => encodePNG(1, 1, Uint8Array.of(...rgb, 255));
const originalPNG = color([37, 88, 146]);
const barkPNG = color([119, 73, 37]);
const bakedPNG = color([224, 230, 232]);
const bakedNormal = color([128, 128, 255]);
const bakedORM = color([230, 190, 54]);

function makeFixture() {
  const chunks = [], views = [], accessors = [];
  let length = 0;
  function add(data) {
    const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const index = views.push({buffer:0, byteOffset:length, byteLength:bytes.length}) - 1;
    const padding = (4 - bytes.length % 4) % 4;
    chunks.push(bytes, Buffer.alloc(padding));
    length += bytes.length + padding;
    return index;
  }
  function attr(array, type, size) {
    const integer = type === 'SCALAR';
    const bufferView = add((integer ? Uint16Array : Float32Array).from(array));
    return accessors.push({bufferView, componentType:integer ? 5123 : 5126, count:array.length / size, type}) - 1;
  }
  const positions = [0,0,0, 1,0,0, 1,1,0, 0,1,0];
  const normal = [0,0,1], tangent = [1,0,0,1];
  const primitive = (count, uv, material, id) => ({
    attributes:{
      POSITION:attr(positions.slice(0, count * 3), 'VEC3', 3),
      NORMAL:attr(Array.from({length:count}, () => normal).flat(), 'VEC3', 3),
      TANGENT:attr(Array.from({length:count}, () => tangent).flat(), 'VEC4', 4),
      TEXCOORD_0:attr(uv, 'VEC2', 2),
      COLOR_0:attr(Array.from({length:count}, () => [.5,.75,1]).flat(), 'VEC3', 3)
    },
    indices:attr(count === 4 ? [0,1,2, 0,2,3] : [0,1,2], 'SCALAR', 1),
    material, extras:{branchforgeSourcePrimitiveId:id}
  });
  const bark = primitive(4, [0,0, 2,0, 2,2, 0,2], 0, 'bark-source');
  const stone = primitive(3, [0,0, 1,0, 1,1], 1, 'stone-source');
  stone.attributes.TEXCOORD_1 = attr([.25,.25, .75,.25, .75,.75], 'VEC2', 2);
  const stoneBase = {index:1, extensions:{KHR_texture_transform:{texCoord:1, offset:[.2,.1], scale:[2,1], rotation:.1}}};
  const materials = [
    {name:'Bark', doubleSided:true, pbrMetallicRoughness:{baseColorTexture:{index:0}, roughnessFactor:.8}},
    {name:'Stone', pbrMetallicRoughness:{baseColorTexture:stoneBase, baseColorFactor:[.8,.9,1,1], metallicFactor:.3},
      normalTexture:{index:1, texCoord:1, scale:.4}, occlusionTexture:{index:1, texCoord:1, strength:.65}}
  ];
  const images = [
    {bufferView:add(barkPNG), mimeType:'image/png', name:'source-bark'},
    {bufferView:add(originalPNG), mimeType:'image/png', name:'source-stone'}
  ];
  const doc = {asset:{version:'2.0'}, scene:0, scenes:[{nodes:[0,1]}], extensionsUsed:['KHR_texture_transform'],
    nodes:[{mesh:0}, {mesh:1, translation:[3,0,0], scale:[-1,1,1]}],
    meshes:[{primitives:[bark]}, {primitives:[stone]}], buffers:[{byteLength:length}], bufferViews:views, accessors,
    images, materials, textures:[{source:0}, {source:1, sampler:0}], samplers:[{wrapS:33648, wrapT:33071, magFilter:9728}]};
  const json = Buffer.from(JSON.stringify(doc)), jsonLength = Math.ceil(json.length / 4) * 4;
  const out = Buffer.alloc(28 + jsonLength + length);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jsonLength, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  json.copy(out, 20);
  out.fill(32, 20 + json.length, 20 + jsonLength);
  out.writeUInt32LE(length, 20 + jsonLength);
  out.writeUInt32LE(0x004e4942, 24 + jsonLength);
  Buffer.concat(chunks).copy(out, 28 + jsonLength);
  return out;
}

async function fixture() {
  const input = makeFixture();
  const source = await parseSourcePbrGLB(buffer(input), 'bark + stone.glb');
  const sourceIndices = Uint32Array.of(3,2,5,0,6,4,1,0,2);
  const copy = (data, n) => Float32Array.from({length:sourceIndices.length * n},
    (_, i) => data[sourceIndices[Math.floor(i / n)] * n + i % n]);
  const result = {
    sourceIndices, pos:copy(source.pos, 3), normal:copy(source.normal, 3), tangent:copy(source.tangent, 4),
    uv:Float32Array.of(.8,.45, .4,.4, .75,.8, .1,.1, .6,.8, .6,.65, .4,.1, .5,.1, .8,.1),
    chartIds:Int32Array.of(1,0,2,0,2,2,0,1,1), indices:Uint32Array.of(3,6,1, 7,8,0, 5,4,2)
  };
  const mesh = await applyUvResult(source, result);
  return {input, source, mesh};
}

const materialBase = {version:1, kind:'source-pbr', affectedSlots:[0]};
const images = {baseColor:bakedPNG, normal:bakedNormal, orm:bakedORM};
const options = {images, actualHeightMeters:2, name:'bark + stone'};

test('overlay GLB preserves the original stone PBR and UV1 alongside baked bark slots', async () => {
  const {source, mesh} = await fixture();
  const {data, outputUvSHA256, preservedSlots} = writeSourcePbrGLB(mesh, source, materialBase, options);
  const reopened = await parseSourcePbrGLB(buffer(data), 'result.glb');
  const {doc, primitives} = reopened.sourcePbr, sourceDoc = source.sourcePbr.doc;
  assert.deepEqual(preservedSlots, [1]);
  assert.equal(reopened.uvSHA256, outputUvSHA256);
  assert.equal(reopened.height, 2);
  assert.deepEqual(primitives.map(p => [p.materialIndex, p.id, p.indexCount, p.vertexCount]),
    [[0, 'bark-source', 6, 6], [1, 'stone-source', 3, 3]]);
  const expectedStone = structuredClone(sourceDoc.materials[1]);
  for (const info of [expectedStone.pbrMetallicRoughness.baseColorTexture, expectedStone.normalTexture,
    expectedStone.occlusionTexture]) info.index = 0;
  assert.deepEqual(doc.materials[1], expectedStone);
  assert.deepEqual(doc.textures[0], {source:0, sampler:sourceDoc.textures[1].sampler});
  assert.deepEqual(doc.samplers[0], sourceDoc.samplers[0]);
  assert.deepEqual(Buffer.from(await reopened.sourcePbr.images[0].arrayBuffer()), originalPNG);
  assert.ok(!doc.images.some(image => image.name === 'source-bark'));
  assert.deepEqual(reopened.extraAttributes.TEXCOORD_1.data.slice(-6), source.extraAttributes.TEXCOORD_1.data.slice(-6));
  assert.deepEqual(reopened.extraAttributes.COLOR_0.data.slice(-12), source.extraAttributes.COLOR_0.data.slice(-12));
  assert.deepEqual(reopened.uv.slice(-6), source.uv.slice(-6));
  assert.deepEqual(reopened.tangent.slice(-12), source.tangent.slice(-12));
  assert.equal(doc.materials[0].pbrMetallicRoughness.baseColorTexture.index, 1);
  assert.equal(doc.materials[0].pbrMetallicRoughness.metallicFactor, 1);
  assert.equal(doc.materials[0].doubleSided, true);
  assert.deepEqual(doc.materials[0].pbrMetallicRoughness.baseColorTexture, {index:1});
  assert.deepEqual(Buffer.from(await reopened.sourcePbr.images[1].arrayBuffer()), bakedPNG);
  assert.equal(doc.meshes[0].primitives[0].attributes.COLOR_0, undefined);
  for (let corner = 0; corner < reopened.indices.length; corner++) {
    const at = reopened.indices[corner], before = source.indices[corner], work = mesh.indices[corner];
    assert.deepEqual(reopened.pos.slice(at * 3, at * 3 + 3), source.pos.slice(before * 3, before * 3 + 3).map(x => x * 2));
    assert.ok(reopened.normal.slice(at * 3, at * 3 + 3).every((value, i) => value === source.normal[before * 3 + i]));
    if (corner < 6) assert.deepEqual(reopened.uv.slice(at * 2, at * 2 + 2), mesh.uv.slice(work * 2, work * 2 + 2));
  }
});

test('empty effect scope keeps all original PBR slots and rejects nonexistent slots', async () => {
  const {source, mesh} = await fixture();
  const {data, outputUvSHA256} = writeSourcePbrGLB(mesh, source, {...materialBase, affectedSlots:[]}, options);
  const reopened = await parseSourcePbrGLB(buffer(data), 'unchanged.glb');
  assert.deepEqual(reopened.sourcePbr.doc.materials, source.sourcePbr.doc.materials);
  assert.deepEqual(reopened.indices, source.indices);
  assert.equal(outputUvSHA256, source.uvSHA256);
  assert.throws(() => writeSourcePbrGLB(mesh, source, {...materialBase, affectedSlots:[8]}, options), /不存在/);
});

test('the shared export service verifies source resources and always pairs the overlay GLB', async () => {
  const {input, source, mesh} = await fixture();
  const tmp = fs.realpathSync(os.tmpdir()), root = fs.mkdtempSync(path.join(tmp, 'source-pbr-export-'));
  try {
    const meta = {width:256, height:256, padding:3, modelName:'bark-stone.glb', actualHeightMeters:2,
      materialBase, sourceSHA256:source.sourceSHA256, uvSHA256:mesh.uvSHA256, uvMode:'unwrap', uvRevision:1,
      includeModel:false, resources:{source:'src', working:'work'}};
    const store = {get:key => Buffer.from(key === 'src' ? input : encodeUvResult(mesh))};
    const verified = await loadExportMesh(meta, store);
    await assert.rejects(loadExportMesh({...meta, sourceSHA256:'wrong'}, store), /不一致/);
    const head = Buffer.from(JSON.stringify(meta)), length = Buffer.alloc(4);
    length.writeUInt32LE(head.length);
    const pixels = Buffer.alloc(256 * 256 * 4, 255);
    const payload = Buffer.concat([length, head, pixels, pixels, pixels]);
    const output = exportTextures(payload, {root, deferCommit:true, ...verified});
    const manifest = JSON.parse(fs.readFileSync(path.join(output.stage, 'material_manifest.json')));
    const reopened = await parseSourcePbrGLB(buffer(fs.readFileSync(path.join(output.stage, manifest.model.file))), 'packed.glb');
    assert.ok(output.model);
    assert.deepEqual(manifest.materialBase, {...materialBase, preservedSlots:[1]});
    assert.equal(manifest.outputUvSHA256, reopened.uvSHA256);
    assert.equal(manifest.workingUvSHA256, mesh.uvSHA256);
    const project = {output:{resolution:256, padding:3}, actualHeightMeters:2, materialBase};
    const context = {project, model:mesh};
    assert.equal(inspectBakedManifest(manifest, context).length, 3);
    assert.throws(() => inspectBakedManifest(manifest, {...context, project:{...project,
      materialBase:{...materialBase, affectedSlots:[1]}}}), /不一致/);
    assert.notEqual(bakedPreviewKey(context), bakedPreviewKey({...context, project:{...project,
      materialBase:{...materialBase, affectedSlots:[]}}}));
    const {materialBase:discarded, ...legacyManifest} = manifest;
    assert.equal(inspectBakedManifest({...legacyManifest, uvPolicy:'source_gltf_uv0_no_extra_flip', tangentBasis:'MikkTSpace'},
      {project:{...project, materialBase:null}, model:mesh}).length, 3);
  } finally {
    if (path.dirname(fs.realpathSync(root)) === tmp) fs.rmSync(root, {recursive:true, force:true});
  }
});
