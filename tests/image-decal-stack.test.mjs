import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDocument,validateDocument} from '../material/web/project-state.js';
import {validateDocument as validateServer} from '../material/project-state.js';
import {createRule,addEffect} from '../material/web/surface-effects.js';
import {sceneOverlayDefaults} from '../material/web/scene-overlay-rules.js';
import {IMAGE_DECAL_STYLE} from '../material/web/image-decal-rules.js';
import {createImageDecalCache,packImageDecalUniforms,packImageDecalAtlas,planImageDecalAtlas} from '../material/web/image-decal-atlas.js';
import {encodeImageDecalPNG} from '../material/web/image-decal-image.js';
import {NATIVE_RESOURCE_BATCH_BYTES,textureUploadPlan} from '../material/web/native-texture-stream.js';
import {packSurfaceRecipe,importSurfaceRecipe} from '../material/web/surface-recipe.js';

const source='a'.repeat(64),hash='b'.repeat(64),anchor={face:0,bary:[.5,.25,.25]};
const image={version:1,hash,width:2,height:1,name:'林场标记'};
const pixels=Uint8Array.of(255,17,44,255,31,67,109,0);

function fixture(){
 const doc=createDocument({source,name:'贴花',settings:{},actualHeightMeters:2});
 Object.assign(doc.surface,{effects:[],masks:[],areas:[],layers:[]});
 const {s}=addEffect(doc.surface,'cork',{sourceSHA256:source});
 s.masks[0].items=[createRule('scene-overlay',{scene:{
  version:1,style:IMAGE_DECAL_STYLE,role:'main',instance:'test-image',source,points:[anchor],
  params:sceneOverlayDefaults(IMAGE_DECAL_STYLE),image
 }})];
 return {...doc,surface:s};
}

test('图片跟随工程及跨模型配方，锚点只属于原源面',()=>{
 const saved=validateDocument(fixture()),key='imageDecal_'+hash;
 assert.deepEqual(validateServer(JSON.parse(JSON.stringify(saved))),saved);
 assert.equal(saved.resources[key],hash);
 const recipe=packSurfaceRecipe(saved),other=createDocument({source:'c'.repeat(64),name:'新树',settings:{}});
 const restored=importSurfaceRecipe(recipe,other),scene=restored.surface.masks[0].items[0].scene;
 assert.equal(scene.source,null);
 assert.deepEqual(scene.points,[]);
 assert.deepEqual(scene.image,image);
 assert.equal(validateDocument({...other,surface:restored.surface}).resources[key],hash);
 Object.assign(saved.surface,{effects:[],layers:[],masks:[]});
 assert(!Object.hasOwn(validateDocument(saved).resources,key));
});

test('同一槽位的四个遮罩与图片分区独立，保留透明度和投影参数',()=>{
 const mask=Uint8Array.from({length:16},(_,i)=>i*11);
 const atlas=packImageDecalAtlas(mask,2,[{...image,rgba:pixels}]),at=(x,y)=>(y*atlas.width+x)*4;
 assert.deepEqual(atlas.data.subarray(at(0,0),at(0,0)+8),mask.subarray(0,8));
 assert.deepEqual(atlas.data.subarray(at(0,1),at(0,1)+8),mask.subarray(8,16));
 const rect=atlas.rects.get(hash),pixelStart=at(...rect);
 assert.deepEqual(rect,[0,2,2,1]);
 assert.deepEqual([...atlas.data.subarray(pixelStart,pixelStart+8)],[255,17,44,255,0,0,0,0]);
 assert.equal(packImageDecalAtlas(mask,2,[]).data,mask);
 const scene=validateDocument(fixture()).surface.masks[0].items[0].scene;
 const mesh={min:[0,0,0],height:1,indices:Uint32Array.of(0,1,2),pos:Float32Array.of(0,0,0,1,0,0,0,1,0)};
 Object.assign(scene.params,{width:40,height:20,depth:5,rotation:90});
 const data=new Array(40).fill(0);
 packImageDecalUniforms(data,scene,mesh,2,atlas.rects);
 assert.deepEqual(data.slice(16,18),[1,1]);
 assert.deepEqual(data.slice(20,24),[.25,.25,0,.025]);
 assert(Math.abs(data[24])<1e-10&&Math.abs(data[25]-10)<1e-10&&Math.abs(data[28]+20)<1e-10);
 assert.deepEqual(data.slice(32,36),rect);
 const unplaced=new Array(40).fill(0);
 packImageDecalUniforms(unplaced,{...scene,points:[]},mesh,2,atlas.rects);
 assert.deepEqual(unplaced.slice(16,18),[1,0]);
});

