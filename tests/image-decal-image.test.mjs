import assert from 'node:assert/strict';
import test from 'node:test';
import {decodeDataPNG as decodeServerPNG} from '../material/png-data.js';
import {IMAGE_DECAL_MAX_PIXELS} from '../material/web/image-decal-rules.js';
import {
 IMAGE_DECAL_MAX_BYTES,IMAGE_DECAL_MAX_SIDE,decodeImageDecalPNG,encodeImageDecalPNG,inspectImageDecal,prepareImageDecal
} from '../material/web/image-decal-image.js';

const fixture=base64=>Uint8Array.from(Buffer.from(base64,'base64'));
const indexedPNG=fixture('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABAQMAAADO7O3JAAAABlBMVEUMIjjmxKcWcF2NAAAAAnRSTlMC63N9lEoAAAAKSURBVHicY3AAAABCAEEpN/TvAAAAAElFTkSuQmCC');
const keyedPNG=fixture('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAABnRSTlMADAAiADi4ncCAAAAAD0lEQVR4nGPgUbJ4dmQ5AAa6AriXdjfXAAAAAElFTkSuQmCC');
const widePNG=fixture('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABEAYAAACksqPJAAAAGUlEQVR4nGOQ+dbY+OIFI+MnawaebdsYGABBJAaM25eFyAAAAABJRU5ErkJggg==');
const jpeg=fixture('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAIBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAB//EABoQAAEFAQAAAAAAAAAAAAAAAAYAAgQ2dbP/2gAIAQEAAD8ASw2jD+bG5NX/2Q==');
const webp=fixture('UklGRiQAAABXRUJQVlA4TBcAAAAvAQAAEA9wEdEzaB/n7QLpAY8KRPQ/AAA=');
const animatedWebp=fixture('UklGRo4AAABXRUJQVlA4WAoAAAASAAAAAQAAAAAAQU5JTQYAAAAAAAAAAABBTk1GMAAAAAAAAAAAAAEAAAAAAGQAAAJWUDhMFwAAAC8BAAAQD3AR0TNoH+ftAukBjwpE9D8AAEFOTUYqAAAAAAAAAAAAAQAAAAAAZAAAAlZQOEwRAAAALwEAABAHUIZ+NqMtgYjofwAA');

test('import and reopen retain straight RGB even when the PNG alpha is zero or one',async()=>{
 const rgba=Uint8Array.of(13,97,227,1,18,19,23,0,248,35,62,129,44,80,115,255);
 const inbound=await encodeImageDecalPNG(rgba,2,2);
 const prepared=await prepareImageDecal(new Blob([inbound],{type:'image/jpeg'}));
 assert.equal(prepared.mimeType,'image/png');
 assert.equal(prepared.sourceWidth,2);
 assert.equal(prepared.sourceHeight,2);
 assert.deepEqual(prepared.rgba,rgba);
 const decoded=await decodeImageDecalPNG(prepared.bytes);
 assert.deepEqual(decoded,{width:2,height:2,rgba,hasAlpha:true});
 const persisted=await decodeServerPNG(prepared.bytes,'rgba');
 assert.equal(persisted.format,'rgba8');
 assert.deepEqual(persisted.data,rgba);
});

test('indexed, transparent color key and 16-bit PNG all use direct RGBA conversion',async()=>{
 const cases=[
  [indexedPNG,Uint8Array.of(12,34,56,2,230,196,167,235)],
  [keyedPNG,Uint8Array.of(12,34,56,0,230,196,167,255)],
  [widePNG,Uint8Array.of(29,129,232,1,241,0,182,0)]
 ];
 for(const [bytes,expected] of cases){
  const prepared=await prepareImageDecal(new Blob([bytes]),{decode:()=>assert.fail('PNG should bypass the browser bitmap')});
  assert.deepEqual(prepared.rgba,expected);
  assert.deepEqual((await decodeImageDecalPNG(prepared.bytes)).rgba,expected);
 }
});

