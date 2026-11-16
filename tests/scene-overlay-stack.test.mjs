import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EFFECT_LIBRARY_BUILTINS,instantiateLibraryEntry} from '../material/web/effect-library.js';
import {EFFECT_LIBRARY_BUILTINS as SERVER_EFFECTS} from '../material/effect-library.js';
import {createDocument,validateDocument} from '../material/web/project-state.js';
import {validateDocument as validateServerDocument} from '../material/project-state.js';
import {SCENE_OVERLAYS} from '../material/web/scene-overlay-catalog.js';
import {SCENE_OVERLAYS as SERVER_CATALOG} from '../material/scene-overlay-catalog.js';
import {sceneOverlayDefaults,sceneOverlayRule,sceneOverlayMembers,sceneOverlayTarget} from '../material/web/scene-overlay-rules.js';
import {SurfaceDistributionRasterizer} from '../material/web/surface-distribution.js';
import {addEffect} from '../material/web/surface-effects.js';
import {deleteLayer,duplicateLayer,layerLeafIds} from '../material/web/surface-layers.js';
import {importSurfaceRecipe,packSurfaceRecipe} from '../material/web/surface-recipe.js';

const SHA='a'.repeat(64);
const pointA={face:0,bary:[.45,.15,.4]};
const pointB={face:1,bary:[.3,.45,.25]};
const pointC={face:1,bary:[.25,.26,.49]};

function empty(source=SHA){
 const document=createDocument({source,name:'场景叠加平面测试',settings:{},actualHeightMeters:2});
 Object.assign(document.surface,{effects:[],layers:[],masks:[],areas:[]});
 return document;
}

function fixture(){
 const mesh={
  pos:Float32Array.of(0,0,0,2,0,0,2,2,0,0,2,0),
  normal:Float32Array.of(0,0,1,0,0,1,0,0,1,0,0,1),
  indices:Uint32Array.of(0,1,2,0,2,3),
  uv:Float32Array.of(0,0,1,0,1,1,0,1),
  min:[0,0,0],max:[2,2,0],height:2,sourceSHA256:SHA,
 };
 return new SurfaceDistributionRasterizer(mesh,mesh,256,{padding:0});
}

function entry(style){
 return EFFECT_LIBRARY_BUILTINS.find(item=>item.id==='builtin-scene-'+style);
}

function append(document,style){
 const {surface,id}=instantiateLibraryEntry(document,entry(style));
 return {document:{...document,surface},id};
}

function instances(document,id){
 const {surface}=document;
 return layerLeafIds(surface,id).map(id=>{
  const effect=surface.effects.find(e=>e.id===id);
  return {effect,scene:sceneOverlayRule(surface,effect).scene};
 });
}

function place(document,id,points){
 for(const {scene} of instances(document,id)){
  scene.points=structuredClone(points);
  scene.source=points.length?document.resources.source:null;
 }
 return validateDocument(document);
}

function coverage(result,id){
 const index=result.slots.indexOf(id);
 assert(index>=0);
 const bytes=result.maps[index>>2];
 return Uint8Array.from({length:result.size**2},(_,i)=>bytes[i*4+index%4]);
}

const mass=bytes=>bytes.reduce((sum,value)=>sum+value,0);

test('32 个场景叠加前后端目录一致，内置配方原生实例可校验',()=>{
 const browser=EFFECT_LIBRARY_BUILTINS.filter(e=>e.collection==='scene');
 const server=SERVER_EFFECTS.filter(e=>e.collection==='scene');
 assert.equal(browser.length,32);
 assert.deepEqual(server,browser);
 assert.deepEqual(SERVER_CATALOG,SCENE_OVERLAYS);
 for(const recipe of browser){
  const style=recipe.sceneStyle;
  const {document,id}=append(empty(),style);
  const checked=validateDocument(document),roles=instances(checked,id);
  assert.deepEqual(validateServerDocument(document),checked,style);
  assert.equal(roles.length,SCENE_OVERLAYS[style].coatings.length,style);
  assert.equal(new Set(roles.map(({scene})=>scene.instance)).size,1,style);
  for(const [i,{effect,scene}] of roles.entries()){
   const coating=SCENE_OVERLAYS[style].coatings[i];
   assert.equal(effect.type,coating.type,style);
   assert.equal(scene.role,coating.role,style);
   assert.deepEqual(scene.params,sceneOverlayDefaults(style),style);
   assert.deepEqual(scene.points,[],style);
   assert.equal(scene.source,null,style);
  }
 }
});

