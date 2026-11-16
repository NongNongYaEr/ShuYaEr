import test from 'node:test';
import assert from 'node:assert/strict';
import {attachmentControls,editAttachment} from '../material/web/attachment-distribution.js';
import {switchDistribution} from '../material/web/distribution-presets.js';
import {EFFECT_LIBRARY_BUILTINS,instantiateLibraryEntry} from '../material/web/effect-library.js';
import {applyDefaultImportMaterial} from '../material/web/import-material-default.js';
import {createDocument,History,validateDocument} from '../material/web/project-state.js';
import {SurfaceDistributionRasterizer} from '../material/web/surface-distribution.js';
import {addEffect,createRule} from '../material/web/surface-effects.js';
import {pruneSurfaceResources} from '../material/web/surface-layers.js';

const source='a'.repeat(64),actualHeightMeters=5,resolution=128;
const plane={
 pos:Float32Array.of(0,0,0,2,0,0,2,5,0,0,5,0),
 normal:Float32Array.of(0,0,1,0,0,1,0,0,1,0,0,1),
 indices:Uint32Array.of(0,1,2,0,2,3),uv:Float32Array.of(0,0,1,0,1,1,0,1),
 min:[0,0,0],max:[2,5,0],height:actualHeightMeters,sourceSHA256:source,
};
const fresh=()=>createDocument({source,actualHeightMeters,name:'自然附着测试',settings:{}});
const effect=(d,id)=>d.surface.effects.find(e=>e.id===id);
const mask=(d,id)=>d.surface.masks.find(m=>m.id===effect(d,id).maskRef);
const area=(d,id)=>d.surface.areas.find(a=>a.id===id);
const controls=(d,id)=>attachmentControls(d,effect(d,id));
const field=(d,id,key)=>controls(d,id).fields.find(f=>f.key===key);

function libraryAttachment(key){
 const d=fresh();
 Object.assign(d.surface,{effects:[],masks:[],areas:[],layers:[]});
 const entry=EFFECT_LIBRARY_BUILTINS.find(e=>e.id===key);
 const {surface,id}=instantiateLibraryEntry(d,entry);
 d.surface=surface;
 return {d:validateDocument(d),id};
}

function rootInDefaultGroup(){
 const d=fresh();
 d.surface=applyDefaultImportMaterial(d);
 const id=d.surface.effects.find(e=>e.type==='moss').id;
 for(const e of d.surface.effects)e.enabled=e.id===id;
 return {d:validateDocument(d),id};
}

function sampler(id,{ao=null}={}){
 const raster=new SurfaceDistributionRasterizer(plane,plane,resolution,{padding:0});
 return d=>{
  const {maps,slots}=raster.render(d,{ao}),slot=slots.indexOf(id);
  return Uint8Array.from({length:resolution*resolution},(_,i)=>maps[slot>>2][i*4+(slot%4)]);
 };
}

const heightAt=i=>(Math.floor(i/resolution)+.5)/resolution*actualHeightMeters;
const close=(value,expected)=>assert(Math.abs(value-expected)<1e-9,`${value} ≠ ${expected}`);

test('自然附着首屏从当前规则读取默认值和单位，重命名层后仍可读',()=>{
 for(const [key,kind,values] of [
  ['builtin-moss-root','root',{height:1.25,amount:.6,size:20}],
  ['builtin-moss-scattered','scattered',{amount:.42,size:20,softness:.12}],
  ['builtin-lichen-scattered','scattered',{amount:.42,size:12,softness:.12}],
 ]){
  const {d,id}=libraryAttachment(key);
  effect(d,id).name='用户命名的层';
  const before=structuredClone(d);
  assert.equal(controls(d,id).kind,kind);
  for(const [key,expected] of Object.entries(values))close(field(d,id,key).value,expected);
  assert.equal(field(d,id,'size').unit,'cm');
  if(kind==='root')assert.equal(field(d,id,'height').unit,'m');
  assert.deepEqual(d,before);
 }
 const {d,id}=rootInDefaultGroup();
 assert.equal(controls(d,id).kind,'root');
 close(field(d,id,'height').value,1.85);
 close(field(d,id,'amount').value,.55);
 close(field(d,id,'size').value,28);
});

test('不为反相或关闭的生成器提供覆盖量，非高度范围不误显示附着高度',()=>{
 const {d,id}=libraryAttachment('builtin-moss-scattered');
 const selectedMask=mask(d,id);
 selectedMask.items.push(createRule('invert'));
 assert.equal(controls(d,id),null);
 assert.throws(()=>editAttachment(d,id,'amount',.7));
 selectedMask.items.pop();
 selectedMask.items[0].enabled=false;
 assert.equal(controls(d,id),null);

 const root=libraryAttachment('builtin-moss-root');
 effect(root.d,root.id).scopeRef=null;
 assert.equal(controls(root.d,root.id).kind,'root');
 assert.equal(field(root.d,root.id,'height'),undefined);
 assert(!field(root.d,root.id,'amount').disabled);
});