test('reducing a cutout keeps its aspect ratio and has no hidden-pixel color bleed',async()=>{
 const rgba=Uint8Array.of(255,0,0,255,0,0,255,0,255,0,0,255,0,0,255,0,255,0,0,255,0,0,255,0,255,0,0,255,0,0,255,0);
 const png=await encodeImageDecalPNG(rgba,2,4);
 const prepared=await prepareImageDecal(new Blob([png]),{maxSide:2});
 assert.equal(prepared.width,1);
 assert.equal(prepared.height,2);
 assert.equal(prepared.sourceWidth,2);
 assert.equal(prepared.sourceHeight,4);
 assert.deepEqual(prepared.rgba,Uint8Array.of(255,0,0,128,255,0,0,128));
});

test('static JPEG and WebP use the sniffed type and measured dimensions at decoder dispatch',async()=>{
 for(const [bytes,mimeType,alpha] of [[jpeg,'image/jpeg',255],[webp,'image/webp',72]]){
  const rgba=Uint8Array.of(17,45,219,alpha,230,196,167,255);
  const decode=async(blob,info)=>{
   assert.equal(blob.type,mimeType);
   assert.equal(info.maxSide,IMAGE_DECAL_MAX_SIDE);
   assert.equal(info.width,2);
   assert.equal(info.height,1);
   assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),bytes);
   return{width:2,height:1,sourceWidth:2,sourceHeight:1,rgba};
  };
  const prepared=await prepareImageDecal(new Blob([bytes],{type:'text/plain'}),{decode});
  assert.equal(prepared.mimeType,mimeType);
  assert.equal(prepared.hasAlpha,alpha<255);
  assert.deepEqual((await decodeImageDecalPNG(prepared.bytes)).rgba,rgba);
 }
});

test('malformed, animated, non-local and oversized inputs are rejected before decoding',async()=>{
 const noDecode=()=>assert.fail('invalid input reached the decoder');
 await assert.rejects(prepareImageDecal('https://example.com/image.png',{decode:noDecode}),/静态 PNG/);
 await assert.rejects(prepareImageDecal(new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'],{type:'image/png'}),{decode:noDecode}),/静态 PNG/);
 await assert.rejects(prepareImageDecal(new Blob([animatedWebp]),{decode:noDecode}),/静态 WebP/);
 const oversizedFile=new Blob();
 Object.defineProperty(oversizedFile,'size',{value:IMAGE_DECAL_MAX_BYTES+1});
 await assert.rejects(prepareImageDecal(oversizedFile,{decode:noDecode}),/160 MB/);
 const original=await encodeImageDecalPNG(Uint8Array.of(23,31,45,255),1,1);
 const oversized=original.slice();
 const dimensions=new DataView(oversized.buffer);
 dimensions.setUint32(16,IMAGE_DECAL_MAX_SIDE+1);
 assert.throws(()=>inspectImageDecal(oversized),new RegExp(IMAGE_DECAL_MAX_SIDE));
 dimensions.setUint32(16,7680);
 dimensions.setUint32(20,4320);
 assert.deepEqual(inspectImageDecal(oversized),{mimeType:'image/png',width:7680,height:4320,bitDepth:8,colorType:6});
 dimensions.setUint32(16,8192);
 dimensions.setUint32(20,IMAGE_DECAL_MAX_PIXELS/8192+1);
 assert.throws(()=>inspectImageDecal(oversized),new RegExp(IMAGE_DECAL_MAX_PIXELS));
 const apng=new Uint8Array(original.length+20);
 apng.set(original.subarray(0,33));
 apng.set([0,0,0,8,97,99,84,76],33); // acTL before the IDAT stream
 apng.set(original.subarray(33),53);
 await assert.rejects(prepareImageDecal(new Blob([apng]),{decode:noDecode}),/静态 PNG/);
 const badCRC=original.slice();
 badCRC[42]^=1;
 await assert.rejects(decodeImageDecalPNG(badCRC),/CRC/);
});

test('cancellation skips a pending import and discards prepared bitmap pixels',async()=>{
 const controller=new AbortController();
 const decode=async()=>{
  controller.abort();
  return{width:2,height:1,sourceWidth:2,sourceHeight:1,rgba:Uint8Array.of(2,3,4,255,5,6,7,255)};
 };
 await assert.rejects(prepareImageDecal(new Blob([jpeg]),{decode,signal:controller.signal}),{name:'AbortError'});
 await assert.rejects(prepareImageDecal(new Blob([jpeg]),{decode:()=>assert.fail(),signal:controller.signal}),{name:'AbortError'});
});
