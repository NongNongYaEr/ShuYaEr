import assert from 'node:assert/strict';
import {createHash,randomFillSync} from 'node:crypto';
import {test} from 'node:test';
import {packRecipe,unpackRecipe} from '../material/web/material-recipe.js';
import {unpackRecipe as unpackServerRecipe} from '../material/material-recipe.js';
import {createDocument,validateDocument} from '../material/web/project-state.js';
import {createRule,addEffect} from '../material/web/surface-effects.js';
import {sceneOverlayDefaults} from '../material/web/scene-overlay-rules.js';
import {packSurfaceRecipe,importSurfaceRecipe} from '../material/web/surface-recipe.js';
import {IMAGE_DECAL_STYLE} from '../material/web/image-decal-rules.js';
import {createImageDecalCache} from '../material/web/image-decal-atlas.js';
import {encodeImageDecalPNG,prepareImageDecal} from '../material/web/image-decal-image.js';
import {MICRODETAIL_DEFAULTS} from '../material/web/microdetail-rules.js';
import {defaultLayers} from '../material/web/material-layers.js';

const source='a'.repeat(64),anchor={face:7,bary:[.5,.25,.25]};
const raw=Uint8Array.of(217,4,160,255,76,155,229,0);
const hashOf=bytes=>createHash('sha256').update(bytes).digest('hex');
const base=async()=>({settings:{},layers:defaultLayers(),physicalWidthMeters:1,paintHeightMeters:0,bark:await encodeImageDecalPNG(raw,2,1)});
const document=asset=>{
 const doc=createDocument({source,name:'配方测试',settings:{}});
 let surface=doc.surface;
 Object.assign(surface,{effects:[],masks:[],areas:[],layers:[]});
 if(asset)for(let i=0;i<2;i++){
  const {s}=addEffect(surface,'cork',{sourceSHA256:source});
  s.masks.at(-1).items=[createRule('scene-overlay',{scene:{
   version:1,style:IMAGE_DECAL_STYLE,role:'main',instance:'sample-'+i,source,points:[anchor],
   params:sceneOverlayDefaults(IMAGE_DECAL_STYLE),image:asset
  }})];
  surface=s;
 }
 return validateDocument({...doc,surface});
};

function rewriteHeader(bytes,edit){
 const headLength=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(8,true);
 const metadata=JSON.parse(new TextDecoder().decode(bytes.subarray(12,12+headLength)));
 edit(metadata);
 const newHead=new TextEncoder().encode(JSON.stringify(metadata)),images=bytes.subarray(12+headLength);
 const result=new Uint8Array(12+newHead.length+images.length);
 result.set(bytes.subarray(0,8));
 new DataView(result.buffer).setUint32(8,newHead.length,true);
 result.set(newHead,12);
 result.set(images,12+newHead.length);
 return result;
}

test('v11 embeds each referenced PNG once and restores the exact pixels on another model',async()=>{
 const inputs=await base(),png=await encodeImageDecalPNG(raw,2,1);
 const hash=hashOf(png),asset={version:1,hash,width:2,height:1,name:'林场标记'};
 const original=document(asset),surfaceRecipe=packSurfaceRecipe(original);
 const packed=await packRecipe({...inputs,surfaceRecipe,imageDecalFiles:{[hash]:png}});
 const recipe=await unpackRecipe(packed);
 assert.equal(recipe.version,11);
 assert.deepEqual(recipe.decals,[{hash,length:png.length}]);
 assert.deepEqual(recipe.imageDecalFiles,{[hash]:png});
 assert.deepEqual(await unpackServerRecipe(packed),recipe);
 const sameModel=importSurfaceRecipe(recipe.surfaceRecipe,document());
 assert.deepEqual(sameModel.surface.masks.map(m=>m.items[0].scene.points),[[anchor],[anchor]]);
 const other=createDocument({source:'e'.repeat(64),name:'不同树',settings:{}});
 const moved=importSurfaceRecipe(recipe.surfaceRecipe,other);
 assert.deepEqual(moved.surface.masks.map(m=>m.items[0].scene.points),[[],[]]);
 let reads=0;
 const emptyInstall=createImageDecalCache(key=>{reads++;return recipe.imageDecalFiles[key];});
 const images=await emptyInstall.load(moved.surface);
 assert.equal(reads,1);
 assert.deepEqual(images,[{hash,width:2,height:1,rgba:raw,hasAlpha:true}]);
 assert.equal(validateDocument({...other,surface:moved.surface}).resources['imageDecal_'+hash],hash);
});

