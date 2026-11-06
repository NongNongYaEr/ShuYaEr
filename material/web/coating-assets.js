import {loadCoatingAtlasImage} from './coating-atlas-image.js';import {decodeDataImage} from './data-image-session.js';
export async function loadCoatingAssets(renderer){
 const image=await loadCoatingAtlasImage(async url=>{const response=await fetch(url);if(!response.ok)throw Error('表面PBR素材缺失，请保留完整软件目录。');return new Uint8Array(await response.arrayBuffer());},{decode:decodeDataImage});
 const rgba=new Uint8Array(image.width*image.height*4);for(let i=0,j=0;i<image.data.length;i+=3,j+=4){rgba[j]=image.data[i];rgba[j+1]=image.data[i+1];rgba[j+2]=image.data[i+2];rgba[j+3]=255;}renderer.coatingPixels=rgba;await renderer.uploadBitmap(image,'coatingAtlas');
}
