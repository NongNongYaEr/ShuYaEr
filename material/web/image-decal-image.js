import {decodeDataPNG} from './png-data.js';
import {decodeDataImage} from './data-image-session.js';
import {IMAGE_DECAL_MAX_BYTES,IMAGE_DECAL_MAX_PIXELS,IMAGE_DECAL_MAX_SIDE} from './image-decal-rules.js';

export {IMAGE_DECAL_MAX_BYTES,IMAGE_DECAL_MAX_SIDE};
const decodePNG=typeof Worker==='function'?decodeDataImage:decodeDataPNG;
const pngSignature=Uint8Array.of(137,80,78,71,13,10,26,10);
const limitError=()=>Error('图片贴花超过处理上限（160 MB、长边 16384 像素或 33554432 总像素）。');
const invalidImage=()=>Error('图片内容无效，请使用静态 PNG、JPG 或 WebP。');
const abort=()=>Object.assign(Error('图片贴花准备已取消。'),{name:'AbortError'});
const checkAbort=signal=>{if(signal?.aborted)throw abort();};

function asciiAt(bytes,at,text){
 for(let i=0;i<text.length;i++)if(bytes[at+i]!==text.charCodeAt(i))return false;
 return true;
}

function checkSize(width,height,side=IMAGE_DECAL_MAX_SIDE){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw invalidImage();
 if(width>side||height>side||width*height>IMAGE_DECAL_MAX_PIXELS)throw limitError();
}

function pngInfo(bytes,view){
 if(bytes.length<45||view.getUint32(8)!==13||!asciiAt(bytes,12,'IHDR'))throw invalidImage();
 const width=view.getUint32(16),height=view.getUint32(20),bitDepth=bytes[24],colorType=bytes[25];
 checkSize(width,height);
 for(let at=8;at+12<=bytes.length;){
  const size=view.getUint32(at),end=at+size+12;
  if(end>bytes.length)throw invalidImage();
  if(asciiAt(bytes,at+4,'acTL'))throw Error('请使用静态 PNG。');
  if(asciiAt(bytes,at+4,'IEND')){
   if(size!==0||end!==bytes.length)throw invalidImage();
   return{mimeType:'image/png',width,height,bitDepth,colorType};
  }
  at=end;
 }
 throw invalidImage();
}

const jpegSizeMarkers=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
function jpegInfo(bytes,view){
 for(let at=2;at+3<bytes.length;){
  if(bytes[at++]!==0xff)break;
  while(bytes[at]===0xff)at++;
  const marker=bytes[at++];
  if(marker===0xda||marker===0xd9||at+2>bytes.length)break;
  const size=view.getUint16(at);
  if(size<2||at+size>bytes.length)break;
  if(jpegSizeMarkers.has(marker)&&size>=8){
   const width=view.getUint16(at+5),height=view.getUint16(at+3);
   checkSize(width,height);
   return{mimeType:'image/jpeg',width,height};
  }
  at+=size;
 }
 throw invalidImage();
}

function webpInfo(bytes,view){
 if(bytes.length<20||view.getUint32(4,true)+8!==bytes.length)throw invalidImage();
 const three=at=>bytes[at]+bytes[at+1]*256+bytes[at+2]*65536;
 let canvas,frame,at=12;
 while(at+8<=bytes.length){
  const size=view.getUint32(at+4,true),p=at+8,end=p+size+(size%2);
  if(end>bytes.length)throw invalidImage();
  if(asciiAt(bytes,at,'ANIM')||asciiAt(bytes,at,'ANMF'))throw Error('请使用静态 WebP。');
  if(asciiAt(bytes,at,'VP8X')){
   if(canvas||size!==10)throw invalidImage();
   if(bytes[p]&2)throw Error('请使用静态 WebP。');
   canvas=[three(p+4)+1,three(p+7)+1];
   checkSize(...canvas);
  }
  if(asciiAt(bytes,at,'VP8L')){
   if(frame||size<5||bytes[p]!==0x2f)throw invalidImage();
   const bits=view.getUint32(p+1,true);
   if(bits>>>29)throw invalidImage();
   frame=[(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1];
  }
  if(asciiAt(bytes,at,'VP8 ')){
   if(frame||size<10||(bytes[p]&1)||bytes[p+3]!==0x9d||bytes[p+4]!==1||bytes[p+5]!==0x2a)throw invalidImage();
   frame=[view.getUint16(p+6,true)&0x3fff,view.getUint16(p+8,true)&0x3fff];
  }
  at=end;
 }
 if(at!==bytes.length||!frame||canvas&&canvas.some((dimension,i)=>dimension!==frame[i]))throw invalidImage();
 const [width,height]=frame;
 checkSize(width,height);
 return{mimeType:'image/webp',width,height};
}

export function inspectImageDecal(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<12)throw invalidImage();
 if(bytes.length>IMAGE_DECAL_MAX_BYTES)throw limitError();
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(pngSignature.every((byte,i)=>bytes[i]===byte))return pngInfo(bytes,view);
 if(bytes[0]===0xff&&bytes[1]===0xd8)return jpegInfo(bytes,view);
 if(asciiAt(bytes,0,'RIFF')&&asciiAt(bytes,8,'WEBP'))return webpInfo(bytes,view);
 throw invalidImage();
}

