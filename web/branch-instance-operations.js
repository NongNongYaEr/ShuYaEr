import * as THREE from 'three';
import { resolveInstanceShape } from './branch-workbench-data.js';
import { instanceMatrix, reframeInstanceEdits, instanceEditBase } from './branch-instance-edit.js';
import { branchInstanceFrame } from './branch-kernel.js';
import { sampleLine, lineTangent } from './tree-sculpt.js';
import { branchMountAt } from './branch-mount-frame.js';
import {trunkInstanceWorldMatrix} from './imported-trunk-attachments.js';
import {createInstanceReferenceBatch} from './instance-reference-curves.js';

const owns = (id, owner) => typeof id === 'string' && (id === owner || id.startsWith(owner + '.'));
export function branchInstanceOwner(authoring, id, asset = null) {
  if (!id) return null;
  const instances = authoring.branch_instances || [];
  const direct = instances.filter(i => owns(id, i.id)).sort((a, b) => b.id.length - a.id.length)[0];
  if (direct) return direct;
  const branch = asset?.masterBranches?.find(b => b.stableId === id);
  if (branch?.instanceId || branch?.unitOwner) return instances.find(i => i.id === (branch.instanceId || branch.unitOwner)) || null;
  const elements = asset?.elements || [];
  let element = elements.find(e => e.id === id), visited = new Set();
  while (element && !visited.has(element)) {
    visited.add(element);
    const owner = instances.filter(i => owns(element.id, i.id)).sort((a,b) => b.id.length-a.id.length)[0];
    if (owner) return owner;
    element = elements[element.parentIndex];
  }
  return null;
}

export function selectedInstanceRoots(authoring, selection, asset = null) {
  const ids = new Set([...selection].map(id => branchInstanceOwner(authoring, id, asset)?.id).filter(Boolean));
  return (authoring.branch_instances || []).filter(i => {
    if (!ids.has(i.id)) return false;
    let parent=branchInstanceOwner(authoring,i.parent,asset);const visited=new Set([i.id]);
    while(parent&&!visited.has(parent.id)){if(ids.has(parent.id))return false;visited.add(parent.id);parent=branchInstanceOwner(authoring,parent.parent,asset);}
    return true;
  });
}

export function instanceFamily(authoring, roots) {
  const ids = new Set(roots.map(i => typeof i === 'string' ? i : i.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const i of authoring.branch_instances || []) if (!ids.has(i.id) && [...ids].some(owner => owns(i.parent, owner))) { ids.add(i.id); changed = true; }
  }
  return (authoring.branch_instances || []).filter(i => ids.has(i.id));
}

