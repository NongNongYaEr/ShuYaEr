import {markNativeModelChanged} from './native-model-changes.js';
import * as THREE from './vendor/three.module.min.js';
import { branchMountAt } from './branch-mount-frame.js';
import { completeInstanceMatrix } from './branch-instance-matrix.js';
import { resolveInstanceAsset, resolveInstanceShape, equalData } from './branch-workbench-data.js';
import { prepareRadialGeometry, applyRadialGeometry, radialMaterial } from './sample-radial.js';
import { skeletonThicknessState } from './skeleton-thickness.js';
import { normalizeTrunkForms } from './trunk-form.js';
import { sampleLeafMaterial, sampleLeafMaterialName } from './leaf-material-data.js';
import { resolveSampleMaterial } from './sample-materials.js';
import { canUpdateSupports, equalGeometry } from './support-update.js';
import {finishBuildSteps} from './cooperative-build.js';
import {historySampleShape,compiledBranchTransform,compiledSampleAuthoring} from './compiled-branch-curves.js';
import {historicalSampleGraphPlan,historicalSampleShape,finishHistoricalSampleGraph} from './historical-sample-graph-cache.js';
import {mountedGraphRecord,extendMountedGraph} from './mounted-graph-cache.js';
import {compiledSamples,registerCompiledSamples,forgetCompiledSamples,geometryState,geometryUnchanged,materialState,prototypeUnchanged,retainCompiledPrototype,releaseCompiledPrototype,ownCompiledGeometry,compiledGeometryLive,retireCompiledGeometry,compiledInputState,compiledInputUnchanged} from './compiled-sample-cache.js';
const sampleAsset = (i,a) => resolveInstanceAsset(i.linked?i:{...i,linked:true},a.branch_library);
const editedSampleIds=a=>{const ids=new Set(Object.keys(a.overrides).map(id=>id.split('.')[0]));for(const layer of a.sculpt_layers)for(const id of [...Object.keys(layer.branches),...(layer.operation?.targets||[])])ids.add(id.split('.')[0]);for(const id of a.topology.suppressed)ids.add(id.split('.')[0]);return ids;};
const sampleBaseAuthoring=(a,managed)=>{const organAssets=a.branch_instances.length>0&&a.branch_library.some(v=>v.organ_mode&&v.organ_source_ids.length);return {...a,branch_instances:a.branch_instances.filter(i=>!managed.includes(i)),branch_library:a.branch_library,...(organAssets?{tree_organs:{...a.tree_organs,amount:0}}:{})};};

// Evaluate the very same compiled branch curves without decoding source meshes,
// building materials, generating foliage, sweeping vertices or scanning faces.
export function createSampleCurveReference(settings,authoring,{buildCurves,graph,frame}){
  const managed=authoring.branch_instances.filter(i=>sampleAsset(i,authoring)?.sample),base=buildCurves(settings,sampleBaseAuthoring(authoring,managed));
  const edited=editedSampleIds(authoring),families=new Map(),overrides=new Map();
  if(authoring.branch_instances.some(i=>edited.has(i.id)))for(const b of graph(settings,authoring)){let list=families.get(b.instanceId);if(!list)families.set(b.instanceId,list=[]);list.push(b);}
  for(const [id,value]of Object.entries(authoring.overrides)){const dot=id.indexOf('.');if(dot<0)continue;const owner=id.slice(0,dot);let list=overrides.get(owner);if(!list)overrides.set(owner,list=[]);list.push([id.slice(dot+1),{leaf_density:value.leaf_density}]);}
  function append(entry,target){const {i,curves,matrix,custom}=entry,parent=target.byStable.get(i.parent),branchIds=new Map(curves.map((b,n)=>[b.id,target.branches.length+n]));
    const world=curves.map(compiledBranchTransform({i,matrix,custom,parent,branchIds}));target.branches.push(...world);world.forEach(b=>target.byStable.set(b.stableId,b));if(parent&&world.length)parent.children.push(world[0].id);
  }
  return (owners=null)=>{
  const needed=owners?new Set(owners):null;
  if(needed){let more=true;while(more){more=false;for(const i of managed)if(needed.has(i.id)){const parent=managed.filter(p=>i.parent.startsWith(p.id+'.')).sort((a,b)=>b.id.length-a.id.length)[0];if(parent&&!needed.has(parent.id)){needed.add(parent.id);more=true;}}}}
  const supports=base.map(b=>({...b,children:b.children.slice()})),byStable=new Map(supports.map(b=>[b.stableId,b])),entries=[];
  for(const i of managed){if(needed&&!needed.has(i.id))continue;if(i.parent&&!byStable.has(i.parent))continue;const item=sampleAsset(i,authoring),shape=resolveInstanceShape(i,authoring.branch_library),matrix=completeInstanceMatrix(i,shape,byStable.get(i.parent),settings,frame),custom=edited.has(i.id);
    const localShape=custom?historySampleShape(i,shape,matrix,families.get(i.id)||[]):shape;if(!localShape)continue;
    const local=compiledSampleAuthoring(item.sample,item,authoring,localShape,custom,overrides.get(i.id)),curves=buildCurves({...item.sample.settings,object_name:item.name},local),entry={i,shape,matrix,custom,curves};entries.push(entry);append(entry,{branches:supports.slice(),byStable});
  }
  const supportIds=new Set(supports.map(b=>b.id)),target={branches:supports.map(b=>({...b,children:b.children.filter(id=>supportIds.has(id))}))};target.byStable=new Map(target.branches.map(b=>[b.stableId,b]));
  for(const entry of entries){entry.matrix=completeInstanceMatrix(entry.i,entry.shape,target.byStable.get(entry.i.parent),settings,frame);append(entry,target);}
  return target.branches;
  };
}
export function compileSampleReferenceCurves(settings,authoring,helpers){return createSampleCurveReference(settings,authoring,helpers)();}

