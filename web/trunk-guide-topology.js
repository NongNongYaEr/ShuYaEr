import * as T from './vendor/three.module.min.js';
import {closestTrunkGuide,pointOnTrunkGuide,validateTrunkGuides} from './imported-trunk-data.js';
import {guidePointKey,normalizeGuideSelection} from './trunk-guide-selection.js';
import {removeTrunkWeightGuides} from './trunk-weight-data.js';

export function guideEditPoints(model,mode,targets){
 const points=targets.flatMap(({guide,index})=>{
  if(mode==='segment')return [{guide,index},{guide,index:index+1}];
  if(mode==='branch')return model.guides.find(g=>g.id===guide)?.points.map((_,i)=>({guide,index:i}))||[];
  return [{guide,index}];
 });
 return normalizeGuideSelection(model,points);
}

export function subdivideTrunkSegments(model,targets,count){
 if(!targets.length)throw Error('请先选择要细分的骨架段');
 if(!Number.isInteger(count)||count<1||count>8)throw Error('每段可增加 1～8 个控制点');
 const keys=new Set(targets.map(guidePointKey)),points=[];
 const guides=model.guides.map(g=>{
  const next=[g.points[0]];
  for(let i=0;i<g.points.length-1;i++){
   if(keys.has(guidePointKey({guide:g.id,index:i}))){
    const a=g.points[i],b=g.points[i+1];
    for(let j=1;j<=count;j++){
     points.push({guide:g.id,index:next.length});
     next.push(a.map((v,k)=>v+(b[k]-v)*j/(count+1)));
    }
   }
   next.push(g.points[i+1]);
  }
  return {...g,points:next};
 });
 if(!points.length)throw Error('选中的骨架段已变化，请重新选择');
 if(guides.some(g=>g.points.length>512))throw Error('单条控制枝最多 512 个点');
 return {model:{...model,guides:validateTrunkGuides(guides)},points};
}

export function interiorSegmentPoints(model,segments){
 const keys=new Set(segments.map(guidePointKey));
 return model.guides.flatMap(g=>g.points.flatMap((_,i)=>i>0&&i<g.points.length-1&&
  keys.has(guidePointKey({guide:g.id,index:i-1}))&&keys.has(guidePointKey({guide:g.id,index:i}))?[{guide:g.id,index:i}]:[]));
}

export function segmentDeletionPoints(model,segments){
 const keys=new Set(segments.map(guidePointKey)),points=interiorSegmentPoints(model,segments);
 for(const g of model.guides){
  for(let i=g.points.length-1;i>0&&keys.has(guidePointKey({guide:g.id,index:i-1}));i--){
   points.push({guide:g.id,index:i});
  }
 }
 return normalizeGuideSelection(model,points);
}

export function planTrunkPointDeletion(model,targets){
 const keys=new Set(normalizeGuideSelection(model,targets).map(guidePointKey));
 const points=[],branches=[];
 let protectedCount=0;
 for(const g of model.guides){
  const selected=g.points.flatMap((_,index)=>keys.has(guidePointKey({guide:g.id,index}))?[index]:[]);
  const removable=selected.filter(i=>i!==0);
  if(g.parent&&removable.length===g.points.length-1){
   branches.push(g.id);
   continue;
  }
  // A main guide must retain an origin and at least one more station.
  if(!g.parent&&removable.length===g.points.length-1)removable.pop();
  protectedCount+=selected.length-removable.length;
  for(const index of removable)points.push({guide:g.id,index});
 }
 return {points,branches,protectedCount};
}

function attachmentAfterDissolve({before,after,indices,lengths},attach){
 const anchor=pointOnTrunkGuide(before.points,attach);
 // Restrict the projection to the edge replacing the original one. A
 // nearby crossing of a curved trunk belongs to a different station.
 const right=indices.findIndex(i=>i>anchor.index);
 if(right<0)return 1;
 const start=new T.Vector3(...after.points[right-1]);
 const edge=new T.Vector3(...after.points[right]).sub(start);
 const length=edge.length();
 if(!length)throw Error('删除会使相邻控制点重合，请缩小选区');
 const along=T.MathUtils.clamp(anchor.position.sub(start).dot(edge)/length,0,length);
 return (lengths[right-1]+along)/lengths.at(-1);
}

