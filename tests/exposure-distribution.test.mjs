import test from 'node:test';
import assert from 'node:assert/strict';
import {EFFECT_LIBRARY_BUILTINS,instantiateLibraryEntry} from '../material/web/effect-library.js';
import {editExposure,exposureControls} from '../material/web/exposure-distribution.js';
import {createDocument,History,validateDocument} from '../material/web/project-state.js';
import {SurfaceDistributionRasterizer} from '../material/web/surface-distribution.js';
import {addEffect,appendPaintRule,createRule} from '../material/web/surface-effects.js';
import {pruneSurfaceResources} from '../material/web/surface-layers.js';

const source='e'.repeat(64),resolution=128;
const effect=(d,id)=>d.surface.effects.find(e=>e.id===id);
const mask=(d,id)=>d.surface.masks.find(m=>m.id===effect(d,id).maskRef);
const area=(d,id)=>d.surface.areas.find(a=>a.id===id);
const controls=(d,id)=>exposureControls(d,effect(d,id));
const close=(v,w)=>assert(Math.abs(v-w)<1e-8,`${v} ≠ ${w}`);

function preset(key,actualHeightMeters=3){
 const d=createDocument({source,actualHeightMeters,name:'朝向与开放边缘测试',settings:{}});
 Object.assign(d.surface,{effects:[],masks:[],areas:[],layers:[]});
 const {id,surface}=instantiateLibraryEntry(d,EFFECT_LIBRARY_BUILTINS.find(e=>e.id===key));
 d.surface=surface;
 return {d:validateDocument(d),id};
}

function meshData(pos,normal,uv,indices,height,min){
 return {
  pos:Float32Array.from(pos),normal:Float32Array.from(normal),uv:Float32Array.from(uv),
  indices:Uint32Array.from(indices),height,min,sourceSHA256:source,
 };
}

function directionalFaces(){
 const faces=[
  {origin:[0,0,0],u:[1,0,0],v:[0,0,-1],normal:[0,1,0]},
  {origin:[2,0,0],u:[0,0,-1],v:[0,3,0],normal:[1,0,0]},
  {origin:[3,0,0],u:[1,0,0],v:[0,.8,-.62],normal:[0,.62/Math.hypot(.8,.62),.8/Math.hypot(.8,.62)]},
 ];
 const pos=[],normal=[],uv=[],indices=[];
 for(const [i,plane] of faces.entries()){
  for(const [u,v] of [[0,0],[1,0],[1,1],[0,1]]){
   pos.push(...plane.origin.map((x,j)=>x+u*plane.u[j]+v*plane.v[j]));
   normal.push(...plane.normal);
   uv.push(.02+i/3+u*.28,.02+v*.9);
  }
  const a=i*4;
  indices.push(a,a+1,a+2,a,a+2,a+3);
 }
 return meshData(pos,normal,uv,indices,3,[0,0,-1]);
}

function openGrid(){
 const pos=[],normal=[],uv=[],indices=[],n=8;
 for(let y=0;y<=n;y++)for(let x=0;x<=n;x++){
  pos.push(x/n,y/n,0);
  normal.push(0,0,1);
  uv.push(x/n,y/n);
 }
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const a=y*(n+1)+x,next=a+n+1;
  indices.push(a,a+1,next,a+1,next+1,next);
 }
 return meshData(pos,normal,uv,indices,1,[0,0,0]);
}

function closedTetrahedron(){
 const points=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]];
 const faces=[[0,2,1],[0,1,3],[0,3,2],[1,2,3]];
 const normals=[[0,0,-1],[0,-1,0],[-1,0,0],[1/Math.sqrt(3),1/Math.sqrt(3),1/Math.sqrt(3)]];
 const pos=[],normal=[],uv=[],indices=[];
 for(const [i,face] of faces.entries()){
  const offset=[(i%2)*.5,Math.floor(i/2)*.5];
  for(const [j,[u,v]] of [[.03,.03],[.45,.03],[.03,.45]].entries()){
   pos.push(...points[face[j]]);
   normal.push(...normals[i]);
   uv.push(offset[0]+u,offset[1]+v);
   indices.push(i*3+j);
  }
 }
 return meshData(pos,normal,uv,indices,1,[0,0,0]);
}