function outputSize(width,height,maxSide){
 const ratio=Math.min(1,maxSide/Math.max(width,height));
 return [Math.max(1,Math.round(width*ratio)),Math.max(1,Math.round(height*ratio))];
}

// Average premultiplied contributions so transparent pixels cannot darken edges.
export function resizeImageDecalRGBA(rgba,sourceWidth,sourceHeight,width,height){
 if(width===sourceWidth&&height===sourceHeight)return rgba;
 const data=new Uint8Array(width*height*4),dx=sourceWidth/width,dy=sourceHeight/height;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const left=x*dx,right=(x+1)*dx,top=y*dy,bottom=(y+1)*dy;
  let a=0,r=0,g=0,b=0;
  for(let yy=Math.floor(top);yy<Math.min(sourceHeight,Math.ceil(bottom));yy++){
   const vertical=Math.min(bottom,yy+1)-Math.max(top,yy);
   for(let xx=Math.floor(left);xx<Math.min(sourceWidth,Math.ceil(right));xx++){
    const i=(yy*sourceWidth+xx)*4,covered=vertical*(Math.min(right,xx+1)-Math.max(left,xx))*rgba[i+3];
    a+=covered;r+=rgba[i]*covered;g+=rgba[i+1]*covered;b+=rgba[i+2]*covered;
   }
  }
  const i=(y*width+x)*4;
  data[i+3]=Math.round(a/(dx*dy));
  if(a>0){data[i]=Math.round(r/a);data[i+1]=Math.round(g/a);data[i+2]=Math.round(b/a);}
 }
 return data;
}

function hasTransparency(rgba){
 for(let i=3;i<rgba.length;i+=4)if(rgba[i]<255)return true;
 return false;
}

async function browserDecode(blob,{width,height,maxSide,signal}){
 const bitmap=await createImageBitmap(blob,{premultiplyAlpha:'none'}).catch(()=>{
  checkAbort(signal);
  throw invalidImage();
 });
 try{
  checkAbort(signal);
  const sourceWidth=bitmap.width,sourceHeight=bitmap.height;
  if(!((sourceWidth===width&&sourceHeight===height)||(sourceWidth===height&&sourceHeight===width)))throw invalidImage();
  const [w,h]=outputSize(sourceWidth,sourceHeight,maxSide),canvas=new OffscreenCanvas(w,h);
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)throw Error('无法为图片贴花创建像素画布。');
  context.imageSmoothingQuality='high';
  context.drawImage(bitmap,0,0,w,h);
  const pixels=context.getImageData(0,0,w,h).data;
  return{width:w,height:h,sourceWidth,sourceHeight,rgba:new Uint8Array(pixels.buffer,pixels.byteOffset,pixels.byteLength)};
 }finally{
  bitmap.close();
 }
}

