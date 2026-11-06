import {paintMaskTextureBytes} from './paint-depth-cache.js';
import {stageMaterialTextures} from './material-textures.js';import {partTextureKey} from './part-materials.js';
export const PART_TEXTURE_BUDGET=512*1024*1024;
export function disposeTextureSet(gl,set){for(const texture of Object.values(set?.textures||{}))if(texture)gl.deleteTexture(texture);}
export function textureImageBytes(image,target,{nativeRGBA=false}={}){if(!image)return 4;let bytes=0,w=image.width,h=image.height;const component=target==='bark'?4:image.format==='r32f'?4:target==='normalMap'?(nativeRGBA?4:3):image.format==='rgb8'?(nativeRGBA?4:3):1;for(;;){bytes+=w*h*component;if(w===1&&h===1)break;w=Math.max(1,Math.floor(w/2));h=Math.max(1,Math.floor(h/2));}return bytes;}
// Reused handles belong to the old bank until commit. Failure/cancel only drops
// newly allocated sets; no current project or GPU binding is changed here.
export async function stagePartMaterialBank(gl,bindings,previous=new Map(),{load,signal,budget=PART_TEXTURE_BUDGET}={}){
 const next=new Map(),created=[];let totalBytes=0,settled=false;const check=()=>{if(signal?.aborted)throw Object.assign(Error('部位素材载入已取消。'),{name:'AbortError'});};
 try{for(const entry of bindings.filter(entry=>entry.enabled)){check();const key=partTextureKey(entry.refs);if(next.has(key))continue;let set=previous.get(key);if(!set){const images=await load(entry.refs);let consumed=false;try{check();const inputs={bark:images[0],heightMap:images[2],roughMap:images[3],normalMap:images[4]},bytes=Object.entries(inputs).reduce((sum,[target,image])=>sum+(target==='roughMap'?(paintMaskTextureBytes(inputs,{nativeRGBA:!!gl.nativeBackend})??textureImageBytes(image,target,{nativeRGBA:!!gl.nativeBackend})):textureImageBytes(image,target,{nativeRGBA:!!gl.nativeBackend})),0);if(totalBytes+bytes>budget)throw Error('独立部位素材超过512MiB缓存预算，请缩小图片或复用同套素材。');consumed=true;const staged=stageMaterialTextures(gl,inputs);set={...staged,bytes,aspect:staged.info.bark.width/staged.info.bark.height};created.push(set);await gl.flushResources?.();check();}catch(error){if(!consumed)for(const image of images)image?.close();throw error;}}
   totalBytes+=set.bytes;if(totalBytes>budget)throw Error('独立部位素材超过缓存预算。');next.set(key,set);
  }check();return{sets:next,bytes:totalBytes,commit(){if(settled)throw Error('部位素材事务已结束。');settled=true;for(const [key,set]of previous)if(!next.has(key))disposeTextureSet(gl,set);return next;},rollback(){if(settled)return;settled=true;for(const set of created)disposeTextureSet(gl,set);}};
 }catch(error){for(const set of created)disposeTextureSet(gl,set);throw error;}
}
