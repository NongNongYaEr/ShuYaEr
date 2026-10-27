import {createBranchCurveReference} from './branch-kernel.js';
import {canCompileSamples} from './complete-sample-assembly.js';
import {readAuthoringDraft} from './authoring-draft.js';

const independentOperations=new Set(['MOUNT','POINT_ROTATE','ROOT_SCALE','POINT_SCALE','RADIUS','DUPLICATE','POINT_SLIDE','CONTROL_CURVE','UNIT_PLACEMENT']);

// Sharing is transaction-local and only applies to independent real units whose
// own deltas are all in the last layer. Earlier parent operations stay intact.
// Nested units, cross-unit operations and growth retain individual evaluation.
export function createInstanceReferenceBatch(context){
  const {authoring:a,settings,instanceById,byStable,byId,ownerOf,stats,referenceOwners}=context,layers=a.sculpt_layers,last=layers.length-1;
  if(!canCompileSamples(a)||last<0||layers[last].operation||a.curve_editor.affect_children===false||Object.keys(a.workbench?.procedural_growth?.regions||{}).length)return null;
  const affected=new Set(),entriesByOwner=new Map();
  for(const id of instanceById.keys())for(let n=id.indexOf('.');n>=0;n=id.indexOf('.',n+1))if(instanceById.has(id.slice(0,n)))return null;
  for(let n=0;n<layers.length;n++){
    const layer=layers[n];
    if(layer.operation){const op=layer.operation;if(!independentOperations.has(op.type)||op.targets.some(id=>ownerOf(id))||ownerOf(op.root)||ownerOf(op.parent)||ownerOf(op.target_parent))return null;}
    for(const [id,entry]of Object.entries(layer.branches)){const owner=ownerOf(id);if(!owner)continue;if(!id.startsWith(owner+'.')||n!==last)return null;affected.add(owner);let entries=entriesByOwner.get(owner);if(!entries)entriesByOwner.set(owner,entries=[]);entries.push(entry);}
  }
  if(!affected.size)return null;
  for(const i of instanceById.values()){
    let parent=byStable.get(i.parent);const seen=new Set();
    while(parent&&!seen.has(parent.id)){seen.add(parent.id);if(instanceById.has(parent.instanceId)||instanceById.has(parent.unitOwner)||ownerOf(parent.stableId))return null;parent=byId.get(parent.parentId);}
  }
  // These entry references stay valid while the transaction only rewrites their
  // vector fields. The guard above excludes operations that split/add layers.
  context.reframeScopes=new Map([...instanceById.keys()].map(owner=>[owner,{authoring:a,owner,operationsAbsent:true,entries:entriesByOwner.get(owner)||[]}]));
  let project;const queried=new Set();
  return owner=>{
    if(referenceOwners&&!referenceOwners.has(owner))return null;
    if(!affected.has(owner))return context.branches;
    // A second placement of the same owner needs its freshly edited baseline.
    if(queried.has(owner))return null;queried.add(owner);
    if(!project){const current=readAuthoringDraft(a),canScope=referenceOwners
      // A pin or an older complete-copy placement can veto an ancestor edit
      // because of an otherwise unselected descendant. Keep that full graph.
      &&!Object.values(current.overrides).some(v=>v.pinned_points?.length)
      &&!current.sculpt_layers.some(l=>l.operation?.type==='UNIT_PLACEMENT'),baseline={...current,
      // The independent-operation/ancestry guards above prove other real
      // units cannot influence this batch. Preserve all structural history.
      branch_instances:canScope?current.branch_instances.filter(i=>referenceOwners.has(i.id)):current.branch_instances,
      sculpt_layers:current.sculpt_layers.map((l,n)=>n===last?{...l,branches:Object.fromEntries(Object.entries(l.branches).filter(([id])=>!ownerOf(id)))}:l).filter(l=>!l.operation||l.operation.targets.length)};
      project=createBranchCurveReference({...settings,leaf_density:0},baseline);stats.referenceBuilds++;}
    const curves=project(new Set([owner]));stats.referenceProjections++;return curves;
  };
}
