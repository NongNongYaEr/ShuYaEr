import {inspectPNG} from './png-data.js';
import {decodeDataImage} from './data-image-session.js';
export function referenceAspectMatches(aspect,width,height){return Number.isFinite(aspect)&&width>0&&height>0&&Math.abs(width/height-aspect)<=Math.max(1e-6,aspect*1e-4);}
export function inspectDataPNG(bytes,channel='height'){const {width,height,bitDepth}=inspectPNG(bytes,channel);return{width,height,bitDepth};}
// Sequential data decodes bound allocations; failed/cancelled transactions
// release every successful bitmap and raw data image before returning.
export async function decodeMaterialImages({bark,original=null,references={}},{fetchReference,decode=(blob,options)=>createImageBitmap(blob,options),decodeData=decodeDataImage,signal}={}){
 const images=[];const check=()=>{if(signal?.aborted)throw Object.assign(Error('材质载入已取消。'),{name:'AbortError'});};
 try{for(const value of [bark,original]){check();images.push(value?await decode(value instanceof Blob?value:new Blob([value],{type:'image/png'}),{}):null);}
  const base=images[0];if(!base)throw Error('缺少树皮颜色图。');
  for(const channel of ['height','roughness','normal']){check();if(!references[channel]){images.push(null);continue;}const value=await fetchReference(references[channel]),bytes=value instanceof Blob?new Uint8Array(await value.arrayBuffer()):value instanceof ArrayBuffer?new Uint8Array(value):value,info=inspectDataPNG(bytes,channel);if(!referenceAspectMatches(base.width/base.height,info.width,info.height))throw Error('数据图必须与树皮颜色图具有相同比例。');const image=await decodeData(bytes,channel,{signal});images.push(image);}
  check();return images;
 }catch(error){for(const image of images)image?.close();throw error;}
}