function sampler(mesh,id){
 const raster=new SurfaceDistributionRasterizer(mesh,mesh,resolution,{padding:0});
 const sampleIndexes=Array.from(raster.raster.nearest.keys()).filter(i=>raster.raster.nearest[i]===i);
 assert(sampleIndexes.length>1000);
 return d=>{
  const result=raster.render(d),slot=result.slots.indexOf(id),map=result.maps[slot>>2];
  const values=Uint8Array.from(sampleIndexes,i=>map[i*4+slot%4]);
  return {values,structure:result.analysis.structure};
 };
}

const directionalPresets=[
 ['builtin-dust-up',0,Math.acos(.25)*180/Math.PI,.70],
 ['builtin-bleach-sun',2,Math.acos(.25)*180/Math.PI,.75],
 ['builtin-sculpt-overlay-o10-3',0,55,.96],
];
const edgePreset='builtin-sculpt-overlay-o01-5';

test('朝向和边缘快捷控件读取已有规则、单位和配方值，与图层名无关',()=>{
 for(const [key,direction,angle,amount] of directionalPresets){
  const {d,id}=preset(key);
  effect(d,id).name='用户改名后的朝向层';
  const before=structuredClone(d),fields=Object.fromEntries(controls(d,id).fields.map(f=>[f.key,f]));
  assert.deepEqual(Object.keys(fields),['direction','angle','amount']);
  for(const [name,value] of Object.entries({direction,angle,amount}))close(Number(fields[name].value),value);
  assert.equal(fields.angle.unit,'°');
  assert.deepEqual(d,before);
 }
 const {d,id}=preset(edgePreset);
 const width=controls(d,id).fields.find(f=>f.key==='width');
 assert.equal(width.value,8);
 assert.equal(width.unit,'cm');
 assert(!controls(d,id).fields.some(f=>['direction','angle'].includes(f.key)));
});

test('三个朝向图层的方向、选取角度和覆盖量分别改变实际蒙版',()=>{
 for(const [key,direction] of directionalPresets){
  const {d,id}=preset(key),sample=sampler(directionalFaces(),id);
  const baseline=sample(d).values;
  assert(baseline.some(v=>v>0),key);
  const turned=editExposure(d,id,'direction',direction===0?2:0);
  assert.notDeepEqual(baseline,sample(turned).values,key);
  const narrower=sample(editExposure(d,id,'angle',35)).values;
  assert(narrower.every((v,i)=>v<=baseline[i]),key);
  assert(narrower.some((v,i)=>v<baseline[i]),key);
  const sparse=sample(editExposure(d,id,'amount',.18)).values;
  const dense=sample(editExposure(d,id,'amount',.83)).values;
  assert(dense.every((v,i)=>v>=sparse[i]),key);
  assert(dense.some((v,i)=>v>sparse[i]),key);
  assert.deepEqual(effect(turned,id).params,effect(d,id).params);
  const managed=mask(turned,id).items.find(r=>r.type==='distribution');
  if(managed)assert.deepEqual(effect(turned,id).distribution.memory.orientation,managed.params);
 }
});

test('开放边缘宽度改变真实连通遮罩，封闭的 UV 分岛四面体维持全零',()=>{
 const {d,id}=preset(edgePreset,1);
 const wider=editExposure(d,id,'width',42);
 assert.equal(effect(wider,id).distribution.memory.boundary.boundaryCm,42);
 const sampleOpen=sampler(openGrid(),id),before=sampleOpen(d),after=sampleOpen(wider);
 assert.equal(before.structure.openEdges,32);
 assert.equal(after.structure.openEdges,32);
 assert(before.values.some(v=>v>0)&&before.values.some(v=>v===0));
 assert(after.values.every((v,i)=>v>=before.values[i]));
 assert(after.values.some((v,i)=>v>before.values[i]));

 const sampleClosed=sampler(closedTetrahedron(),id);
 for(const input of [d,wider]){
  const {values,structure}=sampleClosed(input);
  assert.equal(structure.openEdges,0);
  assert(values.every(v=>v===0));
 }
});

