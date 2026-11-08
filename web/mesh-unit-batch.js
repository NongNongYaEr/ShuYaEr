import * as THREE from 'three';
import {ASSEMBLY_ZONES,addAssemblyAsset,normalizeAssemblySlots} from './branch-assembly.js';
import {isPreservedAssemblyGap} from './assembly-distribution.js';
import {createBranchPlacementRaycast} from './branch-installation.js';
import {branchRadiusAt} from './branch-shaping.js';
import {mountDistanceAt,slideMountParameter} from './branch-mount-drag.js';
import {resolveMeshUnitPlacements} from './mesh-unit-data.js';
import {MESH_UNIT_LIMIT} from './mesh-unit-state.js';
import {sampleLine} from './tree-sculpt.js';
import {acceptsUnitPaintPlacement,unitPaintPlacement,unitPaintPlacementOccupancy,unitPaintRadialDirection} from './unit-paint-placement.js';

const labels={MATURE:'内部',MIXED:'中间',YOUNG:'末端'};
const weights={MATURE:4,MIXED:5,YOUNG:1};
const stationRanges={MATURE:[.16,.43],MIXED:[.40,.72],YOUNG:[.70,.96]};
export const MESH_BATCH_ZONES=ASSEMBLY_ZONES.map(({role})=>({role,label:labels[role]}));
const triangleLimit=2_000_000, primitiveLimit=8000;
const maximumProbes=20_000;
const metrics=new WeakMap();
const empty={assets:[],instances:[]};

function sourceMetrics(source){
  if(metrics.has(source))return metrics.get(source);
  const box=new THREE.Box3(),point=new THREE.Vector3();
  let triangles=0;
  for(const part of source.model.primitives){
    const {position,index}=part.geometry;
    triangles+=(index?.length||position.length/3)/3;
    for(let offset=0;offset<position.length;offset+=3)box.expandByPoint(point.fromArray(position,offset));
  }
  const size=box.getSize(point);
  const spacing=THREE.MathUtils.clamp(Math.max(size.x,size.y,size.z)*.22,.025,.65);
  const result={triangles:Math.ceil(triangles),primitives:source.model.primitives.length,spacing};
  metrics.set(source,result);
  return result;
}

function managed(instance,slots){
  return instance.assembly_generated===true&&!instance.assembly_locked&&!instance.assembly_manual&&!instance.assembly_refined
    &&slots[instance.shootRole]?.includes(instance.asset_id);
}

export function addMeshUnitBatchSource(data,source,role){
  data||=empty;
  if(!MESH_BATCH_ZONES.some(zone=>zone.role===role))throw Error('请选择叶花果装配区间。');
  const assets=data.assets.some(asset=>asset.id===source.id)?data.assets:[...data.assets,source];
  return {...data,assets,slots:addAssemblyAsset(data.slots,role,source.id,assets)};
}

export function removeMeshUnitBatchSource(data,role,sourceId){
  const slots=normalizeAssemblySlots(data.slots,data.assets);
  if(!Object.hasOwn(slots,role))return data;
  // Explicit removal uses the instance's origin. Brush edits protect it from
  // density changes, while locking protects it from an explicit delete.
  const instances=data.instances.filter(instance=>!(instance.assembly_generated&&instance.shootRole===role
    &&instance.asset_id===sourceId&&!instance.assembly_locked));
  if(!slots[role].includes(sourceId)&&instances.length===data.instances.length)return data;
  slots[role]=slots[role].filter(id=>id!==sourceId);
  const used=instances.some(instance=>instance.asset_id===sourceId)||Object.values(slots).some(ids=>ids.includes(sourceId));
  return {...data,assets:used?data.assets:data.assets.filter(asset=>asset.id!==sourceId),instances,slots};
}

export function meshUnitBatchStatus(data,authoring){
  data||=empty;
  const slots=normalizeAssemblySlots(data.slots,data.assets);
  const byId=new Map(data.assets.map(source=>[source.id,source]));
  const configured=new Set(Object.values(slots).flat());
  const current=data.instances.length;
  const automatic=data.instances.filter(instance=>managed(instance,slots)).length;
  let triangles=0,primitives=0;
  for(const instance of data.instances){
    const source=byId.get(instance.asset_id);
    if(!source)continue;
    const cost=sourceMetrics(source);
    triangles+=cost.triangles;
    primitives+=cost.primitives;
  }
  const maximumExtra=Math.max(0,...[...configured].map(id=>{
    const cost=sourceMetrics(byId.get(id));
    return Math.min(Math.floor((triangleLimit-triangles)/Math.max(1,cost.triangles)),
      Math.floor((primitiveLimit-primitives)/Math.max(1,cost.primitives)));
  }));
  const sharedBudget=MESH_UNIT_LIMIT-(authoring.branch_instances?.length||0);
  return {current,minimum:current-automatic,maximum:Math.max(current,Math.min(sharedBudget,current+maximumExtra)),
    automatic,configured:configured.size,triangles,primitives};
}

