// The tree is stored in compositing order (bottom to top). The UI reverses it.
export const MAX_LAYER_GROUPS=16,MAX_GROUP_DEPTH=4;
const fail=message=>{throw Error(message);},validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(id);
export const leafLayer=id=>({id,kind:'effect',effectId:id});
export function migrateLayerTree(surface){return surface.layers??surface.effects.map(e=>leafLayer(e.id));}
export function layerIndex(surface){
 const result=new Map();function walk(list,parentId=null,ancestors=[]){for(let i=0;i<list.length;i++){const node=list[i];result.set(node.id,{node,list,index:i,parentId,ancestors});if(node.kind==='group')walk(node.children,node.id,[...ancestors,node.id]);}}walk(migrateLayerTree(surface));return result;
}
export function validateLayerTree(surface,occupiedIds=new Set()){
 if(!Array.isArray(surface.layers))fail('工程缺少图层栈。');const found=new Set(),groups=new Set(),ordered=[],effects=new Map(surface.effects.map(e=>[e.id,e]));
 function walk(list,depth){if(!Array.isArray(list))fail('图层组缺少子层。');for(const n of list){if(!n||!validId(n.id)||found.has(n.id))fail('图层标识重复或无效。');found.add(n.id);
  if(n.kind==='effect'){if(n.id!==n.effectId||!effects.has(n.effectId))fail('图层引用的材质实例不存在。');ordered.push(effects.get(n.effectId));}
  else if(n.kind==='group'){if(depth>=MAX_GROUP_DEPTH||groups.size>=MAX_LAYER_GROUPS||occupiedIds.has(n.id)||typeof n.name!=='string'||!n.name.trim()||n.name.length>100||typeof n.enabled!=='boolean'||typeof n.locked!=='boolean'||!Number.isFinite(n.opacity)||n.opacity<0||n.opacity>1)fail('图层组参数无效，最多16组、4级嵌套。');groups.add(n.id);n.name=n.name.trim();walk(n.children,depth+1);}
  else fail('不支持的图层类型。');
 }}walk(surface.layers,0);if(ordered.length!==effects.size)fail('材质实例必须在图层栈中恰好出现一次。');surface.effects=ordered;return surface.layers;
}
export function layerLeafIds(surface,id){const n=layerIndex(surface).get(id)?.node;if(!n)return[];const result=[];function walk(n){if(n.kind==='effect')result.push(n.effectId);else for(const c of n.children)walk(c);}walk(n);return result;}
export function layerIsLocked(surface,id,{self=true}={}){const index=layerIndex(surface),entry=index.get(id);if(!entry)return false;return entry.ancestors.some(id=>index.get(id).node.locked)||self&&(entry.node.kind==='group'?entry.node.locked:!!surface.effects.find(e=>e.id===id)?.locked);}
export function flattenLayerSurface(surface){
 const s=structuredClone(surface),byId=new Map(s.effects.map(e=>[e.id,e])),effects=[];
 function walk(nodes,enabled=true,opacity=1,locked=false,parents=[]){for(const n of nodes)if(n.kind==='group')walk(n.children,enabled&&n.enabled,opacity*n.opacity,locked||n.locked,[...parents,n.id]);else{const e=byId.get(n.effectId);if(!e)fail('图层引用已失效。');effects.push({...e,enabled:enabled&&e.enabled,opacity:opacity*e.opacity,locked:locked||e.locked,parentIds:parents});}}walk(migrateLayerTree(s));s.effects=effects;return s;
}
export function insertLayer(surface,node,{parentId=null,targetId=null,position='after'}={}){
 const index=layerIndex(surface);if(targetId){const target=index.get(targetId);if(!target)fail('拖放目标图层已不存在。');if(layerIsLocked(surface,targetId,{self:false}))fail('目标图层位于锁定组内。');target.list.splice(target.index+(position==='after'?1:0),0,node);}
 else if(parentId){const parent=index.get(parentId)?.node;if(parent?.kind!=='group')fail('目标图层组不存在。');if(layerIsLocked(surface,parentId))fail('不能向锁定组插入图层。');parent.children.push(node);}
 else surface.layers.push(node);return surface;
}
export function moveLayer(surface,id,location={}){
 const s=structuredClone(surface),index=layerIndex(s),entry=index.get(id);if(!entry)fail('移动的图层不存在。');if(layerIsLocked(s,id))fail('请先解锁要移动的图层。');if(location.targetId===id)return s;
 const descendants=new Set();function visit(n){descendants.add(n.id);if(n.kind==='group')n.children.forEach(visit);}visit(entry.node);
 if(descendants.has(location.parentId)||descendants.has(location.targetId))fail('不能把图层组拖入自己或后代。');
 // Check destination before taking anything out. Failed commands leave source untouched.
 if(location.parentId&&layerIsLocked(s,location.parentId)||location.targetId&&layerIsLocked(s,location.targetId,{self:false}))fail('目标图层组已锁定。');entry.list.splice(entry.index,1);insertLayer(s,entry.node,location);validateLayerTree(s,new Set([...s.effects,...s.masks,...s.areas].map(x=>x.id)));s.active=true;return s;
}
export function createLayerGroup(surface,ids=[],{id=crypto.randomUUID(),name='新图层组',parentId=null}={}){
 const s=structuredClone(surface),index=layerIndex(s),unique=[...new Set(ids)];let list=s.layers,at=list.length,nodes=[];
 if(unique.length){const entries=unique.map(id=>index.get(id));if(entries.some(e=>!e))fail('选中的图层已不存在。');if(entries.some(e=>layerIsLocked(s,e.node.id)))fail('请先解锁选中的图层。');if(entries.some(e=>e.parentId!==entries[0].parentId))fail('请选择同一组内的图层再编组。');entries.sort((a,b)=>a.index-b.index);if(entries.at(-1).index-entries[0].index+1!==entries.length)fail('请先选择连续图层，避免编组改变其它图层的叠加顺序。');list=entries[0].list;at=entries[0].index;nodes=list.splice(at,entries.length);}
 const group={id,kind:'group',name,enabled:true,locked:false,opacity:1,children:nodes};if(unique.length)list.splice(at,0,group);else insertLayer(s,group,{parentId});validateLayerTree(s,new Set([...s.effects,...s.masks,...s.areas].map(x=>x.id)));s.active=true;return{s,id};
}
export function ungroupLayer(surface,id){
 const s=structuredClone(surface),entry=layerIndex(s).get(id);if(entry?.node.kind!=='group')fail('请选择图层组。');if(layerIsLocked(s,id))fail('请先解锁图层组。');const group=entry.node;
 for(const child of group.children){const target=child.kind==='group'?child:s.effects.find(e=>e.id===child.effectId);target.enabled=group.enabled&&target.enabled;target.opacity*=group.opacity;if(child.kind==='effect')delete target.legacyBinding;}
 entry.list.splice(entry.index,1,...group.children);validateLayerTree(s);s.active=true;return s;
}
export function pruneSurfaceResources(surface){
 const masks=new Set(surface.effects.map(e=>e.maskRef));surface.masks=surface.masks.filter(m=>masks.has(m.id));const areas=new Set(surface.effects.map(e=>e.scopeRef).filter(Boolean));for(const m of surface.masks)for(const r of m.items)for(const k of ['areaRef','addRef','eraseRef'])if(r[k])areas.add(r[k]);
 const effects=new Set(surface.effects.map(e=>e.id));surface.areas=surface.areas.filter(a=>!a.ownedBy||areas.has(a.id));for(const a of surface.areas)if(a.ownedBy&&!effects.has(a.ownedBy))delete a.ownedBy;return surface;
}
export function deleteLayer(surface,id){
 const s=structuredClone(surface),entry=layerIndex(s).get(id);if(!entry)fail('图层不存在。');if(layerIsLocked(s,id))fail('请先解锁图层。');const leaves=new Set(layerLeafIds(s,id));entry.list.splice(entry.index,1);s.effects=s.effects.filter(e=>!leaves.has(e.id));pruneSurfaceResources(s);s.active=true;return s;
}
// Copy a graph fragment. Explicit named regions can remain shared for duplication.
export function cloneLayerResources(surface,nodes,{shareNamedAreas=false}={}){
 const leaves=[];function visit(n){if(n.kind==='effect')leaves.push(n.effectId);else n.children.forEach(visit);}nodes.forEach(visit);const sourceEffects=leaves.map(id=>surface.effects.find(e=>e.id===id)),ids=new Map(),uid=id=>{if(!ids.has(id))ids.set(id,crypto.randomUUID());return ids.get(id);};
 const masks=[...new Set(sourceEffects.map(e=>e.maskRef))].map(id=>surface.masks.find(m=>m.id===id)),areaIds=new Set(sourceEffects.map(e=>e.scopeRef).filter(Boolean));for(const m of masks)for(const r of m.items)for(const k of ['areaRef','addRef','eraseRef'])if(r[k])areaIds.add(r[k]);
 sourceEffects.forEach(e=>uid(e.id));masks.forEach(m=>uid(m.id));const copyAreas=[];for(const id of areaIds){const a=surface.areas.find(a=>a.id===id);if(!a)fail('图层引用的区域不存在。');if(shareNamedAreas&&!a.ownedBy)continue;uid(id);const copy=structuredClone(a);copy.id=uid(id);if(a.ownedBy)copy.ownedBy=ids.get(a.ownedBy)||uid(sourceEffects[0].id);copyAreas.push(copy);}
 const copiedMasks=masks.map(m=>{const c=structuredClone(m);c.id=uid(m.id);for(const r of c.items){r.id=crypto.randomUUID();for(const k of ['areaRef','addRef','eraseRef'])if(ids.has(r[k]))r[k]=ids.get(r[k]);}return c;});
 const effects=sourceEffects.map(e=>{const c=structuredClone(e);c.id=uid(e.id);c.maskRef=uid(e.maskRef);if(c.scopeRef&&ids.has(c.scopeRef))c.scopeRef=ids.get(c.scopeRef);if(c.blend){for(const k of ['sourceId','targetId'])if(ids.has(c.blend.conditions[k]))c.blend.conditions[k]=ids.get(c.blend.conditions[k]);}delete c.legacyBinding;delete c.parentIds;return c;});
 function copyNode(n){if(n.kind==='effect')return leafLayer(uid(n.effectId));return{...structuredClone(n),id:uid(n.id),children:n.children.map(copyNode)};}
 return{effects,masks:copiedMasks,areas:copyAreas,layers:nodes.map(copyNode)};
}
export function duplicateLayer(surface,id){
 if(layerIsLocked(surface,id))fail('请先解锁图层。');const s=structuredClone(surface),entry=layerIndex(s).get(id);if(!entry)fail('图层不存在。');const copy=cloneLayerResources(s,[entry.node],{shareNamedAreas:true});if(s.effects.length+copy.effects.length>16)fail('最多16个材质/调整叶层。');
 const top=copy.layers[0],named=top.kind==='group'?top:copy.effects[0];named.name=named.name.slice(0,94)+' · 副本';s.effects.push(...copy.effects);s.masks.push(...copy.masks);s.areas.push(...copy.areas);insertLayer(s,top,{targetId:id,position:'after'});validateLayerTree(s,new Set([...s.effects,...s.masks,...s.areas].map(x=>x.id)));s.active=true;return{s,id:top.id};
}
