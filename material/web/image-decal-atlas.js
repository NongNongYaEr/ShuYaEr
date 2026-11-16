import {decodeImageDecalPNG,resizeImageDecalRGBA} from './image-decal-image.js';
import {imageDecalsInSurface} from './image-decal-rules.js';
import {localPatchFrame} from './local-patch-analysis.js';
import {NATIVE_TEXTURE_TOTAL_BYTES} from './native-texture-stream.js';

const decodedCacheBudget=128*1024*1024;

export function createImageDecalCache(read,{onImage}={}){
 const entries=new Map(),loading=new Map();
 let bytes=0;
 function remember(hash,image){
  const previous=entries.get(hash);
  if(previous!==image)onImage?.(hash,image);
  bytes-=previous?.rgba.byteLength||0;
  entries.delete(hash);
  if(image.rgba.byteLength>decodedCacheBudget)return;
  entries.set(hash,image);
  bytes+=image.rgba.byteLength;
  while(bytes>decodedCacheBudget||entries.size>16){
   const oldest=entries.keys().next().value;
   bytes-=entries.get(oldest).rgba.byteLength;
   entries.delete(oldest);
  }
 }
 async function readImage(hash){
  const data=await read(hash);
  return decodeImageDecalPNG(data instanceof Uint8Array?data:new Uint8Array(data));
 }
 async function get(hash,asset){
  let image=entries.get(hash);
  if(!image){
   let pending=loading.get(hash);
   if(!pending){
    pending=readImage(hash).finally(()=>loading.delete(hash));
    loading.set(hash,pending);
   }
   image=await pending;
  }
  if(asset.width!==image.width||asset.height!==image.height)throw Error('图片贴花素材尺寸与工程记录不一致。');
  remember(hash,image);
  return image;
 }
 return{
  remember,
  async validate(surface){
   for(const [hash,asset] of imageDecalsInSurface(surface))await get(hash,asset);
  },
  async load(surface,{size,maxTextureSize}={}){
   const active=size?{...surface,effects:surface.effects.filter(effect=>effect.enabled&&effect.opacity>0)}:surface;
   const assets=imageDecalsInSurface(active);
   const plan=size&&assets.size?planImageDecalAtlas(size,[...assets.values()],{maxTextureSize}):null;
   const list=[];
   for(const [hash,asset] of assets){
    const image=await get(hash,asset),rect=plan?.rects.get(hash);
    if(rect&&(rect[2]!==image.width||rect[3]!==image.height)){
     const [, ,width,height]=rect;
     list.push({hash,width,height,rgba:resizeImageDecalRGBA(image.rgba,image.width,image.height,width,height)});
    }else list.push({hash,...image});
   }
   return list;
  }
 };
}

function packRects(size,images,limit,maxPixels){
 const widest=Math.max(size,...images.map(image=>image.width));
 const tallest=Math.max(size,...images.map(image=>image.height));
 const area=images.reduce((sum,{width,height})=>sum+width*height,size*size);
 if(widest>limit||tallest>limit||area>maxPixels)return null;
 const widestFit=Math.min(limit,Math.floor(maxPixels/tallest));
 const widths=new Set([widest,widestFit,Math.ceil(Math.sqrt(area)),Math.ceil(area/tallest)]);
 const orders=[images.slice().sort((a,b)=>b.height-a.height||b.width-a.width),
  images.slice().sort((a,b)=>b.width*b.height-a.width*a.height),
  images.slice().sort((a,b)=>b.width-a.width||b.height-a.height)];
 for(const order of orders){
  let width=0;
  for(const image of order){
   widths.add(image.width+size);
   width+=image.width;
   widths.add(width);
   widths.add(width+size);
  }
 }
 const candidates=[...widths].filter(width=>width>=widest&&width<=widestFit);
 let best=null;
 for(const cap of candidates)for(const order of orders){
  const occupied=[[0,0,size,size]],rects=new Map();
  let width=size,height=size;
  for(const image of order){
   const rect=bottomLeft(image,occupied,cap,limit);
   if(!rect)break;
   occupied.push(rect);
   rects.set(image.hash,rect);
   width=Math.max(width,rect[0]+rect[2]);
   height=Math.max(height,rect[1]+rect[3]);
   if(width*height>maxPixels)break;
  }
  if(rects.size===images.length&&width*height<=maxPixels&&
    (!best||width*height<best.width*best.height||width*height===best.width*best.height&&height<best.height)){
   best={width,height,rects};
  }
 }
 return best;
}