// Identity remapping is constrained to instance/branch IDs. Asset and source IDs
// remain shared so a copy keeps its exact pinned material and source revision.
export function cloneBranchInstances(authoring, roots, makeId = () => 'INST_' + crypto.randomUUID().replaceAll('-', ''), runtimeBranches = []) {
  const family = instanceFamily(authoring, roots), mapping = new Map(family.map(i => [i.id, makeId(i)]));
  if (authoring.branch_instances.length + family.length > 1600) throw Error('单元枝数量达到 1600 支，请先减少装配');
  const used = new Set(authoring.branch_instances.map(i => i.id));
  for (const id of mapping.values()) { if (!id || used.has(id)) throw Error('副本编号重复'); used.add(id); }
  const ownerIds = [...mapping.keys()].sort((a,b) => b.length-a.length);
  // A hand-added branch has its own ID rather than the instance prefix. Discover
  // its full attachment subtree before cloning any overrides or unit records.
  const manual=[],manualIds=new Set();let discovering=true;
  while(discovering){discovering=false;for(const b of authoring.manual_branches||[])if(!manualIds.has(b.id)&&(ownerIds.some(id=>owns(b.parent,id))||manualIds.has(b.parent))){manual.push(b);manualIds.add(b.id);mapping.set(b.id,makeId(b));discovering=true;}}
  const addedUnits=[...(authoring.leaf_edits?.added||[]),...(authoring.unit_editing?.items||[])].filter(v=>ownerIds.some(id=>owns(v.parent,id))||manualIds.has(v.parent));
  for(const v of addedUnits)if(!ownerIds.some(id=>owns(v.id,id))&&!mapping.has(v.id))mapping.set(v.id,makeId(v));
  const addedUnitIds=new Set(addedUnits.map(v=>v.id));
  const mapped = id => {
    if (typeof id !== 'string') return id;
    if (mapping.has(id)) return mapping.get(id);
    const owner = ownerIds.find(owner => owns(id, owner));
    return owner ? mapping.get(owner) + id.slice(owner.length) : id;
  };
  const owned = id => manualIds.has(id)||addedUnitIds.has(id)||ownerIds.some(owner => owns(id, owner));
  const mapRefs = value => {
    if (typeof value === 'string') return mapped(value);
    if (Array.isArray(value)) return value.map(mapRefs);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key,v]) => [mapped(key), ['asset_id','source_id','material_asset_id'].includes(key) ? structuredClone(v) : mapRefs(v)]));
  };
  const copies = family.map(i => ({...structuredClone(i),id:mapping.get(i.id),parent:mapped(i.parent),unit_seed_owner:i.unit_seed_owner||i.id,assembly_refined:true,assembly_manual:true}));
  authoring.branch_instances.push(...copies);
  for (const [id,value] of Object.entries(authoring.overrides || {})) if (owned(id)) authoring.overrides[mapped(id)] = mapRefs(value);
  const layers = [];
  for (const layer of authoring.sculpt_layers || []) {
    const records = Object.fromEntries(Object.entries(layer.branches || {}).filter(([id]) => owned(id)));
    const op = layer.operation, targets = op?.targets?.filter(owned) || [];
    if (!Object.keys(records).length && !targets.length) continue;
    const operation=targets.length?{...structuredClone(op),targets}:null;
    if(operation?.records)operation.records=operation.records.filter(r=>owned(r.id)||owned(r.parent));
    const next = mapRefs({...structuredClone(layer),id:makeId(layer),branches:records,operation});
    layers.push(next);
  }
  authoring.sculpt_layers.push(...layers);
  const topology = authoring.topology;
  if (topology) {
    topology.suppressed.push(...topology.suppressed.filter(owned).map(mapped));
    for (const [id,parent] of Object.entries(topology.reparent)) if (owned(id)) topology.reparent[mapped(id)] = mapped(parent);
  }
  authoring.manual_branches.push(...manual.map(mapRefs));
  for(const b of runtimeBranches.filter(b=>manualIds.has(b.stableId))){const parent=runtimeBranches.find(p=>p.id===b.parentId),points=b.points.map(p=>p.toArray()),knots=b.controlPoints.map(p=>p.toArray());
    authoring.overrides[mapped(b.stableId)]={...authoring.overrides[mapped(b.stableId)],locked:true,curve_knots:knots,curve_samples:points,curve_reference_knots:knots,
      offset:parent?b.controlPoints[0].clone().sub(sampleLine(parent.points,b.parentT)).toArray():[0,0,0],curve_parent_frame:parent?{parent:mapped(parent.stableId),tangent:lineTangent(parent.points,b.parentT).toArray()}:null};}
  const leafEdits = authoring.leaf_edits;
  if (leafEdits) {
    const added = leafEdits.added.filter(v => owned(v.parent));
    for (const v of added) if (!owned(v.id)) mapping.set(v.id, makeId(v));
    leafEdits.added.push(...added.map(mapRefs));
    leafEdits.removed.push(...leafEdits.removed.filter(owned).map(mapped));
  }
  const editing = authoring.unit_editing;
  if (editing) {
    const items = editing.items.filter(v => owned(v.parent));
    for (const v of items) if (!owned(v.id)) mapping.set(v.id, makeId(v));
    editing.items.push(...items.map(v => ({...mapRefs(v),duplicate:true})));
    editing.removed.push(...editing.removed.filter(owned).map(mapped));
    editing.rules.push(...editing.rules.filter(r => r.targets.some(owned)).map(r => mapRefs({...r,id:makeId(r),targets:r.targets.filter(owned)})));
  }
  const scale = authoring.workbench?.assembly_scale?.records;
  if (scale) for (const [id,record] of Object.entries(scale)) if (mapping.has(id)) scale[mapped(id)] = structuredClone(record);
  return {copies, mapping, roots:roots.map(i => copies.find(c => c.id === mapping.get(i.id))), mapId:mapped};
}

