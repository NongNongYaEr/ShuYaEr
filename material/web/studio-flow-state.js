import {syncLegacySurface,validateSurface,cloneMask} from './surface-effects.js';
import {layerIsLocked,pruneSurfaceResources} from './surface-layers.js';
export const INSPECTOR_PAGES={effect:'材质',mask:'自动分布',layer:'图层'};
export const STUDIO_VIEWS=[[-1,'材质效果'],[0,'基础颜色'],[1,'法线'],[4,'粗糙度'],[5,'AO'],[10,'灰模凹凸'],[12,'当前层覆盖'],[15,'局部雕刻强度'],[6,'UV 棋盘'],[9,'树皮方向'],[3,'白模'],[2,'ORM 通道'],[8,'原层选区（诊断）'],[11,'白漆遮罩（诊断）']];
export function inspectorPage(kind,previous='effect'){return kind==='rule'?'mask':INSPECTOR_PAGES[kind]?kind:previous;}
export function generationPrimary({mode,dirty,hasRange,painting,custom,locked}){
 if(locked)return{action:'none',label:'图层已锁定',disabled:true};
 if(painting)return{action:'finish',label:'完成绘制',disabled:false};
 if(mode==='painted')return{action:dirty||!hasRange?'apply-paint':'paint',label:dirty?(hasRange?'更新并绘制':'建立范围并绘制'):hasRange?'绘制范围':'开始绘制',disabled:false};
 if(dirty||custom)return{action:'apply',label:dirty?'更新分布':'使用所选分布',disabled:false};
 return{action:'none',label:'分布已应用',disabled:true};
}
export function generationSignature(d,e){
 const a=d.surface.areas.find(a=>a.id===e.scopeRef),part=a?.partId&&d.parts.groups.find(p=>p.id===a.partId);
 return JSON.stringify([d.surface.masks.find(m=>m.id===e.maskRef),a&&[a.id,a.kind,a.mode,a.scope,a.partId],part?.faces,e.coverageMode,d.actualHeightMeters]);
}
// Entering the brush edits the existing distribution, never silently replaces a
// custom rule stack with a preset. Only this layer's shared resources separate.
export function prepareLayerPaint(document,id){
 const d=structuredClone(document),s=syncLegacySurface(d),e=s.effects.find(e=>e.id===id);if(!e||layerIsLocked(s,id))throw Error('先选择一个未锁定的效果图层。');
 const m=s.masks.find(m=>m.id===e.maskRef),scope=s.areas.find(a=>a.id===e.scopeRef),otherUses=areaId=>s.effects.some(x=>x.id!==id&&(x.scopeRef===areaId||s.masks.find(m=>m.id===x.maskRef)?.items.some(r=>[r.areaRef,r.addRef,r.eraseRef].includes(areaId))));
 let target;
 if(scope?.kind==='surface'){
  let area=scope;if(otherUses(scope.id)||scope.ownedBy&&scope.ownedBy!==id){area={...structuredClone(scope),id:crypto.randomUUID(),name:e.name+' · 绘制范围'};delete area.ownedBy;s.areas.push(area);e.scopeRef=area.id;}
  target={kind:'area',id:area.id,effectId:id,role:'generation'};
 }else if(m.items.some(r=>r.type==='paint')){
  let mask=m;if(s.effects.some(x=>x.id!==id&&x.maskRef===m.id)){e.maskRef=cloneMask(s,m.id,{independentOwnedAreasFor:id});mask=s.masks.find(m=>m.id===e.maskRef);}const rule=mask.items.find(r=>r.type==='paint');target={kind:'rule',id:rule.id,effectId:id,role:'correction'};
 }else{
  const area={id:crypto.randomUUID(),name:e.name+' · 绘制范围',kind:'surface',sourceSHA256:d.resources.source,mode:'painted',strokes:[],scope:scope?.scope?structuredClone(scope.scope):null,partId:scope?.partId||null};s.areas.push(area);e.scopeRef=area.id;target={kind:'area',id:area.id,effectId:id,role:'generation'};
 }
 delete e.legacyBinding;s.active=true;pruneSurfaceResources(s);d.surface=validateSurface(s,d);return{document:d,target};
}

export function hasRestrictionMask(surface,effect){const m=surface?.masks.find(m=>m.id===effect?.maskRef);return!!effect&&(!!effect.scopeRef||!!m&&(m.initial!==1||m.items.length>0));}
