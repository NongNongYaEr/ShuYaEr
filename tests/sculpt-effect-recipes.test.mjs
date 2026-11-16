import {test} from 'node:test';import assert from 'node:assert/strict';
import {SCULPT_OVERLAY_RECIPES,SCULPT_COMBINATIONS,SCULPT_PENDING_RECIPES} from '../material/web/sculpt-effect-catalog.js';
import {EFFECT_LIBRARY_BUILTINS,instantiateLibraryEntry,libraryEntryDependencies} from '../material/web/effect-library.js';
import {EFFECT_LIBRARY_BUILTINS as SERVER_EFFECTS} from '../material/effect-library.js';
import {createDocument,validateDocument,History} from '../material/web/project-state.js';
import {applyLibraryCombination,replacementSummary} from '../material/web/material-combinations.js';
import {applyDistributionTemplate} from '../material/web/distribution-templates.js';
import {activeDistribution,editPaintLine,paintLineRule,switchDistribution} from '../material/web/distribution-presets.js';
import {distributionCoverage} from '../material/web/distribution-modes.js';
import {emptyMaterialPaint} from '../material/web/material-paint.js';
import {appendPaintRule} from '../material/web/surface-effects.js';
import {layerLeafIds} from '../material/web/surface-layers.js';
import {SurfaceDistributionRasterizer} from '../material/web/surface-distribution.js';
const empty=()=>{const d=createDocument({source:'a'.repeat(64),name:'雕刻树配方',settings:{}});Object.assign(d.surface,{effects:[],layers:[],masks:[],areas:[]});return d;};
const entries=EFFECT_LIBRARY_BUILTINS.filter(e=>e.collection==='sculpt'),combo=id=>entries.find(e=>e.recipeId===id);
const freshPaint=EFFECT_LIBRARY_BUILTINS.find(e=>e.id==='builtin-paint-new');
const paintLine=(document,id)=>paintLineRule(document.surface,document.surface.effects.find(e=>e.id===id));
test('60套PBR配方与18组合均合法可切换；第60套携带真实发光参数',()=>{
 assert.equal(SCULPT_OVERLAY_RECIPES.length,60);assert.equal(SCULPT_PENDING_RECIPES.length,0);assert.equal(SCULPT_COMBINATIONS.length,18);assert.equal(entries.length,78);assert.equal(new Set(entries.map(e=>e.id)).size,78);
 for(const e of entries){const d=empty(),r=instantiateLibraryEntry(d,e),next=validateDocument({...d,surface:r.surface});assert.equal(next.surface.effects.length,e.effectCount,e.name);assert(next.surface.effects.length<=6);assert(next.surface.effects.filter(e=>e.type==='burl').reduce((n,e)=>n+e.params.burlCount,0)<=8);for(const effect of next.surface.effects)if(effect.type!=='burl'){if(e.recipeId!=='O09-1')assert(effect.distribution,e.name);const params=structuredClone(effect.params),switched=applyDistributionTemplate(next,effect.id,'D07');assert.deepEqual(switched.surface.effects.find(e=>e.id===effect.id).params,params);}}
 assert(entries.find(e=>e.recipeId==='O10-6').layers[0].emission.enabled);assert(new Set(SCULPT_OVERLAY_RECIPES.map(e=>JSON.stringify(e.layers.map(({name,...l})=>l)))) .size>55);
});
test('两套新刷白漆都覆盖树底，并在各自漆线上方 1.5 cm 内收边',()=>{
 const draft=empty(),actualHeightMeters=2;
 draft.actualHeightMeters=actualHeightMeters;
 const mesh={
  pos:Float32Array.of(0,0,0,1,0,0,1,2,0,0,2,0),
  normal:Float32Array.of(0,0,1,0,0,1,0,0,1,0,0,1),
  indices:Uint32Array.of(0,1,2,0,2,3),
  uv:Float32Array.of(0,0,1,0,1,1,0,1),
  min:[0,0,0],height:actualHeightMeters,sourceSHA256:draft.resources.source,
 };
 const presets=[
  [freshPaint,actualHeightMeters*.135],
  [combo('O09-1'),1.25],
 ];
 const size=512,raster=new SurfaceDistributionRasterizer(mesh,mesh,size,{padding:0});
 for(const [entry,maxMeters] of presets){
  const {surface}=instantiateLibraryEntry(draft,entry),document=validateDocument({...draft,surface});
  const [effect]=document.surface.effects,[mask]=document.surface.masks;
  assert.equal(effect.distribution,undefined);
  assert.equal(mask.items.length,1);
  assert.equal(mask.items[0].type,'height');
  assert.deepEqual(mask.items[0].params,{minMeters:0,maxMeters,featherMeters:.015});
  const {maps:[map]}=raster.render(document);
  const samples=Array.from({length:size},(_,i)=>({height:(i+.5)*actualHeightMeters/size,coverage:map[(i*size+(size>>1))*4]}));
  assert(samples.some(s=>s.coverage>0&&s.coverage<255));
  for(const {height,coverage} of samples){
   if(height<maxMeters) assert.equal(coverage,255);
   if(height>=maxMeters+.015) assert.equal(coverage,0);
  }
  const hardEdge=editPaintLine(document,effect.id,{featherMeters:0});
  const {maps:[sharpMap]}=raster.render(hardEdge);
  for(const [i,{height}] of samples.entries()){
   assert.equal(sharpMap[(i*size+(size>>1))*4],height<=maxMeters?255:0);
  }
 }
});
test('两套旧漆预设同用窄漆边，分别按斑驳噪声和真实凸曲率扣除',()=>{
 const draft=empty();
 draft.actualHeightMeters=4.8;
 const cases=[
  {id:'builtin-paint-old',wear:.3,dependency:[],rule:{type:'noise',combine:'subtract',strength:1,params:{sizeMeters:.35,threshold:.60,softness:.035,seed:3}}},
  {id:'builtin-paint-convex',wear:.25,dependency:['curvature'],rule:{type:'curvature',combine:'subtract',strength:.95,polarity:'convex',params:{threshold:.32,softness:.04}}},
 ];
 for(const {id,wear,dependency,rule} of cases){
  const recipe=EFFECT_LIBRARY_BUILTINS.find(e=>e.id===id);
  assert.deepEqual(SERVER_EFFECTS.find(e=>e.id===id),recipe);
  assert.deepEqual(libraryEntryDependencies(recipe),dependency);
  const {surface}=instantiateLibraryEntry(draft,recipe);
  const d=validateDocument({...draft,surface});
  const [effect]=d.surface.effects;
  const [heightRule,wornRule,paintRule]=d.surface.masks[0].items;
  assert.equal(d.surface.masks[0].items.length,3);
  assert.equal(effect.name,recipe.name);
  assert.equal(effect.params.paintWear,wear);
  assert.equal(paintLine(d,effect.id),heightRule);
  assert.deepEqual(heightRule.params,{minMeters:0,maxMeters:d.actualHeightMeters*.16,featherMeters:.015});
  const {id:ruleId,enabled,...authored}=wornRule;
  assert(ruleId&&enabled);
  assert.deepEqual(authored,rule);
  assert.equal(paintRule.type,'paint');
  assert(d.surface.areas.some(a=>a.id===paintRule.addRef));
  assert(d.surface.areas.some(a=>a.id===paintRule.eraseRef));
 }
});
test('旧白漆保留 10 cm 漆边，可收紧至 1.5 cm 或设为硬边，支持撤销重做',()=>{
 const draft=empty(),{surface,id}=instantiateLibraryEntry(draft,freshPaint);
 draft.surface=surface;
 paintLine(draft,id).params.featherMeters=.1;
 draft.surface.effects[0].edgeTreatment={version:2,blurCm:6,spreadCm:0,amount:1,resolution:512};
 const saved=validateDocument(draft),original=paintLine(saved,id);
 assert.equal(original.params.featherMeters*100,10);
 const history=new History();
 history.reset(saved);
 const narrowed=editPaintLine(saved,id,{},{tighten:true});
 assert.deepEqual(paintLine(narrowed,id),{...original,params:{...original.params,featherMeters:.015}});
 assert.equal(narrowed.surface.effects[0].edgeTreatment,undefined);
 history.commit(narrowed);
 const sharp=editPaintLine(narrowed,id,{maxMeters:2,featherMeters:0});
 assert.deepEqual(paintLine(sharp,id).params,{minMeters:0,maxMeters:2,featherMeters:0});
 assert.deepEqual(sharp.surface.effects[0].params,saved.surface.effects[0].params);
 history.commit(sharp);
 assert.deepEqual(history.undo(),narrowed);
 assert.deepEqual(history.undo(),saved);
 assert.deepEqual(history.redo(),narrowed);
 assert.deepEqual(history.redo(),sharp);
});
test('调整白漆漆线会先复制共享蒙版，锁定的图层不可编辑',()=>{
 const draft=empty(),first=instantiateLibraryEntry(draft,freshPaint);
 draft.surface=first.surface;
 const second=instantiateLibraryEntry(draft,freshPaint);
 draft.surface=second.surface;
 const [edited,locked]=draft.surface.effects;
 locked.maskRef=edited.maskRef;
 locked.locked=true;
 const before=structuredClone(draft);
 const next=editPaintLine(draft,first.id,{featherMeters:.04});
 assert.equal(draft.surface.effects[1].id,second.id);
 assert.equal(paintLine(next,first.id).params.featherMeters,.04);
 assert.deepEqual(paintLine(next,second.id),paintLine(draft,second.id));
 assert.notEqual(next.surface.effects[0].maskRef,next.surface.effects[1].maskRef);
 assert.equal(next.surface.effects[1].maskRef,locked.maskRef);
 assert.throws(()=>editPaintLine(next,second.id,{featherMeters:0}),/解锁/);
 assert.deepEqual(draft,before);
});
test('旧版材质内部分布切到按高度涂刷时，沿用涂刷比例和原表面区域',()=>{
 const draft=createDocument({source:'a'.repeat(64),name:'旧版白漆',settings:{paintHeight:.21},actualHeightMeters:2});
 const paint=draft.surface.effects.find(e=>e.type==='paint');
 const mask=draft.surface.masks.find(m=>m.id===paint.maskRef);
 const legacy=mask.items[0];
 const next=editPaintLine(draft,paint.id,{});
 const nextMask=next.surface.masks.find(m=>m.id===paint.maskRef);
 assert.deepEqual(paintLine(next,paint.id).params,{minMeters:0,maxMeters:.42,featherMeters:.015});
 assert.deepEqual(nextMask.items[1],{...legacy,combine:'intersect'});
 assert.deepEqual(next.surface.areas.find(a=>a.id===legacy.areaRef),draft.surface.areas.find(a=>a.id===legacy.areaRef));
});
test('旧满密度根部白漆以原半覆盖高度为漆线，保留范围和手绘修正',()=>{
 const draft=empty(),{surface,id}=instantiateLibraryEntry(draft,combo('O09-1'));
 draft.surface=surface;
 const previous=switchDistribution(draft,id,'root',{rootHeightMeters:1.25,density:1,cavityPreference:0});
 previous.surface=appendPaintRule(previous.surface,id,previous.resources.source).s;
 const [effect]=previous.surface.effects,[mask]=previous.surface.masks;
 const scope={id:crypto.randomUUID(),name:'限于树干底部',kind:'height',sourceSHA256:previous.resources.source,mode:'all',strokes:[],scope:{kind:'height',min:0,max:.4,feather:.03},partId:null,ownedBy:id};
 previous.surface.areas.push(scope);
 effect.scopeRef=scope.id;
 const painted=mask.items.find(r=>r.type==='paint');
 previous.surface.areas.find(a=>a.id===painted.eraseRef).strokes.push({face:0,bary:[1,0,0],radiusMeters:.1,hardness:.5,strength:1,value:0});
 const before=validateDocument(previous);
 assert.equal(paintLine(before,id),null);
 const converted=editPaintLine(before,id,{}),[next]=converted.surface.effects;
 const line=paintLine(converted,id);
 const oldRule=activeDistribution(before.surface,before.surface.effects[0]);
 assert(Math.abs(distributionCoverage([0,line.params.maxMeters,0],null,{},oldRule.params)-.5)<1e-6);
 assert.equal(line.params.featherMeters,.015);
 assert.equal(next.distribution,undefined);
 assert.equal(next.scopeRef,scope.id);
 assert.deepEqual(converted.surface.masks[0].items,[line,painted]);
 assert.deepEqual(converted.surface.areas,before.surface.areas);
});
test('18套组合均可替换所选组、撤销重做，不改变模型UV或基础材质',()=>{
 let d=empty();d=applyLibraryCombination(d,combo('C01')).document;const source=structuredClone(d.resources),h=new History();h.reset(d);
 for(const e of SCULPT_COMBINATIONS){const old=d.surface.layers[0].id,r=applyLibraryCombination(d,combo(e.recipeId),{mode:'replace',targetId:old});validateDocument(r.document);assert.equal(r.document.surface.layers.length,1);assert.equal(r.document.surface.effects.length,e.layers.length);assert.deepEqual(r.document.resources,source);h.commit(r.document);assert.deepEqual(h.undo(),validateDocument(d));assert.deepEqual(h.redo(),validateDocument(r.document));d=r.document;}
});
test('替换只作用选中组，保留手绘层和被外部引用的原下层及其组状态',()=>{
 let d=applyLibraryCombination(empty(),combo('C02')).document;const target=d.surface.layers[0],manual=d.surface.effects.find(e=>e.type==='moss'),lower=d.surface.effects[0];manual.paint=emptyMaterialPaint(d.resources.source,'moss-surface-v1');delete manual.distribution;target.opacity=.45;target.enabled=false;
 const outside=instantiateLibraryEntry(d,combo('O01-1'),{targetId:target.id,position:'after'});d.surface=outside.surface;const e=d.surface.effects.find(e=>e.id===outside.id);e.blend.conditions.height='cavity';e.blend.conditions.heightSource='layer';e.blend.conditions.sourceId=lower.id;
 const oldManual=structuredClone(manual),outsideId=e.id,summary=replacementSummary(d,target.id);assert(summary.keepIds.includes(manual.id));assert(summary.keepIds.includes(lower.id));
 const r=applyLibraryCombination(d,combo('C03'),{mode:'replace',targetId:target.id});validateDocument(r.document);assert.deepEqual(r.surface.effects.find(e=>e.id===manual.id),oldManual);assert(r.surface.effects.some(e=>e.id===outsideId));assert.equal(r.surface.layers.find(n=>n.id===target.id).opacity,.45);assert.equal(r.surface.layers.find(n=>n.id===target.id).enabled,false);assert.equal(layerLeafIds(r.surface,target.id).length,2);
});
test('预算或锁定失败不删除原组合；手绘保护不可用来绕过预算',()=>{
 let d=applyLibraryCombination(empty(),combo('C01')).document;d=applyLibraryCombination(d,combo('C01')).document;d=applyLibraryCombination(d,combo('C01')).document;const before=JSON.stringify(d);assert.throws(()=>applyLibraryCombination(d,combo('C02')),/预算/);assert.equal(JSON.stringify(d),before);d.surface.layers[0].locked=true;assert.throws(()=>applyLibraryCombination(d,combo('C02'),{mode:'replace',targetId:d.surface.layers[0].id}),/解锁/);assert.throws(()=>applyLibraryCombination(d,combo('C02'),{mode:'replace',targetId:d.surface.effects[0].id}),/图层组/);
});
