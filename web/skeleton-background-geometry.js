import {equalData} from './branch-workbench-data.js';
import {unpackComputedGeometry} from './geometry-transfer.js';

// Immutable worker output only: no displayed meshes, authoring, callbacks or
// previous model owners. Each consumer receives its own mutable buffer copies.
const preparedSnapshots=new WeakMap(),modelSnapshots=new WeakMap();
const unpackBatch=payload=>new Map(payload.branches.map(b=>[b.id,unpackComputedGeometry(b.geometry)]));
const payloadBytes=payload=>{const buffers=new Set();for(const b of payload.branches){for(const a of Object.values(b.geometry.attributes))buffers.add(a.array.buffer);if(b.geometry.index)buffers.add(b.geometry.index.buffer);}return [...buffers].reduce((n,b)=>n+b.byteLength,0);};
export function rememberPreparedSkeleton(asset,geometries){
  if(!asset)return;
  const snapshot=geometries&&preparedSnapshots.get(geometries);
  if(snapshot&&geometries.size===0)modelSnapshots.set(asset,snapshot);
  else modelSnapshots.delete(asset);
}

// With a captured shape and no active generator group, every possible ID
// before sculpt evaluation comes from the shape, manual branches or DUPLICATE
// records. Installed instances are already excluded from this worker. Keep all
// operations and potentially hidden/copied branches; only unreachable saved
// branch deltas can be omitted. Dynamic/procedural graphs keep full context.
function structuralSculptLayers(a){
  if(!a.branch_shape||a.generator_groups.some(g=>g.enabled))return null;
  const ids=new Set([...a.branch_shape.branches,...a.manual_branches].map(b=>b.id));
  for(const l of a.sculpt_layers)if(l.operation?.type==='DUPLICATE')for(const r of l.operation.records)ids.add(r.id);
  return a.sculpt_layers.map(l=>l.operation?l:{...l,branches:Object.fromEntries(Object.entries(l.branches).filter(([id])=>ids.has(id)))});
}
export async function prepareBackgroundSkeleton(client,asset,previous,next,{skeletonOnly=Boolean(asset?.skeletonOnly),reuseUnchanged=false}={}){
  if(next.authoring.vine||next.authoring.vegetation.enabled)return null;
  const supports=asset?.masterBranches.filter(b=>!b.instanceId&&!b.unitOwner&&!b.sourceAssetId&&!b.copySnapshot&&!b.localBundle)||[],ids=new Set(supports.map(b=>b.stableId));
  const graphKeys=['seeds','root_count','root_spread','root_radial_offset','envelope','attractor','repeller','level_rules','generation_rules','generator_groups','symmetry_groups','branch_arrays','influence_regions','profiles','manual_branches','local_branch_groups','modifiers','phenotype','topology','attachment_layers','timeline','recipe','quality','plant_form'];
  const geometryState=a=>{const layers=structuralSculptLayers(a);return [layers?a.overrides:Object.fromEntries(Object.entries(a.overrides).filter(([id])=>ids.has(id))),layers||a.sculpt_layers.filter(l=>Object.keys(l.branches).some(id=>ids.has(id))||l.operation?.targets.some(id=>ids.has(id))),a.branch_shape,a.workbench?.skeleton_thickness,a.workbench?.trunk_forms,...graphKeys.map(k=>a[k])];};
  const unchanged=previous&&equalData(previous.settings,next.settings)&&Boolean(asset?.skeletonOnly)===skeletonOnly&&equalData(geometryState(previous.authoring),geometryState(next.authoring));
  if(unchanged&&!reuseUnchanged)return null;
  const a=next.authoring,{bark_materials,...workbench}=a.workbench||{};
  const authoring={...a,workbench,branch_library:[],branch_instances:[],leaf_material:undefined,sample_materials:undefined,tree_organs:{...a.tree_organs,units:[]},
    sculpt_layers:(structuralSculptLayers(a)||a.sculpt_layers).map(layer=>layer.operation?.type==='DUPLICATE'?{...layer,operation:{...layer.operation,records:(layer.operation.records||[]).filter(r=>!r.owner)}}:layer)};
  const job={settings:next.settings,authoring,lodIndex:next.settings.preview_lod,options:{continuousBark:Boolean(skeletonOnly||a.branch_library.length||Object.keys(a.workbench?.trunk_forms?.branches||{}).length),hadInstances:skeletonOnly&&a.branch_instances.length>0}};
  // Cache validity covers the entire actual worker job, including wind,
  // growth, unshown overrides and all operations. The support-only shortcut
  // above is never used as proof for reusing a previous computed result.
  const encoded=reuseUnchanged?JSON.stringify(job):null,key=encoded?.length<=16*1024*1024?encoded:null;
  const previousOutput=key&&modelSnapshots.get(asset);
  if(previousOutput?.key===key){const map=unpackBatch(structuredClone(previousOutput.payload));preparedSnapshots.set(map,previousOutput);return map;}
  const result=await client.run(job);
  if(result.geometry?.version!==2)throw Error('Invalid skeleton geometry batch');
  const snapshot=key&&payloadBytes(result.geometry)<=64*1024*1024?{key,payload:structuredClone(result.geometry)}:null,map=unpackBatch(result.geometry);
  if(snapshot)preparedSnapshots.set(map,snapshot);
  return map;
}