// Clear only project-local contents for explicitly restored members. The root
// instances and their asset/pinned version/shape association remain untouched;
// placement flags and frames are reset by the automatic placement planner.
export function resetBranchInstanceEdits(authoring, roots) {
  const ids=new Set([...roots].map(i=>typeof i==='string'?i:i.id)),localBranches=new Set(),unitIds=new Set();
  const branchOwned=id=>[...ids].some(owner=>owns(id,owner))||[...localBranches].some(owner=>owns(id,owner));
  const gone=id=>unitIds.has(id)||branchOwned(id)||[...localBranches].some(owner=>typeof id==='string'&&id.startsWith(owner+':'));
  let discovering=true;
  while(discovering){discovering=false;
    for(const b of authoring.manual_branches||[])if(!localBranches.has(b.id)&&branchOwned(b.parent)){localBranches.add(b.id);discovering=true;}
    for(const layer of authoring.sculpt_layers||[])for(const b of layer.operation?.records||[])if(!localBranches.has(b.id)&&branchOwned(b.parent)){localBranches.add(b.id);discovering=true;}
  }
  for(const v of [...(authoring.leaf_edits?.added||[]),...(authoring.unit_editing?.items||[])])if(branchOwned(v.parent))unitIds.add(v.id);
  authoring.overrides = Object.fromEntries(Object.entries(authoring.overrides || {}).filter(([id]) => !gone(id)));
  authoring.manual_branches = (authoring.manual_branches || []).filter(b => !gone(b.id)&&!gone(b.parent));
  authoring.sculpt_layers = (authoring.sculpt_layers || []).flatMap(layer => {
    const next = {...layer,branches:Object.fromEntries(Object.entries(layer.branches || {}).filter(([id]) => !gone(id)))};
    if (next.operation) { next.operation = {...next.operation,targets:(next.operation.targets||[]).filter(id => !gone(id))};
      if(next.operation.records){next.operation.records=next.operation.records.filter(r=>!gone(r.id)&&!gone(r.parent));if(next.operation.type==='DUPLICATE')next.operation.targets=next.operation.records.filter(r=>r.root).map(r=>r.id);}
      if (!next.operation.targets.length) next.operation = null; }
    return Object.keys(next.branches).length || next.operation ? [next] : [];
  });
  if (authoring.topology) { authoring.topology.suppressed=authoring.topology.suppressed.filter(id => !gone(id)); authoring.topology.reparent=Object.fromEntries(Object.entries(authoring.topology.reparent).filter(([id,parent]) => !gone(id)&&!gone(parent))); }
  if (authoring.leaf_edits) { authoring.leaf_edits.added=authoring.leaf_edits.added.filter(v => !gone(v.id)&&!gone(v.parent)); authoring.leaf_edits.removed=authoring.leaf_edits.removed.filter(id => !gone(id)); }
  if (authoring.unit_editing) { const e=authoring.unit_editing;e.items=e.items.filter(v => !gone(v.id)&&!gone(v.parent));e.removed=e.removed.filter(id => !gone(id));e.rules=e.rules.flatMap(r => r.targets.length ? (r.targets.some(id=>!gone(id)) ? [{...r,targets:r.targets.filter(id=>!gone(id))}] : []) : [r]);if(e.overrides)e.overrides=Object.fromEntries(Object.entries(e.overrides).filter(([id])=>!gone(id))); }
  authoring.workbench ||= {};
  for (const records of [authoring.workbench.assembly_scale?.records,authoring.workbench.assembly_distribution?.placements]) if (records) for (const id of ids) delete records[id];
  return {members:ids.size,localBranches:localBranches.size,units:unitIds.size};
}

export function deleteBranchInstances(authoring, roots) {
  const family = instanceFamily(authoring, roots), ids = new Set(family.map(i => i.id)),deleted=family.length;
  if (!deleted) return 0;
  // Arrays own explicit empty member slots. Their deletions must not create a
  // global void that suppresses the separate three-zone foliage assembly.
  for(const i of family)if(i.array_id){const group=authoring.branch_arrays?.find(g=>g.id===i.array_id);if(group){group.removed=[...new Set([...(group.removed||[]),i.id])];group.locked=(group.locked||[]).filter(id=>id!==i.id);}}
  authoring.workbench ||= {};
  authoring.workbench.assembly_voids ||= [];
  for (const root of roots){const i=typeof root==='string'?family.find(i=>i.id===root):root;if(i?.parent&&!i.array_id)authoring.workbench.assembly_voids.push({parents:[i.parent],start:Math.max(0,i.attach-.025),end:Math.min(1,i.attach+.025),role:i.shootRole || 'ANY'});}
  resetBranchInstanceEdits(authoring,ids);
  authoring.branch_instances = authoring.branch_instances.filter(i => !ids.has(i.id));
  return deleted;
}