// The editable document remains unchanged. Only the viewport uses GPU instances;
// export materializes the same compiled samples with the existing hierarchy UVs.
export function canCompileSamples(a) {
  return !a.vine && !a.vegetation.enabled && a.branch_instances.length > 0
    && a.workbench?.sample_layout !== 'INSTANCE_SEEDED'
    && a.recipe.tags.includes('SAMPLE_FOLIAGE_FROM_LIBRARY')
    && a.branch_instances.some(i => sampleAsset(i,a)?.sample)
    // Cross-sample topology and blended joints still need the established graph path.
    && !a.symmetry_groups.some(g=>g.enabled) && !Object.keys(a.topology.reparent).length
    && !a.branch_instances.some(i=>i.junction?.enabled)
    && !a.manual_branches.some(b=>a.branch_instances.some(i=>b.parent.startsWith(i.id+'.')))
    && !a.branch_instances.some(i=>!sampleAsset(i,a)?.sample && a.branch_instances.some(parent=>sampleAsset(parent,a)?.sample&&i.parent.startsWith(parent.id+'.')));
}

export function compileSampleAssembly(settings, authoring, sources, lod, materials, helpers, instanced) {
  return finishBuildSteps(compileSampleAssemblySteps(settings,authoring,sources,lod,materials,helpers,instanced));
}

