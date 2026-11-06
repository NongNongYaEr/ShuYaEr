import {test} from 'node:test';import assert from 'node:assert/strict';
import {SURFACE_MATERIAL_BRUSHES} from '../material/web/material-brush-rules.js';
import {prepareMaterialBrush} from '../material/web/surface-material-brushes.js';
import {createDocument,validateDocument} from '../material/web/project-state.js';
import {validateDocument as serverValidate} from '../material/project-state.js';
import {applyDistributionTemplate} from '../material/web/distribution-templates.js';
import {applyLibraryCombination,replacementSummary} from '../material/web/material-combinations.js';
import {EFFECT_LIBRARY_BUILTINS} from '../material/web/effect-library.js';
const doc=()=>createDocument({source:'a'.repeat(64),name:'材质画笔',settings:{}});
test('十种材质画笔使用空白绘制层，与自动分布分开，服务端可保存',()=>{
 assert.equal(SURFACE_MATERIAL_BRUSHES.length,10);
 for(const p of SURFACE_MATERIAL_BRUSHES){const d=doc(),r=prepareMaterialBrush(d,p.id),e=r.document.surface.effects.find(e=>e.id===r.id),m=r.document.surface.masks.find(m=>m.id===e.maskRef);assert(r.created);assert.equal(e.type,p.type);assert.equal(m.initial,0);assert.deepEqual(m.items.map(r=>r.type),['paint']);assert(!e.distribution);assert(!e.scopeRef);assert.equal(validateDocument(r.document).surface.effects.at(-1).manualBrush.presetId,p.id);assert.equal(serverValidate(r.document).surface.effects.at(-1).manualBrush.presetId,p.id);assert.deepEqual(r.document.resources,d.resources);assert.throws(()=>applyDistributionTemplate(r.document,r.id,'D01'),/自动效果/);}
});
test('续画复用原层和笔触，换笔刷建立独立材质层，锁定层不改',()=>{
 const a=prepareMaterialBrush(doc(),'whitewash'),e=a.document.surface.effects.find(e=>e.id===a.id),m=a.document.surface.masks.find(m=>m.id===e.maskRef),r=m.items[0],area=a.document.surface.areas.find(a=>a.id===r.addRef);area.strokes.push({face:0,bary:[.2,.3,.5],radiusMeters:.12,hardness:.8,strength:.8,value:1});const b=prepareMaterialBrush(a.document,'whitewash',a.id);assert(!b.created);assert.equal(b.id,a.id);assert.deepEqual(b.document,a.document);const c=prepareMaterialBrush(b.document,'lichen-grain',b.id);assert(c.created);assert.equal(c.document.surface.effects.length,b.document.surface.effects.length+1);assert.deepEqual(c.document.surface.effects.find(e=>e.id===a.id).params,e.params);validateDocument(c.document);e.locked=true;assert.throws(()=>prepareMaterialBrush(a.document,'whitewash',a.id),/解锁/);
});
test('组合替换保留空的手工绘制层及其可编辑来源',()=>{
 let d=doc();Object.assign(d.surface,{effects:[],layers:[],masks:[],areas:[]});const entry=EFFECT_LIBRARY_BUILTINS.find(e=>e.recipeId==='C01'),a=applyLibraryCombination(d,entry),b=prepareMaterialBrush(a.document,'old-cork',a.surface.effects[0].id);const g=b.document.surface.layers[0];const summary=replacementSummary(b.document,g.id);assert(summary.keepIds.includes(b.id));const c=applyLibraryCombination(b.document,entry,{mode:'replace',targetId:g.id});assert(c.surface.effects.some(e=>e.id===b.id));validateDocument(c.document);
});
