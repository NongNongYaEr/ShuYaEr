import{prepareBurlScatter,generateBurlScatter}from'./burl-scatter.js';import{burlSettings}from'./burl-effect.js';import{compileLocalPatches}from'./local-patch-analysis.js';import{patchPreset}from'./local-patch-rules.js';import{buildSurfaceGraph,evaluateRegions}from'./surface-tools.js';import{scopeWeight}from'./region-scope.js';
import{isManualDecalPlacement,manualDecalPlacements}from'./manual-decal-rules.js';
function hexId(text){let a=2166136261,b=2246822519;for(const c of text){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b^c.charCodeAt(0),3266489917);}return(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
export function compileBurlEffects(mesh,document,{ao=null,store={contexts:new Map(),placements:new Map()},shouldCancel=()=>false}={}){
 const effects=document.surface.effects,active=effects.map((e,slot)=>({e,slot})).filter(({e})=>e.type==='burl'&&e.enabled&&e.opacity>0&&e.params.burlCount>0),analysis=[];if(!active.length)return{compilation:null,analysis};const patches=[],owners=[],projectedIds=new Set();
 for(const{e,slot}of active){
  if(isManualDecalPlacement(e)){
   const partId=document.surface.areas.find(a=>a.id===e.scopeRef)?.partId||null;
   const placements=manualDecalPlacements(e).map(point=>({...point,descriptorId:hexId(e.id+(point.id==='legacy'?':manual':':manual:'+point.id))}));
   let placed=0;
   for(const point of placements){
    if(!point.enabled)continue;
    if(point.anchor.face>=mesh.indices.length/3)throw Error('手动贴花源面已失效。');
    patches.push({...patchPreset('burl'),...point,id:point.descriptorId,name:e.name.slice(0,40),anchor:structuredClone(point.anchor),partId});
    projectedIds.add(point.descriptorId);
    owners.push(-(slot+1));
    placed++;
   }
   analysis.push({effectId:e.id,requested:placements.length,placed,manual:true,placements,maskPolicy:'manually anchored; planar box and optional named-part boundaries'});
   continue;
  }
  const config=burlSettings(e.params),radius=Math.max(.08,(config.minSizeCm+config.maxSizeCm)/200),contextKey=JSON.stringify([document.actualHeightMeters,radius]),old=store.contexts.get(contextKey);let entry=old;if(!entry||entry.mesh!==mesh||!!entry.ao!==!!ao||ao&&(entry.ao.length!==ao.length||entry.ao.some((v,i)=>v!==ao[i]))){entry={mesh,ao:ao?.slice()||null,context:prepareBurlScatter(mesh,{actualHeightMeters:document.actualHeightMeters,ao,recognitionMeters:radius})};while(store.contexts.size>=3)store.contexts.delete(store.contexts.keys().next().value);store.contexts.set(contextKey,entry);store.placements.clear();}
  const area=e.scopeRef?document.surface.areas.find(a=>a.id===e.scopeRef):null,faces=area?.partId?new Set(document.parts.groups.find(g=>g.id===area.partId)?.faces||[]):null;let values=null;if(area?.kind==='surface'){store.graph||=buildSurfaceGraph(mesh);values=evaluateRegions(store.graph,[{layer:'moss',mode:area.mode,strokes:area.strokes}],document.actualHeightMeters);}
  const eligible=(face,bary)=>{if(faces&&!faces.has(face))return false;const ids=Array.from(mesh.indices.subarray(face*3,face*3+3)),height=ids.reduce((s,id,c)=>s+(mesh.pos[id*3+1]-mesh.min[1])/mesh.height*bary[c],0);if(area?.scope&&scopeWeight(area.scope,height)<.5)return false;return !values||ids.reduce((s,id,c)=>s+values[id*6]*bary[c],0)>=.5;},key=JSON.stringify([contextKey,config,area,area?.partId?document.parts.groups.find(g=>g.id===area.partId)?.faces:null]);let result=store.placements.get(key);if(!result){result=generateBurlScatter(mesh,config,{actualHeightMeters:document.actualHeightMeters,context:entry.context,eligible,shouldCancel});while(store.placements.size>=16)store.placements.delete(store.placements.keys().next().value);store.placements.set(key,result);}
  analysis.push({effectId:e.id,...result.summary,placements:result.placements.map(p=>({descriptorId:hexId(e.id+':'+p.index),anchor:p.anchor,widthMeters:p.widthMeters,heightMeters:p.heightMeters,rotation:p.rotation,projectionDepthMeters:p.projectionDepthMeters,seed:p.seed})),maskPolicy:'source scope restricts centers; restriction mask may hide generated material without moving it'});
  for(const p of result.placements){patches.push({...patchPreset('burl'),id:hexId(e.id+':'+p.index),name:'树瘤 '+(p.index+1),enabled:true,anchor:p.anchor,widthMeters:p.widthMeters,heightMeters:p.heightMeters,rotation:p.rotation,seed:p.seed,depthMeters:p.projectionDepthMeters,partId:area?.partId||null});owners.push(slot+1);}
 }
 if(patches.length>8)throw Error('同一工程最多8个表面贴花，请先减少其他表面贴花图层的数量。');if(!patches.length)return{compilation:null,analysis};const compilation=compileLocalPatches(mesh,{version:1,sourceSHA256:mesh.sourceSHA256,patches},document.parts,{actualHeightMeters:document.actualHeightMeters,shouldCancel,projectedIds});compilation.origin='burl-generator';for(let i=0;i<compilation.descriptors.length;i++)compilation.descriptors[i].channels[3]=owners[i];return{compilation,analysis};
}
