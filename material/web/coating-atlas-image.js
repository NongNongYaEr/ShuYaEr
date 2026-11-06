import {COATING_ASSET} from './coating-asset-config.js';
import {decodeDataPNG,dataImage} from './png-data.js';
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
export function validateCoatingParts(config){
 const {width,height,parts}=config,hash=/^[0-9a-f]{64}$/;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8192||height>8192||config.hashKind!=='rgb8-assembled-pixels'||!hash.test(config.sha256)||!Array.isArray(parts)||!parts.length||parts.length>8)throw Error('表面图集清单无效。');
 let y=0;const urls=new Set();
 for(const p of parts){if(!/^\/assets\/coatings\/[a-z0-9-]+\.png$/.test(p.url)||urls.has(p.url)||!hash.test(p.sha256)||p.width!==width||p.y!==y||!Number.isInteger(p.height)||p.height<1||p.height>8192||!Number.isInteger(p.bytes)||p.bytes<45||p.bytes>50000000)throw Error('表面图集分块无效。');urls.add(p.url);y+=p.height;if(y>height)throw Error('表面图集分块超出尺寸。');}
 if(y!==height)throw Error('表面图集分块不完整。');return parts;
}
export async function loadCoatingAtlasImage(read,{config=COATING_ASSET,decode=decodeDataPNG}={}){
 const parts=validateCoatingParts(config),data=new Uint8Array(config.width*config.height*3);
 for(const p of parts){const bytes=await read(p.url);if(!(bytes instanceof Uint8Array)||bytes.byteLength!==p.bytes||bytes.byteLength>50000000||await sha(bytes)!==p.sha256)throw Error('表面PBR素材分块SHA256不符，请重新解压完整软件。');
  const image=await decode(bytes,'color');try{if(image.width!==p.width||image.height!==p.height||image.format!=='rgb8'||image.data?.length!==p.width*p.height*3)throw Error('表面PBR素材分块尺寸不符。');data.set(image.data,p.y*config.width*3);}finally{image.close?.();}
 }
 if(await sha(data)!==config.sha256)throw Error('表面PBR合成图集SHA256不符。');
 return dataImage({kind:'tree-data-image',format:'rgb8',bitDepth:8,channel:'color',width:config.width,height:config.height,data});
}
