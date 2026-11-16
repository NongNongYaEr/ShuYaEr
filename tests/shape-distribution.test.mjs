import test from 'node:test';
import assert from 'node:assert/strict';
import {editShape,shapeControls} from '../material/web/shape-distribution.js';
import {applyDefaultImportMaterial} from '../material/web/import-material-default.js';
import {createDocument,History,validateDocument} from '../material/web/project-state.js';
import {addEffect,appendPaintRule,createRule} from '../material/web/surface-effects.js';
import {pruneSurfaceResources} from '../material/web/surface-layers.js';
import {SurfaceDistributionRasterizer} from '../material/web/surface-distribution.js';

const source='e'.repeat(64),actualHeightMeters=5;
const effect=(d,id)=>d.surface.effects.find(e=>e.id===id);
const mask=(d,id)=>d.surface.masks.find(m=>m.id===effect(d,id).maskRef);
const rule=(d,id)=>mask(d,id).items.find(r=>r.type==='treeauto');
const controls=(d,id)=>shapeControls(d,effect(d,id));
const field=(d,id,key)=>{
 const {fields,advanced=[]}=controls(d,id);
 return [...fields,...advanced].find(f=>f.key===key);
};

function defaultLayer(role){
 const d=createDocument({source,actualHeightMeters,name:'形体分布测试',settings:{}});
 d.surface=applyDefaultImportMaterial(d);
 const id=d.surface.effects.find(e=>rule(d,e.id)?.params.role===role).id;
 for(const e of d.surface.effects)e.enabled=e.id===id;
 return {d:validateDocument(d),id};
}

function groovedSurface(){
 const columns=18,rows=6,width=2,amplitude=.13,frequency=2*Math.PI/.76;
 const pos=[],normal=[],uv=[],indices=[];
 for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
  const x=width*column/columns,y=actualHeightMeters*row/rows;
  const slope=-amplitude*frequency*Math.sin(frequency*x),scale=Math.hypot(slope,1);
  pos.push(x,y,amplitude*Math.cos(frequency*x));
  normal.push(-slope/scale,0,1/scale);
  uv.push(column/columns,row/rows);
 }
 for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
  const a=row*(columns+1)+column,next=a+columns+1;
  indices.push(a,a+1,next,a+1,next+1,next);
 }
 return {
  pos:Float32Array.from(pos),normal:Float32Array.from(normal),uv:Float32Array.from(uv),indices:Uint32Array.from(indices),
  min:[0,0,-amplitude],max:[width,actualHeightMeters,amplitude],height:actualHeightMeters,sourceSHA256:source,
 };
}

test('形体快捷控件读取各自的已有参数，仅接缝湿痕提供湿润高度',()=>{
 for(const [role,amount] of [[0,.82],[1,.55],[4,.97]]){
  const {d,id}=defaultLayer(role);
  effect(d,id).name='用户改名后的形体层';
  const before=structuredClone(d);
  assert.equal(field(d,id,'amount').value,amount);
  assert.equal(field(d,id,'recognition').value,18);
  assert.equal(field(d,id,'recognition').unit,'cm');
  assert.equal(field(d,id,'size').value,28);
  assert.equal(field(d,id,'size').unit,'cm');
  assert.equal(field(d,id,'softness').value,.08);
  assert.equal(field(d,id,'seed').value,0);
  assert.equal(field(d,id,'height')?.value,role===4?1.85:undefined);
  if(role===4)assert.equal(field(d,id,'height').unit,'m');
  else assert.throws(()=>editShape(d,id,'height',2));
  assert.deepEqual(d,before);
 }
});

test('覆盖为零时禁用辅助项，饱和时保留接缝湿痕的裸根斑块控制',()=>{
 for(const role of [0,1,4]){
  const {d,id}=defaultLayer(role),zero=editShape(d,id,'amount',0);
  for(const key of ['size','recognition','softness','seed'])assert(field(zero,id,key).disabled,key);
  if(role===4)assert(field(zero,id,'height').disabled);
  assert(!field(zero,id,'amount').disabled);
  const full=editShape(zero,id,'amount',1);
  assert(!field(full,id,'recognition').disabled);
  for(const key of ['size','softness','seed'])assert.equal(!!field(full,id,key).disabled,role!==4,key);
  if(role===4){
   assert(!field(full,id,'height').disabled);
   assert.equal(rule(full,id).openRootFallback,true);
   rule(full,id).openRootFallback=false;
   for(const key of ['size','softness','seed'])assert(field(full,id,key).disabled,key);
  }
  const restored=editShape(full,id,'amount',.65);
  assert(!field(restored,id,'size').disabled);
  assert.throws(()=>editShape(restored,id,'recognition',101));
  assert.throws(()=>editShape(restored,id,'seed',.2));
 }
});

