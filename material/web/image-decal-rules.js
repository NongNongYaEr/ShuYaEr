export const IMAGE_DECAL_STYLE='image-decal';
export const IMAGE_DECAL_MAX_SIDE=16384;
export const IMAGE_DECAL_MAX_PIXELS=33_554_432;
export const IMAGE_DECAL_MAX_BYTES=160_000_000;
const assetHash=/^[0-9a-f]{64}$/;
const cm=(label,value,max)=>({kind:'number',label,value,min:.05,max,step:.05,unit:'cm'});

export const IMAGE_DECAL_SPEC={
 name:'图片贴花',mode:'point',
 fields:{
  width:cm('宽度',26,500),height:cm('高度',26,500),
  rotation:{kind:'number',label:'旋转',min:-180,max:180,step:1,value:0,unit:'°'},
  depth:cm('投射深度',2.6,100),
  edge:{kind:'number',label:'边缘柔化',min:0,max:1,step:.01,value:0}
 },
 coatings:[{role:'main'}]
};

export function validateImageDecal(raw){
 if(raw?.version!==1||typeof raw.hash!=='string'||!assetHash.test(raw.hash)||
   !Number.isInteger(raw.width)||!Number.isInteger(raw.height)||
   Math.min(raw.width,raw.height)<1||Math.max(raw.width,raw.height)>IMAGE_DECAL_MAX_SIDE||raw.width*raw.height>IMAGE_DECAL_MAX_PIXELS||
   typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>80||/[\p{Cc}]/u.test(raw.name)){
  throw Error('图片贴花素材记录无效。');
 }
 return {version:1,hash:raw.hash,width:raw.width,height:raw.height,name:raw.name};
}

export function imageDecalsInSurface(surface){
 const used=new Set(surface?.effects?.map(effect=>effect.maskRef)||[]);
 const assets=new Map();
 for(const mask of surface?.masks||[]){
  if(!used.has(mask.id))continue;
  for(const rule of mask.items){
   if(rule.type!=='scene-overlay'||rule.scene?.style!==IMAGE_DECAL_STYLE)continue;
   const image=validateImageDecal(rule.scene.image),existing=assets.get(image.hash);
   if(existing&&(existing.width!==image.width||existing.height!==image.height))throw Error('同一图片贴花素材的尺寸记录不一致。');
   assets.set(image.hash,image);
  }
 }
 return assets;
}

export function imageDecalResources(resources,surface){
 const result={...resources};
 for(const key of Object.keys(result))if(/^imageDecal_[0-9a-f]{64}$/.test(key))delete result[key];
 for(const hash of imageDecalsInSurface(surface).keys())result['imageDecal_'+hash]=hash;
 return result;
}
