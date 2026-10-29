import * as T from './vendor/three.module.min.js';
import {axisTime} from './branch-axis.js';
import {sampleLine,nearestParameter} from './tree-sculpt.js';
import {unitBranchIndex} from './unit-branch-boundary.js';
import {createTrunkPose} from './imported-trunk-binding.js';

const clamp=t=>Number.isFinite(t)?Math.max(0,Math.min(1,t)):0;
function adaptiveTimes(branch){
 const p=branch.points,indices=new Set([0,p.length-1]),tolerance=Math.max(.003,branch.length*.004);
 for(let n=0;n<12;n++){let best=null;const sorted=[...indices].sort((a,b)=>a-b);
  for(let k=1;k<sorted.length;k++){const first=sorted[k-1],last=sorted[k],a=p[first],d=p[last].clone().sub(a),length=d.lengthSq();for(let j=first+1;j<last;j++){const u=clamp(p[j].clone().sub(a).dot(d)/Math.max(length,1e-20)),distance=p[j].distanceTo(a.clone().addScaledVector(d,u));if(distance>tolerance&&(!best||distance>best.distance))best={index:j,distance};}}
  if(!best)break;indices.add(best.index);
 }return [...indices].sort((a,b)=>a-b).map(i=>axisTime(p,i));
}

