import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeSceneTextMask,rasterizeSceneTextMask,requiresSceneTextMask,sceneSprayTextLength,sceneTextMaskSampler,validateSceneSprayText,validateSceneTextMask} from '../material/web/scene-overlay-text.js';
import {createSceneOverlayPattern} from '../material/web/scene-overlay-pattern.js';
import {createSceneOverlayCoverage} from '../material/web/scene-overlay-coverage.js';

const text='树皮 A-27 日本 한국 ₽ Привет';
const reopen=value=>JSON.parse(JSON.stringify(value));

test('允许混合语言和合法连接符，按完整字素限制单行文本',()=>{
 assert.equal(validateSceneSprayText(text),text);
 assert(requiresSceneTextMask(text));
 assert(!requiresSceneTextMask('A-27 ↗'));
 assert.equal(sceneSprayTextLength('Á𠮷👩‍🌾'),3);
 assert.equal(validateSceneSprayText('한'.repeat(32)).length,32);
 assert.equal(validateSceneSprayText('e\u0301'.repeat(32)).length,64);
 assert.equal(validateSceneSprayText('a\u200cb'),'a\u200cb');
 for(const invalid of ['树🌲\n园','树\u202e园','树\ud800园','\u200d','\u0301','树'.repeat(33),'a'+'\u0301'.repeat(256)]){
  assert.throws(()=>validateSceneSprayText(invalid),/喷漆文字/);
 }
});

test('压缩字形蒙版保留抗锯齿和坐标方向，拒绝错误长度或过期文字',()=>{
 const alpha=new Uint8Array(64*32);
 alpha.fill(255,0,8*64);
 alpha.fill(136,8*64,14*64);
 const mask=encodeSceneTextMask('林',64,32,alpha);
 assert.equal(mask.encoding,'rle4');
 assert.deepEqual(validateSceneTextMask(reopen(mask),'林'),mask);
 const sourceSample=sceneTextMaskSampler(mask,'林'),sample=sceneTextMaskSampler(reopen(mask),'林');
 assert.equal(sample(0,.8),1);
 assert(Math.abs(sample(0,.25)-136/255)<1e-6);
 assert.equal(sample(0,-.8),0);
 assert.equal(sample(1,.8),0);
 for(let i=0;i<29;i++)assert.equal(sample(0,i/14-1),sourceSample(0,i/14-1));

 const packed=encodeSceneTextMask('木',3,3,Uint8Array.of(0,255,68,204,102,51,238,34,85));
 assert.equal(packed.encoding,'packed4');
 assert(Math.abs(sceneTextMaskSampler(packed,'木')(0,0)-.4)<1e-9);
 assert.throws(()=>validateSceneTextMask(mask,'不同文字'),/蒙版/);
 for(const malformed of [{...mask,width:769},{...mask,height:97},{...mask,data:'!?.='},{...mask,data:'Dw=='},
  {...mask,data:mask.data.repeat(30)},{...packed,data:'AAAAAAAB'},{...packed,data:packed.data.slice(0,-4)}]){
  assert.throws(()=>validateSceneTextMask(malformed,malformed.text),/蒙版/);
 }
});

test('Canvas 只在编辑时生成一次字形，长文本自动约束图幅并保留原文',()=>{
 let drawn=null,transform=null;
 const context={
  measureText:()=>({width:1900,actualBoundingBoxLeft:3,actualBoundingBoxRight:1900,actualBoundingBoxAscent:94,actualBoundingBoxDescent:18}),
  setTransform:(...args)=>{transform=args;},fillText:value=>{drawn=value;},
  getImageData:(x,y,width,height)=>{
   const data=new Uint8ClampedArray(width*height*4);
   for(let i=width;i<width*(height-1);i++)data[i*4+3]=187;
   return{data};
  },
 };
 const canvas={getContext:tool=>{assert.equal(tool,'2d');return context;}};
 const input='ひらがな Ελληνικά';
 const payload=rasterizeSceneTextMask(input,{canvasFactory:()=>canvas});
 assert.equal(drawn,input);
 assert(context.font.includes('Yu Gothic'));
 assert.equal(context.direction,'ltr');
 assert.equal(payload.width,768);
 assert(payload.height<=96&&transform[0]>0&&transform[0]<1);
 assert.deepEqual(validateSceneTextMask(reopen(payload),input),payload);
 assert(sceneTextMaskSampler(payload,input)(0,0)>.7);
 rasterizeSceneTextMask('العربية',{canvasFactory:()=>canvas});
 assert.equal(context.direction,'rtl');
});

test('保存重开的文字通过喷漆覆盖计算，无需再次调用浏览器字体',()=>{
 const bits=new Uint8Array(18*10);
 for(let row=2;row<8;row++)bits.fill(255,row*18+3,row*18+15);
 const textMask=encodeSceneTextMask('林-27',18,10,bits);
 const scene={style:'spray',params:{text:'林-27',wear:0,width:26,height:12},textMask,
  points:[{position:[.4,.4,.4],normal:[0,0,1]}]};
 const frozen=createSceneOverlayCoverage(reopen(scene));
 assert.equal(frozen(.4,.4,.4,0,0,1),1);
 assert.equal(frozen(.4,.4,.4,0,0,-1),0);
 assert.equal(createSceneOverlayCoverage({...scene,textMask:null})(.4,.4,.4,0,0,1),0);
 const worn=createSceneOverlayPattern('spray',{...scene.params,wear:.8},{textMask});
 const original=createSceneOverlayPattern('spray',scene.params,{textMask});
 let removed=0;
 for(let i=0;i<30;i++){
  const x=i/21-.7;
  assert(worn(x,0)<=original(x,0));
  removed+=original(x,0)-worn(x,0);
 }
 assert(removed>1);
});