test('薄散苔藓和零散地衣的密度、斑块尺寸、斑缘过渡能分别改变真实光栅蒙版',()=>{
 for(const key of ['builtin-moss-scattered','builtin-lichen-scattered']){
  const {d,id}=libraryAttachment(key),render=sampler(id);
  const sparser=render(editAttachment(d,id,'amount',.2)),denser=render(editAttachment(d,id,'amount',.8));
  assert(denser.every((value,i)=>value>=sparser[i]));
  assert(denser.some((value,i)=>value>sparser[i]));

  const medium=editAttachment(d,id,'amount',.5);
  const fine=render(editAttachment(medium,id,'size',10)),coarse=render(editAttachment(medium,id,'size',40));
  assert.notDeepEqual(fine,coarse);
  const stored=editAttachment(medium,id,'size',40);
  close(mask(stored,id).items[0].params.sizeMeters,.4);
  close(field(validateDocument(stored),id,'size').value,40);

  const sharp=render(editAttachment(medium,id,'softness',.01));
  const soft=render(editAttachment(medium,id,'softness',.2));
  const partial=values=>values.filter(value=>value>0&&value<255).length;
  assert(partial(soft)>partial(sharp));
 }
});

test('单项根部厚苔的物理高度约束蒙版上沿，覆盖量和斑块尺寸在范围内生效',()=>{
 const {d,id}=libraryAttachment('builtin-moss-root');
 const render=sampler(id,{ao:Float32Array.of(.2,.2,.2,.2)});
 const higher=editAttachment(d,id,'height',2.5);
 const short=render(d),tall=render(higher);
 assert(short.every((value,i)=>heightAt(i)<1.25||value===0));
 assert(tall.some((value,i)=>heightAt(i)>1.25&&heightAt(i)<2.5&&value>0));
 assert(tall.every((value,i)=>heightAt(i)<2.5||value===0));
 const sparser=render(editAttachment(higher,id,'amount',.2));
 const denser=render(editAttachment(higher,id,'amount',.8));
 assert(denser.every((value,i)=>value>=sparser[i]));
 assert(denser.some((value,i)=>value>sparser[i]));
 assert.notDeepEqual(tall,render(editAttachment(higher,id,'size',45)));
 assert.deepEqual(mask(higher,id),mask(d,id));
 assert.deepEqual(effect(higher,id).params,effect(d,id).params);
});

test('组合 A 的根部厚苔保留开阔根补足，零密度禁用无效项且可调回',()=>{
 const {d,id}=rootInDefaultGroup(),render=sampler(id);
 const original=mask(d,id).items[0];
 assert.equal(original.type,'treeauto');
 assert.equal(original.openRootFallback,true);
 const grown=editAttachment(d,id,'height',2.6);
 assert.deepEqual(mask(grown,id).items[0],{...original,params:{...original.params,rootHeightMeters:2.6}});
 const base=render(d),tall=render(grown);
 assert(base.every((value,i)=>heightAt(i)<1.85||value===0));
 assert(tall.some((value,i)=>heightAt(i)>1.85&&heightAt(i)<2.6&&value>0));
 const zero=editAttachment(grown,id,'amount',0);
 assert(field(zero,id,'height').disabled);
 assert(field(zero,id,'size').disabled);
 assert(render(zero).every(value=>value===0));
 const full=editAttachment(zero,id,'amount',1);
 assert(!field(full,id,'size').disabled);
 assert.notDeepEqual(render(full),render(editAttachment(full,id,'size',45)));
 const noSupplement=structuredClone(full);
 mask(noSupplement,id).items[0].openRootFallback=false;
 assert(field(noSupplement,id,'size').disabled);
});

test('根部附着快捷编辑分离共享范围和蒙版，同一笔触与锁定层可保留',()=>{
 const {d,id}=libraryAttachment('builtin-moss-root');
 const {s,id:sibling}=addEffect(d.surface,'moss');
 d.surface=s;
 const originalMask=mask(d,id),scopeId=effect(d,id).scopeRef;
 const erase=area(d,originalMask.items.find(r=>r.type==='paint').eraseRef);
 erase.strokes.push({face:0,bary:[1,0,0],radiusMeters:.1,hardness:.5,strength:1,value:0});
 Object.assign(effect(d,sibling),{maskRef:originalMask.id,scopeRef:scopeId,locked:true});
 pruneSurfaceResources(d.surface);
 const before=validateDocument(d);

 const withHeight=editAttachment(before,id,'height',2.5);
 assert.notEqual(effect(withHeight,id).scopeRef,scopeId);
 assert.equal(effect(withHeight,sibling).scopeRef,scopeId);
 close(area(withHeight,scopeId).scope.max,.25);
 const authoredScope=area(withHeight,effect(withHeight,id).scopeRef);
 close(authoredScope.scope.max,.5);
 assert.equal(authoredScope.presetOwned,false);
 assert.equal(effect(switchDistribution(withHeight,id,'scattered'),id).scopeRef,authoredScope.id);
 assert.deepEqual(mask(withHeight,id),originalMask);

 const edited=editAttachment(withHeight,id,'amount',.8);
 assert.notEqual(effect(edited,id).maskRef,originalMask.id);
 assert.deepEqual(mask(edited,sibling),originalMask);
 const newErase=area(edited,mask(edited,id).items.find(r=>r.type==='paint').eraseRef);
 assert.notEqual(newErase.id,erase.id);
 assert.deepEqual(newErase.strokes,erase.strokes);
 assert.throws(()=>editAttachment(edited,sibling,'height',2),/解锁|锁定/);
 assert.throws(()=>editAttachment(edited,id,'height',-1));
 assert.deepEqual(before,validateDocument(d));

 const history=new History();
 history.reset(before);
 assert.equal(history.commit(edited),true);
 assert.deepEqual(history.undo(),before);
 assert.deepEqual(history.redo(),validateDocument(edited));
});