export function dissolveTrunkPoints(model,targets){
 if(!targets.length)throw Error('请先选择控制点。精简骨架段时至少选择两段相连的线。');
 if(targets.some(p=>p.index===0))throw Error('底点和子枝根点受保护，请从选区中移除后再删除');
 const keys=new Set(targets.map(guidePointKey)),edited=new Map();
 const guides=model.guides.map(g=>{
  const indices=g.points.flatMap((_,index)=>keys.has(guidePointKey({guide:g.id,index}))?[]:[index]);
  if(indices.length<2)throw Error('每条控制枝至少保留两个点，请缩小选区');
  if(indices.length===g.points.length)return g;
  const points=indices.map(i=>g.points[i]),lengths=[0];
  for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+new T.Vector3(...points[i]).distanceTo(new T.Vector3(...points[i-1])));
  const next={...g,points};
  edited.set(g.id,{before:g,after:next,indices,lengths});
  return next;
 }).map(g=>{
  const parent=edited.get(g.parent);
  return parent?{...g,attach:attachmentAfterDissolve(parent,g.attach)}:g;
 });
 return {...model,guides:validateTrunkGuides(guides)};
}

export function trunkBranchFamily(guides,ids){
 const family=new Set(ids);
 for(const g of guides)if(family.has(g.parent))family.add(g.id);
 return family;
}

function orderedGuides(guides){
 const ordered=[guides[0]],seen=new Set([guides[0].id]);
 let pending=guides.slice(1);
 while(pending.length){
  const deferred=[];
  for(const g of pending){
   if(seen.has(g.parent)){ordered.push(g);seen.add(g.id);}
   else deferred.push(g);
  }
  if(deferred.length===pending.length)throw Error('挂接必须形成一棵连通的骨架');
  pending=deferred;
 }
 return validateTrunkGuides(ordered);
}

export function removeTrunkBranches(model,ids,{keepChildren=false,parentId}={}){
 if(!ids.length||ids.includes(model.guides[0].id))throw Error('请选中要删除的子控制枝，主控制枝受保护');
 const family=trunkBranchFamily(model.guides,ids),removed=keepChildren?new Set(ids):family;
 const parent=model.guides.find(g=>g.id===parentId&&!family.has(g.id));
 if(keepChildren&&!parent)throw Error('请选择受影响分支之外的挂接父枝');
 const guides=model.guides.filter(g=>!removed.has(g.id)).map(g=>{
  if(!removed.has(g.parent))return g;
  const oldParent=model.guides.find(p=>p.id===g.parent);
  const anchor=pointOnTrunkGuide(oldParent.points,g.attach).position;
  return {...g,parent:parent.id,attach:closestTrunkGuide(anchor,[parent]).t};
 });
 const regions={};
 for(const [key,ids] of Object.entries(model.binding?.primitive_guides||{})){
  const retained=ids.filter(id=>!removed.has(id));
  if(retained.length)regions[key]=retained;
 }
 return {...model,guides:orderedGuides(guides),binding:removeTrunkWeightGuides({...model.binding,primitive_guides:regions},removed)};
}

export function reattachTrunkBranch(model,id,{guide,index,t=.5}){
 const branch=model.guides.find(g=>g.id===id),parent=model.guides.find(g=>g.id===guide);
 if(!branch?.parent||!parent||trunkBranchFamily(model.guides,[id]).has(guide))throw Error('请选择这条子枝及其下级以外的父枝');
 if(!Number.isInteger(index)||index<0||index>=parent.points.length-1)throw Error('请在父枝上选择挂接段');
 const lengths=parent.points.slice(1).map((p,i)=>new T.Vector3(...p).distanceTo(new T.Vector3(...parent.points[i])));
 const distance=lengths.slice(0,index).reduce((a,b)=>a+b,0)+lengths[index]*T.MathUtils.clamp(t,0,1);
 const attach=distance/lengths.reduce((a,b)=>a+b,0);
 const guides=orderedGuides(model.guides.map(g=>g.id===id?{...g,parent:guide,attach}:g));
 return {...model,guides};
}
