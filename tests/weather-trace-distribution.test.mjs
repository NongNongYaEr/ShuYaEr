import test from 'node:test';
import assert from 'node:assert/strict';
import {EFFECT_LIBRARY_BUILTINS,instantiateLibraryEntry} from '../material/web/effect-library.js';
import {createDocument,History,validateDocument} from '../material/web/project-state.js';
import {SurfaceDistributionRasterizer} from '../material/web/surface-distribution.js';
import {addEffect,appendPaintRule,createRule} from '../material/web/surface-effects.js';
import {pruneSurfaceResources} from '../material/web/surface-layers.js';
import {editWeatherTrace,weatherTraceControls} from '../material/web/weather-trace-distribution.js';

const source='e'.repeat(64),actualHeightMeters=5,resolution=192;
const mesh={
 pos:Float32Array.of(0,0,0,2,0,0,2,5,0,0,5,0),
 normal:Float32Array.of(0,0,1,0,0,1,0,0,1,0,0,1),
 indices:Uint32Array.of(0,1,2,0,2,3),uv:Float32Array.of(0,0,1,0,1,1,0,1),
 min:[0,0,0],max:[2,5,0],height:actualHeightMeters,sourceSHA256:source,
};
const findEffect=(d,id)=>d.surface.effects.find(e=>e.id===id);
const findMask=(d,id)=>d.surface.masks.find(m=>m.id===findEffect(d,id).maskRef);
const findArea=(d,id)=>d.surface.areas.find(a=>a.id===id);
const controls=(d,id)=>weatherTraceControls(d,findEffect(d,id));
const close=(value,expected)=>assert(Math.abs(value-expected)<1e-9,`${value} ≠ ${expected}`);

function libraryEffect(key){
 const d=createDocument({source,actualHeightMeters,name:'沉积与流痕测试',settings:{}});
 Object.assign(d.surface,{effects:[],masks:[],areas:[],layers:[]});
 const entry=EFFECT_LIBRARY_BUILTINS.find(e=>e.id===key);
 const {surface,id}=instantiateLibraryEntry(d,entry);
 d.surface=surface;
 return {d:validateDocument(d),id};
}

function sampler(id){
 const raster=new SurfaceDistributionRasterizer(mesh,mesh,resolution,{padding:0});
 return d=>{
  const {maps,slots}=raster.render(d),slot=slots.indexOf(id);
  return Uint8Array.from({length:resolution**2},(_,i)=>maps[slot>>2][i*4+slot%4]);
 };
}

const heightAt=i=>(Math.floor(i/resolution)+.5)/resolution*actualHeightMeters;

test('沉积和流痕快捷控件从现有规则读取单位、覆盖量与旧值',()=>{
 const entries=[
  ['builtin-mud-root','mud',{height:[.9,'m'],size:[25,'cm'],amount:[.68,'']},3],
  ['builtin-mud-splash','mud',{height:[.6,'m'],size:[5,'cm'],amount:[.35,'']},3],
  ['builtin-rain-dark','streak',{width:[1.8,'cm'],length:[2,'m'],amount:[.4,'']},7],
 ];
 for(const [entry,kind,expected,seed] of entries){
  const {d,id}=libraryEffect(entry);
  findEffect(d,id).name='用户改名后的图层';
  const before=structuredClone(d);
  const result=controls(d,id);
  assert.equal(result.kind,kind);
  assert.deepEqual(result.fields.map(f=>f.key),Object.keys(expected));
  for(const field of result.fields){
   const [value,unit]=expected[field.key];
   close(field.value,value);
   assert.equal(field.unit,unit);
  }
  assert.deepEqual(result.advanced.map(f=>[f.key,f.value]),[['softness',.12],['seed',seed]]);
  assert.deepEqual(d,before);
 }
});

test('根部泥污和飞溅泥点的高度、斑块及覆盖量分别影响实际蒙版',()=>{
 for(const entry of ['builtin-mud-root','builtin-mud-splash']){
  const {d,id}=libraryEffect(entry),render=sampler(id);
  const initial=render(d),short=editWeatherTrace(d,id,'height',.3);
  const [{params:oldHeight}]=findMask(d,id).items;
  assert.deepEqual(findMask(short,id).items[0].params,{...oldHeight,maxMeters:.3});
  assert.deepEqual(findMask(short,id).items[1],findMask(d,id).items[1]);
  const shorter=render(short);
  assert(shorter.every((v,i)=>heightAt(i)<.4||v===0));
  assert(initial.some((v,i)=>heightAt(i)>.4&&v>0));

  const wider=editWeatherTrace(d,id,'size',42);
  assert.equal(findMask(wider,id).items[1].params.sizeMeters,.42);
  assert.notDeepEqual(initial,render(wider));

  const sparse=render(editWeatherTrace(d,id,'amount',.25));
  const dense=render(editWeatherTrace(d,id,'amount',.72));
  assert(dense.every((v,i)=>v>=sparse[i]));
  assert(dense.some((v,i)=>v>sparse[i]));
 }
});