function reduceBatch(instances,slots,target){
  const groups=MESH_BATCH_ZONES.map(({role})=>instances.filter(instance=>instance.shootRole===role&&managed(instance,slots)));
  const managedCount=groups.reduce((sum,group)=>sum+group.length,0);
  const keep=target-(instances.length-managedCount);
  const quotas=groups.map(group=>keep*group.length/managedCount);
  const counts=quotas.map(Math.floor);
  const fractions=quotas.map((value,index)=>({index,value:value-counts[index]})).sort((a,b)=>b.value-a.value);
  for(let remaining=keep-counts.reduce((sum,n)=>sum+n,0),index=0;index<remaining;index++)counts[fractions[index].index]++;
  const kept=new Set(groups.flatMap((group,index)=>Array.from({length:counts[index]},(_,n)=>
    group[Math.floor((n+.5)*group.length/counts[index])].id)));
  return instances.filter(instance=>!managed(instance,slots)||kept.has(instance.id));
}

function carriersByRegion(branches){
  const origin=branches.find(branch=>branch.points.length)?.points[0];
  if(!origin)return [];
  const usable=branches.filter(branch=>branch.stableId&&branch.points.length>=2)
    .map(branch=>({branch,length:mountDistanceAt(branch.points,1)})).filter(entry=>entry.length>=.025);
  const branchesOnly=usable.filter(({branch})=>branch.order>=1);
  const selected=branchesOnly.length?branchesOnly:usable;
  const exposure=({branch})=>{
    const p=branch.points.at(-1);
    return Math.hypot(p.x-origin.x,p.y-origin.y)+(p.z-origin.z)*.25;
  };
  selected.sort((a,b)=>exposure(a)-exposure(b)||a.branch.stableId.localeCompare(b.branch.stableId));
  return selected.map((entry,index)=>{
    const fraction=(index+.5)/selected.length;
    return {...entry,role:fraction<.4?'MATURE':fraction<.9?'MIXED':'YOUNG'};
  });
}

function balancedStation(index){
  let value=0,denominator=2;
  while(index){value+=(index%2)/denominator;denominator*=2;index=Math.floor(index/2);}
  return value;
}

function* stations(carriers,role,spacing){
  const local=carriers.filter(entry=>entry.role===role);
  const pool=local.length?local:carriers;
  const range=local.length?[.14,.94]:stationRanges[role];
  for(let round=1;round<=64;round++){
    let active=false;
    const fraction=THREE.MathUtils.lerp(range[0],range[1],balancedStation(round));
    for(const entry of pool){
      if(round>Math.max(4,Math.ceil(entry.length/spacing)*2))continue;
      active=true;
      yield {branch:entry.branch,attach:slideMountParameter(entry.branch.points,0,entry.length*fraction)};
    }
    if(!active)return;
  }
}

function surfaceAt(asset,cast,ray,branch,attach,spacing,attempt,span){
  const center=sampleLine(branch.points,attach);
  const radial=unitPaintRadialDirection(branch,attach,spacing,attempt);
  const radius=Math.max(.001,branchRadiusAt(branch,asset.settings,attach));
  const probeDistance=branch.importedTrunkHost?span:Math.max(.04,radius*4);
  const expected=asset.group.localToWorld(center.clone().addScaledVector(radial,radius));
  const from=asset.group.localToWorld(center.clone().addScaledVector(radial,probeDistance));
  const to=asset.group.localToWorld(center);
  ray.far=from.distanceTo(to)*1.001;
  ray.set(from,to.sub(from).normalize());
  return cast(ray,{carrier:branch,nearPoint:expected});
}

function mapOccupancy(data,asset,authoring){
  const {masterBranches,settings}=asset,result=new Map();
  const entries=unitPaintPlacementOccupancy(authoring,masterBranches,settings);
  for(const {instance,source,parent,matrix} of resolveMeshUnitPlacements({...authoring,mesh_units:data},asset,{strict:false})){
    const position=new THREE.Vector3(...source.connector.position).applyMatrix4(matrix);
    const direction=position.clone().sub(sampleLine(parent.points,instance.attach)).normalize();
    entries.push(unitPaintPlacement(instance,parent,position,direction,settings));
  }
  for(const item of entries){
    if(!result.has(item.parent))result.set(item.parent,[]);
    result.get(item.parent).push(item);
  }
  return result;
}

