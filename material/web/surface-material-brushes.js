import {surfaceMaterialBrush} from './material-brush-rules.js';
import {EFFECT_LIBRARY_BUILTINS,instantiateLibraryEntry} from './effect-library.js';
import {appendPaintRule,validateSurface} from './surface-effects.js';
import {layerIsLocked} from './surface-layers.js';
export function prepareMaterialBrush(document,presetId,targetId=null){
 const preset=surfaceMaterialBrush(presetId),d=structuredClone(document),old=d.surface.effects.find(e=>e.id===targetId);
 if(old?.manualBrush?.presetId===presetId){if(layerIsLocked(d.surface,old.id))throw Error('请先解锁绘制层。');const rule=d.surface.masks.find(m=>m.id===old.maskRef)?.items.find(r=>r.type==='paint');if(!rule)throw Error('绘制层的笔触数据已不存在。');return{document:d,id:old.id,ruleId:rule.id,preset,created:false};}
 const entry=EFFECT_LIBRARY_BUILTINS.find(e=>e.recipeId===preset.recipeId),added=instantiateLibraryEntry(d,{...entry,category:'manual'},targetId?{targetId,position:'after'}:{});d.surface=added.surface;const id=added.id,e=d.surface.effects.find(e=>e.id===id),m=d.surface.masks.find(m=>m.id===e.maskRef);e.name=preset.name+'绘制';e.manualBrush={version:1,presetId};delete e.distribution;delete e.publicDistribution;e.scopeRef=null;m.initial=0;m.items=[];const painted=appendPaintRule(d.surface,id,d.resources.source);d.surface=validateSurface(painted.s,d);return{document:d,id,ruleId:painted.id,preset,created:true};
}
