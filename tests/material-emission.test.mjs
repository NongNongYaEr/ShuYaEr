import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {validateEmission,emissionMaximum,defaultEmission} from '../material/web/emission-rules.js';
import {createDocument,validateDocument} from '../material/web/project-state.js';
import {validateDocument as serverValidate} from '../material/project-state.js';
import {EFFECT_LIBRARY_BUILTINS,instantiateLibraryEntry} from '../material/web/effect-library.js';
import {flattenLayerSurface} from '../material/web/surface-layers.js';
import {encodePNG} from '../material/core/png-write.mjs';
import {decodeBakeRGB} from '../material/core/png-rgb-read.mjs';
import {parseBakePayload,exportTextures} from '../material/core/texture-export.mjs';
import {writeGLB} from '../material/web/glb-writer.js';
import {readImportedTrunkGlb} from '../web/imported-trunk-glb.js';
import {validateImportedTrunk} from '../web/imported-trunk-data.js';
import {stageBakedPreviewTextures} from '../material/web/baked-preview-textures.js';
import {encodeEmissionPNG} from '../material/web/emission-png-session.js';
const unpackFixture=bytes=>{const b=Buffer.from(bytes);return{json:JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)).trim()),bin:b.subarray(28+b.readUInt32LE(12))};};
const repackFixture=({json,bin})=>{const t=Buffer.from(JSON.stringify(json)),j=Buffer.alloc(Math.ceil(t.length/4)*4,32),h=Buffer.alloc(20),b=Buffer.alloc(8);t.copy(j);h.writeUInt32LE(0x46546c67);h.writeUInt32LE(2,4);h.writeUInt32LE(28+j.length+bin.length,8);h.writeUInt32LE(j.length,12);h.writeUInt32LE(0x4e4f534a,16);b.writeUInt32LE(bin.length);b.writeUInt32LE(0x004e4942,4);return Buffer.concat([h,j,b,bin]);};
import {createImportedTrunkMaterial} from '../web/imported-trunk-runtime.js';
const entry=EFFECT_LIBRARY_BUILTINS.find(e=>e.recipeId==='O10-6');
function doc(){const d=createDocument({source:'a'.repeat(64),name:'裂光',settings:{}});Object.assign(d.surface,{effects:[],layers:[],masks:[],areas:[]});d.surface=instantiateLibraryEntry(d,entry).surface;return validateDocument(d);}
test('第60套发光配方前后端一致，组关闭/透明度参与范围，参数受限',()=>{
 const d=doc();assert.deepEqual(serverValidate(d),d);assert.equal(d.surface.effects[0].emission.strength,2.5);
 assert.equal(emissionMaximum(flattenLayerSurface(d.surface)),2.5);d.surface.effects[0].enabled=false;assert.equal(emissionMaximum(flattenLayerSurface(d.surface)),0);
 for(const bad of [{strength:NaN},{strength:21},{enabled:1},{color:'green'},{pattern:'bloom'},{softness:0}])assert.throws(()=>validateEmission({...defaultEmission(),...bad}));
});
const n=256,raw=Buffer.alloc(n*n*4);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=(y*n+x)*4;raw.set([x,y,(x+y)%256,255],i);}const png=encodePNG(n,n,raw);
test('发光压缩包有界解码，保持非对称行方向；旧三图包兼容，坏元数据拒绝',()=>{
 assert.deepEqual(decodeBakeRGB(png,n),raw);assert.throws(()=>decodeBakeRGB(png,512));
 const payload=meta=>{const h=Buffer.from(JSON.stringify({width:n,height:n,padding:0,...meta})),b=Buffer.alloc(4);b.writeUInt32LE(h.length);return Buffer.concat([b,h,raw,raw,raw,...(meta?.emission?[png]:[])]);};
 assert.equal(parseBakePayload(payload({})).emissionPNG,null);assert.deepEqual(parseBakePayload(payload({emission:{version:1,encoding:'png-srgb',byteLength:png.length,strength:2.5}})).emissionPNG,png);
 assert.throws(()=>parseBakePayload(payload({emission:{version:1,encoding:'png-srgb',byteLength:png.length+1,strength:2.5}})));
 const root=fs.mkdtempSync(fileURLToPath(new URL('../.runtime/v050-build/emission-probe-',import.meta.url)));
 try{const p=payload({modelName:'裂光',includeModel:false,sourceSHA256:'a'.repeat(64),uvSHA256:'b'.repeat(64),emission:{version:1,encoding:'png-srgb',byteLength:png.length,strength:2.5}}),r=exportTextures(p,{root}),m=JSON.parse(fs.readFileSync(path.join(r.folder,'material_manifest.json')));assert.equal(m.maps.emissive.strength,2.5);assert.equal(m.maps.emissive.colorSpace,'sRGB');assert.deepEqual(decodeBakeRGB(fs.readFileSync(path.join(r.folder,m.maps.emissive.file)),n),raw);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
const mesh={pos:new Float32Array([0,0,0,1,0,0,0,1,0]),normal:new Float32Array([0,0,1,0,0,1,0,0,1]),tangent:new Float32Array([1,0,0,1,1,0,0,1,1,0,0,1]),uv:new Float32Array([0,0,1,0,0,1]),indices:new Uint32Array([0,1,2]),height:1,sourceSHA256:'a'.repeat(64),uvSHA256:'b'.repeat(64)};
test('GLB真实第四张发光图与强度，经树干读取、原生材质输入和重载保留；不发光保持三图',async()=>{
 const bytes=writeGLB(mesh,{images:{baseColor:png,normal:png,orm:png,emissive:png},emissiveStrength:2.5}),parsed=unpackFixture(bytes),m=parsed.json.materials[0];assert.equal(parsed.json.images.length,4);assert.equal(m.emissiveTexture.index,3);assert.equal(m.extensions.KHR_materials_emissive_strength.emissiveStrength,2.5);assert(!m.extensions.KHR_materials_unlit);
 const asset=await readImportedTrunkGlb(bytes,{name:'裂光.glb'});validateImportedTrunk(asset);assert.deepEqual(asset.materials[0].emissiveFactor,[2.5,2.5,2.5]);const restored=JSON.parse(JSON.stringify(asset));validateImportedTrunk(restored);const material=createImportedTrunkMaterial(restored,0);assert.deepEqual(material.emissive.toArray(),[2.5,2.5,2.5]);material.dispose();
 assert.equal(unpackFixture(writeGLB(mesh,{images:{baseColor:png,normal:png,orm:png}})).json.images.length,3);
 parsed.json.materials[0].extensions.KHR_materials_emissive_strength.emissiveStrength=-1;await assert.rejects(()=>readImportedTrunkGlb(repackFixture(parsed)));
});
test('含发光4K检查保持256MiB预算，压缩任务可取消并释放线程',async()=>{
 let closed=false;assert.throws(()=>stageBakedPreviewTextures({}, {bakedEmission:{close(){closed=true;}}},{resolution:4096}),/含发光的 4K/);assert(closed);
 let stopped=0,posted=0;const workerFactory=()=>({terminate(){stopped++;},postMessage(){posted++;}});
 await assert.rejects(()=>encodeEmissionPNG(256,new Uint8Array(256*256*4),{shouldCancel:()=>true,workerFactory}),e=>e.name==='AbortError');assert.equal(posted,0);assert.equal(stopped,1);
 let worker;const pending=encodeEmissionPNG(256,new Uint8Array(256*256*4),{workerFactory:()=>worker={terminate(){stopped++;},postMessage(){this.onmessage({data:{png:new Uint8Array(png)}});}}});assert.deepEqual(await pending,new Uint8Array(png));assert.equal(stopped,2);
});
