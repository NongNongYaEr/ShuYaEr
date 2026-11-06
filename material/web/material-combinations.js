import {instantiateLibraryEntry} from './effect-library.js';
import {layerIndex,layerIsLocked,layerLeafIds,pruneSurfaceResources,validateLayerTree} from './surface-layers.js';
import {validateSurface} from './surface-effects.js';
// Replacement is explicit and scoped to a selected group. Handwork, locked
// leaves and externally referenced lower layers survive with effective opacity.
export function replacementSummary(document,targetId){
 const s=document.surface,index=layerIndex(s),target=index.get(targetId);
 if(target?.node.kind!=='group')throw Error('替换组合时，请先选中左侧的图层组。');
 if(layerIsLocked(s,targetId))throw Error('请先解锁要替换的图层组。');
 const ids=new Set(layerLeafIds(s,targetId)),keep=new Set();
 for(const e of s.effects)if(ids.has(e.id)){
  const mask=s.masks.find(m=>m.id===e.maskRef),refs=[e.scopeRef,...(mask?.items||[]).flatMap(r=>[r.areaRef,r.addRef,r.eraseRef])];
  if(e.manualDecal||e.manualBrush||e.paint?.strokes?.length||e.paint||layerIsLocked(s,e.id)||refs.some(id=>s.areas.find(a=>a.id===id)?.strokes?.length))keep.add(e.id);
 }
 // Transitive references must not become dangling or move above their users.
 let changed=true;while(changed){changed=false;for(const e of s.effects)if(!ids.has(e.id)||keep.has(e.id)){
  const c=e.blend?.conditions;for(const id of [c?.height!=='off'&&c?.heightSource==='layer'?c.sourceId:null,c?.target==='layer'?c.targetId:null])if(ids.has(id)&&!keep.has(id)){keep.add(id);changed=true;}
 }}
 return{targetId,name:target.node.name,removeIds:[...ids].filter(id=>!keep.has(id)),keepIds:[...keep],before:s.effects.length};
}
export function applyLibraryCombination(document,entry,{mode='append',targetId=null,location={}}={}){
 if(!['append','replace'].includes(mode))throw Error('未知组合应用方式。');
 const d=structuredClone(document);let summary=null;
 if(mode==='replace'){
  summary=replacementSummary(d,targetId);const s=d.surface,target=layerIndex(s).get(targetId);
  if(summary.keepIds.length){
   // Keep the entire ancestor path, including group opacity/enabled state.
   const keep=new Set(summary.keepIds),trim=list=>list.filter(n=>{if(n.kind==='effect')return keep.has(n.effectId);n.children=trim(n.children);return n.children.length;});target.node.children=trim(target.node.children);
   location={targetId,position:'before'};
  }else{
   const next=target.list[target.index+1],previous=target.list[target.index-1];target.list.splice(target.index,1);
   location=next?{targetId:next.id,position:'before'}:previous?{targetId:previous.id,position:'after'}:{parentId:target.parentId};
  }
  const remove=new Set(summary.removeIds);s.effects=s.effects.filter(e=>!remove.has(e.id));pruneSurfaceResources(s);validateLayerTree(s);
 }
 const result=instantiateLibraryEntry(d,entry,location);d.surface=validateSurface(result.surface,d);
 return{document:d,surface:d.surface,id:result.id,warnings:result.warnings,summary};
}
