import * as T from './vendor/three.module.min.js';
import {cloneAxis} from './branch-axis.js';
import {sampleLine,lineTangent} from './tree-sculpt.js';
import {unitBranchIndex} from './unit-branch-boundary.js';

import {normalizeWindPreview} from './wind-preview-settings.js';
export {normalizeWindPreview,WIND_PRESETS} from './wind-preview-settings.js';
const finite=(v,d)=>Number.isFinite(Number(v))?Number(v):d;
const phase=(id,seed)=>{let n=(2166136261^seed)>>>0;for(const c of String(id)){n^=c.charCodeAt(0);n=Math.imul(n,16777619)>>>0;}return n/4294967296*Math.PI*2;};
// A deterministic presentation pose. Source curves and complete unit models
// are never edited; each complete owner receives a single rigid matrix.
export function createWindPose(snapshot,instances=[]){
 const branches=[...snapshot.values()],index=unitBranchIndex(branches,instances),byId=new Map(branches.map(b=>[b.id,b]));
 let minZ=Infinity,maxZ=-Infinity;for(const branch of branches)if(!index.ownerOf(branch.stableId))for(const point of branch.points){minZ=Math.min(minZ,point.z);maxZ=Math.max(maxZ,point.z);}
 const height=Number.isFinite(minZ)?maxZ-minZ:0,baseZ=(Number.isFinite(minZ)?minZ:0)+height*.08;
 const parentOf=b=>byId.get(b.parentId)||index.byBranch.get(b.parentId);
 return {index,evaluate(seconds,raw={}){
  const p=normalizeWindPreview(raw),time=finite(seconds,0),updated=new Map(),transforms=new Map(),owners=new Map(),visiting=new Set();
  if(!p.strength||time===0)return {updated,transforms,owners};
  const angle=T.MathUtils.degToRad(p.direction),axis=new T.Vector3(-Math.sin(angle),Math.cos(angle),0),ease=Math.min(1,time/1.2),envelope=ease*ease*(3-2*ease);
  const wave=(id,unit=false)=>{const f=phase(id,p.seed),t=time*(unit?1.8:.8),g=1+p.gust*.6*Math.sin(time*.43+1.1);return envelope*p.strength*g*(Math.sin(t+f)*.7+Math.sin(t*.61+f*.3)*.3+p.turbulence*.3*Math.sin(t*2.7+f*2));};
  function carry(branch){
   const parent=parentOf(branch);if(!parent)return {position:branch.points[0].clone(),rotation:new T.Quaternion()};
   const owner=index.ownerOf(parent.stableId);
   if(owner){const m=unit(owner.id);return {position:branch.points[0].clone().applyMatrix4(m),rotation:new T.Quaternion().setFromRotationMatrix(m)};}
   const after=structural(parent),at=Math.min(1,Math.max(0,branch.parentT??0));
   const rotation=new T.Quaternion().setFromUnitVectors(lineTangent(parent.points,at),lineTangent(after.points,at));
   const position=branch.points[0].clone().sub(sampleLine(parent.points,at)).applyQuaternion(rotation).add(sampleLine(after.points,at));
   return {position,rotation};
  }
  function structural(branch){
   if(updated.has(branch.id))return updated.get(branch.id);if(visiting.has(branch.id))throw Error('风动预览遇到循环骨架');visiting.add(branch.id);
   const root=!parentOf(branch),mount=carry(branch),points=branch.points,lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+points[i].distanceTo(points[i-1]));
   const total=Math.max(.000001,lengths.at(-1)),amplitude=wave(branch.stableId)*(root?p.trunk*.14:p.branch*.22)/(branch.windStiffness||1),result=[mount.position.clone()];
   for(let i=1;i<points.length;i++){
    let u=(lengths[i]+lengths[i-1])/(2*total);if(root)u=Math.max(0,(u-.12)/.88);
    const heightWeight=height>.3?Math.min(1,Math.max(0,(Math.min(points[i].z,points[i-1].z)-baseZ)/Math.max(.01,height*.2))):1;
    const q=new T.Quaternion().setFromAxisAngle(axis,amplitude*u*u*heightWeight),delta=points[i].clone().sub(points[i-1]).applyQuaternion(mount.rotation).applyQuaternion(q);result.push(result.at(-1).clone().add(delta));
   }
   let cursor=0;const next={...branch,points:cloneAxis(points,()=>result[cursor++])};updated.set(branch.id,next);visiting.delete(branch.id);return next;
  }
  function unit(id){
   if(owners.has(id))return owners.get(id);const key='unit:'+id;if(visiting.has(key))throw Error('风动预览遇到循环挂接');visiting.add(key);
   const root=index.byBranch.get(index.roots.get(id));if(!root){visiting.delete(key);return new T.Matrix4();}
   const mount=carry(root),rotation=new T.Quaternion().setFromAxisAngle(axis,wave(id,true)*p.unit*.08).multiply(mount.rotation),matrix=new T.Matrix4().makeRotationFromQuaternion(rotation);
   matrix.setPosition(mount.position.clone().sub(root.points[0].clone().applyMatrix4(matrix)));owners.set(id,matrix);
   for(const b of index.ownedBranches.get(id)||[])transforms.set(b.id,{matrix});visiting.delete(key);return matrix;
  }
  for(const b of branches)if(!index.ownerOf(b.stableId))structural(b);
  for(const id of index.roots.keys())unit(id);
  return {updated,transforms,owners};
 }};
}
