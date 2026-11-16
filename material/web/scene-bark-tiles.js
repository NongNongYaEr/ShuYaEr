import {COATING_ASSET} from './coating-asset-config.js';
import {decodeDataImage} from './data-image-session.js';

export const SCENE_BARK_MATERIALS=[
 {key:'old-brown',libraryId:'camphor-fissures',name:'香樟·细裂',colorCell:195,dataCell:196,tileMeters:.55,heightMm:2.5},
 {key:'pale-wood',libraryId:'birch-papery',name:'白桦·纸皮',colorCell:198,dataCell:199,tileMeters:.55,heightMm:1.2},
 {key:'deep-bark',libraryId:'ironbark',name:'铁桉·黑沟',colorCell:201,dataCell:202,tileMeters:.70,heightMm:5},
];

export const SCENE_BARK_TILE_ASSET={
 url:'/assets/coatings/scene-bark-patches.png',
 width:512,height:3072,bytes:3131386,
 sha256:'aecb20646063b9c282a44972a248bbb2beba2b35c46830e9c50165cb09634358',
};

async function readSceneBarkTiles(url){
 const response=await fetch(url);
 if(!response.ok)throw Error('局部树皮接片素材缺失，请保留完整软件目录。');
 return new Uint8Array(await response.arrayBuffer());
}

// Append the RGB strip only after the original v3 atlas has passed its checks.
// Channel data is RGB = height, roughness, local AO, in the source PNG row order.
export async function installSceneBarkTiles(data,width,height,{read=readSceneBarkTiles,decode=decodeDataImage}={}){
 const {decalPanelPixels:side,decalColumns:columns,tilePixels:prefix}=COATING_ASSET;
 const cells=SCENE_BARK_MATERIALS.flatMap(material=>[material.colorCell,material.dataCell]);
 const reservedStart=COATING_ASSET.decalCount*COATING_ASSET.decalPanels;
 if(!(data instanceof Uint8Array)||width!==COATING_ASSET.width||height!==COATING_ASSET.height||
    data.length!==width*height*3||cells.some(cell=>cell<reservedStart||prefix+(Math.floor(cell/columns)+1)*side>height)){
  throw Error('局部树皮接片需要具有可用保留区的表面图集。');
 }
 const asset=SCENE_BARK_TILE_ASSET;
 const bytes=await read(asset.url);
 if(!(bytes instanceof Uint8Array)||bytes.length!==asset.bytes)throw Error('局部树皮接片图集大小不符。');
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 const sha256=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
 if(sha256!==asset.sha256)throw Error('局部树皮接片图集SHA256不符，请重新解压完整软件。');
 const image=await decode(bytes,'color');
 try{
  if(image.width!==asset.width||image.height!==asset.height||image.format!=='rgb8'||
     image.data?.length!==asset.width*asset.height*3||asset.width!==side||asset.height!==cells.length*side){
   throw Error('局部树皮接片图集尺寸或色彩格式不符。');
  }
  const rowBytes=side*3;
  for(const [tile,cell] of cells.entries()){
   const column=(cell%columns)*side;
   const row=prefix+Math.floor(cell/columns)*side;
   for(let y=0;y<side;y++){
    const from=(tile*side+y)*rowBytes;
    data.set(image.data.subarray(from,from+rowBytes),((row+y)*width+column)*3);
   }
  }
  return data;
 }finally{
  image.close?.();
 }
}
