import {validateSurface,appendPaintRule} from './surface-effects.js';
export function packSurfaceRecipe(document){
 const value={version:5,sourceSHA256:document.resources.source,partIds:document.parts.groups.map(p=>p.id),surface:structuredClone(document.surface)};
 for(const e of value.surface.effects)delete e.legacyBinding;
 return validateSurfaceRecipe(value);
}
export function validateSurfaceRecipe(raw){
 if(![1,2,3,4,5].includes(raw?.version)||!/^[a-f0-9]{64}$/.test(raw.sourceSHA256)||!Array.isArray(raw.partIds)||raw.partIds.length>64||new Set(raw.partIds).size!==raw.partIds.length||raw.partIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(id)))throw Error('配方表面实例结构无效。');
 const result=structuredClone(raw);result.surface=validateSurface(raw.surface,{resources:{source:raw.sourceSHA256},parts:{groups:raw.partIds.map(id=>({id}))}});return result;
}
export function importSurfaceRecipe(raw,document){
 const recipe=validateSurfaceRecipe(raw);let s=structuredClone(recipe.surface),same=recipe.sourceSHA256===document.resources.source,parts=new Set(document.parts.groups.map(p=>p.id)),removed=new Set(),warnings=[];
 for(const a of s.areas){if(!same&&a.kind==='surface'||a.partId&&!parts.has(a.partId)){removed.add(a.id);continue;}a.sourceSHA256=document.resources.source;}
 if(removed.size)warnings.push(same?'配方中不属于当前命名部位的选区已略过。':'不同模型：配方仅复用可重算规则，源面组与手绘笔触已略过。');
 s.areas=s.areas.filter(a=>!removed.has(a.id));for(const m of s.masks)m.items=m.items.filter(r=>![r.areaRef,r.addRef,r.eraseRef].some(id=>removed.has(id)));
 for(const e of s.effects){delete e.legacyBinding;if(e.manualDecal&&!same){delete e.manualDecal;e.params.burlCount=0;warnings.push('不同模型：手动贴花需重新点击表面定位，外观参数已保留。');}if(e.paint&&!same){e.paint.strokes=[];e.paint.sourceSHA256=document.resources.source;warnings.push('不同模型：保留材质绘制层，已清空源面笔触。');}if(removed.has(e.scopeRef))e.scopeRef=null;}
 for(const e of s.effects)if(e.manualBrush&&!s.masks.find(m=>m.id===e.maskRef)?.items.some(r=>r.type==='paint')){s=appendPaintRule(s,e.id,document.resources.source).s;warnings.push('不同模型：已保留材质画笔，清空旧模型笔触。');}
 if(!same)delete s.analysis.curvature.preparedFor;s.active=true;return{surface:validateSurface(s,document),warnings};
}
