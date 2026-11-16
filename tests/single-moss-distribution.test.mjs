import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocument,validateDocument} from '../material/web/project-state.js';
import {EFFECT_LIBRARY_BUILTINS,instantiateLibraryEntry,prepareLibraryEntry,withBuiltinRootMossFallback} from '../material/web/effect-library.js';
import {SurfaceDistributionRasterizer} from '../material/web/surface-distribution.js';

const entry=EFFECT_LIBRARY_BUILTINS.find(item=>item.id==='builtin-moss-root');
const sourceHash='a'.repeat(64);
function draft(){
 const document=createDocument({source:sourceHash,name:'根部厚苔测试',settings:{},actualHeightMeters:4});
 document.surface={...document.surface,active:true,effects:[],masks:[],areas:[],layers:[]};
 document.surface=instantiateLibraryEntry(document,entry).surface;
 return validateDocument(document);
}

test('AO-dependent library presets prepare real AO even when an all-open preview buffer exists',async()=>{
 const document=draft(),steps=[];
 let verified=false;
 const dependencies={document:()=>document,state:()=>({ao:true,aoVerified:verified}),prepare:async type=>{
  steps.push(type);
  verified=true;
 }};
 await prepareLibraryEntry(entry,dependencies);
 await prepareLibraryEntry(entry,dependencies);
 assert.deepEqual(steps,['ao']);
});

test('the stock root-moss upgrade preserves IDs and skips authored masks',()=>{
 const current=draft().surface,old=structuredClone(current);
 old.masks[0].initial=1;
 old.masks[0].items[0].combine='replace';
 const repaired=withBuiltinRootMossFallback(old);
 assert.deepEqual(repaired,current);
 assert.equal(withBuiltinRootMossFallback(repaired),repaired);
 assert.equal(old.masks[0].items[0].combine,'replace');

 const edited=structuredClone(old);
 edited.masks[0].items[1].params.threshold=.6;
 assert.equal(withBuiltinRootMossFallback(edited),edited);
 const painted=structuredClone(old);
 const area=painted.areas.find(item=>item.id===painted.masks[0].items[2].eraseRef);
 area.strokes.push({face:0,bary:[1,0,0],radiusMeters:.1,hardness:.5,strength:1,value:0});
 assert.equal(withBuiltinRootMossFallback(painted),painted);
});

test('root moss grows in low open areas, keeping contact detail and the same height limit',()=>{
 const document=draft();
 const mesh={
  pos:new Float32Array([0,0,0,3,0,0,3,4,0,0,4,0]),
  normal:new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),
  indices:new Uint32Array([0,1,2,0,2,3]),
  uv:new Float32Array([.07,.07,.93,.07,.93,.93,.07,.93]),
  min:[0,0,0],height:4,sourceSHA256:sourceHash,
 };
 const raster=new SurfaceDistributionRasterizer(mesh,mesh,64,{padding:0});
 const ao=new Float32Array(4).fill(1);
 const old=structuredClone(document);
 old.surface.masks[0].initial=1;
 old.surface.masks[0].items[0].combine='replace';
 assert.throws(()=>raster.render(document),/模型AO/);
 const values=result=>Uint8Array.from({length:64*64},(_,i)=>result.maps[0][i*4]);
 const previous=values(raster.render(old,{ao})),fixed=values(raster.render(document,{ao}));
 assert(previous.every(value=>value===0));
 assert(fixed.some(value=>value>127));
 for(let y=21;y<64;y++)for(let x=0;x<64;x++)assert.equal(fixed[y*64+x],0);
 const shade=new Float32Array(4).fill(.5);
 const oldShaded=values(raster.render(old,{ao:shade})),newShaded=values(raster.render(document,{ao:shade}));
 assert.deepEqual(newShaded,oldShaded);
});