export function evaluatedInstanceFrame(instance,shape,branches,settings){
  const matrix=instanceMatrix(instance,shape,branches,settings);
  return {position:new THREE.Vector3(...shape.connector.position).applyMatrix4(matrix),direction:new THREE.Vector3(...shape.connector.direction).transformDirection(matrix),matrix};
}

// Convert a desired world transform back to the saved carrier-local frame. This
// handles sculpted carriers whose mount frame includes rotation and scale.
export function instanceFromMatrix(instance,shape,parent,matrix,scale=null){
  const mount=trunkInstanceWorldMatrix(instance,parent)||branchMountAt(parent,instance.attach),inverse=mount?.clone().invert(),local=matrix.clone();if(inverse)local.premultiply(inverse);
  const position=new THREE.Vector3(...shape.connector.position).applyMatrix4(local),direction=new THREE.Vector3(...shape.connector.direction).transformDirection(local),rotation=new THREE.Quaternion(),dimensions=new THREE.Vector3();local.decompose(new THREE.Vector3(),rotation,dimensions);
  if(scale===null)scale=dimensions.x/(branchInstanceFrame(instance,null,{}).scale/instance.scale);
  const aligned=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...shape.connector.direction),direction),twist=rotation.clone().multiply(aligned.invert());
  const degrees=THREE.MathUtils.radToDeg(2*Math.atan2(new THREE.Vector3(twist.x,twist.y,twist.z).dot(direction),twist.w)),roll=((degrees+180)%360+360)%360-180;
  const points=parent?.points.map(p=>inverse?p.clone().applyMatrix4(inverse):p);
  return {...instance,scale,roll,assembly_refined:true,assembly_manual:true,frame:{position:position.toArray(),direction:direction.toArray(),parent_position:points?sampleLine(points,instance.attach).toArray():null,parent_tangent:points?lineTangent(points,instance.attach).toArray():[0,0,1]}};
}

export function moveInstanceToCarrier(instance, parent, beforeParent, settings, attach, shape=null) {
  shape ||= {connector:{position:[0,0,0],direction:[1,0,0]}};
  const frame=evaluatedInstanceFrame(instance,shape,beforeParent?[beforeParent]:[],settings), previous=beforeParent?lineTangent(beforeParent.points,instance.attach):new THREE.Vector3(0,0,1),tangent=lineTangent(parent.points,attach),rotation=new THREE.Quaternion().setFromUnitVectors(previous,tangent),position=sampleLine(parent.points,attach);
  const transform=new THREE.Matrix4().makeTranslation(...position.toArray()).multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation)).multiply(new THREE.Matrix4().makeTranslation(...frame.position.clone().negate().toArray()));
  const moved={...instance,parent:parent.stableId,attach};delete moved.trunk_anchor;
  return instanceFromMatrix(moved,shape,parent,transform.multiply(frame.matrix));
}
export function moveInstanceToSurface(instance,target,beforeParent,settings,shape){
  const original=evaluatedInstanceFrame(instance,shape,beforeParent?[beforeParent]:[],settings),surface=target.surface_binding,previous=trunkInstanceWorldMatrix(instance,beforeParent),normal=instance.trunk_anchor&&beforeParent?.trunkAttachments?.get(instance.id)?.normal||original.direction,rotation=new THREE.Quaternion().setFromUnitVectors(normal.clone().normalize(),target.surface_frame.direction.clone().normalize());
  const parent={...target.parent,trunkAttachments:new Map(target.parent.trunkAttachments||[])};parent.trunkAttachments.set(instance.id,surface);
  const seed={...instance,parent:parent.stableId,attach:target.attach,trunk_anchor:target.trunk_anchor,frame:target.frame},desired=new THREE.Matrix4().makeTranslation(...target.surface_frame.position.toArray()).multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation)).multiply(new THREE.Matrix4().makeTranslation(...original.position.clone().negate().toArray())).multiply(original.matrix);
  return {instance:instanceFromMatrix(seed,shape,parent,desired),parent};
}

