import * as THREE from 'three';
import { instanceMatrix } from './branch-instance-edit.js';
import { copy, normalizeBranchShape, resolveInstanceShape, resolveInstanceAsset } from './branch-workbench-data.js';
import { captureSkeletonRadius } from './branch-shaping.js';
import { captureUnit } from './unit-authoring.js';
import { sampleLeafMaterial } from './leaf-material-data.js';
import { normalizeAuthoring } from './authoring-state.js';

const sameMaterial=(a,b)=>a&&b&&['color','normal','cutoff','roughness'].every(key=>a[key]===b[key]);
function materialKey(material){
  let hash=2166136261;
  for(const key of ['color','normal','cutoff','roughness']){const value=String(material?.[key]??'');for(let n=0;n<value.length;n++)hash=Math.imul(hash^value.charCodeAt(n),16777619);hash=Math.imul(hash^value.length,16777619);}
  return 'MAT_'+(hash>>>0).toString(16);
}

// A local draft freezes the effective sample contents in its original connector
// frame. The instance keeps its identity and mount when this draft returns.
export function captureCompleteInstanceDraft(asset, instance, document, sources) {
  const a=document.authoring,item=resolveInstanceAsset({...instance,linked:true},a.branch_library);
  if(!item?.sample)throw Error('这个实例没有完整叶花果样本，请先补齐成品素材');
  const original=resolveInstanceShape(instance,a.branch_library);
  const inverse=instanceMatrix(instance,original,asset.masterBranches,document.settings).invert();
  const rotation=new THREE.Quaternion();inverse.decompose(new THREE.Vector3(),rotation,new THREE.Vector3());
  const ratio=Math.cbrt(Math.abs(inverse.determinant())),prefix=instance.id+'.';
  const root=asset.masterBranches.find(b=>b.stableId===prefix+original.branches[0].id);
  if(!root)throw Error('当前完整成品没有可提取的枝干');
  const children=new Map();for(const b of asset.masterBranches){if(!children.has(b.parentId))children.set(b.parentId,[]);children.get(b.parentId).push(b);}
  const family=[],queue=[root],seen=new Set();
  while(queue.length){const b=queue.shift();if(seen.has(b.id))continue;seen.add(b.id);family.push(b);queue.push(...children.get(b.id)||[]);}
  if(family.length>2200)throw Error('完整成品超过2200枝段，精修草稿未建立，请先拆分成品');
  const used=new Set(),mapping=new Map(),byId=new Map(family.map(b=>[b.id,b]));
  // Original local IDs remain stable. Added/nested IDs get bounded unique names
  // before shape normalization, which otherwise truncates and merges long IDs.
  for(const b of family)if(b.stableId.startsWith(prefix)){const id=b.stableId.slice(prefix.length);mapping.set(b.stableId,id);used.add(id);}
  for(const [n,b]of family.entries())if(!mapping.has(b.stableId)){
    const stem=('LOCAL_'+n+'_'+b.stableId.replace(/[^a-zA-Z0-9_.-]/g,'_')).slice(0,118);let id=stem,suffix=1;
    while(used.has(id))id=stem+'_'+suffix++;used.add(id);mapping.set(b.stableId,id);
  }
  const shape=normalizeBranchShape({...original,branches:family.map(b=>{
    const radius=captureSkeletonRadius(b,b===root),factor=ratio/(instance.radius_scale||1);
    return {id:mapping.get(b.stableId),parent:b===root?'':mapping.get(byId.get(b.parentId)?.stableId),attach:b.parentT,
      points:b.points.map(p=>p.clone().applyMatrix4(inverse).toArray()),knots:b.controlPoints.map(p=>p.clone().applyMatrix4(inverse).toArray()),
      length:b.length*ratio,radius_profile:b.radiusProfile,sections:b.sections,...radius,
      start_radius:(radius.start_radius??b.startRadius)*factor,end_radius:(radius.end_radius??b.endRadius)*factor};
  })});
  const branchMap=new Map(shape.branches.map((b,id)=>[family[id].stableId,{id,stableId:b.id,points:b.points.map(p=>new THREE.Vector3(...p))}]));
  const familyIds=new Set(family.map(b=>b.stableId)),worldBranches=new Map(family.map(b=>[b.stableId,b])),absorbed=a.branch_instances.filter(i=>i.id!==instance.id&&(family.some(b=>b.instanceId===i.id||b.unitOwner===i.id)||familyIds.has(i.parent)));
  const owners=new Map([instance,...absorbed].map(i=>[i.id,resolveInstanceAsset({...i,linked:true},a.branch_library)]));
  for(const b of family){const owner=b.instanceId||b.unitOwner;if(owner&&!owners.has(owner)&&b.sourceAssetId)owners.set(owner,a.branch_library.find(i=>i.id===b.sourceAssetId));}
  const leafMeshes=copy(document.leaf_meshes||[]),leafIds=new Map(leafMeshes.map((s,i)=>[s.id,i]));
  const organs=copy(a.tree_organs.units||[]),organIds=new Map(organs.map((s,i)=>[s.id,i])),fallback=new Map(),organFallback=new Map();
  const sourceIndices=new Map(),sourceTextures={LEAF:new Map(),ORGAN:new Map()},baseMaterial=sampleLeafMaterial(item.sample,a.branch_library,a.leaf_material),materialRegistry={};
  function textureFor(source,sample=null){
    const key=source?.sampleLeafMaterialId;
    return source?.sampleLeafMaterial||(key==='BASE'?(sample?sampleLeafMaterial(sample,a.branch_library,a.leaf_material):a.leaf_material):sample?.authoring?.sample_materials?.[key]||a.sample_materials?.[key]);
  }
  function register(list,ids,source,texture,kind){
    let index=ids.get(source.id),material=texture||textureFor(source),previous=index==null?null:sourceTextures[kind].get(index)||textureFor(list[index]);
    if(index!=null&&previous&&material&&!sameMaterial(previous,material)){
      index=list.findIndex((s,n)=>s.local_source_id===source.id&&sameMaterial(sourceTextures[kind].get(n)||textureFor(s),material));
      if(index<0){let id=('LOCAL_'+kind+'_'+list.length+'_'+source.id).slice(0,118),suffix=1;while(ids.has(id))id=id.slice(0,118)+'_'+suffix++;
        index=list.length;ids.set(id,index);list.push({...copy(source),id,local_source_id:source.id});}
    }else if(index==null){index=list.length;ids.set(source.id,index);list.push(copy(source));}
    if(material)sourceTextures[kind].set(index,material);
    return index;
  }
  for(const [id,owner]of owners){
    if(!owner?.sample)continue;
    const texture=sampleLeafMaterial(owner.sample,a.branch_library,a.leaf_material),local={LEAF:new Map(),ORGAN:new Map()};
    for(const s of owner.sample.leaf_meshes||[])local.LEAF.set(s.id,register(leafMeshes,leafIds,s,textureFor(s,owner.sample)||texture,'LEAF'));
    for(const s of owner.sample.authoring?.tree_organs?.units||[])local.ORGAN.set(s.id,register(organs,organIds,s,textureFor(s,owner.sample)||texture,'ORGAN'));
    sourceIndices.set(id,local);
  }
  function inspect(mesh,lookup,elements,owner='',sampleSources=sources){
    if(mesh.userData.source_index==null||!mesh.geometry?.attributes.uv1||!lookup)return;
    const sourceId=sampleSources[mesh.userData.source_index]?.id,uv=mesh.geometry.attributes.uv1;
    const target=mesh.userData.category==='tree_organ'?organFallback:fallback;
    for(let i=0;i<uv.count;i++){const e=elements[Math.floor(uv.getX(i)*lookup.width)+Math.floor(uv.getY(i)*lookup.height)*lookup.width];if(e&&sourceId)target.set(owner+e.id,sourceId);}
  }
  asset.group.traverse(mesh=>{const bindings=asset.editPreviewBindings?.(mesh);
    if(bindings?.instances){for(const b of bindings.instances)if(owners.has(b.id)){
      const object=b.object(),sample=owners.get(b.id)?.sample,localSources=object.userData.category==='tree_organ'?sample?.authoring?.tree_organs?.units:sample?.leaf_meshes;
      inspect(object,b.lookup,b.elements,b.id+'.',localSources||sources);
    }}
    else if(!mesh.isInstancedMesh)inspect(mesh,bindings?.lookup||asset.lookupTexture,asset.elements,'',mesh.userData.category==='tree_organ'?a.tree_organs.units:sources);
  });
  const items=[],unitMapping={},unitIds=new Set(),absorbedUnitIds=[];
  for(const [kind,placements]of [['LEAF',asset.masterPlacements||[]],['ORGAN',asset.treeOrgans||[]]])for(const p of placements){
    const branch=branchMap.get(p.branchStableId);if(!branch)continue;
    const stem=p.stableId.startsWith(prefix)?p.stableId.slice(prefix.length):p.stableId;let id=stem,suffix=1;
    while(unitIds.has(id))id=stem+'_LOCAL_'+suffix++;unitIds.add(id);unitMapping[p.stableId]=id;absorbedUnitIds.push(p.stableId);
    const sourceId=kind==='LEAF'?sources[p.source]?.id||fallback.get(p.stableId):a.tree_organs.units[p.source]?.id||organFallback.get(p.stableId);
    const worldBranch=worldBranches.get(p.branchStableId),owner=worldBranch.instanceId||worldBranch.unitOwner||instance.id;
    const index=sourceIndices.get(owner)?.[kind].get(sourceId)??(kind==='LEAF'?leafIds.get(sourceId):organIds.get(sourceId));
    if(index==null||index<0)throw Error(`无法恢复${kind==='LEAF'?'叶片':'花果'}素材 ${p.stableId}，精修草稿未建立`);
    const local={...p,stableId:id,source:index,unitT:undefined,scale:p.scale*ratio,
      position:p.position.clone().applyMatrix4(inverse),direction:p.direction.clone().applyQuaternion(rotation),normal:p.normal?.clone().applyQuaternion(rotation)};
    items.push(captureUnit(local,branch,kind==='LEAF'?leafMeshes:organs,kind,true));
  }
  if(items.length>20000)throw Error('完整成品超过20000叶花果单元，精修草稿未建立，请先拆分成品');
  // The host can contain unrelated plants. A private sample carries only the
  // geometries actually used in this subtree, with local source indices.
  for(const [kind,registry]of [['LEAF',leafMeshes],['ORGAN',organs]]){
    const used=new Set(items.filter(v=>v.kind===kind).map(v=>v.source)),indices=new Map(),selected=[];
    registry.forEach((s,i)=>{if(used.has(i)){
      const texture=sourceTextures[kind].get(i)||textureFor(s),index=selected.length;
      delete s.sampleLeafMaterial;delete s.sampleLeafMaterialName;delete s.sampleLeafMaterialId;
      if(texture&&!sameMaterial(texture,baseMaterial)){
        let id=materialKey(texture),suffix=1;while(materialRegistry[id]&&!sameMaterial(materialRegistry[id],texture))id=materialKey(texture)+'_'+suffix++;
        materialRegistry[id] ||= copy(texture);s.sampleLeafMaterialId=id;
      }else if(texture&&kind==='ORGAN')s.sampleLeafMaterialId='BASE';
      indices.set(i,index);selected.push(s);
    }});
    items.filter(v=>v.kind===kind).forEach(v=>{v.source=indices.get(v.source);});registry.splice(0,registry.length,...selected);
  }
  if(organs.length>24)throw Error('完整成品使用超过24种花果网格，精修草稿未建立，请先拆分成品');
  if(Object.keys(materialRegistry).length>128)throw Error('完整成品使用超过128套材质，精修草稿未建立，请先拆分成品');
  const sample=copy(item.sample.authoring);
  const authoring=normalizeAuthoring({...sample,branch_shape:shape,branch_instances:[],branch_arrays:[],branch_library:a.branch_library,
    overrides:{},sculpt_layers:[],manual_branches:[],modifiers:[],influence_regions:[],symmetry_groups:[],
    topology:{},leaf_edits:{removed:[],added:[]},foliage_masks:[],leaf_material:baseMaterial,sample_materials:materialRegistry,
    tree_organs:{...sample.tree_organs,units:organs,max_count:items.filter(v=>v.kind==='ORGAN').length},
    unit_editing:{items,removed:[],rules:['LEAF','ORGAN'].map(kind=>({id:'LOCAL_SNAPSHOT_'+kind,kind,amount:0,targets:shape.branches.map(b=>b.id)}))},
    recipe:{...sample.recipe,tags:[...new Set([...(sample.recipe?.tags||[]).filter(t=>!['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY'].includes(t)),'FROZEN_COMPLETE_SAMPLE'])]},
    workbench:{name:item.name+' · 局部精修',source:{instance_id:instance.id,asset_id:item.id,root:root.stableId,ids:[...branchMap.keys()],parent:instance.parent,attach:instance.attach,
      sample_layout:asset.report?.compiled_samples>0?'SHARED_SAMPLE':'INSTANCE_SEEDED',
      absorbed_branch_ids:[...familyIds],absorbed_instance_ids:absorbed.map(i=>i.id),absorbed_unit_ids:absorbedUnitIds,
      branch_id_map:Object.fromEntries(mapping),unit_id_map:unitMapping}}});
  return {settings:{...document.settings,...item.sample.settings,object_name:item.name+' · 局部精修',leaf_density:0,max_leaves:Math.max(item.sample.settings.max_leaves||0,items.filter(v=>v.kind==='LEAF').length),preview_lod:0},authoring,leaf_meshes:leafMeshes,history:[],future:[],selection:[shape.branches[0].id],protectTrunk:false};
}

