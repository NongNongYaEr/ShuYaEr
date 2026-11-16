import {BURL_SCATTER_LIMIT} from './burl-rules.js';
import {patchPreset} from './local-patch-rules.js';

// A source-face anchor is portable across UV edits, never across source meshes.
export function validateManualDecal(raw,source){
 if(raw==null)return null;const p=structuredClone(raw),a=p.anchor;
 if(p.version!==1||p.sourceSHA256!==source||!Number.isInteger(a?.face)||a.face<0||a.face>2000000||!Array.isArray(a.bary)||a.bary.length!==3||a.bary.some(x=>!Number.isFinite(x)||x<0||x>1)||Math.abs(a.bary.reduce((s,x)=>s+x,0)-1)>1e-5)throw Error('手动贴花锚点不属于当前源模型。');
 for(const[k,min,max]of [['widthMeters',.005,3],['heightMeters',.005,3],['rotation',-180,180],['depthMeters',.001,.5],['maxBendDegrees',5,85],['feather',.02,.45]])if(!Number.isFinite(p[k])||p[k]<min||p[k]>max)throw Error('手动贴花参数无效：'+k);
 return{version:1,sourceSHA256:source,anchor:{face:a.face,bary:a.bary.slice()},...Object.fromEntries(['widthMeters','heightMeters','rotation','depthMeters','maxBendDegrees','feather'].map(k=>[k,p[k]]))};
}
export function makeManualDecal(document,effect,hit,projection={}){
 const old=effect.manualDecal,width=Math.max(.02,Math.min(1.5,(effect.params.burlMinSizeCm+effect.params.burlMaxSizeCm)/200));
 return validateManualDecal({widthMeters:old?.widthMeters??width,heightMeters:old?.heightMeters??width,rotation:old?.rotation??0,depthMeters:old?.depthMeters??Math.max(.01,Math.min(.15,width*.2)),maxBendDegrees:old?.maxBendDegrees??((effect.params.burlStyle===9||effect.params.burlStyle>=61)?35:60),feather:old?.feather??.12,...projection,version:1,sourceSHA256:document.resources.source,anchor:{face:hit.face,bary:hit.bary}},document.resources.source);
}

export const isManualDecalPlacement=effect=>!!effect?.manualDecal||Array.isArray(effect?.manualDecals);

export function manualDecalPlacements(effect){
 return effect?.manualDecals??(effect?.manualDecal?[{...effect.manualDecal,id:'legacy',enabled:true}]:[]);
}

function validatePoint(raw,source){
 if(!raw||typeof raw.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(raw.id)||typeof raw.enabled!=='boolean')throw Error('手动贴花点位标识或显隐状态无效。');
 if(raw.seed!==undefined&&(!Number.isInteger(raw.seed)||raw.seed<0||raw.seed>10000))throw Error('手动贴花点位的随机种子无效。');
 return {...validateManualDecal(raw,source),id:raw.id,enabled:raw.enabled,...(raw.seed===undefined?{}:{seed:raw.seed})};
}

export function validateManualDecals(points,source){
 if(!Array.isArray(points)||points.length>BURL_SCATTER_LIMIT)throw Error('手动贴花点位数量无效。');
 const ids=new Set();
 return points.map(raw=>{
  const point=validatePoint(raw,source);
  if(ids.has(point.id))throw Error('手动贴花点位标识重复。');
  ids.add(point.id);
  return point;
 });
}

function setPoints(effect,points){
 if(effect.type!=='burl')throw Error('请选择表面贴花图层。');
 if(points.length>BURL_SCATTER_LIMIT)throw Error('表面贴花数量已满，请先减少其它贴花数量。');
 delete effect.manualDecal;
 delete effect.legacyBinding;
 if(effect.publicDistribution?.id==='D12')delete effect.publicDistribution;
 effect.manualDecals=points;
 effect.params.burlCount=points.length;
 return points;
}

function checkBudget(document,effect,count){
 const used=document.surface.effects.filter(e=>e.type==='burl'&&e.id!==effect.id).reduce((n,e)=>n+e.params.burlCount,0);
 if(used+count>BURL_SCATTER_LIMIT)throw Error('表面贴花数量已满，请先减少其它贴花数量。');
}

function pointIndex(points,id){
 const index=points.findIndex(p=>p.id===id);
 if(index<0)throw Error('手动贴花点位已不存在。');
 return index;
}

export function manualDecalPartFaces(document,effect){
 const partId=document.surface.areas.find(a=>a.id===effect.scopeRef)?.partId;
 return partId?(document.parts.groups.find(p=>p.id===partId)?.faces||[]):null;
}

function checkManualDecalPart(document,effect,hit){
 const faces=manualDecalPartFaces(document,effect);
 if(faces&&!faces.includes(hit.face))throw Error('贴花点位需要落在当前作用部位内。');
}

export function addManualDecal(document,effect,hit,projection){
 const points=manualDecalPlacements(effect);
 checkBudget(document,effect,points.length+1);
 checkManualDecalPart(document,effect,hit);
 const id=crypto.randomUUID(),decal=makeManualDecal(document,{...effect,manualDecal:null},hit,projection);
 setPoints(effect,[...points,{...decal,id,enabled:true}]);
 return id;
}

export function replaceManualDecal(effect,pointId,changes,source){
 const points=manualDecalPlacements(effect).slice(),index=pointIndex(points,pointId);
 const previous=points[index],point=validatePoint({...previous,...changes,id:pointId,sourceSHA256:previous.sourceSHA256},source);
 points[index]=point;
 setPoints(effect,points);
 return point;
}

export function removeManualDecal(effect,pointId){
 const points=manualDecalPlacements(effect).slice();
 points.splice(pointIndex(points,pointId),1);
 return setPoints(effect,points);
}

export function duplicateManualDecal(effect,pointId){
 const points=manualDecalPlacements(effect).slice(),source=points[pointIndex(points,pointId)];
 const id=crypto.randomUUID();
 setPoints(effect,[...points,{...structuredClone(source),id}]);
 return id;
}

export function adoptScatterPlacements(document,effect,placements){
 if(isManualDecalPlacement(effect)||!Array.isArray(placements))throw Error('请选择已有散布结果的自动贴花图层。');
 checkBudget(document,effect,placements.length);
 const {maxBendDegrees,feather}=patchPreset('burl'),sourceSHA256=document.resources.source;
 const points=placements.map(p=>{
  const point=validatePoint({
   id:crypto.randomUUID(),enabled:true,version:1,sourceSHA256,anchor:p.anchor,widthMeters:p.widthMeters,
   heightMeters:p.heightMeters,rotation:p.rotation,depthMeters:p.projectionDepthMeters,seed:p.seed,maxBendDegrees,feather,
  },sourceSHA256);
  checkManualDecalPart(document,effect,point.anchor);
  return point;
 });
 return setPoints(effect,points);
}