export function rotateInstance(instance, parent, settings, rotation, shape=null) {
  shape ||= {connector:{position:[0,0,0],direction:[1,0,0]}};
  const frame=evaluatedInstanceFrame(instance,shape,parent?[parent]:[],settings),transform=new THREE.Matrix4().makeTranslation(...frame.position.toArray()).multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation)).multiply(new THREE.Matrix4().makeTranslation(...frame.position.clone().negate().toArray()));
  return instanceFromMatrix(instance,shape,parent,transform.multiply(frame.matrix));
}

export function instanceTransformMatrix(before, after, shape, branches, settings) {
  return instanceMatrix(after,shape,branches,settings).multiply(instanceMatrix(before,shape,branches,settings).invert());
}

// One placement transaction shares these read-only runtime indices. Source
// geometry and library samples remain untouched; only saved instance records
// are changed. The family graph describes the start of the gesture, so moving
// one selected root onto another cannot transform it twice in the same batch.
export function createInstancePlacementContext(authoring, branches, settings, options = {}) {
  const instanceById=new Map((authoring.branch_instances||[]).map(i=>[i.id,i])),byStable=new Map(),byId=new Map(),branchesByOwner=new Map(),children=new Map(),localEdits=new Set(),unitItemsByOwner=new Map();
  const add=(map,id,value)=>{if(!id)return;let list=map.get(id);if(!list)map.set(id,list=[]);list.push(value);};
  const ownersOf=id=>{const owners=[];if(typeof id!=='string')return owners;if(instanceById.has(id))owners.push(id);for(let n=id.lastIndexOf('.');n>=0;n=id.lastIndexOf('.',n-1)){const owner=id.slice(0,n);if(instanceById.has(owner))owners.push(owner);if(n===0)break;}return owners;};
  const ownerOf=id=>ownersOf(id)[0]||null;
  for(const b of branches){byStable.set(b.stableId,b);byId.set(b.id,b);const owner=instanceById.has(b.instanceId)?b.instanceId:instanceById.has(b.unitOwner)?b.unitOwner:ownerOf(b.stableId);add(branchesByOwner,owner,b);}
  for(const i of instanceById.values())add(children,ownerOf(i.parent),i);
  for(const [id,value]of Object.entries(authoring.overrides||{}))if(value.curve_knots?.length||value.frozen_points?.length)for(const owner of ownersOf(id))localEdits.add(owner);
  for(const layer of authoring.sculpt_layers||[])for(const id of [...Object.keys(layer.branches||{}),...(layer.operation?.targets||[])])for(const owner of ownersOf(id))localEdits.add(owner);
  for(const item of authoring.unit_editing?.items||[])for(const owner of ownersOf(item.parent))add(unitItemsByOwner,owner,item);
  const ordinal=new Map((authoring.branch_instances||[]).map((i,n)=>[i.id,n])),families=new Map();
  const familyOf=id=>{if(families.has(id))return families.get(id);const ids=new Set(),queue=[id];for(let n=0;n<queue.length;n++){const current=queue[n];if(ids.has(current)||!instanceById.has(current))continue;ids.add(current);for(const child of children.get(current)||[])queue.push(child.id);}const family=[...ids].map(id=>instanceById.get(id)).sort((a,b)=>ordinal.get(a.id)-ordinal.get(b.id));families.set(id,family);return family;};
  const context={authoring,branches,settings,instanceById,byStable,byId,branchesByOwner,ownerOf,familyOf,localEdits,unitItemsByOwner,referenceOwners:options.owners?new Set(options.owners):null,
    stats:{rigidWrites:0,legacyReframes:0,movedBranches:0,referenceBuilds:0,referenceProjections:0}};
  context.referenceFor=createInstanceReferenceBatch(context);return context;
}

const placementContextFor=(authoring,branches,settings,context)=>context?.authoring===authoring&&context.branches===branches&&context.settings===settings?context:createInstancePlacementContext(authoring,branches,settings);

