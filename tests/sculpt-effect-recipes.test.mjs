import {test} from 'node:test';import assert from 'node:assert/strict';
import {SCULPT_OVERLAY_RECIPES,SCULPT_COMBINATIONS,SCULPT_PENDING_RECIPES} from '../material/web/sculpt-effect-catalog.js';
import {EFFECT_LIBRARY_BUILTINS,instantiateLibraryEntry} from '../material/web/effect-library.js';
import {createDocument,validateDocument,History} from '../material/web/project-state.js';
import {applyLibraryCombination,replacementSummary} from '../material/web/material-combinations.js';
import {applyDistributionTemplate} from '../material/web/distribution-templates.js';
import {emptyMaterialPaint} from '../material/web/material-paint.js';
import {layerLeafIds} from '../material/web/surface-layers.js';
const empty=()=>{const d=createDocument({source:'a'.repeat(64),name:'雕刻树配方',settings:{}});Object.assign(d.surface,{effects:[],layers:[],masks:[],areas:[]});return d;};
const entries=EFFECT_LIBRARY_BUILTINS.filter(e=>e.collection==='sculpt'),combo=id=>entries.find(e=>e.recipeId===id);
test('60套PBR配方与18组合均合法可切换；第60套携带真实发光参数',()=>{
 assert.equal(SCULPT_OVERLAY_RECIPES.length,60);assert.equal(SCULPT_PENDING_RECIPES.length,0);assert.equal(SCULPT_COMBINATIONS.length,18);assert.equal(entries.length,78);assert.equal(new Set(entries.map(e=>e.id)).size,78);
 for(const e of entries){const d=empty(),r=instantiateLibraryEntry(d,e),next=validateDocument({...d,surface:r.surface});assert.equal(next.surface.effects.length,e.effectCount,e.name);assert(next.surface.effects.length<=6);assert(next.surface.effects.filter(e=>e.type==='burl').reduce((n,e)=>n+e.params.burlCount,0)<=8);for(const effect of next.surface.effects)if(effect.type!=='burl'){assert(effect.distribution,e.name);const params=structuredClone(effect.params),switched=applyDistributionTemplate(next,effect.id,'D07');assert.deepEqual(switched.surface.effects.find(e=>e.id===effect.id).params,params);}}
 assert(entries.find(e=>e.recipeId==='O10-6').layers[0].emission.enabled);assert(new Set(SCULPT_OVERLAY_RECIPES.map(e=>JSON.stringify(e.layers.map(({name,...l})=>l)))) .size>55);
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
