import * as THREE from './vendor/three.module.min.js';
import { descendants, selectionRoots } from './branch-selection.js';
import { captureUnit, resolveUnit } from './unit-authoring.js';
import { sampleLine, lineTangent } from './tree-sculpt.js';
import {axisTimes,normalizeAxisTimes,withAxisTimes} from './branch-axis.js';

const keys=['length','startRadius','endRadius','radiusProfile','profileSet','phase','windPhase','windStiffness','sections','skeletonRadius','radiusEdits','shootRole','vineRole','prefabCarrier'];
const vectors=ps=>ps.map(p=>new THREE.Vector3(...p));
export function captureBranchDuplicate(asset, selected, token, leafSources=[]) {
  const branches=asset.masterBranches,roots=selectionRoots(branches,selected),family=descendants(branches,new Set(roots.map(b=>b.stableId)));
  const ids=new Map(branches.filter(b=>family.has(b.stableId)).map((b,i)=>[b.stableId,`${token}_${i}`]));
  const byId=new Map(branches.map(b=>[b.id,b]));
  const sourceIndices=new Map();
  asset.group?.traverse(mesh=>{const uv=mesh.geometry?.attributes.uv1;if(!uv||mesh.userData.source_index==null)return;const {width,height}=asset.lookupTexture;for(let i=0;i<uv.count;i++){const e=asset.elements[Math.floor(uv.getX(i)*width)+Math.floor(uv.getY(i)*height)*width];if(e)sourceIndices.set(e.id,mesh.userData.source_index);}});
  const leaves=asset.masterPlacements||asset.placements||[],organs=asset.treeOrgans||[];
  const records=branches.filter(b=>family.has(b.stableId)).map(b=>{
    const parent=byId.get(b.parentId),root=roots.includes(b),id=ids.get(b.stableId);
    const units=(ps,kind)=>ps.filter(p=>p.branchStableId===b.stableId).map((p,i)=>({
      ...captureUnit({...p,source:p.source>=0?p.source:sourceIndices.get(p.stableId)??0},b,kind==='LEAF'?leafSources:asset.authoring?.tree_organs?.units||[],kind,true),id:`${id}:${kind}:${i}`,parent:id,
      metadata:Object.fromEntries(['phase','random','priority','sourceAssetId','sourceInstanceId','organRole','attachmentType'].filter(k=>p[k]!=null).map(k=>[k,p[k]]))}));
    const sourceInstanceId=b.sourceInstanceId||b.instanceId||b.unitOwner||'';
    const sourceInstance=asset.authoring?.branch_instances?.find(i=>i.id===sourceInstanceId);
    return {id,parent:ids.get(parent?.stableId)||parent?.stableId||'',root,order:b.order,parentT:b.parentT,
      sourceAssetId:b.sourceAssetId||sourceInstance?.asset_id||'',sourceInstanceId,
      sourceBranchId:b.sourceBranchId||b.stableId,
      points:b.points.map(p=>p.toArray()),controlPoints:b.controlPoints.map(p=>p.toArray()),
      ...(axisTimes(b.points)?{sample_times:[...axisTimes(b.points)]}:{}),
      properties:Object.fromEntries(keys.filter(k=>b[k]!=null).map(k=>[k,structuredClone(b[k])])),
      owner:!root&&(b.unitOwner||b.instanceId)?`${token}_${b.unitOwner||b.instanceId}`:'',
      mountMatrix:b.mountMatrix?.toArray(),surfaceNormals:b.surfaceNormals?.map(p=>p.toArray()),
      leaves:units(leaves,'LEAF'),organs:units(organs,'ORGAN'),
      frame:root&&parent?{position:sampleLine(parent.points,b.parentT).toArray(),tangent:lineTangent(parent.points,b.parentT).toArray()}:null};
  });
  return {type:'DUPLICATE',targets:roots.map(b=>ids.get(b.stableId)),records};
}

export function normalizeBranchDuplicate(raw) {
  if(!Array.isArray(raw.records))return null;
  const valid=ps=>Array.isArray(ps)&&ps.length>=2&&ps.every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite));
  const identifier=v=>typeof v==='string'&&/^[a-zA-Z0-9_.-]{1,128}$/.test(v);
  const records=raw.records.filter(r=>identifier(r.id)&&(!r.parent||identifier(r.parent))&&valid(r.points)&&valid(r.controlPoints)).map(r=>{
    const record=structuredClone(r);record.properties=Object.fromEntries(keys.filter(k=>r.properties?.[k]!=null).map(k=>[k,structuredClone(r.properties[k])]));
    record.parentT=THREE.MathUtils.clamp(Number(r.parentT)||0,0,1);record.order=THREE.MathUtils.clamp(Math.round(Number(r.order)||0),0,3);
    const times=normalizeAxisTimes(r.sample_times,r.points.length);if(times)record.sample_times=times;else delete record.sample_times;
    return record;
  });
  return records.length?{type:'DUPLICATE',targets:records.filter(r=>r.root).map(r=>r.id),records}:null;
}