test('切换到4K烘焙仍保留贴花原尺寸，宽幅素材可放在遮罩下方',()=>{
 const square={hash,width:4096,height:4096};
 for(const size of [1024,4096]){
  const {width,height,rects}=planImageDecalAtlas(size,[square]);
  assert.deepEqual([width,height],[size+4096,4096]);
  assert.deepEqual(rects.get(hash),[size,0,4096,4096]);
  assert.equal(width*height*4>NATIVE_RESOURCE_BATCH_BYTES,size===4096);
 }
 const wide={hash,width:16384,height:2048};
 const under=planImageDecalAtlas(4096,[wide]);
 assert.deepEqual(under.rects.get(hash),[0,4096,16384,2048]);
 assert.deepEqual([under.width,under.height],[16384,6144]);
});

test('4K宽幅贴花的末端像素能无损经过图集与DX12分块计划',()=>{
 const width=4096,height=2160,size=4096;
 const rgba=new Uint8Array(width*height*4),mask=new Uint8Array(size*size*4);
 rgba.set([99,88,77,255],(height*width-1)*4);
 rgba.set([200,120,140,64]);
 mask.set([2,4,6,8],(size*size-1)*4);
 const packed=packImageDecalAtlas(mask,size,[{hash,width,height,rgba}]);
 const [x,y,w,h]=packed.rects.get(hash),pixel=(px,py)=>[...packed.data.subarray((py*packed.width+px)*4,(py*packed.width+px)*4+4)];
 assert.deepEqual([w,h],[width,height]);
 assert.deepEqual(pixel(size-1,size-1),[2,4,6,8]);
 assert.deepEqual(pixel(x,y),[50,30,35,64]);
 assert.deepEqual(pixel(x+w-1,y+h-1),[99,88,77,255]);
 const upload=textureUploadPlan({kind:'texture',format:'u8rgba',levels:[packed]});
 assert.equal(upload.total,packed.data.byteLength);
 assert(upload.chunks.length>1);
 assert.equal(upload.chunks.reduce((total,chunk)=>total+chunk.bytes,0),upload.total);
});

test('贴花图集超出显卡预算时按比例降低大图取样，小图和原素材保持完整',()=>{
 const mask=new Uint8Array(4*4*4).fill(7),rgba=new Uint8Array(8*6*4),smallRGBA=new Uint8Array(2*2*4);
 for(let i=0;i<rgba.length;i+=4)rgba.set([255,0,0,255],i);
 for(let i=0;i<smallRGBA.length;i+=4)smallRGBA.set([0,0,255,255],i);
 const wide={hash,width:8,height:6,rgba},small={hash:source,width:2,height:2,rgba:smallRGBA};
 const packed=packImageDecalAtlas(mask,4,[wide,small],{maxTextureSize:8,maxBytes:8*8*4});
 assert(packed.width<=8&&packed.height<=8&&packed.data.byteLength<=8*8*4);
 for(const [asset,color] of [[wide,[255,0,0,255]],[small,[0,0,255,255]]]){
  const [x,y,w,h]=packed.rects.get(asset.hash);
  const start=(y*packed.width+x)*4;
  assert.deepEqual([...packed.data.subarray(start,start+4)],color);
  assert(w<=asset.width&&h<=asset.height);
  if(asset===wide)assert(w<asset.width&&h===Math.round(w*asset.height/asset.width));
  if(asset===small)assert.deepEqual([w,h],[2,2]);
 }
 assert.equal(wide.rgba.length,8*6*4);
 assert.deepEqual([...packed.data.subarray(0,16)],new Array(16).fill(7));
});

test('图集跳过隐藏图层，活跃视口与素材校验共享同一次解码',async()=>{
 const {surface}=fixture(),png=await encodeImageDecalPNG(pixels,2,1);
 let reads=0,notifications=0;
 const cache=createImageDecalCache(key=>{assert.equal(key,hash);reads++;return png;},{onImage(){notifications++;}});
 surface.effects[0].enabled=false;
 assert.deepEqual(await cache.load(surface,{size:2}),[]);
 assert.equal(reads,0);
 surface.effects[0].enabled=true;
 const [,loaded]=await Promise.all([cache.validate(surface),cache.load(surface,{size:2})]);
 assert.deepEqual(loaded[0].rgba,pixels);
 assert.equal(reads,1);
 assert.equal(notifications,1);
});