const crcTable=Uint32Array.from({length:256},(_,i)=>{
 for(let bit=0;bit<8;bit++)i=i&1?0xedb88320^(i>>>1):i>>>1;
 return i>>>0;
});
function writePNGChunk(bytes,at,type,payload){
 const end=at+payload.length+12,view=new DataView(bytes.buffer);
 view.setUint32(at,payload.length);
 for(let i=0;i<4;i++)bytes[at+4+i]=type.charCodeAt(i);
 bytes.set(payload,at+8);
 let crc=0xffffffff;
 for(let i=at+4;i<end-4;i++)crc=crcTable[(crc^bytes[i])&255]^(crc>>>8);
 view.setUint32(end-4,(crc^0xffffffff)>>>0);
 return end;
}

export async function encodeImageDecalPNG(rgba,width,height){
 checkSize(width,height,IMAGE_DECAL_MAX_SIDE);
 if(!(rgba instanceof Uint8Array)||rgba.length!==width*height*4)throw invalidImage();
 const header=new Uint8Array(13),view=new DataView(header.buffer);
 view.setUint32(0,width);view.setUint32(4,height);header[8]=8;header[9]=6;
 const widthBytes=width*4;
 let row=0;
 // Feed bounded batches instead of copying the full RGBA image into a scanline buffer.
 const scanlines=new ReadableStream({pull(controller){
  const count=Math.min(64,height-row),rows=new Uint8Array((widthBytes+1)*count);
  for(let y=0;y<count;y++,row++)rows.set(rgba.subarray(row*widthBytes,(row+1)*widthBytes),y*(widthBytes+1)+1);
  controller.enqueue(rows);
  if(row===height)controller.close();
 }});
 const stream=scanlines.pipeThrough(new CompressionStream('deflate'));
 const zipped=new Uint8Array(await new Response(stream).arrayBuffer());
 const bytes=new Uint8Array(pngSignature.length+header.length+zipped.length+36);
 bytes.set(pngSignature);
 const first=writePNGChunk(bytes,pngSignature.length,'IHDR',header);
 const last=writePNGChunk(bytes,first,'IDAT',zipped);
 writePNGChunk(bytes,last,'IEND',new Uint8Array());
 return bytes;
}

export async function decodeImageDecalPNG(bytes,{signal}={}){
 checkAbort(signal);
 const info=inspectImageDecal(bytes);
 if(info.mimeType!=='image/png'||info.bitDepth!==8||info.colorType!==6)throw Error('已保存的贴花需使用 RGBA8 PNG。');
 checkSize(info.width,info.height,IMAGE_DECAL_MAX_SIDE);
 const image=await decodePNG(bytes,'rgba',{signal});
 try{return{width:image.width,height:image.height,rgba:image.data,hasAlpha:hasTransparency(image.data)};}
 finally{image.close?.();}
}

/** Read a local File/Blob. Return a bounded canonical RGBA8 PNG for storage. */
export async function prepareImageDecal(file,{decode=browserDecode,signal,maxSide=IMAGE_DECAL_MAX_SIDE}={}){
 checkAbort(signal);
 if(!(file instanceof Blob)||!file.size)throw invalidImage();
 if(file.size>IMAGE_DECAL_MAX_BYTES)throw limitError();
 if(!Number.isInteger(maxSide)||maxSide<1||maxSide>IMAGE_DECAL_MAX_SIDE)throw Error('图片贴花目标尺寸无效。');
 const input=new Uint8Array(await file.arrayBuffer());
 checkAbort(signal);
 const info=inspectImageDecal(input);
 let prepared;
 if(info.mimeType==='image/png'){
  const image=await decodePNG(input,'rgba',{signal});
  try{
   const [width,height]=outputSize(image.width,image.height,maxSide);
   prepared={width,height,sourceWidth:image.width,sourceHeight:image.height,rgba:resizeImageDecalRGBA(image.data,image.width,image.height,width,height)};
  }finally{
   image.close?.();
  }
 }else{
  prepared=await decode(file.slice(0,file.size,info.mimeType),{...info,maxSide,signal});
 }
 checkAbort(signal);
 checkSize(prepared.width,prepared.height,maxSide);
 const bytes=await encodeImageDecalPNG(prepared.rgba,prepared.width,prepared.height);
 checkAbort(signal);
 return{...prepared,bytes,hasAlpha:hasTransparency(prepared.rgba),mimeType:info.mimeType};
}