export function* compileSampleAssemblySteps(settings, authoring, sources, lod, materials, helpers, instanced) {
  let previous=compiledSamples(helpers.reuseSamplesFrom);
  // The old owner is a construction input, never part of the live model's
  // update/export/disposal closures. Do not mutate a caller-owned helper object.
  helpers={...helpers,reuseSamplesFrom:null};
  const { build, frame, lookup, analyze, dispose, deserialize, graph, overlap, allows } = helpers;
  const managed=authoring.branch_instances.filter(i=>sampleAsset(i,authoring)?.sample);
  // The original graph restricts automatic flowers to installed organ assets.
  // Removing managed instances for the reusable base must not switch it back
  // to automatic flowers on ROOT. Keep all sources and explicit global units.
  const baseAuthoring=sampleBaseAuthoring(authoring,managed);
  const base=helpers.buildSteps?yield* helpers.buildSteps(settings,materials,sources,lod,baseAuthoring):build(settings,materials,sources,lod,baseAuthoring);
  const prototypes = new Map(), palettes = new Map(), sourceGeometries = new WeakMap(), entries = [], batches = [], expanded = [], ownedSources = [], renderMaterials = new Map(), shadowMaterials = [];
  const geometryQualityCache=new WeakMap();
  const cacheStats={built:0,reused:0};
  registerCompiledSamples(base,prototypes,cacheStats);
  const proxies=new Map(),previewBatches=new Map();let completed=false,disposed=false;
  // Prototypes own their source palettes; the assembled meshes only borrow
  // those materials, so the outer asset must not dispose them a second time.
  base.compiledSampleMaterials = new Set();
  base.compiledSampleGeometries = new Set();base.reusedCompiledMaterials=new Set();
  base.disposeCompiledSampleSteps=function*(){
    if(disposed)return;disposed=true;forgetCompiledSamples(base);previewBatches.clear();
    const retiring=new Set([...prototypes.values()].filter(p=>p.refs===1));
    for(const geometry of base.compiledSampleGeometries){retireCompiledGeometry(geometry,retiring);yield {stage:'dispose-source-geometries'};}
    // Release geometry binding tables before per-object binding cleanup. Doing
    // every object first repeatedly scans the full set of old geometry tables.
    for(const {batch}of batches){if(!base.compiledSampleGeometries.has(batch.geometry))batch.geometry.dispose();yield {stage:'dispose-geometries'};}
    for(const {batch}of batches){batch.dispose();yield {stage:'dispose-batches'};}
    for(const p of prototypes.values()){releaseCompiledPrototype(p,dispose);yield {stage:'dispose-prototypes'};}
    for(const geometry of ownedSources){if(!compiledGeometryLive(geometry))geometry?.dispose();yield {stage:'dispose-sources'};}
    for(const material of [...renderMaterials.values(),...shadowMaterials]){material.dispose();yield {stage:'dispose-materials'};}
    proxies.clear();
  };
  base.disposeCompiledSamples=()=>finishBuildSteps(base.disposeCompiledSampleSteps());
  try{
  yield {stage:'supports'};
  let baseBranches = base.masterBranches.slice(), baseVisible = base.branches.slice(), baseElements = base.elements.slice();
  const baseLeaves = base.placements.slice(), baseMasterLeaves = base.masterPlacements.slice(), baseOrgans = base.treeOrgans.slice();
  const baseMeshes = []; base.group.traverse(o => { if (o.isMesh) baseMeshes.push(o); });
  let baseLookup = base.lookupTexture;
  const nested = managed.some(i => managed.some(parent => i.parent.startsWith(parent.id+'.')));
  const prototypeMeshes = p => { const meshes=[];p.group.updateMatrixWorld(true);p.group.traverse(o=>{if(o.isMesh)meshes.push(o);});return meshes; };
  const sourceMap = new Map((Array.isArray(sources) ? sources : []).map(s => [s.id, s]));
  const sourceContexts=new Map(),sourceIds=[...sourceMap.keys()],organIds=authoring.tree_organs.units.map(u=>u.id);
  const sourceToken=(source,serialized=null)=>{const {geometry,...metadata}=source,value={metadata,serialized};return {value,input:compiledInputState(value),geometry:serialized?null:geometry,state:serialized?null:geometryState(geometry)};};
  const sameSources=(a,b)=>a.length===b.length&&a.every((s,n)=>compiledInputUnchanged(b[n].value,s.input)&&(s.geometry?geometryUnchanged(b[n].geometry,s.state):!b[n].geometry));
  function sameContext(a,b){if(b.matches.has(a))return b.matches.get(a);const equal=compiledInputUnchanged(b.value,a.state)&&sameSources(a.sources,b.sources);b.matches.set(a,equal);return equal;}
  function attachPrototype(p,reused){
    for(const material of p.materials){base.compiledSampleMaterials.add(material);if(reused)base.reusedCompiledMaterials.add(material);}
    for(const s of p.geometryStates){base.compiledSampleGeometries.add(s.geometry);const quality=p.built.geometryQualityCache?.get(s.geometry);if(quality)geometryQualityCache.set(s.geometry,quality);}
    prototypes.set(p.key,p);return p;
  }
  const organMap = new Map(authoring.tree_organs.units.map((u,i) => [u.id,i]));
  const editedIds = editedSampleIds(authoring);
  const leafEdited=new Set([...authoring.leaf_edits.removed.map(id=>id.split('.')[0]),...authoring.leaf_edits.added.map(v=>v.parent.split('.')[0])]);
  const hasEdits = authoring.branch_instances.some(i => editedIds.has(i.id));
  const historyPlan=hasEdits?historicalSampleGraphPlan(settings,authoring,managed,baseBranches,editedIds,previous?.history):null;
  compiledSamples(base).history=historyPlan?.record||null;
  const graphAuthoring=historyPlan?.scoped?historyPlan.authoring:authoring;
  const mounted=hasEdits&&!historyPlan?.scoped?extendMountedGraph(previous?.mountedGraph,settings,authoring):null;
  const editedGraph = mounted?.branches || (hasEdits&&graphAuthoring ? helpers.graphSteps?yield* helpers.graphSteps(settings,graphAuthoring):graph(settings,graphAuthoring) : null);
  compiledSamples(base).mountedGraph=hasEdits&&!historyPlan?.scoped?mountedGraphRecord(settings,authoring,editedGraph,mounted?.prefix):null;
  compiledSamples(base).mountedGraphReused=Boolean(mounted);
  if(historyPlan)historyPlan.authoring=null;
  yield {stage:'historical-graph'};
  // A historical sculpt can give hundreds of units their own local shape.
  // Partition its exact graph and overrides once, rather than scanning the
  // entire tree again for each unit prototype.
  const editedFamilies=new Map(),localOverrides=new Map();
  for(const branch of editedGraph||[]){let family=editedFamilies.get(branch.instanceId);if(!family)editedFamilies.set(branch.instanceId,family=[]);family.push(branch);}
  for(const [id,value]of Object.entries(authoring.overrides)){
    const separator=id.indexOf('.');if(separator<0)continue;
    const unit=id.slice(0,separator);let values=localOverrides.get(unit);if(!values)localOverrides.set(unit,values=[]);
    values.push([id.slice(separator+1),{leaf_density:value.leaf_density}]);
  }
  const matrixFor = (i,shape,byStable) => {
    return completeInstanceMatrix(i,shape,byStable.get(i.parent),settings,frame);
  };
  const byStable = new Map(baseBranches.map(b=>[b.stableId,b]));
  function prototype(i, matrix) {
    const item=sampleAsset(i,authoring),sample=item.sample;
    const custom=editedIds.has(i.id);
    const key=JSON.stringify([item.id,item.revision,custom||leafEdited.has(i.id)||authoring.foliage_masks.length||!i.linked?i.id:'']);
    if(prototypes.has(key))return prototypes.get(key);
    let shape=resolveInstanceShape(i,authoring.branch_library);
    if(custom) {
      shape=historicalSampleShape(historyPlan,i.id,()=>historySampleShape(i,shape,matrix,editedFamilies.get(i.id)||[]));if(!shape)return null;
    }
    let sourceContext=sourceContexts.get(item);
    if(!sourceContext){const tokens=[];const localSources=sample.leaf_meshes.map(s=>{
      const texture=resolveSampleMaterial(s,authoring,sample) || sampleLeafMaterial(sample,authoring.branch_library,authoring.leaf_material);
      const materialName=sampleLeafMaterialName(s.id,texture,authoring.leaf_material);
      const shared=sourceMap.get(s.id);
      let result;if(shared)result={...s,geometry:shared.geometry,sampleLeafMaterial:texture,sampleLeafMaterialName:materialName};
      else{let geometry=sourceGeometries.get(s.geometry);if(!geometry){geometry=deserialize(s.geometry);sourceGeometries.set(s.geometry,geometry);ownedSources.push(geometry);}result={...s,geometry,sampleLeafMaterial:texture,sampleLeafMaterialName:materialName};}
      tokens.push(sourceToken(result,shared?null:s.geometry));return result;
    });sourceContexts.set(item,sourceContext={localSources,sources:tokens,matches:new WeakMap(),value:null});}
    const localSources=sourceContext.localSources.slice();
    const addedLeaves=authoring.leaf_edits.added.filter(v=>v.parent.startsWith(i.id+'.'));
    const globalLeafIds=new Set(addedLeaves.map(v=>v.id));
    for(const leaf of addedLeaves){const source=[...sourceMap.values()][leaf.source];if(source&&!localSources.some(s=>s.id===source.id))localSources.push(source);}
    const sampleAuthoring={...compiledSampleAuthoring(sample,item,authoring,shape,custom,localOverrides.get(i.id)),
      __sampleOrganMaterial:sampleLeafMaterial(sample,authoring.branch_library,authoring.leaf_material),
      __sampleBaseMaterial:authoring.leaf_material};
    if(leafEdited.has(i.id)){
      const localIndex=new Map(localSources.map((s,n)=>[s.id,n]));const globalSources=[...sourceMap.keys()];
      sampleAuthoring.leaf_edits={removed:[...(sample.authoring.leaf_edits?.removed||[]),...authoring.leaf_edits.removed.filter(id=>id.startsWith(i.id+'.')||globalLeafIds.has(id)).map(id=>globalLeafIds.has(id)?id:id.slice(i.id.length+1))],
        added:[...(sample.authoring.leaf_edits?.added||[]),...addedLeaves.map(v=>({...v,parent:v.parent.slice(i.id.length+1),source:localIndex.get(globalSources[v.source])??-1}))]};
    }
    if(authoring.foliage_masks.length)sampleAuthoring.__sampleWorldFilter=(point,id)=>allows(point.clone().applyMatrix4(matrix),globalLeafIds.has(id)?id:i.id+'.'+id,authoring);
    const {branch_shape,overrides,sculpt_layers,topology,leaf_edits,...constantAuthoring}=sampleAuthoring;
    if(sourceContext.value===null){sourceContext.value=[item.id,item.revision,{...sample.settings,object_name:item.name},lod,constantAuthoring,sourceIds,organIds];sourceContext.state=compiledInputState(sourceContext.value);}
    const localKey=JSON.stringify([branch_shape,overrides,sculpt_layers,topology,leaf_edits]),extras=localSources.slice(sourceContext.localSources.length).map(s=>sourceToken(s));
    const old=previous?.records.get(key);
    if(!authoring.foliage_masks.length&&old&&old.localKey===localKey&&sameContext(old.context,sourceContext)&&sameSources(old.extras,extras)&&prototypeUnchanged(old)){
      cacheStats.reused++;return attachPrototype(retainCompiledPrototype(old),true);
    }
    // Historical sculpt layers can require hundreds of distinct geometries.
    // Their source palette is identical: retain its textures/materials once
    // per source version instead of regenerating bark pixels for every unit.
    const paletteKey=item.id+':'+item.revision;
    let palette=palettes.get(paletteKey);
    const built=build({...sample.settings,object_name:item.name},palette?.materials||null,localSources,lod,sampleAuthoring,{source:true});
    if(!palette){palette={materials:built.materials,refs:0,materialStates:Object.values(built.materials).map(materialState)};palettes.set(paletteKey,palette);}
    // Palette ownership is independent of the first prototype's geometry.
    built.ownsMaterials=false;palette.refs++;
    try{
    const meshes=prototypeMeshes(built);
    if(!custom)for(const mesh of meshes){const branch=built.branches.find(b=>b.stableId===mesh.userData.stable_id);if(branch&&mesh.userData.category==='branch')prepareRadialGeometry(mesh.geometry,branch.points);}
    const materials=[...new Set([...Object.values(built.materials),...meshes.flatMap(m=>[m.material].flat())])];
    const result={key,built,meshes,item,custom,globalLeafIds,sourceMap:localSources.map(s=>sourceMap.has(s.id)?[...sourceMap.keys()].indexOf(s.id):-1),organMap:built.authoring.tree_organs.units.map(u=>organMap.get(u.id)),refs:1,palette,materials,materialStates:materials.map(materialState),geometryStates:[...new Set(meshes.map(m=>m.geometry))].map(geometryState),meshStates:meshes.map(mesh=>({mesh,geometry:mesh.geometry,material:mesh.material,pose:[...mesh.position.toArray(),...mesh.quaternion.toArray(),...mesh.scale.toArray(),mesh.matrixAutoUpdate,...mesh.matrix.elements,...mesh.matrixWorld.elements]})),localKey,context:sourceContext,extras,needsMaterialSeal:true};
    ownCompiledGeometry(result);cacheStats.built++;return attachPrototype(result,false);
    }catch(error){dispose(built);if(--palette.refs===0)dispose({materials:palette.materials,ownsMaterials:true});throw error;}
  }
  function appendMetadata(entry, target) {
    const {i,p,matrix}=entry, b=p.built,scale=new THREE.Vector3().setFromMatrixScale(matrix).x;
    const rotation=new THREE.Matrix3().getNormalMatrix(matrix),branchIds=new Map(),elementIds=new Map();
    for(const local of b.masterBranches)branchIds.set(local.id,target.masterBranches.length+branchIds.size);
    for(let n=0;n<b.elements.length;n++)elementIds.set(n,target.elements.length+n);
    const parent=target.byStable.get(i.parent);
    const cacheKey=[...matrix.elements,target.masterBranches.length,target.elements.length,parent?.id,parent?.order,parent?.elementIndex,i.attach,...(branchMountAt(parent,i.attach)?.elements||[])];
    if(!nested && equalData(entry.cacheKey,cacheKey)) {
      for(const key of ['masterBranches','branches','elements','placements','masterPlacements','treeOrgans'])target[key].push(...entry.cached[key]);
      entry.cached.masterBranches.forEach(v=>target.byStable.set(v.stableId,v));
      if(parent&&entry.cached.masterBranches.length)parent.children.push(entry.cached.masterBranches[0].id);
      return;
    }
    const offsets=Object.fromEntries(['masterBranches','branches','elements','placements','masterPlacements','treeOrgans'].map(key=>[key,target[key].length]));
    const worldId=id=>p.globalLeafIds.has(id)?id:i.id+'.'+id;
    const transformBranch=compiledBranchTransform({i,matrix,custom:p.custom,parent,branchIds,elementIds});
    const world=b.masterBranches.map(transformBranch);target.masterBranches.push(...world);world.forEach(v=>target.byStable.set(v.stableId,v));
    if(parent&&world.length)parent.children.push(world[0].id);
    target.branches.push(...b.branches.map(transformBranch));
    target.elements.push(...b.elements.map((e,n)=>({...e,index:elementIds.get(n),id:worldId(e.id),
      parentIndex:elementIds.get(e.parentIndex)??parent?.elementIndex??-1,
      pivot:new THREE.Vector3(...e.pivot).applyMatrix4(matrix).toArray(),axis:new THREE.Vector3(...e.axis).applyMatrix3(rotation).normalize().toArray(),extent:e.extent*scale,
      order:Math.min(4,(parent?.order??-1)+1+e.order)})));
    const transformPlacement=(v,organ=false)=>({...v,stableId:worldId(v.stableId),branchId:branchIds.get(v.branchId),branchStableId:i.id+'.'+v.branchStableId,
      position:v.position.clone().applyMatrix4(matrix),direction:v.direction.clone().applyMatrix3(rotation).normalize(),
      normal:v.normal?.clone().applyMatrix3(rotation).normalize()||null,scale:v.scale*scale,
      source:organ?p.organMap[v.source]:p.sourceMap[v.source],...(organ?{sourceInstanceId:i.id,sourceAssetId:p.item.id}:{} )});
    target.placements.push(...b.placements.map(v=>transformPlacement(v)));
    target.masterPlacements.push(...b.masterPlacements.map(v=>transformPlacement(v)));
    target.treeOrgans.push(...b.treeOrgans.map(v=>transformPlacement(v,true)));
    entry.branchIds=branchIds;entry.elementIds=elementIds;
    entry.cacheKey=cacheKey;entry.cached=Object.fromEntries(Object.entries(offsets).map(([key,start])=>[key,target[key].slice(start)]));
  }
  function metadata(next) {return finishBuildSteps(metadataSteps(next));}
  function* metadataSteps(next) {
    const supportIds=new Set(baseBranches.map(b=>b.id));
    const target={masterBranches:baseBranches.map(b=>({...b,children:b.children.filter(id=>supportIds.has(id))})),branches:baseVisible.slice(),elements:baseElements.slice(),placements:baseLeaves.slice(),masterPlacements:baseMasterLeaves.slice(),treeOrgans:baseOrgans.slice()};
    target.byStable=new Map(target.masterBranches.map(b=>[b.stableId,b]));
    const instances=new Map(next.branch_instances.map(i=>[i.id,i]));
    const changed=new Set();
    for(const entry of entries){entry.i=instances.get(entry.i.id);const matrix=matrixFor(entry.i,entry.shape,target.byStable);if(!matrix.equals(entry.matrix))changed.add(entry);entry.matrix=matrix;appendMetadata(entry,target);yield {stage:'metadata'};}
    delete target.byStable;Object.assign(base,target);
    return changed;
  }
    for(const i of managed){
      if(i.parent&&!byStable.has(i.parent))continue;
      const shape=resolveInstanceShape(i,authoring.branch_library),matrix=matrixFor(i,shape,byStable),p=prototype(i,matrix);if(!p)continue;
      const entry={i,p,matrix,shape};entries.push(entry);
      // Resolve nested installation parents without generating duplicate meshes.
      const temp={masterBranches:baseBranches.slice(),branches:[],elements:[],placements:[],masterPlacements:[],treeOrgans:[],byStable};appendMetadata(entry,temp);
      yield {stage:'unit-prototypes'};
    }
    previous=null;
    finishHistoricalSampleGraph(historyPlan);
    base.authoring=authoring;base.settings=settings;yield* metadataSteps(authoring);base.lookupTexture=lookup([],base.elements.length);
    const assemblies=new THREE.Group();assemblies.name='06_完整次枝实例';base.group.add(assemblies);
    function mappedData(mesh,entry) {
      const data={...mesh.userData};
      if(data.stable_id)data.stable_id=entry.i.id+'.'+data.stable_id;
      if(typeof data.branch_id==='number')data.branch_id=entry.branchIds.get(data.branch_id);
      if(typeof data.parent_id==='number')data.parent_id=entry.branchIds.get(data.parent_id)??byStable.get(entry.i.parent)?.id??-1;
      return data;
    }
    function proxy(mesh,entry) {
      const key=entry.i.id+':'+mesh.uuid;let object=proxies.get(key);
      if(!object){object=new THREE.Mesh(mesh.geometry,mesh.material);object.parent=base.group;proxies.set(key,object);}
      object.userData=mappedData(mesh,entry);object.matrix.copy(entry.matrix).multiply(mesh.matrixWorld);object.matrixAutoUpdate=false;
      object.matrixWorld.copy(base.group.matrixWorld).multiply(object.matrix);return object;
    }
    function* addBatches() {
      for(const p of prototypes.values()){
        const members=entries.filter(e=>e.p===p);
        for(const mesh of p.meshes){
          const radial=mesh.geometry.hasAttribute('sampleCenter');
          if(radial&&!renderMaterials.has(mesh.material)){
            const material=radialMaterial(mesh.material);renderMaterials.set(mesh.material,material);base.compiledSampleMaterials.add(material);
          }
          const geometry=radial?mesh.geometry.clone():mesh.geometry;
          if(radial){
            geometry.setAttribute('sampleRadius',new THREE.InstancedBufferAttribute(new Float32Array(members.map(e=>e.i.radius_scale)),1));
            const bounds=applyRadialGeometry(mesh.geometry.clone(),Math.max(1,...members.map(e=>e.i.radius_scale)));
            geometry.boundingBox=bounds.boundingBox.clone();geometry.boundingSphere=bounds.boundingSphere.clone();bounds.dispose();
          }
          const batch=new THREE.InstancedMesh(geometry,radial?renderMaterials.get(mesh.material):mesh.material,members.length);batch.name='复用_'+mesh.name;batch.userData={...mesh.userData};
          delete batch.userData.stable_id;delete batch.userData.branch_id;
          batch.castShadow=mesh.castShadow;batch.receiveShadow=mesh.receiveShadow;
          if(radial){batch.customDepthMaterial=radialMaterial(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}),false);batch.customDistanceMaterial=radialMaterial(new THREE.MeshDistanceMaterial(),false);shadowMaterials.push(batch.customDepthMaterial,batch.customDistanceMaterial);}
          const cast=batch.raycast.bind(batch);
          batch.raycast=(ray,hits)=>{
            if(radial){
              for(const entry of members){
                const object=proxy(mesh,entry),sphere=geometry.boundingSphere.clone().applyMatrix4(object.matrixWorld);
                if(!ray.ray.intersectsSphere(sphere))continue;
                const pickGeometry=applyRadialGeometry(mesh.geometry.clone(),entry.i.radius_scale),pick=new THREE.Mesh(pickGeometry,mesh.material);pick.matrixWorld.copy(object.matrixWorld);
                const local=[];pick.raycast(ray,local);for(const hit of local){hit.object=object;hits.push(hit);}pickGeometry.dispose();
              }
            }else{const local=[];cast(ray,local);for(const hit of local){hit.object=proxy(mesh,members[hit.instanceId]);hits.push(hit);}}
          };
          const record={batch,members,mesh};assemblies.add(batch);batches.push(record);previewBatches.set(batch,record);
          yield {stage:'instance-batches'};
        }
      }
      yield* matrixSteps();
    }
    function updateMatrices(changed=null){return finishBuildSteps(matrixSteps(changed));}
    function* matrixSteps(changed=null){
      markNativeModelChanged(base);
      const matrix=new THREE.Matrix4();
      for(const {batch,members,mesh} of batches){let dirty=false;members.forEach((entry,n)=>{if(changed&&!changed.has(entry))return;batch.setMatrixAt(n,matrix.copy(entry.matrix).multiply(mesh.matrixWorld));batch.instanceMatrix.addUpdateRange(n*16,16);dirty=true;});if(dirty){batch.instanceMatrix.needsUpdate=true;batch.computeBoundingBox();batch.computeBoundingSphere();}yield {stage:'instance-matrices'};}
      for(const entry of entries)if(!changed||changed.has(entry))for(const mesh of entry.p.meshes)if(proxies.has(entry.i.id+':'+mesh.uuid))proxy(mesh,entry);
    }
    function vertexElements(mesh,entry=null,texture=baseLookup){
      const uv=mesh.geometry.getAttribute('uv1');
      return Array.from({length:mesh.geometry.getAttribute('position').count},(_,n)=>{const local=uv?Math.floor(uv.getY(n)*texture.height)*texture.width+Math.floor(uv.getX(n)*texture.width):0;return entry?entry.elementIds.get(local)??0:local;});
    }
    // Read-only bindings for interactive GPU deformation. Keep prototype geometry
    // and atlases shared; only export and the CPU fallback need materialization.
    base.editPreviewBindings=mesh=>{
      const record=previewBatches.get(mesh);
      if(!record)return {lookup:base.isInstancedAssembly?baseLookup:base.lookupTexture};
      return {instances:record.members.map(entry=>({
        id:entry.i.id,
        elements:entry.p.built.elements,branches:entry.p.built.masterBranches,lookup:entry.p.built.lookupTexture,
        branchIds:entry.branchIds,stableId:record.mesh.userData.stable_id?entry.i.id+'.'+record.mesh.userData.stable_id:null,
        radius:entry.i.radius_scale,object:()=>proxy(record.mesh,entry),
      }))};
    };
    base.materialize=()=>{
      if(!base.isInstancedAssembly&&expanded.length)return;
      assemblies.clear();previewBatches.clear();for(const {batch,mesh} of batches){batch.dispose();if(batch.geometry!==mesh.geometry&&!base.compiledSampleGeometries.has(batch.geometry))batch.geometry.dispose();}batches.length=0;
      const records=baseMeshes.map(mesh=>({geometry:mesh.geometry,elementIndices:vertexElements(mesh)}));
      for(const entry of entries)for(const mesh of entry.p.meshes){
        const geometry=applyRadialGeometry(mesh.geometry.clone(),entry.i.radius_scale).applyMatrix4(entry.matrix.clone().multiply(mesh.matrixWorld));
        // Preview-only attributes must not enter GLB/FBX merge or export schemas.
        geometry.deleteAttribute('sampleCenter');geometry.deleteAttribute('sampleTangent');
        const object=new THREE.Mesh(geometry,mesh.material);object.userData=mappedData(mesh,entry);object.castShadow=mesh.castShadow;object.receiveShadow=mesh.receiveShadow;
        const b=base.branches.find(b=>b.stableId===object.userData.stable_id);object.name=b?`枝段_B${String(b.id+1).padStart(3,'0')}_L${b.order}`:entry.i.id+'_'+mesh.name;
        assemblies.add(object);expanded.push(object);records.push({geometry,elementIndices:vertexElements(mesh,entry,entry.p.built.lookupTexture)});
      }
      base.lookupTexture=lookup(records,base.elements.length);base.group.userData.lookup_texture=base.lookupTexture;base.isInstancedAssembly=false;
    };
    base.isInstancedAssembly=instanced;
    if(instanced)yield* addBatches();else base.materialize();
    base.branchMesh=id=>{for(const entry of entries)for(const mesh of entry.p.meshes)if(mesh.userData.category==='branch'&&entry.i.id+'.'+mesh.userData.stable_id===id)return proxy(mesh,entry);return null;};
    base.geometryQualityCache=geometryQualityCache;
    base.syncTrunkSurfaceMetadata=(forms,surfaces)=>{
      for(const b of [...baseBranches,...baseVisible])if(surfaces.has(b.stableId)){
        if(forms[b.stableId])b.trunkForm=forms[b.stableId];else delete b.trunkForm;
        b.barkSurface=surfaces.get(b.stableId);
      }
    };
    function updateReport(){return finishBuildSteps(updateReportSteps());}
    function* updateReportSteps(){
      base.report=helpers.analyzeSteps?yield* helpers.analyzeSteps(base.group,settings,geometryQualityCache):analyze(base.group,settings,geometryQualityCache);Object.assign(base.report,{flower_count:0,flower_budget_limited:false,tree_organ_count:base.treeOrgans.length,tree_organ_budget_limited:false,vegetation_count:0,vegetation_budget_limited:false,
        compiled_samples:prototypes.size,installed_samples:entries.length,instanced_preview:base.isInstancedAssembly});
      updateQuality();
      Object.assign(base.group.userData,{branch_count:base.branches.length,leaf_count:base.placements.length,hierarchy_elements:base.elements.length,lookup_texture:base.lookupTexture,pending_rebuild:false});
    }
    function updateQuality(){
      const ratio=overlap(base.placements,settings.leaf_min_spacing),limit=base.authoring.quality.max_attachment_overlap;
      base.report.attachment_overlap_ratio=ratio;base.report.attachment_overlap_limit=limit;
      base.report.warnings=base.report.warnings.filter(w=>!w.startsWith('附着物重叠率 '));
      base.report.ok=base.report.invalid_vertices===0&&base.report.degenerate_faces===0&&base.report.missing_normals===0&&base.report.missing_tangents===0&&ratio<=limit;
      if(ratio>limit)base.report.warnings.push(`附着物重叠率 ${(ratio*100).toFixed(1)}%，超过 ${(limit*100).toFixed(1)}%`);
    }
    yield* updateReportSteps();
    yield {stage:'quality-report'};
    base.updateAssemblyTransforms=(nextSettings,next,{beforeCommit=()=>{}}={})=>{
      if(!equalData(skeletonThicknessState(base.authoring.workbench),skeletonThicknessState(next.workbench)))return false;
      // A surface edit keeps instance placements but changes the carrier mesh.
      // The matrix-only shortcut must not hide it behind workbench metadata.
      if(!equalData(normalizeTrunkForms(base.authoring.workbench?.trunk_forms),normalizeTrunkForms(next.workbench?.trunk_forms)))return false;
      if(!equalData(base.authoring.workbench?.bark_materials,next.workbench?.bark_materials))return false;
      if(!base.isInstancedAssembly||hasEdits||authoring.foliage_masks.length||!equalData(settings,nextSettings))return false;
      const strip=a=>{const {workbench,branch_instances,...rest}=a;return rest;};
      if(!equalData(strip(base.authoring),strip(next))||next.branch_instances.length!==entries.length)return false;
      // Placement changes reuse the exact same source prototypes and palettes.
      // Keep source/version, radial thickness, local edits and generation seeds
      // in the comparison; only complete-model placement fields may differ.
      const stripPlacement=({parent,attach,angle,azimuth,roll,scale,frame,assembly_refined,assembly_manual,...rest})=>rest;
      const supportIds=new Set(baseBranches.map(branch=>branch.stableId));
      for(let n=0;n<entries.length;n++){
        const old=base.authoring.branch_instances[n],current=next.branch_instances[n];
        if(!equalData(stripPlacement(old),stripPlacement(current)))return false;
        // Existing nested models are already in dependency order. Cross-carrier
        // moves to a structural branch are safe; a new nested parent can change
        // that order or introduce a cycle and must use the full graph builder.
        if(old.parent!==current.parent&&!supportIds.has(current.parent))return false;
      }
      // Restore borrowed GPU preview geometry only after every reuse check has
      // passed, immediately before installing the new instance matrices.
      beforeCommit();
      const changed=metadata(next);base.authoring=next;base.settings=nextSettings;updateMatrices(changed);updateQuality();
      // Geometry, material, topology and counts did not change; no vertex scan.
      markNativeModelChanged(base);base.group.userData.pending_rebuild=false;return true;
    };
    base.updateSupportingBranches=(nextSettings,next,{beforeCommit=()=>{},branchGeometries}={})=>{
      if(!base.isInstancedAssembly||hasEdits||nested||!equalData(settings,nextSettings)
        ||baseLeaves.length||baseMasterLeaves.length||baseOrgans.length
        ||!canUpdateSupports(base.authoring,next,new Set(baseBranches.map(b=>b.stableId)),new Set(managed.map(i=>i.id))))return false;
      const started=performance.now();
      let stage=started;const timings={};const mark=key=>{const now=performance.now();timings[key]=now-stage;stage=now;};
      const candidate=build(nextSettings,base.materials,sources,lod,{...next,branch_instances:next.branch_instances.filter(i=>!managed.some(m=>m.id===i.id))},{branchGeometries});
      mark('build');
      const meshes=[];candidate.group.traverse(o=>{if(o.isMesh)meshes.push(o);});
      // Palette equality was checked in the document. The displayed mesh may
      // temporarily use a GPU preview wrapper until beforeCommit restores it.
      const compatible=candidate.masterBranches.length===baseBranches.length
        &&candidate.masterBranches.every((b,n)=>b.stableId===baseBranches[n].stableId&&b.id===baseBranches[n].id&&b.parentId===baseBranches[n].parentId)
        &&candidate.elements.length===baseElements.length&&candidate.elements.every((e,n)=>e.id===baseElements[n].id)
        &&!candidate.placements.length&&!candidate.masterPlacements.length&&!candidate.treeOrgans.length
        &&meshes.length===baseMeshes.length&&meshes.every((m,n)=>m.name===baseMeshes[n].name&&['branch','junction'].includes(m.userData.category));
      if(!compatible){dispose(candidate);return false;}
      mark('validate');
      // Validation precedes preview release. A rejected attempt leaves the held
      // GPU preview intact until the full replacement is ready.
      beforeCommit();
      const oldOwned = new Set(base.unitBarkMaterials || []), freshOwned = new Set(candidate.unitBarkMaterials || []);
      const paletteKey = material => material?.userData?.bark_material ? JSON.stringify([
        material.userData.bark_material, material.color.toArray(), material.roughness, material.normalScale.toArray(),
        ...['map','normalMap','roughnessMap'].map(slot => {
          const texture=material[slot];
          return texture ? [texture.repeat.toArray(),texture.offset.toArray(),texture.center.toArray(),texture.rotation] : null;
        }),
      ]) : null;
      const reusable = new Map([...oldOwned].map(material => [paletteKey(material),material]).filter(([key]) => key));
      const incoming = new Map([...freshOwned].map(material => [material,reusable.get(paletteKey(material)) || material]));
      const materialFor = material => incoming.get(material) || material;
      let replaced=0;
      for(let n=0;n<meshes.length;n++){
        const old=baseMeshes[n],fresh=meshes[n];
        if(equalGeometry(old.geometry,fresh.geometry))fresh.geometry.dispose();
        else {old.geometry.dispose();old.geometry=fresh.geometry;replaced++;}
        old.material=Array.isArray(fresh.material)?fresh.material.map(materialFor):materialFor(fresh.material);
        // View-mode restoration must follow the newly installed palette.
        if(old.userData.originalMaterial)fresh.userData.originalMaterial=old.material;
        old.userData=fresh.userData;old.position.copy(fresh.position);old.quaternion.copy(fresh.quaternion);old.scale.copy(fresh.scale);old.updateMatrix();
      }
      const used = new Set(baseMeshes.flatMap(mesh => [mesh.material].flat()));
      const owned = new Set([...oldOwned,...freshOwned]);
      base.unitBarkMaterials=[...owned].filter(material=>used.has(material));
      dispose({unitBarkMaterials:[...owned].filter(material=>!used.has(material))});
      candidate.unitBarkMaterials=[];
      mark('geometry');
      baseBranches=candidate.masterBranches.slice();baseVisible=candidate.branches.slice();baseElements=candidate.elements.slice();baseLookup=candidate.lookupTexture;
      byStable.clear();baseBranches.forEach(b=>byStable.set(b.stableId,b));
      const changed=metadata(next);base.authoring=next;base.settings=nextSettings;
      mark('metadata');updateMatrices(changed);mark('matrices');updateReport();mark('report');
      base.report.support_update={updated_samples:changed.size,reused_samples:entries.length-changed.size,replaced_support_meshes:replaced,reused_support_meshes:meshes.length-replaced,ms:performance.now()-started,timings};
      return true;
    };
    completed=true;
    return base;
  }finally{previous=null;if(!completed)dispose(base);}
}
