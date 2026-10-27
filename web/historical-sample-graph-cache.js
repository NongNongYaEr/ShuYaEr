import {resolveInstanceShape} from './branch-workbench-data.js';

const independentOperations=new Set(['MOUNT','POINT_ROTATE','ROOT_SCALE','POINT_SCALE','RADIUS','DUPLICATE','POINT_SLIDE','CONTROL_CURVE']);
const keyFor=value=>{try{return JSON.stringify(value);}catch{return null;}};

// Cache only independent historical source curves. These plain input keys and
// local shapes never own a displayed model, a previous cache, or its callbacks.
// Coupled histories still use the complete, unchanged graph evaluator.
export function historicalSampleGraphPlan(settings,a,managed,baseBranches,editedIds,previous){
  const last=a.sculpt_layers.length-1;
  if(!a.branch_shape||last<0||a.sculpt_layers[last].operation||a.curve_editor.affect_children===false
    ||Object.keys(a.workbench?.procedural_growth?.regions||{}).length||managed.length!==a.branch_instances.length
    ||managed.some(i=>i.id.includes('.'))||Object.values(a.overrides).some(v=>v.pinned_points?.length))return null;
  const ids=new Set(managed.map(i=>i.id));
  const ownerOf=id=>typeof id==='string'&&ids.has(id.split('.')[0])?id.split('.')[0]:null;
  if(managed.some(i=>ownerOf(i.parent))||baseBranches.some(b=>ownerOf(b.stableId)))return null;
  const limit=a.recipe.tags.includes('DENSE_AUTHORED_SAMPLE_ASSEMBLY')?11000:a.recipe.tags.includes('DENSE_AUTHORED_CROWN')?3200:2200;
  const upperBound=baseBranches.length+managed.reduce((n,i)=>n+(resolveInstanceShape(i,a.branch_library)?.branches.length||0),0)
    +a.sculpt_layers.reduce((n,l)=>n+(l.operation?.type==='DUPLICATE'?(l.operation.records?.length||0):0),0);
  if(upperBound>=limit)return null;
  const overrides=new Map(),records=new Map(),structuralOverrides=Object.create(null);
  for(const [id,value]of Object.entries(a.overrides)){const owner=ownerOf(id);if(!owner){structuralOverrides[id]=value;continue;}let list=overrides.get(owner);if(!list)overrides.set(owner,list=[]);list.push([id,value]);}
  const structuralLayers=[];
  // A file upgrade appends only rigid-following carrier CONTROL_CURVE ops.
  // They cannot couple one unit's internal history to another. Keep the old
  // restriction for every other kind of earlier unit record or later edit.
  let recordLast=last;
  if(!Object.keys(a.sculpt_layers[last].branches).length){
    let n=last-1;
    while(n>=0){const l=a.sculpt_layers[n],op=l.operation;if(!l.id.startsWith('SMOOTH_V1_')||!op||op.type!=='CONTROL_CURVE'||op.protect_units!==true||Object.keys(l.branches).length)break;n--;}
    if(n<last-1)recordLast=n;
  }
  for(let n=0;n<a.sculpt_layers.length;n++){
    const layer=a.sculpt_layers[n],op=layer.operation,branches=Object.create(null);
    if(op&&(!independentOperations.has(op.type)||op.targets.some(ownerOf)||ownerOf(op.root)||ownerOf(op.parent)||ownerOf(op.target_parent)
      ||op.type==='DUPLICATE'&&op.records.some(r=>r.owner||r.sourceInstanceId||ownerOf(r.parent)||ownerOf(r.id))))return null;
    for(const [id,value]of Object.entries(layer.branches)){
      const owner=ownerOf(id);
      if(!owner){if(ownerOf(value.parent))return null;branches[id]=value;continue;}
      if(n!==last&&n!==recordLast||!id.startsWith(owner+'.'))return null;
      let list=records.get(owner);if(!list)records.set(owner,list=[]);list.push([id,value]);
    }
    structuralLayers.push({...layer,branches});
  }
  // Presentation payloads do not participate in buildBranchGraph. Shapes and
  // placement inputs are captured separately for each actual saved owner.
  const {branch_library,branch_instances,overrides:ignoredOverrides,sculpt_layers,leaf_material,sample_materials,
    tree_organs,flowering,leaf_edits,vegetation,surface_growth,plant_unit_assembly,...graphAuthoring}=a;
  const key=keyFor([settings,{...graphAuthoring,overrides:structuralOverrides,sculpt_layers:structuralLayers},managed.map(i=>i.id)]);
  if(key===null)return null;
  const compatible=previous?.key===key,units=new Map(),needed=new Set();let reused=0;
  for(const i of managed){
    if(!editedIds.has(i.id))continue;
    const input=keyFor([i,resolveInstanceShape(i,branch_library),overrides.get(i.id)||[],records.get(i.id)||[]]);if(input===null)return null;
    const old=compatible?previous.units.get(i.id):null,hit=Boolean(old&&old.key===input);
    units.set(i.id,{key:input,shape:hit?old.shape:undefined});if(hit)reused++;else needed.add(i.id);
  }
  const scoped=compatible&&needed.size<units.size;
  const stats={scoped,reusedOwners:scoped?reused:0,evaluatedOwners:scoped?needed.size:units.size};
  let authoring=null;
  if(scoped&&needed.size)authoring={...a,branch_instances:managed.filter(i=>needed.has(i.id)),
    overrides:Object.fromEntries(Object.entries(a.overrides).filter(([id])=>!ownerOf(id)||needed.has(ownerOf(id)))),
    sculpt_layers:a.sculpt_layers.map(layer=>({...layer,
      branches:Object.fromEntries(Object.entries(layer.branches).filter(([id])=>!ownerOf(id)||needed.has(ownerOf(id)))),
    }))};
  return {record:{key,units,stats},scoped,authoring};
}

export function historicalSampleShape(plan,id,compute){
  const unit=plan?.record.units.get(id);if(!unit)return compute();
  if(unit.shape===undefined)unit.shape=compute();return unit.shape;
}

export function finishHistoricalSampleGraph(plan){
  if(!plan)return;
  // A missing carrier/source never entered the compiler. Retain a null result
  // only with its exact inputs; adding a carrier changes the global key.
  for(const unit of plan.record.units.values())if(unit.shape===undefined)unit.shape=null;
  plan.authoring=null;
}