export function appendBranchDuplicate(branches, operation, overrides={}, suppressed=[]) {
  const byStable=new Map(branches.map(b=>[b.stableId,b])),transforms=new Map();
  let nextId=Math.max(-1,...branches.map(b=>b.id))+1;
  for(const r of operation.records){
    if(byStable.has(r.id)||suppressed.includes(r.id)||overrides[r.id]?.hidden)continue;
    const parent=byStable.get(r.parent);if(r.parent&&!parent)continue;
    let matrix=parent&&transforms.get(parent.stableId)||new THREE.Matrix4();
    if(r.root&&parent&&r.frame){
      const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...r.frame.tangent),lineTangent(parent.points,r.parentT));
      matrix=new THREE.Matrix4().makeTranslation(...sampleLine(parent.points,r.parentT).toArray()).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(...r.frame.position.map(v=>-v)));
    }
    transforms.set(r.id,matrix);
    const q=new THREE.Quaternion().setFromRotationMatrix(matrix);
    const branch={...structuredClone(r.properties),id:nextId++,stableId:r.id,parentId:parent?.id??-1,parentT:r.parentT,order:r.order,
      points:vectors(r.points).map(p=>p.applyMatrix4(matrix)),controlPoints:vectors(r.controlPoints).map(p=>p.applyMatrix4(matrix)),
      children:[],elementIndex:-1,manual:true,instanceId:'',unitOwner:r.owner||'',override:overrides[r.id]||null,
      copySnapshot:true,sourceAssetId:r.sourceAssetId||'',sourceInstanceId:r.sourceInstanceId||'',sourceBranchId:r.sourceBranchId||'',copiedLeaves:r.leaves||[],copiedOrgans:r.organs||[],
      mountMatrix:matrix.clone().multiply(r.mountMatrix?new THREE.Matrix4().fromArray(r.mountMatrix):new THREE.Matrix4()),
      surfaceNormals:r.surfaceNormals?vectors(r.surfaceNormals).map(n=>n.applyQuaternion(q)):null};
    const times=normalizeAxisTimes(r.sample_times,branch.points.length);if(times)withAxisTimes(branch.points,times,times);
    branches.push(branch);byStable.set(r.id,branch);parent?.children.push(branch.id);
  }
}

export function duplicatePlacements(placements, branches, kind, sources) {
  const copied=new Set(branches.filter(b=>b.copySnapshot).map(b=>b.stableId));
  return placements.filter(p=>!copied.has(p.branchStableId)).concat(branches.flatMap(b=>(kind==='LEAF'?b.copiedLeaves:b.copiedOrgans||[])?.flatMap(v=>{
    const p=resolveUnit(v,b,sources);return p?[{...p,...v.metadata}]:[];
  })||[]));
}

// Saving a workbench sample bakes its curves and discards construction layers.
// Carry the copied units into that same canonical frame before those layers go.
export function bakeDuplicateUnits(asset, authoring, shape, leafSources) {
  const ids=new Set(asset.masterBranches.filter(b=>b.copySnapshot).map(b=>b.stableId));
  if(!ids.size)return;
  const root=asset.masterBranches[0],origin=root.points[0],rotation=new THREE.Quaternion().setFromUnitVectors(root.points[1].clone().sub(origin).normalize(),new THREE.Vector3(1,0,0));
  const branches=new Map(shape.branches.map((b,i)=>[b.id,{stableId:b.id,id:i,points:vectors(b.points)}]));
  for(const kind of ['LEAF','ORGAN']){
    const sources=kind==='LEAF'?leafSources:authoring.tree_organs.units,placements=kind==='LEAF'?asset.masterPlacements:asset.treeOrgans;
    const records=placements.filter(p=>ids.has(p.branchStableId)&&branches.has(p.branchStableId)).map(p=>captureUnit({...p,
      position:p.position.clone().sub(origin).applyQuaternion(rotation),direction:p.direction.clone().applyQuaternion(rotation),normal:p.normal?.clone().applyQuaternion(rotation)},branches.get(p.branchStableId),sources,kind,true));
    const byId=new Map(authoring.unit_editing.items.map(v=>[v.id,v]));records.forEach(v=>byId.set(v.id,{...v,duplicate:true}));authoring.unit_editing.items=[...byId.values()];
    authoring.unit_editing.rules.push({id:'BAKED_COPY_'+kind,kind,enabled:true,targets:[...ids],order_min:0,order_max:12,amount:0});
  }
}