// Export-only skeleton in the final GLB coordinate frame. Bind-pose geometry
// stays exact; adaptive stations control future deformation, never resweep it.
export function createGlbRig(asset,frame,{maxBones=4096}={}){
 const branches=asset.masterBranches,index=unitBranchIndex(branches,asset.authoring.branch_instances),byRuntime=new Map(branches.map(b=>[b.id,b])),structural=branches.filter(b=>!index.ownerOf(b.stableId)),byStable=new Map(structural.map(b=>[b.stableId,b]));
 if(!structural.length&&!index.roots.size)throw Error('当前模型没有可用的枝干骨架，请先完成树干整理');
 const root=new T.Bone();root.name='Tree_Root';root.userData={kind:'plant_root'};
 const bones=[root],points=[new T.Vector3()],chains=new Map(),units=new Map(),required=new Map(structural.map(b=>[b.stableId,new Set([0,1,...adaptiveTimes(b)])])),building=new Set();
 function add(parent,name,point,data){if(bones.length>=Math.min(65535,maxBones))throw Error(`骨骼数量超过 ${maxBones}，请减少装配数量或拆分植物后导出`);const bone=new T.Bone(),position=point.clone().applyMatrix4(frame),parentIndex=bones.indexOf(parent);bone.name=name.replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,110);bone.position.copy(position).sub(points[parentIndex]);bone.userData=data;parent.add(bone);points.push(position);bones.push(bone);return {bone,index:bones.length-1};}
 for(const b of structural){const parent=byRuntime.get(b.parentId);if(parent&&required.has(parent.stableId))required.get(parent.stableId).add(clamp(b.parentT));}
 for(const id of index.roots.values()){const b=index.byBranch.get(id),parent=byRuntime.get(b?.parentId);if(parent&&required.has(parent.stableId))required.get(parent.stableId).add(clamp(b.parentT));}
 function pair(id,t){const chain=chains.get(id);if(!chain)throw Error('骨骼链丢失：'+id);t=clamp(t);let n=0;while(n<chain.length-2&&chain[n+1].t<t-1e-10)n++;const a=chain[n],b=chain[n+1],u=clamp((t-a.t)/Math.max(1e-12,b.t-a.t));return [{index:a.index,weight:1-u},{index:b.index,weight:u}].filter(v=>v.weight>1e-10);}
 function station(id,t){const chain=chains.get(id),point=chain?.find(p=>Math.abs(p.t-t)<1e-8);if(!point)throw Error('挂接骨骼站点丢失：'+id);return point.bone;}
 function chainFor(branch){if(chains.has(branch.stableId))return;if(building.has(branch.stableId))throw Error('枝干层级存在循环，无法建立骨架');building.add(branch.stableId);const parent=byRuntime.get(branch.parentId);if(parent&&byStable.has(parent.stableId))chainFor(parent);
  let parentBone=parent&&chains.has(parent.stableId)?station(parent.stableId,clamp(branch.parentT)):root;const result=[];
  for(const t of [...required.get(branch.stableId)].sort((a,b)=>a-b)){const record=add(parentBone,'Guide_'+String(bones.length).padStart(4,'0')+'_'+branch.stableId,sampleLine(branch.points,t),{kind:'carrier',branch_id:branch.stableId,axis_t:t});result.push({...record,t});parentBone=record.bone;}
  chains.set(branch.stableId,result);building.delete(branch.stableId);
 }
 for(const b of structural)chainFor(b);
 function unitFor(id){if(units.has(id))return units.get(id);const key='unit:'+id;if(building.has(key))throw Error('单元枝挂接层级存在循环');building.add(key);const branch=index.byBranch.get(index.roots.get(id));if(!branch)throw Error('完整单元枝缺少挂接根：'+id);const parent=byRuntime.get(branch.parentId),owner=parent&&index.ownerOf(parent.stableId);let parentBone=root;
  if(owner&&owner.id!==id)parentBone=unitFor(owner.id).bone;else if(parent&&chains.has(parent.stableId))parentBone=station(parent.stableId,clamp(branch.parentT));
  const instance=index.byInstance.get(id),record=add(parentBone,'Unit_'+String(bones.length).padStart(4,'0')+'_'+id,branch.points[0],{kind:'complete_unit',instance_id:id,asset_id:instance?.asset_id||branch.sourceAssetId||'',revision:instance?.pinned_revision||0});units.set(id,record);building.delete(key);return record;
 }
 for(const id of index.roots.keys())unitFor(id);
 function weights(id,t,{blend=true}={}){const owner=index.ownerOf(id);if(owner&&units.has(owner.id))return [{index:units.get(owner.id).index,weight:1}];const branch=byStable.get(id);if(!branch)throw Error('网格缺少有效枝干归属：'+id);const result=pair(id,t),parent=byRuntime.get(branch.parentId);
  if(blend&&parent&&chains.has(parent.stableId)){const distance=t*Math.max(.001,branch.length),length=Math.min(branch.length*.3,Math.max(.03,branch.startRadius*2)),amount=clamp(distance/Math.max(.001,length));if(amount<1){for(const v of result)v.weight*=amount;result.push({index:bones.indexOf(station(parent.stableId,clamp(branch.parentT))),weight:1-amount});}}
  const combined=new Map();for(const v of result)if(v.weight>1e-10)combined.set(v.index,(combined.get(v.index)||0)+v.weight);return [...combined].map(([index,weight])=>({index,weight}));
 }
 const elementCache=new Map();
 function element(indexValue){if(elementCache.has(indexValue))return elementCache.get(indexValue);let e=asset.elements[indexValue],seen=new Set();const origin=e;
  while(e&&e.type!=='BRANCH'&&!seen.has(e.index)){seen.add(e.index);e=asset.elements[e.parentIndex];}
  if(!e)return null;const owner=index.ownerOf(e.id),branch=index.byBranch.get(e.id);if(!branch)return null;const result=owner?{unit:owner.id}:{branch:e.id,rigid:origin?.type!=='BRANCH',t:nearestParameter(branch.points,new T.Vector3(...(origin?.pivot||e.pivot)))};elementCache.set(indexValue,result);return result;
 }
 const trunkCache=new Map();function trunk(object){const key=object.userData.trunk_mount_id;if(trunkCache.has(key))return trunkCache.get(key);const mount=asset.authoring.imported_trunks?.mounts.find(m=>m.id===key),model=asset.authoring.imported_trunks?.assets.find(a=>a.id===mount?.asset_id);if(!mount||!model)throw Error('雕刻树干绑定来源缺失');const pose=createTrunkPose(model,mount,branches),result={mount,source:pose.source};trunkCache.set(key,result);return result;}
 function vertex(object,n,localPosition){const data=object.userData;
  if(data.imported_trunk){const {mount,source}=trunk(object),primitive=source.primitives.find(p=>p.id===data.trunk_primitive_id),sourceIndex=data.trunk_source_vertices?.[n];if(!primitive||sourceIndex===undefined)throw Error('雕刻树干源顶点映射丢失');const guide=source.guides[primitive.guideIndices[sourceIndex]],node=primitive.nodes[sourceIndex],u=primitive.factors[sourceIndex],t=guide.times[node]*(1-u)+guide.times[node+1]*u;return weights(mount.guide_map[guide.id],t);}
  const owned=index.ownerOf(data.stable_id)||index.ownerOf(typeof data.branch_id==='string'?data.branch_id:byRuntime.get(data.branch_id)?.stableId);if(owned)return [{index:unitFor(owned.id).index,weight:1}];
  const uv=object.geometry.getAttribute('uv1'),lookup=asset.lookupTexture;let target=null;if(uv&&lookup){const i=Math.floor(uv.getY(n)*lookup.height)*lookup.width+Math.floor(uv.getX(n)*lookup.width);target=element(i);}
  if(target?.unit)return [{index:unitFor(target.unit).index,weight:1}];
  const branch=target?.branch?byStable.get(target.branch):byStable.get(data.stable_id)||byRuntime.get(data.branch_id);
  if(!branch||!chains.has(branch.stableId))throw Error('网格无法匹配承重骨架：'+object.name);
  if(target?.rigid){const chain=chains.get(branch.stableId),choice=[...chain].reverse().find(p=>p.t<=target.t+1e-8)||chain[0];return [{index:choice.index,weight:1}];}
  return weights(branch.stableId,nearestParameter(branch.points,localPosition));
 }
 return {root,bones,chains,units,index,vertex,weights,report:{bones:bones.length,carrier_chains:chains.size,complete_units:units.size,max_influences:4,animation:false}};
}
