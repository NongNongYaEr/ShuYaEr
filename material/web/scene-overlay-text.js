export const MAX_SCENE_TEXT_LENGTH=32;
const maxWidth=768,maxHeight=96;
const legacyText=/^[\x20-\x7e←↑→↓↖↗↘↙]*$/u;
const disallowedText=/[\p{Cc}\p{Cs}\u2028\u2029]|(?![\u200c\u200d])\p{Cf}/u;
const invisibleText=/^[\p{M}\p{Zs}\u200c\u200d]+$/u;
const base64=/^[A-Za-z0-9+/]*={0,2}$/;
const alphaError=()=>Error('喷漆文字蒙版数据无效。');
const graphemes=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;

export function sceneSprayTextLength(value){
 if(typeof value!=='string')return 0;
 return Array.from(graphemes?graphemes.segment(value):value).length;
}

export function validateSceneSprayText(value,maxLength=MAX_SCENE_TEXT_LENGTH){
 if(typeof value!=='string'||value.length>256||disallowedText.test(value)||sceneSprayTextLength(value)>maxLength){
  throw Error('喷漆文字需要单行可打印字符，最多 '+maxLength+' 个。');
 }
 if(value.trim()&&invisibleText.test(value))throw Error('喷漆文字需要至少一个可见字符。');
 return value;
}

export const requiresSceneTextMask=text=>typeof text==='string'&&!legacyText.test(text);

function checkSize(width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>maxWidth||height>maxHeight)throw alphaError();
}

function encodeBytes(bytes){
 let binary='';
 for(let at=0;at<bytes.length;at+=4096)binary+=String.fromCharCode(...bytes.subarray(at,at+4096));
 return btoa(binary);
}

export function encodeSceneTextMask(text,width,height,alpha){
 validateSceneSprayText(text);
 checkSize(width,height);
 if(!(alpha instanceof Uint8Array||alpha instanceof Uint8ClampedArray)||alpha.length!==width*height)throw alphaError();
 const packed=new Uint8Array(Math.ceil(alpha.length/2)),runs=new Uint8Array(packed.length);
 let length=0,last=-1,count=0;
 function addRun(){
  if(length<runs.length)runs[length]=last<<4|count-1;
  length++;
 }
 for(let i=0;i<alpha.length;i++){
  const value=Math.round(alpha[i]/17);
  packed[i>>1]|=i&1?value:value<<4;
  if(value!==last||count===16){
   if(count)addRun();
   last=value;
   count=0;
  }
  count++;
 }
 addRun();
 const compact=length<packed.length;
 return{version:1,text,width,height,encoding:compact?'rle4':'packed4',data:encodeBytes(compact?runs.subarray(0,length):packed)};
}

function decodeSceneTextMask(raw,text){
 if(!raw||raw.version!==1||raw.text!==text||typeof raw.data!=='string'||!['rle4','packed4'].includes(raw.encoding))throw alphaError();
 validateSceneSprayText(text);
 const {width,height,encoding,data}=raw;
 checkSize(width,height);
 const count=width*height,packedLength=Math.ceil(count/2);
 if(!data.length||data.length>Math.ceil(packedLength/3)*4||data.length%4||!base64.test(data))throw alphaError();
 let encoded;
 try{encoded=atob(data);}catch{throw alphaError();}
 if(encoded.length>packedLength||btoa(encoded)!==data)throw alphaError();
 const alpha=new Uint8Array(count);
 if(encoding==='packed4'){
  if(encoded.length!==packedLength||count%2&&(encoded.charCodeAt(packedLength-1)&15)!==0)throw alphaError();
  for(let i=0;i<count;i++){
   const byte=encoded.charCodeAt(i>>1);
   alpha[i]=(i&1?byte&15:byte>>4)*17;
  }
 }else{
  let offset=0;
  for(let i=0;i<encoded.length;i++){
   const byte=encoded.charCodeAt(i),end=offset+(byte&15)+1;
   if(end>count)throw alphaError();
   alpha.fill((byte>>4)*17,offset,end);
   offset=end;
  }
  if(offset!==count)throw alphaError();
 }
 return alpha;
}