test('深色流挂的横纵尺度及覆盖量写回独立参数，柔边和种子仍有效',()=>{
 const {d,id}=libraryEffect('builtin-rain-dark'),render=sampler(id);
 const initial=render(d);
 for(const [key,value,param,stored] of [
  ['width',3.5,'widthMeters',.035],['length',.65,'lengthMeters',.65],
  ['amount',.55,'threshold',.45],['softness',.045,'softness',.045],['seed',17,'seed',17],
 ]){
  const next=editWeatherTrace(d,id,key,value),params=findMask(next,id).items[0].params;
  assert.deepEqual(Object.keys(params),Object.keys(findMask(d,id).items[0].params));
  close(params[param],stored);
  assert.notDeepEqual(initial,render(next),key);
  assert.deepEqual(findEffect(next,id).params,findEffect(d,id).params);
 }
 const dense=render(editWeatherTrace(d,id,'amount',.55));
 assert(dense.every((v,i)=>v>=initial[i]));
 assert.throws(()=>editWeatherTrace(d,id,'height',1));
 assert.throws(()=>editWeatherTrace(d,id,'width',.2));
});

test('沉积共享蒙版写时分离并保留作用范围、手绘和其他图层，支持撤销',()=>{
 const {d,id}=libraryEffect('builtin-mud-root');
 d.surface=appendPaintRule(d.surface,id,source).s;
 const paint=findMask(d,id).items.find(r=>r.type==='paint'),erase=findArea(d,paint.eraseRef);
 erase.strokes.push({face:0,bary:[1,0,0],radiusMeters:.12,hardness:.7,strength:.8,value:0});
 const scopeRef=crypto.randomUUID();
 d.surface.areas.push({id:scopeRef,name:'低位自定义范围',kind:'height',sourceSHA256:source,
  strokes:[],scope:{kind:'height',min:0,max:.4,feather:.02},partId:null});
 findEffect(d,id).scopeRef=scopeRef;
 const {s,id:sibling}=addEffect(d.surface,'dirt');
 d.surface=s;
 Object.assign(findEffect(d,sibling),{maskRef:findEffect(d,id).maskRef,scopeRef,locked:true,enabled:false});
 pruneSurfaceResources(d.surface);
 const before=validateDocument(d),edited=editWeatherTrace(before,id,'height',.48);
 assert.notEqual(findEffect(edited,id).maskRef,findEffect(before,id).maskRef);
 assert.deepEqual(findMask(edited,sibling),findMask(before,sibling));
 assert.equal(findEffect(edited,id).scopeRef,scopeRef);
 assert.deepEqual(findArea(edited,scopeRef),findArea(before,scopeRef));
 const editedPaint=findMask(edited,id).items.find(r=>r.type==='paint');
 assert.notEqual(editedPaint.eraseRef,paint.eraseRef);
 assert.deepEqual(findArea(edited,editedPaint.eraseRef).strokes,erase.strokes);
 close(findMask(edited,id).items[0].params.maxMeters,.48);
 close(findMask(edited,id).items[0].params.featherMeters,.1);
 assert.throws(()=>editWeatherTrace(edited,sibling,'height',1),/解锁|锁定/);
 assert.deepEqual(before,validateDocument(d));
 const history=new History();
 history.reset(before);
 assert.equal(history.commit(edited),true);
 assert.deepEqual(history.undo(),before);
 assert.deepEqual(history.redo(),edited);
});

test('关闭、反相和不同生成方式不会显示误导的沉积或流痕快捷控件',()=>{
 const {d,id}=libraryEffect('builtin-rain-dark'),mask=findMask(d,id);
 mask.items.push(createRule('invert'));
 assert.equal(controls(d,id),null);
 assert.throws(()=>editWeatherTrace(d,id,'amount',.5));
 mask.items.pop();
 mask.items[0].enabled=false;
 assert.equal(controls(d,id),null);
 const other=libraryEffect('builtin-rain-streaks');
 assert.equal(controls(other.d,other.id),null);
});