test('自动、点放置、两点和沿面路径四类内置配方真正写入覆盖图',()=>{
 const raster=fixture();
 const tide=append(empty(),'tide');
 const tideMembers=instances(tide.document,tide.id);
 const first=raster.render(tide.document);
 const [mud,scum]=tideMembers.map(({effect})=>coverage(first,effect.id));
 assert(mass(mud)>mass(scum)&&mass(scum)>0);
 assert.notDeepEqual(mud,scum);
 const size=raster.size;
 let mudTop=-1;
 for(let i=0;i<mud.length;i++)if(mud[i])mudTop=Math.floor(i/size);
 assert(mudTop<size*.55&&mudTop>size*.33);

 for(const {style,points} of [
  {style:'spray',points:[pointA]},
  {style:'tool-teeth',points:[pointA,pointB]},
  {style:'strap',points:[pointA,pointB,pointC]},
 ]){
  const original=append(empty(),style);
  const members=instances(original.document,original.id);
  const before=raster.render(original.document);
  for(const {effect} of members)assert.equal(mass(coverage(before,effect.id)),0,style);
  if(style==='tool-teeth'){
   const incomplete=place(structuredClone(original.document),original.id,[pointA]);
   assert.equal(mass(coverage(raster.render(incomplete),members[0].effect.id)),0);
  }
  const placed=raster.render(place(original.document,original.id,points));
  for(const {effect,scene} of members){
   const bytes=coverage(placed,effect.id),weight=mass(bytes);
   assert(weight>255&&weight<255*bytes.length*.35,style+'/'+scene.role);
  }
 }
});

test('复制和删组保留实例内材质角色关系，跨模型预设保留外观并清除源面位置',()=>{
 const {document,id}=append(empty(),'sap');
 const placed=place(document,id,[pointA]);
 const originals=instances(placed,id);
 const clone=duplicateLayer(placed.surface,id);
 const both={...placed,surface:clone.s};
 const copies=instances(both,clone.id);
 assert.deepEqual(copies.map(({scene})=>scene.role),['main','drop']);
 assert.equal(sceneOverlayMembers(both.surface,copies[0].scene.instance).length,2);
 assert.notEqual(copies[0].scene.instance,originals[0].scene.instance);
 assert.deepEqual(copies.map(({scene})=>scene.points),[[pointA],[pointA]]);
 assert.notEqual(copies[0].effect.maskRef,originals[0].effect.maskRef);
 const survivor=validateDocument({...both,surface:deleteLayer(both.surface,id)});
 assert.deepEqual(survivor.surface.effects.map(effect=>effect.id),copies.map(({effect})=>effect.id));
 assert.deepEqual(validateServerDocument(JSON.parse(JSON.stringify(survivor))),survivor);

 const recipe=JSON.parse(JSON.stringify(packSurfaceRecipe(survivor)));
 const same=importSurfaceRecipe(recipe,empty());
 assert.equal(same.warnings.length,0);
 assert.deepEqual(instances({surface:same.surface},clone.id).map(({scene})=>scene.points),[[pointA],[pointA]]);
 const different=importSurfaceRecipe(recipe,empty('b'.repeat(64)));
 assert(different.warnings.some(warning=>warning.includes('场景叠加点位和路径')));
 const transported=instances({surface:different.surface},clone.id);
 for(const [i,{scene}] of transported.entries()){
  assert.equal(scene.role,copies[i].scene.role);
  assert.deepEqual(scene.params,copies[i].scene.params);
  assert.deepEqual(scene.points,[]);
  assert.equal(scene.source,null);
 }
});

function constantDust(document){
 const {s,id}=addEffect(document.surface,'dust');
 const effect=s.effects.find(e=>e.id===id);
 const mask=s.masks.find(m=>m.id===effect.maskRef);
 mask.initial=1;
 mask.items=[];
 return {document:{...document,surface:s},id};
}

test('冲洗只扣选中的下方积灰，强度平稳改变目标罩，失效引用不会改洗别层',()=>{
 const bottom=constantDust(empty());
 const upper=constantDust(bottom.document);
 const {document,id}=append(upper.document,'dust-wash');
 const [{effect,scene}]=instances(document,id);
 assert.equal(sceneOverlayTarget(document.surface,effect,scene).id,upper.id);
 scene.target=bottom.id;
 assert.equal(sceneOverlayTarget(document.surface,effect,scene).id,bottom.id);
 const raster=fixture(),render=()=>raster.render(document);

 effect.opacity=0;
 const original=render(),baseline=mass(coverage(original,bottom.id));
 assert(baseline>0);
 effect.opacity=.4;
 const mild=render(),light=mass(coverage(mild,bottom.id));
 effect.opacity=1;
 const heavy=render(),deep=mass(coverage(heavy,bottom.id));
 assert(baseline>light&&light>deep&&deep>0);
 assert.deepEqual(coverage(original,upper.id),coverage(mild,upper.id));
 assert.deepEqual(coverage(original,upper.id),coverage(heavy,upper.id));

 const removed={...document,surface:deleteLayer(document.surface,bottom.id)};
 const next=instances(removed,id)[0];
 assert.equal(sceneOverlayTarget(removed.surface,next.effect,next.scene),undefined);
 assert.deepEqual(coverage(original,upper.id),coverage(raster.render(removed),upper.id));
});