export async function resizeMeshUnitBatch(data,asset,authoring,requested,{shouldAbort=()=>false}={}){
  data||=empty;
  const target=Number(requested),status=meshUnitBatchStatus(data,authoring);
  if(!Number.isInteger(target)||target<0)throw Error('目标数量需为非负整数。');
  if(target===status.current)return data;
  if(target<status.minimum)throw Error(`保留 ${status.minimum} 件手工放置、编辑或锁定的叶花果，目标数量不能更低。`);
  const slots=normalizeAssemblySlots(data.slots,data.assets);
  if(target<status.current)return {...data,slots,instances:reduceBatch(data.instances,slots,target)};
  if(!status.configured)throw Error('请先把叶花果或整支 GLB 素材拖入至少一个装配区间。');
  if(target>status.maximum)throw Error(`目标 ${target} 件超过当前实例或几何上限 ${status.maximum} 件。`);
  const carriers=carriersByRegion(asset.masterBranches);
  if(!carriers.length)throw Error('当前树形缺少可用枝面。');
  const byId=new Map(data.assets.map(source=>[source.id,source]));
  const counts=Object.fromEntries(MESH_BATCH_ZONES.map(({role})=>[role,data.instances.filter(item=>item.shootRole===role).length]));
  const roles=MESH_BATCH_ZONES.filter(({role})=>slots[role].length).map(({role})=>({role,cursor:counts[role],sources:slots[role].map(id=>{
    const source=byId.get(id),cost=sourceMetrics(source);
    return {source,cost,stations:stations(carriers,role,cost.spacing),exhausted:false};
  })}));
  const cast=createBranchPlacementRaycast({asset,authoring,surface:true}),ray=new THREE.Raycaster();
  const span=Math.max(.1,new THREE.Box3().setFromObject(asset.group).getSize(new THREE.Vector3()).length());
  const occupied=mapOccupancy(data,asset,authoring);
  const used=new Set(data.instances.map(instance=>instance.id));
  const added=[];
  let triangles=status.triangles,primitives=status.primitives,serial=1,probes=0;
  while(data.instances.length+added.length<target){
    if(shouldAbort())throw new DOMException('已取消叶花果批量装配。','AbortError');
    const affordable=entry=>!entry.exhausted&&triangles+entry.cost.triangles<=triangleLimit&&primitives+entry.cost.primitives<=primitiveLimit;
    const zone=roles.filter(item=>item.sources.some(affordable))
      .sort((a,b)=>counts[a.role]/weights[a.role]-counts[b.role]/weights[b.role])[0];
    if(!zone||probes>=maximumProbes)break;
    const list=zone.sources;
    let entry;
    for(let index=0;index<list.length;index++){
      const candidate=list[zone.cursor++%list.length];
      if(affordable(candidate)){entry=candidate;break;}
    }
    const station=entry.stations.next();
    if(station.done){entry.exhausted=true;continue;}
    const {branch,attach}=station.value,nearby=occupied.get(branch.stableId)||[];
    if(isPreservedAssemblyGap(authoring,branch.stableId,attach,zone.role))continue;
    let placed=null;
    for(let attempt=0;attempt<3&&!placed;attempt++){
      if(++probes%24===0){await new Promise(resolve=>setTimeout(resolve,0));if(shouldAbort())throw new DOMException('已取消叶花果批量装配。','AbortError');}
      const target=surfaceAt(asset,cast,ray,branch,attach,entry.cost.spacing,attempt,span);
      if(!target||isPreservedAssemblyGap(authoring,branch.stableId,target.attach,zone.role))continue;
      const direction=target.surface_frame.direction||unitPaintRadialDirection(branch,target.attach,entry.cost.spacing,attempt);
      const clearance=unitPaintPlacement(target,branch,target.surface_frame.position,direction,asset.settings);
      const minimumGap=Math.min(.05,entry.cost.spacing*.5);
      if(nearby.some(item=>item.position.distanceToSquared(clearance.position)<minimumGap*minimumGap))continue;
      if(acceptsUnitPaintPlacement(clearance,nearby,entry.cost.spacing))placed={target,clearance};
    }
    if(!placed)continue;
    let id;
    do{id=`MESH_AUTO_${String(serial++).padStart(4,'0')}`;}while(used.has(id));
    used.add(id);
    const {target:mount,clearance}=placed;
    added.push({id,asset_id:entry.source.id,pinned_revision:entry.source.revision,parent:mount.parent,attach:mount.attach,
      frame:mount.frame,trunk_anchor:mount.trunk_anchor,shootRole:zone.role,assembly_generated:true,
      angle:48,azimuth:0,roll:0,seed:serial,scale:1,variation:0,offset:[0,0,0],rotation:[0,0,0,1]});
    nearby.push(clearance);
    occupied.set(branch.stableId,nearby);
    counts[zone.role]++;
    triangles+=entry.cost.triangles;
    primitives+=entry.cost.primitives;
  }
  if(data.instances.length+added.length<target)
    throw Error(`按当前装配区间、间距和预算最多可排 ${data.instances.length+added.length} 件，本次调整已取消。`);
  return {...data,slots,instances:[...data.instances,...added]};
}