export function validateSceneTextMask(raw,expectedText){
 decodeSceneTextMask(raw,expectedText);
 const {version,text,width,height,encoding,data}=raw;
 return{version,text,width,height,encoding,data};
}

function canvasFont(text){
 const cjk=/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)?'"Yu Gothic UI", "Meiryo", ':
  /\p{Script=Hangul}/u.test(text)?'"Malgun Gothic", ':
  /\p{Script=Han}/u.test(text)?'"Microsoft YaHei UI", "Microsoft JhengHei UI", ':'';
 return `700 84px ${cjk}"Segoe UI", Arial, "Nirmala UI", "Leelawadee UI", "Segoe UI Emoji", "Noto Sans", sans-serif`;
}

export function rasterizeSceneTextMask(text,{canvasFactory=()=>document.createElement('canvas')}={}){
 validateSceneSprayText(text);
 const label=text.trim();
 if(!label)return encodeSceneTextMask(text,1,1,Uint8Array.of(0));
 const canvas=canvasFactory(),context=canvas?.getContext('2d',{willReadFrequently:true});
 if(!context)throw Error('无法生成喷漆文字蒙版。');
 const font=canvasFont(label),firstLetter=label.match(/\p{L}/u)?.[0];
 const rtl=/[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(firstLetter??'');
 const setup=()=>{
  context.font=font;
  context.direction=rtl?'rtl':'ltr';
  context.textBaseline='alphabetic';
  context.textAlign='left';
 };
 setup();
 const metrics=context.measureText(label),left=metrics.actualBoundingBoxLeft??0;
 const naturalWidth=Math.max(1,left+(metrics.actualBoundingBoxRight??metrics.width));
 const ascent=metrics.actualBoundingBoxAscent??78,descent=metrics.actualBoundingBoxDescent??18;
 const naturalHeight=Math.max(1,ascent+descent);
 const margin=3,scale=Math.min(1,(maxWidth-margin*2)/naturalWidth,(maxHeight-margin*2)/naturalHeight);
 const width=Math.min(maxWidth,Math.ceil(naturalWidth*scale+margin*2));
 const height=Math.min(maxHeight,Math.ceil(naturalHeight*scale+margin*2));
 canvas.width=width;
 canvas.height=height;
 setup();
 context.setTransform(scale,0,0,scale,margin+left*scale,margin+ascent*scale);
 context.fillStyle='#fff';
 context.fillText(label,0,0);
 const rgba=context.getImageData(0,0,width,height).data,alpha=new Uint8Array(width*height);
 for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];
 if(!alpha.some(value=>value>=9))throw Error('当前字体无法生成可见的喷漆文字。');
 return encodeSceneTextMask(text,width,height,alpha);
}

// Canvas rows are top-down; the decal coordinates use positive V upwards.
export function sceneTextMaskSampler(raw,text){
 const alpha=decodeSceneTextMask(raw,text),{width,height}=raw;
 // The neutral label envelope follows the preset's 26 by 12 cm aspect ratio.
 const aspect=width/height/(26/12);
 const halfWidth=.93*Math.min(1,aspect),halfHeight=.93*Math.min(1,1/aspect);
 return(u,v)=>{
  if(Math.abs(u)>=halfWidth||Math.abs(v)>=halfHeight)return 0;
  const x=(u/halfWidth+1)*(width-1)*.5,y=(1-v/halfHeight)*(height-1)*.5;
  const col=Math.floor(x),row=Math.floor(y),stepX=x-col,stepY=y-row;
  const nextCol=Math.min(col+1,width-1),nextRow=Math.min(row+1,height-1);
  const top=alpha[row*width+col]*(1-stepX)+alpha[row*width+nextCol]*stepX;
  const bottom=alpha[nextRow*width+col]*(1-stepX)+alpha[nextRow*width+nextCol]*stepX;
  return(top*(1-stepY)+bottom*stepY)/255;
 };
}