test('形体快捷调节改变真实凹凸表面的光栅蒙版，接缝湿痕受物理高度限制',()=>{
 const mesh=groovedSurface(),resolution=96,raster=new SurfaceDistributionRasterizer(mesh,mesh,resolution,{padding:0});
 for(const role of [0,1,4]){
  const {d,id}=defaultLayer(role);
  const render=next=>{
   const {maps,slots}=raster.render(next),slot=slots.indexOf(id);
   return Uint8Array.from({length:resolution**2},(_,i)=>maps[slot>>2][i*4+slot%4]);
  };
  const defaultMask=render(d);
  const sparse=render(editShape(d,id,'amount',.26));
  assert(defaultMask.every((v,i)=>v>=sparse[i]));
  assert(defaultMask.some((v,i)=>v>sparse[i]),`role ${role} density`);
  assert.notDeepEqual(defaultMask,render(editShape(d,id,'size',47)),`role ${role} size`);
  assert.notDeepEqual(defaultMask,render(editShape(d,id,'recognition',32)),`role ${role} recognition`);
  if(role===4){
   const shorter=render(editShape(d,id,'height',.72));
   const y=i=>(Math.floor(i/resolution)+.5)*actualHeightMeters/resolution;
   assert(shorter.every((v,i)=>y(i)<.72||v===0));
   assert(defaultMask.some((v,i)=>y(i)>.72&&v>0));
  }
 }
});

test('共享规则分离后保留作用范围、手绘笔触和其他图层，支持锁定和撤销',()=>{
 const {d,id}=defaultLayer(4);
 d.surface=appendPaintRule(d.surface,id,source).s;
 const paint=mask(d,id).items.find(r=>r.type==='paint');
 const erase=d.surface.areas.find(a=>a.id===paint.eraseRef);
 erase.strokes.push({face:0,bary:[1,0,0],radiusMeters:.12,hardness:.7,strength:.8,value:0});
 const scopeId=crypto.randomUUID();
 d.surface.areas.push({id:scopeId,name:'只保留树根',kind:'height',sourceSHA256:source,strokes:[],scope:{kind:'height',min:0,max:.4,feather:.02},partId:null});
 effect(d,id).scopeRef=scopeId;
 const {s,id:sibling}=addEffect(d.surface,'wet');
 d.surface=s;
 Object.assign(effect(d,sibling),{maskRef:effect(d,id).maskRef,scopeRef:scopeId,locked:true,enabled:false});
 pruneSurfaceResources(d.surface);
 const before=validateDocument(d),next=editShape(before,id,'height',.65);
 assert.equal(rule(next,id).params.rootHeightMeters,.65);
 assert.equal(rule(next,id).openRootFallback,true);
 assert.notEqual(effect(next,id).maskRef,effect(before,id).maskRef);
 assert.deepEqual(mask(next,sibling),mask(before,sibling));
 assert.equal(effect(next,id).scopeRef,scopeId);
 assert.deepEqual(next.surface.areas.find(a=>a.id===scopeId),before.surface.areas.find(a=>a.id===scopeId));
 const editedPaint=mask(next,id).items.find(r=>r.type==='paint');
 assert.notEqual(editedPaint.eraseRef,paint.eraseRef);
 assert.deepEqual(next.surface.areas.find(a=>a.id===editedPaint.eraseRef).strokes,erase.strokes);
 assert.throws(()=>editShape(next,sibling,'height',2),/解锁|锁定/);
 assert.deepEqual(before,validateDocument(d));

 const history=new History();
 history.reset(before);
 assert.equal(history.commit(next),true);
 assert.deepEqual(history.undo(),before);
 assert.deepEqual(history.redo(),next);
});

test('关闭、反相和多个生成器的规则栈不采用首屏形体控件',()=>{
 const {d,id}=defaultLayer(0);
 mask(d,id).items.push(createRule('invert'));
 assert.equal(controls(d,id),null);
 assert.throws(()=>editShape(d,id,'amount',.5));
 mask(d,id).items.pop();
 mask(d,id).items.push(createRule('noise'));
 assert.equal(controls(d,id),null);
 mask(d,id).items.pop();
 rule(d,id).enabled=false;
 assert.equal(controls(d,id),null);
});