test('4K input and portable recipe preserve high-entropy RGBA beyond the old PNG size limit',async()=>{
 const size=4096;
 // Incompressible data exercises the canonical PNG byte cap as well as the dimensions.
 const original=randomFillSync(new Uint8Array(size*size*4)),pixelsHash=hashOf(original);
 const input=await encodeImageDecalPNG(original,size,size);
 assert(input.length>50_000_000);

 const imported=await prepareImageDecal(new Blob([input],{type:'image/png'}));
 assert.deepEqual([imported.width,imported.height],[size,size]);
 assert.equal(hashOf(imported.rgba),pixelsHash);
 const hash=hashOf(imported.bytes),asset={version:1,hash,width:size,height:size,name:'4K 贴花'};
 const surfaceRecipe=packSurfaceRecipe(document(asset)),inputs=await base();
 const packed=await packRecipe({...inputs,surfaceRecipe,imageDecalFiles:{[hash]:imported.bytes}});
 const recipe=await unpackServerRecipe(packed);
 assert.equal(hashOf(recipe.imageDecalFiles[hash]),hash);

 const freshCache=createImageDecalCache(key=>recipe.imageDecalFiles[key]);
 const [restored]=await freshCache.load(recipe.surfaceRecipe.surface);
 assert.deepEqual([restored.width,restored.height],[size,size]);
 assert.equal(hashOf(restored.rgba),pixelsHash);
});

test('recipe rejects missing, wrong dimensions, corrupt bytes and incorrect asset hashes',async()=>{
 const inputs=await base(),png=await encodeImageDecalPNG(raw,2,1);
 const hash=hashOf(png),asset={version:1,hash,width:2,height:1,name:'贴花'};
 const surfaceRecipe=packSurfaceRecipe(document(asset));
 await assert.rejects(packRecipe({...inputs,surfaceRecipe}),/缺少图片贴花素材/);
 const otherShape=await encodeImageDecalPNG(raw,1,2);
 await assert.rejects(packRecipe({...inputs,surfaceRecipe,imageDecalFiles:{[hash]:otherShape}}),/与素材记录不一致/);
 const otherPixels=await encodeImageDecalPNG(Uint8Array.of(0,11,97,255,76,155,229,0),2,1);
 await assert.rejects(packRecipe({...inputs,surfaceRecipe,imageDecalFiles:{[hash]:otherPixels}}),/素材校验失败/);
 const packed=await packRecipe({...inputs,surfaceRecipe,imageDecalFiles:{[hash]:png}}),corrupt=packed.slice();
 corrupt[corrupt.length-1]^=1;
 await assert.rejects(unpackRecipe(corrupt),/CRC/);
 await assert.rejects(unpackRecipe(rewriteHeader(packed,metadata=>{metadata.decals=[null];})),/素材长度无效/);
 await assert.rejects(unpackRecipe(rewriteHeader(packed,metadata=>{metadata.decals=[];})),/素材列表无效/);
 await assert.rejects(unpackRecipe(rewriteHeader(packed,metadata=>{metadata.version=10;delete metadata.decals;})),/缺少便携贴花素材/);
});

test('legacy recipe versions preserve material fields without embedded decals',async()=>{
 const inputs=await base(),scene=packSurfaceRecipe(document());
 const [v1,v2,v3,v4,v10]=await Promise.all([
  packRecipe(inputs),packRecipe({...inputs,heightMap:inputs.bark}),packRecipe({...inputs,normalMap:inputs.bark}),
  packRecipe({...inputs,microdetail:MICRODETAIL_DEFAULTS}),packRecipe({...inputs,surfaceRecipe:scene})
 ]);
 const legacy=[[1,v1],[2,v2],[3,v3],[4,v4],[10,v10]];
 for(let version=5;version<10;version++)legacy.push([version,rewriteHeader(v10,header=>{header.version=version;})]);
 for(const [version,packed] of legacy){
  const recipe=await unpackRecipe(packed);
  assert.equal(recipe.version,version);
  assert.deepEqual(recipe.bark,inputs.bark);
  assert.equal(Object.hasOwn(recipe,'imageDecalFiles'),false);
  assert.deepEqual(await unpackServerRecipe(packed),recipe);
 }
 const spoof=await unpackRecipe(rewriteHeader(v10,header=>{header.imageDecalFiles={rogue:true};}));
 assert.equal(Object.hasOwn(spoof,'imageDecalFiles'),false);
});
