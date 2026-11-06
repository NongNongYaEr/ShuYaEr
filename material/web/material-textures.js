import {preparePaintDepthCache} from './paint-depth-cache.js';
import {heightMipmaps} from './png-data.js';
const defaults={normalMap:[128,128,255,255],heightMap:[0,0,0,255],roughMap:[210,210,210,255]};
// New handles remain isolated until every upload succeeds.
export function stageMaterialTextures(gl,inputs){
 const textures={},info={},prepared={...inputs};
 try{if(gl.isContextLost?.())throw Error('图形上下文已丢失，请保存工程后重开。');if(gl.getError()!==gl.NO_ERROR)throw Error('GPU当前有错误，请重试载入素材。');
  if('heightMap' in inputs||'normalMap' in inputs||'roughMap' in inputs){const cached=preparePaintDepthCache(inputs);Object.assign(prepared,cached.inputs);info.paintDepthMask=cached.info;}
   for(const [target,image]of Object.entries(prepared)){const texture=gl.createTexture();if(!texture)throw Error('GPU无法分配贴图，请缩小素材。');textures[target]=texture;gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
   if(image){const max=gl.getParameter(gl.MAX_TEXTURE_SIZE);if(image.closed||image.width>max||image.height>max)throw Error('数据图超过当前GPU可用尺寸，请缩小素材。');const levels=image.mipmaps||heightMipmaps(image);if(levels){for(const [level,mip]of levels.entries())gl.texImage2D(gl.TEXTURE_2D,level,gl.R32F,mip.width,mip.height,0,gl.RED,gl.FLOAT,mip.data);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST_MIPMAP_NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAX_LEVEL,levels.length-1);}
    else{if(image.kind==='tree-data-image'){const rgb=image.format==='rgb8';gl.texImage2D(gl.TEXTURE_2D,0,rgb?gl.RGB8:gl.R8,image.width,image.height,0,rgb?gl.RGB:gl.RED,gl.UNSIGNED_BYTE,image.data);}else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);}
    info[target]={width:image.width,height:image.height,bitDepth:image.bitDepth||8,float:image.format==='r32f',levels:levels?.length||1,...(image.generatedFromNormal?{generatedFromNormal:true}: {})};
   }else{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(defaults[target]||[155,133,105,255]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);info[target]=null;}
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);if(gl.getError()!==gl.NO_ERROR)throw Error('GPU载入贴图失败，请缩小素材后重试；旧材质已保留。');
  }if(info.paintDepthMask&&!inputs.roughMap)info.roughMap=null;return{textures,info};
 }catch(error){for(const texture of Object.values(textures))if(texture)gl.deleteTexture(texture);throw error;}
 finally{for(const image of new Set([...Object.values(inputs),...Object.values(prepared)]))image?.close();}
}

