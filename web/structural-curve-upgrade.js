import {axisTimes} from './branch-axis.js';
import {controlCurveOperation,evaluateControlCurve} from './branch-control-curve.js';

// Append ordinary, backwards-readable curve operations after the saved history.
// Never reinterpret the old history in a new coordinate frame or edit a source
// unit. Each descendant family follows its carrier by a rigid mount transform.
export function smoothStructuralCurves(branches,authoring){
  const importedHosts=new Set((authoring.imported_trunks?.mounts||[]).flatMap(m=>Object.values(m.guide_map)));
  // Imported guide polylines are the immutable skin's rest stations. Running
  // the old procedural smoothing migration on them changes the bound mesh.
  const structural=b=>!b.importedTrunkHost&&!importedHosts.has(b.stableId)&&!b.unitOwner&&!b.instanceId&&!b.sourceAssetId&&!b.copySnapshot&&!b.localBundle&&!b.symmetryGroup&&b.controlPoints?.length>2&&b.controlPoints.length<=64;
  const candidates=branches.filter(b=>structural(b)&&!axisTimes(b.points));
  if(!candidates.length)return {layers:[],upgraded:[],skipped:[]};
  const byId=new Map(branches.map(b=>[b.id,b])),candidateIds=new Set(candidates.map(b=>b.id));
  // A parent conversion also rotates already smooth structural descendants.
  // Rebuild those from their final controls too, so touching them is a no-op.
  const affected=b=>{const seen=new Set();while(b&&!seen.has(b.id)){if(candidateIds.has(b.id))return true;seen.add(b.id);b=byId.get(b.parentId);}return false;};
  const depth=b=>{let n=0;const seen=new Set();while(b&&!seen.has(b.id)){seen.add(b.id);b=byId.get(b.parentId);n++;}return n;};
  const ordered=branches.filter(b=>structural(b)&&affected(b)).sort((a,b)=>depth(a)-depth(b));
  const ids=new Set(authoring.sculpt_layers.map(l=>l.id)),layers=[],upgraded=[],skipped=[];
  let current=branches;
  for(const original of ordered){
    const root=current.find(b=>b.id===original.id),operation=controlCurveOperation(root,root.controlPoints);
    const next=evaluateControlCurve(current,operation,1,authoring.overrides);
    if(next===current){skipped.push(root.stableId);continue;}
    let id='SMOOTH_V1_'+layers.length;while(ids.has(id))id+='x';ids.add(id);
    layers.push({id,name:'统一平滑走势 · '+root.stableId,enabled:true,strength:1,operation,branches:{}});
    upgraded.push(root.stableId);current=next;
  }
  if(layers.length){let id='SMOOTH_V1_EDIT';while(ids.has(id))id+='x';layers.push({id,name:'平滑后的调整',enabled:true,strength:1,branches:{}});}
  return {layers,upgraded,skipped};
}