test('共享朝向蒙版写时分离，保留旧朝向、作用范围、手绘和锁定层',()=>{
 const {d,id}=preset('builtin-dust-up');
 d.surface=appendPaintRule(d.surface,id,source).s;
 const paint=mask(d,id).items.find(r=>r.type==='paint');
 const erase=area(d,paint.eraseRef);
 erase.strokes.push({face:0,bary:[1,0,0],radiusMeters:.1,hardness:.6,strength:1,value:0});
 const scopeRef=crypto.randomUUID();
 d.surface.areas.push({id:scopeRef,name:'用户范围',kind:'height',sourceSHA256:source,
  strokes:[],scope:{kind:'height',min:0,max:.8,feather:.03},partId:null});
 effect(d,id).scopeRef=scopeRef;
 const {s,id:sibling}=addEffect(d.surface,'dust');
 d.surface=s;
 Object.assign(effect(d,sibling),{maskRef:effect(d,id).maskRef,scopeRef,locked:true,enabled:false});
 pruneSurfaceResources(d.surface);
 const before=validateDocument(d),edited=editExposure(before,id,'direction',2);
 assert.notEqual(effect(edited,id).maskRef,effect(before,id).maskRef);
 assert.deepEqual(mask(edited,sibling),mask(before,sibling));
 assert.equal(effect(edited,id).scopeRef,scopeRef);
 assert.deepEqual(area(edited,scopeRef),area(before,scopeRef));
 const editedPaint=mask(edited,id).items.find(r=>r.type==='paint');
 assert.notEqual(editedPaint.eraseRef,paint.eraseRef);
 assert.deepEqual(area(edited,editedPaint.eraseRef).strokes,erase.strokes);
 assert.equal(mask(edited,id).items[0].polarity,'positiveX');
 assert.equal(mask(edited,id).items[0].params.softness,mask(before,id).items[0].params.softness);
 assert.throws(()=>editExposure(before,sibling,'direction',2),/解锁|锁定/);
 assert.throws(()=>editExposure(before,id,'direction',.5));
 assert.deepEqual(before,validateDocument(d));
 const history=new History();
 history.reset(before);
 assert.equal(history.commit(edited),true);
 assert.deepEqual(history.undo(),before);
 assert.deepEqual(history.redo(),edited);
});

test('关闭、反相或重复生成器不显示不对应的朝向快控',()=>{
 const {d,id}=preset('builtin-dust-up'),items=mask(d,id).items;
 items.push(createRule('invert'));
 assert.equal(controls(d,id),null);
 assert.throws(()=>editExposure(d,id,'amount',.5));
 items.pop();
 items.push(createRule('orientation'));
 assert.equal(controls(d,id),null);
 items.pop();
 items[0].enabled=false;
 assert.equal(controls(d,id),null);
});

test('纯朝向只有在零底色时暴露可反向调回的正向覆盖量',()=>{
 const {d,id}=preset('builtin-bleach-sun'),selected=mask(d,id);
 selected.items.pop();
 // On a filled base, lowering replace strength fills pixels outside the direction.
 assert(!controls(d,id).fields.some(f=>f.key==='amount'));
 assert.throws(()=>editExposure(d,id,'amount',.3));

 selected.initial=0;
 const sample=sampler(directionalFaces(),id),full=sample(d).values;
 const mid=editExposure(d,id,'amount',.4),midValues=sample(mid).values;
 assert.equal(mask(mid,id).items[0].strength,.4);
 assert(midValues.every((v,i)=>Math.abs(v-full[i]*.4)<=1));
 const zero=editExposure(mid,id,'amount',0);
 assert(sample(zero).values.every(v=>v===0));
 assert(controls(zero,id).fields.find(f=>f.key==='direction').disabled);
 assert(!controls(zero,id).fields.find(f=>f.key==='amount').disabled);
 assert.deepEqual(sample(editExposure(zero,id,'amount',1)).values,full);

 selected.items.unshift(createRule('levels'));
 assert(!controls(d,id).fields.some(f=>f.key==='amount'));
});