// An extracted instance already uses its original connector frame. Rotating the
// sculpted root to +X loses connector roll (direction alone cannot encode that
// rotation), so retain this frame while capturing the final local graph.
export function captureCompleteDraftShape(asset,authoring) {
  if(!asset.masterBranches.length||asset.masterBranches.length>2200)throw Error('完整精修草稿没有可保存的枝干，或超过2200枝段');
  const root=asset.masterBranches[0],byId=new Map(asset.masterBranches.map(b=>[b.id,b]));
  return normalizeBranchShape({connector:copy(authoring.branch_shape?.connector),branches:asset.masterBranches.map(b=>({
    id:b.stableId,parent:b===root?'':byId.get(b.parentId)?.stableId,attach:b.parentT,
    points:b.points.map(p=>p.toArray()),knots:b.controlPoints.map(p=>p.toArray()),length:b.length,
    start_radius:b.startRadius,end_radius:b.endRadius,radius_profile:b.radiusProfile,sections:b.sections,
    ...captureSkeletonRadius(b,b===root),
  }))});
}

export function freezeCompleteDraftUnits(asset, authoring, shape, sources) {
  const root=asset.masterBranches[0],origin=root.points[0],savedRoot=shape.branches.find(b=>b.id===root.stableId),destination=new THREE.Vector3(...savedRoot.points[0]);
  const rotation=new THREE.Quaternion().setFromUnitVectors(root.points[1].clone().sub(origin).normalize(),new THREE.Vector3(...savedRoot.points[1]).sub(destination).normalize());
  if(asset.masterBranches.length>2200||shape.branches.length!==asset.masterBranches.length)throw Error('完整精修草稿的枝段没有全部捕获，精修结果未冻结，请先拆分成品');
  const branches=new Map(shape.branches.map((b,id)=>[b.id,{id,stableId:b.id,points:b.points.map(p=>new THREE.Vector3(...p))}]));
  const fallback=new Map();
  asset.group.traverse(mesh=>{
    if(mesh.userData.category!=='leaf'||mesh.userData.source_index==null||!mesh.geometry?.attributes.uv1)return;
    const source=mesh.userData.source_index,uv=mesh.geometry.attributes.uv1,lookup=asset.lookupTexture;
    for(let n=0;n<uv.count;n++){const e=asset.elements[Math.floor(uv.getX(n)*lookup.width)+Math.floor(uv.getY(n)*lookup.height)*lookup.width];if(e)fallback.set(e.id,source);}
  });
  const items=[];
  for(const [kind,placements]of [['LEAF',asset.masterPlacements||[]],['ORGAN',asset.treeOrgans||[]]])for(const p of placements){
    const branch=branches.get(p.branchStableId);if(!branch)continue;
    const source=kind==='LEAF'&&p.source<0?fallback.get(p.stableId):p.source,registry=kind==='LEAF'?sources:authoring.tree_organs.units;
    if(!registry[source])throw Error(`无法恢复${kind==='LEAF'?'叶片':'花果'}素材 ${p.stableId}，精修结果未冻结`);
    items.push(captureUnit({...p,source,unitT:undefined,position:p.position.clone().sub(origin).applyQuaternion(rotation).add(destination),direction:p.direction.clone().applyQuaternion(rotation),normal:p.normal?.clone().applyQuaternion(rotation)},branch,registry,kind,true));
  }
  if(items.length>20000)throw Error('完整成品超过20000叶花果单元，精修结果未冻结，请先拆分成品');
  authoring.unit_editing={items,removed:[],rules:['LEAF','ORGAN'].map(kind=>({id:'LOCAL_SNAPSHOT_'+kind,kind,amount:0,targets:[...branches.keys()]}))};
  authoring.tree_organs.max_count=items.filter(v=>v.kind==='ORGAN').length;
  authoring.branch_shape=copy(shape);authoring.overrides={};authoring.sculpt_layers=[];authoring.manual_branches=[];
  authoring.branch_arrays=[];authoring.influence_regions=[];authoring.symmetry_groups=[];authoring.modifiers=[];authoring.topology={};
  authoring.leaf_edits={removed:[],added:[]};authoring.foliage_masks=[];
  return authoring;
}