function bottomLeft({width,height},occupied,maxWidth,maxHeight){
 const positions=new Set([0]);
 for(const [x,,w] of occupied){
  positions.add(x);
  positions.add(x+w);
  positions.add(x-width);
  positions.add(x+w-width);
 }
 let best=null;
 for(const x of positions){
  if(x<0||x+width>maxWidth)continue;
  let y=0;
  while(y+height<=maxHeight&&(!best||y<=best[1])){
   let nextY=y;
   for(const [left,top,w,h] of occupied){
    if(x<left+w&&x+width>left&&y<top+h&&y+height>top)nextY=Math.max(nextY,top+h);
   }
   if(nextY===y){
    if(!best||y<best[1]||x<best[0])best=[x,y,width,height];
    break;
   }
   y=nextY;
  }
 }
 return best;
}

export function planImageDecalAtlas(size,images,{maxTextureSize=16384,maxBytes=NATIVE_TEXTURE_TOTAL_BYTES}={}){
 const limit=Math.min(maxTextureSize,16384),maxPixels=Math.floor(Math.min(maxBytes,NATIVE_TEXTURE_TOTAL_BYTES)/4);
 if(!Number.isInteger(size)||size<1||size>limit||size*size>maxPixels||
   images.some(({width,height})=>!Number.isInteger(width)||width<1||!Number.isInteger(height)||height<1)||
   new Set(images.map(image=>image.hash)).size!==images.length)throw Error('图片贴花图集内容无效。');
 const original=packRects(size,images,limit,maxPixels);
 if(original)return original;
 // Only lower the sampling resolution until the active images and UV mask fit.
 let low=1,high=Math.min(limit,Math.max(...images.map(image=>Math.max(image.width,image.height)))),best=null;
 while(low<=high){
  const edge=Math.floor((low+high)/2);
  const layout=packRects(size,images.map(image=>{
   const scale=Math.min(1,edge/Math.max(image.width,image.height));
   return {...image,width:Math.max(1,Math.round(image.width*scale)),height:Math.max(1,Math.round(image.height*scale))};
  }),limit,maxPixels);
  if(layout){best=layout;low=edge+1;}else high=edge-1;
 }
 if(!best)throw Error('当前显卡没有足够的贴图空间同时显示图片贴花，请隐藏部分贴花图层。');
 return best;
}

// Original four mask channels occupy the top-left square of slot 12.
export function packImageDecalAtlas(mask,size,images,limits){
 if(!images?.length)return {data:mask,width:size,height:size,rects:new Map()};
 if(images.some(({rgba,width,height})=>rgba?.length!==width*height*4))throw Error('图片贴花图集内容无效。');
 const {width,height,rects}=planImageDecalAtlas(size,images,limits);
 const data=new Uint8Array(width*height*4);
 for(let y=0;y<size;y++)data.set(mask.subarray(y*size*4,(y+1)*size*4),y*width*4);
 for(const image of images){
  const [x,y,w,h]=rects.get(image.hash);
  const rgba=resizeImageDecalRGBA(image.rgba,image.width,image.height,w,h);
  for(let row=0;row<h;row++){
   const start=(y+row)*width*4+x*4,end=start+w*4;
   data.set(rgba.subarray(row*w*4,(row+1)*w*4),start);
   for(let dst=start;dst<end;dst+=4){
    const a=data[dst+3]/255;
    if(a===1)continue;
    data[dst]=Math.round(data[dst]*a);
    data[dst+1]=Math.round(data[dst+1]*a);
    data[dst+2]=Math.round(data[dst+2]*a);
   }
  }
 }
 return {data,width,height,rects};
}

export function packImageDecalUniforms(data,scene,source,treeHeight,rects){
 data[16]=1;
 const anchor=scene.points[0],rect=rects?.get(scene.image.hash);
 if(!anchor||!rect||!source||!Number.isFinite(treeHeight)||anchor.face*3+2>=source.indices.length)return;
 const {width,height,depth,rotation,edge}=scene.params;
 try{
  const {uniforms}=localPatchFrame(source,{
   anchor,widthMeters:width*.01,heightMeters:height*.01,depthMeters:depth*.01,rotation,
   channels:{},color:'#ffffff',depthMm:0,edgeMm:0
  },treeHeight);
  data[17]=1;
  data.splice(20,16,...uniforms.origin,...uniforms.u.slice(0,3),edge,...uniforms.v.slice(0,3),0,...rect);
 }catch(error){
  // A degenerate source triangle has no stable projection frame.
  if(!error.message.includes('三角面退化'))throw error;
 }
}
