import {prepareUnitErase,commitErasedUnits} from './unit-paint-erase.js';
import {resolveInstanceAsset} from './branch-workbench-data.js';
import {normalizeAssemblySlots} from './branch-assembly.js';
import {assemblyScaleState,assemblyCardScale} from './assembly-scale.js';

export const densityKey=i=>i.parent+'|'+(i.shootRole||'MIXED');
export const densitySourceKey=i=>i.asset_id+':'+i.pinned_revision;
// The snapshot is independent of the palette, hover and pending pen. A selected
// family is explicit; hidden/locked descendants still protect its ancestors.
export function prepareUnitDensity({authoring,branches,placements=[],selected=[],scope='SELECTED',protectRefined=true,isVisible=()=>true}){
 const plan=prepareUnitErase({authoring,branches,placements,isVisible}),{index}=plan,allowed=new Set();
 if(scope==='SELECTED'){
  const queue=[...selected].map(id=>index.ownerOf(id)?.id).filter(Boolean);
  for(let n=0;n<queue.length;n++){const id=queue[n];if(allowed.has(id))continue;allowed.add(id);queue.push(...(index.children.get(id)||[]));}
 }else for(const id of index.byInstance.keys())allowed.add(id);
 const entries=plan.entries.filter(e=>allowed.has(e.id)).map(e=>{
  const instance=index.byInstance.get(e.id),root=index.byBranch.get(index.roots.get(e.id)),item=resolveInstanceAsset(instance,authoring.branch_library||[]);
  const revision=instance.pinned_revision||item?.revision;
  const reusable=!!(instance.linked&&item?.sample&&item.shape&&item.revision===revision&&!instance.legacyPlacement);
  let reason=e.reason;
  if([...e.family].some(id=>!allowed.has(id)))reason='挂接家族不完整，整组保留';
  if(protectRefined&&[...e.family].some(id=>index.byInstance.get(id)?.assembly_refined))reason=reason||'精修单元枝受保护';
  return {...e,instance:{...instance,pinned_revision:revision},item:reusable?item:null,position:root?.points?.[0],reason,growReason:reason||(!reusable?'缺少固定版本的完整源模型':'')};
 }).filter(e=>e.position);
 return {...plan,entries,allowed};
}

// A pen counts each initial instance once. Repeated mouse events and retracing
// cannot compound density. Integer quotas retain at least one unit per zone.
export function createDensityLedger(plan,strength=.2){
 return {plan,strength:Math.max(0,Math.min(.8,Number(strength)||0)),touched:new Map(),added:[],removed:new Set(),revision:0,groups:new Map(),quotas:new Map(),thinRevision:-1};
}
export function touchDensity(ledger,hits){let changed=false;for(const entry of hits)if(!ledger.touched.has(entry.id)){ledger.touched.set(entry.id,entry);changed=true;}if(changed){ledger.revision++;ledger.groups.clear();ledger.quotas.clear();}return changed;}
export function densityGroups(ledger,grow=false){
 if(ledger.groups.has(grow))return ledger.groups.get(grow);
 const groups=new Map();for(const e of ledger.touched.values()){
  if(grow?e.growReason:e.reason)continue;const key=densityKey(e.instance);
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);
 }ledger.groups.set(grow,groups);return groups;
}
export function densityQuota(count,strength,thin=false){return strength>0?Math.min(thin?Math.max(0,count-1):128,Math.max(1,Math.floor(count*strength))):0;}
export function densityGroupQuotas(ledger,grow=false){
 if(ledger.quotas.has(grow))return ledger.quotas.get(grow);
 const groups=densityGroups(ledger,grow),counts=[...groups].map(([key,entries])=>({key,n:entries.length,cap:grow?128:Math.max(0,entries.length-1),quota:0})),total=counts.reduce((n,e)=>n+e.n,0);
 const budget=Math.min(128,counts.reduce((n,e)=>n+e.cap,0),densityQuota(total,ledger.strength));
 for(let n=0;n<budget;n++){let next=null;for(const entry of counts){if(entry.quota>=entry.cap)continue;if(!next||entry.quota/entry.n<next.quota/next.n||entry.quota/entry.n===next.quota/next.n&&(entry.n>next.n||entry.n===next.n&&entry.key.localeCompare(next.key)<0))next=entry;}if(!next)break;next.quota++;}
 const result=new Map(counts.map(e=>[e.key,e.quota]));ledger.quotas.set(grow,result);return result;
}
export function planDensityThinning(ledger){
 if(ledger.thinRevision===ledger.revision)return ledger.removed;
 const result=new Set(),quotas=densityGroupQuotas(ledger);
 for(const [key,entries]of densityGroups(ledger)){
  const quota=quotas.get(key);if(!quota)continue;let used=0;
  const ranked=entries.map(e=>({e,d:Math.min(...entries.filter(p=>p!==e).map(p=>p.position.distanceToSquared(e.position)))})).sort((a,b)=>a.d-b.d||a.e.id.localeCompare(b.e.id));
  for(const {e}of ranked){const family=[...e.family].filter(id=>!result.has(id));
   if(!family.length||used+family.length>quota||result.size+family.length>128)continue;
   // Deleting a parent never silently extends the brush or the zone quota.
   if(family.some(id=>!ledger.touched.has(id)||densityKey(ledger.touched.get(id).instance)!==key||ledger.touched.get(id).reason))continue;
   family.forEach(id=>result.add(id));used+=family.length;
  }
 }ledger.removed=result;ledger.thinRevision=ledger.revision;return result;
}
export function nextDensityTemplate(entries,added){
 const groups=new Map();for(const e of entries){const key=densitySourceKey(e.instance);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
 const counts=new Map();for(const r of added){const key=densitySourceKey(r.instance);counts.set(key,(counts.get(key)||0)+1);}
 const group=[...groups].sort(([a,x],[b,y])=>(counts.get(a)||0)/x.length-(counts.get(b)||0)/y.length||y.length-x.length||a.localeCompare(b))[0];
 return group?.[1][(counts.get(group[0])||0)%group[1].length];
}
export function commitDensityUnits(authoring,added,removed){
 if(removed.size)commitErasedUnits(authoring,removed);
 if(!added.length)return;
 const live=new Set(authoring.branch_instances.map(i=>i.id)),slots=normalizeAssemblySlots(authoring.workbench?.assembly_slots,authoring.branch_library);
 for(const {instance:i}of added){const source=resolveInstanceAsset(i,authoring.branch_library);
  if(live.has(i.id)||!source?.sample||source.revision!==i.pinned_revision)throw Error('密度笔刷的固定素材版本已改变，请重新刷取');
  live.add(i.id);if(slots[i.shootRole]&&!slots[i.shootRole].includes(i.asset_id))slots[i.shootRole].push(i.asset_id);
 }
 authoring.workbench={...authoring.workbench,assembly_slots:slots};
 authoring.branch_instances.push(...added.map(r=>r.instance));
 // Existing scales are already resolved. Register only new records; never
 // apply all scale factors a second time to either old or newly cloned units.
 if(authoring.workbench.assembly_scale){const state=assemblyScaleState(authoring.workbench),records={...state.records};
  for(const {instance:i}of added){const factor=state.overall*assemblyCardScale(authoring.workbench,i.shootRole,i.asset_id);records[i.id]={base:i.scale/factor,factor,scale:i.scale};}
  authoring.workbench.assembly_scale={...authoring.workbench.assembly_scale,records};
 }
}