export function applyInstancePlacement(authoring, before, after, shape, branches, settings, baseBranches = null, context = null) {
  const ctx=placementContextFor(authoring,branches,settings,context);
  if(baseBranches||ctx.localEdits.has(before.id)){
    const base=baseBranches || ctx.referenceFor?.(before.id) || instanceEditBase(authoring,before.id,branches,settings);
    reframeInstanceEdits(authoring,before,after,shape,branches,settings,base,ctx.reframeScopes?.get(before.id));ctx.stats.legacyReframes++;
  }else{
    // Complete reusable models need no copied curve, deformed prototype or
    // per-vertex reframe for a rigid placement change.
    authoring.curve_editor.affect_children=true;ctx.stats.rigidWrites++;
  }
  // The existing edit helper follows the old parent for same-carrier movement.
  // Cross-carrier placement must update the saved curve attachment frame too.
  if (after.parent !== before.parent) {
    const target=ctx.byStable.get(after.parent), rootId=before.id+'.'+shape.branches[0].id, override=authoring.overrides[rootId];
    if (target && override?.curve_knots?.length) { const anchor=branchInstanceFrame(after,target,settings).position;
      override.offset=new THREE.Vector3(...override.curve_knots[0]).sub(anchor).toArray();
      override.curve_parent_frame={parent:target.stableId,tangent:lineTangent(target.points,after.attach).toArray()}; }
  }
  const ratio=after.scale/before.scale;
  if (Math.abs(ratio-1)>1e-10) for (const item of ctx.unitItemsByOwner.get(before.id)||[]) { item.offset=item.offset.map(x=>x*ratio);item.scale*=ratio;item.base_scale*=ratio; }
  const stored=ctx.instanceById.get(before.id);if(!after.trunk_anchor)delete stored.trunk_anchor;
  Object.assign(stored,after,{assembly_refined:true,assembly_manual:true});
}

export function applyInstanceFamilyPlacement(authoring,before,after,shape,branches,settings,context=null){
  const ctx=placementContextFor(authoring,branches,settings,context),family=ctx.familyOf(before.id),childrenRecords=family.filter(i=>i.id!==before.id),owned=family.flatMap(i=>ctx.branchesByOwner.get(i.id)||[]),manual=owned.filter(b=>b.manual&&!b.instanceId);
  if(!childrenRecords.length&&!manual.length){applyInstancePlacement(authoring,before,after,shape,branches,settings,null,ctx);return;}
  const matrix=instanceTransformMatrix(before,after,shape,[ctx.byStable.get(before.parent),ctx.byStable.get(after.parent)].filter(Boolean),settings),ratio=after.scale/before.scale,movedByStable=new Map(),movedById=new Map();
  for(const b of owned){const moved={...b,points:b.points.map(p=>p.clone().applyMatrix4(matrix)),controlPoints:b.controlPoints.map(p=>p.clone().applyMatrix4(matrix))};movedByStable.set(b.stableId,moved);movedById.set(b.id,moved);ctx.stats.movedBranches++;}
  const children=childrenRecords.map(i=>{const localShape=resolveInstanceShape(i,authoring.branch_library),oldParent=ctx.byStable.get(i.parent),newParent=movedByStable.get(i.parent)||oldParent,desired=matrix.clone().multiply(instanceMatrix(i,localShape,oldParent?[oldParent]:[],settings));
    return {before:structuredClone(i),shape:localShape,temporary:instanceFromMatrix(i,localShape,oldParent,desired,i.scale*ratio),after:instanceFromMatrix(i,localShape,newParent,desired,i.scale*ratio)};});
  applyInstancePlacement(authoring,before,after,shape,branches,settings,null,ctx);
  for(const child of children){applyInstancePlacement(authoring,child.before,child.temporary,child.shape,branches,settings,null,ctx);Object.assign(ctx.instanceById.get(child.before.id),child.after);}
  // Custom manually attached branches inherit owner identity but not its prefix.
  const linear=new THREE.Matrix3().setFromMatrix4(matrix);
  for(const b of manual){const local=authoring.overrides[b.stableId],parent=movedById.get(b.parentId)||ctx.byId.get(b.parentId);if(local?.curve_knots){for(const key of ['curve_knots','curve_samples','curve_reference_knots','frozen_points'])if(local[key])local[key]=local[key].map(p=>new THREE.Vector3(...p).applyMatrix4(matrix).toArray());local.offset=parent?new THREE.Vector3(...local.curve_knots[0]).sub(sampleLine(parent.points,b.parentT)).toArray():[0,0,0];local.curve_parent_frame=parent?{parent:parent.stableId,tangent:lineTangent(parent.points,b.parentT).toArray()}:null;}
    for(const layer of authoring.sculpt_layers){const entry=layer.branches[b.stableId];if(entry)for(const key of ['deltas','knot_deltas'])if(entry[key])entry[key]=entry[key].map(p=>new THREE.Vector3(...p).applyMatrix3(linear).toArray());}
    const record=authoring.manual_branches.find(v=>v.id===b.stableId);if(record){record.length*=ratio;record.radius*=ratio;}}
}
